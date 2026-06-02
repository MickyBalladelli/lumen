fn main() {
    let mut a: i64 = 1;
    let mut b: i64 = 1;

    for _ in 0..5_000_000_i32 {
        let next = (a + b) % 1_000_000_007;
        a = b;
        b = next;
    }

    println!("{}", b);
}
