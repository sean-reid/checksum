import { execFileSync } from "node:child_process";
import { readFileSync, rmSync } from "node:fs";
import { puzzleKey, type StoredPuzzle } from "../shared/constraints.ts";
import { puzzleNumber } from "../shared/day.ts";

const NAMESPACE_ID = "3f3a19381382454f8c1df5c71f9167b4";
const persist = process.argv[2] ?? ".wrangler/api-state";

const today = new Date().toISOString().slice(0, 10);
const number = puzzleNumber(today)!;
const fixture = JSON.parse(readFileSync("tests/fixtures/puzzles.json", "utf8")) as {
  puzzles: (StoredPuzzle & Record<string, unknown>)[];
};
const first = fixture.puzzles[0]!;
const { m, n, constraints, solution, checksum } = first;
const stored: StoredPuzzle = { number, date: today, m, n, constraints, solution, checksum };

rmSync(persist, { recursive: true, force: true });
execFileSync(
  "npx",
  [
    "wrangler",
    "kv",
    "key",
    "put",
    "--local",
    "--namespace-id",
    NAMESPACE_ID,
    "--persist-to",
    persist,
    puzzleKey(number),
    JSON.stringify(stored),
  ],
  { stdio: "inherit" },
);
