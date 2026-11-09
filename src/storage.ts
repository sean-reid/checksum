import { parseGame, type StoredGame } from "./game.ts";
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

export const loadGame = (number: number): StoredGame | null =>
  parseGame(read(gameKey(number)), number);

export const saveGame = (g: StoredGame): void => write(gameKey(g.puzzle.number), JSON.stringify(g));

export const loadStats = (): Stats => parseStats(read(STATS_KEY));

export const saveStats = (s: Stats): void => write(STATS_KEY, JSON.stringify(s));
