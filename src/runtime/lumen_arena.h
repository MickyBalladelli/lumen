#ifndef LUMEN_RUNTIME_ARENA_H
#define LUMEN_RUNTIME_ARENA_H

void *lumen_arena_new(void);
int lumen_arena_append(void *arena);
int lumen_arena_len(void *arena);
void lumen_arena_set_string(void *arena, int record, int slot, const char *value);
void lumen_arena_set_i32(void *arena, int record, int slot, int value);
char *lumen_arena_get_string(void *arena, int record, int slot);
int lumen_arena_get_i32(void *arena, int record, int slot);

#endif
