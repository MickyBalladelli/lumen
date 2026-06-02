fn main() {
    let mut total: i64 = 0;

    for i in 0..5_000_000_i64 {
        total = (total + ((i * 31) % 1_000_000_007)) % 1_000_000_007;
    }

    println!("{}", total);
}
