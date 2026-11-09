import { describe, expect, it } from "vitest";
import {
  issueResult,
  issueStart,
  newNonce,
  verifyResult,
  verifyStart,
} from "../../worker/token.ts";

const secret = "dev";
const nonce = newNonce();

describe("start token", () => {
  const start = { number: 12, startMs: 1_780_000_000_000, nonce };

  it("round trips", async () => {
    const token = await issueStart(secret, start);
    expect(token.split(".")).toHaveLength(4);
    expect(await verifyStart(secret, token)).toEqual(start);
  });

  it("rejects tampering", async () => {
    const token = await issueStart(secret, start);
    const [num, ms, n, sig] = token.split(".") as [string, string, string, string];
    expect(await verifyStart(secret, [num, Number(ms) - 5000, n, sig].join("."))).toBeNull();
    expect(await verifyStart(secret, [13, ms, n, sig].join("."))).toBeNull();
    expect(await verifyStart(secret, `${token.slice(0, -2)}AA`)).toBeNull();
    expect(await verifyStart(secret, "garbage")).toBeNull();
    expect(await verifyStart(secret, 5)).toBeNull();
  });

  it("rejects a wrong secret", async () => {
    expect(await verifyStart("other", await issueStart(secret, start))).toBeNull();
  });

  it("is not a result token", async () => {
    expect(await verifyResult(secret, await issueStart(secret, start))).toBeNull();
  });
});

describe("result token", () => {
  const result = { number: 12, elapsedMs: 83_250, nonce };

  it("round trips", async () => {
    const token = await issueResult(secret, result);
    expect(token.startsWith("r.")).toBe(true);
    expect(await verifyResult(secret, token)).toEqual(result);
  });

  it("rejects tampering", async () => {
    const token = await issueResult(secret, result);
    const [r, num, ms, n, sig] = token.split(".") as [string, string, string, string, string];
    expect(await verifyResult(secret, [r, num, 1000, n, sig].join("."))).toBeNull();
    expect(await verifyResult(secret, [r, 13, ms, n, sig].join("."))).toBeNull();
    expect(await verifyResult(secret, `${token.slice(0, -2)}AA`)).toBeNull();
    expect(await verifyResult(secret, "r.1.2")).toBeNull();
  });

  it("rejects a wrong secret", async () => {
    expect(await verifyResult("other", await issueResult(secret, result))).toBeNull();
  });

  it("is not a start token", async () => {
    expect(await verifyStart(secret, await issueResult(secret, result))).toBeNull();
  });
});
