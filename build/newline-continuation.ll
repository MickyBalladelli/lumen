; Lumen LLVM IR
@.str.0 = private unnamed_addr constant [4 x i8] c"%d\0A\00"
declare i32 @printf(ptr, ...)

define i32 @main() {
entry:
  %value.addr.0 = alloca i32
  %t1 = add i32 1, 2
  %t2 = add i32 %t1, 3
  store i32 %t2, ptr %value.addr.0
  %t3 = load i32, ptr %value.addr.0
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.0, i64 0, i64 0), i32 %t3)
  %t4 = load i32, ptr %value.addr.0
  ret i32 %t4
}
