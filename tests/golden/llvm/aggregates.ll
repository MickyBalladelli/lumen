; Lumen LLVM IR
%Point = type { i32, i32 }
define i32 @main() {
entry:
  %point.addr.0 = alloca %Point
  %t1 = getelementptr inbounds %Point, ptr %point.addr.0, i32 0, i32 0
  store i32 4, ptr %t1
  %t2 = getelementptr inbounds %Point, ptr %point.addr.0, i32 0, i32 1
  store i32 7, ptr %t2
  %t3 = getelementptr inbounds %Point, ptr %point.addr.0, i32 0, i32 0
  %t4 = load i32, ptr %t3
  ret i32 %t4
}
