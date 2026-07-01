#include "runtime_platform.h"
#ifdef __APPLE__
#include <crt_externs.h>
#endif
#include "lumen_system.h"

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

#if defined(__linux__) || defined(LUMEN_FORCE_LINUX_ARGS)
typedef struct {
  char *data;
  char **values;
  int count;
  int available;
} LumenProcessArguments;

static LumenProcessArguments lumen_process_arguments = {0};
static pthread_once_t lumen_process_arguments_once = PTHREAD_ONCE_INIT;

static void lumen_load_process_arguments(void) {
  long configured_limit = sysconf(_SC_ARG_MAX);
  size_t capacity = configured_limit > 0
    ? (size_t)configured_limit
    : 2 * 1024 * 1024;
  if (capacity > 16 * 1024 * 1024) capacity = 16 * 1024 * 1024;

  const char *path = getenv("LUMEN_PROC_SELF_CMDLINE");
  if (!path || path[0] == '\0') path = "/proc/self/cmdline";
  FILE *file = fopen(path, "rb");
  if (!file) return;

  char *data = lumen_alloc(capacity + 1);
  if (!data) {
    fclose(file);
    return;
  }
  size_t length = fread(data, 1, capacity, file);
  int failed = ferror(file);
  fclose(file);
  if (failed || length == 0 || length == capacity) return;
  data[length] = '\0';

  int count = 0;
  for (size_t index = 0; index < length; index += 1) {
    if (data[index] == '\0') count += 1;
  }
  if (count == 0) return;

  char **values = lumen_alloc(sizeof(char *) * (size_t)count);
  if (!values) return;
  int argument = 0;
  values[argument++] = data;
  for (size_t index = 0; index + 1 < length && argument < count; index += 1) {
    if (data[index] == '\0') values[argument++] = data + index + 1;
  }

  lumen_process_arguments.data = data;
  lumen_process_arguments.values = values;
  lumen_process_arguments.count = argument;
  lumen_process_arguments.available = 1;
}
#endif

char *lumen_arg(int index) {
#if defined(__APPLE__) && !defined(LUMEN_FORCE_LINUX_ARGS)
  int argc = *_NSGetArgc();
  char **argv = *_NSGetArgv();

  if (index < 0 || index >= argc) return "";
  return argv[index];
#elif defined(__linux__) || defined(LUMEN_FORCE_LINUX_ARGS)
  pthread_once(&lumen_process_arguments_once, lumen_load_process_arguments);
  if (!lumen_process_arguments.available) {
    return "error: cannot read process arguments from /proc/self/cmdline";
  }
  if (index < 0 || index >= lumen_process_arguments.count) return "";
  return lumen_process_arguments.values[index];
#else
  (void)index;
  return "error: process arguments are unsupported on this platform";
#endif
}

int lumen_arg_count(void) {
#if defined(__APPLE__) && !defined(LUMEN_FORCE_LINUX_ARGS)
  return *_NSGetArgc();
#elif defined(__linux__) || defined(LUMEN_FORCE_LINUX_ARGS)
  pthread_once(&lumen_process_arguments_once, lumen_load_process_arguments);
  return lumen_process_arguments.available ? lumen_process_arguments.count : -1;
#else
  return -1;
#endif
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

void lumen_assert(_Bool condition, const char *message) {
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

_Bool lumen_is_ok(const char *result) {
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

_Bool lumen_has_value(const char *option) {
  return strlen(option) > 0;
}

char *lumen_value_or(const char *option, const char *fallback) {
  if (strlen(option) > 0) return (char *)option;
  return (char *)fallback;
}

char *lumen_strdup(const char *value) {
  size_t length = strlen(value);
  char *copy = malloc(length + 1);
  if (!copy) return NULL;
  memcpy(copy, value, length + 1);
  return copy;
}
