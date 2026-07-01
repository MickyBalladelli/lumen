#include "runtime_internal.h"

typedef void *(*LumenTaskFunction)(void *);

typedef enum {
  LUMEN_TASK_PENDING,
  LUMEN_TASK_RUNNING,
  LUMEN_TASK_COMPLETED,
  LUMEN_TASK_CANCELLED,
  LUMEN_TASK_FAILED
} LumenTaskState;

typedef struct LumenTask {
  pthread_t thread;
  pthread_mutex_t mutex;
  pthread_cond_t changed;
  LumenTaskFunction function;
  void *context;
  void *result;
  const char *error;
  LumenTaskState state;
  int cancel_requested;
  int started;
  struct LumenTask *next;
} LumenTask;

static pthread_mutex_t lumen_tasks_mutex = PTHREAD_MUTEX_INITIALIZER;
static LumenTask *lumen_tasks = NULL;
static pthread_once_t lumen_task_key_once = PTHREAD_ONCE_INIT;
static pthread_key_t lumen_task_key;
static int lumen_task_cleanup_registered = 0;

static void lumen_task_make_key(void) {
  pthread_key_create(&lumen_task_key, NULL);
}

static void lumen_task_cleanup(void) {
  pthread_mutex_lock(&lumen_tasks_mutex);
  LumenTask *task = lumen_tasks;
  pthread_mutex_unlock(&lumen_tasks_mutex);

  while (task) {
    if (task->started && !pthread_equal(task->thread, pthread_self())) {
      pthread_join(task->thread, NULL);
      task->started = 0;
    }
    task = task->next;
  }
}

static void lumen_task_register(LumenTask *task) {
  pthread_mutex_lock(&lumen_tasks_mutex);
  if (!lumen_task_cleanup_registered) {
    atexit(lumen_task_cleanup);
    lumen_task_cleanup_registered = 1;
  }
  task->next = lumen_tasks;
  lumen_tasks = task;
  pthread_mutex_unlock(&lumen_tasks_mutex);
}

static void *lumen_task_entry(void *raw_task) {
  LumenTask *task = raw_task;
  pthread_once(&lumen_task_key_once, lumen_task_make_key);
  pthread_setspecific(lumen_task_key, task);

  pthread_mutex_lock(&task->mutex);
  if (task->cancel_requested) {
    task->state = LUMEN_TASK_CANCELLED;
    task->error = "task cancelled";
    pthread_cond_broadcast(&task->changed);
    pthread_mutex_unlock(&task->mutex);
    return NULL;
  }
  task->state = LUMEN_TASK_RUNNING;
  pthread_mutex_unlock(&task->mutex);

  void *result = task->function(task->context);

  pthread_mutex_lock(&task->mutex);
  if (task->state != LUMEN_TASK_CANCELLED && task->state != LUMEN_TASK_FAILED) {
    task->result = result;
    task->state = LUMEN_TASK_COMPLETED;
  }
  pthread_cond_broadcast(&task->changed);
  pthread_mutex_unlock(&task->mutex);
  return NULL;
}

void *lumen_task_context_alloc(size_t size) {
  void *context = malloc(size);
  if (!context) {
    fputs("task error: cannot allocate task context\n", stderr);
    exit(1);
  }
  return context;
}

void *lumen_task_result_alloc(size_t size) {
  void *result = malloc(size);
  if (!result) {
    fputs("task error: cannot allocate task result\n", stderr);
    exit(1);
  }
  return result;
}

void *lumen_task_start(void *raw_function, void *context) {
  LumenTask *task = malloc(sizeof(LumenTask));
  if (!task) {
    fputs("task error: cannot allocate task\n", stderr);
    exit(1);
  }

  memset(task, 0, sizeof(LumenTask));
  task->function = (LumenTaskFunction)raw_function;
  task->context = context;
  task->state = LUMEN_TASK_PENDING;
  pthread_mutex_init(&task->mutex, NULL);
  pthread_cond_init(&task->changed, NULL);
  lumen_task_register(task);

  int code = pthread_create(&task->thread, NULL, lumen_task_entry, task);
  if (code != 0) {
    task->state = LUMEN_TASK_FAILED;
    task->error = "task thread could not start";
    return task;
  }

  task->started = 1;
  return task;
}

void *lumen_task_await(void *raw_task) {
  LumenTask *task = raw_task;
  if (!task) return NULL;

  pthread_mutex_lock(&task->mutex);
  while (task->state == LUMEN_TASK_PENDING || task->state == LUMEN_TASK_RUNNING) {
    pthread_cond_wait(&task->changed, &task->mutex);
  }
  void *result = task->result;
  pthread_mutex_unlock(&task->mutex);
  return result;
}

char *lumen_task_error(void *raw_task) {
  LumenTask *task = raw_task;
  if (!task) return "invalid task";

  pthread_mutex_lock(&task->mutex);
  const char *error = task->error;
  pthread_mutex_unlock(&task->mutex);
  return (char *)error;
}

void lumen_task_fail(const char *error) {
  pthread_once(&lumen_task_key_once, lumen_task_make_key);
  LumenTask *task = pthread_getspecific(lumen_task_key);
  if (!task) return;

  pthread_mutex_lock(&task->mutex);
  task->state = LUMEN_TASK_FAILED;
  task->error = error ? error : "task failed";
  pthread_cond_broadcast(&task->changed);
  pthread_mutex_unlock(&task->mutex);
}

void lumen_task_panic(const char *error) {
  fprintf(stderr, "task error: %s\n", error ? error : "unknown task error");
  exit(1);
}

_Bool lumen_task_cancel(void *raw_task) {
  LumenTask *task = raw_task;
  if (!task) return 0;

  pthread_mutex_lock(&task->mutex);
  if (task->state == LUMEN_TASK_COMPLETED ||
    task->state == LUMEN_TASK_CANCELLED ||
    task->state == LUMEN_TASK_FAILED) {
    pthread_mutex_unlock(&task->mutex);
    return 0;
  }

  task->cancel_requested = 1;
  task->state = LUMEN_TASK_CANCELLED;
  task->error = "task cancelled";
  pthread_cond_broadcast(&task->changed);
  pthread_mutex_unlock(&task->mutex);
  return 1;
}

_Bool lumen_task_cancelled(void) {
  pthread_once(&lumen_task_key_once, lumen_task_make_key);
  LumenTask *task = pthread_getspecific(lumen_task_key);
  if (!task) return 0;

  pthread_mutex_lock(&task->mutex);
  int cancelled = task->cancel_requested;
  pthread_mutex_unlock(&task->mutex);
  return cancelled != 0;
}
