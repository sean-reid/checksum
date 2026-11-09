import type { PublicPuzzle } from "../shared/constraints.ts";
import { MAX_WORD_LENGTH } from "../shared/api.ts";
import { lede, sanitizeWord, type BoardView, type SlotView } from "./game.ts";

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<Record<string, string>> = {},
  ...kids: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) if (v !== undefined) node.setAttribute(k, v);
  node.append(...kids);
  return node;
}

export const linkButton = (label: string, onClick: () => void): HTMLButtonElement => {
  const b = h("button", { type: "button", class: "link" }, label);
  b.addEventListener("click", onClick);
  return b;
};

export interface BoardHandlers {
  input(slot: number, raw: string): void;
  blur(slot: number): void;
  reveal(): void;
  share(): void;
}

interface SlotRefs {
  root: HTMLElement;
  input: HTMLInputElement;
  mirror: HTMLElement;
  count: HTMLElement;
}

export interface Board {
  root: HTMLElement;
  update(view: BoardView, locked: boolean): void;
  setWords(words: readonly string[]): void;
  focus(slot: number): void;
  showSolved(text: string, shareLabel: string): void;
  setGlobal(line: string): void;
  showRevealed(): void;
  setShareLabel(label: string): void;
  endGame(): void;
}

function mirrorOf(slot: SlotView): (Node | string)[] {
  const nodes: (Node | string)[] = [slot.before];
  if (slot.nth) nodes.push(h("span", { class: "nth" }, slot.nth));
  nodes.push(slot.after);
  return nodes;
}

function buildSlot(i: number, handlers: BoardHandlers, onNext: (i: number) => void): SlotRefs {
  const input = h("input", {
    class: "word",
    type: "text",
    autocomplete: "off",
    autocapitalize: "none",
    autocorrect: "off",
    spellcheck: "false",
    maxlength: String(MAX_WORD_LENGTH),
    inputmode: "text",
    "aria-label": `Word ${i + 1}`,
  });
  const mirror = h("div", { class: "mirror", "aria-hidden": "true" });
  const count = h("span", { class: "len" });
  const root = h(
    "div",
    { class: "slot empty" },
    h("span", { class: "num", "aria-hidden": "true" }, String(i + 1)),
    h("div", { class: "word-wrap" }, mirror, input),
    count,
  );
  input.addEventListener("input", () => {
    const raw = input.value;
    const clean = sanitizeWord(raw);
    if (clean !== raw) {
      const caret = sanitizeWord(raw.slice(0, input.selectionStart ?? raw.length)).length;
      input.value = clean;
      input.setSelectionRange(caret, caret);
    }
    handlers.input(i, clean);
  });
  input.addEventListener("blur", () => handlers.blur(i));
  input.addEventListener("scroll", () => {
    mirror.scrollLeft = input.scrollLeft;
  });
  input.addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    onNext(i);
  });
  return { root, input, mirror, count };
}

export function createBoard(puzzle: PublicPuzzle, handlers: BoardHandlers): Board {
  const rules = h("ol", { class: "rules" });
  const slots: SlotRefs[] = [];
  const next = (i: number) => slots[i + 1]?.input.focus();
  for (let i = 0; i < puzzle.m; i++) slots.push(buildSlot(i, handlers, next));
  const letters = h("span", { class: "letters" });
  const result = h("div", { class: "result" });
  result.hidden = true;
  const actions = h("p", { class: "actions" });
  const root = h(
    "div",
    {},
    h("p", { class: "lede" }, lede(puzzle.m)),
    rules,
    h("div", { class: "slots" }, ...slots.map((s) => s.root)),
    h("p", { class: "checksum" }, h("span", { class: "label" }, "checksum"), letters),
    result,
    actions,
  );

  const showAsk = () => {
    const yes = linkButton("yes", () => handlers.reveal());
    const no = linkButton("no", showReveal);
    actions.replaceChildren("Reveal the solution and end today's game? ", yes, " · ", no);
    yes.focus();
  };
  const showReveal = () => {
    const link = linkButton("reveal", showAsk);
    actions.replaceChildren(link);
  };
  showReveal();

  let share: HTMLButtonElement | null = null;
  let global: HTMLElement | null = null;

  return {
    root,
    update(view, locked) {
      const rows = view.rules;
      while (rules.children.length > rows.length) rules.lastElementChild?.remove();
      rows.forEach((rule, i) => {
        let li = rules.children[i] as HTMLElement | undefined;
        if (!li) {
          li = h("li", {}, h("span", { class: "mark" }), h("span", { class: "text" }));
          rules.append(li);
        }
        li.className = rule.ok ? "ok" : "";
        const mark = li.children[0]!;
        mark.replaceChildren(
          h("span", { class: "sr" }, rule.ok ? "Met: " : "Not met: "),
          h("span", { "aria-hidden": "true" }, rule.ok ? "✓" : "·"),
        );
        li.children[1]!.textContent = rule.text;
      });
      view.slots.forEach((s, i) => {
        const refs = slots[i]!;
        refs.root.className = `slot${s.locked ? " locked" : ""}${s.empty ? " empty" : ""}`;
        refs.mirror.replaceChildren(...mirrorOf(s));
        refs.count.textContent = s.count;
        refs.count.className = s.countSoft ? "len" : "len listed";
        refs.input.readOnly = locked;
      });
      letters.className = view.checksum.isWord ? "letters word-ok" : "letters";
      letters.replaceChildren(
        ...view.checksum.letters.map((l) => (l ? l : h("span", { class: "blank" }, "·"))),
      );
    },
    setWords(words) {
      words.forEach((w, i) => {
        const input = slots[i]?.input;
        if (input) input.value = w;
      });
    },
    focus(slot) {
      slots[slot]?.input.focus();
    },
    showSolved(text, shareLabel) {
      share = h("button", { type: "button", class: "share" }, shareLabel);
      share.addEventListener("click", handlers.share);
      global = h("p", { class: "global" });
      result.replaceChildren(h("p", {}, text), share, global);
      result.hidden = false;
    },
    setGlobal(line) {
      if (global) global.textContent = line;
    },
    showRevealed() {
      result.replaceChildren(h("p", {}, "Revealed. Back tomorrow."));
      result.hidden = false;
    },
    setShareLabel(label) {
      if (share) share.textContent = label;
    },
    endGame() {
      actions.replaceChildren();
    },
  };
}
