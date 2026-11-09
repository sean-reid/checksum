import { expect, test } from "@playwright/test";

test("serves the page, the empty state, and the health check", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "checksum" })).toBeVisible();
  await expect(page.getByRole("status")).toHaveText("No puzzle today. Back tomorrow.");
  await page.screenshot({
    path: `test-results/smoke-${test.info().project.name}.png`,
    fullPage: true,
  });
  const health = await request.get("/api/health");
  expect(await health.json()).toEqual({ ok: true });
});
