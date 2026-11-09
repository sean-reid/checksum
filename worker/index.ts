import {
  MAX_WORD_LENGTH,
  MIN_ELAPSED_MS,
  type PuzzleResponse,
  type ResultResponse,
  type RevealResponse,
  type SlotResponse,
  type SolveResponse,
  type StatsResponse,
} from "../shared/api.ts";
import { puzzleKey, publicView, type StoredPuzzle } from "../shared/constraints.ts";
import { dateWithinWindow, latestAllowedNumber, puzzleNumber } from "../shared/day.ts";
import { DayResults } from "./results.ts";
import { issueResult, issueStart, newNonce, verifyResult, verifyStart } from "./token.ts";

export { DayResults };

export interface Env {
  ASSETS: Fetcher;
  PUZZLES: KVNamespace;
  RESULTS: DurableObjectNamespace<DayResults>;
  API_RATE: RateLimit;
  TOKEN_SECRET: string;
}

const json = (body: unknown, status = 200, cache = "no-store"): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": cache },
  });

const error = (status: number, message: string): Response => json({ error: message }, status);

async function readJson(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

const puzzles = new Map<number, StoredPuzzle>();

// Part of each day's Durable Object name. Bumping it starts every day's results afresh.
const RESULTS_GENERATION = 1;

const resultsFor = (env: Env, number: number) =>
  env.RESULTS.get(env.RESULTS.idFromName(`${RESULTS_GENERATION}:${number}`));

const WORD = new RegExp(`^[a-z]{1,${MAX_WORD_LENGTH}}$`);
const isWord = (w: unknown): w is string => typeof w === "string" && WORD.test(w);

async function loadPuzzle(env: Env, number: number): Promise<StoredPuzzle | null> {
  const cached = puzzles.get(number);
  if (cached) return cached;
  const stored = await env.PUZZLES.get<StoredPuzzle>(puzzleKey(number), "json");
  if (!stored || !Array.isArray(stored.solution)) return null;
  puzzles.set(number, stored);
  return stored;
}

// Yesterday, today, and tomorrow in UTC cover every local date on earth.
function isOpen(number: unknown, now: number): number is number {
  if (typeof number !== "number" || !Number.isInteger(number)) return false;
  const latest = latestAllowedNumber(now);
  return number <= latest && number >= latest - 2;
}

async function limited(env: Env, request: Request): Promise<boolean> {
  const key = request.headers.get("cf-connecting-ip") ?? "unknown";
  const { success } = await env.API_RATE.limit({ key });
  return !success;
}

const notConfigured = (env: Env): Response | null =>
  env.TOKEN_SECRET ? null : error(503, "not configured");

async function handlePuzzle(request: Request, url: URL, env: Env): Promise<Response> {
  const unconfigured = notConfigured(env);
  if (unconfigured) return unconfigured;
  if (await limited(env, request)) return error(429, "slow down");
  const now = Date.now();
  const date = url.searchParams.get("date") ?? "";
  if (!dateWithinWindow(date, now)) return error(400, "bad date");
  const number = puzzleNumber(date);
  if (number === null || number < 1) return error(400, "bad date");
  const puzzle = await loadPuzzle(env, number);
  if (!puzzle) return error(404, "no puzzle");
  const token = await issueStart(env.TOKEN_SECRET, { number, startMs: now, nonce: newNonce() });
  const body: PuzzleResponse = { ...publicView(puzzle), token };
  return json(body);
}

interface Session {
  number: number;
  startMs: number;
  nonce: string;
  body: Record<string, unknown>;
  puzzle: StoredPuzzle;
}

async function session(request: Request, env: Env): Promise<Session | Response> {
  const unconfigured = notConfigured(env);
  if (unconfigured) return unconfigured;
  if (await limited(env, request)) return error(429, "slow down");
  const body = await readJson(request);
  if (!body) return error(400, "bad request");
  const token = await verifyStart(env.TOKEN_SECRET, body.token);
  if (!token) return error(400, "bad token");
  if (!isOpen(token.number, Date.now())) return error(404, "puzzle not open");
  const puzzle = await loadPuzzle(env, token.number);
  if (!puzzle) return error(404, "no puzzle");
  return { ...token, body, puzzle };
}

async function handleSlot(request: Request, env: Env): Promise<Response> {
  const s = await session(request, env);
  if (s instanceof Response) return s;
  const { slot, word } = s.body;
  if (typeof slot !== "number" || !Number.isInteger(slot) || slot < 0 || slot >= s.puzzle.m) {
    return error(400, "bad slot");
  }
  if (!isWord(word)) return error(400, "bad word");
  const body: SlotResponse = { match: s.puzzle.solution[slot] === word };
  return json(body);
}

async function handleSolve(request: Request, env: Env): Promise<Response> {
  const s = await session(request, env);
  if (s instanceof Response) return s;
  const { words } = s.body;
  if (!Array.isArray(words) || words.length > s.puzzle.m || !words.every(isWord)) {
    return error(400, "bad words");
  }
  const results = resultsFor(env, s.number);
  if (await results.isRevealed(s.nonce)) return error(409, "already revealed");
  const correct =
    words.length === s.puzzle.solution.length && words.every((w, i) => w === s.puzzle.solution[i]);
  if (!correct) return json({ ok: false } satisfies SolveResponse);
  const elapsed = await results.record(s.nonce, Math.max(MIN_ELAPSED_MS, Date.now() - s.startMs));
  if (elapsed === null) return error(409, "already revealed");
  const result = await issueResult(env.TOKEN_SECRET, {
    number: s.number,
    elapsedMs: elapsed,
    nonce: s.nonce,
  });
  const body: SolveResponse = {
    ok: true,
    elapsedMs: elapsed,
    checksum: s.puzzle.checksum,
    result,
  };
  return json(body);
}

async function handleReveal(request: Request, env: Env): Promise<Response> {
  const s = await session(request, env);
  if (s instanceof Response) return s;
  await resultsFor(env, s.number).reveal(s.nonce);
  const body: RevealResponse = { solution: s.puzzle.solution, checksum: s.puzzle.checksum };
  return json(body);
}

async function handleStats(numberText: string, env: Env): Promise<Response> {
  const number = Number(numberText);
  if (!isOpen(number, Date.now())) return error(404, "puzzle not open");
  const body: StatsResponse = { number, ...(await resultsFor(env, number).summary()) };
  return json(body, 200, "public, max-age=30");
}

async function handleResult(token: string, env: Env): Promise<Response> {
  const unconfigured = notConfigured(env);
  if (unconfigured) return unconfigured;
  const result = await verifyResult(env.TOKEN_SECRET, token);
  if (!result) return error(404, "not found");
  const body: ResultResponse = { number: result.number, elapsedMs: result.elapsedMs };
  return json(body);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;
    if (pathname === "/api/health") return json({ ok: true });
    if (pathname === "/api/puzzle" && method === "GET") return handlePuzzle(request, url, env);
    if (pathname === "/api/slot" && method === "POST") return handleSlot(request, env);
    if (pathname === "/api/solve" && method === "POST") return handleSolve(request, env);
    if (pathname === "/api/reveal" && method === "POST") return handleReveal(request, env);
    const stats = /^\/api\/stats\/(\d{1,6})$/.exec(pathname);
    if (stats && method === "GET") return handleStats(stats[1]!, env);
    const result = /^\/api\/result\/([A-Za-z0-9_.-]+)$/.exec(pathname);
    if (result && method === "GET") return handleResult(result[1]!, env);
    if (pathname.startsWith("/api/")) return error(404, "not found");
    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;
