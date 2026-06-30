; Lumen LLVM IR
define i32 @main() {
entry:
  %value.addr.0 = alloca i32
  %t1 = add i32 4, 3
  store i32 %t1, ptr %value.addr.0
  %t2 = load i32, ptr %value.addr.0
  ret i32 %t2
}
