#include "../../src/runtime/system.c"
#include "../../src/runtime/http.c"
#include <errno.h>
#include <fcntl.h>
#include <limits.h>
#include <pthread.h>
#include <sched.h>
#include <stdio.h>
#include <stdlib.h>
#include <sys/socket.h>
#include <unistd.h>

typedef struct {
  int socket;
  const unsigned char *data;
  size_t length;
  size_t chunk_size;
} FuzzWrite;

static size_t append_bytes(unsigned char *out, size_t out_size, size_t offset, const void *data, size_t length) {
  if (offset + length > out_size) return out_size;
  memcpy(out + offset, data, length);
  return offset + length;
}

static size_t append_text(unsigned char *out, size_t out_size, size_t offset, const char *text) {
  return append_bytes(out, out_size, offset, text, strlen(text));
}

static size_t append_number(unsigned char *out, size_t out_size, size_t offset, size_t value) {
  char buffer[32];
  int written = snprintf(buffer, sizeof(buffer), "%zu", value);
  if (written < 0) return out_size;
  return append_bytes(out, out_size, offset, buffer, (size_t)written);
}

static size_t build_http_request(
  const unsigned char *data,
  size_t size,
  unsigned char *out,
  size_t out_size
) {
  if (!data || size == 0 || out_size < 8) return 0;

  size_t offset = 0;
  size_t variant = data[0] % 7;
  const char *method = variant == 1 ? "POST" : variant == 2 ? "HEAD" : "GET";
  const char *target = variant == 4
    ? "/../../secret.txt"
    : variant == 5
      ? "/%2e%2e/%2e%2e/secret.txt"
      : "/socket.io/emit";
  const char *version = variant == 6 ? "HTTP/1.0" : "HTTP/1.1";

  offset = append_text(out, out_size, offset, method);
  offset = append_text(out, out_size, offset, " ");
  offset = append_text(out, out_size, offset, target);
  offset = append_text(out, out_size, offset, " ");
  offset = append_text(out, out_size, offset, version);
  offset = append_text(out, out_size, offset, "\r\n");

  if (variant == 1) {
    offset = append_text(out, out_size, offset, "Content-Length: 0\r\n");
  } else if (variant == 2) {
    offset = append_text(out, out_size, offset, "Host: localhost\r\n");
    offset = append_text(out, out_size, offset, "Content-Length: 1\r\n");
    offset = append_text(out, out_size, offset, "Content-Length: 1\r\n");
  } else if (variant == 3) {
    offset = append_text(out, out_size, offset, "Host: localhost\r\n");
    offset = append_text(out, out_size, offset, " bad-header: nope\r\n");
  } else if (variant == 6) {
    offset = append_text(out, out_size, offset, "Host: localhost\r\n");
    for (size_t index = 0; index < 101 && offset < out_size; index += 1) {
      offset = append_text(out, out_size, offset, "X-Fuzz-");
      offset = append_number(out, out_size, offset, index);
      offset = append_text(out, out_size, offset, ": ");
      offset = append_text(out, out_size, offset, "a\r\n");
    }
  } else {
    offset = append_text(out, out_size, offset, "Host: localhost\r\n");
    size_t body_length = variant == 0 ? (size > 1 ? size - 1 : 0) : (size > 4 ? size / 4 : 0);
    if (body_length > 64) body_length = 64;
    offset = append_text(out, out_size, offset, "Content-Length: ");
    offset = append_number(out, out_size, offset, body_length);
    offset = append_text(out, out_size, offset, "\r\n");
    offset = append_text(out, out_size, offset, "\r\n");
    if (offset + body_length > out_size) return 0;
    size_t body_start = size > body_length ? size - body_length : 0;
    for (size_t index = 0; index < body_length; index += 1) {
      out[offset + index] = data[(body_start + index) % size];
    }
    offset += body_length;
    return offset;
  }

  offset = append_text(out, out_size, offset, "\r\n");
  return offset;
}

static void *write_fragmented(void *raw) {
  FuzzWrite *write = raw;
  size_t offset = 0;

  while (offset < write->length) {
    size_t chunk_size = write->chunk_size == 0 ? 1 : write->chunk_size;
    if (chunk_size > write->length - offset) chunk_size = write->length - offset;

    ssize_t count = send(write->socket, write->data + offset, chunk_size, 0);
    if (count > 0) {
      offset += (size_t)count;
      sched_yield();
      continue;
    }
    if (count < 0 && errno == EINTR) continue;
    break;
  }

  shutdown(write->socket, SHUT_WR);
  return NULL;
}

static void exercise_directory_traversal(const char *path) {
  int root = open(".", O_RDONLY | O_DIRECTORY);
  if (root < 0) return;

  char resolved[PATH_MAX];
  (void)open_static_file(root, path, resolved, sizeof(resolved));
  close(root);
}

int LLVMFuzzerTestOneInput(const unsigned char *data, size_t size) {
  unsigned char request_buffer[LUMEN_HTTP_MAX_HEADERS + 1];
  size_t request_length = build_http_request(data, size, request_buffer, sizeof(request_buffer));
  if (request_length == 0) return 0;

  int sockets[2];
  if (socketpair(AF_UNIX, SOCK_STREAM, 0, sockets) != 0) return 0;

  FuzzWrite write = {
    .socket = sockets[1],
    .data = request_buffer,
    .length = request_length,
    .chunk_size = size > 1 ? (size_t)(1 + (data[1] % 8)) : 1
  };

  pthread_t thread;
  if (pthread_create(&thread, NULL, write_fragmented, &write) != 0) {
    close(sockets[0]);
    close(sockets[1]);
    return 0;
  }

  LumenHttpRequest request;
  if (read_http_request(sockets[0], &request) == 0) {
    exercise_directory_traversal(request.path);
    free(request.body);
  }

  exercise_directory_traversal("/../../secret.txt");
  exercise_directory_traversal("/%2e%2e/%2e%2e/secret.txt");

  pthread_join(thread, NULL);
  close(sockets[0]);
  close(sockets[1]);
  return 0;
}

#ifdef LUMEN_STANDALONE_FUZZ
#include "standalone.h"
#endif
