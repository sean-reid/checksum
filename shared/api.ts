import type { PublicPuzzle } from "./constraints.ts";

export const MIN_ELAPSED_MS = 1000;
export const MAX_WORD_LENGTH = 15;

export interface ErrorResponse {
  error: string;
}

export interface PuzzleResponse extends PublicPuzzle {
  token: string;
}

export interface SlotRequest {
  token: string;
  slot: number;
  word: string;
}

export interface SlotResponse {
  match: boolean;
}

export interface SolveRequest {
  token: string;
  words: string[];
}

export type SolveResponse =
  { ok: true; elapsedMs: number; checksum: string; result: string } | { ok: false };

export interface RevealRequest {
  token: string;
}

export interface RevealResponse {
  solution: string[];
  checksum: string;
}

export interface StatsResponse {
  number: number;
  solves: number;
  giveUps: number;
  medianMs: number | null;
}

export interface ResultResponse {
  number: number;
  elapsedMs: number;
}
