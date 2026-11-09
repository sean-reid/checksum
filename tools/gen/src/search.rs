use crate::bits::log2_milli;
use crate::categories::Category;
use crate::constraint::{has_double, Constraint, Pos};
use crate::words::{Word, Words};

/// Candidate words tried across one search before it gives up.
pub const NODE_BUDGET: u64 = 20_000_000;

pub struct Search<'a> {
    pub words: &'a Words,
    pub cats: &'a [Category],
    pub m: usize,
    pub n: usize,
    pub cons: &'a [Constraint],
}

pub struct Outcome {
    pub solutions: Vec<Vec<usize>>,
    pub aborted: bool,
    pub nodes: u64,
}

struct State<'a> {
    words: &'a Words,
    cats: &'a [Category],
    cons: &'a [Constraint],
    buckets: Vec<Vec<usize>>,
    min_score: Vec<u32>,
    max_score: Vec<u32>,
    min_len: Vec<u32>,
    max_len: Vec<u32>,
    chosen: Vec<usize>,
    cap: usize,
    budget: u64,
    nodes: u64,
    aborted: bool,
    out: Vec<Vec<usize>>,
}

impl Search<'_> {
    fn slot(&self, i: usize) -> Vec<usize> {
        let keep = |k: &usize| {
            let w = &self.words.list[*k];
            w.b.len() >= self.n && self.cons.iter().all(|c| c.word_ok(i, w))
        };
        let indexed = self.cons.iter().find_map(|c| match c {
            Constraint::Acrostic {
                pos: Pos::First,
                word,
                ..
            } => Some(&self.words.by_first[(word.as_bytes()[i] - b'a') as usize]),
            Constraint::Acrostic {
                pos: Pos::Last,
                word,
                ..
            } => Some(&self.words.by_last[(word.as_bytes()[i] - b'a') as usize]),
            _ => None,
        });
        match indexed {
            Some(list) => list.iter().copied().filter(keep).collect(),
            None => (0..self.words.list.len()).filter(keep).collect(),
        }
    }

    /// Per-slot candidates for the stored acrostic words and the checksum position.
    pub fn slot_candidates(&self) -> Vec<Vec<usize>> {
        (0..self.m).map(|i| self.slot(i)).collect()
    }

    /// Like `slot_candidates`, but gives up as soon as a slot is empty or the
    /// running bit count (thousandths) passes `max_milli`.
    pub fn slot_candidates_within(&self, max_milli: i64) -> Option<Vec<Vec<usize>>> {
        let mut bits = 0;
        let mut out = Vec::with_capacity(self.m);
        for i in 0..self.m {
            let c = self.slot(i);
            if c.is_empty() {
                return None;
            }
            bits += log2_milli(c.len() as u64);
            if bits > max_milli {
                return None;
            }
            out.push(c);
        }
        Some(out)
    }

    /// Bits, in thousandths, of the per-slot candidate counts.
    pub fn bits(&self) -> i64 {
        self.slot_candidates()
            .iter()
            .map(|c| log2_milli(c.len().max(1) as u64))
            .sum()
    }

    /// Every phrase over the whole list that satisfies the constraints as a
    /// player is held to them (an acrostic accepts any member of its category)
    /// and whose checksum is a list word, stopping at `cap` phrases.
    pub fn run(&self, cap: usize, budget: u64) -> Outcome {
        let acrostics: Vec<usize> = (0..self.cons.len())
            .filter(|&i| matches!(self.cons[i], Constraint::Acrostic { .. }))
            .collect();
        let members: Vec<Vec<&str>> = acrostics
            .iter()
            .map(|&i| {
                let Constraint::Acrostic { category, .. } = &self.cons[i] else {
                    unreachable!()
                };
                self.cats
                    .iter()
                    .filter(|c| c.name == *category)
                    .flat_map(|c| c.members.iter())
                    .filter(|w| w.len() == self.m)
                    .map(String::as_str)
                    .collect()
            })
            .collect();
        let mut total = Outcome {
            solutions: Vec::new(),
            aborted: false,
            nodes: 0,
        };
        let mut pick = vec![0usize; acrostics.len()];
        if members.iter().any(|m| m.is_empty()) {
            return total;
        }
        loop {
            let mut cons = self.cons.to_vec();
            for (a, &i) in acrostics.iter().enumerate() {
                if let Constraint::Acrostic { word, .. } = &mut cons[i] {
                    *word = members[a][pick[a]].to_string();
                }
            }
            if self.ends_reachable(&cons) {
                let part = Search {
                    cons: &cons,
                    ..*self
                }
                .run_stored(
                    cap - total.solutions.len(),
                    budget.saturating_sub(total.nodes),
                );
                total.nodes += part.nodes;
                total.solutions.extend(part.solutions);
                if part.aborted {
                    total.aborted = true;
                }
            }
            if total.aborted || total.solutions.len() >= cap {
                return total;
            }
            let mut a = 0;
            loop {
                if a == pick.len() {
                    return total;
                }
                pick[a] += 1;
                if pick[a] < members[a].len() {
                    break;
                }
                pick[a] = 0;
                a += 1;
            }
        }
    }

    /// False when the first and last letter acrostics leave some slot with no
    /// word at all.
    fn ends_reachable(&self, cons: &[Constraint]) -> bool {
        let get = |p: Pos| {
            cons.iter().find_map(|c| match c {
                Constraint::Acrostic { pos, word, .. } if *pos == p => Some(word.as_bytes()),
                _ => None,
            })
        };
        match (get(Pos::First), get(Pos::Last)) {
            (Some(a), Some(z)) => (0..self.m)
                .all(|i| self.words.by_ends[(a[i] - b'a') as usize][(z[i] - b'a') as usize] > 0),
            _ => true,
        }
    }

    /// Like `run`, but each acrostic holds only the word stored in it.
    pub fn run_stored(&self, cap: usize, budget: u64) -> Outcome {
        let cands = self.slot_candidates();
        let mut by_letter: Vec<Vec<Vec<usize>>> = vec![vec![Vec::new(); 26]; self.m];
        for (i, c) in cands.iter().enumerate() {
            for &k in c {
                by_letter[i][(self.words.list[k].b[self.n - 1] - b'a') as usize].push(k);
            }
        }
        let m = self.m;
        let mut st = State {
            words: self.words,
            cats: self.cats,
            cons: self.cons,
            buckets: vec![Vec::new(); m],
            min_score: vec![0; m + 1],
            max_score: vec![0; m + 1],
            min_len: vec![0; m + 1],
            max_len: vec![0; m + 1],
            chosen: Vec::with_capacity(m),
            cap,
            budget,
            nodes: 0,
            aborted: false,
            out: Vec::new(),
        };
        'outer: for &ck in &self.words.by_len[m] {
            let cw = &self.words.list[ck].b;
            for i in 0..m {
                let b = &by_letter[i][(cw[i] - b'a') as usize];
                if b.is_empty() {
                    continue 'outer;
                }
                st.buckets[i] = b.clone();
            }
            for i in (0..m).rev() {
                let (mut mns, mut mxs, mut mnl, mut mxl) = (u32::MAX, 0, u32::MAX, 0);
                for &k in &st.buckets[i] {
                    let w = &self.words.list[k];
                    mns = mns.min(w.score);
                    mxs = mxs.max(w.score);
                    mnl = mnl.min(w.b.len() as u32);
                    mxl = mxl.max(w.b.len() as u32);
                }
                st.min_score[i] = mns + st.min_score[i + 1];
                st.max_score[i] = mxs + st.max_score[i + 1];
                st.min_len[i] = mnl + st.min_len[i + 1];
                st.max_len[i] = mxl + st.max_len[i + 1];
            }
            st.dfs(0, 0, 0, 0, 0);
            if st.aborted || st.out.len() >= cap {
                break;
            }
        }
        Outcome {
            solutions: st.out,
            aborted: st.aborted,
            nodes: st.nodes,
        }
    }
}

impl State<'_> {
    fn prev_len(&self) -> u32 {
        self.words.list[*self.chosen.last().unwrap()].b.len() as u32
    }

    fn dfs(&mut self, i: usize, score: u32, len: u32, lenmask: u32, doubles: u32) {
        if self.aborted || self.out.len() >= self.cap {
            return;
        }
        let m = self.buckets.len();
        if i == m {
            let ws: Vec<&Word> = self.chosen.iter().map(|&k| &self.words.list[k]).collect();
            if self
                .cons
                .iter()
                .all(|c| c.is_local() || c.phrase_ok(&ws, self.cats))
            {
                self.out.push(self.chosen.clone());
            }
            return;
        }
        let bucket = std::mem::take(&mut self.buckets[i]);
        for &k in &bucket {
            self.nodes += 1;
            if self.nodes > self.budget {
                self.aborted = true;
                break;
            }
            if self.chosen.contains(&k) {
                continue;
            }
            let w = &self.words.list[k];
            let l = w.b.len() as u32;
            let s = score + w.score;
            let tl = len + l;
            let d = doubles + has_double(&w.b) as u32;
            let ok = self.cons.iter().all(|c| match c {
                Constraint::ScrabbleTotal { value } => {
                    s + self.min_score[i + 1] <= *value && s + self.max_score[i + 1] >= *value
                }
                Constraint::TotalLetters { value } => {
                    tl + self.min_len[i + 1] <= *value && tl + self.max_len[i + 1] >= *value
                }
                Constraint::LengthsDistinct => lenmask & (1 << l) == 0,
                Constraint::LengthsAscending => i == 0 || self.prev_len() < l,
                Constraint::LengthsDescending => i == 0 || self.prev_len() > l,
                Constraint::Alphabetical => {
                    i == 0 || self.words.list[*self.chosen.last().unwrap()].s < w.s
                }
                Constraint::DoubleLetters { value } => {
                    d <= *value && d + (m - i - 1) as u32 >= *value
                }
                Constraint::LongestSlot { slot } => {
                    if i == *slot {
                        self.chosen
                            .iter()
                            .all(|&p| (self.words.list[p].b.len() as u32) < l)
                    } else if i > *slot {
                        l < self.words.list[self.chosen[*slot]].b.len() as u32
                    } else {
                        true
                    }
                }
                _ => true,
            });
            if !ok {
                continue;
            }
            self.chosen.push(k);
            self.dfs(i + 1, s, tl, lenmask | (1 << l), d);
            self.chosen.pop();
            if self.aborted || self.out.len() >= self.cap {
                break;
            }
        }
        self.buckets[i] = bucket;
    }
}
