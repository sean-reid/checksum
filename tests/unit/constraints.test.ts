import { describe, expect, it } from "vitest";
import {
  check,
  checksumOf,
  describe as describeConstraint,
  describeChecksum,
  publicView,
  scrabbleScore,
  type Constraint,
  type StoredPuzzle,
} from "../../shared/constraints.ts";
import categoryData from "../../tools/gen/data/categories.json";
import fixture from "../fixtures/puzzles.json";

interface FixturePuzzle extends StoredPuzzle {
  descriptions: string[];
  fails: { words: string[]; constraint: number }[];
}

const puzzles = (fixture as { puzzles: FixturePuzzle[] }).puzzles;

const categories = new Map(categoryData.map((c) => [c.name, c.members]));
const members = (category: string): readonly string[] => categories.get(category) ?? [];

describe("fixture puzzles", () => {
  it("has at least one puzzle", () => {
    expect(puzzles.length).toBeGreaterThan(0);
  });

  for (const p of puzzles) {
    describe(`puzzle ${p.number}`, () => {
      it("passes every constraint with the solution", () => {
        expect(p.solution).toHaveLength(p.m);
        for (const c of p.constraints) expect(check(c, p.solution, members)).toBe(true);
      });

      it("fails exactly the named constraint for each failing phrase", () => {
        for (const f of p.fails) {
          const results = p.constraints.map((c) => check(c, f.words, members));
          expect(results.map((ok, i) => (ok ? -1 : i)).filter((i) => i >= 0)).toEqual([
            f.constraint,
          ]);
        }
      });

      it("describes each constraint and the checksum", () => {
        const lines = [...p.constraints.map(describeConstraint), describeChecksum(p.n)];
        expect(lines).toEqual(p.descriptions);
      });

      it("keeps the answer out of the public view", () => {
        const text = JSON.stringify(publicView(p));
        for (const key of ["word", "solution", "checksum"]) {
          expect(text).not.toContain(`"${key}"`);
        }
        expect(publicView(p).constraints).toHaveLength(p.constraints.length);
      });

      it("reads the checksum off the solution", () => {
        expect(checksumOf(p.solution, p.n)).toBe(p.checksum);
      });
    });
  }
});

describe("check", () => {
  const ok = (c: Constraint, words: string[]) => check(c, words, members);

  it("reads acrostic positions, including numeric ones", () => {
    const second: Constraint = {
      kind: "acrostic",
      pos: 2,
      category: "colour",
      article: "a",
      word: "red",
    };
    expect(ok(second, ["ore", "bed", "ode"])).toBe(true);
    expect(ok(second, ["ore", "bad", "ode"])).toBe(false);
    expect(ok({ ...second, pos: "first" }, ["rat", "eel", "den"])).toBe(true);
    expect(ok({ ...second, pos: "last" }, ["bar", "ace", "bad"])).toBe(true);
    expect(ok({ ...second, pos: 3 }, ["bar", "ace", "bad"])).toBe(true);
    expect(ok({ ...second, pos: 3 }, ["bar", "ace", "ad"])).toBe(false);
  });

  it("compares lengths strictly", () => {
    expect(ok({ kind: "lengthsAscending" }, ["a", "bb", "ccc"])).toBe(true);
    expect(ok({ kind: "lengthsAscending" }, ["a", "bb", "cc"])).toBe(false);
    expect(ok({ kind: "lengthsDescending" }, ["ccc", "bb", "a"])).toBe(true);
    expect(ok({ kind: "lengthsDistinct" }, ["a", "bb", "c"])).toBe(false);
  });

  it("checks letters and alphabetical order", () => {
    expect(ok({ kind: "everyContains", letter: "e" }, ["tea", "eel"])).toBe(true);
    expect(ok({ kind: "everyContains", letter: "e" }, ["tea", "oil"])).toBe(false);
    expect(ok({ kind: "noneContains", letter: "e" }, ["tar", "oil"])).toBe(true);
    expect(ok({ kind: "alphabetical" }, ["ant", "bee", "cat"])).toBe(true);
    expect(ok({ kind: "alphabetical" }, ["ant", "cat", "bee"])).toBe(false);
    expect(ok({ kind: "alphabetical" }, ["ant", "ant", "bee"])).toBe(false);
  });

  it("counts words with adjacent equal letters", () => {
    expect(ok({ kind: "doubleLetters", value: 2 }, ["moon", "bee", "cat"])).toBe(true);
    expect(ok({ kind: "doubleLetters", value: 0 }, ["banana"])).toBe(true);
  });

  it("needs a unique longest word", () => {
    expect(ok({ kind: "longestSlot", slot: 1 }, ["ab", "abc", "ab"])).toBe(true);
    expect(ok({ kind: "longestSlot", slot: 1 }, ["abc", "abc", "ab"])).toBe(false);
  });
});

describe("checksumOf", () => {
  it("is null when a word is too short", () => {
    expect(checksumOf(["cat", "at"], 3)).toBeNull();
    expect(checksumOf(["cat", "dog"], 3)).toBe("tg");
  });
});

describe("scrabbleScore", () => {
  it("uses the standard tile values", () => {
    expect(scrabbleScore("quiz")).toBe(22);
    expect(scrabbleScore("jazz")).toBe(29);
    expect(scrabbleScore("hello")).toBe(8);
  });
});

describe("describe", () => {
  const d = describeConstraint;
  it("words acrostics from article, category, and position", () => {
    const a = { kind: "acrostic", pos: 2, category: "colour", article: "a", word: "x" } as const;
    expect(d(a)).toBe("The second letters spell a colour.");
    expect(d({ ...a, pos: 7, article: "an", category: "animal" })).toBe(
      "The seventh letters spell an animal.",
    );
  });

  it("picks the article for a letter", () => {
    expect(d({ kind: "everyContains", letter: "e" })).toBe("Every word contains an E.");
    expect(d({ kind: "everyContains", letter: "u" })).toBe("Every word contains a U.");
    expect(d({ kind: "noneContains", letter: "x" })).toBe("No word contains an X.");
    expect(d({ kind: "noneContains", letter: "k" })).toBe("No word contains a K.");
  });

  it("words the double letter counts", () => {
    expect(d({ kind: "doubleLetters", value: 0 })).toBe("No word contains a double letter.");
    expect(d({ kind: "doubleLetters", value: 1 })).toBe(
      "Exactly one word contains a double letter.",
    );
    expect(d({ kind: "doubleLetters", value: 3 })).toBe(
      "Exactly three words contain a double letter.",
    );
  });

  it("words the remaining kinds", () => {
    expect(d({ kind: "alphabetical" })).toBe("The words are in alphabetical order.");
    expect(d({ kind: "longestSlot", slot: 2 })).toBe("The third word is the longest.");
    expect(d({ kind: "totalLetters", value: 31 })).toBe("The phrase has 31 letters in total.");
    expect(d({ kind: "scrabbleTotal", value: 70 })).toBe("The Scrabble score of the phrase is 70.");
    expect(describeChecksum(3)).toBe("The checksum is the third letter of each word.");
  });
});
