; Lumen LLVM IR
@.str.0 = private unnamed_addr constant [6 x i8] c"hello\00"
@.str.1 = private unnamed_addr constant [4 x i8] c"%s\0A\00"
@.str.2 = private unnamed_addr constant [4 x i8] c"%d\0A\00"
declare i32 @printf(ptr, ...)

define i32 @main() {
entry:
  %message.addr.0 = alloca ptr
  store ptr getelementptr inbounds ([6 x i8], ptr @.str.0, i64 0, i64 0), ptr %message.addr.0
  %count.addr.1 = alloca i32
  store i32 3, ptr %count.addr.1
  %t2 = load ptr, ptr %message.addr.0
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.1, i64 0, i64 0), ptr %t2)
  %t3 = load i32, ptr %count.addr.1
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.2, i64 0, i64 0), i32 %t3)
  %t4 = load i32, ptr %count.addr.1
  ret i32 %t4
}
