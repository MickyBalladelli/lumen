/**
 * @typedef {object} RuntimeSignature
 * @property {string} flag
 * @property {string} symbol
 * @property {string} returnType
 * @property {string[]} parameters
 * @property {boolean} [variadic]
 *
 * @typedef {object} BuiltinSignature
 * @property {string} key
 * @property {string} module
 * @property {string} name
 * @property {string[]} parameters
 * @property {string} returnType
 * @property {boolean} [variadic]
 * @property {number} minArity
 * @property {number|null} maxArity
 * @property {string} [runtime]
 * @property {'runtime'|'custom'} lowering
 */

const runtime = (flag, symbol, returnType, parameters = [], variadic = false) => Object.freeze({
  flag,
  symbol,
  returnType,
  parameters: Object.freeze(parameters),
  variadic
})

export const RuntimeSignatures = Object.freeze([
  runtime('usesPrintf', 'printf', 'i32', ['ptr'], true),
  runtime('usesStrstr', 'strstr', 'ptr', ['ptr', 'ptr']),
  runtime('usesStrcmp', 'strcmp', 'i32', ['ptr', 'ptr']),
  runtime('usesFileIO', 'fopen', 'ptr', ['ptr', 'ptr']),
  runtime('usesFileIO', 'fseek', 'i32', ['ptr', 'i64', 'i32']),
  runtime('usesFileIO', 'ftell', 'i64', ['ptr']),
  runtime('usesFileIO', 'fread', 'i64', ['ptr', 'i64', 'i64', 'ptr']),
  runtime('usesFileIO', 'fwrite', 'i64', ['ptr', 'i64', 'i64', 'ptr']),
  runtime('usesFileIO', 'lumen_alloc', 'ptr', ['i64']),
  runtime('usesFileIO', 'fclose', 'i32', ['ptr']),
  runtime('usesFileIO', 'lumen_read_file', 'ptr', ['ptr']),
  runtime('usesFileIO', 'lumen_write_file', 'ptr', ['ptr', 'ptr']),
  runtime('usesFileIO', 'lumen_atomic_replace', 'ptr', ['ptr', 'ptr']),
  runtime('usesFileIO', 'lumen_remove_file', 'ptr', ['ptr']),
  runtime('usesAssert', 'lumen_assert', 'void', ['i1', 'ptr']),
  runtime('usesSlice', 'lumen_string_slice', 'ptr', ['ptr', 'i32', 'i32']),
  runtime('usesBounds', 'lumen_bounds_check', 'i32', ['i32', 'i32']),
  runtime('usesBounds', 'lumen_string_at', 'ptr', ['ptr', 'i32']),
  runtime('usesChannel', 'lumen_channel', 'ptr'),
  runtime('usesChannel', 'lumen_send', 'void', ['ptr', 'ptr']),
  runtime('usesChannel', 'lumen_receive', 'ptr', ['ptr']),
  runtime('usesUuid', 'lumen_uuid', 'ptr'),
  runtime('usesDate', 'lumen_date', 'ptr'),
  runtime('usesEnv', 'lumen_env', 'ptr', ['ptr']),
  runtime('usesCrypto', 'lumen_encrypt', 'ptr', ['ptr', 'ptr', 'ptr']),
  runtime('usesCrypto', 'lumen_decrypt', 'ptr', ['ptr', 'ptr', 'ptr']),
  runtime('usesArgs', 'lumen_arg', 'ptr', ['i32']),
  runtime('usesArgs', 'lumen_arg_count', 'ptr'),
  runtime('usesMaps', 'lumen_map', 'ptr', ['i32'], true),
  runtime('usesMaps', 'lumen_map_get', 'ptr', ['ptr', 'ptr']),
  runtime('usesMaps', 'lumen_map_has', 'i1', ['ptr', 'ptr']),
  runtime('usesResults', 'lumen_ok', 'ptr', ['ptr']),
  runtime('usesResults', 'lumen_err', 'ptr', ['ptr']),
  runtime('usesResults', 'lumen_is_ok', 'i1', ['ptr']),
  runtime('usesResults', 'lumen_result_value', 'ptr', ['ptr']),
  runtime('usesResults', 'lumen_error_message', 'ptr', ['ptr']),
  runtime('usesOptions', 'lumen_some', 'ptr', ['ptr']),
  runtime('usesOptions', 'lumen_none', 'ptr'),
  runtime('usesOptions', 'lumen_has_value', 'i1', ['ptr']),
  runtime('usesOptions', 'lumen_value_or', 'ptr', ['ptr', 'ptr']),
  runtime('usesStringRuntime', 'lumen_string_concat', 'ptr', ['ptr', 'ptr']),
  runtime('usesJsonRuntime', 'lumen_json', 'ptr', ['ptr']),
  runtime('usesJsonRuntime', 'lumen_json_get', 'ptr', ['ptr', 'ptr']),
  runtime('usesJsonRuntime', 'lumen_json_get_raw', 'ptr', ['ptr', 'ptr']),
  runtime('usesJsonRuntime', 'lumen_json_set', 'ptr', ['ptr', 'ptr', 'ptr']),
  runtime('usesJsonRuntime', 'lumen_json_set_path', 'ptr', ['ptr', 'ptr', 'ptr']),
  runtime('usesJsonRuntime', 'lumen_json_stringify', 'ptr', ['ptr']),
  runtime('usesJsonRuntime', 'lumen_json_valid', 'ptr', ['ptr']),
  runtime('usesErrorRuntime', 'lumen_error_new', 'ptr', ['i32', 'ptr']),
  runtime('usesErrorRuntime', 'lumen_error_code', 'i32', ['ptr']),
  runtime('usesErrorRuntime', 'lumen_error_text', 'ptr', ['ptr']),
  runtime('usesArrayRuntime', 'lumen_array_join', 'ptr', ['i32', 'ptr', 'ptr']),
  runtime('usesProcess', 'lumen_exec', 'ptr', ['ptr', 'ptr', 'i32']),
  runtime('usesProcess', 'lumen_lsp_read_message', 'ptr'),
  runtime('usesProcess', 'lumen_lsp_write_message', 'void', ['ptr']),
  runtime('usesProcess', 'lumen_stdout_write', 'void', ['ptr']),
  runtime('usesStringRuntime', 'lumen_source_snippet', 'ptr', ['ptr', 'i32', 'i32']),
  runtime('usesStringRuntime', 'lumen_string_builder', 'ptr'),
  runtime('usesStringRuntime', 'lumen_string_builder_append', 'ptr', ['ptr', 'ptr']),
  runtime('usesStringRuntime', 'lumen_string_len', 'i32', ['ptr']),
  runtime('usesStringRuntime', 'lumen_string_equals', 'i1', ['ptr', 'ptr']),
  runtime('usesStringRuntime', 'lumen_string_trim', 'ptr', ['ptr']),
  runtime('usesStringRuntime', 'lumen_string_lower', 'ptr', ['ptr']),
  runtime('usesStringRuntime', 'lumen_string_upper', 'ptr', ['ptr']),
  runtime('usesStringRuntime', 'lumen_string_starts_with', 'i1', ['ptr', 'ptr']),
  runtime('usesStringRuntime', 'lumen_string_ends_with', 'i1', ['ptr', 'ptr']),
  runtime('usesStringRuntime', 'lumen_string_replace', 'ptr', ['ptr', 'ptr', 'ptr']),
  runtime('usesStringRuntime', 'lumen_string_split', 'ptr', ['ptr', 'ptr']),
  runtime('usesStringRuntime', 'lumen_string_index_of', 'i32', ['ptr', 'ptr']),
  runtime('usesStringRuntime', 'lumen_string_last_index_of', 'i32', ['ptr', 'ptr']),
  runtime('usesStringRuntime', 'lumen_string_contains', 'i1', ['ptr', 'ptr']),
  runtime('usesStringRuntime', 'lumen_string_repeat', 'ptr', ['ptr', 'i32']),
  runtime('usesStringRuntime', 'lumen_string_pad_start', 'ptr', ['ptr', 'i32', 'ptr']),
  runtime('usesStringRuntime', 'lumen_string_pad_end', 'ptr', ['ptr', 'i32', 'ptr']),
  runtime('usesStringRuntime', 'lumen_int_to_string', 'ptr', ['i32']),
  runtime('usesStringRuntime', 'lumen_string_to_int', 'i32', ['ptr']),
  runtime('usesStringRuntime', 'lumen_parse_f32', 'float', ['ptr']),
  runtime('usesStringRuntime', 'lumen_list', 'ptr'),
  runtime('usesStringRuntime', 'lumen_list_push', 'ptr', ['ptr', 'ptr']),
  runtime('usesStringRuntime', 'lumen_list_get', 'ptr', ['ptr', 'i32']),
  runtime('usesStringRuntime', 'lumen_list_len', 'i32', ['ptr']),
  runtime('usesStringRuntime', 'lumen_map_set', 'ptr', ['ptr', 'ptr', 'ptr']),
  runtime('usesStringRuntime', 'lumen_map_delete', 'ptr', ['ptr', 'ptr']),
  runtime('usesStringRuntime', 'lumen_map_keys', 'ptr', ['ptr']),
  runtime('usesArenaRuntime', 'lumen_arena_new', 'ptr'),
  runtime('usesArenaRuntime', 'lumen_arena_append', 'i32', ['ptr']),
  runtime('usesArenaRuntime', 'lumen_arena_len', 'i32', ['ptr']),
  runtime('usesArenaRuntime', 'lumen_arena_set_string', 'void', ['ptr', 'i32', 'i32', 'ptr']),
  runtime('usesArenaRuntime', 'lumen_arena_set_i32', 'void', ['ptr', 'i32', 'i32', 'i32']),
  runtime('usesArenaRuntime', 'lumen_arena_get_string', 'ptr', ['ptr', 'i32', 'i32']),
  runtime('usesArenaRuntime', 'lumen_arena_get_i32', 'i32', ['ptr', 'i32', 'i32']),
  runtime('usesStringRuntime', 'lumen_tokenize_source', 'ptr', ['ptr']),
  runtime('usesStringRuntime', 'lumen_parse_summary', 'ptr', ['ptr']),
  runtime('usesHttp', 'lumen_http_serve_files', 'ptr', ['i32', 'ptr']),
  runtime('usesHttp', 'lumen_http_serve_api', 'ptr', ['i32', 'ptr', 'ptr', 'ptr', 'ptr']),
  runtime('usesHttp', 'lumen_http_serve_http', 'ptr', ['i32', 'ptr', 'ptr', 'ptr', 'ptr', 'ptr', 'i32']),
  runtime('usesHttp', 'lumen_socketio_serve_chat', 'ptr', ['i32', 'ptr']),
  runtime('usesHttp', 'lumen_socketio_event', 'ptr', ['ptr', 'ptr']),
  runtime('usesHttp', 'lumen_socketio_emit', 'ptr', ['ptr', 'ptr', 'ptr']),
  runtime('usesHttp', 'lumen_http_request', 'ptr', ['ptr', 'ptr', 'ptr']),
  runtime('usesHttp', 'lumen_http_response', 'ptr', ['i32', 'ptr', 'ptr']),
  runtime('usesThread', 'lumen_semaphore_create', 'ptr', ['i32']),
  runtime('usesThread', 'lumen_semaphore_wait', 'ptr', ['ptr']),
  runtime('usesThread', 'lumen_semaphore_signal', 'ptr', ['ptr']),
  runtime('usesThread', 'lumen_thread_start', 'ptr', ['ptr', 'ptr', 'ptr', 'ptr']),
  runtime('usesThread', 'lumen_thread_join', 'ptr', ['ptr']),
  runtime('usesThread', 'lumen_append_file', 'ptr', ['ptr', 'ptr']),
  runtime('usesTask', 'lumen_task_context_alloc', 'ptr', ['i64']),
  runtime('usesTask', 'lumen_task_result_alloc', 'ptr', ['i64']),
  runtime('usesTask', 'lumen_task_start', 'ptr', ['ptr', 'ptr']),
  runtime('usesTask', 'lumen_task_await', 'ptr', ['ptr']),
  runtime('usesTask', 'lumen_task_error', 'ptr', ['ptr']),
  runtime('usesTask', 'lumen_task_fail', 'void', ['ptr']),
  runtime('usesTask', 'lumen_task_panic', 'void', ['ptr']),
  runtime('usesTask', 'lumen_task_cancel', 'i1', ['ptr']),
  runtime('usesTask', 'lumen_task_cancelled', 'i1')
])

const runtimeBySymbol = new Map(RuntimeSignatures.map(signature => [signature.symbol, signature]))

const builtin = (key, module, name, parameters, returnType, options = {}) => Object.freeze({
  key,
  module,
  name,
  parameters: Object.freeze(parameters),
  returnType,
  variadic: options.variadic ?? false,
  minArity: options.minArity ?? (options.variadic ? 0 : parameters.length),
  maxArity: options.maxArity ?? (options.variadic ? null : parameters.length),
  runtime: options.runtime,
  lowering: options.lowering ?? 'custom'
})

const direct = (key, module, name, parameters, returnType, symbol) => {
  if (!runtimeBySymbol.has(symbol)) throw new Error(`Unknown runtime symbol ${symbol}`)
  return builtin(key, module, name, parameters, returnType, {
    runtime: symbol,
    lowering: 'runtime'
  })
}

export const BuiltinSignatures = Object.freeze([
  builtin('Println', 'system', 'println', ['any'], 'void'),
  builtin('Len', 'system', 'len', ['collection'], 'i32'),
  builtin('Min', 'system', 'min', ['number', 'number'], 'number'),
  builtin('Max', 'system', 'max', ['number', 'number'], 'number'),
  builtin('Filter', 'system', 'filter', ['T[]', '(T) -> bool'], 'T[]'),
  builtin('Includes', 'system', 'includes', ['collection', 'T'], 'bool'),
  builtin('Uuid', 'system', 'uuid', [], 'string', { runtime: 'lumen_uuid' }),
  builtin('Date', 'system', 'date', [], 'string', { runtime: 'lumen_date' }),
  builtin('Env', 'system', 'env', ['string'], 'Result<string>', { runtime: 'lumen_env' }),
  builtin('Encrypt', 'system', 'encrypt', ['string', 'string', 'string'], 'Result<string>', {
    runtime: 'lumen_encrypt',
    minArity: 2,
    maxArity: 3
  }),
  builtin('Decrypt', 'system', 'decrypt', ['string', 'string', 'string'], 'Result<string>', {
    runtime: 'lumen_decrypt',
    minArity: 2,
    maxArity: 3
  }),
  builtin('Arg', 'system', 'arg', ['i32'], 'Result<string>', { runtime: 'lumen_arg' }),
  builtin('ArgCount', 'system', 'argCount', [], 'Result<i32>', { runtime: 'lumen_arg_count' }),
  builtin('Map', 'system', 'map', ['string'], 'string', { variadic: true, runtime: 'lumen_map' }),
  direct('MapGet', 'system', 'mapGet', ['string', 'string'], 'string', 'lumen_map_get'),
  direct('MapHas', 'system', 'mapHas', ['string', 'string'], 'bool', 'lumen_map_has'),
  builtin('Ok', 'system', 'ok', ['T'], 'Result<T>', { runtime: 'lumen_ok' }),
  builtin('Err', 'system', 'err', ['string'], 'Result<unknown>', { runtime: 'lumen_err' }),
  direct('IsOk', 'system', 'isOk', ['Result<T>'], 'bool', 'lumen_is_ok'),
  builtin('ResultValue', 'system', 'resultValue', ['Result<T>'], 'T', { runtime: 'lumen_result_value' }),
  direct('ErrorMessage', 'system', 'errorMessage', ['Result<T>'], 'string', 'lumen_error_message'),
  builtin('Some', 'system', 'some', ['T'], 'T?', { runtime: 'lumen_some' }),
  builtin('None', 'system', 'none', [], 'unknown', { runtime: 'lumen_none' }),
  direct('HasValue', 'system', 'hasValue', ['T?'], 'bool', 'lumen_has_value'),
  builtin('ValueOr', 'system', 'valueOr', ['T?', 'T'], 'T', { runtime: 'lumen_value_or' }),
  builtin('Assert', 'system', 'assert', ['bool', 'string'], 'void', { runtime: 'lumen_assert' }),
  builtin('Channel', 'system', 'channel', [], 'string', { runtime: 'lumen_channel' }),
  builtin('Send', 'system', 'send', ['string', 'string'], 'void', { runtime: 'lumen_send' }),
  builtin('Receive', 'system', 'receive', ['string'], 'string', { runtime: 'lumen_receive' }),
  direct('Json', 'system', 'json', ['string'], 'Result<json>', 'lumen_json'),
  direct('JsonGet', 'system', 'jsonGet', ['json', 'string'], 'Result<string>', 'lumen_json_get'),
  direct('JsonGetRaw', 'system', 'jsonGetRaw', ['json', 'string'], 'Result<string>', 'lumen_json_get_raw'),
  direct('JsonSet', 'system', 'jsonSet', ['json', 'string', 'string'], 'Result<json>', 'lumen_json_set'),
  direct('JsonSetPath', 'system', 'jsonSetPath', ['json', 'string', 'string'], 'Result<json>', 'lumen_json_set_path'),
  direct('JsonQuote', 'system', 'jsonQuote', ['string'], 'Result<string>', 'lumen_json_stringify'),
  direct('JsonStringify', 'system', 'jsonStringify', ['json'], 'Result<string>', 'lumen_json_stringify'),
  direct('JsonValid', 'system', 'jsonValid', ['any'], 'Result<bool>', 'lumen_json_valid'),
  builtin('NewError', 'system', 'newError', ['i32', 'string'], 'error', { runtime: 'lumen_error_new' }),
  direct('ErrorCode', 'system', 'errorCode', ['error'], 'i32', 'lumen_error_code'),
  direct('ErrorText', 'system', 'errorText', ['error'], 'string', 'lumen_error_text'),
  builtin('ArraySum', 'system', 'arraySum', ['number[]'], 'i32'),
  builtin('ArrayFirst', 'system', 'arrayFirst', ['T[]'], 'T'),
  builtin('ArrayLast', 'system', 'arrayLast', ['T[]'], 'T'),
  builtin('ArrayJoin', 'system', 'arrayJoin', ['string[]', 'string'], 'string', { runtime: 'lumen_array_join' }),
  builtin('Exec', 'system', 'exec', ['string', 'string[]'], 'Result<i32>', {
    runtime: 'lumen_exec'
  }),
  direct('ReadMessage', 'system', 'readMessage', [], 'string', 'lumen_lsp_read_message'),
  direct('WriteMessage', 'system', 'writeMessage', ['string'], 'void', 'lumen_lsp_write_message'),
  direct('WriteStdout', 'system', 'writeStdout', ['string'], 'void', 'lumen_stdout_write'),
  builtin('SourceSnippet', 'system', 'sourceSnippet', ['string', 'i32', 'i32'], 'string', { runtime: 'lumen_source_snippet' }),
  direct('StringBuilder', 'system', 'stringBuilder', [], 'string', 'lumen_string_builder'),
  direct('StringBuilderAppend', 'system', 'stringBuilderAppend', ['string', 'string'], 'string', 'lumen_string_builder_append'),
  direct('StringLen', 'system', 'stringLen', ['string'], 'i32', 'lumen_string_len'),
  direct('StringEquals', 'system', 'stringEquals', ['string', 'string'], 'bool', 'lumen_string_equals'),
  direct('Trim', 'system', 'trim', ['string'], 'string', 'lumen_string_trim'),
  direct('Lower', 'system', 'lower', ['string'], 'string', 'lumen_string_lower'),
  direct('Upper', 'system', 'upper', ['string'], 'string', 'lumen_string_upper'),
  direct('StartsWith', 'system', 'startsWith', ['string', 'string'], 'bool', 'lumen_string_starts_with'),
  direct('EndsWith', 'system', 'endsWith', ['string', 'string'], 'bool', 'lumen_string_ends_with'),
  direct('Replace', 'system', 'replace', ['string', 'string', 'string'], 'string', 'lumen_string_replace'),
  direct('Split', 'system', 'split', ['string', 'string'], 'string', 'lumen_string_split'),
  direct('IndexOf', 'system', 'indexOf', ['string', 'string'], 'i32', 'lumen_string_index_of'),
  direct('LastIndexOf', 'system', 'lastIndexOf', ['string', 'string'], 'i32', 'lumen_string_last_index_of'),
  direct('Contains', 'system', 'contains', ['string', 'string'], 'bool', 'lumen_string_contains'),
  builtin('Repeat', 'system', 'repeat', ['string', 'i32'], 'string', { runtime: 'lumen_string_repeat' }),
  builtin('PadStart', 'system', 'padStart', ['string', 'i32', 'string'], 'string', { runtime: 'lumen_string_pad_start' }),
  builtin('PadEnd', 'system', 'padEnd', ['string', 'i32', 'string'], 'string', { runtime: 'lumen_string_pad_end' }),
  builtin('IntToString', 'system', 'intToString', ['i32'], 'string', { runtime: 'lumen_int_to_string' }),
  direct('StringToInt', 'system', 'stringToInt', ['string'], 'i32', 'lumen_string_to_int'),
  direct('ParseI32', 'system', 'parseI32', ['string'], 'i32', 'lumen_string_to_int'),
  direct('ParseF32', 'system', 'parseF32', ['string'], 'f32', 'lumen_parse_f32'),
  direct('List', 'system', 'list', [], 'string', 'lumen_list'),
  direct('ListPush', 'system', 'listPush', ['string', 'string'], 'string', 'lumen_list_push'),
  builtin('ListGet', 'system', 'listGet', ['string', 'i32'], 'string', { runtime: 'lumen_list_get' }),
  direct('ListLen', 'system', 'listLen', ['string'], 'i32', 'lumen_list_len'),
  direct('MapSet', 'system', 'mapSet', ['string', 'string', 'string'], 'string', 'lumen_map_set'),
  direct('MapDelete', 'system', 'mapDelete', ['string', 'string'], 'string', 'lumen_map_delete'),
  direct('MapKeys', 'system', 'mapKeys', ['string'], 'string', 'lumen_map_keys'),
  direct('ArenaNew', 'system', 'arenaNew', [], 'string', 'lumen_arena_new'),
  direct('ArenaAppend', 'system', 'arenaAppend', ['string'], 'i32', 'lumen_arena_append'),
  direct('ArenaLen', 'system', 'arenaLen', ['string'], 'i32', 'lumen_arena_len'),
  direct('ArenaSetString', 'system', 'arenaSetString', ['string', 'i32', 'i32', 'string'], 'void', 'lumen_arena_set_string'),
  direct('ArenaSetI32', 'system', 'arenaSetI32', ['string', 'i32', 'i32', 'i32'], 'void', 'lumen_arena_set_i32'),
  direct('ArenaGetString', 'system', 'arenaGetString', ['string', 'i32', 'i32'], 'string', 'lumen_arena_get_string'),
  direct('ArenaGetI32', 'system', 'arenaGetI32', ['string', 'i32', 'i32'], 'i32', 'lumen_arena_get_i32'),
  direct('TokenizeSource', 'system', 'tokenizeSource', ['string'], 'string', 'lumen_tokenize_source'),
  direct('ParseSummary', 'system', 'parseSummary', ['string'], 'string', 'lumen_parse_summary'),
  direct('ReadFile', 'fs', 'readFile', ['string'], 'Result<string>', 'lumen_read_file'),
  builtin('WriteFile', 'fs', 'writeFile', ['string', 'string'], 'Result<i32>', { runtime: 'lumen_write_file' }),
  direct('AtomicReplace', 'fs', 'atomicReplace', ['string', 'string'], 'Result<i32>', 'lumen_atomic_replace'),
  direct('RemoveFile', 'fs', 'removeFile', ['string'], 'Result<i32>', 'lumen_remove_file'),
  builtin('ServeFiles', 'http', 'serveFiles', ['i32', 'string'], 'Result<i32>', { runtime: 'lumen_http_serve_files' }),
  builtin('ServeApi', 'http', 'serveApi', ['i32', 'string', 'string', 'string', 'string'], 'Result<i32>', { runtime: 'lumen_http_serve_api' }),
  builtin('ServeHttp', 'http', 'serveHttp', ['i32', 'string', 'string[]', 'string[]', 'string[]', 'string[]'], 'Result<i32>', { runtime: 'lumen_http_serve_http' }),
  builtin('ServeSocketIoChat', 'http', 'serveSocketIoChat', ['i32', 'string'], 'Result<i32>', { runtime: 'lumen_socketio_serve_chat' }),
  builtin('SocketIoEvent', 'http', 'socketIoEvent', ['string', 'string'], 'Result<string>', { runtime: 'lumen_socketio_event' }),
  builtin('SocketIoEmit', 'http', 'socketIoEmit', ['string', 'string', 'string'], 'Result<string>', { runtime: 'lumen_socketio_emit' }),
  builtin('HttpRequest', 'http', 'httpRequest', ['string', 'string', 'string'], 'Result<string>', { runtime: 'lumen_http_request' }),
  builtin('HttpResponse', 'http', 'httpResponse', ['i32', 'string', 'string'], 'Result<string>', { runtime: 'lumen_http_response' }),
  builtin('CreateSemaphore', 'thread', 'createSemaphore', ['i32'], 'Result<semaphore>', { runtime: 'lumen_semaphore_create' }),
  builtin('SemaphoreWait', 'thread', 'semaphoreWait', ['semaphore'], 'Result<i32>', { runtime: 'lumen_semaphore_wait' }),
  builtin('SemaphoreSignal', 'thread', 'semaphoreSignal', ['semaphore'], 'Result<i32>', { runtime: 'lumen_semaphore_signal' }),
  builtin('StartThread', 'thread', 'startThread', ['function', 'string', 'string', 'semaphore'], 'Result<thread>', { runtime: 'lumen_thread_start' }),
  builtin('JoinThread', 'thread', 'joinThread', ['thread'], 'Result<i32>', { runtime: 'lumen_thread_join' }),
  builtin('AppendFile', 'thread', 'appendFile', ['string', 'string'], 'Result<i32>', { runtime: 'lumen_append_file' }),
  direct('TaskCancel', 'system', 'taskCancel', ['Task<T>'], 'bool', 'lumen_task_cancel'),
  direct('TaskCancelled', 'system', 'taskCancelled', [], 'bool', 'lumen_task_cancelled')
])

const builtinsByName = new Map(BuiltinSignatures.map(signature => [signature.name, signature]))

export function builtinSignature(name) {
  return builtinsByName.get(name) ?? null
}

export function builtinsForModule(moduleName) {
  return BuiltinSignatures.filter(signature => signature.module === moduleName)
}

export function functionNames(moduleName) {
  return builtinsForModule(moduleName).map(signature => signature.name)
}

export function functionConstants(moduleName) {
  return Object.freeze(Object.fromEntries(
    builtinsForModule(moduleName).map(signature => [signature.key, signature.name])
  ))
}

export function runtimeSignature(symbol) {
  return runtimeBySymbol.get(symbol) ?? null
}

export function llvmDeclaration(signature) {
  const parameters = [
    ...signature.parameters,
    ...(signature.variadic ? ['...'] : [])
  ].join(', ')
  return `declare ${signature.returnType} @${signature.symbol}(${parameters})`
}

export function validateBuiltinRegistry(runtimeSources = [], emitterSources = []) {
  const errors = []
  const names = new Set()
  const keys = new Set()
  const symbols = new Set()

  for (const signature of RuntimeSignatures) {
    if (symbols.has(signature.symbol)) errors.push(`Duplicate runtime symbol ${signature.symbol}`)
    symbols.add(signature.symbol)
  }

  for (const signature of BuiltinSignatures) {
    if (names.has(signature.name)) errors.push(`Duplicate built-in name ${signature.name}`)
    names.add(signature.name)

    const qualifiedKey = `${signature.module}:${signature.key}`
    if (keys.has(qualifiedKey)) errors.push(`Duplicate built-in key ${qualifiedKey}`)
    keys.add(qualifiedKey)

    if (signature.runtime && !runtimeBySymbol.has(signature.runtime)) {
      errors.push(`${signature.name} uses unknown runtime symbol ${signature.runtime}`)
    }
  }

  if (runtimeSources.length > 0) {
    const source = runtimeSources.join('\n')
    for (const signature of RuntimeSignatures.filter(item => item.symbol.startsWith('lumen_'))) {
      const cSignature = findCSignature(source, signature.symbol)
      if (!cSignature) {
        errors.push(`Missing C implementation for ${signature.symbol}`)
        continue
      }
      if (cSignature.returnType !== signature.returnType) {
        errors.push(`${signature.symbol} returns ${cSignature.returnType} in C, registry says ${signature.returnType}`)
      }
      if (cSignature.parameters.join(',') !== signature.parameters.join(',')) {
        errors.push(`${signature.symbol} has C parameters (${cSignature.parameters.join(',')}), registry says (${signature.parameters.join(',')})`)
      }
      if (cSignature.variadic !== signature.variadic) {
        errors.push(`${signature.symbol} variadic marker differs between C and registry`)
      }
    }
  }

  if (emitterSources.length > 0) {
    const usedSymbols = emitterSources
      .join('\n')
      .match(/@lumen_[A-Za-z0-9_]+/g) ?? []

    for (const usedSymbol of new Set(usedSymbols.map(symbol => symbol.slice(1)))) {
      if (!runtimeBySymbol.has(usedSymbol)) {
        errors.push(`Emitter uses unknown runtime symbol ${usedSymbol}`)
      }
    }
  }

  return errors
}

function findCSignature(source, symbol) {
  const pattern = new RegExp(
    `(?:^|\\n)\\s*(?:__attribute__\\s*\\(\\([^\\n]*\\)\\)\\s*)?([^\\n;{}]+?)\\s*${symbol}\\s*\\(([^)]*)\\)\\s*\\{`,
    'm'
  )
  const match = source.match(pattern)
  if (!match) return null

  const rawParameters = match[2].trim()
  const parts = rawParameters === '' || rawParameters === 'void'
    ? []
    : rawParameters.split(',').map(parameter => parameter.trim())
  const variadic = parts.at(-1) === '...'
  const parameters = (variadic ? parts.slice(0, -1) : parts).map(cTypeToLLVM)

  return {
    returnType: cTypeToLLVM(match[1]),
    parameters,
    variadic
  }
}

function cTypeToLLVM(type) {
  const normalized = type.replace(/\s+/g, ' ').trim()
  if (normalized.includes('*')) return 'ptr'
  if (/\bsize_t\b/.test(normalized)) return 'i64'
  if (/\bfloat\b/.test(normalized)) return 'float'
  if (/\b_Bool\b/.test(normalized)) return 'i1'
  if (/\bvoid\b/.test(normalized)) return 'void'
  if (/\bint\b/.test(normalized)) return 'i32'
  return `unknown:${normalized}`
}
