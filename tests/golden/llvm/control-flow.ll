; Lumen LLVM IR
define i32 @main() {
entry:
  %value.addr.0 = alloca i32
  store i32 2, ptr %value.addr.0
  %t1 = load i32, ptr %value.addr.0
  %t2 = icmp sgt i32 %t1, 1
  br i1 %t2, label %if.then.0, label %if.end.2
if.then.0:
  %t3 = load i32, ptr %value.addr.0
  ret i32 %t3
if.end.2:
  ret i32 0
}
