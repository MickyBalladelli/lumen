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
  store i32 0, ptr %total.addr.11
  %.value.index.addr.12 = alloca i32
  %value.addr.13 = alloca i32
  store i32 0, ptr %.value.index.addr.12
  br label %forof.cond.0
forof.cond.0:
  %t14 = load i32, ptr %.value.index.addr.12
  %t15 = icmp slt i32 %t14, 3
  br i1 %t15, label %forof.body.1, label %forof.end.3
forof.body.1:
  %t16 = getelementptr inbounds [3 x i32], ptr %values.addr.0, i32 0, i32 %t14
  %t17 = load i32, ptr %t16
  store i32 %t17, ptr %value.addr.13
  %t18 = load i32, ptr %total.addr.11
  %t19 = load i32, ptr %value.addr.13
  %t20 = add i32 %t18, %t19
  store i32 %t20, ptr %total.addr.11
  br label %forof.update.2
forof.update.2:
  %t21 = load i32, ptr %.value.index.addr.12
  %t22 = add i32 %t21, 1
  store i32 %t22, ptr %.value.index.addr.12
  br label %forof.cond.0
forof.end.3:
  %.point.index.addr.23 = alloca i32
  %point.addr.24 = alloca %Point
  store i32 0, ptr %.point.index.addr.23
  br label %forof.cond.4
forof.cond.4:
  %t25 = load i32, ptr %.point.index.addr.23
  %t26 = icmp slt i32 %t25, 2
  br i1 %t26, label %forof.body.5, label %forof.end.7
forof.body.5:
  %t27 = getelementptr inbounds [2 x %Point], ptr %points.addr.4, i32 0, i32 %t25
  %t28 = load %Point, ptr %t27
  store %Point %t28, ptr %point.addr.24
  %t29 = load i32, ptr %total.addr.11
  %t30 = getelementptr inbounds %Point, ptr %point.addr.24, i32 0, i32 1
  %t31 = load i32, ptr %t30
  %t32 = add i32 %t29, %t31
  store i32 %t32, ptr %total.addr.11
  br label %forof.update.6
forof.update.6:
  %t33 = load i32, ptr %.point.index.addr.23
  %t34 = add i32 %t33, 1
  store i32 %t34, ptr %.point.index.addr.23
  br label %forof.cond.4
forof.end.7:
  %t35 = load i32, ptr %total.addr.11
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.0, i64 0, i64 0), i32 %t35)
  %t36 = load i32, ptr %total.addr.11
  ret i32 %t36
}
