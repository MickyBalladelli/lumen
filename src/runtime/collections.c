#include "runtime_internal.h"
#include "lumen_collections.h"


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

_Bool lumen_json_valid(const char *value) {
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

_Bool lumen_map_has(const char *map, const char *key) {
  return strlen(lumen_map_get(map, key)) > 0;
}
