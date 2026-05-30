; Lumen LLVM IR
@.str.0 = private unnamed_addr constant [4 x i8] c"%d\0A\00"
@.str.1 = private unnamed_addr constant [4 x i8] c"%d\0A\00"
declare i32 @printf(ptr, ...)

define i32 @main() {
entry:
  %values.addr.0 = alloca [5 x i32]
  %t1 = getelementptr inbounds [5 x i32], ptr %values.addr.0, i32 0, i32 0
  store i32 1, ptr %t1
  %t2 = getelementptr inbounds [5 x i32], ptr %values.addr.0, i32 0, i32 1
  store i32 2, ptr %t2
  %t3 = getelementptr inbounds [5 x i32], ptr %values.addr.0, i32 0, i32 2
  store i32 3, ptr %t3
  %t4 = getelementptr inbounds [5 x i32], ptr %values.addr.0, i32 0, i32 3
  store i32 4, ptr %t4
  %t5 = getelementptr inbounds [5 x i32], ptr %values.addr.0, i32 0, i32 4
  store i32 5, ptr %t5
  %total.addr.6 = alloca i32
  store i32 0, ptr %total.addr.6
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.0, i64 0, i64 0), i32 5)
  %.value.index.addr.7 = alloca i32
  %value.addr.8 = alloca i32
  store i32 0, ptr %.value.index.addr.7
  br label %filter.cond.0
filter.cond.0:
  %t9 = load i32, ptr %.value.index.addr.7
  %t10 = icmp slt i32 %t9, 5
  br i1 %t10, label %filter.pred.1, label %filter.end.4
filter.pred.1:
  %t11 = getelementptr inbounds [5 x i32], ptr %values.addr.0, i32 0, i32 %t9
  %t12 = load i32, ptr %t11
  store i32 %t12, ptr %value.addr.8
  %t13 = load i32, ptr %value.addr.8
  %t14 = icmp sgt i32 %t13, 2
  br i1 %t14, label %filter.body.2, label %filter.update.3
filter.body.2:
  %t15 = load i32, ptr %total.addr.6
  %t16 = load i32, ptr %value.addr.8
  %t17 = add i32 %t15, %t16
  store i32 %t17, ptr %total.addr.6
  br label %filter.update.3
filter.update.3:
  %t18 = load i32, ptr %.value.index.addr.7
  %t19 = add i32 %t18, 1
  store i32 %t19, ptr %.value.index.addr.7
  br label %filter.cond.0
filter.end.4:
  %t20 = load i32, ptr %total.addr.6
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.1, i64 0, i64 0), i32 %t20)
  %t21 = load i32, ptr %total.addr.6
  ret i32 %t21
}
