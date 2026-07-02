# Benchmarks

Lumen includes matching `sum`, `fib`, `branch`, `math`, `nested`, and `state`
programs for Lumen, Rust, Python, and Node.js.

Run them with:

```bash
npm run speedtest
```

The runner measures:

- a precompiled Lumen executable
- Rust, Python, and Node.js versions
- `lmsh`, which includes Lumen compile and link time

It reports best and median run times. Set `LUMEN_SPEEDTEST_RUNS` to change the
default three runs:

```bash
LUMEN_SPEEDTEST_RUNS=5 npm run speedtest
```

Missing toolchains are reported as unavailable instead of failing the whole
run.

## Example Local Results

These numbers came from one local machine on June 2, 2026. They are a
historical sample, not a portable performance promise. Run the suite on the
target machine for useful comparisons.

| test | language | rank | best run ms | median run ms |
| --- | --- | ---: | ---: | ---: |
| sum | lumen | 2nd | 7.71 | 9.24 |
| sum | rust | 1st | 7.28 | 8.22 |
| sum | node | 3rd | 87.50 | 88.60 |
| sum | lmsh | 4th | 313.14 | 313.95 |
| sum | python | 5th | 410.25 | 412.15 |
| fib | lumen | 1st | 23.83 | 24.81 |
| fib | rust | 2nd | 26.32 | 26.63 |
| fib | node | 3rd | 93.52 | 94.77 |
| fib | lmsh | 4th | 387.63 | 607.02 |
| fib | python | 5th | 704.56 | 715.00 |
| branch | lumen | 2nd | 6.56 | 7.23 |
| branch | rust | 1st | 6.40 | 7.55 |
| branch | node | 3rd | 95.63 | 96.45 |
| branch | lmsh | 4th | 309.93 | 312.13 |
| branch | python | 5th | 1029.85 | 1040.78 |
| math | lumen | 1st | 21.87 | 22.16 |
| math | rust | 2nd | 22.09 | 23.37 |
| math | node | 3rd | 104.59 | 104.76 |
| math | lmsh | 4th | 337.86 | 355.01 |
| math | python | 5th | 588.47 | 601.56 |
| nested | lumen | 1st | 8.34 | 9.45 |
| nested | rust | 2nd | 8.66 | 10.50 |
| nested | node | 3rd | 89.89 | 90.02 |
| nested | lmsh | 4th | 323.35 | 327.36 |
| nested | python | 5th | 531.10 | 553.84 |
| state | lumen | 1st | 32.87 | 32.90 |
| state | rust | 2nd | 34.02 | 34.67 |
| state | node | 3rd | 186.83 | 187.33 |
| state | lmsh | 4th | 397.65 | 413.55 |
| state | python | 5th | 1484.88 | 1495.60 |

Benchmark source lives under [`benchmarks/`](../benchmarks/). Keep programs
equivalent across languages when changing them.
