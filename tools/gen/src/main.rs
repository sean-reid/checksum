mod categories;
mod constraint;
mod gen;
mod probe;
mod puzzle;
mod search;
mod seed;
mod stats;
mod words;

use puzzle::{build, Date};
use serde::Serialize;
use std::process::ExitCode;

const USAGE: &str = "usage: checksum-gen day <YYYY-MM-DD> [--text]
       checksum-gen range <YYYY-MM-DD> <days>
       checksum-gen stats <YYYY-MM-DD> <days>
       checksum-gen feasible > data/checksum_words.txt
every command takes --seed <string>, defaulting to $PUZZLE_SEED, else \"dev\"
(range refuses to run without one)";

#[derive(Serialize)]
struct Entry {
    key: String,
    value: String,
}

fn count(arg: Option<&String>) -> Result<i64, String> {
    arg.and_then(|s| s.parse().ok())
        .filter(|&n| n > 0)
        .ok_or_else(|| USAGE.to_string())
}

fn date(arg: Option<&String>) -> Result<Date, String> {
    Date::parse(arg.ok_or_else(|| USAGE.to_string())?)
}

const DEV_SEED: &str = "dev";

/// Pulls `--seed <string>` out of the arguments.
fn take_seed(args: &mut Vec<String>) -> Result<Option<String>, String> {
    let Some(i) = args.iter().position(|a| a == "--seed") else {
        return Ok(None);
    };
    if i + 1 >= args.len() {
        return Err("--seed needs a value".into());
    }
    let value = args.remove(i + 1);
    args.remove(i);
    Ok(Some(value))
}

fn env_seed() -> Option<String> {
    std::env::var("PUZZLE_SEED").ok().filter(|s| !s.is_empty())
}

fn run(args: &mut Vec<String>) -> Result<(), String> {
    let flag = take_seed(args)?;
    let cmd = args.first().map(String::as_str).unwrap_or("");
    let seed = match cmd {
        "range" => flag
            .or_else(env_seed)
            .ok_or("range needs --seed or the PUZZLE_SEED environment variable")?,
        _ => flag.or_else(env_seed).unwrap_or_else(|| DEV_SEED.into()),
    };
    let cats = categories::load();
    let words = gen::load_words(&seed);
    match cmd {
        "day" => {
            let b = build(&words, &cats, date(args.get(1))?, &seed)?;
            if args.iter().any(|a| a == "--text") {
                println!("{}", b.puzzle.text());
            } else {
                println!("{}", serde_json::to_string_pretty(&b.puzzle).unwrap());
            }
        }
        "range" => {
            let start = date(args.get(1))?;
            let days = count(args.get(2))?;
            let mut entries = Vec::new();
            for i in 0..days {
                let b = build(&words, &cats, start.add_days(i), &seed)?;
                entries.push(Entry {
                    key: format!("puzzle:{}", b.puzzle.number),
                    value: serde_json::to_string(&b.puzzle).unwrap(),
                });
            }
            println!("{}", serde_json::to_string(&entries).unwrap());
        }
        "feasible" => print!("{}", probe::run(&words, &cats)),
        "stats" => print!(
            "{}",
            stats::run(
                &words,
                &cats,
                &seed,
                date(args.get(1))?,
                count(args.get(2))?
            )
        ),
        _ => return Err(USAGE.to_string()),
    }
    Ok(())
}

fn main() -> ExitCode {
    let mut args: Vec<String> = std::env::args().skip(1).collect();
    match run(&mut args) {
        Ok(()) => ExitCode::SUCCESS,
        Err(e) => {
            eprintln!("{e}");
            ExitCode::FAILURE
        }
    }
}
