#include "runtime_internal.h"
#include "lumen_fs.h"

void *lumen_write_file(const char *path, const char *content) {
  FILE *file = fopen(path, "wb");
  if (!file) return lumen_runtime_error("file", errno, "cannot open file for writing");

  size_t length = strlen(content);
  size_t written = fwrite(content, 1, length, file);
  int close_result = fclose(file);
  if (written != length || close_result != 0) {
    return lumen_runtime_error("file", errno ? errno : EIO, "cannot write complete file");
  }
  return lumen_ok_i32(0);
}

void *lumen_read_file(const char *path) {
  FILE *file = fopen(path, "rb");
  if (!file) return lumen_runtime_error("file", errno, "cannot open file for reading");

  if (fseek(file, 0, SEEK_END) != 0) {
    int code = errno;
    fclose(file);
    return lumen_runtime_error("file", code, "cannot seek file");
  }
  long size = ftell(file);
  if (size < 0 || fseek(file, 0, SEEK_SET) != 0) {
    int code = errno;
    fclose(file);
    return lumen_runtime_error("file", code, "cannot measure file");
  }

  char *source = malloc((size_t)size + 1);
  if (!source) {
    fclose(file);
    return lumen_runtime_error("file", ENOMEM, "cannot allocate file buffer");
  }

  size_t bytes_read = fread(source, 1, (size_t)size, file);
  if (bytes_read != (size_t)size && ferror(file)) {
    int code = errno;
    fclose(file);
    return lumen_runtime_error("file", code ? code : EIO, "cannot read complete file");
  }
  source[bytes_read] = '\0';
  fclose(file);
  return lumen_ok(source);
}

void *lumen_atomic_replace(const char *source, const char *destination) {
  if (rename(source, destination) != 0) {
    return lumen_runtime_error("file", errno, "cannot publish file atomically");
  }
  return lumen_ok_i32(0);
}

void *lumen_remove_file(const char *path) {
  if (unlink(path) != 0 && errno != ENOENT) {
    return lumen_runtime_error("file", errno, "cannot remove file");
  }
  return lumen_ok_i32(0);
}
