import { initWasm, Resvg } from "@resvg/resvg-wasm";
import wasm from "@resvg/resvg-wasm/index_bg.wasm";
import type { ResultResponse } from "../shared/api.ts";
import { formatElapsed } from "../shared/time.ts";
import { escapeHtml } from "./html.ts";
import jetbrainsMedium from "./fonts/JetBrainsMono-Medium.ttf";
import jetbrainsRegular from "./fonts/JetBrainsMono-Regular.ttf";
import newsreader from "./fonts/Newsreader-Regular.ttf";

export const OG_WIDTH = 1200;
export const OG_HEIGHT = 630;

let ready: Promise<void> | undefined;

export function ogSvg(result: ResultResponse): string {
  const number = escapeHtml(`No. ${result.number}`);
  const time = escapeHtml(formatElapsed(result.elapsedMs));
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${OG_WIDTH}" height="${OG_HEIGHT}" viewBox="0 0 ${OG_WIDTH} ${OG_HEIGHT}">
<rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="#f4efe6"/>
<text x="80" y="112" font-family="JetBrains Mono Medium" font-size="48" fill="#1b1a17">checksum</text>
<rect x="80" y="152" width="1040" height="2" fill="#c9c1b1"/>
<text x="80" y="300" font-family="JetBrains Mono" font-size="112" fill="#1b1a17">${number}</text>
<text x="80" y="388" font-family="Newsreader 16pt" font-size="44" fill="#625c51">solved in</text>
<text x="80" y="540" font-family="JetBrains Mono Medium" font-size="148" fill="#1b1a17">${time}</text>
</svg>`;
}

export async function renderOg(result: ResultResponse): Promise<Uint8Array> {
  ready ??= initWasm(wasm);
  await ready;
  const png = new Resvg(ogSvg(result), {
    font: {
      fontBuffers: [jetbrainsMedium, jetbrainsRegular, newsreader].map((f) => new Uint8Array(f)),
      defaultFontFamily: "JetBrains Mono",
      loadSystemFonts: false,
    },
  });
  return png.render().asPng();
}
