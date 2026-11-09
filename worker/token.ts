export interface StartToken {
  number: number;
  startMs: number;
  nonce: string;
}

export interface ResultToken {
  number: number;
  elapsedMs: number;
  nonce: string;
}

const enc = new TextEncoder();

const b64url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

function fromB64url(s: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/.test(s)) return null;
  const padded = s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4);
  try {
    return Uint8Array.from(atob(padded), (ch) => ch.charCodeAt(0));
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export const newNonce = (): string => b64url(crypto.getRandomValues(new Uint8Array(12)));

async function sign(secret: string, body: string): Promise<string> {
  const sig = await crypto.subtle.sign("HMAC", await hmacKey(secret), enc.encode(body));
  return `${body}.${b64url(new Uint8Array(sig))}`;
}

async function verifyBody(secret: string, body: string, sig: string): Promise<boolean> {
  const sigBytes = fromB64url(sig);
  if (!sigBytes) return false;
  return crypto.subtle.verify(
    "HMAC",
    await hmacKey(secret),
    sigBytes as BufferSource,
    enc.encode(body),
  );
}

const NUMBER = /^\d{1,6}$/;
const MILLIS = /^\d{1,15}$/;
const NONCE = /^[A-Za-z0-9_-]{16}$/;

export const issueStart = (secret: string, t: StartToken): Promise<string> =>
  sign(secret, `${t.number}.${t.startMs}.${t.nonce}`);

export const issueResult = (secret: string, t: ResultToken): Promise<string> =>
  sign(secret, `r.${t.number}.${t.elapsedMs}.${t.nonce}`);

export async function verifyStart(secret: string, token: unknown): Promise<StartToken | null> {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [num, start, nonce, sig] = parts as [string, string, string, string];
  if (!NUMBER.test(num) || !MILLIS.test(start) || !NONCE.test(nonce)) return null;
  if (!(await verifyBody(secret, `${num}.${start}.${nonce}`, sig))) return null;
  return { number: Number(num), startMs: Number(start), nonce };
}

export async function verifyResult(secret: string, token: unknown): Promise<ResultToken | null> {
  if (typeof token !== "string") return null;
  const parts = token.split(".");
  if (parts.length !== 5 || parts[0] !== "r") return null;
  const [, num, elapsed, nonce, sig] = parts as [string, string, string, string, string];
  if (!NUMBER.test(num) || !MILLIS.test(elapsed) || !NONCE.test(nonce)) return null;
  if (!(await verifyBody(secret, `r.${num}.${elapsed}.${nonce}`, sig))) return null;
  return { number: Number(num), elapsedMs: Number(elapsed), nonce };
}
