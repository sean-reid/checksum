use crate::categories::Category;
use crate::constraint::{checksum_line, Constraint};
use crate::gen::{generate, Report, MAX_ATTEMPTS};
use crate::words::Words;
use serde::Serialize;
use std::fmt;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Date {
    pub y: i64,
    pub m: i64,
    pub d: i64,
}

const EPOCH: Date = Date {
    y: 2026,
    m: 11,
    d: 8,
};

impl Date {
    pub fn parse(s: &str) -> Result<Date, String> {
        let bad = || format!("bad date {s:?}, want YYYY-MM-DD");
        let parts: Vec<&str> = s.split('-').collect();
        let [y, m, d] = parts[..] else {
            return Err(bad());
        };
        if y.len() != 4 || m.len() != 2 || d.len() != 2 {
            return Err(bad());
        }
        let date = Date {
            y: y.parse().map_err(|_| bad())?,
            m: m.parse().map_err(|_| bad())?,
            d: d.parse().map_err(|_| bad())?,
        };
        if date.add_days(0) != date {
            return Err(bad());
        }
        Ok(date)
    }

    pub fn days(self) -> i64 {
        let y = if self.m <= 2 { self.y - 1 } else { self.y };
        let era = y.div_euclid(400);
        let yoe = y - era * 400;
        let mp = (self.m + 9) % 12;
        let doy = (153 * mp + 2) / 5 + self.d - 1;
        let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
        era * 146097 + doe - 719468
    }

    pub fn from_days(z: i64) -> Date {
        let z = z + 719468;
        let era = z.div_euclid(146097);
        let doe = z - era * 146097;
        let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
        let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
        let mp = (5 * doy + 2) / 153;
        let d = doy - (153 * mp + 2) / 5 + 1;
        let m = if mp < 10 { mp + 3 } else { mp - 9 };
        let y = yoe + era * 400 + i64::from(m <= 2);
        Date { y, m, d }
    }

    pub fn add_days(self, n: i64) -> Date {
        Date::from_days(self.days() + n)
    }

    pub fn number(self) -> Option<u32> {
        u32::try_from(self.days() - EPOCH.days() + 1)
            .ok()
            .filter(|&n| n >= 1)
    }

    pub fn seed(self) -> u64 {
        (self.y * 10000 + self.m * 100 + self.d) as u64
    }
}

impl fmt::Display for Date {
    fn fmt(&self, f: &mut fmt::Formatter) -> fmt::Result {
        write!(f, "{:04}-{:02}-{:02}", self.y, self.m, self.d)
    }
}

#[derive(Serialize)]
pub struct Puzzle {
    pub number: u32,
    pub date: String,
    pub m: usize,
    pub n: usize,
    pub constraints: Vec<Constraint>,
    pub solution: Vec<String>,
    pub checksum: String,
}

impl Puzzle {
    pub fn descriptions(&self) -> Vec<String> {
        let mut out: Vec<String> = self.constraints.iter().map(Constraint::describe).collect();
        out.push(checksum_line(self.n));
        out
    }

    pub fn text(&self) -> String {
        let mut lines = self.descriptions();
        lines.push(self.solution.join(" "));
        lines.push(self.checksum.clone());
        lines.join("\n")
    }
}

pub struct Built {
    pub puzzle: Puzzle,
    pub report: Report,
}

pub fn build(words: &Words, cats: &[Category], date: Date, seed: &str) -> Result<Built, String> {
    let number = date
        .number()
        .ok_or_else(|| format!("{date} is before the first puzzle"))?;
    let report = generate(
        words,
        cats,
        crate::seed::day(seed, date.seed()),
        number as usize - 1,
    )
    .ok_or_else(|| format!("no puzzle for {date} after {MAX_ATTEMPTS} attempts"))?;
    let p = &report.puzzle;
    let puzzle = Puzzle {
        number,
        date: date.to_string(),
        m: p.m,
        n: p.n,
        constraints: p.cons.clone(),
        solution: p
            .solution
            .iter()
            .map(|&k| words.list[k].s.clone())
            .collect(),
        checksum: p.checksum.clone(),
    };
    Ok(Built { puzzle, report })
}
