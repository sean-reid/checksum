use crate::categories::Category;
use crate::constraint::{has_double, Constraint, Pos};
use crate::search::{Search, NODE_BUDGET};
use crate::words::Words;

const MIN_CHECKSUM_LEN: usize = 4;
const MAX_CHECKSUM_LEN: usize = 7;
use rand::prelude::*;
use rand_chacha::ChaCha8Rng;

pub const MIN_BITS: f64 = 10.0;
pub const MAX_BITS: f64 = 26.0;
pub const MAX_ATTEMPTS: u32 = 1500;
const MAX_CONSTRAINTS: usize = 6;
pub const FALLBACK_STEP: usize = 4096;
pub const MAX_FALLBACKS: usize = 4;
const LONG_PHRASE: usize = 6;
const SHAPE_DRAWS: usize = 20;
/// Most bits per slot a planted absent letter can remove.
const PLANT_MAX_DROP: f64 = 1.5;
/// Phrases a bit count may leave per spellable checksum before sampling skips it.
const UNIQUE_ODDS: f64 = 400.0;
pub const PROBE_ATTEMPTS: u32 = 150;
const ACROSTIC_TRIES: usize = 3000;

pub struct Puzzle {
    pub m: usize,
    pub n: usize,
    pub cons: Vec<Constraint>,
    pub solution: Vec<usize>,
    pub checksum: String,
}

pub struct Report {
    pub puzzle: Puzzle,
    pub attempts: u32,
    pub bits: f64,
    pub fallbacks: u32,
    pub cap_hits: u32,
}

#[derive(Clone, Copy)]
enum Shape {
    Ascending,
    Descending,
    Alphabetical,
}

impl Shape {
    fn constraint(self) -> Constraint {
        match self {
            Shape::Ascending => Constraint::LengthsAscending,
            Shape::Descending => Constraint::LengthsDescending,
            Shape::Alphabetical => Constraint::Alphabetical,
        }
    }
}

fn weight(z: f32) -> f32 {
    10f32.powf((z - 3.0) * 0.6)
}

/// Highest bit count worth sampling for an m-letter checksum: above it, so many
/// phrases spell some word that the derived constraints cannot single one out.
fn bits_ceiling(words: &Words, m: usize) -> f64 {
    let spellable = words.by_len[m].len() as f64 / 26f64.powi(m as i32);
    (UNIQUE_ODDS / spellable).log2().min(MAX_BITS)
}

/// Pool words of 4 to 7 letters, in list order.
pub fn checksum_candidates(words: &Words) -> Vec<usize> {
    (0..words.list.len())
        .filter(|&k| {
            let w = &words.list[k];
            (MIN_CHECKSUM_LEN..=MAX_CHECKSUM_LEN).contains(&w.b.len()) && w.in_pool()
        })
        .collect()
}

/// The words the checksum can be, from data/checksum_words.txt (the candidates
/// that generate under a probe seed), shuffled once by the secret seed.
pub fn checksum_order(words: &Words, seed: &str) -> Vec<usize> {
    let mut order: Vec<usize> = include_str!("../data/checksum_words.txt")
        .split_whitespace()
        .map(|w| {
            let k = words
                .list
                .iter()
                .position(|x| x.s == w)
                .expect("listed word");
            assert!(words.list[k].in_pool(), "{w} is outside the pool");
            k
        })
        .collect();
    order.shuffle(&mut ChaCha8Rng::seed_from_u64(crate::seed::shuffle(seed)));
    order
}

pub fn load_words(seed: &str) -> Words {
    let mut words = Words::load();
    words.order = checksum_order(&words, seed);
    words
}

/// Tries one checksum word for up to `budget` attempts.
pub fn generate_word(
    words: &Words,
    cats: &[Category],
    seed: u64,
    ck: usize,
    budget: u32,
    cap_hits: &mut u32,
) -> Option<(Puzzle, f64, u32)> {
    let mut rng = ChaCha8Rng::seed_from_u64(seed);
    (1..=budget).find_map(|attempt| {
        attempt_once(words, cats, &mut rng, ck, cap_hits)
            .map(|(puzzle, bits)| (puzzle, bits, attempt))
    })
}

/// The puzzle for day `index`: the checksum word is `words.order[index]`, or
/// the entry FALLBACK_STEP further on when that word yields nothing.
pub fn generate(words: &Words, cats: &[Category], seed: u64, index: usize) -> Option<Report> {
    let mut attempts = 0;
    let mut cap_hits = 0;
    for fallback in 0..=MAX_FALLBACKS {
        let at = (index + fallback * FALLBACK_STEP) % words.order.len();
        let ck = words.order[at];
        let day_seed = seed.wrapping_add((fallback as u64) << 40);
        if let Some((puzzle, bits, used)) =
            generate_word(words, cats, day_seed, ck, MAX_ATTEMPTS, &mut cap_hits)
        {
            return Some(Report {
                puzzle,
                attempts: attempts + used,
                bits,
                fallbacks: fallback as u32,
                cap_hits,
            });
        }
        attempts += MAX_ATTEMPTS;
    }
    None
}

/// Exact bit count for the acrostic shapes the count tables cover; infinite
/// when a slot has no candidate.
fn quick_bits(words: &Words, cons: &[Constraint], m: usize) -> Option<f64> {
    let get = |p: Pos| {
        cons.iter().find_map(|c| match c {
            Constraint::Acrostic { pos, word, .. } if *pos == p => Some(word.as_bytes()),
            _ => None,
        })
    };
    let at = |l: u8| (l - b'a') as usize;
    let nth = [2, 3]
        .into_iter()
        .find_map(|k| get(Pos::Nth(k)).map(|w| (k, w)));
    let counts: Vec<u32> = match (get(Pos::First), get(Pos::Last), nth, cons.len()) {
        (Some(a), None, None, 1) => (0..m)
            .map(|i| words.by_first[at(a[i])].len() as u32)
            .collect(),
        (None, Some(z), None, 1) => (0..m)
            .map(|i| words.by_last[at(z[i])].len() as u32)
            .collect(),
        (Some(a), Some(z), None, 2) => (0..m).map(|i| words.by_ends[at(a[i])][at(z[i])]).collect(),
        (Some(a), Some(z), Some((k, x)), 3) => (0..m)
            .map(|i| words.ends_nth(k, a[i], z[i], x[i]))
            .collect(),
        (Some(a), None, Some((k, x)), 2) => {
            (0..m).map(|i| words.first_nth(k, a[i], x[i])).collect()
        }
        _ => return None,
    };
    if counts.contains(&0) {
        return Some(f64::INFINITY);
    }
    Some(counts.iter().map(|&c| f64::from(c).log2()).sum())
}

fn draw_shape(rng: &mut ChaCha8Rng) -> Option<Shape> {
    match rng.gen_range(0..100) {
        0..=11 => Some(Shape::Ascending),
        12..=23 => Some(Shape::Descending),
        24..=39 => Some(Shape::Alphabetical),
        _ => None,
    }
}

fn pick_lengths(
    rng: &mut ChaCha8Rng,
    avail: &[Vec<usize>],
    descending: bool,
) -> Option<Vec<usize>> {
    let m = avail.len();
    (0..40).find_map(|_| {
        let mut ls: Vec<usize> = (3..=9).collect();
        ls.shuffle(rng);
        ls.truncate(m);
        ls.sort();
        if descending {
            ls.reverse();
        }
        ls.iter()
            .enumerate()
            .all(|(i, l)| avail[i].contains(l))
            .then_some(ls)
    })
}

fn pick_weighted(rng: &mut ChaCha8Rng, words: &Words, pool: &[usize]) -> Option<usize> {
    pool.choose_weighted(rng, |&k| weight(words.list[k].zipf))
        .ok()
        .copied()
}

/// One word per slot from the per-slot pools, fitted to the shape if there is one.
fn sample_solution(
    words: &Words,
    rng: &mut ChaCha8Rng,
    pools: &[Vec<usize>],
    shape: Option<Shape>,
) -> Option<Vec<usize>> {
    let m = pools.len();
    match shape {
        None => (0..m)
            .map(|i| pick_weighted(rng, words, &pools[i]))
            .collect(),
        Some(Shape::Ascending | Shape::Descending) => {
            let avail: Vec<Vec<usize>> = pools
                .iter()
                .map(|p| {
                    let mut ls: Vec<usize> = p.iter().map(|&k| words.list[k].b.len()).collect();
                    ls.sort();
                    ls.dedup();
                    ls
                })
                .collect();
            let descending = matches!(shape, Some(Shape::Descending));
            let lens = pick_lengths(rng, &avail, descending)?;
            (0..m)
                .map(|i| {
                    let fit: Vec<usize> = pools[i]
                        .iter()
                        .copied()
                        .filter(|&k| words.list[k].b.len() == lens[i])
                        .collect();
                    pick_weighted(rng, words, &fit)
                })
                .collect()
        }
        Some(Shape::Alphabetical) => {
            let mut hi: Vec<&str> = vec![""; m];
            let mut bound: Option<&str> = None;
            for i in (0..m).rev() {
                let best = pools[i]
                    .iter()
                    .map(|&k| words.list[k].s.as_str())
                    .filter(|s| bound.is_none_or(|b| *s < b))
                    .max()?;
                hi[i] = best;
                bound = Some(best);
            }
            let mut prev: Option<&str> = None;
            let mut out = Vec::with_capacity(m);
            for i in 0..m {
                let fit: Vec<usize> = pools[i]
                    .iter()
                    .copied()
                    .filter(|&k| {
                        let s = words.list[k].s.as_str();
                        prev.is_none_or(|p| s > p) && s <= hi[i]
                    })
                    .collect();
                let k = pick_weighted(rng, words, &fit)?;
                prev = Some(words.list[k].s.as_str());
                out.push(k);
            }
            Some(out)
        }
    }
}

fn acrostics(
    cats: &[Category],
    eligible: &[usize],
    rng: &mut ChaCha8Rng,
    m: usize,
) -> Option<Vec<Constraint>> {
    let two = rng.gen_bool(0.75);
    let mut positions = vec![Pos::First];
    if two {
        positions.push(if rng.gen_bool(0.8) {
            Pos::Last
        } else {
            Pos::Nth(2)
        });
    } else if rng.gen_bool(0.3) {
        positions[0] = Pos::Last;
    }
    if two && m >= LONG_PHRASE && rng.gen_bool(0.5) {
        let spare: Vec<Pos> = [Pos::Nth(2), Pos::Nth(3)]
            .into_iter()
            .filter(|p| !positions.contains(p))
            .collect();
        positions.extend(spare.choose(rng));
    }
    let mut order = eligible.to_vec();
    order.shuffle(rng);
    if order.len() < positions.len() {
        return None;
    }
    positions
        .iter()
        .zip(order)
        .map(|(pos, c)| {
            let members: Vec<&String> = cats[c].members.iter().filter(|w| w.len() == m).collect();
            Some(Constraint::Acrostic {
                pos: *pos,
                category: cats[c].name.clone(),
                article: cats[c].article.clone(),
                word: (*members.choose(rng)?).clone(),
            })
        })
        .collect()
}

fn derived_pool(words: &Words, rng: &mut ChaCha8Rng, solution: &[usize]) -> Vec<Constraint> {
    let m = solution.len();
    let sol: Vec<_> = solution.iter().map(|&k| &words.list[k]).collect();
    let lens: Vec<usize> = sol.iter().map(|w| w.b.len()).collect();
    let mut pool = Vec::new();
    let mut sorted = lens.clone();
    sorted.sort();
    sorted.dedup();
    if sorted.len() == m {
        pool.push(Constraint::LengthsDistinct);
    }
    if lens.windows(2).all(|p| p[0] < p[1]) {
        pool.push(Constraint::LengthsAscending);
    }
    if lens.windows(2).all(|p| p[0] > p[1]) {
        pool.push(Constraint::LengthsDescending);
    }
    pool.push(Constraint::TotalLetters {
        value: lens.iter().sum::<usize>() as u32,
    });
    let scrabble = Constraint::ScrabbleTotal {
        value: sol.iter().map(|w| w.score).sum(),
    };
    pool.push(scrabble.clone());
    pool.push(scrabble);
    let shared: Vec<u8> = (b'a'..=b'z')
        .filter(|c| sol.iter().all(|w| w.b.contains(c)))
        .collect();
    if let Some(&c) = shared.choose(rng) {
        pool.push(Constraint::EveryContains { letter: c as char });
    }
    let absent: Vec<u8> = b"etaoinsrhl"
        .iter()
        .copied()
        .filter(|c| sol.iter().all(|w| !w.b.contains(c)))
        .collect();
    if let Some(&c) = absent.choose(rng) {
        pool.push(Constraint::NoneContains { letter: c as char });
    }
    if sol.windows(2).all(|p| p[0].s < p[1].s) {
        pool.push(Constraint::Alphabetical);
    }
    pool.push(Constraint::DoubleLetters {
        value: sol.iter().filter(|w| has_double(&w.b)).count() as u32,
    });
    let longest = *lens.iter().max().unwrap();
    if lens.iter().filter(|&&l| l == longest).count() == 1 {
        pool.push(Constraint::LongestSlot {
            slot: lens.iter().position(|&l| l == longest).unwrap(),
        });
    }
    pool.shuffle(rng);
    pool
}

fn attempt_once(
    words: &Words,
    cats: &[Category],
    rng: &mut ChaCha8Rng,
    ck: usize,
    cap_hits: &mut u32,
) -> Option<(Puzzle, f64)> {
    let cw = words.list[ck].b.clone();
    let m = cw.len();
    let ceiling = bits_ceiling(words, m);
    let shape = draw_shape(rng);
    let eligible: Vec<usize> = (0..cats.len())
        .filter(|&c| cats[c].members.iter().any(|w| w.len() == m))
        .collect();
    let (mut cons, n, solution) = (0..ACROSTIC_TRIES).find_map(|_| {
        let mut cons = acrostics(cats, &eligible, rng, m)?;
        let positions: Vec<Pos> = cons
            .iter()
            .filter_map(|c| match c {
                Constraint::Acrostic { pos, .. } => Some(*pos),
                _ => None,
            })
            .collect();
        let mut n_choices: Vec<usize> = (1..=3)
            .filter(|&k| {
                !positions.contains(&Pos::Nth(k)) && !(k == 1 && positions.contains(&Pos::First))
            })
            .collect();
        n_choices.shuffle(rng);
        let n = *n_choices.first()?;
        let word_at = |p: Pos| {
            cons.iter().find_map(|c| match c {
                Constraint::Acrostic { pos, word, .. } if *pos == p => Some(word.as_bytes()),
                _ => None,
            })
        };
        if let (Some(a), Some(z)) = (word_at(Pos::First), word_at(Pos::Last)) {
            if (0..m).any(|i| words.pool_with(n, a[i], z[i], cw[i]) == 0) {
                return None;
            }
        }
        let plant = m >= LONG_PHRASE && rng.gen_bool(0.5);
        if let Some(bits) = quick_bits(words, &cons, m) {
            let planted = if plant {
                PLANT_MAX_DROP * m as f64
            } else {
                0.0
            };
            if bits.is_infinite() || bits < MIN_BITS || bits - planted > ceiling {
                return None;
            }
        }
        if plant {
            let letter = *b"etaoinsrhl".choose(rng)? as char;
            cons.push(Constraint::NoneContains { letter });
        }
        let cands = Search {
            words,
            m,
            n,
            cons: &cons,
        }
        .slot_candidates_within(ceiling)?;
        let bits: f64 = cands.iter().map(|c| (c.len() as f64).log2()).sum();
        if bits < MIN_BITS {
            return None;
        }
        let masks: Vec<u32> = cands
            .iter()
            .map(|c| {
                c.iter()
                    .filter(|&&k| words.list[k].in_pool())
                    .fold(0, |acc, &k| acc | 1 << (words.list[k].b[n - 1] - b'a'))
            })
            .collect();
        let covered = cw
            .iter()
            .zip(&masks)
            .all(|(&c, mask)| mask >> (c - b'a') & 1 == 1);
        if !covered {
            return None;
        }
        let draws = if shape.is_some() { SHAPE_DRAWS } else { 1 };
        let solution = (0..draws).find_map(|_| {
            let pools: Vec<Vec<usize>> = (0..m)
                .map(|i| {
                    cands[i]
                        .iter()
                        .copied()
                        .filter(|&k| words.list[k].b[n - 1] == cw[i] && words.list[k].in_pool())
                        .collect()
                })
                .collect();
            let solution = sample_solution(words, rng, &pools, shape)?;
            let mut distinct = solution.clone();
            distinct.sort();
            distinct.dedup();
            (distinct.len() == m).then_some(solution)
        })?;
        Some((cons, n, solution))
    })?;
    let mut pool = derived_pool(words, rng, &solution);
    let mut pinned: Vec<Constraint> = cons
        .iter()
        .filter(|c| !matches!(c, Constraint::Acrostic { .. }))
        .cloned()
        .collect();
    pinned.extend(shape.map(Shape::constraint));
    cons.extend(shape.map(Shape::constraint));
    pool.retain(|c| !pinned.contains(c));

    loop {
        let out = Search {
            words,
            m,
            n,
            cons: &cons,
        }
        .run(2, NODE_BUDGET);
        if out.aborted {
            return None;
        }
        if out.solutions.len() == 1 {
            debug_assert_eq!(out.solutions[0], solution);
            let mut i = 0;
            while i < cons.len() {
                if matches!(cons[i], Constraint::Acrostic { .. }) || pinned.contains(&cons[i]) {
                    i += 1;
                    continue;
                }
                let mut trial = cons.clone();
                trial.remove(i);
                let t = Search {
                    words,
                    m,
                    n,
                    cons: &trial,
                }
                .run(2, NODE_BUDGET);
                if !t.aborted && t.solutions.len() == 1 {
                    cons = trial;
                } else {
                    i += 1;
                }
            }
            let bits = Search {
                words,
                m,
                n,
                cons: &cons,
            }
            .bits();
            if !(MIN_BITS..=MAX_BITS).contains(&bits) {
                return None;
            }
            let checksum = String::from_utf8(cw).unwrap();
            return Some((
                Puzzle {
                    m,
                    n,
                    cons,
                    solution,
                    checksum,
                },
                bits,
            ));
        }
        if cons.len() >= MAX_CONSTRAINTS {
            *cap_hits += 1;
            return None;
        }
        let c = pool.pop()?;
        if cons.iter().any(|e| e.kind() == c.kind()) {
            continue;
        }
        cons.push(c);
    }
}
