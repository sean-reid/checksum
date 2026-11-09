use crate::categories::Category;
use crate::gen::{checksum_candidates, generate_word, PROBE_ATTEMPTS};
use crate::seed;
use crate::words::Words;
use std::fmt::Write;
use std::sync::atomic::{AtomicUsize, Ordering};

/// The candidate checksum words that generate under a fixed probe seed, one
/// per line in list order.
pub fn run(words: &Words, cats: &[Category]) -> String {
    let candidates = checksum_candidates(words);
    let next = AtomicUsize::new(0);
    let threads = std::thread::available_parallelism().map_or(1, |n| n.get());
    let mut passed: Vec<usize> = std::thread::scope(|scope| {
        let handles: Vec<_> = (0..threads)
            .map(|_| {
                scope.spawn(|| {
                    let mut ok = Vec::new();
                    loop {
                        let i = next.fetch_add(1, Ordering::Relaxed);
                        let Some(&ck) = candidates.get(i) else { break };
                        let probe = seed::derive(&format!("probe:{}", words.list[ck].s));
                        let mut caps = 0;
                        if generate_word(words, cats, probe, ck, PROBE_ATTEMPTS, &mut caps)
                            .is_some()
                        {
                            ok.push(ck);
                        }
                    }
                    ok
                })
            })
            .collect();
        handles
            .into_iter()
            .flat_map(|h| h.join().unwrap())
            .collect()
    });
    passed.sort();
    let mut out = String::new();
    for k in passed {
        let _ = writeln!(out, "{}", words.list[k].s);
    }
    out
}
