import { describe, expect, it } from "vitest";
import { EPOCH, dateWithinWindow, localIsoDate, puzzleNumber } from "../../shared/day.ts";

describe("puzzleNumber", () => {
  it("counts from one on the epoch", () => {
    expect(puzzleNumber(EPOCH)).toBe(1);
    expect(puzzleNumber("2026-11-09")).toBe(2);
    expect(puzzleNumber("2027-11-08")).toBe(366);
  });
  it("rejects malformed and impossible dates", () => {
    expect(puzzleNumber("2026-13-01")).toBeNull();
    expect(puzzleNumber("2026-02-30")).toBeNull();
    expect(puzzleNumber("yesterday")).toBeNull();
  });
});

describe("dateWithinWindow", () => {
  const noon = Date.UTC(2026, 10, 10, 12);
  it("accepts a day either side of UTC today", () => {
    expect(dateWithinWindow("2026-11-09", noon)).toBe(true);
    expect(dateWithinWindow("2026-11-10", noon)).toBe(true);
    expect(dateWithinWindow("2026-11-11", noon)).toBe(true);
    expect(dateWithinWindow("2026-11-12", noon)).toBe(false);
  });
});

describe("localIsoDate", () => {
  it("formats the local calendar date", () => {
    expect(localIsoDate(new Date(2026, 0, 5))).toBe("2026-01-05");
  });
});
