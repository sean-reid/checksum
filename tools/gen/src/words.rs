use std::collections::HashSet;

/// Zipf frequencies are kept in hundredths.
pub const POOL_ZIPF: i32 = 350;
pub const SHORT_POOL_ZIPF: i32 = 400;

const SCORES: [u32; 26] = [
    1, 3, 3, 2, 1, 4, 2, 4, 1, 8, 5, 1, 3, 1, 1, 3, 10, 1, 1, 1, 1, 4, 4, 8, 4, 10,
];

pub fn score(b: &[u8]) -> u32 {
    b.iter().map(|&c| SCORES[(c - b'a') as usize]).sum()
}

fn hundredths(text: &str) -> i32 {
    let (whole, frac) = text.split_once('.').unwrap_or((text, ""));
    let frac = format!("{frac:0<2}");
    whole.parse::<i32>().expect("zipf") * 100 + frac[..2].parse::<i32>().expect("zipf")
}

pub struct Word {
    pub s: String,
    pub b: Vec<u8>,
    pub zipf: i32,
    pub score: u32,
    pub core: bool,
    pub denied: bool,
}

impl Word {
    pub fn in_pool(&self) -> bool {
        !self.denied
            && self.zipf >= POOL_ZIPF
            && (self.b.len() > 3 || (self.zipf >= SHORT_POOL_ZIPF && self.core))
    }
}

pub struct Words {
    pub list: Vec<Word>,
    pub by_len: Vec<Vec<usize>>,
    pub by_first: Vec<Vec<usize>>,
    pub by_last: Vec<Vec<usize>>,
    pub by_ends: Vec<Vec<u32>>,
    /// Pool words by (checksum position 1 to 3, first, last, letter at that position).
    triples: Vec<u32>,
    /// All words by (position 2 or 3, first, last, letter at that position).
    ends_nth: Vec<u32>,
    /// All words by (position 2 or 3, first, letter at that position).
    first_nth: Vec<u32>,
    /// Checksum words in day order.
    pub order: Vec<usize>,
}

impl Words {
    pub fn load() -> Words {
        Words::parse(
            include_str!("../data/words.txt"),
            include_str!("../data/deny.txt"),
        )
    }

    fn triple(n: usize, first: u8, last: u8, at: u8) -> usize {
        (((n - 1) * 26 + first as usize) * 26 + last as usize) * 26 + at as usize
    }

    /// Pool words starting with `first`, ending with `last`, with `at` in position `n`.
    pub fn pool_with(&self, n: usize, first: u8, last: u8, at: u8) -> u32 {
        self.triples[Words::triple(n, first - b'a', last - b'a', at - b'a')]
    }

    /// Words with `first`, `last`, and `at` in position `k` (2 or 3).
    pub fn ends_nth(&self, k: usize, first: u8, last: u8, at: u8) -> u32 {
        let (f, l, x) = (
            (first - b'a') as usize,
            (last - b'a') as usize,
            (at - b'a') as usize,
        );
        self.ends_nth[(((k - 2) * 26 + f) * 26 + l) * 26 + x]
    }

    /// Words with `first` and `at` in position `k` (2 or 3).
    pub fn first_nth(&self, k: usize, first: u8, at: u8) -> u32 {
        self.first_nth[((k - 2) * 26 + (first - b'a') as usize) * 26 + (at - b'a') as usize]
    }

    pub fn parse(text: &str, deny: &str) -> Words {
        let deny: HashSet<&str> = deny.split_whitespace().collect();
        let mut list = Vec::new();
        let mut by_len = vec![Vec::new(); 10];
        let mut by_first = vec![Vec::new(); 26];
        let mut by_last = vec![Vec::new(); 26];
        let mut by_ends = vec![vec![0u32; 26]; 26];
        let mut triples = vec![0u32; 3 * 26 * 26 * 26];
        let mut ends_nth = vec![0u32; 2 * 26 * 26 * 26];
        let mut first_nth = vec![0u32; 2 * 26 * 26];
        for line in text.lines() {
            let mut it = line.split_whitespace();
            let (Some(w), Some(z), Some(core)) = (it.next(), it.next(), it.next()) else {
                continue;
            };
            let b = w.as_bytes().to_vec();
            by_len[b.len()].push(list.len());
            by_first[(b[0] - b'a') as usize].push(list.len());
            by_last[(b[b.len() - 1] - b'a') as usize].push(list.len());
            by_ends[(b[0] - b'a') as usize][(b[b.len() - 1] - b'a') as usize] += 1;
            list.push(Word {
                s: w.to_string(),
                score: score(&b),
                b,
                zipf: hundredths(z),
                core: core == "1",
                denied: deny.contains(w),
            });
        }
        for w in &list {
            let (f, l) = (w.b[0] - b'a', w.b[w.b.len() - 1] - b'a');
            for k in 2..=3usize {
                let Some(&at) = w.b.get(k - 1) else { continue };
                let x = (at - b'a') as usize;
                ends_nth[(((k - 2) * 26 + f as usize) * 26 + l as usize) * 26 + x] += 1;
                first_nth[((k - 2) * 26 + f as usize) * 26 + x] += 1;
            }
        }
        for w in list.iter().filter(|w| w.in_pool()) {
            let (f, l) = (w.b[0] - b'a', w.b[w.b.len() - 1] - b'a');
            for n in 1..=3 {
                if let Some(&at) = w.b.get(n - 1) {
                    triples[Words::triple(n, f, l, at - b'a')] += 1;
                }
            }
        }
        Words {
            order: Vec::new(),
            list,
            by_len,
            by_first,
            by_last,
            by_ends,
            triples,
            ends_nth,
            first_nth,
        }
    }
}
