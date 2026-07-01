#ifndef LUMEN_RUNTIME_STRING_H
#define LUMEN_RUNTIME_STRING_H

char *lumen_string_concat(const char *left, const char *right);
char *lumen_string_builder(void);
char *lumen_string_builder_append(const char *builder, const char *value);
int lumen_string_len(const char *value);
_Bool lumen_string_equals(const char *left, const char *right);
char *lumen_string_trim(const char *value);
char *lumen_string_lower(const char *value);
char *lumen_string_upper(const char *value);
_Bool lumen_string_starts_with(const char *value, const char *prefix);
_Bool lumen_string_ends_with(const char *value, const char *suffix);
char *lumen_string_replace(const char *value, const char *needle, const char *replacement);
char *lumen_string_split(const char *value, const char *separator);
int lumen_string_index_of(const char *value, const char *needle);
int lumen_string_last_index_of(const char *value, const char *needle);
_Bool lumen_string_contains(const char *value, const char *needle);
char *lumen_string_repeat(const char *value, int count);
char *lumen_string_pad_start(const char *value, int target, const char *fill);
char *lumen_string_pad_end(const char *value, int target, const char *fill);
char *lumen_int_to_string(int value);
int lumen_string_to_int(const char *value);
float lumen_parse_f32(const char *value);
char *lumen_source_snippet(const char *source, int line, int column);
char *lumen_tokenize_source(const char *source);
char *lumen_parse_summary(const char *source);
char *lumen_string_at(const char *value, int index);
char *lumen_string_slice(const char *value, int start, int end);

#endif
