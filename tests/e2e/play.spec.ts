import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import type { StoredPuzzle } from "../../shared/constraints.ts";
import { describe, describeChecksum } from "../../shared/constraints.ts";
import { puzzleNumber } from "../../shared/day.ts";

const number = puzzleNumber(new Date().toISOString().slice(0, 10))!;
const fixture = JSON.parse(readFileSync("tests/fixtures/puzzles.json", "utf8")) as {
  puzzles: StoredPuzzle[];
};
const puzzle = fixture.puzzles[0]!;
const { solution, checksum } = puzzle;
const ruleTexts = [...puzzle.constraints.map(describe), describeChecksum(puzzle.n)];

const width = () => test.info().project.use.viewport!.width;
const shot = (page: Page, state: string) =>
  page.screenshot({ path: `test-results/play-${width()}-${state}.png`, fullPage: true });

const fill = async (page: Page, words: readonly string[]) => {
  for (const [i, word] of words.entries()) await page.getByLabel(`Word ${i + 1}`).fill(word);
};

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "share", { value: undefined });
  });
});

test("renders the rules, the slots, and the checksum row", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".rules li")).toHaveText(
    ruleTexts.map((t) => new RegExp(`${t.replace(/[.]/g, "\\.")}$`)),
  );
  await expect(page.locator(".rules li.ok")).toHaveCount(0);
  await expect(page.locator(".slot")).toHaveCount(puzzle.m);
  await expect(page.locator(".checksum .letters")).toHaveText("·".repeat(puzzle.m));
  await expect(page.locator(".lede")).toContainText("Fill the four words");
  await expect(page.locator("#meta")).toContainText(`No. ${number} · 0:0`);
  await shot(page, "empty");

  await page.getByLabel("Word 1").fill("zzzzz");
  await page.getByLabel("Word 1").blur();
  await expect(page.locator(".slot").first().locator(".len")).toHaveText("not in list");
  await page.getByLabel("Word 1").fill("zz");
  await expect(page.locator(".slot").first().locator(".len")).toHaveText("2");
});

test("solves the puzzle, locks the slots, shares, and survives a reload", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await fill(page, solution);
  await expect(page.locator(".rules li.ok")).toHaveCount(ruleTexts.length);
  await expect(page.locator(".checksum .letters.word-ok")).toHaveText(checksum.split("").join(""));
  await expect(page.locator(".slot.locked")).toHaveCount(puzzle.m);
  const verdict = page.locator(".result p").first();
  await expect(verdict).toHaveText(/^Solved in \d+:\d{2}\.$/);
  const time = /Solved in (\S+)\./.exec((await verdict.textContent())!)![1]!;
  await expect(page.locator(".result .global")).toHaveText(/solved today|first to solve it today/);

  await page.getByRole("button", { name: "share" }).click();
  await expect(page.getByRole("button", { name: "copied" })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  const [head, link] = copied.split("\n");
  expect(head).toBe(`Checksum No. ${number} · ${time}`);
  expect(link).toMatch(new RegExp(`^${page.url().replace(/\/$/, "")}/r/[A-Za-z0-9_.-]+$`));
  expect((await request.get(link!)).status()).toBe(200);
  await shot(page, "solved");

  await page.getByRole("button", { name: "stats" }).click();
  const stats = page.locator("#stats dl");
  await expect(stats).toContainText("Played1");
  await expect(stats).toContainText("Solved1");
  await expect(stats).toContainText("Current streak1");
  await expect(stats).toContainText(`Best time${time}`);
  await shot(page, "stats");

  await page.reload();
  await expect(page.locator(".result p").first()).toHaveText(`Solved in ${time}.`);
  await expect(page.locator(".slot.locked")).toHaveCount(puzzle.m);
  await expect(page.locator(".rules li.ok")).toHaveCount(ruleTexts.length);
  await expect(page.getByLabel("Word 1")).toHaveValue(solution[0]!);
  await expect(page.locator("#meta b")).toHaveText(time);
});

test("reveal fills the solution and ends the day", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".slot")).toHaveCount(puzzle.m);
  await page.getByRole("button", { name: "reveal" }).click();
  await expect(page.locator(".actions")).toContainText("Reveal the solution and end today's game?");
  await page.getByRole("button", { name: "no" }).click();
  await page.getByRole("button", { name: "reveal" }).click();
  await page.getByRole("button", { name: "yes" }).click();
  await expect(page.locator(".result")).toHaveText("Revealed. Back tomorrow.");
  for (const [i, word] of solution.entries()) {
    await expect(page.getByLabel(`Word ${i + 1}`)).toHaveValue(word);
  }
  await expect(page.locator(".slot.locked")).toHaveCount(puzzle.m);
  await expect(page.getByRole("button", { name: "share" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".result")).toHaveText("Revealed. Back tomorrow.");
});

test("a busy server shows one line and a retry link", async ({ page }) => {
  await page.route("**/api/puzzle*", (route) => route.fulfill({ status: 429, body: "{}" }));
  await page.goto("/");
  await expect(page.getByRole("status")).toContainText("The server is busy, try again in a moment");
  await page.unroute("**/api/puzzle*");
  await page.getByRole("button", { name: "retry" }).click();
  await expect(page.locator(".slot")).toHaveCount(puzzle.m);
  await expect(page.getByRole("status")).toHaveText("");
});
