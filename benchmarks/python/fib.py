a = 1
b = 1

for _ in range(5_000_000):
    next_value = (a + b) % 1_000_000_007
    a = b
    b = next_value

print(b)
