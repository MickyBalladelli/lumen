#include "runtime_internal.h"
#include "lumen_arena.h"

typedef enum LumenArenaSlotKind {
  LUMEN_ARENA_EMPTY,
  LUMEN_ARENA_STRING,
  LUMEN_ARENA_I32
} LumenArenaSlotKind;

typedef struct LumenArenaSlot {
  LumenArenaSlotKind kind;
  char *string_value;
  int i32_value;
} LumenArenaSlot;

typedef struct LumenArenaRecord {
  LumenArenaSlot *slots;
  int capacity;
} LumenArenaRecord;

typedef struct LumenArena {
  LumenArenaRecord *records;
  int count;
  int capacity;
} LumenArena;

static int arena_grow_records(LumenArena *arena) {
  int capacity = arena->capacity == 0 ? 8 : arena->capacity * 2;
  LumenArenaRecord *records = malloc(sizeof(LumenArenaRecord) * (size_t)capacity);
  if (!records) return 0;

  memset(records, 0, sizeof(LumenArenaRecord) * (size_t)capacity);
  if (arena->records) {
    memcpy(records, arena->records, sizeof(LumenArenaRecord) * (size_t)arena->count);
    free(arena->records);
  }

  arena->records = records;
  arena->capacity = capacity;
  return 1;
}

static int arena_grow_slots(LumenArenaRecord *record, int wanted) {
  int capacity = record->capacity == 0 ? 8 : record->capacity;
  while (capacity <= wanted) capacity *= 2;

  LumenArenaSlot *slots = malloc(sizeof(LumenArenaSlot) * (size_t)capacity);
  if (!slots) return 0;

  memset(slots, 0, sizeof(LumenArenaSlot) * (size_t)capacity);
  if (record->slots) {
    memcpy(slots, record->slots, sizeof(LumenArenaSlot) * (size_t)record->capacity);
    free(record->slots);
  }

  record->slots = slots;
  record->capacity = capacity;
  return 1;
}

static LumenArenaSlot *arena_slot(void *value, int record_index, int slot_index, int create) {
  LumenArena *arena = value;
  if (!arena || record_index < 0 || record_index >= arena->count || slot_index < 0) return NULL;

  LumenArenaRecord *record = &arena->records[record_index];
  if (slot_index >= record->capacity) {
    if (!create || !arena_grow_slots(record, slot_index)) return NULL;
  }

  return &record->slots[slot_index];
}

void *lumen_arena_new(void) {
  LumenArena *arena = malloc(sizeof(LumenArena));
  if (!arena) return NULL;

  arena->records = NULL;
  arena->count = 0;
  arena->capacity = 0;
  return arena;
}

int lumen_arena_append(void *value) {
  LumenArena *arena = value;
  if (!arena) return -1;

  if (arena->count == arena->capacity && !arena_grow_records(arena)) return -1;

  int index = arena->count;
  arena->records[index].slots = NULL;
  arena->records[index].capacity = 0;
  arena->count += 1;
  return index;
}

int lumen_arena_len(void *value) {
  LumenArena *arena = value;
  return arena ? arena->count : 0;
}

void lumen_arena_set_string(void *value, int record, int slot, const char *text) {
  LumenArenaSlot *target = arena_slot(value, record, slot, 1);
  if (!target) return;

  target->kind = LUMEN_ARENA_STRING;
  target->string_value = lumen_strdup(text ? text : "");
}

void lumen_arena_set_i32(void *value, int record, int slot, int number) {
  LumenArenaSlot *target = arena_slot(value, record, slot, 1);
  if (!target) return;

  target->kind = LUMEN_ARENA_I32;
  target->i32_value = number;
}

char *lumen_arena_get_string(void *value, int record, int slot) {
  LumenArenaSlot *target = arena_slot(value, record, slot, 0);
  if (!target || target->kind != LUMEN_ARENA_STRING || !target->string_value) return "";
  return target->string_value;
}

int lumen_arena_get_i32(void *value, int record, int slot) {
  LumenArenaSlot *target = arena_slot(value, record, slot, 0);
  if (!target || target->kind != LUMEN_ARENA_I32) return 0;
  return target->i32_value;
}
