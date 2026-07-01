#ifndef LUMEN_RUNTIME_COLLECTIONS_H
#define LUMEN_RUNTIME_COLLECTIONS_H

char *lumen_list(void);
char *lumen_list_push(const char *list, const char *value);
char *lumen_list_get(const char *list, int index);
int lumen_list_len(const char *list);
char *lumen_json(const char *value);
char *lumen_json_get(const char *json, const char *key);
char *lumen_json_get_raw(const char *json, const char *key);
char *lumen_json_set(const char *json, const char *key, const char *value);
char *lumen_json_set_path(const char *json, const char *key, const char *value);
char *lumen_json_stringify(const char *value);
_Bool lumen_json_valid(const char *value);
char *lumen_array_join(int count, const char **values, const char *separator);
char *lumen_map(int count, ...);
char *lumen_map_set(const char *map, const char *key, const char *value);
char *lumen_map_delete(const char *map, const char *key);
char *lumen_map_keys(const char *map);
char *lumen_map_get(const char *map, const char *key);
_Bool lumen_map_has(const char *map, const char *key);

#endif
