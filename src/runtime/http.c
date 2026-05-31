#include <arpa/inet.h>
#ifdef __APPLE__
#include <CommonCrypto/CommonCryptor.h>
#include <CommonCrypto/CommonDigest.h>
#include <CommonCrypto/CommonHMAC.h>
#include <CommonCrypto/CommonKeyDerivation.h>
#include <CommonCrypto/CommonRandom.h>
#include <crt_externs.h>
#endif
#include <errno.h>
#include <netinet/in.h>
#include <pthread.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <time.h>
#include <unistd.h>

#ifndef __APPLE__
#define CC_SHA256_DIGEST_LENGTH 32
typedef int CCOperation;
#define kCCEncrypt 0
#define kCCDecrypt 1
#endif

static char *lumen_strdup(const char *value);

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

char *lumen_env(const char *name) {
  char *value = getenv(name);
  if (value) return value;

  const char *path = getenv("LUMEN_DOTENV_PATH");
  if (!path) path = ".env";

  FILE *file = fopen(path, "r");
  if (!file) return "";

  char line[4096];
  size_t name_length = strlen(name);

  while (fgets(line, sizeof(line), file)) {
    char *cursor = line;

    while (*cursor == ' ' || *cursor == '\t') cursor += 1;
    if (*cursor == '\0' || *cursor == '\n' || *cursor == '#') continue;

    if (strncmp(cursor, "export", 6) == 0 && (cursor[6] == ' ' || cursor[6] == '\t')) {
      cursor += 6;
      while (*cursor == ' ' || *cursor == '\t') cursor += 1;
    }

    char *equals = strchr(cursor, '=');
    if (!equals) continue;

    char *key_end = equals;
    while (key_end > cursor && (key_end[-1] == ' ' || key_end[-1] == '\t')) key_end -= 1;

    if ((size_t)(key_end - cursor) != name_length || strncmp(cursor, name, name_length) != 0) continue;

    char *value_start = equals + 1;
    while (*value_start == ' ' || *value_start == '\t') value_start += 1;

    char *value_end = value_start + strlen(value_start);
    while (value_end > value_start && (value_end[-1] == '\n' || value_end[-1] == '\r')) value_end -= 1;
    while (value_end > value_start && (value_end[-1] == ' ' || value_end[-1] == '\t')) value_end -= 1;

    if ((*value_start == '"' && value_end > value_start && value_end[-1] == '"') ||
      (*value_start == '\'' && value_end > value_start && value_end[-1] == '\'')) {
      value_start += 1;
      value_end -= 1;
    }

    size_t value_length = value_end > value_start ? (size_t)(value_end - value_start) : 0;
    char *out = malloc(value_length + 1);
    if (!out) {
      fclose(file);
      return "";
    }

    memcpy(out, value_start, value_length);
    out[value_length] = '\0';
    fclose(file);
    return out;
  }

  fclose(file);
  return "";
}

char *lumen_arg(int index) {
#ifdef __APPLE__
  int argc = *_NSGetArgc();
  char **argv = *_NSGetArgv();

  if (index < 0 || index >= argc) return "";
  return argv[index];
#else
  (void)index;
  return "";
#endif
}

int lumen_arg_count(void) {
#ifdef __APPLE__
  return *_NSGetArgc();
#else
  return 0;
#endif
}

char *lumen_string_concat(const char *left, const char *right) {
  size_t left_length = strlen(left);
  size_t right_length = strlen(right);
  char *out = malloc(left_length + right_length + 1);
  if (!out) return "";

  memcpy(out, left, left_length);
  memcpy(out + left_length, right, right_length + 1);
  return out;
}

void lumen_assert(int condition, const char *message) {
  if (condition) return;
  fprintf(stderr, "assert failed: %s\n", message);
  exit(1);
}

char *lumen_string_slice(const char *value, int start, int end) {
  int length = (int)strlen(value);
  if (start < 0) start = 0;
  if (end < start) end = start;
  if (end > length) end = length;

  int slice_length = end - start;
  char *out = malloc((size_t)slice_length + 1);
  if (!out) return "";

  memcpy(out, value + start, (size_t)slice_length);
  out[slice_length] = '\0';
  return out;
}

typedef struct {
  char *message;
} LumenChannel;

void *lumen_channel(void) {
  LumenChannel *channel = malloc(sizeof(LumenChannel));
  if (!channel) return NULL;
  channel->message = "";
  return channel;
}

void lumen_send(void *raw_channel, const char *message) {
  LumenChannel *channel = raw_channel;
  if (!channel) return;
  channel->message = lumen_strdup(message);
}

char *lumen_receive(void *raw_channel) {
  LumenChannel *channel = raw_channel;
  if (!channel) return "";
  return channel->message;
}

static char *lumen_prefixed(const char *prefix, const char *value) {
  size_t prefix_length = strlen(prefix);
  size_t value_length = strlen(value);
  char *out = malloc(prefix_length + value_length + 1);
  if (!out) return "";

  memcpy(out, prefix, prefix_length);
  memcpy(out + prefix_length, value, value_length + 1);
  return out;
}

char *lumen_ok(const char *value) {
  return lumen_prefixed("ok:", value);
}

char *lumen_err(const char *message) {
  return lumen_prefixed("err:", message);
}

int lumen_is_ok(const char *result) {
  return strncmp(result, "ok:", 3) == 0;
}

char *lumen_error_message(const char *result) {
  if (strncmp(result, "err:", 4) != 0) return "";
  return (char *)result + 4;
}

char *lumen_some(const char *value) {
  return lumen_prefixed("some:", value);
}

char *lumen_none(void) {
  return "";
}

int lumen_has_value(const char *option) {
  return strncmp(option, "some:", 5) == 0;
}

char *lumen_value_or(const char *option, const char *fallback) {
  if (strncmp(option, "some:", 5) == 0) return (char *)option + 5;
  return (char *)fallback;
}

char *lumen_map(int count, ...) {
  va_list args;
  size_t total = 1;

  va_start(args, count);
  for (int index = 0; index < count; index += 1) {
    const char *key = va_arg(args, const char *);
    const char *value = va_arg(args, const char *);
    total += strlen(key) + strlen(value) + 3;
  }
  va_end(args);

  char *out = malloc(total + 1);
  if (!out) return "";

  size_t offset = 0;
  out[offset++] = '\n';
  va_start(args, count);
  for (int index = 0; index < count; index += 1) {
    const char *key = va_arg(args, const char *);
    const char *value = va_arg(args, const char *);
    size_t key_length = strlen(key);
    size_t value_length = strlen(value);

    memcpy(out + offset, key, key_length);
    offset += key_length;
    out[offset++] = '=';
    memcpy(out + offset, value, value_length);
    offset += value_length;
    out[offset++] = '\n';
  }
  va_end(args);

  out[offset] = '\0';
  return out;
}

char *lumen_map_get(const char *map, const char *key) {
  size_t key_length = strlen(key);
  const char *cursor = map;

  while ((cursor = strchr(cursor, '\n'))) {
    cursor += 1;
    if (strncmp(cursor, key, key_length) == 0 && cursor[key_length] == '=') {
      const char *value_start = cursor + key_length + 1;
      const char *value_end = strchr(value_start, '\n');
      if (!value_end) value_end = value_start + strlen(value_start);

      size_t value_length = (size_t)(value_end - value_start);
      char *out = malloc(value_length + 1);
      if (!out) return "";

      memcpy(out, value_start, value_length);
      out[value_length] = '\0';
      return out;
    }
  }

  return "";
}

int lumen_map_has(const char *map, const char *key) {
  return strlen(lumen_map_get(map, key)) > 0;
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
#ifdef __APPLE__
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
#else
  (void)password;
  (void)salt;
  (void)keys;
  return 0;
#endif
}

static int lumen_aes_ctr_crypt(const unsigned char *input, size_t length, const unsigned char *key, const unsigned char *iv, unsigned char *output, CCOperation operation) {
#ifdef __APPLE__
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
#else
  (void)input;
  (void)length;
  (void)key;
  (void)iv;
  (void)output;
  (void)operation;
  return 0;
#endif
}

static void lumen_crypto_tag(const unsigned char *key, const unsigned char *salt, const unsigned char *iv, const unsigned char *cipher, size_t cipher_length, unsigned char *tag) {
#ifdef __APPLE__
  CCHmacContext context;
  CCHmacInit(&context, kCCHmacAlgSHA256, key, 32);
  CCHmacUpdate(&context, salt, 16);
  CCHmacUpdate(&context, iv, 16);
  CCHmacUpdate(&context, cipher, cipher_length);
  CCHmacFinal(&context, tag);
#else
  (void)key;
  (void)salt;
  (void)iv;
  (void)cipher;
  (void)cipher_length;
  memset(tag, 0, CC_SHA256_DIGEST_LENGTH);
#endif
}

char *lumen_encrypt(const char *value, const char *password, const char *protocol) {
#ifndef __APPLE__
  (void)value;
  (void)password;
  (void)protocol;
  return "";
#else
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
#endif
}

char *lumen_decrypt(const char *value, const char *password, const char *protocol) {
#ifndef __APPLE__
  (void)value;
  (void)password;
  (void)protocol;
  return "";
#else
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
#endif
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

static const char *request_body(const char *request) {
  const char *body = strstr(request, "\r\n\r\n");
  if (!body) return "";
  return body + 4;
}

static char socketio_messages[65536] = "";
static pthread_mutex_t socketio_messages_mutex = PTHREAD_MUTEX_INITIALIZER;

static void socketio_append_message(const char *message) {
  pthread_mutex_lock(&socketio_messages_mutex);

  size_t current = strlen(socketio_messages);
  size_t incoming = strlen(message);
  if (incoming == 0) {
    pthread_mutex_unlock(&socketio_messages_mutex);
    return;
  }

  if (current + incoming + 2 < sizeof(socketio_messages)) {
    if (current > 0) {
      socketio_messages[current++] = '\n';
      socketio_messages[current] = '\0';
    }
    memcpy(socketio_messages + current, message, incoming + 1);
  }

  pthread_mutex_unlock(&socketio_messages_mutex);
}

static char *socketio_messages_json(void) {
  pthread_mutex_lock(&socketio_messages_mutex);

  size_t needed = strlen(socketio_messages) + 3;
  for (const char *cursor = socketio_messages; *cursor; cursor += 1) {
    if (*cursor == '\n') needed += 1;
  }

  char *out = malloc(needed + 1);
  if (!out) {
    pthread_mutex_unlock(&socketio_messages_mutex);
    return lumen_strdup("[]");
  }

  size_t offset = 0;
  out[offset++] = '[';
  const char *cursor = socketio_messages;
  int first = 1;

  while (*cursor) {
    const char *end = strchr(cursor, '\n');
    if (!end) end = cursor + strlen(cursor);

    if (!first) out[offset++] = ',';
    first = 0;

    size_t length = (size_t)(end - cursor);
    memcpy(out + offset, cursor, length);
    offset += length;

    cursor = *end == '\n' ? end + 1 : end;
  }

  out[offset++] = ']';
  out[offset] = '\0';

  pthread_mutex_unlock(&socketio_messages_mutex);
  return out;
}

char *lumen_socketio_event(const char *event, const char *payload) {
  size_t length = strlen(event) + strlen(payload) + 8;
  char *out = malloc(length);
  if (!out) return "";
  snprintf(out, length, "[\"%s\",%s]", event, payload);
  return out;
}

char *lumen_socketio_emit(const char *room, const char *event, const char *payload) {
  size_t length = strlen(room) + strlen(event) + strlen(payload) + 40;
  char *out = malloc(length);
  if (!out) return "";
  snprintf(out, length, "{\"room\":\"%s\",\"event\":\"%s\",\"payload\":%s}", room, event, payload);
  return out;
}

int lumen_socketio_serve_chat(int port, const char *root) {
  int server = make_server(port);
  if (server < 0) return 1;

  printf("Lumen Socket.IO chat listening on http://localhost:%d\n", port);
  fflush(stdout);

  const char *json_headers =
    "Content-Type: application/json\r\n"
    "Access-Control-Allow-Origin: *\r\n"
    "Access-Control-Allow-Headers: content-type\r\n"
    "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n";

  const char *text_headers =
    "Content-Type: text/plain\r\n"
    "Access-Control-Allow-Origin: *\r\n"
    "Access-Control-Allow-Headers: content-type\r\n"
    "Access-Control-Allow-Methods: GET, POST, OPTIONS\r\n";

  for (;;) {
    int client = accept(server, NULL, NULL);
    if (client < 0) continue;

    char request[8192];
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

    if (strcmp(method, "OPTIONS") == 0) {
      const char *body = "{}";
      write_response_with_headers(client, 200, json_headers, body, strlen(body));
      close(client);
      continue;
    }

    if (strcmp(method, "GET") == 0 && (strcmp(path, "/socket.io") == 0 || strcmp(path, "/socket.io/") == 0)) {
      const char *body = "0{\"sid\":\"lumen\",\"upgrades\":[],\"pingInterval\":25000,\"pingTimeout\":20000,\"maxPayload\":1000000}";
      write_response_with_headers(client, 200, text_headers, body, strlen(body));
      close(client);
      continue;
    }

    if (strcmp(method, "GET") == 0 && strcmp(path, "/socket.io/messages") == 0) {
      char *body = socketio_messages_json();
      write_response_with_headers(client, 200, json_headers, body, strlen(body));
      free(body);
      close(client);
      continue;
    }

    if (strcmp(method, "POST") == 0 && strcmp(path, "/socket.io/emit") == 0) {
      const char *body = request_body(request);
      socketio_append_message(body);
      const char *ok = "{\"ok\":true}";
      write_response_with_headers(client, 200, json_headers, ok, strlen(ok));
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
