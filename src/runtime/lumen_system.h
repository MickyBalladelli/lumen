#ifndef LUMEN_RUNTIME_SYSTEM_H
#define LUMEN_RUNTIME_SYSTEM_H

#include <stddef.h>

void lumen_runtime_cleanup(void);
void *lumen_alloc(size_t size);
void lumen_free(void *pointer);
char *lumen_strdup(const char *value);
char *lumen_uuid(void);
char *lumen_date(void);
char *lumen_env(const char *name);
char *lumen_arg(int index);
int lumen_arg_count(void);
int lumen_exec(const char *command);
const char *lumen_compiler_image(void);
void lumen_assert(_Bool condition, const char *message);
int lumen_bounds_check(int index, int length);
void *lumen_channel(void);
void lumen_send(void *channel, const char *message);
char *lumen_receive(void *channel);
char *lumen_error_new(int code, const char *message);
int lumen_error_code(const char *error);
char *lumen_error_text(const char *error);
char *lumen_ok(const char *value);
char *lumen_err(const char *message);
_Bool lumen_is_ok(const char *result);
char *lumen_result_value(const char *result);
char *lumen_error_message(const char *result);
char *lumen_some(const char *value);
char *lumen_none(void);
_Bool lumen_has_value(const char *option);
char *lumen_value_or(const char *option, const char *fallback);

#endif
