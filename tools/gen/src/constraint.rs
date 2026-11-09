use crate::words::Word;
use serde::{Serialize, Serializer};

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Pos {
    First,
    Last,
    Nth(usize),
}

impl Serialize for Pos {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        match self {
            Pos::First => s.serialize_str("first"),
            Pos::Last => s.serialize_str("last"),
            Pos::Nth(k) => s.serialize_u64(*k as u64),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum Constraint {
    Acrostic {
        pos: Pos,
        category: String,
        article: String,
        word: String,
    },
    LengthsDistinct,
    LengthsAscending,
    LengthsDescending,
    TotalLetters {
        value: u32,
    },
    ScrabbleTotal {
        value: u32,
    },
    EveryContains {
        letter: char,
    },
    NoneContains {
        letter: char,
    },
    Alphabetical,
    DoubleLetters {
        value: u32,
    },
    LongestSlot {
        slot: usize,
    },
}

pub const ORDINALS: [&str; 9] = [
    "first", "second", "third", "fourth", "fifth", "sixth", "seventh", "eighth", "ninth",
];

const NUMBERS: [&str; 8] = ["no", "one", "two", "three", "four", "five", "six", "seven"];

pub fn letter_at(b: &[u8], pos: Pos) -> Option<u8> {
    match pos {
        Pos::First => b.first().copied(),
        Pos::Last => b.last().copied(),
        Pos::Nth(k) => b.get(k - 1).copied(),
    }
}

pub fn has_double(b: &[u8]) -> bool {
    b.windows(2).any(|w| w[0] == w[1])
}

fn article(c: char) -> &'static str {
    if "aefhilmnorsx".contains(c) {
        "an"
    } else {
        "a"
    }
}

pub fn checksum_line(n: usize) -> String {
    format!(
        "The checksum is the {} letter of each word.",
        ORDINALS[n - 1]
    )
}

impl Constraint {
    pub fn kind(&self) -> &'static str {
        match self {
            Constraint::Acrostic { .. } => "acrostic",
            Constraint::LengthsDistinct => "lengthsDistinct",
            Constraint::LengthsAscending => "lengthsAscending",
            Constraint::LengthsDescending => "lengthsDescending",
            Constraint::TotalLetters { .. } => "totalLetters",
            Constraint::ScrabbleTotal { .. } => "scrabbleTotal",
            Constraint::EveryContains { .. } => "everyContains",
            Constraint::NoneContains { .. } => "noneContains",
            Constraint::Alphabetical => "alphabetical",
            Constraint::DoubleLetters { .. } => "doubleLetters",
            Constraint::LongestSlot { .. } => "longestSlot",
        }
    }

    pub fn describe(&self) -> String {
        match self {
            Constraint::Acrostic {
                pos,
                category,
                article,
                ..
            } => {
                let p = match pos {
                    Pos::First => "first",
                    Pos::Last => "last",
                    Pos::Nth(k) => ORDINALS[k - 1],
                };
                format!("The {p} letters spell {article} {category}.")
            }
            Constraint::LengthsDistinct => "Every word has a different length.".into(),
            Constraint::LengthsAscending => "Each word is longer than the one before.".into(),
            Constraint::LengthsDescending => "Each word is shorter than the one before.".into(),
            Constraint::TotalLetters { value } => {
                format!("The phrase has {value} letters in total.")
            }
            Constraint::ScrabbleTotal { value } => {
                format!("The Scrabble score of the phrase is {value}.")
            }
            Constraint::EveryContains { letter } => format!(
                "Every word contains {} {}.",
                article(*letter),
                letter.to_ascii_uppercase()
            ),
            Constraint::NoneContains { letter } => format!(
                "No word contains {} {}.",
                article(*letter),
                letter.to_ascii_uppercase()
            ),
            Constraint::Alphabetical => "The words are in alphabetical order.".into(),
            Constraint::DoubleLetters { value: 0 } => "No word contains a double letter.".into(),
            Constraint::DoubleLetters { value: 1 } => {
                "Exactly one word contains a double letter.".into()
            }
            Constraint::DoubleLetters { value } => format!(
                "Exactly {} words contain a double letter.",
                NUMBERS[*value as usize]
            ),
            Constraint::LongestSlot { slot } => {
                format!("The {} word is the longest.", ORDINALS[*slot])
            }
        }
    }

    pub fn is_local(&self) -> bool {
        matches!(
            self,
            Constraint::Acrostic { .. }
                | Constraint::EveryContains { .. }
                | Constraint::NoneContains { .. }
        )
    }

    /// Per-word filter for slot i; only meaningful for local constraints.
    pub fn word_ok(&self, i: usize, w: &Word) -> bool {
        match self {
            Constraint::Acrostic { pos, word, .. } => {
                letter_at(&w.b, *pos) == Some(word.as_bytes()[i])
            }
            Constraint::EveryContains { letter } => w.b.contains(&(*letter as u8)),
            Constraint::NoneContains { letter } => !w.b.contains(&(*letter as u8)),
            _ => true,
        }
    }

    pub fn phrase_ok(&self, ws: &[&Word]) -> bool {
        match self {
            c if c.is_local() => ws.iter().enumerate().all(|(i, w)| c.word_ok(i, w)),
            Constraint::LengthsDistinct => {
                let mut seen = 0u32;
                ws.iter().all(|w| {
                    let bit = 1 << w.b.len();
                    let ok = seen & bit == 0;
                    seen |= bit;
                    ok
                })
            }
            Constraint::LengthsAscending => ws.windows(2).all(|p| p[0].b.len() < p[1].b.len()),
            Constraint::LengthsDescending => ws.windows(2).all(|p| p[0].b.len() > p[1].b.len()),
            Constraint::TotalLetters { value } => {
                ws.iter().map(|w| w.b.len() as u32).sum::<u32>() == *value
            }
            Constraint::ScrabbleTotal { value } => {
                ws.iter().map(|w| w.score).sum::<u32>() == *value
            }
            Constraint::Alphabetical => ws.windows(2).all(|p| p[0].s < p[1].s),
            Constraint::DoubleLetters { value } => {
                ws.iter().filter(|w| has_double(&w.b)).count() as u32 == *value
            }
            Constraint::LongestSlot { slot } => {
                let l = ws[*slot].b.len();
                ws.iter()
                    .enumerate()
                    .all(|(j, w)| j == *slot || w.b.len() < l)
            }
            _ => unreachable!(),
        }
    }
}
