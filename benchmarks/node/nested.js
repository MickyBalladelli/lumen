let total = 0n

for (let i = 0n; i < 2500n; i += 1n) {
  for (let j = 0n; j < 2000n; j += 1n) {
    total += (i * j) % 97n
  }
}

console.log(total.toString())
