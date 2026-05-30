; Lumen LLVM IR
%Point = type { i32, i32 }
@.str.0 = private unnamed_addr constant [4 x i8] c"%d\0A\00"
declare i32 @printf(ptr, ...)

define i32 @main() {
entry:
  %values.addr.0 = alloca [3 x i32]
  %t1 = getelementptr inbounds [3 x i32], ptr %values.addr.0, i32 0, i32 0
  store i32 2, ptr %t1
  %t2 = getelementptr inbounds [3 x i32], ptr %values.addr.0, i32 0, i32 1
  store i32 3, ptr %t2
  %t3 = getelementptr inbounds [3 x i32], ptr %values.addr.0, i32 0, i32 2
  store i32 5, ptr %t3
  %points.addr.4 = alloca [2 x %Point]
  %t5 = getelementptr inbounds [2 x %Point], ptr %points.addr.4, i32 0, i32 0
  %t6 = getelementptr inbounds %Point, ptr %t5, i32 0, i32 0
  store i32 4, ptr %t6
  %t7 = getelementptr inbounds %Point, ptr %t5, i32 0, i32 1
  store i32 7, ptr %t7
  %t8 = getelementptr inbounds [2 x %Point], ptr %points.addr.4, i32 0, i32 1
  %t9 = getelementptr inbounds %Point, ptr %t8, i32 0, i32 0
  store i32 1, ptr %t9
  %t10 = getelementptr inbounds %Point, ptr %t8, i32 0, i32 1
  store i32 9, ptr %t10
  %total.addr.11 = alloca i32
  %t12 = getelementptr inbounds [3 x i32], ptr %values.addr.0, i32 0, i32 0
  %t13 = load i32, ptr %t12
  %t14 = getelementptr inbounds [3 x i32], ptr %values.addr.0, i32 0, i32 2
  %t15 = load i32, ptr %t14
  %t16 = add i32 %t13, %t15
  %t17 = getelementptr inbounds [2 x %Point], ptr %points.addr.4, i32 0, i32 1
  %t18 = getelementptr inbounds %Point, ptr %t17, i32 0, i32 1
  %t19 = load i32, ptr %t18
  %t20 = add i32 %t16, %t19
  store i32 %t20, ptr %total.addr.11
  %t21 = load i32, ptr %total.addr.11
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.0, i64 0, i64 0), i32 %t21)
  %t22 = load i32, ptr %total.addr.11
  ret i32 %t22
}
