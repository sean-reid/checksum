import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { expect, test, type APIRequestContext } from "@playwright/test";
import type {
  PuzzleResponse,
  ResultResponse,
  RevealResponse,
  SolveResponse,
  StatsResponse,
} from "../../shared/api.ts";
import type { StoredPuzzle } from "../../shared/constraints.ts";
import { puzzleNumber } from "../../shared/day.ts";
import { formatElapsed } from "../../shared/time.ts";
import { issueStart, newNonce } from "../../worker/token.ts";

const today = new Date().toISOString().slice(0, 10);
const number = puzzleNumber(today)!;
const fixture = JSON.parse(readFileSync("tests/fixtures/puzzles.json", "utf8")) as {
  puzzles: StoredPuzzle[];
};
const stored = fixture.puzzles[0]!;
const { solution, checksum } = stored;
const wrong = solution.map(() => "zzz");
const elapsedTimes: number[] = [];

const start = async (request: APIRequestContext): Promise<PuzzleResponse> => {
  const res = await request.get(`/api/puzzle?date=${today}`);
  expect(res.status()).toBe(200);
  return (await res.json()) as PuzzleResponse;
};

const stats = async (request: APIRequestContext): Promise<StatsResponse> =>
  (await (await request.get(`/api/stats/${number}`)).json()) as StatsResponse;

const solve = (request: APIRequestContext, token: string, words: string[]) =>
  request.post("/api/solve", { data: { token, words } });

const keysOf = (value: unknown): string[] =>
  value && typeof value === "object"
    ? Object.entries(value).flatMap(([k, v]) => [k, ...keysOf(v)])
    : [];

test.describe.configure({ mode: "serial" });

test("serves the public puzzle with a start token and no answer", async ({ request }) => {
  const body = await start(request);
  expect(body.number).toBe(number);
  expect(body.m).toBe(stored.m);
  expect(body.n).toBe(stored.n);
  expect(body.constraints).toHaveLength(stored.constraints.length);
  expect(body.token.split(".")).toHaveLength(4);
  const keys = keysOf(body);
  for (const forbidden of ["word", "solution", "checksum"]) expect(keys).not.toContain(forbidden);
});

test("refuses bad dates", async ({ request }) => {
  expect((await request.get("/api/puzzle?date=2020-01-01")).status()).toBe(400);
  expect((await request.get("/api/puzzle?date=nope")).status()).toBe(400);
  expect((await request.get("/api/puzzle")).status()).toBe(400);
});

test("checks one slot at a time", async ({ request }) => {
  const { token } = await start(request);
  const slot = (data: unknown) => request.post("/api/slot", { data });
  const hit = await slot({ token, slot: 1, word: solution[1] });
  expect(await hit.json()).toEqual({ match: true });
  const miss = await slot({ token, slot: 1, word: "zzz" });
  expect(await miss.json()).toEqual({ match: false });
  expect((await slot({ token, slot: 99, word: "abc" })).status()).toBe(400);
  expect((await slot({ token, slot: 0, word: "ABC" })).status()).toBe(400);
  expect((await slot({ token, slot: 0, word: "a".repeat(16) })).status()).toBe(400);
  expect((await slot({ token })).status()).toBe(400);
  expect((await request.post("/api/slot", { data: "not json" })).status()).toBe(400);
});

test("refuses a slot check for a number outside the window", async ({ request }) => {
  const token = await issueStart("dev", {
    number: number + 50,
    startMs: Date.now(),
    nonce: newNonce(),
  });
  const res = await request.post("/api/slot", { data: { token, slot: 0, word: "abc" } });
  expect(res.status()).toBe(404);
});

test("rejects a tampered token", async ({ request }) => {
  const { token } = await start(request);
  const [n, ms, nonce, sig] = token.split(".") as [string, string, string, string];
  const earlier = [n, Number(ms) - 60_000, nonce, sig].join(".");
  for (const bad of [earlier, `${token.slice(0, -2)}AA`, "garbage"]) {
    const res = await request.post("/api/slot", { data: { token: bad, slot: 0, word: "abc" } });
    expect(res.status()).toBe(400);
    expect((await solve(request, bad, solution)).status()).toBe(400);
  }
});

test("a wrong phrase is not a solve", async ({ request }) => {
  const { token } = await start(request);
  const res = await solve(request, token, wrong);
  expect(res.status()).toBe(200);
  expect(await res.json()).toEqual({ ok: false });
  expect((await solve(request, token, solution.slice(0, -1))).status()).toBe(200);
  expect((await solve(request, token, ["Bad", "words"])).status()).toBe(400);
});

test("the right phrase solves and yields a verifiable result token", async ({ request }) => {
  const before = await stats(request);
  const { token } = await start(request);
  const res = await solve(request, token, solution);
  expect(res.status()).toBe(200);
  const body = (await res.json()) as Extract<SolveResponse, { ok: true }>;
  expect(body.ok).toBe(true);
  expect(body.elapsedMs).toBeGreaterThanOrEqual(1000);
  expect(body.checksum).toBe(checksum);
  elapsedTimes.push(body.elapsedMs);

  const shared = await request.get(`/api/result/${body.result}`);
  expect(shared.status()).toBe(200);
  expect((await shared.json()) as ResultResponse).toEqual({ number, elapsedMs: body.elapsedMs });
  expect((await request.get(`/api/result/${body.result.slice(0, -2)}AA`)).status()).toBe(404);
  expect((await request.get("/api/result/garbage")).status()).toBe(404);
  expect((await stats(request)).solves).toBe(before.solves + 1);
});

test("the shared page and og card render from a result token", async ({ request }) => {
  const { token } = await start(request);
  const solved = (await (await solve(request, token, solution)).json()) as Extract<
    SolveResponse,
    { ok: true }
  >;
  elapsedTimes.push(solved.elapsedMs);

  const page = await request.get(`/r/${solved.result}`);
  expect(page.status()).toBe(200);
  expect(page.headers()["content-type"]).toContain("text/html");
  expect(page.headers()["cache-control"]).toBe("public, max-age=3600");
  expect(page.headers()["content-security-policy"]).toContain("default-src 'none'");
  const html = await page.text();
  expect(html).toContain(`No. ${number}`);
  expect(html).toContain(formatElapsed(solved.elapsedMs));
  const image = /property="og:image" content="(https?:\/\/[^"]+)"/.exec(html)?.[1];
  expect(image).toMatch(
    new RegExp(`^https?://[^/]+/og/${solved.result.replaceAll(".", "\\.")}\\.png$`),
  );
  expect(html).toContain('content="summary_large_image"');
  expect(html).not.toContain("solution");
  expect(html).not.toContain(checksum);

  const head = await request.head(`/r/${solved.result}`);
  expect(head.status()).toBe(200);
  expect(head.headers()["content-type"]).toBe(page.headers()["content-type"]);
  expect(await head.body()).toHaveLength(0);
  const cardHead = await request.head(`/og/${solved.result}.png`);
  expect(cardHead.status()).toBe(200);
  expect(cardHead.headers()["content-type"]).toBe("image/png");
  expect(await cardHead.body()).toHaveLength(0);
  expect((await request.head("/r/garbage")).status()).toBe(404);

  const card = await request.get(`/og/${solved.result}.png`);
  expect(card.status()).toBe(200);
  expect(card.headers()["content-type"]).toBe("image/png");
  expect(card.headers()["cache-control"]).toBe("public, max-age=31536000, immutable");
  const png = await card.body();
  expect([...png.subarray(0, 4)]).toEqual([0x89, 0x50, 0x4e, 0x47]);
  expect(png.readUInt32BE(16)).toBe(1200);
  expect(png.readUInt32BE(20)).toBe(630);
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/og-sample.png", png);
});

test("the shared page and og card refuse a bad token", async ({ request }) => {
  const { token } = await start(request);
  const solved = (await (await solve(request, token, solution)).json()) as Extract<
    SolveResponse,
    { ok: true }
  >;
  elapsedTimes.push(solved.elapsedMs);
  const tampered = `${solved.result.slice(0, -2)}AA`;
  for (const path of ["/r/garbage", `/r/${tampered}`, "/og/garbage.png", `/og/${tampered}.png`]) {
    expect((await request.get(path)).status()).toBe(404);
  }
  const page = await request.get("/r/garbage");
  expect(page.headers()["content-type"]).toContain("text/html");
});

test("solving the same token twice counts once", async ({ request }) => {
  const before = await stats(request);
  const { token } = await start(request);
  await new Promise((r) => setTimeout(r, 1500));
  const first = (await (await solve(request, token, solution)).json()) as Extract<
    SolveResponse,
    { ok: true }
  >;
  expect(first.elapsedMs).toBeGreaterThanOrEqual(1500);
  const second = (await (await solve(request, token, solution)).json()) as typeof first;
  expect(second.elapsedMs).toBe(first.elapsedMs);
  elapsedTimes.push(first.elapsedMs);
  expect((await stats(request)).solves).toBe(before.solves + 1);
});

test("reveal gives up the day and blocks a later solve", async ({ request }) => {
  const before = await stats(request);
  const { token } = await start(request);
  const res = await request.post("/api/reveal", { data: { token } });
  expect(res.status()).toBe(200);
  expect((await res.json()) as RevealResponse).toEqual({ solution, checksum });
  expect((await solve(request, token, solution)).status()).toBe(409);
  expect((await solve(request, token, wrong)).status()).toBe(409);
  const after = await stats(request);
  expect(after.giveUps).toBe(before.giveUps + 1);
  expect(after.solves).toBe(before.solves);
});

test("a start token for a closed puzzle is refused on solve and reveal", async ({ request }) => {
  test.skip(number < 2, "no closed puzzle number exists yet");
  const token = await issueStart("dev", {
    number: number - 2,
    startMs: Date.now(),
    nonce: newNonce(),
  });
  expect((await solve(request, token, solution)).status()).toBe(404);
  expect((await request.post("/api/reveal", { data: { token } })).status()).toBe(404);
});

test("reveal after a solve keeps the solve and adds no give-up", async ({ request }) => {
  const { token } = await start(request);
  const solved = (await (await solve(request, token, solution)).json()) as Extract<
    SolveResponse,
    { ok: true }
  >;
  elapsedTimes.push(solved.elapsedMs);
  const before = await stats(request);
  expect((await request.post("/api/reveal", { data: { token } })).status()).toBe(200);
  const after = await stats(request);
  expect(after.solves).toBe(before.solves);
  expect(after.giveUps).toBe(before.giveUps);
  const again = (await (await solve(request, token, solution)).json()) as typeof solved;
  expect(again.elapsedMs).toBe(solved.elapsedMs);
});

test("revealing twice counts one give-up", async ({ request }) => {
  const before = await stats(request);
  const { token } = await start(request);
  for (let i = 0; i < 2; i++) {
    expect((await request.post("/api/reveal", { data: { token } })).status()).toBe(200);
  }
  expect((await stats(request)).giveUps).toBe(before.giveUps + 1);
});

test("stats report the median of the solves", async ({ request }) => {
  const body = await stats(request);
  expect(body.number).toBe(number);
  expect(body.solves).toBe(elapsedTimes.length);
  const sorted = [...elapsedTimes].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  const median =
    sorted.length % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
  expect(body.medianMs).toBe(median);
  const res = await request.get(`/api/stats/${number}`);
  expect(res.headers()["cache-control"]).toBe("public, max-age=30");
  expect((await request.get(`/api/stats/${number + 50}`)).status()).toBe(404);
});

test("unknown api paths are 404", async ({ request }) => {
  expect((await request.get("/api/nope")).status()).toBe(404);
  expect(await (await request.get("/api/health")).json()).toEqual({ ok: true });
});

test("the rate limit answers 429 within 70 slot requests", async ({ request }) => {
  const { token } = await start(request);
  let status = 0;
  for (let i = 0; i < 70 && status !== 429; i++) {
    status = (await request.post("/api/slot", { data: { token, slot: 0, word: "abc" } })).status();
  }
  expect(status).toBe(429);
});
