import { describe, expect, it } from "vitest";
import { escapeHtml } from "../../worker/html.ts";

describe("escapeHtml", () => {
  it("escapes markup and quotes", () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&</a>`)).toBe(
      "&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&lt;/a&gt;",
    );
  });
  it("does not double escape", () => expect(escapeHtml("&amp;")).toBe("&amp;amp;"));
  it("leaves plain text alone", () => expect(escapeHtml("No. 42 · 12:34")).toBe("No. 42 · 12:34"));
});
