import { DurableObject } from "cloudflare:workers";

export interface Summary {
  solves: number;
  giveUps: number;
  medianMs: number | null;
}

// One object per puzzle day. A nonce is either solved or revealed, never both.
export class DayResults extends DurableObject {
  constructor(ctx: DurableObjectState, env: Cloudflare.Env) {
    super(ctx, env);
    this.ctx.storage.sql.exec(
      "CREATE TABLE IF NOT EXISTS solves (nonce TEXT PRIMARY KEY, elapsed_ms INTEGER NOT NULL)",
    );
    this.ctx.storage.sql.exec("CREATE TABLE IF NOT EXISTS reveals (nonce TEXT PRIMARY KEY)");
  }

  record(nonce: string, elapsedMs: number): number | null {
    const sql = this.ctx.storage.sql;
    if (this.isRevealed(nonce)) return null;
    sql.exec("INSERT OR IGNORE INTO solves (nonce, elapsed_ms) VALUES (?, ?)", nonce, elapsedMs);
    return sql
      .exec<{ elapsed_ms: number }>("SELECT elapsed_ms FROM solves WHERE nonce = ?", nonce)
      .one().elapsed_ms;
  }

  reveal(nonce: string): void {
    const sql = this.ctx.storage.sql;
    const solved = sql.exec("SELECT 1 FROM solves WHERE nonce = ?", nonce).toArray().length > 0;
    if (!solved) sql.exec("INSERT OR IGNORE INTO reveals (nonce) VALUES (?)", nonce);
  }

  isRevealed(nonce: string): boolean {
    return (
      this.ctx.storage.sql.exec("SELECT 1 FROM reveals WHERE nonce = ?", nonce).toArray().length > 0
    );
  }

  summary(): Summary {
    const sql = this.ctx.storage.sql;
    const times = sql
      .exec<{ elapsed_ms: number }>("SELECT elapsed_ms FROM solves ORDER BY elapsed_ms")
      .toArray()
      .map((r) => r.elapsed_ms);
    const giveUps = sql.exec<{ c: number }>("SELECT COUNT(*) AS c FROM reveals").one().c;
    const mid = times.length >> 1;
    const medianMs =
      times.length === 0
        ? null
        : times.length % 2
          ? times[mid]!
          : Math.round((times[mid - 1]! + times[mid]!) / 2);
    return { solves: times.length, giveUps, medianMs };
  }
}
