use crate::categories::Category;
use crate::constraint::Constraint;
use crate::puzzle::{build, Built, Date, Puzzle};
use crate::search::{Search, NODE_BUDGET};
use crate::words::{Word, Words};
use serde::Serialize;

pub const FIRST_DATE: &str = "2026-11-08";
pub const DAYS: i64 = 10;
const FAIL_CAP: usize = 20_000;

#[derive(Serialize)]
pub struct Fail {
    pub words: Vec<String>,
    pub constraint: usize,
}

#[derive(Serialize)]
pub struct Fixture {
    #[serde(flatten)]
    pub puzzle: Puzzle,
    pub descriptions: Vec<String>,
    pub fails: Vec<Fail>,
}

#[derive(Serialize)]
pub struct File {
    pub puzzles: Vec<Fixture>,
}

/// A phrase that satisfies every constraint but `idx`, with a list-word checksum.
fn failing_phrase(
    words: &Words,
    cats: &[Category],
    built: &Built,
    idx: usize,
) -> Option<Vec<String>> {
    let p = &built.report.puzzle;
    let rest: Vec<Constraint> = p
        .cons
        .iter()
        .enumerate()
        .filter(|(j, _)| *j != idx)
        .map(|(_, c)| c.clone())
        .collect();
    let out = Search {
        words,
        cats,
        m: p.m,
        n: p.n,
        cons: &rest,
    }
    .run(FAIL_CAP, NODE_BUDGET);
    out.solutions.into_iter().find_map(|s| {
        let ws: Vec<&Word> = s.iter().map(|&k| &words.list[k]).collect();
        (!p.cons[idx].phrase_ok(&ws, cats)).then(|| ws.iter().map(|w| w.s.clone()).collect())
    })
}

pub fn fails(words: &Words, cats: &[Category], built: &Built) -> (Vec<Fail>, Vec<String>) {
    let mut fails = Vec::new();
    let mut skipped = Vec::new();
    for (idx, c) in built.report.puzzle.cons.iter().enumerate() {
        if matches!(c, Constraint::Acrostic { .. }) {
            continue;
        }
        match failing_phrase(words, cats, built, idx) {
            Some(w) => fails.push(Fail {
                words: w,
                constraint: idx,
            }),
            None => skipped.push(format!("{} {}: {}", built.puzzle.date, idx, c.kind())),
        }
    }
    (fails, skipped)
}

pub fn generate_all(
    words: &Words,
    cats: &[Category],
    seed: &str,
) -> Result<(File, Vec<String>), String> {
    let start = Date::parse(FIRST_DATE)?;
    let mut puzzles = Vec::new();
    let mut skipped = Vec::new();
    for i in 0..DAYS {
        let built = build(words, cats, start.add_days(i), seed)?;
        let (fails, skip) = fails(words, cats, &built);
        skipped.extend(skip);
        puzzles.push(Fixture {
            descriptions: built.puzzle.descriptions(),
            puzzle: built.puzzle,
            fails,
        });
    }
    Ok((File { puzzles }, skipped))
}

pub fn render(file: &File) -> String {
    let mut s = serde_json::to_string_pretty(file).expect("serialize");
    s.push('\n');
    s
}

pub fn path() -> std::path::PathBuf {
    std::path::Path::new(env!("CARGO_MANIFEST_DIR")).join("../../tests/fixtures/puzzles.json")
}
