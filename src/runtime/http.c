#ifndef _POSIX_C_SOURCE
#define _POSIX_C_SOURCE 200809L
#endif
#ifndef _XOPEN_SOURCE
#define _XOPEN_SOURCE 700
#endif

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
#include <ctype.h>
#include <fcntl.h>
#include <limits.h>
#include <netinet/in.h>
#include <pthread.h>
#include <signal.h>
#include <stdint.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/time.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

#ifndef PATH_MAX
#define PATH_MAX 4096
#endif

#ifndef __APPLE__
#define CC_SHA1_DIGEST_LENGTH 20
#define CC_SHA256_DIGEST_LENGTH 32
typedef int CCOperation;
#define kCCEncrypt 0
#define kCCDecrypt 1
#endif

typedef struct LumenAllocation {
  void *pointer;
  struct LumenAllocation *next;
} LumenAllocation;

static LumenAllocation *lumen_allocations = NULL;
static pthread_mutex_t lumen_allocations_mutex = PTHREAD_MUTEX_INITIALIZER;
static int lumen_cleanup_registered = 0;

void lumen_runtime_cleanup(void) {
  pthread_mutex_lock(&lumen_allocations_mutex);
  LumenAllocation *allocation = lumen_allocations;
  lumen_allocations = NULL;
  pthread_mutex_unlock(&lumen_allocations_mutex);

  while (allocation) {
    LumenAllocation *next = allocation->next;
    free(allocation->pointer);
    free(allocation);
    allocation = next;
  }
}

void *lumen_alloc(size_t size) {
  if (size == 0) size = 1;

  void *pointer = malloc(size);
  if (!pointer) return NULL;

  LumenAllocation *allocation = malloc(sizeof(LumenAllocation));
  if (!allocation) {
    free(pointer);
    return NULL;
  }

  allocation->pointer = pointer;

  pthread_mutex_lock(&lumen_allocations_mutex);
  if (!lumen_cleanup_registered) {
    atexit(lumen_runtime_cleanup);
    lumen_cleanup_registered = 1;
  }
  allocation->next = lumen_allocations;
  lumen_allocations = allocation;
  pthread_mutex_unlock(&lumen_allocations_mutex);

  return pointer;
}

void lumen_free(void *pointer) {
  if (!pointer) return;

  pthread_mutex_lock(&lumen_allocations_mutex);
  LumenAllocation **link = &lumen_allocations;

  while (*link && (*link)->pointer != pointer) {
    link = &(*link)->next;
  }

  LumenAllocation *allocation = *link;
  if (allocation) *link = allocation->next;
  pthread_mutex_unlock(&lumen_allocations_mutex);

  free(pointer);
  free(allocation);
}

#define malloc(size) lumen_alloc(size)
#define free(pointer) lumen_free(pointer)

static char *lumen_strdup(const char *value);
char *lumen_list(void);
char *lumen_list_push(const char *list, const char *value);

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

char *lumen_date(void) {
  time_t now = time(NULL);
  struct tm value;
  localtime_r(&now, &value);

  char *out = malloc(20);
  if (!out) return "";

  strftime(out, 20, "%Y-%m-%d %H:%M:%S", &value);
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

char *lumen_read_file(const char *path) {
  FILE *file = fopen(path, "rb");
  if (!file) return lumen_strdup("");

  fseek(file, 0, SEEK_END);
  long size = ftell(file);
  fseek(file, 0, SEEK_SET);

  char *source = malloc((size_t)size + 1);
  if (!source) {
    fclose(file);
    return lumen_strdup("");
  }

  size_t bytes_read = fread(source, 1, (size_t)size, file);
  source[bytes_read] = '\0';
  fclose(file);
  return source;
}

int lumen_exec(const char *command) {
  int status = system(command);
  if (status == -1) return 1;
  if (WIFEXITED(status)) return WEXITSTATUS(status);
  return status == 0 ? 0 : 1;
}

__attribute__((weak)) const char *lumen_compiler_image(void) {
  return "";
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

int lumen_string_len(const char *value) {
  return (int)strlen(value);
}

int lumen_string_equals(const char *left, const char *right) {
  return strcmp(left, right) == 0;
}

char *lumen_string_trim(const char *value) {
  const char *start = value;
  while (*start && isspace((unsigned char)*start)) start += 1;

  const char *end = value + strlen(value);
  while (end > start && isspace((unsigned char)*(end - 1))) end -= 1;

  size_t length = (size_t)(end - start);
  char *out = malloc(length + 1);
  if (!out) return "";
  memcpy(out, start, length);
  out[length] = '\0';
  return out;
}

char *lumen_string_lower(const char *value) {
  size_t length = strlen(value);
  char *out = malloc(length + 1);
  if (!out) return "";

  for (size_t index = 0; index < length; index += 1) {
    out[index] = (char)tolower((unsigned char)value[index]);
  }

  out[length] = '\0';
  return out;
}

char *lumen_string_upper(const char *value) {
  size_t length = strlen(value);
  char *out = malloc(length + 1);
  if (!out) return "";

  for (size_t index = 0; index < length; index += 1) {
    out[index] = (char)toupper((unsigned char)value[index]);
  }

  out[length] = '\0';
  return out;
}

int lumen_string_starts_with(const char *value, const char *prefix) {
  size_t prefix_length = strlen(prefix);
  return strncmp(value, prefix, prefix_length) == 0;
}

int lumen_string_ends_with(const char *value, const char *suffix) {
  size_t value_length = strlen(value);
  size_t suffix_length = strlen(suffix);
  if (suffix_length > value_length) return 0;
  return strcmp(value + value_length - suffix_length, suffix) == 0;
}

char *lumen_string_replace(const char *value, const char *needle, const char *replacement) {
  size_t needle_length = strlen(needle);
  if (needle_length == 0) return lumen_strdup(value);

  const char *match = strstr(value, needle);
  if (!match) return lumen_strdup(value);

  size_t prefix_length = (size_t)(match - value);
  size_t replacement_length = strlen(replacement);
  size_t suffix_length = strlen(match + needle_length);
  char *out = malloc(prefix_length + replacement_length + suffix_length + 1);
  if (!out) return "";

  memcpy(out, value, prefix_length);
  memcpy(out + prefix_length, replacement, replacement_length);
  memcpy(out + prefix_length + replacement_length, match + needle_length, suffix_length + 1);
  return out;
}

char *lumen_string_split(const char *value, const char *separator) {
  size_t separator_length = strlen(separator);
  char *items = lumen_list();
  if (separator_length == 0) return lumen_list_push(items, value);

  const char *cursor = value;
  const char *match = NULL;

  while ((match = strstr(cursor, separator))) {
    size_t length = (size_t)(match - cursor);
    char *item = malloc(length + 1);
    if (!item) return items;
    memcpy(item, cursor, length);
    item[length] = '\0';
    items = lumen_list_push(items, item);
    cursor = match + separator_length;
  }

  return lumen_list_push(items, cursor);
}

int lumen_string_index_of(const char *value, const char *needle) {
  const char *match = strstr(value, needle);
  if (!match) return -1;
  return (int)(match - value);
}

int lumen_string_last_index_of(const char *value, const char *needle) {
  size_t needle_length = strlen(needle);
  if (needle_length == 0) return (int)strlen(value);

  int found = -1;
  const char *cursor = value;
  const char *match = NULL;

  while ((match = strstr(cursor, needle))) {
    found = (int)(match - value);
    cursor = match + 1;
  }

  return found;
}

int lumen_string_contains(const char *value, const char *needle) {
  return strstr(value, needle) != NULL;
}

char *lumen_string_repeat(const char *value, int count) {
  if (count <= 0) return lumen_strdup("");

  size_t value_length = strlen(value);
  size_t total = value_length * (size_t)count;
  char *out = malloc(total + 1);
  if (!out) return "";

  char *cursor = out;
  for (int index = 0; index < count; index += 1) {
    memcpy(cursor, value, value_length);
    cursor += value_length;
  }

  out[total] = '\0';
  return out;
}

static char *lumen_string_pad(const char *value, int target, const char *fill, int start) {
  int value_length = (int)strlen(value);
  if (target <= value_length) return lumen_strdup(value);

  size_t fill_length = strlen(fill);
  if (fill_length == 0) fill = " ";
  fill_length = strlen(fill);

  int pad_length = target - value_length;
  char *out = malloc((size_t)target + 1);
  if (!out) return "";

  int out_index = 0;
  if (!start) {
    memcpy(out, value, (size_t)value_length);
    out_index = value_length;
  }

  for (int index = 0; index < pad_length; index += 1) {
    out[out_index++] = fill[index % (int)fill_length];
  }

  if (start) {
    memcpy(out + out_index, value, (size_t)value_length);
    out_index += value_length;
  }

  out[out_index] = '\0';
  return out;
}

char *lumen_string_pad_start(const char *value, int target, const char *fill) {
  return lumen_string_pad(value, target, fill, 1);
}

char *lumen_string_pad_end(const char *value, int target, const char *fill) {
  return lumen_string_pad(value, target, fill, 0);
}

char *lumen_int_to_string(int value) {
  char *out = malloc(32);
  if (!out) return "";
  snprintf(out, 32, "%d", value);
  return out;
}

int lumen_string_to_int(const char *value) {
  return atoi(value);
}

float lumen_parse_f32(const char *value) {
  return strtof(value, NULL);
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

int lumen_bounds_check(int index, int length) {
  if (index >= 0 && index < length) return index;

  fprintf(
    stderr,
    "runtime error: index %d out of bounds for length %d\n",
    index,
    length
  );
  exit(1);
}

char *lumen_string_at(const char *value, int index) {
  int checked = lumen_bounds_check(index, (int)strlen(value));
  char *out = malloc(2);
  if (!out) return "";

  out[0] = value[checked];
  out[1] = '\0';
  return out;
}

char *lumen_string_slice(const char *value, int start, int end) {
  int length = (int)strlen(value);
  if (start < 0 || start > length || end < start || end > length) {
    fprintf(
      stderr,
      "runtime error: slice %d..%d out of bounds for length %d\n",
      start,
      end,
      length
    );
    exit(1);
  }

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
  char *out = malloc(strlen(cursor) + 1);
  if (!out) return "";

  size_t length = 0;
  while (*cursor && *cursor != '"') {
    if (*cursor == '\\' && cursor[1]) cursor += 1;
    out[length++] = *cursor++;
  }

  out[length] = '\0';
  return out;
}

static const char *json_skip_ws(const char *cursor) {
  while (*cursor == ' ' || *cursor == '\t' || *cursor == '\n' || *cursor == '\r') cursor += 1;
  return cursor;
}

static const char *json_value_end(const char *start) {
  const char *cursor = start;
  int depth = 0;
  int in_string = 0;
  int escaped = 0;

  while (*cursor) {
    if (in_string) {
      if (escaped) escaped = 0;
      else if (*cursor == '\\') escaped = 1;
      else if (*cursor == '"') in_string = 0;
      cursor += 1;
      continue;
    }

    if (*cursor == '"') in_string = 1;
    else if (*cursor == '{' || *cursor == '[') depth += 1;
    else if (*cursor == '}' || *cursor == ']') {
      if (depth == 0) break;
      depth -= 1;
    } else if (depth == 0 && (*cursor == ',' || *cursor == '}' || *cursor == ']')) {
      break;
    }

    cursor += 1;
  }

  while (cursor > start && isspace((unsigned char)*(cursor - 1))) cursor -= 1;
  return cursor;
}

static char *json_copy_value(const char *start) {
  start = json_skip_ws(start);

  if (*start == '"') return json_string_value(start);

  const char *end = json_value_end(start);
  size_t length = (size_t)(end - start);
  char *out = malloc(length + 1);
  if (!out) return "";
  memcpy(out, start, length);
  out[length] = '\0';
  return out;
}

static char *json_copy_raw_value(const char *start) {
  start = json_skip_ws(start);
  const char *end = json_value_end(start);
  size_t length = (size_t)(end - start);
  char *out = malloc(length + 1);
  if (!out) return "";
  memcpy(out, start, length);
  out[length] = '\0';
  return out;
}

static char *json_get_one(const char *json, const char *key) {
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
  return json_copy_value(colon);
}

static char *json_get_one_raw(const char *json, const char *key) {
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
  return json_copy_raw_value(colon);
}

static char *json_array_get(const char *json, int index) {
  const char *cursor = json_skip_ws(json);
  if (*cursor != '[') return "";
  cursor += 1;

  int current = 0;
  while (*cursor) {
    cursor = json_skip_ws(cursor);
    if (*cursor == ']') return "";

    if (current == index) return json_copy_value(cursor);

    cursor = json_value_end(cursor);
    cursor = json_skip_ws(cursor);
    if (*cursor == ',') cursor += 1;
    current += 1;
  }

  return "";
}

static char *json_array_get_raw(const char *json, int index) {
  const char *cursor = json_skip_ws(json);
  if (*cursor != '[') return "";
  cursor += 1;

  int current = 0;
  while (*cursor) {
    cursor = json_skip_ws(cursor);
    if (*cursor == ']') return "";

    if (current == index) return json_copy_raw_value(cursor);

    cursor = json_value_end(cursor);
    cursor = json_skip_ws(cursor);
    if (*cursor == ',') cursor += 1;
    current += 1;
  }

  return "";
}

static char *json_path_get(const char *json, const char *key, int raw) {
  char *current = lumen_strdup(json);
  const char *cursor = key;

  while (*cursor) {
    char segment[128];
    int length = 0;

    while (*cursor && *cursor != '.' && *cursor != '[' && length < 127) {
      segment[length++] = *cursor++;
    }
    segment[length] = '\0';

    if (length > 0) current = raw ? json_get_one_raw(current, segment) : json_get_one(current, segment);

    while (*cursor == '[') {
      cursor += 1;
      int index = atoi(cursor);
      while (*cursor && *cursor != ']') cursor += 1;
      if (*cursor == ']') cursor += 1;
      current = raw ? json_array_get_raw(current, index) : json_array_get(current, index);
    }

    if (*cursor == '.') cursor += 1;
  }

  return current;
}

char *lumen_json_get(const char *json, const char *key) {
  return json_path_get(json, key, 0);
}

char *lumen_json_get_raw(const char *json, const char *key) {
  return json_path_get(json, key, 1);
}

char *lumen_json_set(const char *json, const char *key, const char *value) {
  size_t json_length = strlen(json);
  int object = json_length >= 2 && json[0] == '{' && json[json_length - 1] == '}';

  if (object) {
    size_t key_length = strlen(key);
    size_t pattern_length = key_length + 4;
    char *pattern = malloc(pattern_length);
    if (!pattern) return "";

    snprintf(pattern, pattern_length, "\"%s\"", key);
    char *found = strstr(json, pattern);
    free(pattern);

    if (found) {
      char *colon = strchr(found, ':');
      if (colon) {
        const char *value_start = json_skip_ws(colon + 1);
        const char *value_finish = json_value_end(value_start);
        size_t prefix_length = (size_t)(value_start - json);
        size_t value_length = strlen(value);
        size_t suffix_length = strlen(value_finish);
        char *out = malloc(prefix_length + value_length + suffix_length + 1);
        if (!out) return "";

        memcpy(out, json, prefix_length);
        memcpy(out + prefix_length, value, value_length);
        memcpy(out + prefix_length + value_length, value_finish, suffix_length + 1);
        return out;
      }
    }
  }

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

char *lumen_json_set_path(const char *json, const char *key, const char *value) {
  const char *dot = strchr(key, '.');
  if (!dot) return lumen_json_set(json, key, value);

  size_t root_length = (size_t)(dot - key);
  char *root = malloc(root_length + 1);
  if (!root) return "";
  memcpy(root, key, root_length);
  root[root_length] = '\0';

  const char *child = dot + 1;
  char *current = lumen_json_get_raw(json, root);
  if (strlen(current) == 0) current = lumen_strdup("{}");

  char *next = lumen_json_set_path(current, child, value);
  char *out = lumen_json_set(json, root, next);
  return out;
}

char *lumen_json_stringify(const char *value) {
  size_t length = 3;
  for (const char *cursor = value; *cursor; cursor += 1) {
    length += (*cursor == '"' || *cursor == '\\' || *cursor == '\n') ? 2 : 1;
  }

  char *out = malloc(length);
  if (!out) return "";

  char *target = out;
  *target++ = '"';
  for (const char *cursor = value; *cursor; cursor += 1) {
    if (*cursor == '"') {
      *target++ = '\\';
      *target++ = '"';
    } else if (*cursor == '\\') {
      *target++ = '\\';
      *target++ = '\\';
    } else if (*cursor == '\n') {
      *target++ = '\\';
      *target++ = 'n';
    } else {
      *target++ = *cursor;
    }
  }

  *target++ = '"';
  *target = '\0';
  return out;
}

int lumen_json_valid(const char *value) {
  const char *cursor = json_skip_ws(value);
  char open = *cursor;
  if (open != '{' && open != '[' && open != '"') return 0;

  int depth = 0;
  int in_string = 0;
  int escaped = 0;
  char stack[128];
  int stack_length = 0;

  while (*cursor) {
    if (in_string) {
      if (escaped) escaped = 0;
      else if (*cursor == '\\') escaped = 1;
      else if (*cursor == '"') in_string = 0;
      cursor += 1;
      continue;
    }

    if (*cursor == '"') in_string = 1;
    else if (*cursor == '{' || *cursor == '[') {
      if (stack_length >= 128) return 0;
      stack[stack_length++] = *cursor;
      depth += 1;
    } else if (*cursor == '}' || *cursor == ']') {
      if (stack_length == 0) return 0;
      char expected = *cursor == '}' ? '{' : '[';
      if (stack[--stack_length] != expected) return 0;
      depth -= 1;
    }

    cursor += 1;
  }

  return depth == 0 && !in_string;
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

char *lumen_result_value(const char *result) {
  if (strncmp(result, "ok:", 3) != 0) return "";
  return (char *)result + 3;
}

char *lumen_error_message(const char *result) {
  if (strncmp(result, "err:", 4) != 0) return "";
  return (char *)result + 4;
}

char *lumen_some(const char *value) {
  return lumen_strdup(value);
}

char *lumen_none(void) {
  return "";
}

int lumen_has_value(const char *option) {
  return strlen(option) > 0;
}

char *lumen_value_or(const char *option, const char *fallback) {
  if (strlen(option) > 0) return (char *)option;
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

#include "http_runtime.c"
