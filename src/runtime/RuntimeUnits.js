import { fileURLToPath } from 'node:url'

const unit = (name, symbols, dependencies = ['system']) => Object.freeze({
  name,
  source: fileURLToPath(new URL(`${name}.c`, import.meta.url)),
  symbols: Object.freeze(symbols),
  dependencies: Object.freeze(dependencies)
})

export const RuntimeUnits = Object.freeze([
  unit('system', [
    'lumen_alloc',
    'lumen_arg',
    'lumen_arg_count',
    'lumen_assert',
    'lumen_bounds_check',
    'lumen_channel',
    'lumen_date',
    'lumen_env',
    'lumen_err',
    'lumen_error_code',
    'lumen_error_message',
    'lumen_error_new',
    'lumen_error_text',
    'lumen_exec',
    'lumen_has_value',
    'lumen_is_ok',
    'lumen_none',
    'lumen_ok',
    'lumen_receive',
    'lumen_result_value',
    'lumen_send',
    'lumen_some',
    'lumen_uuid',
    'lumen_value_or'
  ], []),
  unit('fs', [
    'lumen_atomic_replace',
    'lumen_read_file',
    'lumen_remove_file',
    'lumen_write_file'
  ]),
  unit('collections', [
    'lumen_array_join',
    'lumen_json',
    'lumen_json_get',
    'lumen_json_get_raw',
    'lumen_json_set',
    'lumen_json_set_path',
    'lumen_json_stringify',
    'lumen_json_valid',
    'lumen_list',
    'lumen_list_get',
    'lumen_list_len',
    'lumen_list_push',
    'lumen_map',
    'lumen_map_delete',
    'lumen_map_get',
    'lumen_map_has',
    'lumen_map_keys',
    'lumen_map_set'
  ]),
  unit('arena', [
    'lumen_arena_append',
    'lumen_arena_get_i32',
    'lumen_arena_get_string',
    'lumen_arena_len',
    'lumen_arena_new',
    'lumen_arena_set_i32',
    'lumen_arena_set_string'
  ]),
  unit('string', [
    'lumen_int_to_string',
    'lumen_parse_f32',
    'lumen_parse_summary',
    'lumen_source_snippet',
    'lumen_string_at',
    'lumen_string_builder',
    'lumen_string_builder_append',
    'lumen_string_concat',
    'lumen_string_contains',
    'lumen_string_ends_with',
    'lumen_string_equals',
    'lumen_string_index_of',
    'lumen_string_last_index_of',
    'lumen_string_len',
    'lumen_string_lower',
    'lumen_string_pad_end',
    'lumen_string_pad_start',
    'lumen_string_repeat',
    'lumen_string_replace',
    'lumen_string_slice',
    'lumen_string_split',
    'lumen_string_starts_with',
    'lumen_string_to_int',
    'lumen_string_trim',
    'lumen_string_upper',
    'lumen_tokenize_source'
  ], ['system', 'collections']),
  unit('crypto', [
    'lumen_decrypt',
    'lumen_encrypt'
  ]),
  unit('thread', [
    'lumen_append_file',
    'lumen_semaphore_create',
    'lumen_semaphore_signal',
    'lumen_semaphore_wait',
    'lumen_thread_join',
    'lumen_thread_start'
  ]),
  unit('task', [
    'lumen_task_await',
    'lumen_task_cancel',
    'lumen_task_cancelled',
    'lumen_task_context_alloc',
    'lumen_task_error',
    'lumen_task_fail',
    'lumen_task_panic',
    'lumen_task_result_alloc',
    'lumen_task_start'
  ]),
  unit('http', [
    'lumen_http_request',
    'lumen_http_response',
    'lumen_http_serve_api',
    'lumen_http_serve_files',
    'lumen_http_serve_http',
    'lumen_socketio_emit',
    'lumen_socketio_event',
    'lumen_socketio_serve_chat'
  ])
])

const unitByName = new Map(RuntimeUnits.map(runtimeUnit => [runtimeUnit.name, runtimeUnit]))
const unitBySymbol = new Map(RuntimeUnits.flatMap(runtimeUnit =>
  runtimeUnit.symbols.map(symbol => [symbol, runtimeUnit])
))

export function runtimeUnitsForLLVM(llvm) {
  const selected = new Set()

  for (const match of llvm.matchAll(/@([A-Za-z_][A-Za-z0-9_]*)/g)) {
    const runtimeUnit = unitBySymbol.get(match[1])
    if (runtimeUnit) select(runtimeUnit, selected)
  }

  return RuntimeUnits.filter(runtimeUnit => selected.has(runtimeUnit.name))
}

export function runtimeSourcesForLLVM(llvm) {
  return runtimeUnitsForLLVM(llvm).map(runtimeUnit => runtimeUnit.source)
}

function select(runtimeUnit, selected) {
  if (selected.has(runtimeUnit.name)) return
  selected.add(runtimeUnit.name)

  for (const dependency of runtimeUnit.dependencies) {
    select(unitByName.get(dependency), selected)
  }
}
