import { expect, test } from "@playwright/test";

test("serves the page and the health check", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "checksum" })).toBeVisible();
  await expect(page.locator(".issue")).toContainText("No.");
  await page.screenshot({
    path: `test-results/smoke-${test.info().project.name}.png`,
    fullPage: true,
  });
  const health = await request.get("/api/health");
  expect(await health.json()).toEqual({ ok: true });
});
