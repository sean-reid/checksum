import { describe, expect, it } from "vitest";
import { formatElapsed } from "../../shared/time.ts";

describe("formatElapsed", () => {
  it("formats zero", () => expect(formatElapsed(0)).toBe("0:00"));
  it("formats seconds", () => expect(formatElapsed(59_000)).toBe("0:59"));
  it("rolls over at a minute", () => expect(formatElapsed(60_000)).toBe("1:00"));
  it("drops partial seconds", () => expect(formatElapsed(59_999)).toBe("0:59"));
  it("formats 12:34", () => expect(formatElapsed((12 * 60 + 34) * 1000)).toBe("12:34"));
  it("formats 61 minutes as hours", () => expect(formatElapsed(61 * 60_000)).toBe("1:01:00"));
  it("formats 1 h 5 min 9 s", () =>
    expect(formatElapsed(((60 + 5) * 60 + 9) * 1000)).toBe("1:05:09"));
});
