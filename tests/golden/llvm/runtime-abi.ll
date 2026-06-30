; Lumen LLVM IR
@.str.0 = private unnamed_addr constant [4 x i8] c"%s\0A\00"
declare i32 @printf(ptr, ...)
declare ptr @lumen_uuid()
define i32 @main() {
entry:
  %t0 = call ptr @lumen_uuid()
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.0, i64 0, i64 0), ptr %t0)
  ret i32 0
}
