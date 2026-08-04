// @vitest-environment jsdom
//
// The ONLY jsdom file in the suite. Everything else runs in the default `node`
// environment (`vitest.config.ts`); this docblock opts this file alone into a DOM.
//
// Scope — deliberately narrow. These cover `valueDom.ts`, which is framework-free
// DOM *structure* glue: build a host, read it back, resolve indices, place and read
// a caret. That is all faithful in jsdom.
//
// 🚫 What does NOT belong here, and why the "browser-verify the editor" rule stands:
//   - Polaris `<s-…>` web components do not render in jsdom (code-standards.md).
//   - Nor does contenteditable *editing behaviour* — the browser injecting a
//     placeholder `<br>` into an emptied host, caret normalisation around a `<br>`,
//     the native undo stack. jsdom will never produce those.
// So the browser's behaviour is encoded here as FIXTURES (a host built to look the
// way Chrome leaves it) and asserted against our classification. That is exactly the
// half that broke on 2026-08-04 — an untagged `<br>` read back as a real LINE_BREAK,
// which made `handleInput` re-render from stale state and resurrect the character the
// merchant had just deleted. Keep the fixtures honest and this file earns its keep.

import { beforeEach, describe, expect, it } from "vitest";
import type { ValuePart } from "./rows";
import {
  getSelectionLinearRange,
  partIndexOfElement,
  partsEqual,
  readPartsFromHost,
  renderPartsToHost,
  sameStructure,
  setCaretLinear,
  syncTrailingFiller,
  tokenLabels,
  updateCaretOnState,
} from "./valueDom";

const TOKEN_CLASS = "token";

const TEXT = (text: string): ValuePart => ({ type: "TEXT", text });
const BREAK: ValuePart = { type: "LINE_BREAK" };
const FIELD = (field: string): ValuePart => ({ type: "SHOPIFY_FIELD", field });
const META = (namespace: string, key: string): ValuePart => ({
  type: "METAFIELD",
  namespace,
  key,
});

let host: HTMLDivElement;

beforeEach(() => {
  document.body.innerHTML = "";
  host = document.createElement("div");
  host.contentEditable = "true";
  document.body.appendChild(host);
});

/** A `<br>` with no `data-line-break` — what Chrome injects into an emptied host. */
function appendPlaceholderBreak(): HTMLBRElement {
  const br = document.createElement("br");
  host.appendChild(br);
  return br;
}

describe("readPartsFromHost — which <br>s count as a LINE_BREAK", () => {
  it("reads a browser placeholder <br> in an emptied host as an EMPTY value", () => {
    // Chrome's exact DOM after Backspace removes the cell's last character.
    appendPlaceholderBreak();
    // 🔴 The regression that shipped: this returned 3 parts, so `sameStructure`
    // failed against state's 1 and the deleted character was written back.
    expect(readPartsFromHost(host)).toEqual([TEXT("")]);
  });

  it("ignores a placeholder <br> left after real text", () => {
    host.appendChild(document.createTextNode("abc"));
    appendPlaceholderBreak();
    expect(readPartsFromHost(host)).toEqual([TEXT("abc")]);
  });

  it("reads a tagged <br data-line-break> as a real LINE_BREAK", () => {
    host.appendChild(document.createTextNode("a"));
    const br = document.createElement("br");
    br.setAttribute("data-line-break", "");
    host.appendChild(br);
    host.appendChild(document.createTextNode("b"));
    expect(readPartsFromHost(host)).toEqual([TEXT("a"), BREAK, TEXT("b")]);
  });

  it("ignores our own trailing filler <br data-filler>", () => {
    renderPartsToHost(host, [TEXT("a"), BREAK, TEXT("")], TOKEN_CLASS);
    syncTrailingFiller(host, [TEXT("a"), BREAK, TEXT("")]);
    expect(host.querySelector("[data-filler]")).not.toBeNull();
    expect(readPartsFromHost(host)).toEqual([TEXT("a"), BREAK, TEXT("")]);
  });

  it("pads TEXT around atomics into canonical form", () => {
    renderPartsToHost(host, [FIELD("vendor")], TOKEN_CLASS);
    expect(readPartsFromHost(host)).toEqual([
      TEXT(""),
      FIELD("vendor"),
      TEXT(""),
    ]);
  });

  it("keeps the text of a browser-injected wrapper element", () => {
    const wrapper = document.createElement("div");
    wrapper.textContent = "pasted";
    host.appendChild(wrapper);
    expect(readPartsFromHost(host)).toEqual([TEXT("pasted")]);
  });
});

describe("render → read round-trip", () => {
  it("survives a mixed TEXT / token / break / metafield value", () => {
    const parts: ValuePart[] = [
      TEXT("Weight: "),
      FIELD("weight"),
      TEXT(""),
      BREAK,
      TEXT("Colour: "),
      META("custom", "colour"),
      TEXT(""),
    ];
    renderPartsToHost(host, parts, TOKEN_CLASS);
    expect(readPartsFromHost(host)).toEqual(parts);
  });

  it("renders tokens as atomic, non-editable elements", () => {
    renderPartsToHost(host, [TEXT(""), FIELD("sku"), TEXT("")], TOKEN_CLASS);
    const token = host.querySelector("[data-token]") as HTMLElement;
    expect(token.getAttribute("contenteditable")).toBe("false");
    expect(token.className).toBe(TOKEN_CLASS);
    expect(token.getAttribute("role")).toBe("img");
  });

  it("replaces prior content instead of appending to it", () => {
    renderPartsToHost(host, [TEXT("first")], TOKEN_CLASS);
    renderPartsToHost(host, [TEXT("second")], TOKEN_CLASS);
    expect(readPartsFromHost(host)).toEqual([TEXT("second")]);
  });
});

describe("partIndexOfElement", () => {
  it("resolves a token's index in canonical (padded) part space", () => {
    const parts: ValuePart[] = [
      TEXT("a"),
      FIELD("vendor"),
      TEXT("b"),
      META("custom", "colour"),
      TEXT(""),
    ];
    renderPartsToHost(host, parts, TOKEN_CLASS);
    const tokens = host.querySelectorAll("[data-token]");
    expect(partIndexOfElement(host, tokens[0])).toBe(1);
    expect(partIndexOfElement(host, tokens[1])).toBe(3);
  });

  it("is not thrown off by a placeholder <br> sitting in the host", () => {
    renderPartsToHost(host, [TEXT("a"), FIELD("sku"), TEXT("")], TOKEN_CLASS);
    appendPlaceholderBreak();
    const token = host.querySelector("[data-token]") as HTMLElement;
    expect(partIndexOfElement(host, token)).toBe(1);
  });

  it("returns null for a node that is not an atomic child", () => {
    renderPartsToHost(host, [TEXT("abc")], TOKEN_CLASS);
    expect(partIndexOfElement(host, host.firstChild!)).toBeNull();
  });
});

describe("syncTrailingFiller", () => {
  const hasFiller = () => host.querySelectorAll("[data-filler]").length;

  it("adds a filler when the last line is empty", () => {
    const parts = [TEXT("a"), BREAK, TEXT("")];
    renderPartsToHost(host, parts, TOKEN_CLASS);
    syncTrailingFiller(host, parts);
    expect(hasFiller()).toBe(1);
  });

  it("removes the filler once the last line has content", () => {
    const empty = [TEXT("a"), BREAK, TEXT("")];
    renderPartsToHost(host, empty, TOKEN_CLASS);
    syncTrailingFiller(host, empty);
    const typed = [TEXT("a"), BREAK, TEXT("b")];
    renderPartsToHost(host, typed, TOKEN_CLASS);
    syncTrailingFiller(host, typed);
    expect(hasFiller()).toBe(0);
  });

  it("adds no filler for a plain single-line value", () => {
    const parts = [TEXT("abc")];
    renderPartsToHost(host, parts, TOKEN_CLASS);
    syncTrailingFiller(host, parts);
    expect(hasFiller()).toBe(0);
  });

  it("adds no filler when the value ends in a token", () => {
    const parts = [TEXT(""), FIELD("sku"), TEXT("")];
    renderPartsToHost(host, parts, TOKEN_CLASS);
    syncTrailingFiller(host, parts);
    expect(hasFiller()).toBe(0);
  });

  it("never adds a second filler on repeat passes", () => {
    const parts = [TEXT("a"), BREAK, TEXT("")];
    renderPartsToHost(host, parts, TOKEN_CLASS);
    syncTrailingFiller(host, parts);
    syncTrailingFiller(host, parts);
    syncTrailingFiller(host, parts);
    expect(hasFiller()).toBe(1);
  });
});

describe("caret: setCaretLinear → getSelectionLinearRange round-trip", () => {
  it("round-trips every slot of a mixed value", () => {
    const parts: ValuePart[] = [
      TEXT("ab"),
      FIELD("weight"),
      TEXT("cd"),
      BREAK,
      TEXT("e"),
    ];
    renderPartsToHost(host, parts, TOKEN_CLASS);
    // Slots: a(0) b(1) [token](2) c(3) d(4) [br](5) e(6) → 7 slots, 8 boundaries.
    for (let linear = 0; linear <= 7; linear += 1) {
      setCaretLinear(host, linear);
      expect(getSelectionLinearRange(host)).toEqual({
        from: linear,
        to: linear,
      });
    }
  });

  it("round-trips in an empty cell holding a browser placeholder <br>", () => {
    // The DOM the cell is left in right after the last character is deleted.
    appendPlaceholderBreak();
    setCaretLinear(host, 0);
    expect(getSelectionLinearRange(host)).toEqual({ from: 0, to: 0 });
  });

  it("does not count our trailing filler as an addressable slot", () => {
    const parts = [TEXT("a"), BREAK, TEXT("")];
    renderPartsToHost(host, parts, TOKEN_CLASS);
    syncTrailingFiller(host, parts);
    // Slots: a(0) [br](1) → the caret on the empty last line is linear 2.
    setCaretLinear(host, 2);
    expect(getSelectionLinearRange(host)).toEqual({ from: 2, to: 2 });
  });

  it("clamps a caret past the end to the last slot", () => {
    renderPartsToHost(host, [TEXT("abc")], TOKEN_CLASS);
    setCaretLinear(host, 99);
    expect(getSelectionLinearRange(host)).toEqual({ from: 3, to: 3 });
  });

  it("returns null when the selection is outside the host", () => {
    renderPartsToHost(host, [TEXT("abc")], TOKEN_CLASS);
    const outside = document.createElement("p");
    outside.textContent = "elsewhere";
    document.body.appendChild(outside);
    const range = document.createRange();
    range.setStart(outside.firstChild!, 1);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(getSelectionLinearRange(host)).toBeNull();
  });

  it("reports a ranged selection as from < to", () => {
    renderPartsToHost(host, [TEXT("abcdef")], TOKEN_CLASS);
    const range = document.createRange();
    range.setStart(host.firstChild!, 1);
    range.setEnd(host.firstChild!, 4);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    expect(getSelectionLinearRange(host)).toEqual({ from: 1, to: 4 });
  });
});

describe("updateCaretOnState", () => {
  it("marks the token the next Backspace would remove", () => {
    renderPartsToHost(host, [TEXT("ab"), FIELD("sku"), TEXT("")], TOKEN_CLASS);
    setCaretLinear(host, 3); // just after the token
    updateCaretOnState(host);
    expect(host.querySelectorAll("[data-caret-on]").length).toBe(1);
    expect(
      (host.querySelector("[data-caret-on]") as HTMLElement).dataset.token,
    ).toBe("SHOPIFY_FIELD");
  });

  it("clears the marker when the caret moves away from any atomic", () => {
    renderPartsToHost(
      host,
      [TEXT("ab"), FIELD("sku"), TEXT("cd")],
      TOKEN_CLASS,
    );
    setCaretLinear(host, 3);
    updateCaretOnState(host);
    expect(host.querySelectorAll("[data-caret-on]").length).toBe(1);
    setCaretLinear(host, 0);
    updateCaretOnState(host);
    expect(host.querySelectorAll("[data-caret-on]").length).toBe(0);
  });

  it("marks nothing while the selection is ranged", () => {
    renderPartsToHost(
      host,
      [TEXT("ab"), FIELD("sku"), TEXT("cd")],
      TOKEN_CLASS,
    );
    const range = document.createRange();
    range.setStart(host.firstChild!, 0);
    range.setEnd(host.lastChild!, 2);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    updateCaretOnState(host);
    expect(host.querySelectorAll("[data-caret-on]").length).toBe(0);
  });
});

describe("partsEqual / sameStructure — the drift gate", () => {
  it("partsEqual is false when only the text differs", () => {
    expect(partsEqual([TEXT("a")], [TEXT("b")])).toBe(false);
  });

  it("sameStructure is true when only the text differs (pure typing)", () => {
    expect(sameStructure([TEXT("a")], [TEXT("b")])).toBe(true);
  });

  it("sameStructure is false when a part count differs (real drift)", () => {
    // The shape the placeholder-<br> bug produced. It SHOULD be drift when it is
    // genuinely there — the fix is upstream, in never reading it as a LINE_BREAK.
    expect(sameStructure([TEXT(""), BREAK, TEXT("")], [TEXT("a")])).toBe(false);
  });

  it("sameStructure is false when an atomic's identity changes", () => {
    expect(
      sameStructure(
        [TEXT(""), FIELD("sku"), TEXT("")],
        [TEXT(""), FIELD("vendor"), TEXT("")],
      ),
    ).toBe(false);
  });
});

describe("tokenLabels", () => {
  it("labels a native product field", () => {
    expect(tokenLabels({ type: "SHOPIFY_FIELD", field: "weight" })).toEqual({
      text: "Field · weight",
      title: "Product field · weight",
      aria: "Product field, weight",
    });
  });

  it("labels a metafield by namespace and key", () => {
    expect(
      tokenLabels({ type: "METAFIELD", namespace: "custom", key: "colour" }),
    ).toEqual({
      text: "Metafield · colour",
      title: "custom · colour",
      aria: "Metafield, custom, colour",
    });
  });

  it("falls back to a dash when a metafield is half-filled", () => {
    const labels = tokenLabels({ type: "METAFIELD", namespace: "", key: "" });
    expect(labels.text).toBe("Metafield · —");
    expect(labels.title).toBe("— · —");
    expect(labels.aria).toBe("Metafield, no namespace, no key");
  });
});
