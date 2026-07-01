#include "runtime_internal.h"
#include "lumen_thread.h"


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
  if (count < 0) return lumen_runtime_error("thread", EINVAL, "negative semaphore count");

  LumenSemaphore *semaphore = malloc(sizeof(LumenSemaphore));
  if (!semaphore) return lumen_runtime_error("thread", ENOMEM, "cannot allocate semaphore");

  int code = pthread_mutex_init(&semaphore->mutex, NULL);
  if (code != 0) {
    free(semaphore);
    return lumen_runtime_error("thread", code, "cannot initialize semaphore mutex");
  }
  code = pthread_cond_init(&semaphore->changed, NULL);
  if (code != 0) {
    pthread_mutex_destroy(&semaphore->mutex);
    free(semaphore);
    return lumen_runtime_error("thread", code, "cannot initialize semaphore condition");
  }
  semaphore->count = count;

  return lumen_ok_pointer(semaphore);
}

static int lumen_semaphore_wait_internal(LumenSemaphore *semaphore) {
  int code = pthread_mutex_lock(&semaphore->mutex);
  if (code != 0) return code;
  while (semaphore->count <= 0) {
    code = pthread_cond_wait(&semaphore->changed, &semaphore->mutex);
    if (code != 0) {
      pthread_mutex_unlock(&semaphore->mutex);
      return code;
    }
  }
  semaphore->count -= 1;
  return pthread_mutex_unlock(&semaphore->mutex);
}

static int lumen_semaphore_signal_internal(LumenSemaphore *semaphore) {
  int code = pthread_mutex_lock(&semaphore->mutex);
  if (code != 0) return code;
  semaphore->count += 1;
  code = pthread_cond_signal(&semaphore->changed);
  int unlock_code = pthread_mutex_unlock(&semaphore->mutex);
  return code != 0 ? code : unlock_code;
}

void *lumen_semaphore_wait(void *semaphore) {
  if (!semaphore) return lumen_runtime_error("thread", EINVAL, "invalid semaphore");
  int code = lumen_semaphore_wait_internal((LumenSemaphore *)semaphore);
  if (code != 0) return lumen_runtime_error("thread", code, "cannot wait on semaphore");
  return lumen_ok_i32(0);
}

void *lumen_semaphore_signal(void *semaphore) {
  if (!semaphore) return lumen_runtime_error("thread", EINVAL, "invalid semaphore");
  int code = lumen_semaphore_signal_internal((LumenSemaphore *)semaphore);
  if (code != 0) return lumen_runtime_error("thread", code, "cannot signal semaphore");
  return lumen_ok_i32(0);
}

void *lumen_append_file(const char *path, const char *message) {
  FILE *file = fopen(path, "a");
  if (!file) return lumen_runtime_error("thread", errno, "cannot open append file");

  int failed = fputs(message, file) == EOF || fputc('\n', file) == EOF;
  if (fclose(file) != 0) failed = 1;
  if (failed) {
    return lumen_runtime_error("thread", errno ? errno : EIO, "cannot append file");
  }
  return lumen_ok_i32(0);
}

static void *lumen_thread_entry(void *data) {
  LumenThreadJob *job = data;
  job->function(job->path, job->message, job->semaphore);
  return NULL;
}

void *lumen_thread_start(void *function, const char *path, const char *message, void *semaphore) {
  if (!function || !semaphore) {
    return lumen_runtime_error("thread", EINVAL, "invalid thread arguments");
  }

  LumenThreadHandle *handle = malloc(sizeof(LumenThreadHandle));
  LumenThreadJob *job = malloc(sizeof(LumenThreadJob));

  if (!handle || !job) {
    free(handle);
    free(job);
    return lumen_runtime_error("thread", ENOMEM, "cannot allocate thread");
  }

  job->function = (LumenThreadFunction)function;
  job->path = path;
  job->message = message;
  job->semaphore = semaphore;
  handle->job = job;

  int code = pthread_create(&handle->thread, NULL, lumen_thread_entry, job);
  if (code != 0) {
    free(job);
    free(handle);
    return lumen_runtime_error("thread", code, "cannot start thread");
  }

  return lumen_ok_pointer(handle);
}

void *lumen_thread_join(void *raw_handle) {
  LumenThreadHandle *handle = raw_handle;
  if (!handle) return lumen_runtime_error("thread", EINVAL, "invalid thread handle");

  int code = pthread_join(handle->thread, NULL);
  if (code != 0) return lumen_runtime_error("thread", code, "cannot join thread");
  free(handle->job);
  free(handle);
  return lumen_ok_i32(0);
}
