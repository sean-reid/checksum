export interface Reply<T> {
  status: number;
  body: T | null;
}

export async function call<T>(path: string, data?: unknown): Promise<Reply<T>> {
  try {
    const res = await fetch(
      path,
      data === undefined
        ? undefined
        : {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(data),
          },
    );
    const body = res.ok ? ((await res.json()) as T) : null;
    return { status: res.status, body };
  } catch {
    return { status: 0, body: null };
  }
}

export async function loadWordSet(): Promise<Set<string> | null> {
  try {
    const res = await fetch("/data/words.txt");
    if (!res.ok) return null;
    return new Set((await res.text()).split("\n").filter(Boolean));
  } catch {
    return null;
  }
}

export async function loadCategories(): Promise<Map<string, readonly string[]> | null> {
  try {
    const res = await fetch("/data/categories.json");
    if (!res.ok) return null;
    const rows = (await res.json()) as { name: string; members: string[] }[];
    return new Map(rows.map((r) => [r.name, r.members]));
  } catch {
    return null;
  }
}
