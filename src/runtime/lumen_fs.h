#ifndef LUMEN_RUNTIME_FS_H
#define LUMEN_RUNTIME_FS_H

void *lumen_write_file(const char *path, const char *content);
void *lumen_read_file(const char *path);

#endif
