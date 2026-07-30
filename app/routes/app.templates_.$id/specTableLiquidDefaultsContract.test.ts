// The MARKUP-knob defaults, held against the one file the rest of the suite
// cannot see.
//
// `sectionsCollapsible` and `sectionsInitialState` are the only two knobs
// `spec_table.liquid` reads from the raw `styling` field instead of the
// precomputed `styling_css` — they decide `<details>` and its `open`
// attribute, which is markup, not CSS (feature 57 Step 9a). That split is
// right, and it has one cost: the storefront has to know the DEFAULT for a
// knob a template usually stores nothing for, so the default literal exists
// twice — once in `tableStyling.ts`, once as a `| default:` filter in Liquid.
//
// Liquid cannot import TypeScript, so a source-text test is the only place the
// two can be held together. Everything else about the collapsible shape is
// covered by the hand-mirrored TS renderer in `specTablePreviewHtml.test.ts`;
// this file covers only what that mirror cannot reach — whether the mirror and
// the original agree about the value nobody stored.
//
// ⚠️ The failure this prevents is SILENT and merchant-facing: with the two
// literals out of step, the admin preview and the real storefront disagree
// about which sections start open, on exactly the templates that store no
// value — i.e. most of them. Nothing crashes, nothing logs, and the merchant
// finds out from a shopper. It became a live risk on 2026-07-30, when the
// default moved ALL_OPEN → FIRST_OPEN and both literals had to change together.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_SECTIONS_INITIAL_STATE,
  DEFAULT_STYLING_VALUES,
  SECTIONS_INITIAL_STATES,
} from "../../utils/tableStyling";

// Comments stripped FIRST, and it is load-bearing here rather than tidy: the
// block this file is about carries prose naming both ALL_OPEN and FIRST_OPEN,
// so a keyword scan over the raw file would pass on the documentation while the
// code said something else. (Same rule, different reason, as the strip in
// `specTableAriaContract.test.ts`.)
const liquid = readFileSync(
  fileURLToPath(
    new URL(
      "../../../extensions/product-specs-table/blocks/spec_table.liquid",
      import.meta.url,
    ),
  ),
  "utf8",
).replace(/\{%-?\s*comment\s*-?%\}[\s\S]*?\{%-?\s*endcomment\s*-?%\}/g, "");

describe("spec_table.liquid — the duplicated markup defaults", () => {
  it("defaults the initial state to the domain's own default", () => {
    const match = liquid.match(
      /styling\.sectionsInitialState\s*\|\s*default:\s*"([A-Z_]+)"/,
    );
    // Not `match?.[1]` compared straight to the constant: if the assign line is
    // ever restructured the regex returns null, and a null-vs-string mismatch
    // reads as "the default is wrong" when it is really "the guard stopped
    // looking". Fail on the shape first, with its own message.
    expect(
      match,
      "spec_table.liquid no longer assigns initial_state via `| default:` — this guard has stopped watching anything",
    ).not.toBeNull();
    expect(match?.[1]).toBe(DEFAULT_SECTIONS_INITIAL_STATE);
  });

  it("keeps that constant as the domain default the admin renders from", () => {
    // The other end of the same coupling. `DEFAULT_SECTIONS_INITIAL_STATE` is
    // only worth pinning Liquid against while it is what the app itself falls
    // back to; decoupling the two would leave this file green and pointless.
    expect(DEFAULT_STYLING_VALUES.sectionsInitialState).toBe(
      DEFAULT_SECTIONS_INITIAL_STATE,
    );
  });

  it("names every initial state except the implicit else", () => {
    // The storefront's open matrix is a positive `if`/`elsif` chain, so a
    // keyword it does not name renders as "nothing open" by falling through.
    // That is correct for exactly one member and a silent bug for any other, so
    // the unnamed SET is pinned rather than counted: append a fourth state to
    // `SECTIONS_INITIAL_STATES` and this fails until Liquid handles it.
    const unnamed = SECTIONS_INITIAL_STATES.filter(
      (state) => !liquid.includes(`"${state}"`),
    );
    expect(unnamed).toEqual(["ALL_CLOSED"]);
  });
});
