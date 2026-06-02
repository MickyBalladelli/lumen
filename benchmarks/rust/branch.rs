fn main() {
    let mut total: i64 = 0;

    for i in 0..5_000_000_i64 {
        if (i % 2) == 0 {
            total += i.max(3);
        } else {
            total += i.min(3);
        }
    }

    println!("{}", total);
}
