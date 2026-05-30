; Lumen LLVM IR
@.str.0 = private unnamed_addr constant [6 x i8] c"%lld\0A\00"
@.str.1 = private unnamed_addr constant [4 x i8] c"%f\0A\00"
@.str.2 = private unnamed_addr constant [4 x i8] c"%d\0A\00"
declare i32 @printf(ptr, ...)

define i32 @main() {
entry:
  %big.addr.0 = alloca i64
  store i64 10000000000, ptr %big.addr.0
  %bigger.addr.1 = alloca i64
  %t2 = load i64, ptr %big.addr.0
  %t4 = sext i32 32 to i64
  %t3 = add i64 %t2, %t4
  store i64 %t3, ptr %bigger.addr.1
  %ratio.addr.5 = alloca float
  %t6 = fadd float 1.500000e+00, 2.250000e+00
  store float %t6, ptr %ratio.addr.5
  %t7 = load i64, ptr %bigger.addr.1
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([6 x i8], ptr @.str.0, i64 0, i64 0), i64 %t7)
  %t8 = load float, ptr %ratio.addr.5
  %t9 = fpext float %t8 to double
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.1, i64 0, i64 0), double %t9)
  %t10 = load float, ptr %ratio.addr.5
  %t11 = fcmp ogt float %t10, 3.000000e+00
  %t12 = zext i1 %t11 to i32
  call i32 (ptr, ...) @printf(ptr getelementptr inbounds ([4 x i8], ptr @.str.2, i64 0, i64 0), i32 %t12)
  ret i32 0
}
