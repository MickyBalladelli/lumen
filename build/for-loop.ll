; Lumen LLVM IR
@.str.0 = private unnamed_addr constant [4 x i8] c"%d\0A\00"
declare i32 @printf(ptr, ...)

define i32 @main() {
entry:
  %limit.addr.0 = alloca i32
  store i32 5, ptr %limit.addr.0
  %total.addr.1 = alloca i32
  store i32 0, ptr %total.addr.1
  %i.addr.2 = alloca i32
  store i32 0, ptr %i.addr.2
  br label %for.cond.0
for.cond.0:
  %t3 = load i32, ptr %i.addr.2
  %t4 = load i32, ptr %limit.addr.0
  %t5 = icmp slt i32 %t3, %t4
  br i1 %t5, label %for.body.1, label %for.end.3
for.body.1:
  %t6 = load i32, ptr %total.addr.1
  %t7 = load i32, ptr %i.addr.2
  %t8 = add i32 %t6, %t7
  store i32 %t8, ptr %total.addr.1
  br label %for.update.2
for.update.2:
  %t9 = load i32, ptr %i.addr.2
  %t10 = add i32 %t9, 1
  store i32 %t10, ptr %i.addr.2
  br label %for.cond.0
for.end.3:
  %t11 = load i32, ptr %total.addr.1
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.0, i64 0, i64 0), i32 %t11)
  %t12 = load i32, ptr %total.addr.1
  ret i32 %t12
}
