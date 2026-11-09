export type Pos = "first" | "last" | number;

export interface Acrostic {
  kind: "acrostic";
  pos: Pos;
  category: string;
  article: string;
  word: string;
}

export type Constraint =
  | Acrostic
  | { kind: "lengthsDistinct" }
  | { kind: "lengthsAscending" }
  | { kind: "lengthsDescending" }
  | { kind: "totalLetters"; value: number }
  | { kind: "scrabbleTotal"; value: number }
  | { kind: "everyContains"; letter: string }
  | { kind: "noneContains"; letter: string }
  | { kind: "alphabetical" }
  | { kind: "doubleLetters"; value: number }
  | { kind: "longestSlot"; slot: number };

export type PublicConstraint = Exclude<Constraint, Acrostic> | Omit<Acrostic, "word">;

export interface StoredPuzzle {
  number: number;
  date: string;
  m: number;
  n: number;
  constraints: Constraint[];
  solution: string[];
  checksum: string;
}

export interface PublicPuzzle {
  number: number;
  date: string;
  m: number;
  n: number;
  constraints: PublicConstraint[];
}

export const puzzleKey = (number: number): string => `puzzle:${number}`;

export function publicView(puzzle: StoredPuzzle): PublicPuzzle {
  const { number, date, m, n } = puzzle;
  const constraints = puzzle.constraints.map((c): PublicConstraint => {
    if (c.kind !== "acrostic") return c;
    return { kind: c.kind, pos: c.pos, category: c.category, article: c.article };
  });
  return { number, date, m, n, constraints };
}

const TILES: Record<string, number> = {
  a: 1,
  b: 3,
  c: 3,
  d: 2,
  e: 1,
  f: 4,
  g: 2,
  h: 4,
  i: 1,
  j: 8,
  k: 5,
  l: 1,
  m: 3,
  n: 1,
  o: 1,
  p: 3,
  q: 10,
  r: 1,
  s: 1,
  t: 1,
  u: 1,
  v: 4,
  w: 4,
  x: 8,
  y: 4,
  z: 10,
};

export function scrabbleScore(word: string): number {
  let total = 0;
  for (const ch of word) total += TILES[ch] ?? 0;
  return total;
}

export function checksumOf(words: readonly string[], n: number): string | null {
  let out = "";
  for (const w of words) {
    const ch = w[n - 1];
    if (ch === undefined) return null;
    out += ch;
  }
  return out;
}

const hasDouble = (w: string): boolean => /(.)\1/.test(w);

function spelled(pos: Pos, words: readonly string[]): string | null {
  if (pos === "first") return words.map((w) => w[0] ?? "").join("");
  if (pos === "last") return words.map((w) => w.slice(-1)).join("");
  return checksumOf(words, pos);
}

export function check(
  c: Constraint,
  words: readonly string[],
  members: (category: string) => readonly string[],
): boolean {
  const lengths = words.map((w) => w.length);
  const strictly = (ok: (a: number, b: number) => boolean) =>
    lengths.every((len, i) => i === 0 || ok(lengths[i - 1]!, len));
  switch (c.kind) {
    case "acrostic": {
      const s = spelled(c.pos, words);
      return s !== null && members(c.category).includes(s);
    }
    case "lengthsDistinct":
      return new Set(lengths).size === lengths.length;
    case "lengthsAscending":
      return strictly((a, b) => a < b);
    case "lengthsDescending":
      return strictly((a, b) => a > b);
    case "totalLetters":
      return lengths.reduce((a, b) => a + b, 0) === c.value;
    case "scrabbleTotal":
      return words.reduce((a, w) => a + scrabbleScore(w), 0) === c.value;
    case "everyContains":
      return words.every((w) => w.includes(c.letter));
    case "noneContains":
      return words.every((w) => !w.includes(c.letter));
    case "alphabetical":
      return words.every((w, i) => i === 0 || words[i - 1]! <= w);
    case "doubleLetters":
      return words.filter(hasDouble).length === c.value;
    case "longestSlot": {
      const len = lengths[c.slot];
      return len !== undefined && lengths.every((l, i) => i === c.slot || l < len);
    }
  }
}

const ORDINALS = ["first", "second", "third", "fourth", "fifth", "sixth", "seventh"];
const NUMBER_WORDS = ["no", "one", "two", "three", "four", "five", "six", "seven"];
const AN_LETTERS = "aefhilmnorsx";

const ordinal = (i: number): string => ORDINALS[i] ?? `${i + 1}th`;
const count = (n: number): string => NUMBER_WORDS[n] ?? String(n);

export function describe(c: Constraint): string {
  switch (c.kind) {
    case "acrostic": {
      const ord = c.pos === "first" || c.pos === "last" ? c.pos : ordinal(c.pos - 1);
      return `The ${ord} letters spell ${c.article} ${c.category}.`;
    }
    case "lengthsDistinct":
      return "Every word has a different length.";
    case "lengthsAscending":
      return "Each word is longer than the one before.";
    case "lengthsDescending":
      return "Each word is shorter than the one before.";
    case "totalLetters":
      return `The phrase has ${c.value} letters in total.`;
    case "scrabbleTotal":
      return `The Scrabble score of the phrase is ${c.value}.`;
    case "everyContains":
      return `Every word contains ${letterArticle(c.letter)} ${c.letter.toUpperCase()}.`;
    case "noneContains":
      return `No word contains ${letterArticle(c.letter)} ${c.letter.toUpperCase()}.`;
    case "alphabetical":
      return "The words are in alphabetical order.";
    case "doubleLetters":
      if (c.value === 0) return "No word contains a double letter.";
      return c.value === 1
        ? "Exactly one word contains a double letter."
        : `Exactly ${count(c.value)} words contain a double letter.`;
    case "longestSlot":
      return `The ${ordinal(c.slot)} word is the longest.`;
  }
}

const letterArticle = (letter: string): string => (AN_LETTERS.includes(letter) ? "an" : "a");

export const describeChecksum = (n: number): string =>
  `The checksum is the ${ordinal(n - 1)} letter of each word.`;
