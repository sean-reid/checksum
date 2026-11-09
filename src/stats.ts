export interface Stats {
  played: number;
  solved: number;
  streak: number;
  best: number;
  bestMs: number | null;
  times: number[];
  lastSolved: number | null;
}

const MAX_TIMES = 365;

export const emptyStats = (): Stats => ({
  played: 0,
  solved: 0,
  streak: 0,
  best: 0,
  bestMs: null,
  times: [],
  lastSolved: null,
});

export const recordPlayed = (s: Stats): Stats => ({ ...s, played: s.played + 1 });

export function recordSolve(s: Stats, number: number, elapsedMs: number): Stats {
  if (s.lastSolved === number) return s;
  const streak = s.lastSolved === number - 1 ? s.streak + 1 : 1;
  return {
    ...s,
    solved: s.solved + 1,
    streak,
    best: Math.max(s.best, streak),
    bestMs: s.bestMs === null ? elapsedMs : Math.min(s.bestMs, elapsedMs),
    times: [...s.times, elapsedMs].slice(-MAX_TIMES),
    lastSolved: number,
  };
}

export const recordLoss = (s: Stats, counted: boolean): Stats => ({
  ...s,
  played: counted ? s.played : s.played + 1,
  streak: 0,
});

export const currentStreak = (s: Stats, today: number): number =>
  s.lastSolved !== null && s.lastSolved >= today - 1 ? s.streak : 0;

export function median(times: readonly number[]): number | null {
  if (times.length === 0) return null;
  const sorted = [...times].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

export function parseStats(raw: string | null): Stats {
  if (!raw) return emptyStats();
  try {
    const v = JSON.parse(raw) as Partial<Stats>;
    const num = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) ? x : 0);
    const orNull = (x: unknown): number | null =>
      typeof x === "number" && Number.isFinite(x) ? x : null;
    return {
      played: num(v.played),
      solved: num(v.solved),
      streak: num(v.streak),
      best: num(v.best),
      bestMs: orNull(v.bestMs),
      times: Array.isArray(v.times) ? v.times.filter((t) => typeof t === "number") : [],
      lastSolved: orNull(v.lastSolved),
    };
  } catch {
    return emptyStats();
  }
}
