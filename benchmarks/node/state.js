let a = 1n
let b = 3n
let total = 0n

for (let i = 0n; i < 5000000n; i += 1n) {
  a = ((a * 1664525n) + 1013904223n) % 1000000007n
  b = (b + a + i) % 1000000007n

  if ((b % 3n) === 0n) {
    total = (total + a) % 1000000007n
  } else {
    total = (total + b) % 1000000007n
  }
}

console.log(total.toString())
