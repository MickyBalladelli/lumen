#ifndef LUMEN_RUNTIME_THREAD_H
#define LUMEN_RUNTIME_THREAD_H

void *lumen_semaphore_create(int count);
void *lumen_semaphore_wait(void *semaphore);
void *lumen_semaphore_signal(void *semaphore);
void *lumen_append_file(const char *path, const char *message);
void *lumen_thread_start(void *function, const char *path, const char *message, void *semaphore);
void *lumen_thread_join(void *handle);

#endif
