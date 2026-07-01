#ifndef LUMEN_RUNTIME_FS_H
#define LUMEN_RUNTIME_FS_H

int lumen_write_file(const char *path, const char *content);
char *lumen_read_file(const char *path);

#endif
