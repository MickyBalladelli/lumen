let total = 0n

for (let i = 0n; i < 5000000n; i += 1n) {
  total = (total + ((i * 31n) % 1000000007n)) % 1000000007n
}

console.log(total.toString())
