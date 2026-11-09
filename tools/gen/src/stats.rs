use crate::categories::Category;
use crate::gen::{FALLBACK_STEP, MAX_BITS, MIN_BITS};
use crate::puzzle::{build, Date};
use crate::words::Words;
use std::collections::{BTreeMap, HashSet};
use std::fmt::Write;
use std::time::Instant;

fn percentile(sorted: &[f64], p: f64) -> f64 {
    if sorted.is_empty() {
        return 0.0;
    }
    sorted[((sorted.len() - 1) as f64 * p).round() as usize]
}

pub fn run(words: &Words, cats: &[Category], seed: &str, start: Date, days: i64) -> String {
    let mut bits: BTreeMap<u32, usize> = BTreeMap::new();
    let mut kinds: BTreeMap<&'static str, usize> = BTreeMap::new();
    let mut ms: BTreeMap<usize, usize> = BTreeMap::new();
    let mut attempts = Vec::new();
    let mut times = Vec::new();
    let mut failures = Vec::new();
    let mut phrases = HashSet::new();
    let mut fallbacks = Vec::new();
    let (mut cap_hits, mut total_attempts) = (0u64, 0u64);
    for i in 0..days {
        let date = start.add_days(i);
        let t = Instant::now();
        match build(words, cats, date, seed) {
            Ok(b) => {
                times.push(t.elapsed().as_secs_f64() * 1000.0);
                attempts.push(f64::from(b.report.attempts));
                *bits.entry((b.report.bits / 1000) as u32).or_default() += 1;
                cap_hits += u64::from(b.report.cap_hits);
                total_attempts += u64::from(b.report.attempts);
                if b.report.fallbacks > 0 {
                    fallbacks.push(format!(
                        "{} (entry +{}x{})",
                        date, b.report.fallbacks, FALLBACK_STEP
                    ));
                }
                phrases.insert(b.puzzle.solution.join(" "));
                *ms.entry(b.puzzle.m).or_default() += 1;
                let mut seen: Vec<&'static str> =
                    b.puzzle.constraints.iter().map(|c| c.kind()).collect();
                seen.sort();
                seen.dedup();
                for k in seen {
                    *kinds.entry(k).or_default() += 1;
                }
            }
            Err(e) => failures.push(e),
        }
    }
    attempts.sort_by(f64::total_cmp);
    times.sort_by(f64::total_cmp);
    let mut out = String::new();
    let _ = writeln!(
        out,
        "days {days} from {start}, ok {}, failed {}",
        times.len(),
        failures.len()
    );
    let _ = writeln!(
        out,
        "\nbits (band {} to {})",
        MIN_BITS / 1000,
        MAX_BITS / 1000
    );
    for (b, c) in &bits {
        let _ = writeln!(out, "  {b:>2}-{:<2} {c}", b + 1);
    }
    let _ = writeln!(out, "\npuzzles containing each constraint kind");
    for (k, c) in &kinds {
        let _ = writeln!(
            out,
            "  {k:<18} {c:>4}  {:.1}%",
            *c as f64 * 100.0 / times.len().max(1) as f64
        );
    }
    let _ = writeln!(
        out,
        "\ndistinct phrases {} of {}",
        phrases.len(),
        times.len()
    );
    let _ = writeln!(
        out,
        "\nconstraint cap hit in {cap_hits} of {total_attempts} attempts"
    );
    let _ = writeln!(
        out,
        "dates that used a fallback checksum word: {}",
        fallbacks.len()
    );
    for f in &fallbacks {
        let _ = writeln!(out, "  {f}");
    }
    let _ = writeln!(out, "\nwords per phrase");
    for (m, c) in &ms {
        let _ = writeln!(out, "  {m} {c}");
    }
    let row = |name: &str, v: &[f64], unit: &str| {
        format!(
            "  {name:<9} p50 {:.0}{unit}  p90 {:.0}{unit}  max {:.0}{unit}\n",
            percentile(v, 0.5),
            percentile(v, 0.9),
            v.last().copied().unwrap_or(0.0)
        )
    };
    let _ = writeln!(
        out,
        "\n{}{}",
        row("attempts", &attempts, ""),
        row("time", &times, " ms").trim_end()
    );
    for f in &failures {
        let _ = writeln!(out, "failure: {f}");
    }
    out
}
