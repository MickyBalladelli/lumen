#include "../../src/runtime/system.c"
#include "../../src/runtime/http.c"
#include <errno.h>
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

static size_t encode_websocket_frame(
  const unsigned char *data,
  size_t size,
  unsigned char *out,
  size_t out_size
) {
  if (!data || size == 0 || out_size < 16) return 0;

  size_t variant = data[0] % 6;
  unsigned char mask[4] = {
    size > 1 ? data[1] : 1,
    size > 2 ? data[2] : 2,
    size > 3 ? data[3] : 3,
    size > 4 ? data[4] : 4
  };
  size_t offset = 0;
  unsigned char opcode = 1;
  size_t payload_length = 0;
  int use_extended_16 = 0;
  int use_extended_64 = 0;
  int masked = 1;
  int reserved_bits = 0;

  switch (variant) {
    case 1:
      opcode = 9;
      payload_length = size > 8 ? size / 8 : 1;
      break;
    case 2:
      payload_length = LUMEN_WEBSOCKET_MAX_PAYLOAD + 1;
      use_extended_64 = 1;
      break;
    case 3:
      opcode = 8;
      payload_length = 130;
      use_extended_16 = 1;
      break;
    case 4:
      reserved_bits = 1;
      payload_length = size > 8 ? size / 8 : 1;
      break;
    case 5:
      masked = 0;
      payload_length = size > 8 ? size / 8 : 1;
      break;
    default:
      opcode = 1;
      payload_length = size > 8 ? size / 8 : 1;
      break;
  }

  if (variant != 2 && payload_length > 64) payload_length = 64;
  if (!use_extended_64 && payload_length > 125) {
    use_extended_16 = 1;
  }

  out[offset++] = (unsigned char)((reserved_bits ? 0x70 : 0x00) | 0x80 | opcode);

  if (use_extended_64) {
    out[offset++] = (unsigned char)((masked ? 0x80 : 0x00) | 127);
    out[offset++] = 0x00;
    out[offset++] = 0x00;
    out[offset++] = 0x00;
    out[offset++] = 0x00;
    out[offset++] = 0x00;
    out[offset++] = 0x01;
    out[offset++] = 0x00;
    out[offset++] = 0x01;
  } else if (use_extended_16) {
    out[offset++] = (unsigned char)((masked ? 0x80 : 0x00) | 126);
    out[offset++] = (unsigned char)(payload_length >> 8);
    out[offset++] = (unsigned char)payload_length;
  } else {
    out[offset++] = (unsigned char)((masked ? 0x80 : 0x00) | payload_length);
  }

  memcpy(out + offset, mask, sizeof(mask));
  offset += sizeof(mask);

  if (payload_length > 0 && offset + payload_length <= out_size) {
    for (size_t index = 0; index < payload_length; index += 1) {
      unsigned char value = data[(index + 5) % size];
      out[offset + index] = masked ? (unsigned char)(value ^ mask[index % 4]) : value;
    }
    offset += payload_length;
  }

  return offset;
}

static void exercise_oversized_frame(void) {
  static const unsigned char oversized[] = {
    0x81, 0xff,
    0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01,
    1, 2, 3, 4
  };

  int sockets[2];
  if (socketpair(AF_UNIX, SOCK_STREAM, 0, sockets) != 0) return;

  FuzzWrite write = {
    .socket = sockets[1],
    .data = oversized,
    .length = sizeof(oversized),
    .chunk_size = 1
  };

  pthread_t thread;
  if (pthread_create(&thread, NULL, write_fragmented, &write) != 0) {
    close(sockets[0]);
    close(sockets[1]);
    return;
  }

  LumenWebSocketFrame frame;
  unsigned char *payload = NULL;
  int result = websocket_read_frame(sockets[0], &frame, &payload);
  if (result == 1) free(payload);

  pthread_join(thread, NULL);
  close(sockets[0]);
  close(sockets[1]);
}

int LLVMFuzzerTestOneInput(const unsigned char *data, size_t size) {
  unsigned char frame_buffer[LUMEN_WEBSOCKET_MAX_PAYLOAD + 16];
  size_t frame_length = encode_websocket_frame(data, size, frame_buffer, sizeof(frame_buffer));
  if (frame_length == 0) return 0;

  int sockets[2];
  if (socketpair(AF_UNIX, SOCK_STREAM, 0, sockets) != 0) return 0;

  FuzzWrite write = {
    .socket = sockets[1],
    .data = frame_buffer,
    .length = frame_length,
    .chunk_size = size > 1 ? (size_t)(1 + (data[1] % 4)) : 1
  };

  pthread_t thread;
  if (pthread_create(&thread, NULL, write_fragmented, &write) != 0) {
    close(sockets[0]);
    close(sockets[1]);
    return 0;
  }

  LumenWebSocketFrame frame;
  unsigned char *payload = NULL;
  int result = websocket_read_frame(sockets[0], &frame, &payload);
  if (result == 1) free(payload);

  pthread_join(thread, NULL);
  exercise_oversized_frame();
  close(sockets[0]);
  close(sockets[1]);
  return 0;
}

#ifdef LUMEN_STANDALONE_FUZZ
#include "standalone.h"
#endif
