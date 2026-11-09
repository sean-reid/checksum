import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vitest/config";

const data = (name: string) =>
  readFileSync(fileURLToPath(new URL(`tools/gen/data/${name}`, import.meta.url)), "utf8");

function wordData(): Plugin {
  return {
    name: "word-data",
    generateBundle() {
      const words = data("words.txt")
        .split("\n")
        .map((line) => line.split(" ")[0])
        .filter(Boolean);
      this.emitFile({ type: "asset", fileName: "data/words.txt", source: `${words.join("\n")}\n` });
      this.emitFile({
        type: "asset",
        fileName: "data/categories.json",
        source: data("categories.json"),
      });
    },
  };
}

export default defineConfig({
  plugins: [wordData()],
  build: {
    target: "es2022",
    sourcemap: false,
    modulePreload: { polyfill: false },
  },
  server: {
    proxy: { "/api": "http://localhost:8787" },
  },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
  },
});
