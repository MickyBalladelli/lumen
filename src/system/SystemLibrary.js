export const SystemFunctions = Object.freeze({
  Println: 'println',
  Len: 'len',
  Filter: 'filter',
  Includes: 'includes',
  Uuid: 'uuid',
  Env: 'env',
  Encrypt: 'encrypt',
  Decrypt: 'decrypt',
  Arg: 'arg',
  ArgCount: 'argCount',
  Map: 'map',
  MapGet: 'mapGet',
  MapHas: 'mapHas',
  Ok: 'ok',
  Err: 'err',
  IsOk: 'isOk',
  ErrorMessage: 'errorMessage',
  Some: 'some',
  None: 'none',
  HasValue: 'hasValue',
  ValueOr: 'valueOr',
  Assert: 'assert',
  Channel: 'channel',
  Send: 'send',
  Receive: 'receive',
  Json: 'json',
  JsonGet: 'jsonGet',
  JsonSet: 'jsonSet',
  NewError: 'newError',
  ErrorCode: 'errorCode',
  ErrorText: 'errorText',
  ArraySum: 'arraySum',
  ArrayFirst: 'arrayFirst',
  ArrayLast: 'arrayLast',
  ArrayJoin: 'arrayJoin',
  Exec: 'exec',
  SourceSnippet: 'sourceSnippet',
  StringBuilder: 'stringBuilder',
  StringBuilderAppend: 'stringBuilderAppend',
  StringLen: 'stringLen',
  StringEquals: 'stringEquals',
  IntToString: 'intToString',
  StringToInt: 'stringToInt',
  List: 'list',
  ListPush: 'listPush',
  ListGet: 'listGet',
  ListLen: 'listLen',
  MapSet: 'mapSet',
  MapDelete: 'mapDelete',
  MapKeys: 'mapKeys',
  TokenizeSource: 'tokenizeSource',
  ParseSummary: 'parseSummary'
})

export class SystemLibrary {
  constructor() {
    this.functions = new Set(Object.values(SystemFunctions))
  }

  has(name) {
    return this.functions.has(name)
  }
}
