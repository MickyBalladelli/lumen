fn main() {
    let mut total: i64 = 0;

    for i in 0..2_500_i64 {
        for j in 0..2_000_i64 {
            total += (i * j) % 97;
        }
    }

    println!("{}", total);
}
