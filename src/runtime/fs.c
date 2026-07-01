#include "runtime_internal.h"
#include "lumen_fs.h"

int lumen_write_file(const char *path, const char *content) {
  FILE *file = fopen(path, "wb");
  if (!file) return 1;

  size_t length = strlen(content);
  size_t written = fwrite(content, 1, length, file);
  fclose(file);
  return written == length ? 0 : 1;
}

char *lumen_read_file(const char *path) {
  FILE *file = fopen(path, "rb");
  if (!file) return lumen_strdup("");

  fseek(file, 0, SEEK_END);
  long size = ftell(file);
  fseek(file, 0, SEEK_SET);

  char *source = malloc((size_t)size + 1);
  if (!source) {
    fclose(file);
    return lumen_strdup("");
  }

  size_t bytes_read = fread(source, 1, (size_t)size, file);
  source[bytes_read] = '\0';
  fclose(file);
  return source;
}
