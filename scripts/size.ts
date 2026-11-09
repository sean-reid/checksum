import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

// First-load budget for the JS and CSS the page requests before play begins.
const LIMIT_KB = 30;
const dir = "dist/assets";

let total = 0;
for (const name of readdirSync(dir)) {
  if (!name.endsWith(".js") && !name.endsWith(".css")) continue;
  const gz = gzipSync(readFileSync(join(dir, name))).length;
  total += gz;
  console.log(`${name}: ${(gz / 1024).toFixed(1)} KB gzip`);
}
const kb = total / 1024;
console.log(`total gzip: ${kb.toFixed(1)} KB (limit ${LIMIT_KB} KB)`);
if (kb > LIMIT_KB) {
  console.error("bundle over budget");
  process.exit(1);
}
