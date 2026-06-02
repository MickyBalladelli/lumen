let total = 0n

for (let i = 0n; i < 5000000n; i += 1n) {
  total += i % 97n
}

console.log(total.toString())
