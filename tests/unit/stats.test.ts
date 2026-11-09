import { describe, expect, it } from "vitest";
import {
  currentStreak,
  emptyStats,
  median,
  parseStats,
  recordLoss,
  recordPlayed,
  recordSolve,
} from "../../src/stats.ts";

describe("recordSolve", () => {
  it("extends the streak across consecutive days", () => {
    let s = emptyStats();
    s = recordSolve(s, 10, 60_000);
    s = recordSolve(s, 11, 50_000);
    s = recordSolve(s, 12, 70_000);
    expect(s).toMatchObject({ solved: 3, streak: 3, best: 3, bestMs: 50_000 });
  });
  it("restarts the streak after a skipped day and keeps the best", () => {
    let s = emptyStats();
    s = recordSolve(s, 10, 60_000);
    s = recordSolve(s, 11, 60_000);
    s = recordSolve(s, 14, 60_000);
    expect(s).toMatchObject({ streak: 1, best: 2 });
  });
  it("resets the streak on a reveal", () => {
    let s = recordSolve(emptyStats(), 10, 60_000);
    s = recordLoss(s, true);
    expect(s.streak).toBe(0);
    s = recordSolve(s, 11, 60_000);
    expect(s.streak).toBe(1);
  });
  it("changes nothing when the same day is solved twice", () => {
    const s = recordSolve(emptyStats(), 10, 60_000);
    expect(recordSolve(s, 10, 30_000)).toEqual(s);
  });
  it("counts a reveal as played when no slot check counted the day", () => {
    const s = recordLoss(emptyStats(), false);
    expect(s).toMatchObject({ played: 1, solved: 0, streak: 0 });
    expect(recordLoss(s, true).played).toBe(1);
  });
  it("counts played separately", () => {
    expect(recordPlayed(emptyStats()).played).toBe(1);
  });
});

describe("currentStreak", () => {
  it("drops to zero once a day has been missed", () => {
    const s = recordSolve(emptyStats(), 10, 1000);
    expect(currentStreak(s, 10)).toBe(1);
    expect(currentStreak(s, 11)).toBe(1);
    expect(currentStreak(s, 12)).toBe(0);
  });
});

describe("median", () => {
  it("takes the middle of an odd list and the mean of an even one", () => {
    expect(median([30, 10, 20])).toBe(20);
    expect(median([40, 10, 20, 30])).toBe(25);
    expect(median([])).toBeNull();
  });
});

describe("parseStats", () => {
  it("falls back to empty on bad input", () => {
    expect(parseStats(null)).toEqual(emptyStats());
    expect(parseStats("{nope")).toEqual(emptyStats());
  });
  it("round trips", () => {
    const s = recordSolve(emptyStats(), 3, 5000);
    expect(parseStats(JSON.stringify(s))).toEqual(s);
  });
});
