// DOM glue between `ValuePart[]` and the value cell's `contenteditable` surface.
//
// Framework-free (no React) but DOM-touching: it renders parts into the host,
// reads the host back into parts, and converts the browser's caret/selection to
// and from the linear model in `valueParts.ts`. Behaviour here is verified in the
// real embedded app (jsdom can't model contenteditable selection faithfully); the
// pure math it leans on lives in `valueParts.ts` and is unit-tested.

import type { ValuePart } from "./rows";

const TEXT_NODE = 3; // Node.TEXT_NODE — avoid the DOM global for Node-env imports.

export interface TokenLabels {
  /** Inline text shown in the token, e.g. "Metafield · battery_life". */
  text: string;
  /** Native + assistive tooltip, e.g. "custom · battery_life". */
  title: string;
  /** Screen-reader name, e.g. "Metafield, custom, battery_life". */
  aria: string;
}

type FieldPart = Extract<ValuePart, { type: "METAFIELD" | "SHOPIFY_FIELD" }>;

/** Visible label / tooltip / accessible name for a dynamic-field token. */
export function tokenLabels(part: FieldPart): TokenLabels {
  if (part.type === "METAFIELD") {
    const key = part.key || "—";
    return {
      text: `Metafield · ${key}`,
      title: `${part.namespace || "—"} · ${key}`,
      aria: `Metafield, ${part.namespace || "no namespace"}, ${
        part.key || "no key"
      }`,
    };
  }
  return {
    text: `Field · ${part.field}`,
    title: `Product field · ${part.field}`,
    aria: `Product field, ${part.field}`,
  };
}

function isTokenElement(node: Node): node is HTMLElement {
  return (
    node.nodeType === 1 && (node as HTMLElement).dataset?.token !== undefined
  );
}

// A trailing "filler" <br> (the contenteditable two-<br> trick): a single trailing
// <br> does not create an addressable empty line, so when a value's last visual
// line is empty we append this extra <br> purely so the caret can land there. It
// is never part of `valueParts` — every DOM walk below skips it.
function isFiller(node: Node): boolean {
  return (
    node.nodeName === "BR" &&
    (node as HTMLElement).dataset?.filler !== undefined
  );
}

// A LINE_BREAK part is only ever a `<br>` this module authored, tagged with
// `data-line-break` by `createAtomicElement`. The tag is required (not merely
// "any <br> that is not our filler") because the browser authors `<br>`s of its
// own: Chrome inserts a placeholder `<br>` the moment the editing host becomes
// empty — i.e. on deleting the cell's last character — and Firefox does the same
// with its own untagged break. Reading those back as real LINE_BREAKs made the
// readback structure differ from state, so `handleInput` took its "structure
// drifted" branch and re-rendered the surface from stale state, resurrecting the
// just-deleted character (and, because that re-render rebuilds the host, killing
// the native undo stack so Ctrl+Z died too).
function isLineBreakElement(node: Node): boolean {
  return (
    node.nodeName === "BR" &&
    (node as HTMLElement).dataset?.lineBreak !== undefined
  );
}

// Any `<br>` that is not a value part: our own trailing filler, or a placeholder
// the browser injected. Neither carries a caret slot, so every walk below skips
// them exactly as it skips the filler.
function isIgnoredBreak(node: Node): boolean {
  return node.nodeName === "BR" && !isLineBreakElement(node);
}

function isAtomicElement(node: Node): boolean {
  return isTokenElement(node) || isLineBreakElement(node);
}

/** Reconstruct the value part an atomic DOM element represents. */
function partFromAtomicElement(node: HTMLElement): ValuePart {
  if (isLineBreakElement(node)) {
    return { type: "LINE_BREAK" };
  }
  const kind = node.dataset.token;
  if (kind === "METAFIELD") {
    return {
      type: "METAFIELD",
      namespace: node.dataset.namespace ?? "",
      key: node.dataset.key ?? "",
    };
  }
  return { type: "SHOPIFY_FIELD", field: node.dataset.field ?? "" };
}

/** Build the atomic DOM node (token span or `<br>`) for a non-TEXT part. */
function createAtomicElement(
  part: Exclude<ValuePart, { type: "TEXT" }>,
  tokenClass: string,
): HTMLElement {
  if (part.type === "LINE_BREAK") {
    const br = document.createElement("br");
    br.setAttribute("data-line-break", "");
    return br;
  }
  const span = document.createElement("span");
  span.className = tokenClass;
  span.setAttribute("contenteditable", "false");
  span.dataset.token = part.type;
  if (part.type === "METAFIELD") {
    span.dataset.namespace = part.namespace;
    span.dataset.key = part.key;
  } else {
    span.dataset.field = part.field;
  }
  const labels = tokenLabels(part);
  span.textContent = labels.text;
  span.title = labels.title;
  // role="img" + aria-label makes a screen reader announce the token as one unit
  // (its descriptive name) rather than spelling out the visible "·" glyph.
  span.setAttribute("role", "img");
  span.setAttribute("aria-label", labels.aria);
  return span;
}

/**
 * Render `parts` into `host`, replacing whatever children it currently has.
 *
 * Empty TEXT parts DO render an empty text node on purpose: it is the caret target
 * for an empty run that sits between two atomics (e.g. right after a line break, or
 * between a break and a token). A host-level caret position adjacent to a `<br>` is
 * unreliable — the browser normalises it back into the previous line, so typing on
 * a new line lands on the old one. The empty run only holds the caret while it is
 * *interior* (something follows it); when the empty run is the very last thing
 * (an empty final line), `syncTrailingFiller` adds a trailing `<br>` after it so it
 * stays interior. The browser may drop a truly trailing empty text node, but
 * `readPartsFromHost` re-pads empty runs back in, so the model stays consistent.
 */
export function renderPartsToHost(
  host: HTMLElement,
  parts: ValuePart[],
  tokenClass: string,
): void {
  host.textContent = "";
  for (const part of parts) {
    if (part.type === "TEXT") {
      host.appendChild(document.createTextNode(part.text));
    } else {
      host.appendChild(createAtomicElement(part, tokenClass));
    }
  }
}

/**
 * Read the host back into a `ValuePart[]`. Adjacent text nodes are merged and a
 * TEXT part is emitted before every atomic part and once at the end, so the
 * result is canonical "padded" form (TEXT separates and surrounds atomics) — the
 * same shape the reducer maintains for editor-reachable states. Stray elements
 * the browser may inject (e.g. a wrapper `<div>`) are flattened to their text.
 */
export function readPartsFromHost(host: HTMLElement): ValuePart[] {
  const parts: ValuePart[] = [];
  let text = "";
  const flushText = () => {
    parts.push({ type: "TEXT", text });
    text = "";
  };
  for (const node of Array.from(host.childNodes)) {
    if (isIgnoredBreak(node)) {
      continue;
    } else if (node.nodeType === TEXT_NODE) {
      text += (node as Text).data;
    } else if (isLineBreakElement(node)) {
      flushText();
      parts.push({ type: "LINE_BREAK" });
    } else if (isTokenElement(node)) {
      flushText();
      parts.push(partFromAtomicElement(node));
    } else {
      // Unexpected element (browser-inserted wrapper): keep its text content so
      // typed characters are never silently dropped.
      text += node.textContent ?? "";
    }
  }
  flushText();
  return parts;
}

/**
 * The `valueParts` index of an atomic DOM element (a dynamic-field token or a
 * line break) inside `host`, or `null` if it is not a direct atomic child.
 *
 * Mirrors `readPartsFromHost` exactly: that walk flushes one TEXT part before
 * every atomic, so an atomic's index is the count of parts emitted ahead of it.
 * Used by the click-a-pill-to-edit path (Step 6.3) to resolve which value part a
 * clicked token represents — indices shift on every structural edit, so they are
 * never stashed on the element and are recomputed from the live DOM on demand.
 */
export function partIndexOfElement(
  host: HTMLElement,
  target: Node,
): number | null {
  let index = 0; // index the next emitted part would take
  for (const node of Array.from(host.childNodes)) {
    if (isIgnoredBreak(node) || node.nodeType === TEXT_NODE) {
      // Filler / browser-injected breaks are skipped; a text node accumulates
      // into the current TEXT run and emits no part on its own.
      continue;
    }
    if (isAtomicElement(node)) {
      index += 1; // the TEXT run flushed ahead of this atomic
      if (node === target) {
        return index; // the atomic itself is emitted at this index
      }
      index += 1; // step past the atomic
    }
    // Any other (browser-injected) element is folded into text — no part emitted.
  }
  return null;
}

function samePart(a: ValuePart, b: ValuePart): boolean {
  if (a.type !== b.type) return false;
  if (a.type === "TEXT" && b.type === "TEXT") return a.text === b.text;
  if (a.type === "METAFIELD" && b.type === "METAFIELD") {
    return a.namespace === b.namespace && a.key === b.key;
  }
  if (a.type === "SHOPIFY_FIELD" && b.type === "SHOPIFY_FIELD") {
    return a.field === b.field;
  }
  return true; // LINE_BREAK — type match is enough.
}

/** Deep structural + textual equality (used to skip no-op re-renders). */
export function partsEqual(a: ValuePart[], b: ValuePart[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((part, i) => samePart(part, b[i]));
}

/**
 * Same shape ignoring TEXT *content* — same length, same part types in order, and
 * identical atomic parts. True means the only thing that changed is typed text,
 * so the edit maps cleanly onto SET_VALUE_TEXT; false means the structure drifted
 * (e.g. a rich paste) and the surface must be re-synced from state.
 */
export function sameStructure(a: ValuePart[], b: ValuePart[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((part, i) => {
    const other = b[i];
    if (part.type !== other.type) return false;
    if (part.type === "TEXT") return true;
    return samePart(part, other);
  });
}

function childLinearLength(node: Node): number {
  if (isIgnoredBreak(node)) return 0; // filler / browser break: not in the value.
  if (node.nodeType === TEXT_NODE) return (node as Text).data.length;
  return isAtomicElement(node) ? 1 : (node.textContent ?? "").length;
}

/** Linear index of a DOM point `(container, offset)` within `host`. */
function pointToLinear(
  host: HTMLElement,
  container: Node,
  offset: number,
): number | null {
  if (container === host) {
    let linear = 0;
    for (let i = 0; i < offset; i += 1) {
      linear += childLinearLength(host.childNodes[i]);
    }
    return linear;
  }
  // A caret inside a direct text-node child: sum the children before it.
  if (container.parentNode === host) {
    let linear = 0;
    for (const node of Array.from(host.childNodes)) {
      if (node === container) {
        return linear + (container.nodeType === TEXT_NODE ? offset : 0);
      }
      linear += childLinearLength(node);
    }
  }
  // Defensive: caret reported inside a nested node — climb to the direct child.
  let direct: Node | null = container;
  while (direct && direct.parentNode !== host) {
    direct = direct.parentNode;
  }
  if (direct) {
    let linear = 0;
    for (const node of Array.from(host.childNodes)) {
      if (node === direct) return linear;
      linear += childLinearLength(node);
    }
  }
  return null;
}

/**
 * Current selection as a linear `[from, to]` range within `host` (from ≤ to), or
 * `null` when there is no selection inside this host. A collapsed caret has
 * `from === to`.
 */
export function getSelectionLinearRange(
  host: HTMLElement,
): { from: number; to: number } | null {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (
    !host.contains(range.startContainer) ||
    !host.contains(range.endContainer)
  ) {
    return null;
  }
  const start = pointToLinear(host, range.startContainer, range.startOffset);
  const end = pointToLinear(host, range.endContainer, range.endOffset);
  if (start === null || end === null) return null;
  return start <= end ? { from: start, to: end } : { from: end, to: start };
}

/** Place a collapsed caret at linear index `linear` inside `host`. */
export function setCaretLinear(host: HTMLElement, linear: number): void {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  const place = (container: Node, offset: number) => {
    range.setStart(container, offset);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  };
  let acc = 0;
  const children = host.childNodes;
  for (let i = 0; i < children.length; i += 1) {
    const node = children[i];
    if (isIgnoredBreak(node)) {
      continue;
    }
    if (node.nodeType === TEXT_NODE) {
      const len = (node as Text).data.length;
      if (linear <= acc + len) {
        place(node, linear - acc);
        return;
      }
      acc += len;
    } else {
      if (linear <= acc) {
        place(host, i); // caret just before this atomic element.
        return;
      }
      acc += 1;
    }
  }
  // Past the last addressable slot: sit just BEFORE a trailing non-value `<br>`
  // (our filler on an empty last line, or a browser placeholder in an empty
  // cell), otherwise at the very end of the host.
  const last = children[children.length - 1];
  place(
    host,
    last && isIgnoredBreak(last) ? children.length - 1 : children.length,
  );
}

/** True when the value's last visual line carries no content (caret needs a filler). */
function needsTrailingFiller(parts: ValuePart[]): boolean {
  for (let i = parts.length - 1; i >= 0; i -= 1) {
    const part = parts[i];
    if (part.type === "TEXT") {
      if (part.text === "") continue; // empty trailing run: keep scanning.
      return false; // real text on the last line.
    }
    return part.type === "LINE_BREAK"; // a break → empty line; a token → not empty.
  }
  return false; // no parts at all.
}

/**
 * Add or remove the trailing filler `<br>` so it is present exactly when the
 * value's last line is empty. Called after every reconcile (even when the DOM
 * otherwise matches state) so the filler never lingers to paint a phantom line
 * once the merchant types on the new line.
 */
export function syncTrailingFiller(
  host: HTMLElement,
  parts: ValuePart[],
): void {
  const last = host.lastChild;
  const hasFiller = last != null && isFiller(last);
  const need = needsTrailingFiller(parts);
  if (need && !hasFiller) {
    const br = document.createElement("br");
    br.setAttribute("data-filler", "");
    host.appendChild(br);
  } else if (!need && hasFiller && last) {
    host.removeChild(last);
  }
}

/**
 * Mark the atomic element(s) immediately before/after a collapsed caret as the
 * "caret-on" deletion target (the darker state from 4.1), so the merchant sees
 * what the next Backspace/Delete will remove. Clears the marker when the
 * selection is ranged or not adjacent to an atomic.
 */
export function updateCaretOnState(host: HTMLElement): void {
  for (const marked of Array.from(host.querySelectorAll("[data-caret-on]"))) {
    marked.removeAttribute("data-caret-on");
  }
  const range = getSelectionLinearRange(host);
  if (!range || range.from !== range.to) return;
  const linear = range.from;
  let pos = 0;
  for (const node of Array.from(host.childNodes)) {
    const len = childLinearLength(node);
    if (isAtomicElement(node) && (pos + len === linear || pos === linear)) {
      (node as HTMLElement).setAttribute("data-caret-on", "");
    }
    pos += len;
  }
}
