/// Bit counts are integers in thousandths of a bit so that no float reaches a decision.
pub const MILLI: i64 = 1000;

/// log2 of `x` in thousandths of a bit, by integer squaring.
pub fn log2_milli(x: u64) -> i64 {
    assert!(x > 0, "log2 of zero");
    let msb = i64::from(63 - x.leading_zeros());
    let mut y = u128::from(x) << (63 - msb);
    let mut frac = 0i64;
    for _ in 0..10 {
        y = (y * y) >> 63;
        frac <<= 1;
        if y >= 1u128 << 64 {
            y >>= 1;
            frac |= 1;
        }
    }
    msb * MILLI + ((frac * MILLI) >> 10)
}
