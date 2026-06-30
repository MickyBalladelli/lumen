; Lumen LLVM IR
@.str.0 = private unnamed_addr constant [4 x i8] c"%d\0A\00"
declare i32 @printf(ptr, ...)
define i32 @main() {
entry:
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.0, i64 0, i64 0), i32 7)
  ret i32 0
}
