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
  LumenSemaphore *semaphore = malloc(sizeof(LumenSemaphore));
  if (!semaphore) return NULL;

  pthread_mutex_init(&semaphore->mutex, NULL);
  pthread_cond_init(&semaphore->changed, NULL);
  semaphore->count = count;

  return semaphore;
}

static void lumen_semaphore_wait_internal(LumenSemaphore *semaphore) {
  pthread_mutex_lock(&semaphore->mutex);
  while (semaphore->count <= 0) {
    pthread_cond_wait(&semaphore->changed, &semaphore->mutex);
  }
  semaphore->count -= 1;
  pthread_mutex_unlock(&semaphore->mutex);
}

static void lumen_semaphore_signal_internal(LumenSemaphore *semaphore) {
  pthread_mutex_lock(&semaphore->mutex);
  semaphore->count += 1;
  pthread_cond_signal(&semaphore->changed);
  pthread_mutex_unlock(&semaphore->mutex);
}

void lumen_semaphore_wait(void *semaphore) {
  lumen_semaphore_wait_internal((LumenSemaphore *)semaphore);
}

void lumen_semaphore_signal(void *semaphore) {
  lumen_semaphore_signal_internal((LumenSemaphore *)semaphore);
}

int lumen_append_file(const char *path, const char *message) {
  FILE *file = fopen(path, "a");
  if (!file) return 1;

  fputs(message, file);
  fputc('\n', file);
  fclose(file);
  return 0;
}

static void *lumen_thread_entry(void *data) {
  LumenThreadJob *job = data;
  job->function(job->path, job->message, job->semaphore);
  return NULL;
}

void *lumen_thread_start(void *function, const char *path, const char *message, void *semaphore) {
  LumenThreadHandle *handle = malloc(sizeof(LumenThreadHandle));
  LumenThreadJob *job = malloc(sizeof(LumenThreadJob));

  if (!handle || !job) return NULL;

  job->function = (LumenThreadFunction)function;
  job->path = path;
  job->message = message;
  job->semaphore = semaphore;
  handle->job = job;

  if (pthread_create(&handle->thread, NULL, lumen_thread_entry, job) != 0) {
    free(job);
    free(handle);
    return NULL;
  }

  return handle;
}

int lumen_thread_join(void *raw_handle) {
  LumenThreadHandle *handle = raw_handle;
  if (!handle) return 1;

  pthread_join(handle->thread, NULL);
  free(handle->job);
  free(handle);
  return 0;
}
