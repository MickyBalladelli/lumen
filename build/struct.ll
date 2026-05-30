; Lumen LLVM IR
%Point = type { i32, i32 }
@.str.0 = private unnamed_addr constant [4 x i8] c"%d\0A\00"
declare i32 @printf(ptr, ...)

define i32 @main() {
entry:
  %point.addr.0 = alloca %Point
  %t1 = getelementptr inbounds %Point, ptr %point.addr.0, i32 0, i32 0
  store i32 4, ptr %t1
  %t2 = getelementptr inbounds %Point, ptr %point.addr.0, i32 0, i32 1
  store i32 7, ptr %t2
  %total.addr.3 = alloca i32
  %t4 = getelementptr inbounds %Point, ptr %point.addr.0, i32 0, i32 0
  %t5 = load i32, ptr %t4
  %t6 = getelementptr inbounds %Point, ptr %point.addr.0, i32 0, i32 1
  %t7 = load i32, ptr %t6
  %t8 = add i32 %t5, %t7
  store i32 %t8, ptr %total.addr.3
  %t9 = load i32, ptr %total.addr.3
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.0, i64 0, i64 0), i32 %t9)
  %t10 = load i32, ptr %total.addr.3
  ret i32 %t10
}
