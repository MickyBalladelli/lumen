fn main() {
    let mut total: i64 = 0;

    for i in 0..5_000_000_i64 {
        total += i % 97;
    }

    println!("{}", total);
}
