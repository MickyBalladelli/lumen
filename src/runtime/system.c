#include "runtime_platform.h"
#ifdef __APPLE__
#include <crt_externs.h>
#endif
#include <spawn.h>
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

void *lumen_env(const char *name) {
  char *value = getenv(name);
  if (value) return lumen_ok(value);

  const char *path = getenv("LUMEN_DOTENV_PATH");
  if (!path) path = ".env";

  FILE *file = fopen(path, "r");
  if (!file) return lumen_runtime_error("environment", errno, "variable not found");

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
      return lumen_runtime_error("environment", ENOMEM, "cannot allocate variable value");
    }

    memcpy(out, value_start, value_length);
    out[value_length] = '\0';
    fclose(file);
    return lumen_ok(out);
  }

  fclose(file);
  return lumen_runtime_error("environment", ENOENT, "variable not found");
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

#ifdef __APPLE__
static int lumen_darwin_argc = 0;
static char **lumen_darwin_argv = NULL;
static pthread_once_t lumen_darwin_args_once = PTHREAD_ONCE_INIT;

__attribute__((unused))
static void lumen_load_darwin_args(void) {
  lumen_darwin_argc = *_NSGetArgc();
  lumen_darwin_argv = *_NSGetArgv();
}
#endif

void *lumen_arg(int index) {
#if defined(__linux__) || defined(LUMEN_FORCE_LINUX_ARGS)
  pthread_once(&lumen_process_arguments_once, lumen_load_process_arguments);
  if (!lumen_process_arguments.available) {
    return lumen_runtime_error("process", EIO, "cannot read process arguments");
  }
  if (index < 0 || index >= lumen_process_arguments.count) {
    return lumen_runtime_error("process", ERANGE, "argument index out of range");
  }
  return lumen_ok(lumen_process_arguments.values[index]);
#elif defined(__APPLE__)
  pthread_once(&lumen_darwin_args_once, lumen_load_darwin_args);
  if (index < 0 || index >= lumen_darwin_argc) {
    return lumen_runtime_error("process", ERANGE, "argument index out of range");
  }
  return lumen_ok(lumen_darwin_argv[index]);
#else
  (void)index;
  return lumen_runtime_error("process", ENOTSUP, "process arguments unsupported");
#endif
}

void *lumen_arg_count(void) {
#if defined(__linux__) || defined(LUMEN_FORCE_LINUX_ARGS)
  pthread_once(&lumen_process_arguments_once, lumen_load_process_arguments);
  if (!lumen_process_arguments.available) {
    return lumen_runtime_error("process", EIO, "cannot read process arguments");
  }
  return lumen_ok_i32(lumen_process_arguments.count);
#elif defined(__APPLE__)
  pthread_once(&lumen_darwin_args_once, lumen_load_darwin_args);
  return lumen_ok_i32(lumen_darwin_argc);
#else
  return lumen_runtime_error("process", ENOTSUP, "process arguments unsupported");
#endif
}


void *lumen_exec(const char *command, const char **arguments, int argument_count) {
  if (!command || command[0] == '\0' || argument_count < 0 ||
    (argument_count > 0 && !arguments)) {
    return lumen_runtime_error("process", EINVAL, "invalid process arguments");
  }

  char **argv = malloc(sizeof(char *) * (size_t)(argument_count + 2));
  if (!argv) return lumen_runtime_error("process", ENOMEM, "cannot allocate process arguments");

  argv[0] = (char *)command;
  for (int index = 0; index < argument_count; index += 1) {
    argv[index + 1] = (char *)arguments[index];
  }
  argv[argument_count + 1] = NULL;

#ifdef __APPLE__
  char **environment = *_NSGetEnviron();
#else
  extern char **environ;
  char **environment = environ;
#endif

  pid_t child = 0;
  int code = posix_spawnp(&child, command, NULL, NULL, argv, environment);
  free(argv);
  if (code != 0) return lumen_runtime_error("process", code, "cannot start process");

  int status = 0;
  do {
    code = waitpid(child, &status, 0) < 0 ? errno : 0;
  } while (code == EINTR);

  if (code != 0) return lumen_runtime_error("process", code, "cannot wait for process");
  if (WIFEXITED(status)) return lumen_ok_i32(WEXITSTATUS(status));
  return lumen_runtime_error("process", status, "process terminated abnormally");
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

typedef struct {
  _Bool ok;
  void *value;
  const char *kind;
  int code;
  const char *message;
} LumenResult;

static void *lumen_result_new(
  _Bool ok,
  void *value,
  const char *kind,
  int code,
  const char *message
) {
  LumenResult *result = malloc(sizeof(LumenResult));
  if (!result) return NULL;
  result->ok = ok;
  result->value = value;
  result->kind = kind;
  result->code = code;
  result->message = message;
  return result;
}

void *lumen_ok(const char *value) {
  return lumen_result_new(1, (void *)value, NULL, 0, NULL);
}

void *lumen_ok_pointer(void *value) {
  return lumen_result_new(1, value, NULL, 0, NULL);
}

void *lumen_ok_i32(int value) {
  char *text = malloc(32);
  if (!text) return lumen_runtime_error("memory", ENOMEM, "cannot allocate result value");
  snprintf(text, 32, "%d", value);
  return lumen_ok(text);
}

void *lumen_err(const char *message) {
  return lumen_runtime_error("user", 1, message);
}

void *lumen_runtime_error(const char *kind, int code, const char *message) {
  return lumen_result_new(0, NULL, kind, code, message);
}

_Bool lumen_is_ok(const void *raw_result) {
  const LumenResult *result = raw_result;
  return result && result->ok;
}

void *lumen_result_value(const void *raw_result) {
  const LumenResult *result = raw_result;
  if (!result || !result->ok) return NULL;
  return result->value;
}

char *lumen_error_message(const void *raw_result) {
  const LumenResult *result = raw_result;
  if (!result || result->ok || !result->message) return "";
  return (char *)result->message;
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
