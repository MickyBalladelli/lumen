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

static void test_platform_providers(int argc, char **argv) {
#ifdef LUMEN_FORCE_LINUX_ARGS
  (void)argc;
  (void)argv;
  assert(lumen_arg_count() == 2);
  assert(strcmp(lumen_arg(0), "portable-runtime") == 0);
  assert(strcmp(lumen_arg(1), "provider-check") == 0);
#else
  assert(lumen_arg_count() == argc);
  assert(strcmp(lumen_arg(0), argv[0]) == 0);
  if (argc > 1) assert(strcmp(lumen_arg(1), argv[1]) == 0);
#endif

  char *encrypted = lumen_encrypt("portable lumen", "secret", "AES-256");
  const char *prefix = "lumen:v1:AES-256-CTR-HMAC-SHA256:";
  assert(strncmp(encrypted, prefix, strlen(prefix)) == 0);
  char *decrypted = lumen_decrypt(encrypted, "secret", "AES-256");
  assert(strcmp(decrypted, "portable lumen") == 0);
  assert(strcmp(lumen_decrypt(encrypted, "wrong", "AES-256"), "") == 0);
}

#ifndef LUMEN_USE_COMMON_CRYPTO
static void test_portable_crypto_vectors(void) {
  const unsigned char expected_pbkdf2[32] = {
    0x12,0x0f,0xb6,0xcf,0xfc,0xf8,0xb3,0x2c,
    0x43,0xe7,0x22,0x52,0x56,0xc4,0xf8,0x37,
    0xa8,0x65,0x48,0xc9,0x2c,0xcc,0x35,0x48,
    0x08,0x05,0x98,0x7c,0xb7,0x0b,0xe1,0x7b
  };
  unsigned char derived[32];
  assert(lumen_pbkdf2_sha256(
    "password",
    (const unsigned char *)"salt",
    4,
    1,
    derived,
    sizeof(derived)
  ) == 1);
  assert(memcmp(derived, expected_pbkdf2, sizeof(derived)) == 0);

  const unsigned char key[32] = {
    0x60,0x3d,0xeb,0x10,0x15,0xca,0x71,0xbe,
    0x2b,0x73,0xae,0xf0,0x85,0x7d,0x77,0x81,
    0x1f,0x35,0x2c,0x07,0x3b,0x61,0x08,0xd7,
    0x2d,0x98,0x10,0xa3,0x09,0x14,0xdf,0xf4
  };
  const unsigned char counter[16] = {
    0xf0,0xf1,0xf2,0xf3,0xf4,0xf5,0xf6,0xf7,
    0xf8,0xf9,0xfa,0xfb,0xfc,0xfd,0xfe,0xff
  };
  const unsigned char plain[16] = {
    0x6b,0xc1,0xbe,0xe2,0x2e,0x40,0x9f,0x96,
    0xe9,0x3d,0x7e,0x11,0x73,0x93,0x17,0x2a
  };
  const unsigned char expected_cipher[16] = {
    0x60,0x1e,0xc3,0x13,0x77,0x57,0x89,0xa5,
    0xb7,0xa7,0xf5,0x04,0xbb,0xf3,0xd2,0x28
  };
  unsigned char cipher[16];
  assert(lumen_aes256_ctr(plain, sizeof(plain), key, counter, cipher) == 1);
  assert(memcmp(cipher, expected_cipher, sizeof(cipher)) == 0);
}
#endif

int main(int argc, char **argv) {
  test_http_parser();
  test_partial_request_read();
  test_websocket_parser();
  test_paths_and_json();
  test_platform_providers(argc, argv);
#ifndef LUMEN_USE_COMMON_CRYPTO
  test_portable_crypto_vectors();
#endif
  return 0;
}
