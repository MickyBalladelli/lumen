export const FeatureParityMatrix = Object.freeze([
  feature('functions-return', 'functions and integer returns', 'tests/bootstrap/tiny.lm', '', 7),
  feature('variables-constants-println', 'variables, constants, strings, and println', 'examples/basic.lm', 'hello\n3\n', 3, ['@printf']),
  feature('binary-if', 'binary expressions and if branching', 'examples/self-host-if-binary.lm', 'seven\n7\n', 7, ['br i1']),
  feature('function-calls', 'helper function calls', 'examples/self-host-call.lm', '9\n', 9, ['call i32 @combine']),
  feature('classic-for', 'classic for loops and updates', 'examples/for-loop.lm', '10\n', 10, ['br i1']),
  feature('while', 'while loops', 'examples/while-do.lm', '6\n', 6, ['br i1']),
  feature('loop-control', 'break, continue, interpolation, and else', 'examples/control-flow.lm', 'sum 23\n', 23, ['br i1']),
  feature('data-driven-for', 'data-driven loop names, values, and bounds', 'tests/bootstrap/generic-for.lm', 'value 16\n', 16, ['br i1']),
  feature('structs', 'struct literals and field access', 'examples/struct.lm', '11\n', 11),
  feature('arrays', 'integer arrays and indexing', 'examples/self-host-array.lm', '7\n', 7),
  feature('async-await', 'simple async functions and await', 'examples/self-host-async.lm', '4\n', 4),
  feature('enum-match', 'enums and match expressions', 'examples/self-host-enum-match.lm', 'missing\n', 7),
  feature('switch', 'numeric switch cases and default', 'examples/self-host-switch.lm', '20\n', 20),
  feature('data-driven-switch', 'data-driven switch assignments', 'tests/bootstrap/generic-switch.lm', '11\n', 11),
  feature('try-catch', 'throw and catch recovery', 'examples/self-host-try-catch.lm', 'boom\n7\n', 7),
  feature('data-driven-catch', 'data-driven catch assignments and print values', 'tests/bootstrap/generic-catch-print.lm', 'failure\nbad\n11\n', 11),
  feature('modules', 'local module imports', 'examples/module-app.lm', '12\n', 12, ['call i32 @']),
  diagnostic('diagnostic-break-scope', 'break scope diagnostic', 'tests/negative/break-outside-loop.lm', 'break outside loop', 2),
  diagnostic('diagnostic-duplicate-parameter', 'duplicate parameter diagnostic', 'tests/negative/duplicate-parameter.lm', 'duplicate parameter value', 1),
  diagnostic('diagnostic-initializer-type', 'initializer type diagnostic', 'tests/bootstrap/type-mismatch.lm', 'cannot assign i32 to string', 2),
  diagnostic('diagnostic-assignment-type', 'assignment type diagnostic', 'tests/bootstrap/assignment-type-mismatch.lm', 'cannot assign i32 to string', 3),
  diagnostic('diagnostic-return-type', 'return type diagnostic', 'tests/negative/return-type-mismatch.lm', 'return type i32 does not match string', 2),
  diagnostic('diagnostic-throw-type', 'throw type diagnostic', 'tests/negative/throw-type-mismatch.lm', 'throw expects string or error, got i32', 2),
  diagnostic('diagnostic-for-of-type', 'for-of iterable diagnostic', 'tests/negative/for-of-non-array.lm', 'for-of needs an array', 3),
  diagnostic('diagnostic-switch-type', 'switch case diagnostic', 'tests/negative/switch-case-mismatch.lm', 'cannot compare switch i32 with case string', 4),
  diagnostic('diagnostic-nullable-call', 'nullable call diagnostic', 'tests/negative/none-to-string.lm', 'cannot pass none to string', 6),
  diagnostic('diagnostic-result-call', 'Result call diagnostic', 'tests/negative/result-type-mismatch.lm', 'cannot pass result<i32> to result<string>', 6),
  diagnostic('diagnostic-unterminated-string', 'unterminated string diagnostic', 'tests/bootstrap/unterminated-string.lm', 'unterminated string literal', 2),
  diagnostic('diagnostic-unterminated-comment', 'unterminated comment diagnostic', 'tests/bootstrap/unterminated-comment.lm', 'unterminated block comment', 2),
  diagnostic('diagnostic-unexpected-character', 'unexpected character diagnostic', 'tests/bootstrap/unexpected-character.lm', 'unexpected character @', 2)
])

export const ParityDimensions = Object.freeze([
  'diagnostics',
  'llvm',
  'executable'
])

function feature(id, name, fixture, stdout, code, llvmPatterns = []) {
  return Object.freeze({
    id,
    name,
    fixture,
    kind: 'feature',
    expected: Object.freeze({ stdout, stderr: '', code }),
    llvmPatterns: Object.freeze(['define i32 @main', ...llvmPatterns])
  })
}

function diagnostic(id, name, fixture, message, line) {
  return Object.freeze({
    id,
    name,
    fixture,
    kind: 'diagnostic',
    expected: Object.freeze({ message, line })
  })
}
