#include "runtime_internal.h"
#include "lumen_collections.h"

static size_t collection_size_digits(size_t value) {
  size_t digits = 1;
  while (value >= 10) {
    value /= 10;
    digits += 1;
  }
  return digits;
}

static const char *collection_read_item(
  const char *cursor,
  const char *end,
  const char **value,
  size_t *length
) {
  if (!cursor || cursor >= end || !isdigit((unsigned char)*cursor)) return NULL;

  size_t size = 0;
  while (cursor < end && isdigit((unsigned char)*cursor)) {
    size_t digit = (size_t)(*cursor - '0');
    if (size > (SIZE_MAX - digit) / 10) return NULL;
    size = size * 10 + digit;
    cursor += 1;
  }

  if (cursor >= end || *cursor != ':') return NULL;
  cursor += 1;
  if (size > (size_t)(end - cursor)) return NULL;

  *value = cursor;
  *length = size;
  return cursor + size;
}

static char *collection_copy_item(const char *value, size_t length) {
  char *out = malloc(length + 1);
  if (!out) return "";

  memcpy(out, value, length);
  out[length] = '\0';
  return out;
}

static char *collection_write_item(char *cursor, const char *value, size_t length) {
  int prefix = sprintf(cursor, "%zu:", length);
  cursor += prefix;
  memcpy(cursor, value, length);
  return cursor + length;
}

char *lumen_list(void) {
  return lumen_strdup("L1");
}

char *lumen_list_push(const char *list, const char *value) {
  size_t list_length = strlen(list);
  size_t value_length = strlen(value);
  size_t item_length = collection_size_digits(value_length) + 1 + value_length;
  char *out = malloc(list_length + item_length + 1);
  if (!out) return "";

  memcpy(out, list, list_length);
  char *cursor = collection_write_item(out + list_length, value, value_length);
  *cursor = '\0';
  return out;
}

char *lumen_list_get(const char *list, int index) {
  int current = 0;
  const char *end = list + strlen(list);
  const char *cursor = strncmp(list, "L1", 2) == 0 ? list + 2 : end;

  while (cursor < end) {
    const char *value = NULL;
    size_t length = 0;
    cursor = collection_read_item(cursor, end, &value, &length);
    if (!cursor) return "";
    if (current == index) return collection_copy_item(value, length);
    current += 1;
  }

  return "";
}

int lumen_list_len(const char *list) {
  int count = 0;
  const char *end = list + strlen(list);
  const char *cursor = strncmp(list, "L1", 2) == 0 ? list + 2 : end;

  while (cursor < end) {
    const char *value = NULL;
    size_t length = 0;
    cursor = collection_read_item(cursor, end, &value, &length);
    if (!cursor) return 0;
    count += 1;
  }

  return count;
}


static _Bool json_is_valid(const char *value);

static char *json_string_value(const char *start) {
  const char *cursor = start;
  if (*cursor == '"') cursor += 1;
  char *out = malloc(strlen(cursor) + 1);
  if (!out) return NULL;

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
  if (!out) return NULL;
  memcpy(out, start, length);
  out[length] = '\0';
  return out;
}

static char *json_copy_raw_value(const char *start) {
  start = json_skip_ws(start);
  const char *end = json_value_end(start);
  size_t length = (size_t)(end - start);
  char *out = malloc(length + 1);
  if (!out) return NULL;
  memcpy(out, start, length);
  out[length] = '\0';
  return out;
}

static char *json_get_one(const char *json, const char *key) {
  size_t key_length = strlen(key);
  size_t pattern_length = key_length + 4;
  char *pattern = malloc(pattern_length);
  if (!pattern) return NULL;

  snprintf(pattern, pattern_length, "\"%s\"", key);
  char *found = strstr(json, pattern);
  free(pattern);
  if (!found) return NULL;

  char *colon = strchr(found, ':');
  if (!colon) return NULL;
  colon += 1;
  return json_copy_value(colon);
}

static char *json_get_one_raw(const char *json, const char *key) {
  size_t key_length = strlen(key);
  size_t pattern_length = key_length + 4;
  char *pattern = malloc(pattern_length);
  if (!pattern) return NULL;

  snprintf(pattern, pattern_length, "\"%s\"", key);
  char *found = strstr(json, pattern);
  free(pattern);
  if (!found) return NULL;

  char *colon = strchr(found, ':');
  if (!colon) return NULL;
  colon += 1;
  return json_copy_raw_value(colon);
}

static char *json_array_get(const char *json, int index) {
  const char *cursor = json_skip_ws(json);
  if (*cursor != '[') return NULL;
  cursor += 1;

  int current = 0;
  while (*cursor) {
    cursor = json_skip_ws(cursor);
    if (*cursor == ']') return NULL;

    if (current == index) return json_copy_value(cursor);

    cursor = json_value_end(cursor);
    cursor = json_skip_ws(cursor);
    if (*cursor == ',') cursor += 1;
    current += 1;
  }

  return NULL;
}

static char *json_array_get_raw(const char *json, int index) {
  const char *cursor = json_skip_ws(json);
  if (*cursor != '[') return NULL;
  cursor += 1;

  int current = 0;
  while (*cursor) {
    cursor = json_skip_ws(cursor);
    if (*cursor == ']') return NULL;

    if (current == index) return json_copy_raw_value(cursor);

    cursor = json_value_end(cursor);
    cursor = json_skip_ws(cursor);
    if (*cursor == ',') cursor += 1;
    current += 1;
  }

  return NULL;
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

    if (length > 0) {
      current = raw ? json_get_one_raw(current, segment) : json_get_one(current, segment);
      if (!current) return NULL;
    }

    while (*cursor == '[') {
      cursor += 1;
      int index = atoi(cursor);
      while (*cursor && *cursor != ']') cursor += 1;
      if (*cursor == ']') cursor += 1;
      current = raw ? json_array_get_raw(current, index) : json_array_get(current, index);
      if (!current) return NULL;
    }

    if (*cursor == '.') cursor += 1;
  }

  return current;
}

static char *json_set_value(const char *json, const char *key, const char *value) {
  size_t json_length = strlen(json);
  int object = json_length >= 2 && json[0] == '{' && json[json_length - 1] == '}';

  if (object) {
    size_t key_length = strlen(key);
    size_t pattern_length = key_length + 4;
    char *pattern = malloc(pattern_length);
    if (!pattern) return NULL;

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
        if (!out) return NULL;

        memcpy(out, json, prefix_length);
        memcpy(out + prefix_length, value, value_length);
        memcpy(out + prefix_length + value_length, value_finish, suffix_length + 1);
        return out;
      }
    }
  }

  size_t length = json_length + strlen(key) + strlen(value) + 8;
  char *out = malloc(length);
  if (!out) return NULL;

  if (!object || json_length == 2) {
    snprintf(out, length, "{\"%s\":%s}", key, value);
    return out;
  }

  snprintf(out, length, "%.*s,\"%s\":%s}", (int)(json_length - 1), json, key, value);
  return out;
}

static char *json_set_path_value(const char *json, const char *key, const char *value) {
  const char *dot = strchr(key, '.');
  if (!dot) return json_set_value(json, key, value);

  size_t root_length = (size_t)(dot - key);
  char *root = malloc(root_length + 1);
  if (!root) return NULL;
  memcpy(root, key, root_length);
  root[root_length] = '\0';

  const char *child = dot + 1;
  char *current = json_path_get(json, root, 1);
  if (!current) current = lumen_strdup("{}");

  char *next = json_set_path_value(current, child, value);
  if (!next) return NULL;
  char *out = json_set_value(json, root, next);
  return out;
}

static char *json_stringify_value(const char *value) {
  size_t length = 3;
  for (const char *cursor = value; *cursor; cursor += 1) {
    length += (*cursor == '"' || *cursor == '\\' || *cursor == '\n') ? 2 : 1;
  }

  char *out = malloc(length);
  if (!out) return NULL;

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

static _Bool json_is_valid(const char *value) {
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

void *lumen_json(const char *value) {
  if (!json_is_valid(value)) return lumen_runtime_error("json", EINVAL, "invalid JSON");
  char *copy = lumen_strdup(value);
  if (!copy) return lumen_runtime_error("json", ENOMEM, "cannot allocate JSON");
  return lumen_ok(copy);
}

void *lumen_json_get(const char *json, const char *key) {
  if (!json_is_valid(json)) return lumen_runtime_error("json", EINVAL, "invalid JSON");
  char *value = json_path_get(json, key, 0);
  if (!value) return lumen_runtime_error("json", ENOENT, "JSON path not found");
  return lumen_ok(value);
}

void *lumen_json_get_raw(const char *json, const char *key) {
  if (!json_is_valid(json)) return lumen_runtime_error("json", EINVAL, "invalid JSON");
  char *value = json_path_get(json, key, 1);
  if (!value) return lumen_runtime_error("json", ENOENT, "JSON path not found");
  return lumen_ok(value);
}

void *lumen_json_set(const char *json, const char *key, const char *value) {
  if (!json_is_valid(json)) return lumen_runtime_error("json", EINVAL, "invalid JSON");
  char *next = json_set_value(json, key, value);
  if (!next) return lumen_runtime_error("json", ENOMEM, "cannot update JSON");
  return lumen_ok(next);
}

void *lumen_json_set_path(const char *json, const char *key, const char *value) {
  if (!json_is_valid(json)) return lumen_runtime_error("json", EINVAL, "invalid JSON");
  char *next = json_set_path_value(json, key, value);
  if (!next) return lumen_runtime_error("json", ENOMEM, "cannot update JSON path");
  return lumen_ok(next);
}

void *lumen_json_stringify(const char *value) {
  char *text = json_stringify_value(value);
  if (!text) return lumen_runtime_error("json", ENOMEM, "cannot stringify JSON");
  return lumen_ok(text);
}

void *lumen_json_valid(const char *value) {
  return lumen_ok_i32(json_is_valid(value));
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

char *lumen_map(int count, ...) {
  va_list args;
  char *out = lumen_strdup("M1");
  va_start(args, count);
  for (int index = 0; index < count; index += 1) {
    const char *key = va_arg(args, const char *);
    const char *value = va_arg(args, const char *);
    out = lumen_map_set(out, key, value);
  }
  va_end(args);
  return out;
}

char *lumen_map_set(const char *map, const char *key, const char *value) {
  size_t map_length = strlen(map);
  size_t key_length = strlen(key);
  size_t value_length = strlen(value);
  size_t added = collection_size_digits(key_length) + 1 + key_length +
    collection_size_digits(value_length) + 1 + value_length;
  char *out = malloc(map_length + added + 1);
  if (!out) return "";

  char *write = out;
  memcpy(write, "M1", 2);
  write += 2;

  const char *end = map + map_length;
  const char *cursor = strncmp(map, "M1", 2) == 0 ? map + 2 : end;
  while (cursor < end) {
    const char *entry_start = cursor;
    const char *stored_key = NULL;
    const char *stored_value = NULL;
    size_t stored_key_length = 0;
    size_t stored_value_length = 0;
    cursor = collection_read_item(cursor, end, &stored_key, &stored_key_length);
    if (!cursor) return "";
    cursor = collection_read_item(cursor, end, &stored_value, &stored_value_length);
    if (!cursor) return "";

    if (stored_key_length != key_length || memcmp(stored_key, key, key_length) != 0) {
      size_t encoded_length = (size_t)(cursor - entry_start);
      memcpy(write, entry_start, encoded_length);
      write += encoded_length;
    }
  }

  write = collection_write_item(write, key, key_length);
  write = collection_write_item(write, value, value_length);
  *write = '\0';
  return out;
}

char *lumen_map_delete(const char *map, const char *key) {
  size_t map_length = strlen(map);
  char *out = malloc(map_length + 1);
  if (!out) return "";

  char *write = out;
  memcpy(write, "M1", 2);
  write += 2;

  size_t key_length = strlen(key);
  const char *end = map + map_length;
  const char *cursor = strncmp(map, "M1", 2) == 0 ? map + 2 : end;
  while (cursor < end) {
    const char *entry_start = cursor;
    const char *stored_key = NULL;
    const char *stored_value = NULL;
    size_t stored_key_length = 0;
    size_t stored_value_length = 0;
    cursor = collection_read_item(cursor, end, &stored_key, &stored_key_length);
    if (!cursor) return "";
    cursor = collection_read_item(cursor, end, &stored_value, &stored_value_length);
    if (!cursor) return "";

    if (stored_key_length != key_length || memcmp(stored_key, key, key_length) != 0) {
      size_t encoded_length = (size_t)(cursor - entry_start);
      memcpy(write, entry_start, encoded_length);
      write += encoded_length;
    }
  }

  *write = '\0';
  return out;
}

char *lumen_map_keys(const char *map) {
  char *out = lumen_list();
  const char *end = map + strlen(map);
  const char *cursor = strncmp(map, "M1", 2) == 0 ? map + 2 : end;

  while (cursor < end) {
    const char *key = NULL;
    const char *value = NULL;
    size_t key_length = 0;
    size_t value_length = 0;
    cursor = collection_read_item(cursor, end, &key, &key_length);
    if (!cursor) return lumen_list();
    cursor = collection_read_item(cursor, end, &value, &value_length);
    if (!cursor) return lumen_list();

    char *key_copy = collection_copy_item(key, key_length);
    out = lumen_list_push(out, key_copy);
  }

  return out;
}

char *lumen_map_get(const char *map, const char *key) {
  size_t key_length = strlen(key);
  const char *end = map + strlen(map);
  const char *cursor = strncmp(map, "M1", 2) == 0 ? map + 2 : end;

  while (cursor < end) {
    const char *stored_key = NULL;
    const char *stored_value = NULL;
    size_t stored_key_length = 0;
    size_t stored_value_length = 0;
    cursor = collection_read_item(cursor, end, &stored_key, &stored_key_length);
    if (!cursor) return "";
    cursor = collection_read_item(cursor, end, &stored_value, &stored_value_length);
    if (!cursor) return "";

    if (stored_key_length == key_length && memcmp(stored_key, key, key_length) == 0) {
      return collection_copy_item(stored_value, stored_value_length);
    }
  }

  return "";
}

_Bool lumen_map_has(const char *map, const char *key) {
  size_t key_length = strlen(key);
  const char *end = map + strlen(map);
  const char *cursor = strncmp(map, "M1", 2) == 0 ? map + 2 : end;

  while (cursor < end) {
    const char *stored_key = NULL;
    const char *stored_value = NULL;
    size_t stored_key_length = 0;
    size_t stored_value_length = 0;
    cursor = collection_read_item(cursor, end, &stored_key, &stored_key_length);
    if (!cursor) return 0;
    cursor = collection_read_item(cursor, end, &stored_value, &stored_value_length);
    if (!cursor) return 0;

    if (stored_key_length == key_length && memcmp(stored_key, key, key_length) == 0) return 1;
  }

  return 0;
}
