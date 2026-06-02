total = 0

for i in range(2_500):
    for j in range(2_000):
        total += (i * j) % 97

print(total)
