import { MAX_WORD_LENGTH, type PuzzleResponse } from "../shared/api.ts";
import {
  check,
  checksumOf,
  describe,
  describeChecksum,
  type Constraint,
  type PublicConstraint,
} from "../shared/constraints.ts";
import { formatElapsed } from "../shared/time.ts";

export const MIN_LISTED_LENGTH = 3;

export interface StoredGame {
  puzzle: PuzzleResponse;
  words: string[];
  answers: Record<string, boolean>;
  counted: boolean;
  solved: boolean;
  revealed: boolean;
  elapsedMs: number | null;
  result: string | null;
}

export interface GameData {
  words: ReadonlySet<string> | null;
  categories: ReadonlyMap<string, readonly string[]> | null;
}

export interface SlotView {
  before: string;
  nth: string;
  after: string;
  count: string;
  countSoft: boolean;
  locked: boolean;
  empty: boolean;
}

export interface BoardView {
  rules: { text: string; ok: boolean }[];
  slots: SlotView[];
  checksum: { letters: (string | null)[]; isWord: boolean };
  solvable: boolean;
}

const NUMBER_WORDS = [
  "zero",
  "one",
  "two",
  "three",
  "four",
  "five",
  "six",
  "seven",
  "eight",
  "nine",
];

export const numberWord = (n: number): string => NUMBER_WORDS[n] ?? String(n);

export const lede = (m: number): string =>
  `One phrase fits every rule below. Fill the ${numberWord(m)} words; the marked letters spell its checksum.`;

export function newGame(puzzle: PuzzleResponse): StoredGame {
  return {
    puzzle,
    words: Array.from({ length: puzzle.m }, () => ""),
    answers: {},
    counted: false,
    solved: false,
    revealed: false,
    elapsedMs: null,
    result: null,
  };
}

export const sanitizeWord = (raw: string): string =>
  raw
    .toLowerCase()
    .replace(/[^a-z]/g, "")
    .slice(0, MAX_WORD_LENGTH);

export const answerKey = (slot: number, word: string): string => `${slot}:${word}`;

export const isLocked = (game: StoredGame, slot: number): boolean => {
  const word = game.words[slot] ?? "";
  return word !== "" && game.answers[answerKey(slot, word)] === true;
};

export function parseStartMs(token: string): number | null {
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const ms = Number(parts[1]);
  return Number.isSafeInteger(ms) && ms > 0 ? ms : null;
}

export const shareText = (
  number: number,
  elapsedMs: number,
  origin: string,
  result: string,
): string => `Checksum No. ${number} · ${formatElapsed(elapsedMs)}\n${origin}/r/${result}`;

export function slotView(
  word: string,
  n: number,
  words: ReadonlySet<string> | null,
  locked: boolean,
  settled: boolean,
): SlotView {
  const listed = words !== null && words.has(word);
  const unlisted = words !== null && !listed && word.length >= MIN_LISTED_LENGTH && settled;
  const at = n - 1;
  return {
    before: word.slice(0, at),
    nth: word.charAt(at),
    after: word.slice(at + 1),
    count: unlisted ? "not in list" : String(word.length),
    countSoft: !listed && !locked,
    locked,
    empty: word === "",
  };
}

export function checksumView(
  words: readonly string[],
  n: number,
  list: ReadonlySet<string> | null,
): BoardView["checksum"] {
  const sum = checksumOf(words, n);
  return {
    letters: words.map((w) => w[n - 1] ?? null),
    isWord: sum !== null && list !== null && list.has(sum),
  };
}

const membersOf =
  (data: GameData) =>
  (category: string): readonly string[] =>
    data.categories?.get(category) ?? [];

// The grader never reads an acrostic's hidden word.
const asConstraint = (c: PublicConstraint): Constraint => c as Constraint;

const needsCategories = (c: PublicConstraint): boolean => c.kind === "acrostic";

export function boardView(
  game: StoredGame,
  data: GameData,
  settled: readonly boolean[],
  locked: readonly boolean[],
): BoardView {
  const { puzzle, words } = game;
  const full = words.every((w) => w !== "");
  const rules = puzzle.constraints.map((c) => {
    const ready = full && (!needsCategories(c) || data.categories !== null);
    return {
      text: describe(asConstraint(c)),
      ok: ready && check(asConstraint(c), words, membersOf(data)),
    };
  });
  const checksum = checksumView(words, puzzle.n, data.words);
  rules.push({ text: describeChecksum(puzzle.n), ok: full && checksum.isWord });
  return {
    rules,
    slots: words.map((w, i) =>
      slotView(w, puzzle.n, data.words, locked[i] ?? false, settled[i] ?? false),
    ),
    checksum,
    solvable: rules.every((r) => r.ok),
  };
}
