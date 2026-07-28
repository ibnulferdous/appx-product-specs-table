// Feature 88 · step 90 — the card's structural contract.
//
// jsdom cannot render Polaris web components, so the card's JSX is tested by
// reading the real file off disk — the established technique
// (`styleTabContract.test.ts`, `specTableAriaContract.test.ts`). Comments are
// stripped first, for the same reason those files strip them: this file's
// subject matter IS `aria-hidden`, `iframe` and `Link`, and the component's
// header block narrates all three in prose. A guard that counts its own
// documentation passes vacuously.
//
// ⚠️ STRUCTURE, NOT BEHAVIOUR. This cannot see that the card looks right, that
// the scale is legible, or that the link goes somewhere useful. It catches
// exactly the regressions that would be invisible by eye in a gallery: a card
// that stopped being a real control, a preview that started being announced, and
// Blank growing a thumbnail it must not have.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const source = readFileSync(
  fileURLToPath(new URL("./StylePresetCard.tsx", import.meta.url)),
  "utf8",
);

const body = source
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^[ \t]*\/\/.*$/gm, "");

describe("the card is a control, not a decoration", () => {
  it("wraps each card in a real link", () => {
    // A `<div onClick>` with a preview inside is unreachable by keyboard and
    // unnamed to a screen reader. Both card shapes route through one `<Link>`.
    expect(body).toContain("<Link");
    expect(body).toMatch(/\bto=\{/);
  });

  it("has no click handler on a non-interactive element", () => {
    // Not "has no onClick" — an interactive element may legitimately take one.
    // The failure this guards is a handler being the ONLY thing making a card
    // clickable, which is what a `<div onClick>` or `<span onClick>` means.
    expect(body).not.toMatch(/<(div|span|section|article)[^>]*onClick/);
  });

  it("names each card by its label alone, with the description associated", () => {
    // Without the explicit labelling the anchor's accessible name would be its
    // entire text content, so the description would be read twice — once as the
    // name, once as the description.
    expect(body).toContain("aria-labelledby={titleId}");
    expect(body).toContain("aria-describedby={descriptionId}");
  });
});

describe("the action line", () => {
  // Added when the card grew a stated call to action. The card was always a
  // link, but nothing on it SAID so — the only signal was a hover border, which
  // is invisible until the pointer arrives and absent on a touch admin. These
  // guard the two ways that fix can be undone: the line quietly disappearing
  // again, or someone "improving" it into a real button.

  it("states the action on the card, not only on hover", () => {
    expect(body).toContain("styles.action");
    expect(body).toContain("{action}");
  });

  it("renders no interactive element inside the card link", () => {
    // 🔴 The regression this exists for. A `<button>` or a second `<Link>` in
    // here is invalid HTML (interactive content inside an anchor), announces as
    // a broken nested control, and — the reason it would be chosen — replaces
    // the whole-card target with a ~110×36 one, leaving the preview a merchant
    // aims at inert. The affordance must stay TEXT.
    expect(body).not.toMatch(/<button/i);
    // One `<Link` only: the single anchor `CardFrame` opens.
    expect(body.match(/<Link\b/g)).toHaveLength(1);
  });

  it("hides the action line from assistive tech", () => {
    // The anchor already announces as a link named "Modern"; the role IS the
    // action. Exposing this would add six identical strings to the page. Safe
    // only because the accessible name comes from `aria-labelledby`.
    expect(body).toMatch(/className=\{styles\.action\}\s+aria-hidden="true"/);
  });

  it("gives every card shape its own action text", () => {
    // Not one shared string: "Use this style" is false on Blank, which is the
    // ABSENCE of a style. Both call sites must pass their own.
    expect(body).toContain('action="Use this style"');
    const blankCard = body.slice(
      body.indexOf("export function BlankStyleCard"),
    );
    expect(blankCard).toContain('action="Start blank"');
    expect(blankCard).not.toContain("Use this style");
  });
});

describe("the preview is hidden from assistive tech", () => {
  it("marks the preview wrapper aria-hidden and takes the frame out of tab order", () => {
    expect(body).toMatch(/className=\{styles\.preview\}\s+aria-hidden="true"/);
    expect(body).toContain("tabIndex={-1}");
  });

  it("renders the preview through the shared storefront pipeline", () => {
    // A static thumbnail would go stale silently — the worst failure mode a
    // gallery has, because the card would keep promising a look the app no
    // longer produces and nothing would fail.
    expect(body).toContain("renderSpecTablePreviewDocument");
    expect(body).toContain("STYLE_PREVIEW_SAMPLE_ROWS");
  });

  it("keeps the frame sandboxed with no capabilities", () => {
    // Stricter than the editor's `allow-scripts`: these frames are a fixed
    // viewport, so nothing here needs the height shim to run.
    expect(body).toContain('sandbox=""');
    expect(body).not.toContain("allow-same-origin");
  });
});

describe("the Blank variant", () => {
  // Sliced rather than searched globally: a whole-file "there is an iframe
  // somewhere" check would pass on `StylePresetCard`'s frame alone and never
  // look at Blank at all, which is precisely the branch under test.
  const blank = body.slice(body.indexOf("export function BlankStyleCard"));

  it("exists as its own component, not a null branch of the preview card", () => {
    expect(blank).not.toBe("");
    expect(blank).toContain("BlankStyleCard");
  });

  it("renders NO iframe", () => {
    // Blank's output is pixel-identical to Modern's, so a preview here would put
    // two identical thumbnails in one grid — which reads as a rendering bug.
    expect(blank).not.toContain("<iframe");
    expect(blank).not.toContain("renderSpecTablePreviewDocument");
  });

  it("targets creation with NO style param", () => {
    // Blank is the ABSENCE of a preset: no bundle, no `?style=`, `basedOnPreset`
    // left null. A param here would make it a sixth pattern.
    expect(blank).toContain('to="/app/templates/new"');
    expect(blank).not.toContain("?style=");
  });
});
