import { describe, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { saveBarSaveAttrs } from "./editorShared";

// The save bar's primary (Save) button — the spinner regression.
//
// 🔴 THE BUG. `<SaveBar>` shipped as `loading={engine.saving}` on a plain NATIVE
// `<button>`, which is App Bridge's contract for the save bar's children. On React
// 18 a boolean value for an attribute React does not recognize as a boolean is
// DROPPED from the DOM (dev-only console warning, nothing else) — so the attribute
// typechecked, never rendered, and a merchant who hit Save watched the whole editor
// freeze with no indication anything was happening. It was invisible to the suite
// and to the type checker: `@shopify/app-bridge-types` augments
// `ButtonHTMLAttributes` with `loading?: boolean | string`, so the boolean form is
// the one a reader would naturally write, and the four `<s-button loading={flag}>`
// call sites elsewhere in the app genuinely DO work (a dashed tag is a custom
// element; React stringifies booleans onto those) — which made the broken form look
// like the house style.
//
// 🔬 So the guard that matters is not "does the helper return the right shape" but
// "does the attribute SURVIVE React's attribute filter". That is why this file
// renders through `react-dom/server`, which applies the same
// `shouldRemoveAttribute` logic as the client: a serialization assertion is the only
// kind that can fail for the original reason.
//
// ⚠️ Not covered: that the admin's save bar actually paints a spinner when it sees
// `loading="true"`. That is App Bridge's own rendering, cross-origin and outside
// this repo — browser-verified by eye instead ([[testing-strategy]]).

describe("saveBarSaveAttrs", () => {
  it("sets loading while a save is in flight", () => {
    expect(saveBarSaveAttrs({ saving: true, canSave: false })).toEqual({
      loading: "true",
    });
  });

  it("carries NO disabled while saving, so the spinner is not competing with a greyed button", () => {
    // Safe because `handleSave` returns early on a non-idle fetcher, the editor
    // card is `inert` for the duration, and App Bridge disables a loading button
    // itself — three defenses, none of which is this attribute.
    expect(
      saveBarSaveAttrs({ saving: true, canSave: false }),
    ).not.toHaveProperty("disabled");
  });

  it("disables Save when it is blocked for a reason OTHER than saving", () => {
    // The only such reason today: an incomplete assignment scope (features 46/47).
    expect(saveBarSaveAttrs({ saving: false, canSave: false })).toEqual({
      disabled: true,
    });
  });

  it("sets NOTHING when Save is idle and submittable", () => {
    // The absent case must be an absent ATTRIBUTE, never `loading="false"` /
    // `disabled="false"` — a presence-based parser reads either of those as true.
    expect(saveBarSaveAttrs({ saving: false, canSave: true })).toEqual({});
  });
});

describe("the loading attribute survives React's attribute filter", () => {
  // Rendered through `createElement`, not JSX, deliberately: the subject IS the
  // serialization, so the test builds the same native `<button>` the save bar hooks
  // and reads the markup React would hand the browser.
  const markup = (saving: boolean, canSave: boolean) =>
    renderToStaticMarkup(
      createElement(
        "button",
        {
          variant: "primary",
          ...saveBarSaveAttrs({ saving, canSave }),
        },
        "Save",
      ),
    );

  it('REACHES the DOM as loading="true" while saving', () => {
    // The one assertion that fails if anyone rewrites the helper to return a
    // boolean: React drops it and this markup loses the attribute silently.
    expect(markup(true, false)).toContain('loading="true"');
  });

  it("proves the boolean form is what was broken", () => {
    // The original code, rendered by the same instrument. Kept as an executable
    // record of the mechanism — without it "pass a string" is folklore. The props
    // go through an untyped bag because the point is a value that TYPECHECKS at the
    // real call site and still vanishes; React's own dev warning is the only signal
    // it ever gave, so it is captured here rather than printed into the test output.
    const brokenProps: Record<string, unknown> = {
      variant: "primary",
      loading: true,
    };
    const warn = vi.spyOn(console, "error").mockImplementation(() => {});
    let boolForm: string;
    try {
      boolForm = renderToStaticMarkup(
        createElement("button", brokenProps, "Save"),
      );
    } finally {
      warn.mockRestore();
    }
    expect(boolForm).not.toContain("loading");
    // ...while the string form on the identical element does reach the DOM.
    expect(markup(true, false)).toContain("loading");
  });

  it("emits no loading attribute at all when idle", () => {
    expect(markup(false, true)).not.toContain("loading");
    expect(markup(false, true)).not.toContain("disabled");
  });

  it("emits a real boolean disabled attribute when blocked", () => {
    // `disabled` IS in React's boolean table, so the boolean form is correct here
    // and renders bare — the asymmetry with `loading` is the trap.
    expect(markup(false, false)).toContain("disabled");
  });
});

describe("the call site uses the helper", () => {
  // 🔬 Step 101's lesson: a test over a function cannot see the seam between that
  // function and its CALLER. Every assertion above would stay green with
  // `loading={engine.saving}` back in the JSX, so the source is read directly.
  //
  // ⚠️ Block comments are stripped; line comments are NOT (stripping `//` eats
  // URLs). Keep prose in this file's subject free of a literal `loading={`.
  const source = readFileSync(
    fileURLToPath(new URL("./SpecTableEditor.tsx", import.meta.url)),
    "utf8",
  ).replace(/\/\*[\s\S]*?\*\//g, "");

  it("spreads saveBarSaveAttrs onto the Save button", () => {
    expect(source).toContain("saveBarSaveAttrs({");
  });

  it("never passes loading as a JSX expression on the native button", () => {
    expect(source).not.toMatch(/loading=\{/);
  });
});
