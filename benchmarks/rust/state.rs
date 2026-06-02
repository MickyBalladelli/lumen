fn main() {
    let mut a: i64 = 1;
    let mut b: i64 = 3;
    let mut total: i64 = 0;

    for i in 0..5_000_000_i64 {
        a = ((a * 1_664_525) + 1_013_904_223) % 1_000_000_007;
        b = (b + a + i) % 1_000_000_007;

        if (b % 3) == 0 {
            total = (total + a) % 1_000_000_007;
        } else {
            total = (total + b) % 1_000_000_007;
        }
    }

    println!("{}", total);
}
