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
#define CC_SHA1_DIGEST_LENGTH 20
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

int lumen_write_file(const char *path, const char *content) {
  FILE *file = fopen(path, "wb");
  if (!file) return 1;

  size_t length = strlen(content);
  size_t written = fwrite(content, 1, length, file);
  fclose(file);
  return written == length ? 0 : 1;
}

int lumen_exec(const char *command) {
  return system(command);
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

char *lumen_string_builder(void) {
  return lumen_strdup("");
}

char *lumen_string_builder_append(const char *builder, const char *value) {
  return lumen_string_concat(builder, value);
}

char *lumen_list(void) {
  return lumen_strdup("\n");
}

char *lumen_list_push(const char *list, const char *value) {
  size_t list_length = strlen(list);
  size_t value_length = strlen(value);
  char *out = malloc(list_length + value_length + 2);
  if (!out) return "";

  memcpy(out, list, list_length);
  memcpy(out + list_length, value, value_length);
  out[list_length + value_length] = '\n';
  out[list_length + value_length + 1] = '\0';
  return out;
}

char *lumen_list_get(const char *list, int index) {
  int current = 0;
  const char *cursor = list;

  while ((cursor = strchr(cursor, '\n'))) {
    cursor += 1;
    if (*cursor == '\0') break;

    const char *end = strchr(cursor, '\n');
    if (!end) end = cursor + strlen(cursor);

    if (current == index) {
      size_t length = (size_t)(end - cursor);
      char *out = malloc(length + 1);
      if (!out) return "";
      memcpy(out, cursor, length);
      out[length] = '\0';
      return out;
    }

    current += 1;
    cursor = end;
  }

  return "";
}

int lumen_list_len(const char *list) {
  int count = 0;
  const char *cursor = list;

  while ((cursor = strchr(cursor, '\n'))) {
    cursor += 1;
    if (*cursor == '\0') break;
    count += 1;
  }

  return count;
}

char *lumen_source_snippet(const char *source, int line, int column) {
  int current_line = 1;
  const char *start = source;

  while (*start && current_line < line) {
    if (*start == '\n') current_line += 1;
    start += 1;
  }

  const char *end = start;
  while (*end && *end != '\n') end += 1;

  size_t line_length = (size_t)(end - start);
  size_t marker = column > 0 ? (size_t)(column - 1) : 0;
  char *out = malloc(line_length + marker + 4);
  if (!out) return "";

  memcpy(out, start, line_length);
  out[line_length] = '\n';
  memset(out + line_length + 1, ' ', marker);
  out[line_length + 1 + marker] = '^';
  out[line_length + 2 + marker] = '\0';
  return out;
}

char *lumen_tokenize_source(const char *source) {
  char *tokens = lumen_list();
  const char *cursor = source;

  while (*cursor) {
    while (*cursor == ' ' || *cursor == '\t' || *cursor == '\n' || *cursor == '\r') cursor += 1;
    if (!*cursor) break;

    const char *start = cursor;
    if ((*cursor >= 'A' && *cursor <= 'Z') || (*cursor >= 'a' && *cursor <= 'z') || *cursor == '_') {
      cursor += 1;
      while ((*cursor >= 'A' && *cursor <= 'Z') ||
        (*cursor >= 'a' && *cursor <= 'z') ||
        (*cursor >= '0' && *cursor <= '9') ||
        *cursor == '_') {
        cursor += 1;
      }
    } else if (*cursor >= '0' && *cursor <= '9') {
      cursor += 1;
      while (*cursor >= '0' && *cursor <= '9') cursor += 1;
    } else {
      cursor += 1;
    }

    size_t length = (size_t)(cursor - start);
    char *token = malloc(length + 1);
    if (!token) return tokens;
    memcpy(token, start, length);
    token[length] = '\0';
    tokens = lumen_list_push(tokens, token);
  }

  return tokens;
}

char *lumen_parse_summary(const char *source) {
  int functions = 0;
  int lets = 0;
  const char *cursor = source;

  while ((cursor = strstr(cursor, "function"))) {
    functions += 1;
    cursor += 8;
  }

  cursor = source;
  while ((cursor = strstr(cursor, "let"))) {
    lets += 1;
    cursor += 3;
  }

  char *out = malloc(64);
  if (!out) return "";
  snprintf(out, 64, "functions=%d lets=%d", functions, lets);
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

char *lumen_json(const char *value) {
  return lumen_strdup(value);
}

static char *json_string_value(const char *start) {
  const char *cursor = start;
  if (*cursor == '"') cursor += 1;
  const char *end = cursor;
  while (*end && *end != '"') end += 1;

  size_t length = (size_t)(end - cursor);
  char *out = malloc(length + 1);
  if (!out) return "";

  memcpy(out, cursor, length);
  out[length] = '\0';
  return out;
}

char *lumen_json_get(const char *json, const char *key) {
  size_t key_length = strlen(key);
  size_t pattern_length = key_length + 4;
  char *pattern = malloc(pattern_length);
  if (!pattern) return "";

  snprintf(pattern, pattern_length, "\"%s\"", key);
  char *found = strstr(json, pattern);
  free(pattern);
  if (!found) return "";

  char *colon = strchr(found, ':');
  if (!colon) return "";
  colon += 1;
  while (*colon == ' ' || *colon == '\t') colon += 1;

  if (*colon == '"') return json_string_value(colon);

  const char *end = colon;
  while (*end && *end != ',' && *end != '}') end += 1;
  while (end > colon && (end[-1] == ' ' || end[-1] == '\t')) end -= 1;

  size_t length = (size_t)(end - colon);
  char *out = malloc(length + 1);
  if (!out) return "";
  memcpy(out, colon, length);
  out[length] = '\0';
  return out;
}

char *lumen_json_set(const char *json, const char *key, const char *value) {
  size_t json_length = strlen(json);
  int object = json_length >= 2 && json[0] == '{' && json[json_length - 1] == '}';
  size_t length = json_length + strlen(key) + strlen(value) + 8;
  char *out = malloc(length);
  if (!out) return "";

  if (!object || json_length == 2) {
    snprintf(out, length, "{\"%s\":%s}", key, value);
    return out;
  }

  snprintf(out, length, "%.*s,\"%s\":%s}", (int)(json_length - 1), json, key, value);
  return out;
}

char *lumen_error_new(int code, const char *message) {
  size_t length = strlen(message) + 32;
  char *out = malloc(length);
  if (!out) return "";
  snprintf(out, length, "error:%d:%s", code, message);
  return out;
}

int lumen_error_code(const char *error) {
  if (strncmp(error, "error:", 6) != 0) return 0;
  return atoi(error + 6);
}

char *lumen_error_text(const char *error) {
  if (strncmp(error, "error:", 6) != 0) return (char *)error;
  const char *message = strchr(error + 6, ':');
  if (!message) return "";
  return (char *)message + 1;
}

char *lumen_array_join(int count, const char **values, const char *separator) {
  size_t total = 1;
  size_t separator_length = strlen(separator);

  for (int index = 0; index < count; index += 1) {
    total += strlen(values[index]);
    if (index + 1 < count) total += separator_length;
  }

  char *out = malloc(total);
  if (!out) return "";

  size_t offset = 0;
  for (int index = 0; index < count; index += 1) {
    size_t value_length = strlen(values[index]);
    memcpy(out + offset, values[index], value_length);
    offset += value_length;

    if (index + 1 < count) {
      memcpy(out + offset, separator, separator_length);
      offset += separator_length;
    }
  }

  out[offset] = '\0';
  return out;
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

char *lumen_map_set(const char *map, const char *key, const char *value) {
  char *without = NULL;
  size_t total = strlen(map) + strlen(key) + strlen(value) + 4;
  without = malloc(total);
  if (!without) return "";

  size_t offset = 0;
  without[offset++] = '\n';
  size_t key_length = strlen(key);
  const char *cursor = map;

  while ((cursor = strchr(cursor, '\n'))) {
    cursor += 1;
    if (*cursor == '\0') break;

    const char *end = strchr(cursor, '\n');
    if (!end) end = cursor + strlen(cursor);

    if (!(strncmp(cursor, key, key_length) == 0 && cursor[key_length] == '=')) {
      size_t line_length = (size_t)(end - cursor);
      memcpy(without + offset, cursor, line_length);
      offset += line_length;
      without[offset++] = '\n';
    }

    cursor = end;
  }

  memcpy(without + offset, key, key_length);
  offset += key_length;
  without[offset++] = '=';
  size_t value_length = strlen(value);
  memcpy(without + offset, value, value_length);
  offset += value_length;
  without[offset++] = '\n';
  without[offset] = '\0';
  return without;
}

char *lumen_map_delete(const char *map, const char *key) {
  size_t total = strlen(map) + 1;
  char *out = malloc(total);
  if (!out) return "";

  size_t offset = 0;
  out[offset++] = '\n';
  size_t key_length = strlen(key);
  const char *cursor = map;

  while ((cursor = strchr(cursor, '\n'))) {
    cursor += 1;
    if (*cursor == '\0') break;

    const char *end = strchr(cursor, '\n');
    if (!end) end = cursor + strlen(cursor);

    if (!(strncmp(cursor, key, key_length) == 0 && cursor[key_length] == '=')) {
      size_t line_length = (size_t)(end - cursor);
      memcpy(out + offset, cursor, line_length);
      offset += line_length;
      out[offset++] = '\n';
    }

    cursor = end;
  }

  out[offset] = '\0';
  return out;
}

char *lumen_map_keys(const char *map) {
  size_t total = strlen(map) + 1;
  char *out = malloc(total);
  if (!out) return "";

  size_t offset = 0;
  out[offset++] = '\n';
  const char *cursor = map;

  while ((cursor = strchr(cursor, '\n'))) {
    cursor += 1;
    if (*cursor == '\0') break;

    const char *equals = strchr(cursor, '=');
    const char *end = strchr(cursor, '\n');
    if (!end) end = cursor + strlen(cursor);

    if (equals && equals < end) {
      size_t key_length = (size_t)(equals - cursor);
      memcpy(out + offset, cursor, key_length);
      offset += key_length;
      out[offset++] = '\n';
    }

    cursor = end;
  }

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

static const char *request_header(const char *request, const char *name, char *out, size_t out_size) {
  size_t name_length = strlen(name);
  const char *line = strstr(request, "\r\n");
  if (!line) return NULL;
  line += 2;

  while (*line && strncmp(line, "\r\n", 2) != 0) {
    const char *end = strstr(line, "\r\n");
    if (!end) break;

    if (strncmp(line, name, name_length) == 0 && line[name_length] == ':') {
      const char *value = line + name_length + 1;
      while (*value == ' ') value += 1;
      size_t length = (size_t)(end - value);
      if (length >= out_size) length = out_size - 1;
      memcpy(out, value, length);
      out[length] = '\0';
      return out;
    }

    line = end + 2;
  }

  return NULL;
}

static void base64_encode(const unsigned char *input, size_t length, char *out, size_t out_size) {
  static const char table[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  size_t offset = 0;

  for (size_t index = 0; index < length && offset + 4 < out_size; index += 3) {
    unsigned int value = input[index] << 16;
    if (index + 1 < length) value |= input[index + 1] << 8;
    if (index + 2 < length) value |= input[index + 2];

    out[offset++] = table[(value >> 18) & 63];
    out[offset++] = table[(value >> 12) & 63];
    out[offset++] = index + 1 < length ? table[(value >> 6) & 63] : '=';
    out[offset++] = index + 2 < length ? table[value & 63] : '=';
  }

  out[offset] = '\0';
}

static int websocket_accept_key(const char *client_key, char *out, size_t out_size) {
#ifdef __APPLE__
  const char *guid = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11";
  char combined[256];
  unsigned char digest[CC_SHA1_DIGEST_LENGTH];

  snprintf(combined, sizeof(combined), "%s%s", client_key, guid);
  CC_SHA1(combined, (CC_LONG)strlen(combined), digest);
  base64_encode(digest, CC_SHA1_DIGEST_LENGTH, out, out_size);
  return 1;
#else
  (void)client_key;
  (void)out;
  (void)out_size;
  return 0;
#endif
}

static void websocket_send_text(int client, const char *message) {
  size_t length = strlen(message);
  unsigned char header[4];
  header[0] = 0x81;

  if (length < 126) {
    header[1] = (unsigned char)length;
    send(client, header, 2, 0);
  } else {
    header[1] = 126;
    header[2] = (unsigned char)((length >> 8) & 255);
    header[3] = (unsigned char)(length & 255);
    send(client, header, 4, 0);
  }

  send(client, message, length, 0);
}

static int websocket_read_text(int client, char *out, size_t out_size) {
  unsigned char header[2];
  ssize_t read_count = recv(client, header, 2, 0);
  if (read_count != 2) return 0;

  int opcode = header[0] & 0x0f;
  int masked = header[1] & 0x80;
  size_t length = header[1] & 0x7f;
  if (opcode == 8) return 0;
  if (!masked || length >= out_size) return 0;
  if (length == 126 || length == 127) return 0;

  unsigned char mask[4];
  if (recv(client, mask, 4, 0) != 4) return 0;
  if (recv(client, out, length, 0) != (ssize_t)length) return 0;

  for (size_t index = 0; index < length; index += 1) {
    out[index] = (char)(out[index] ^ mask[index % 4]);
  }
  out[length] = '\0';
  return 1;
}

static void websocket_chat_loop(int client) {
  char message[2048];

  while (websocket_read_text(client, message, sizeof(message))) {
    socketio_append_message(message);
    char *body = socketio_messages_json();
    websocket_send_text(client, body);
    free(body);
  }
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

char *lumen_http_request(const char *method, const char *path, const char *body) {
  size_t length = strlen(method) + strlen(path) + strlen(body) + 48;
  char *out = malloc(length);
  if (!out) return "";
  snprintf(out, length, "{\"method\":\"%s\",\"path\":\"%s\",\"body\":%s}", method, path, body);
  return out;
}

char *lumen_http_response(int status, const char *headers, const char *body) {
  size_t length = strlen(headers) + strlen(body) + 48;
  char *out = malloc(length);
  if (!out) return "";
  snprintf(out, length, "{\"status\":%d,\"headers\":%s,\"body\":%s}", status, headers, body);
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

    if (strcmp(method, "GET") == 0 && strcmp(path, "/socket.io/ws") == 0) {
      char client_key[128];
      char accept_key[128];

      if (!request_header(request, "Sec-WebSocket-Key", client_key, sizeof(client_key)) ||
        !websocket_accept_key(client_key, accept_key, sizeof(accept_key))) {
        const char *body = "websocket unavailable\n";
        write_response(client, 404, "text/plain", body, strlen(body));
        close(client);
        continue;
      }

      char response[512];
      int response_length = snprintf(
        response,
        sizeof(response),
        "HTTP/1.1 101 Switching Protocols\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        "Sec-WebSocket-Accept: %s\r\n\r\n",
        accept_key
      );
      send(client, response, (size_t)response_length, 0);
      websocket_chat_loop(client);
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
