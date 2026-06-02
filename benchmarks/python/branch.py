total = 0

for i in range(5_000_000):
    if (i % 2) == 0:
        total += max(i, 3)
    else:
        total += min(i, 3)

print(total)
