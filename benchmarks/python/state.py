a = 1
b = 3
total = 0

for i in range(5_000_000):
    a = ((a * 1_664_525) + 1_013_904_223) % 1_000_000_007
    b = (b + a + i) % 1_000_000_007

    if (b % 3) == 0:
        total = (total + a) % 1_000_000_007
    else:
        total = (total + b) % 1_000_000_007

print(total)
