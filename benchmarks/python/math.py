total = 0

for i in range(5_000_000):
    total = (total + ((i * 31) % 1_000_000_007)) % 1_000_000_007

print(total)
