use sha2::{Digest, Sha256};

/// First eight bytes of SHA-256 of the text, as a big-endian integer.
pub fn derive(text: &str) -> u64 {
    let digest = Sha256::digest(text.as_bytes());
    u64::from_be_bytes(digest[..8].try_into().expect("eight bytes"))
}

pub fn day(seed: &str, yyyymmdd: u64) -> u64 {
    derive(&format!("{seed}:{yyyymmdd}"))
}

pub fn shuffle(seed: &str) -> u64 {
    derive(&format!("{seed}:shuffle"))
}
