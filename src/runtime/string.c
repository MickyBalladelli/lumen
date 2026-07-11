#include "runtime_internal.h"
#include "lumen_string.h"


#include "lumen_collections.h"

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
  if ((uintptr_t)value < 4096) return 0;
  return (int)strlen(value);
}

_Bool lumen_string_equals(const char *left, const char *right) {
  if ((uintptr_t)left < 4096 || (uintptr_t)right < 4096) return 0;
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

_Bool lumen_string_starts_with(const char *value, const char *prefix) {
  size_t prefix_length = strlen(prefix);
  return strncmp(value, prefix, prefix_length) == 0;
}

_Bool lumen_string_ends_with(const char *value, const char *suffix) {
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

_Bool lumen_string_contains(const char *value, const char *needle) {
  if ((uintptr_t)value < 4096 || (uintptr_t)needle < 4096) return 0;
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
