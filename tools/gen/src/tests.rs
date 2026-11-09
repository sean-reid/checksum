use crate::categories;
use crate::constraint::{checksum_line, Constraint, Pos};
use crate::fixtures::{self, File};
use crate::gen::{load_words, FALLBACK_STEP, MAX_BITS, MIN_BITS};
use crate::puzzle::{build, Date};
use crate::search::{Search, NODE_BUDGET};
use crate::words::{Word, Words, POOL_ZIPF, SHORT_POOL_ZIPF};
use std::collections::HashSet;
use std::sync::OnceLock;

const SEED: &str = "dev";

struct Env {
    words: Words,
    cats: Vec<categories::Category>,
    fixtures: File,
}

fn env() -> &'static Env {
    static ENV: OnceLock<Env> = OnceLock::new();
    ENV.get_or_init(|| {
        let cats = categories::load();
        let words = load_words(SEED);
        let (fixtures, _) = fixtures::generate_all(&words, &cats, SEED).unwrap();
        Env {
            words,
            cats,
            fixtures,
        }
    })
}

fn word<'a>(words: &'a Words, s: &str) -> &'a Word {
    words
        .list
        .iter()
        .find(|w| w.s == s)
        .unwrap_or_else(|| panic!("{s} not in list"))
}

fn phrase<'a>(words: &'a Words, ws: &[String]) -> Vec<&'a Word> {
    ws.iter().map(|s| word(words, s)).collect()
}

#[test]
fn same_date_same_puzzle() {
    let e = env();
    let d = Date::parse("2026-12-25").unwrap();
    let a = serde_json::to_string(&build(&e.words, &e.cats, d, SEED).unwrap().puzzle).unwrap();
    let b = serde_json::to_string(&build(&e.words, &e.cats, d, SEED).unwrap().puzzle).unwrap();
    assert_eq!(a, b);
}

#[test]
fn seed_decides_the_puzzle() {
    let day = Date::parse("2026-11-10").unwrap();
    let cats = categories::load();
    let make = |seed: &str| {
        let words = load_words(seed);
        serde_json::to_string(&build(&words, &cats, day, seed).unwrap().puzzle).unwrap()
    };
    let (a, again, b) = (make("alpha"), make("alpha"), make("beta"));
    assert_eq!(a, again);
    assert_ne!(a, b);
}

#[test]
fn numbering_and_dates() {
    assert_eq!(Date::parse("2026-11-08").unwrap().number(), Some(1));
    assert_eq!(Date::parse("2027-03-01").unwrap().number(), Some(114));
    assert_eq!(Date::parse("2026-11-07").unwrap().number(), None);
    assert_eq!(Date::parse("2026-11-08").unwrap().seed(), 20261108);
    assert_eq!(
        Date::parse("2028-02-28").unwrap().add_days(1).to_string(),
        "2028-02-29"
    );
    assert!(Date::parse("2027-02-29").is_err());
}

#[test]
fn fixture_puzzles_are_unique() {
    let e = env();
    for f in &e.fixtures.puzzles {
        let p = &f.puzzle;
        let out = Search {
            words: &e.words,
            m: p.m,
            n: p.n,
            cons: &p.constraints,
        }
        .run(2, NODE_BUDGET);
        assert!(!out.aborted, "{}", p.date);
        assert_eq!(out.solutions.len(), 1, "{}", p.date);
        let found: Vec<&str> = out.solutions[0]
            .iter()
            .map(|&k| e.words.list[k].s.as_str())
            .collect();
        assert_eq!(found, p.solution);
    }
}

#[test]
fn fixture_solutions_satisfy_every_constraint() {
    let e = env();
    for f in &e.fixtures.puzzles {
        let p = &f.puzzle;
        let ws = phrase(&e.words, &p.solution);
        assert!(p.constraints.iter().all(|c| c.phrase_ok(&ws)), "{}", p.date);
        let ck: String = ws.iter().map(|w| w.b[p.n - 1] as char).collect();
        assert_eq!(ck, p.checksum);
        assert!(e.words.list.iter().any(|w| w.s == ck));
        let distinct: HashSet<&String> = p.solution.iter().collect();
        assert_eq!(distinct.len(), p.m);
        assert!((4..=7).contains(&p.m));
        assert_eq!(f.descriptions.len(), p.constraints.len() + 1);
        assert_eq!(f.descriptions.last().unwrap(), &checksum_line(p.n));
    }
}

#[test]
fn fixture_fails_break_exactly_one_constraint() {
    let e = env();
    let mut checked = 0;
    for f in &e.fixtures.puzzles {
        let p = &f.puzzle;
        for fail in &f.fails {
            let ws = phrase(&e.words, &fail.words);
            assert_eq!(ws.len(), p.m);
            let ck: String = ws.iter().map(|w| w.b[p.n - 1] as char).collect();
            assert!(e.words.list.iter().any(|w| w.s == ck), "checksum {ck}");
            for (j, c) in p.constraints.iter().enumerate() {
                assert_eq!(
                    c.phrase_ok(&ws),
                    j != fail.constraint,
                    "{} {:?} vs {}",
                    p.date,
                    fail.words,
                    j
                );
            }
            checked += 1;
        }
    }
    assert!(checked > 0);
}

#[test]
fn solution_words_obey_pool_rules() {
    let e = env();
    let deny: HashSet<&str> = include_str!("../data/deny.txt")
        .split_whitespace()
        .collect();
    for f in &e.fixtures.puzzles {
        for s in &f.puzzle.solution {
            let w = word(&e.words, s);
            assert!(!deny.contains(s.as_str()), "{s} is denied");
            assert!(w.zipf >= POOL_ZIPF, "{s}");
            if s.len() == 3 {
                assert!(w.zipf >= SHORT_POOL_ZIPF && w.core, "{s}");
            }
        }
    }
}

#[test]
fn categories_are_lowercase_letters() {
    let cats = categories::load();
    assert_eq!(cats.len(), 30);
    for c in &cats {
        let unique: HashSet<&String> = c.members.iter().collect();
        assert_eq!(unique.len(), c.members.len(), "duplicate in {}", c.name);
        for m in &c.members {
            assert!(
                !m.is_empty() && m.bytes().all(|b| b.is_ascii_lowercase()),
                "{}: {m}",
                c.name
            );
        }
    }
}

#[test]
fn word_list_is_clean() {
    let e = env();
    for w in &e.words.list {
        assert!(
            w.b.iter().all(u8::is_ascii_lowercase) && (3..=9).contains(&w.b.len()),
            "{}",
            w.s
        );
    }
}

#[test]
fn describe_texts() {
    let acro = |pos, category: &str, article: &str| Constraint::Acrostic {
        pos,
        category: category.into(),
        article: article.into(),
        word: String::new(),
    };
    let cases: Vec<(Constraint, &str)> = vec![
        (
            acro(Pos::First, "planet", "a"),
            "The first letters spell a planet.",
        ),
        (
            acro(Pos::Last, "animal", "an"),
            "The last letters spell an animal.",
        ),
        (
            acro(Pos::Nth(2), "colour", "a"),
            "The second letters spell a colour.",
        ),
        (
            Constraint::LengthsDistinct,
            "Every word has a different length.",
        ),
        (
            Constraint::LengthsAscending,
            "Each word is longer than the one before.",
        ),
        (
            Constraint::LengthsDescending,
            "Each word is shorter than the one before.",
        ),
        (
            Constraint::TotalLetters { value: 31 },
            "The phrase has 31 letters in total.",
        ),
        (
            Constraint::ScrabbleTotal { value: 70 },
            "The Scrabble score of the phrase is 70.",
        ),
        (
            Constraint::EveryContains { letter: 'e' },
            "Every word contains an E.",
        ),
        (
            Constraint::EveryContains { letter: 'b' },
            "Every word contains a B.",
        ),
        (
            Constraint::NoneContains { letter: 'e' },
            "No word contains an E.",
        ),
        (
            Constraint::Alphabetical,
            "The words are in alphabetical order.",
        ),
        (
            Constraint::DoubleLetters { value: 0 },
            "No word contains a double letter.",
        ),
        (
            Constraint::DoubleLetters { value: 1 },
            "Exactly one word contains a double letter.",
        ),
        (
            Constraint::DoubleLetters { value: 2 },
            "Exactly two words contain a double letter.",
        ),
        (
            Constraint::LongestSlot { slot: 2 },
            "The third word is the longest.",
        ),
    ];
    for (c, text) in cases {
        assert_eq!(c.describe(), text);
    }
    assert_eq!(
        checksum_line(3),
        "The checksum is the third letter of each word."
    );
}

#[test]
fn json_shape() {
    let acro = Constraint::Acrostic {
        pos: Pos::Nth(2),
        category: "colour".into(),
        article: "a".into(),
        word: "red".into(),
    };
    assert_eq!(
        serde_json::to_string(&acro).unwrap(),
        r#"{"kind":"acrostic","pos":2,"category":"colour","article":"a","word":"red"}"#
    );
    assert_eq!(
        serde_json::to_string(&Constraint::LongestSlot { slot: 2 }).unwrap(),
        r#"{"kind":"longestSlot","slot":2}"#
    );
    assert_eq!(
        serde_json::to_string(&Constraint::EveryContains { letter: 'e' }).unwrap(),
        r#"{"kind":"everyContains","letter":"e"}"#
    );
    assert_eq!(
        serde_json::to_string(&Constraint::LengthsDistinct).unwrap(),
        r#"{"kind":"lengthsDistinct"}"#
    );
}

#[test]
fn thirty_consecutive_dates_generate_in_band() {
    let e = env();
    let start = Date::parse("2026-11-08").unwrap();
    let mut seen = HashSet::new();
    for i in 0..30 {
        let d = start.add_days(i);
        let b = build(&e.words, &e.cats, d, SEED).unwrap_or_else(|err| panic!("{err}"));
        assert!((MIN_BITS..=MAX_BITS).contains(&b.report.bits), "{d}");
        assert_eq!(b.puzzle.number as i64, i + 1);
        let at = (i as usize + b.report.fallbacks as usize * FALLBACK_STEP) % e.words.order.len();
        assert_eq!(b.puzzle.checksum, e.words.list[e.words.order[at]].s);
        assert!(
            seen.insert(b.puzzle.checksum.clone()),
            "{d} repeats a checksum"
        );
    }
}

#[test]
fn checksum_words_are_unique_pool_words() {
    let e = env();
    let mut seen = HashSet::new();
    for &k in &e.words.order {
        let w = &e.words.list[k];
        assert!(w.in_pool() && (4..=7).contains(&w.b.len()), "{}", w.s);
        assert!(seen.insert(k), "{} listed twice", w.s);
    }
    assert!(e.words.order.len() > 1000);
}
