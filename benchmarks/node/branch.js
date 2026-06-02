let total = 0n

for (let i = 0n; i < 5000000n; i += 1n) {
  if ((i % 2n) === 0n) {
    total += i > 3n ? i : 3n
  } else {
    total += i < 3n ? i : 3n
  }
}

console.log(total.toString())
