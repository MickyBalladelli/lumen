; Lumen LLVM IR
@.str.0 = private unnamed_addr constant [4 x i8] c"%s\0A\00"
@.str.1 = private unnamed_addr constant [6 x i8] c"total\00"
@.str.2 = private unnamed_addr constant [4 x i8] c"%d\0A\00"
declare i32 @printf(ptr, ...)

define i32 @main() {
entry:
  %total.addr.0 = alloca i32
  store i32 0, ptr %total.addr.0
  %i.addr.1 = alloca i32
  store i32 0, ptr %i.addr.1
  br label %for.cond.0
for.cond.0:
  %t2 = load i32, ptr %i.addr.1
  %t3 = icmp slt i32 %t2, 5
  br i1 %t3, label %for.body.1, label %for.end.3
for.body.1:
  %t4 = load i32, ptr %total.addr.0
  %t5 = load i32, ptr %i.addr.1
  %t6 = add i32 %t4, %t5
  store i32 %t6, ptr %total.addr.0
  br label %for.update.2
for.update.2:
  %t7 = load i32, ptr %i.addr.1
  %t8 = add i32 %t7, 1
  store i32 %t8, ptr %i.addr.1
  br label %for.cond.0
for.end.3:
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.0, i64 0, i64 0), ptr getelementptr inbounds ([6 x i8], ptr @.str.1, i64 0, i64 0))
  %t9 = load i32, ptr %total.addr.0
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.2, i64 0, i64 0), i32 %t9)
  %t10 = load i32, ptr %total.addr.0
  ret i32 %t10
}
