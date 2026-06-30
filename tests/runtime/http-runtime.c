#include <assert.h>

#include "../../src/runtime/http.c"

typedef struct {
  int socket;
  const unsigned char *data;
  size_t length;
} PartialWrite;

static void *write_one_byte_at_a_time(void *raw) {
  PartialWrite *write = raw;
  for (size_t index = 0; index < write->length; index += 1) {
    assert(send(write->socket, write->data + index, 1, 0) == 1);
  }
  shutdown(write->socket, SHUT_WR);
  return NULL;
}

static void test_http_parser(void) {
  const unsigned char valid[] =
    "POST /items/%61?x=1 HTTP/1.1\r\n"
    "Host: localhost\r\n"
    "Content-Length: 5\r\n"
    "\r\n";
  LumenHttpRequest request;
  size_t content_length = 0;

  assert(parse_http_request_head(valid, sizeof(valid) - 1, &request, &content_length) == 0);
  assert(strcmp(request.method, "POST") == 0);
  assert(strcmp(request.path, "/items/a") == 0);
  assert(content_length == 5);

  const unsigned char missing_host[] = "GET / HTTP/1.1\r\n\r\n";
  assert(parse_http_request_head(
    missing_host,
    sizeof(missing_host) - 1,
    &request,
    &content_length
  ) == 400);

  const unsigned char duplicate_length[] =
    "POST / HTTP/1.1\r\n"
    "Host: localhost\r\n"
    "Content-Length: 1\r\n"
    "Content-Length: 1\r\n"
    "\r\n";
  assert(parse_http_request_head(
    duplicate_length,
    sizeof(duplicate_length) - 1,
    &request,
    &content_length
  ) == 400);

  const unsigned char chunked[] =
    "POST / HTTP/1.1\r\n"
    "Host: localhost\r\n"
    "Transfer-Encoding: chunked\r\n"
    "\r\n";
  assert(parse_http_request_head(chunked, sizeof(chunked) - 1, &request, &content_length) == 501);

  const unsigned char large[] =
    "POST / HTTP/1.1\r\n"
    "Host: localhost\r\n"
    "Content-Length: 1048577\r\n"
    "\r\n";
  assert(parse_http_request_head(large, sizeof(large) - 1, &request, &content_length) == 413);
}

static void test_partial_request_read(void) {
  const unsigned char input[] =
    "POST /echo HTTP/1.1\r\n"
    "Host: localhost\r\n"
    "Content-Length: 5\r\n"
    "\r\n"
    "hello";
  int sockets[2];
  assert(socketpair(AF_UNIX, SOCK_STREAM, 0, sockets) == 0);

  PartialWrite write = {
    .socket = sockets[1],
    .data = input,
    .length = sizeof(input) - 1
  };
  pthread_t thread;
  assert(pthread_create(&thread, NULL, write_one_byte_at_a_time, &write) == 0);

  LumenHttpRequest request;
  assert(read_http_request(sockets[0], &request) == 0);
  assert(request.body_length == 5);
  assert(memcmp(request.body, "hello", 5) == 0);
  free(request.body);

  assert(pthread_join(thread, NULL) == 0);
  close(sockets[0]);
  close(sockets[1]);
}

static void test_websocket_parser(void) {
  const unsigned char valid[] = {
    0x81, 0x85, 1, 2, 3, 4
  };
  LumenWebSocketFrame frame;
  assert(parse_websocket_frame_header(valid, sizeof(valid), &frame) == 1);
  assert(frame.opcode == 1);
  assert(frame.payload_length == 5);
  assert(frame.header_length == 6);

  const unsigned char unmasked[] = { 0x81, 0x05 };
  assert(parse_websocket_frame_header(unmasked, sizeof(unmasked), &frame) == -1);

  const unsigned char fragmented[] = { 0x01, 0x80, 1, 2, 3, 4 };
  assert(parse_websocket_frame_header(fragmented, sizeof(fragmented), &frame) == -1);

  const unsigned char non_minimal[] = { 0x81, 0xfe, 0, 5, 1, 2, 3, 4 };
  assert(parse_websocket_frame_header(non_minimal, sizeof(non_minimal), &frame) == -1);

  char accept_key[64];
  assert(websocket_accept_key(
    "dGhlIHNhbXBsZSBub25jZQ==",
    accept_key,
    sizeof(accept_key)
  ) == 1);
  assert(strcmp(accept_key, "s3pPLMBiTxaQ9kYGzzhZRbK+xOo=") == 0);
  assert(valid_websocket_close_code(1000) == 1);
  assert(valid_websocket_close_code(1005) == 0);
}

static void test_paths_and_json(void) {
  assert(validate_canonical_path("/") == 1);
  assert(validate_canonical_path("/assets/app.js") == 1);
  assert(validate_canonical_path("/assets/../secret") == 0);
  assert(validate_canonical_path("/assets//app.js") == 0);
  assert(validate_canonical_path("/assets/") == 0);

  assert(is_json_value((const unsigned char *)"{\"ok\":true}", 11, 1) == 1);
  assert(is_json_value((const unsigned char *)"{\"ok\":}", 7, 1) == 0);
  const unsigned char embedded_zero[] = { '{', '"', 'x', '"', ':', 0, '}' };
  assert(is_json_value(embedded_zero, sizeof(embedded_zero), 1) == 0);
}

int main(void) {
  test_http_parser();
  test_partial_request_read();
  test_websocket_parser();
  test_paths_and_json();
  return 0;
}
