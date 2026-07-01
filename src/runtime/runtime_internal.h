#ifndef LUMEN_RUNTIME_INTERNAL_H
#define LUMEN_RUNTIME_INTERNAL_H

#include "runtime_platform.h"
#include "lumen_system.h"

#define malloc(size) lumen_alloc(size)
#define free(pointer) lumen_free(pointer)

char *lumen_strdup(const char *value);

#endif
