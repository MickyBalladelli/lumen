let a = 1n
let b = 1n

for (let i = 0; i < 5000000; i += 1) {
  const next = (a + b) % 1000000007n
  a = b
  b = next
}

console.log(b.toString())
