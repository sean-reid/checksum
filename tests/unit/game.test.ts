import { describe, expect, it } from "vitest";
import type { PuzzleResponse } from "../../shared/api.ts";
import {
  boardView,
  isLocked,
  lede,
  newGame,
  parseGame,
  parseStartMs,
  sanitizeWord,
  shareText,
  slotView,
} from "../../src/game.ts";

const list = new Set(["tobacco", "overlap", "bets", "toad"]);

describe("shareText", () => {
  it("is two lines: the header and the result link", () => {
    expect(shareText(42, 252_000, "https://checksum.example", "tok.en")).toBe(
      "Checksum No. 42 · 4:12\nhttps://checksum.example/r/tok.en",
    );
  });
  it("shows hours past sixty minutes", () => {
    expect(shareText(1, 3_725_000, "http://x", "r").split("\n")[0]).toBe(
      "Checksum No. 1 · 1:02:05",
    );
  });
});

describe("parseStartMs", () => {
  it("reads the second field of the start token", () => {
    expect(parseStartMs("42.1762560000000.abcd.sig")).toBe(1762560000000);
  });
  it("rejects malformed tokens", () => {
    expect(parseStartMs("42.abc.nonce.sig")).toBeNull();
    expect(parseStartMs("42.1.nonce")).toBeNull();
    expect(parseStartMs("")).toBeNull();
  });
});

describe("slotView", () => {
  it("keeps the count soft until the word is in the list", () => {
    expect(slotView("tob", 3, list, false, false)).toMatchObject({ countSoft: true, count: "3" });
    expect(slotView("tobacco", 3, list, false, false)).toMatchObject({
      countSoft: false,
      count: "7",
    });
  });
  it("underlines the nth letter and leaves it out of short words", () => {
    expect(slotView("tobacco", 3, list, false, false)).toMatchObject({
      before: "to",
      nth: "b",
      after: "acco",
    });
    expect(slotView("to", 3, list, false, false).nth).toBe("");
  });
  it("says not in list only for a settled word of three letters or more", () => {
    expect(slotView("zzzz", 3, list, false, false).count).toBe("4");
    expect(slotView("zzzz", 3, list, false, true).count).toBe("not in list");
    expect(slotView("zz", 3, list, false, true).count).toBe("2");
  });
  it("says nothing before the list has loaded", () => {
    expect(slotView("zzzz", 3, null, false, true)).toMatchObject({ count: "4", countSoft: true });
  });
  it("shows no count for an empty slot", () => {
    expect(slotView("", 3, list, false, true).count).toBe("");
  });
  it("marks a locked slot", () => {
    expect(slotView("tobacco", 3, list, true, false).locked).toBe(true);
    expect(slotView("", 3, list, false, false).empty).toBe(true);
  });
});

describe("sanitizeWord", () => {
  it("lowercases and keeps letters a to z", () => {
    expect(sanitizeWord("To-Ba 9co!")).toBe("tobaco");
  });
  it("caps at fifteen letters", () => {
    expect(sanitizeWord("a".repeat(20))).toHaveLength(15);
  });
});

const puzzle: PuzzleResponse = {
  number: 1,
  date: "2026-11-08",
  m: 2,
  n: 3,
  token: "1.1762560000000.n.s",
  constraints: [{ kind: "lengthsDistinct" }, { kind: "noneContains", letter: "z" }],
};

describe("boardView", () => {
  const settled = [false, false];
  const none = [false, false];
  it("holds every rule back until each slot has a word", () => {
    const game = newGame(puzzle);
    const view = boardView(game, { words: list, categories: new Map() }, settled, none);
    expect(view.rules.map((r) => r.ok)).toEqual([false, false, false]);
    expect(view.solvable).toBe(false);
  });
  it("ticks rules and the checksum row from the words", () => {
    const game = { ...newGame(puzzle), words: ["bets", "toad"] };
    const view = boardView(game, { words: list, categories: null }, settled, none);
    expect(view.rules.map((r) => r.ok)).toEqual([false, true, false]);
    expect(view.checksum.letters).toEqual(["t", "a"]);
    const solved = { ...newGame(puzzle), words: ["tobacco", "toad"] };
    const v2 = boardView(solved, { words: list, categories: null }, settled, none);
    expect(v2.rules.map((r) => r.ok)).toEqual([true, true, false]);
    expect(v2.checksum.letters).toEqual(["b", "a"]);
  });
  it("shows a dot for a word shorter than the checksum position", () => {
    const game = { ...newGame(puzzle), words: ["to", "toad"] };
    const view = boardView(game, { words: list, categories: null }, settled, none);
    expect(view.checksum.letters).toEqual([null, "a"]);
    expect(view.checksum.isWord).toBe(false);
  });
  it("marks the checksum rule when the letters spell a listed word", () => {
    const game = { ...newGame(puzzle), words: ["bets", "overlap"] };
    const data = { words: new Set(["te"]), categories: null };
    expect(boardView(game, data, settled, none).checksum.isWord).toBe(true);
    expect(
      boardView(game, { words: new Set(["ta"]), categories: null }, settled, none).checksum.isWord,
    ).toBe(false);
    const g2 = { ...newGame(puzzle), words: ["bets", "toad"] };
    expect(
      boardView(g2, { words: new Set(["ta"]), categories: null }, settled, none).checksum.isWord,
    ).toBe(true);
  });
});

describe("misc", () => {
  it("spells the slot count in the lede", () => {
    expect(lede(6)).toContain("Fill the six words");
  });
  it("locks a slot only while its word has a positive answer", () => {
    const game = newGame(puzzle);
    game.words = ["bets", ""];
    game.answers["0:bets"] = true;
    expect(isLocked(game, 0)).toBe(true);
    game.words = ["bet", ""];
    expect(isLocked(game, 0)).toBe(false);
    expect(isLocked(game, 1)).toBe(false);
  });
});

describe("parseGame", () => {
  const stored = () => JSON.stringify({ ...newGame(puzzle), words: ["bets", "toad"] });
  const withField = (field: string, value: unknown) =>
    JSON.stringify({ ...JSON.parse(stored()), [field]: value });

  it("restores a well formed game", () => {
    expect(parseGame(stored(), 1)?.words).toEqual(["bets", "toad"]);
  });
  it("refuses a previous day's game", () => {
    expect(parseGame(stored(), 2)).toBeNull();
  });
  it("refuses corrupt games", () => {
    expect(parseGame(null, 1)).toBeNull();
    expect(parseGame("{nope", 1)).toBeNull();
    expect(parseGame("[]", 1)).toBeNull();
    expect(parseGame(withField("words", ["bets", "To-ad"]), 1)).toBeNull();
    expect(parseGame(withField("words", ["bets"]), 1)).toBeNull();
    expect(parseGame(withField("words", ["bets", "a".repeat(16)]), 1)).toBeNull();
    expect(parseGame(withField("solved", "yes"), 1)).toBeNull();
    expect(parseGame(withField("revealed", 1), 1)).toBeNull();
    expect(parseGame(withField("elapsedMs", "12"), 1)).toBeNull();
    expect(parseGame(withField("answers", { "0:bets": "true" }), 1)).toBeNull();
    expect(parseGame(withField("solved", true), 1)).toBeNull();
    expect(parseGame(withField("puzzle", { ...puzzle, constraints: null }), 1)).toBeNull();
  });
});
