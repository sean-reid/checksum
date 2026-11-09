import type {
  PuzzleResponse,
  RevealResponse,
  SlotResponse,
  SolveResponse,
  StatsResponse,
} from "../shared/api.ts";
import { localIsoDate, msUntilLocalMidnight, puzzleNumber } from "../shared/day.ts";
import { formatElapsed } from "../shared/time.ts";
import { call, loadCategories, loadWordSet } from "./client.ts";
import {
  answerKey,
  boardView,
  isLocked,
  newGame,
  parseStartMs,
  shareText,
  type GameData,
  type StoredGame,
} from "./game.ts";
import { THEME_KEY, loadGame, loadStats, read, saveGame, saveStats, write } from "./storage.ts";
import { currentStreak, median, recordLoss, recordPlayed, recordSolve } from "./stats.ts";
import { createBoard, h, linkButton, type Board } from "./view.ts";

const storedTheme = read(THEME_KEY);
if (storedTheme === "dark" || storedTheme === "light") {
  document.documentElement.dataset.theme = storedTheme;
}

const el = (id: string): HTMLElement => document.getElementById(id)!;
const main = el("main");
const notice = el("notice");
const meta = el("meta");
const statsPanel = el("stats");
const statsToggle = el("stats-toggle");
const themeToggle = el("theme-toggle");

const BUSY = "The server is busy, try again in a moment";
const CHECK_DELAY_MS = 400;
const SETTLE_MS = 700;
const BACKOFF_MS = 10_000;
const RETRY_MS = 2000;

let sticky = false;

function clearNotice(): void {
  if (!sticky) notice.replaceChildren();
}

function say(text: string, action?: { label: string; run: () => void }): void {
  notice.replaceChildren(text);
  if (action) notice.append(" ", linkButton(action.label, action.run));
}

const effectiveTheme = (): "dark" | "light" =>
  document.documentElement.dataset.theme === "dark" ||
  (document.documentElement.dataset.theme !== "light" &&
    matchMedia("(prefers-color-scheme: dark)").matches)
    ? "dark"
    : "light";

function paintThemeLink(): void {
  themeToggle.textContent = effectiveTheme() === "dark" ? "light" : "dark";
}

themeToggle.addEventListener("click", () => {
  const next = effectiveTheme() === "dark" ? "light" : "dark";
  document.documentElement.dataset.theme = next;
  write(THEME_KEY, next);
  paintThemeLink();
});
paintThemeLink();

let stats = loadStats();
let todayNumber = 0;

function paintStats(): void {
  const time = (ms: number | null) => (ms === null ? "none" : formatElapsed(ms));
  const rows: [string, string][] = [
    ["Played", String(stats.played)],
    ["Solved", String(stats.solved)],
    ["Current streak", String(currentStreak(stats, todayNumber))],
    ["Best streak", String(stats.best)],
    ["Best time", time(stats.bestMs)],
    ["Median time", time(median(stats.times))],
  ];
  statsPanel.replaceChildren(
    h("dl", {}, ...rows.flatMap(([k, v]) => [h("dt", {}, k), h("dd", {}, v)])),
  );
}

statsToggle.addEventListener("click", () => {
  const open = statsPanel.hidden;
  if (open) paintStats();
  statsPanel.hidden = !open;
  statsToggle.setAttribute("aria-expanded", String(open));
});

const updateStats = (next: typeof stats): void => {
  stats = next;
  saveStats(stats);
  if (!statsPanel.hidden) paintStats();
};

function paintMeta(number: number, clock?: HTMLElement): void {
  meta.replaceChildren(`No. ${number}`);
  if (clock) meta.append(" · ", clock);
}

function play(game: StoredGame): void {
  const { puzzle } = game;
  const startMs = parseStartMs(puzzle.token) ?? Date.now();
  const data: GameData = { words: null, categories: null };
  const settled = game.words.map(() => false);
  const lastChecked = game.words.map((w, i) =>
    game.answers[answerKey(i, w)] === undefined ? "" : w,
  );
  const checkTimers: number[] = [];
  const settleTimers: number[] = [];
  const clock = h("b");
  let finished = game.solved || game.revealed;
  let ticker = 0;
  let backoffUntil = 0;
  let solving = false;
  let lastSolveKey = "";
  let scheduledKey = "";
  let solveTimer = 0;

  const lockedNow = (): boolean[] => game.words.map((_, i) => finished || isLocked(game, i));

  const render = (): void => {
    const view = boardView(game, data, settled, lockedNow());
    board.update(view, finished);
    const listed = data.words !== null && game.words.every((w) => data.words?.has(w));
    if (finished || !view.solvable || !listed) {
      clearTimeout(solveTimer);
      scheduledKey = "";
      return;
    }
    const key = game.words.join(",");
    if (key === scheduledKey) return;
    clearTimeout(solveTimer);
    scheduledKey = key;
    solveTimer = window.setTimeout(() => void submit(), CHECK_DELAY_MS);
  };

  const paintClock = (ms: number): void => {
    clock.textContent = formatElapsed(ms);
  };

  const startClock = (): void => {
    paintClock(Date.now() - startMs);
    ticker = window.setInterval(() => paintClock(Date.now() - startMs), 1000);
  };

  const stopClock = (ms: number): void => {
    clearInterval(ticker);
    paintClock(ms);
  };

  const persist = (): void => saveGame(game);

  const count = (): void => {
    if (game.counted) return;
    game.counted = true;
    updateStats(recordPlayed(stats));
  };

  const runCheck = async (slot: number, word: string, retry = true): Promise<void> => {
    if (game.words[slot] !== word || finished) return;
    const wait = backoffUntil - Date.now();
    if (wait > 0) {
      checkTimers[slot] = window.setTimeout(() => void runCheck(slot, word), wait);
      return;
    }
    const key = answerKey(slot, word);
    if (game.answers[key] === undefined) {
      const reply = await call<SlotResponse>("/api/slot", { token: puzzle.token, slot, word });
      if (reply.status === 429) {
        backoffUntil = Date.now() + BACKOFF_MS;
        checkTimers[slot] = window.setTimeout(() => void runCheck(slot, word), BACKOFF_MS);
        return;
      }
      if (!reply.body) {
        if (retry) {
          checkTimers[slot] = window.setTimeout(() => void runCheck(slot, word, false), RETRY_MS);
        }
        return;
      }
      clearNotice();
      game.answers[key] = reply.body.match;
    }
    lastChecked[slot] = word;
    count();
    persist();
    if (game.words[slot] === word) render();
  };

  const scheduleCheck = (slot: number): void => {
    clearTimeout(checkTimers[slot]);
    const word = game.words[slot] ?? "";
    if (!data.words?.has(word) || word === lastChecked[slot]) return;
    checkTimers[slot] = window.setTimeout(() => void runCheck(slot, word), CHECK_DELAY_MS);
  };

  const globalLine = async (): Promise<void> => {
    const reply = await call<StatsResponse>(`/api/stats/${puzzle.number}`);
    if (!reply.body) return;
    const { solves, medianMs } = reply.body;
    board.setGlobal(
      solves <= 1
        ? "You're the first to solve it today."
        : `${solves} solved today${medianMs === null ? "" : `, median ${formatElapsed(medianMs)}`}`,
    );
  };

  const showSolved = (focus: boolean): void => {
    stopClock(game.elapsedMs ?? 0);
    board.showSolved(`Solved in ${formatElapsed(game.elapsedMs ?? 0)}.`, "share", focus);
    board.endGame();
    void globalLine();
  };

  async function submit(): Promise<void> {
    const key = game.words.join(",");
    if (solving) {
      scheduledKey = "";
      return;
    }
    if (key === lastSolveKey) return;
    solving = true;
    lastSolveKey = key;
    const reply = await call<SolveResponse>("/api/solve", {
      token: puzzle.token,
      words: game.words,
    });
    solving = false;
    if (finished) return;
    if (reply.body?.ok) {
      clearNotice();
      count();
      finished = true;
      game.solved = true;
      game.elapsedMs = reply.body.elapsedMs;
      game.result = reply.body.result;
      persist();
      updateStats(recordSolve(stats, puzzle.number, reply.body.elapsedMs));
      render();
      showSolved(true);
      return;
    }
    if (reply.body) {
      say("That isn't the phrase.");
    } else {
      lastSolveKey = "";
      scheduledKey = "";
      say(reply.status === 429 || reply.status === 503 ? BUSY : "Couldn't check the phrase.", {
        label: "retry",
        run: render,
      });
    }
    if (game.words.join(",") !== key) {
      scheduledKey = "";
      render();
    }
  }

  const flashShare = (label: string): void => {
    board.setShareLabel(label);
    setTimeout(() => board.setShareLabel("share"), 2000);
  };

  const share = async (): Promise<void> => {
    if (game.result === null || game.elapsedMs === null) return;
    const text = shareText(puzzle.number, game.elapsedMs, location.origin, game.result);
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      flashShare("copied");
    } catch {
      flashShare("couldn't copy");
    }
  };

  const reveal = async (): Promise<void> => {
    const reply = await call<RevealResponse>("/api/reveal", { token: puzzle.token });
    if (!reply.body) {
      say(reply.status === 429 || reply.status === 503 ? BUSY : "Couldn't reveal the solution.", {
        label: "retry",
        run: () => void reveal(),
      });
      return;
    }
    clearNotice();
    finished = true;
    game.revealed = true;
    game.words = reply.body.solution;
    game.elapsedMs = Date.now() - startMs;
    const counted = game.counted;
    game.counted = true;
    persist();
    updateStats(recordLoss(stats, counted));
    board.setWords(game.words);
    render();
    stopClock(game.elapsedMs);
    board.showRevealed(true);
    board.endGame();
  };

  const board: Board = createBoard(puzzle, {
    input(slot, word) {
      clearNotice();
      game.words[slot] = word;
      settled[slot] = false;
      clearTimeout(settleTimers[slot]);
      settleTimers[slot] = window.setTimeout(() => {
        settled[slot] = true;
        render();
      }, SETTLE_MS);
      persist();
      render();
      scheduleCheck(slot);
    },
    blur(slot) {
      clearTimeout(settleTimers[slot]);
      settled[slot] = true;
      render();
    },
    reveal: () => void reveal(),
    share: () => void share(),
  });
  main.replaceChildren(board.root);
  paintMeta(puzzle.number, clock);
  board.setWords(game.words);
  render();

  if (game.solved) showSolved(false);
  else if (game.revealed) {
    stopClock(game.elapsedMs ?? 0);
    board.showRevealed(false);
    board.endGame();
  } else startClock();

  void Promise.all([loadWordSet(), loadCategories()]).then(([words, categories]) => {
    data.words = words;
    data.categories = categories;
    render();
    game.words.forEach((_, i) => scheduleCheck(i));
  });

  setTimeout(() => {
    sticky = true;
    say("A new puzzle is ready", { label: "reload", run: () => location.reload() });
  }, msUntilLocalMidnight());
}

async function start(): Promise<void> {
  notice.replaceChildren();
  const number = puzzleNumber(localIsoDate());
  if (number === null || number < 1) {
    say("No puzzle today. Back tomorrow.");
    return;
  }
  todayNumber = number;
  paintMeta(number);
  const stored = loadGame(number);
  if (stored) {
    play(stored);
    return;
  }
  const reply = await call<PuzzleResponse>(`/api/puzzle?date=${localIsoDate()}`);
  if (reply.body) {
    clearNotice();
    const game = newGame(reply.body);
    saveGame(game);
    play(game);
  } else if (reply.status === 404) {
    say("No puzzle today. Back tomorrow.");
  } else if (reply.status === 429 || reply.status === 503) {
    say(BUSY, { label: "retry", run: () => void start() });
  } else {
    say("Couldn't load today's puzzle", { label: "retry", run: () => void start() });
  }
}

void start();
