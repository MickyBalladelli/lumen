#include <arpa/inet.h>
#include <CommonCrypto/CommonCryptor.h>
#include <CommonCrypto/CommonDigest.h>
#include <CommonCrypto/CommonHMAC.h>
#include <CommonCrypto/CommonKeyDerivation.h>
#include <CommonCrypto/CommonRandom.h>
#include <errno.h>
#include <netinet/in.h>
#include <pthread.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

char *lumen_uuid(void) {
  static int seeded = 0;
  if (!seeded) {
    srand((unsigned int)(time(NULL) ^ getpid()));
    seeded = 1;
  }

  unsigned int a = (unsigned int)rand();
  unsigned int b = (unsigned int)rand();
  unsigned int c = (unsigned int)rand();
  unsigned int d = (unsigned int)rand();
  unsigned int e = (unsigned int)rand();

  char *out = malloc(37);
  if (!out) return "";

  snprintf(
    out,
    37,
    "%08x-%04x-%04x-%04x-%012x",
    a,
    b & 0xffff,
    ((c & 0x0fff) | 0x4000),
    ((d & 0x3fff) | 0x8000),
    e
  );

  return out;
}

static const char lumen_base64_table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

static char *lumen_strdup(const char *value) {
  size_t length = strlen(value);
  char *copy = malloc(length + 1);
  if (!copy) return NULL;
  memcpy(copy, value, length + 1);
  return copy;
}

static char *lumen_base64_encode(const unsigned char *data, size_t length) {
  size_t output_length = 4 * ((length + 2) / 3);
  char *out = malloc(output_length + 1);
  if (!out) return NULL;

  size_t input_index = 0;
  size_t output_index = 0;

  while (input_index < length) {
    unsigned int octet_a = input_index < length ? data[input_index++] : 0;
    unsigned int octet_b = input_index < length ? data[input_index++] : 0;
    unsigned int octet_c = input_index < length ? data[input_index++] : 0;
    unsigned int triple = (octet_a << 16) | (octet_b << 8) | octet_c;

    out[output_index++] = lumen_base64_table[(triple >> 18) & 0x3F];
    out[output_index++] = lumen_base64_table[(triple >> 12) & 0x3F];
    out[output_index++] = lumen_base64_table[(triple >> 6) & 0x3F];
    out[output_index++] = lumen_base64_table[triple & 0x3F];
  }

  if (length % 3 == 1) {
    out[output_length - 2] = '=';
    out[output_length - 1] = '=';
  } else if (length % 3 == 2) {
    out[output_length - 1] = '=';
  }

  out[output_length] = '\0';
  return out;
}

static int lumen_base64_value(char value) {
  if (value >= 'A' && value <= 'Z') return value - 'A';
  if (value >= 'a' && value <= 'z') return value - 'a' + 26;
  if (value >= '0' && value <= '9') return value - '0' + 52;
  if (value == '+') return 62;
  if (value == '/') return 63;
  return -1;
}

static unsigned char *lumen_base64_decode(const char *input, size_t *output_length) {
  size_t length = strlen(input);
  if (length % 4 != 0) return NULL;

  size_t padding = 0;
  if (length > 0 && input[length - 1] == '=') padding += 1;
  if (length > 1 && input[length - 2] == '=') padding += 1;

  *output_length = (length / 4) * 3 - padding;
  unsigned char *out = malloc(*output_length + 1);
  if (!out) return NULL;

  size_t input_index = 0;
  size_t output_index = 0;

  while (input_index < length) {
    int sextet_a = input[input_index] == '=' ? 0 : lumen_base64_value(input[input_index]);
    input_index += 1;
    int sextet_b = input[input_index] == '=' ? 0 : lumen_base64_value(input[input_index]);
    input_index += 1;
    int sextet_c = input[input_index] == '=' ? 0 : lumen_base64_value(input[input_index]);
    input_index += 1;
    int sextet_d = input[input_index] == '=' ? 0 : lumen_base64_value(input[input_index]);
    input_index += 1;

    if (sextet_a < 0 || sextet_b < 0 || sextet_c < 0 || sextet_d < 0) {
      free(out);
      return NULL;
    }

    unsigned int triple = ((unsigned int)sextet_a << 18) |
      ((unsigned int)sextet_b << 12) |
      ((unsigned int)sextet_c << 6) |
      (unsigned int)sextet_d;

    if (output_index < *output_length) out[output_index++] = (triple >> 16) & 0xFF;
    if (output_index < *output_length) out[output_index++] = (triple >> 8) & 0xFF;
    if (output_index < *output_length) out[output_index++] = triple & 0xFF;
  }

  out[*output_length] = '\0';
  return out;
}

static int lumen_protocol_is_aes256(const char *protocol) {
  return strcmp(protocol, "AES-256") == 0 ||
    strcmp(protocol, "AES-256-CTR-HMAC-SHA256") == 0;
}

static int lumen_derive_crypto_keys(const char *password, const unsigned char *salt, unsigned char *keys) {
  return CCKeyDerivationPBKDF(
    kCCPBKDF2,
    password,
    strlen(password),
    salt,
    16,
    kCCPRFHmacAlgSHA256,
    100000,
    keys,
    64
  ) == kCCSuccess;
}

static int lumen_aes_ctr_crypt(const unsigned char *input, size_t length, const unsigned char *key, const unsigned char *iv, unsigned char *output, CCOperation operation) {
  CCCryptorRef cryptor = NULL;
  CCCryptorStatus status = CCCryptorCreateWithMode(
    operation,
    kCCModeCTR,
    kCCAlgorithmAES,
    ccNoPadding,
    iv,
    key,
    32,
    NULL,
    0,
    0,
    0,
    &cryptor
  );

  if (status != kCCSuccess) return 0;

  size_t moved = 0;
  status = CCCryptorUpdate(cryptor, input, length, output, length, &moved);
  CCCryptorRelease(cryptor);

  return status == kCCSuccess && moved == length;
}

static void lumen_crypto_tag(const unsigned char *key, const unsigned char *salt, const unsigned char *iv, const unsigned char *cipher, size_t cipher_length, unsigned char *tag) {
  CCHmacContext context;
  CCHmacInit(&context, kCCHmacAlgSHA256, key, 32);
  CCHmacUpdate(&context, salt, 16);
  CCHmacUpdate(&context, iv, 16);
  CCHmacUpdate(&context, cipher, cipher_length);
  CCHmacFinal(&context, tag);
}

char *lumen_encrypt(const char *value, const char *password, const char *protocol) {
  if (!lumen_protocol_is_aes256(protocol)) return "";

  unsigned char salt[16];
  unsigned char iv[16];
  unsigned char keys[64];

  if (CCRandomGenerateBytes(salt, sizeof(salt)) != kCCSuccess) return "";
  if (CCRandomGenerateBytes(iv, sizeof(iv)) != kCCSuccess) return "";
  if (!lumen_derive_crypto_keys(password, salt, keys)) return "";

  size_t value_length = strlen(value);
  unsigned char *cipher = malloc(value_length + 1);
  if (!cipher) return "";

  if (!lumen_aes_ctr_crypt((const unsigned char *)value, value_length, keys, iv, cipher, kCCEncrypt)) {
    free(cipher);
    return "";
  }

  unsigned char tag[CC_SHA256_DIGEST_LENGTH];
  lumen_crypto_tag(keys + 32, salt, iv, cipher, value_length, tag);

  char *salt_text = lumen_base64_encode(salt, sizeof(salt));
  char *iv_text = lumen_base64_encode(iv, sizeof(iv));
  char *cipher_text = lumen_base64_encode(cipher, value_length);
  char *tag_text = lumen_base64_encode(tag, sizeof(tag));

  if (!salt_text || !iv_text || !cipher_text || !tag_text) {
    free(cipher);
    free(salt_text);
    free(iv_text);
    free(cipher_text);
    free(tag_text);
    return "";
  }

  size_t output_length = strlen("lumen:v1:AES-256-CTR-HMAC-SHA256::::") +
    strlen(salt_text) +
    strlen(iv_text) +
    strlen(cipher_text) +
    strlen(tag_text);

  char *out = malloc(output_length + 1);
  if (!out) {
    free(cipher);
    return "";
  }

  snprintf(
    out,
    output_length + 1,
    "lumen:v1:AES-256-CTR-HMAC-SHA256:%s:%s:%s:%s",
    salt_text,
    iv_text,
    cipher_text,
    tag_text
  );

  free(cipher);
  free(salt_text);
  free(iv_text);
  free(cipher_text);
  free(tag_text);
  return out;
}

char *lumen_decrypt(const char *value, const char *password, const char *protocol) {
  if (!lumen_protocol_is_aes256(protocol)) return "";

  char *copy = lumen_strdup(value);
  if (!copy) return "";

  char *parts[7];
  int count = 0;
  char *cursor = copy;

  while (count < 7) {
    parts[count++] = cursor;
    char *next = strchr(cursor, ':');
    if (!next) break;
    *next = '\0';
    cursor = next + 1;
  }

  if (count != 7 ||
    strcmp(parts[0], "lumen") != 0 ||
    strcmp(parts[1], "v1") != 0 ||
    strcmp(parts[2], "AES-256-CTR-HMAC-SHA256") != 0) {
    free(copy);
    return "";
  }

  size_t salt_length = 0;
  size_t iv_length = 0;
  size_t cipher_length = 0;
  size_t tag_length = 0;
  unsigned char *salt = lumen_base64_decode(parts[3], &salt_length);
  unsigned char *iv = lumen_base64_decode(parts[4], &iv_length);
  unsigned char *cipher = lumen_base64_decode(parts[5], &cipher_length);
  unsigned char *tag = lumen_base64_decode(parts[6], &tag_length);

  if (!salt || !iv || !cipher || !tag || salt_length != 16 || iv_length != 16 || tag_length != CC_SHA256_DIGEST_LENGTH) {
    free(copy);
    free(salt);
    free(iv);
    free(cipher);
    free(tag);
    return "";
  }

  unsigned char keys[64];
  unsigned char expected_tag[CC_SHA256_DIGEST_LENGTH];
  if (!lumen_derive_crypto_keys(password, salt, keys)) {
    free(copy);
    free(salt);
    free(iv);
    free(cipher);
    free(tag);
    return "";
  }

  lumen_crypto_tag(keys + 32, salt, iv, cipher, cipher_length, expected_tag);
  if (memcmp(tag, expected_tag, CC_SHA256_DIGEST_LENGTH) != 0) {
    free(copy);
    free(salt);
    free(iv);
    free(cipher);
    free(tag);
    return "";
  }

  unsigned char *plain = malloc(cipher_length + 1);
  if (!plain) {
    free(copy);
    free(salt);
    free(iv);
    free(cipher);
    free(tag);
    return "";
  }

  if (!lumen_aes_ctr_crypt(cipher, cipher_length, keys, iv, plain, kCCDecrypt)) {
    free(copy);
    free(salt);
    free(iv);
    free(cipher);
    free(tag);
    free(plain);
    return "";
  }

  plain[cipher_length] = '\0';
  free(copy);
  free(salt);
  free(iv);
  free(cipher);
  free(tag);
  return (char *)plain;
}

typedef struct {
  pthread_mutex_t mutex;
  pthread_cond_t changed;
  int count;
} LumenSemaphore;

typedef void (*LumenThreadFunction)(const char *, const char *, void *);

typedef struct {
  LumenThreadFunction function;
  const char *path;
  const char *message;
  void *semaphore;
} LumenThreadJob;

typedef struct {
  pthread_t thread;
  LumenThreadJob *job;
} LumenThreadHandle;

void *lumen_semaphore_create(int count) {
  LumenSemaphore *semaphore = malloc(sizeof(LumenSemaphore));
  if (!semaphore) return NULL;

  pthread_mutex_init(&semaphore->mutex, NULL);
  pthread_cond_init(&semaphore->changed, NULL);
  semaphore->count = count;

  return semaphore;
}

static void lumen_semaphore_wait_internal(LumenSemaphore *semaphore) {
  pthread_mutex_lock(&semaphore->mutex);
  while (semaphore->count <= 0) {
    pthread_cond_wait(&semaphore->changed, &semaphore->mutex);
  }
  semaphore->count -= 1;
  pthread_mutex_unlock(&semaphore->mutex);
}

static void lumen_semaphore_signal_internal(LumenSemaphore *semaphore) {
  pthread_mutex_lock(&semaphore->mutex);
  semaphore->count += 1;
  pthread_cond_signal(&semaphore->changed);
  pthread_mutex_unlock(&semaphore->mutex);
}

void lumen_semaphore_wait(void *semaphore) {
  lumen_semaphore_wait_internal((LumenSemaphore *)semaphore);
}

void lumen_semaphore_signal(void *semaphore) {
  lumen_semaphore_signal_internal((LumenSemaphore *)semaphore);
}

int lumen_append_file(const char *path, const char *message) {
  FILE *file = fopen(path, "a");
  if (!file) return 1;

  fputs(message, file);
  fputc('\n', file);
  fclose(file);
  return 0;
}

static void *lumen_thread_entry(void *data) {
  LumenThreadJob *job = data;
  job->function(job->path, job->message, job->semaphore);
  return NULL;
}

void *lumen_thread_start(void *function, const char *path, const char *message, void *semaphore) {
  LumenThreadHandle *handle = malloc(sizeof(LumenThreadHandle));
  LumenThreadJob *job = malloc(sizeof(LumenThreadJob));

  if (!handle || !job) return NULL;

  job->function = (LumenThreadFunction)function;
  job->path = path;
  job->message = message;
  job->semaphore = semaphore;
  handle->job = job;

  if (pthread_create(&handle->thread, NULL, lumen_thread_entry, job) != 0) {
    free(job);
    free(handle);
    return NULL;
  }

  return handle;
}

int lumen_thread_join(void *raw_handle) {
  LumenThreadHandle *handle = raw_handle;
  if (!handle) return 1;

  pthread_join(handle->thread, NULL);
  free(handle->job);
  free(handle);
  return 0;
}

static int make_server(int port) {
  int server = socket(AF_INET, SOCK_STREAM, 0);
  if (server < 0) return 1;

  int yes = 1;
  setsockopt(server, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));

  struct sockaddr_in address;
  memset(&address, 0, sizeof(address));
  address.sin_family = AF_INET;
  address.sin_addr.s_addr = htonl(INADDR_ANY);
  address.sin_port = htons((uint16_t)port);

  if (bind(server, (struct sockaddr *)&address, sizeof(address)) < 0) {
    close(server);
    return -1;
  }

  if (listen(server, 16) < 0) {
    close(server);
    return -1;
  }

  return server;
}

static void write_response(int client, int status, const char *type, const char *body, size_t length) {
  const char *status_text = status == 200 ? "OK" : "Not Found";
  char header[256];
  int header_length = snprintf(
    header,
    sizeof(header),
    "HTTP/1.1 %d %s\r\nContent-Type: %s\r\nContent-Length: %zu\r\nConnection: close\r\n\r\n",
    status,
    status_text,
    type,
    length
  );

  send(client, header, (size_t)header_length, 0);
  send(client, body, length, 0);
}

static void write_response_with_headers(int client, int status, const char *headers, const char *body, size_t length) {
  const char *status_text = status == 200 ? "OK" : "Not Found";
  char header[1024];
  int header_length = snprintf(
    header,
    sizeof(header),
    "HTTP/1.1 %d %s\r\n%sContent-Length: %zu\r\nConnection: close\r\n\r\n",
    status,
    status_text,
    headers,
    length
  );

  send(client, header, (size_t)header_length, 0);
  send(client, body, length, 0);
}

static const char *content_type(const char *path) {
  const char *dot = strrchr(path, '.');
  if (!dot) return "text/plain";
  if (strcmp(dot, ".html") == 0) return "text/html";
  if (strcmp(dot, ".css") == 0) return "text/css";
  if (strcmp(dot, ".js") == 0) return "text/javascript";
  if (strcmp(dot, ".json") == 0) return "application/json";
  return "text/plain";
}

static void request_path(const char *request, char *out, size_t out_size) {
  const char *start = strchr(request, ' ');
  if (!start) {
    snprintf(out, out_size, "/");
    return;
  }

  start += 1;
  const char *end = strchr(start, ' ');
  if (!end) end = start + strlen(start);

  size_t length = (size_t)(end - start);
  if (length >= out_size) length = out_size - 1;

  memcpy(out, start, length);
  out[length] = '\0';

  char *query = strchr(out, '?');
  if (query) *query = '\0';
}

static void request_method(const char *request, char *out, size_t out_size) {
  const char *end = strchr(request, ' ');
  if (!end) {
    snprintf(out, out_size, "GET");
    return;
  }

  size_t length = (size_t)(end - request);
  if (length >= out_size) length = out_size - 1;

  memcpy(out, request, length);
  out[length] = '\0';
}

int lumen_http_serve_files(int port, const char *root) {
  int server = make_server(port);
  if (server < 0) return 1;

  for (;;) {
    int client = accept(server, NULL, NULL);
    if (client < 0) continue;

    char request[2048];
    ssize_t read_count = recv(client, request, sizeof(request) - 1, 0);
    if (read_count <= 0) {
      close(client);
      continue;
    }

    request[read_count] = '\0';
    char path[512];
    request_path(request, path, sizeof(path));

    if (strstr(path, "..")) {
      const char *body = "not found\n";
      write_response(client, 404, "text/plain", body, strlen(body));
      close(client);
      continue;
    }

    if (strcmp(path, "/") == 0) snprintf(path, sizeof(path), "/index.html");

    char full_path[1024];
    snprintf(full_path, sizeof(full_path), "%s%s", root, path);

    FILE *file = fopen(full_path, "rb");
    if (!file) {
      const char *body = "not found\n";
      write_response(client, 404, "text/plain", body, strlen(body));
      close(client);
      continue;
    }

    fseek(file, 0, SEEK_END);
    long size = ftell(file);
    fseek(file, 0, SEEK_SET);

    char *body = malloc((size_t)size);
    if (!body) {
      fclose(file);
      close(client);
      continue;
    }

    fread(body, 1, (size_t)size, file);
    fclose(file);

    write_response(client, 200, content_type(full_path), body, (size_t)size);
    free(body);
    close(client);
  }
}

int lumen_http_serve_api(int port, const char *method, const char *route, const char *headers, const char *body) {
  int server = make_server(port);
  if (server < 0) return 1;

  for (;;) {
    int client = accept(server, NULL, NULL);
    if (client < 0) continue;

    char request[2048];
    ssize_t read_count = recv(client, request, sizeof(request) - 1, 0);
    if (read_count <= 0) {
      close(client);
      continue;
    }

    request[read_count] = '\0';
    char path[512];
    char actual_method[32];
    request_method(request, actual_method, sizeof(actual_method));
    request_path(request, path, sizeof(path));

    if (strcmp(actual_method, method) == 0 && strcmp(path, route) == 0) {
      write_response_with_headers(client, 200, headers, body, strlen(body));
    } else {
      const char *missing = "not found\n";
      write_response(client, 404, "text/plain", missing, strlen(missing));
    }

    close(client);
  }
}

int lumen_http_serve_http(
  int port,
  const char *root,
  const char **methods,
  const char **routes,
  const char **headers,
  const char **bodies,
  int route_count
) {
  int server = make_server(port);
  if (server < 0) return 1;

  printf("Lumen HTTP listening on http://localhost:%d\n", port);
  fflush(stdout);

  for (;;) {
    int client = accept(server, NULL, NULL);
    if (client < 0) continue;

    char request[2048];
    ssize_t read_count = recv(client, request, sizeof(request) - 1, 0);
    if (read_count <= 0) {
      close(client);
      continue;
    }

    request[read_count] = '\0';
    char method[32];
    char path[512];
    request_method(request, method, sizeof(method));
    request_path(request, path, sizeof(path));

    int handled = 0;
    for (int i = 0; i < route_count; i += 1) {
      if (strcmp(method, methods[i]) == 0 && strcmp(path, routes[i]) == 0) {
        write_response_with_headers(client, 200, headers[i], bodies[i], strlen(bodies[i]));
        handled = 1;
        break;
      }
    }

    if (handled) {
      close(client);
      continue;
    }

    if (strstr(path, "..")) {
      const char *body = "not found\n";
      write_response(client, 404, "text/plain", body, strlen(body));
      close(client);
      continue;
    }

    if (strcmp(path, "/") == 0) snprintf(path, sizeof(path), "/index.html");

    char full_path[1024];
    snprintf(full_path, sizeof(full_path), "%s%s", root, path);

    FILE *file = fopen(full_path, "rb");
    if (!file) {
      const char *body = "not found\n";
      write_response(client, 404, "text/plain", body, strlen(body));
      close(client);
      continue;
    }

    fseek(file, 0, SEEK_END);
    long size = ftell(file);
    fseek(file, 0, SEEK_SET);

    char *body = malloc((size_t)size);
    if (!body) {
      fclose(file);
      close(client);
      continue;
    }

    fread(body, 1, (size_t)size, file);
    fclose(file);

    write_response(client, 200, content_type(full_path), body, (size_t)size);
    free(body);
    close(client);
  }
}
