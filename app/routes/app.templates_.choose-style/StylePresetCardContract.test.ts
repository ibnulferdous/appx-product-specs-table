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

describe("the accent reaches the preview (feature 93 · step 101)", () => {
  it("🔴 resolves through the SAME function the loader uses", () => {
    // The zero-drift claim. `stylePresetValues(preset)` would render a preview from
    // the bundle alone; `seedStylingFromPreset(preset.id, accent?.bundle)` is what
    // `resolveGalleryParams` calls, so the card cannot promise a look the seeded
    // template does not produce. Two merges of the same pair could disagree with
    // nothing failing — no test compares a rendered preview against a real scaffold.
    expect(body).toContain("seedStylingFromPreset(");
    expect(body).not.toContain("stylePresetValues(");
  });

  it("🔴 keeps `accent` in the useMemo dependency array", () => {
    // THE defect of this step, and the one that every other guard here would miss.
    // Omit it and the swatches highlight correctly while the five cards never
    // change — precisely the symptom the feature exists to prevent, with a green
    // suite and a page that looks like it works until you watch it.
    expect(body).toMatch(/\[preset,\s*accent\]/);
  });

  it("builds its href through galleryHref, not by concatenation", () => {
    // A template string would put the wire format in a second place, unreachable
    // by the encoder/decoder round-trip test in `stylePresets.test.ts`.
    expect(body).toContain("galleryHref(");
    expect(body).not.toContain("?style=${");
  });

  it("🔴 passes the preset as `preset` and the accent as `accent`", () => {
    // The one hole the round-trip test cannot reach. It composes `galleryHref` with
    // `resolveGalleryParams`, which proves the two agree about the FORMAT and says
    // nothing about what this call site passes.
    //
    // Step 101 mutated this line to `{ preset: accent?.id, accent: preset.id }` and
    // **all 119 tests passed** — while every merchant would have been sent to
    // `?style=blue&accent=classic`, where neither id resolves in the other's lookup,
    // so every card would create a blank, unstamped, uncoloured template. Total
    // feature failure, green suite.
    //
    // ⚠️ The named-object signature is the primary defence (a transposition can no
    // longer happen by accident) but it is NOT compiler-enforced — both fields are
    // `string | null`, so the swap still typechecks. This is the textual backstop.
    // Brittle by nature, which is acceptable at exactly one call site for a failure
    // this total.
    expect(body).toMatch(
      /galleryHref\(\{\s*preset:\s*preset\.id,\s*accent:\s*accent\?\.id/,
    );
  });

  it("🔴 takes the resolved accent, never an id to look up again", () => {
    // Five cards repeating `findAccent` would be five chances to disagree with the
    // row about what is selected, and it is the gallery that already has the object.
    expect(body).toMatch(/accent:\s*AccentPreset \| null/);
    expect(body).not.toContain("findAccent(");
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

  it("🔴 takes no accent and emits none — doc 93 §D4's only enforcement point", () => {
    // Blank's copy is "start with your theme's own styles — nothing added". An
    // accent would add five colours and make that sentence false, and the merchant
    // could not see it coming, because this is the one card with no preview.
    //
    // ⚠️ Step 99 left `resolveGalleryParams` deliberately TOTAL — it honours a
    // hand-typed `?accent=` with no `?style=` — so the decision lives HERE, in this
    // href, and nowhere else in the codebase. `galleryHref(null, null)` returns this
    // exact string (pinned in `stylePresets.test.ts`); the literal is kept so no
    // accent can be threaded in by an edit to one call site.
    expect(blank).not.toContain("accent");
    expect(blank).not.toContain("galleryHref");
  });
});
