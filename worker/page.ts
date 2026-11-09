import { formatElapsed } from "../shared/time.ts";
import type { ResultResponse } from "../shared/api.ts";
import { escapeHtml } from "./html.ts";

const DESCRIPTION = "A daily word puzzle. One phrase fits every rule; read off its checksum.";

const STYLE = `
@font-face{font-family:"Newsreader";src:url("/fonts/newsreader-24pt.woff2") format("woff2");font-weight:400 700;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url("/fonts/jetbrains-mono-regular.woff2") format("woff2");font-weight:400;font-display:swap}
@font-face{font-family:"JetBrains Mono";src:url("/fonts/jetbrains-mono-medium.woff2") format("woff2");font-weight:500;font-display:swap}
:root{color-scheme:light;--paper:#f4efe6;--ink:#1b1a17;--ink-soft:#625c51;--rule:#c9c1b1;--serif:"Newsreader","Iowan Old Style","Palatino Linotype",Georgia,serif;--mono:"JetBrains Mono",ui-monospace,"SF Mono",Menlo,Consolas,monospace}
*{box-sizing:border-box}
body{margin:0;background:var(--paper);color:var(--ink);font-family:var(--serif);font-size:1rem;line-height:1.45;-webkit-text-size-adjust:100%}
.masthead,main{max-width:40rem;margin:0 auto;padding:0 1rem}
.wordmark{font-family:var(--mono);font-weight:500;font-size:1.5rem;margin:1.5rem 0 1rem}
main{border-top:1px solid var(--rule);padding-top:2rem}
.number{font-family:var(--mono);font-weight:500;font-size:2rem;margin:0}
.caption{color:var(--ink-soft);margin:1.5rem 0 0}
.time{font-family:var(--mono);font-weight:500;font-size:3rem;margin:0 0 2rem}
a{color:inherit;display:inline-block;padding:0.75rem 0}
:focus-visible{outline:2px solid var(--ink);outline-offset:2px}
`;

const hashStyle = async (): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(STYLE));
  return `'sha256-${btoa(String.fromCharCode(...new Uint8Array(digest)))}'`;
};

let styleHash: Promise<string> | undefined;

export async function pageHeaders(): Promise<Record<string, string>> {
  styleHash ??= hashStyle();
  const csp = [
    "default-src 'none'",
    `style-src 'self' ${await styleHash}`,
    "font-src 'self'",
    "img-src 'self'",
    "base-uri 'none'",
    "form-action 'none'",
    "frame-ancestors 'none'",
  ].join("; ");
  return {
    "content-type": "text/html; charset=utf-8",
    "content-security-policy": csp,
    "x-content-type-options": "nosniff",
    "referrer-policy": "strict-origin-when-cross-origin",
  };
}

export function resultPage(result: ResultResponse, imageUrl: string): string {
  const time = formatElapsed(result.elapsedMs);
  const title = escapeHtml(`Checksum No. ${result.number}, solved in ${time}`);
  const image = escapeHtml(imageUrl);
  const description = escapeHtml(DESCRIPTION);
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<meta property="og:type" content="website">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:image" content="${image}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${title}">
<meta name="twitter:description" content="${description}">
<meta name="twitter:image" content="${image}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<style>${STYLE}</style>
</head>
<body>
<header class="masthead"><h1 class="wordmark">checksum</h1></header>
<main>
<p class="number">No. ${escapeHtml(String(result.number))}</p>
<p class="caption">solved in</p>
<p class="time">${escapeHtml(time)}</p>
<a href="/">Play today's puzzle</a>
</main>
</body>
</html>
`;
}

export const notFoundPage = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Not found</title>
</head>
<body>
<p>Nothing here. <a href="/">Play today's puzzle</a></p>
</body>
</html>
`;
