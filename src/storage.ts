import type { StoredGame } from "./game.ts";
import { parseStats, type Stats } from "./stats.ts";

const gameKey = (number: number): string => `checksum:game:${number}`;
const STATS_KEY = "checksum:stats";
export const THEME_KEY = "checksum:theme";

export function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    return;
  }
}

export function loadGame(number: number): StoredGame | null {
  const raw = read(gameKey(number));
  if (!raw) return null;
  try {
    const g = JSON.parse(raw) as StoredGame;
    const ok =
      typeof g.puzzle?.token === "string" &&
      g.puzzle.number === number &&
      Array.isArray(g.words) &&
      g.words.length === g.puzzle.m &&
      typeof g.answers === "object" &&
      g.answers !== null;
    return ok ? g : null;
  } catch {
    return null;
  }
}

export const saveGame = (g: StoredGame): void => write(gameKey(g.puzzle.number), JSON.stringify(g));

export const loadStats = (): Stats => parseStats(read(STATS_KEY));

export const saveStats = (s: Stats): void => write(STATS_KEY, JSON.stringify(s));
