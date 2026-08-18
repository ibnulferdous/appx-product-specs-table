// Feature 93 · step 100 — the roving-tabindex arithmetic.
//
// ⚠️ This is the ONLY real behavioural coverage the swatch row gets, and that is
// why the module exists. `vitest.config.ts` runs in `node` and jsdom is not
// installed, so `AccentSwatchRow` itself can only be checked by reading its source
// (`AccentSwatchRowContract.test.ts`). The arithmetic is the part that can be
// executed, so it is tested exhaustively rather than representatively.
//
// What it cannot see: that the returned index is actually focused. The wiring
// between this function, the refs and `.focus()` is owed to a keyboard-only pass
// in step 101.
import { describe, expect, it } from "vitest";
import { nextRovingIndex } from "./rovingRadioKeys";

// Seven, because that is the swatch row: "Theme" plus six accents.
const COUNT = 7;

describe("nextRovingIndex — the handled keys", () => {
  it("moves forward on ArrowRight and ArrowDown", () => {
    // Both, because a horizontal row still has to answer the vertical keys: the
    // APG maps all four in a radiogroup, and a merchant on a narrow admin sees
    // the row wrapped and will reach for Down.
    expect(nextRovingIndex("ArrowRight", 0, COUNT)).toBe(1);
    expect(nextRovingIndex("ArrowDown", 0, COUNT)).toBe(1);
    expect(nextRovingIndex("ArrowRight", 3, COUNT)).toBe(4);
  });

  it("moves backward on ArrowLeft and ArrowUp", () => {
    expect(nextRovingIndex("ArrowLeft", 4, COUNT)).toBe(3);
    expect(nextRovingIndex("ArrowUp", 4, COUNT)).toBe(3);
  });

  it("jumps to the ends on Home and End", () => {
    expect(nextRovingIndex("Home", 3, COUNT)).toBe(0);
    expect(nextRovingIndex("End", 3, COUNT)).toBe(COUNT - 1);
    // From the end itself, both are no-ops rather than a step past the edge.
    expect(nextRovingIndex("Home", 0, COUNT)).toBe(0);
    expect(nextRovingIndex("End", COUNT - 1, COUNT)).toBe(COUNT - 1);
  });
});

describe("nextRovingIndex — wrapping, which is the reason this module exists", () => {
  it("wraps forward off the end to the first option", () => {
    expect(nextRovingIndex("ArrowRight", COUNT - 1, COUNT)).toBe(0);
  });

  it("🔴 wraps backward off the front to the LAST option, never to -1", () => {
    // The bug the double-modulo prevents. `-1 % 7` is `-1` in JavaScript, so a
    // plain `index % count` returns -1 here — and the caller would then call
    // `.focus()` on `refs[-1]`, which is `undefined`. The key would silently do
    // nothing, at exactly the edge a keyboard user hits first: ArrowLeft on the
    // pre-selected "Theme" swatch, which is option 0 on arrival.
    expect(nextRovingIndex("ArrowLeft", 0, COUNT)).toBe(COUNT - 1);
    expect(nextRovingIndex("ArrowUp", 0, COUNT)).toBe(COUNT - 1);
  });
});

describe("nextRovingIndex — the keys it must NOT handle", () => {
  it("🔴 returns null, not 0, for every unhandled key", () => {
    // `null` is the caller's cue to skip `preventDefault()`. A version returning
    // `0` would make Tab select the first swatch and never leave the group, and
    // Enter would jump the selection instead of activating. Asserted by name
    // because `0` is falsy and would pass a sloppy `if (next)` check at the call
    // site while being catastrophically wrong.
    const unhandled = [
      "Tab",
      "Enter",
      " ", // Space — checks the focused radio, which is the BUTTON's job
      "Escape",
      "PageUp",
      "PageDown",
      "a",
      "ArrowRightt", // a typo'd key name must not fuzzy-match
      "arrowright", // keys are case-sensitive in the DOM
      "",
    ];
    for (const key of unhandled) {
      expect(nextRovingIndex(key, 3, COUNT), key).toBeNull();
    }
  });
});

describe("nextRovingIndex — totality", () => {
  const HANDLED = [
    "ArrowRight",
    "ArrowDown",
    "ArrowLeft",
    "ArrowUp",
    "Home",
    "End",
  ] as const;

  it("handles a single option — every key lands on 0", () => {
    for (const key of HANDLED) {
      expect(nextRovingIndex(key, 0, 1), key).toBe(0);
    }
  });

  it("returns null for an empty list rather than an unusable index", () => {
    // No options means no index to focus. `0` would be a valid-looking number
    // pointing at nothing.
    for (const key of HANDLED) {
      expect(nextRovingIndex(key, 0, 0), key).toBeNull();
      expect(nextRovingIndex(key, -1, 0), key).toBeNull();
    }
  });

  it("accepts current = -1 (nothing selected) and lands on a real index", () => {
    // What a group reports when its value is absent from its options. It is not
    // reachable through `AccentSwatchRow` today — `null` maps to the "Theme"
    // option at index 0, so the value is always found — but a function that
    // returned `NaN` here would be a landmine for the next consumer.
    expect(nextRovingIndex("ArrowRight", -1, COUNT)).toBe(0);
    expect(nextRovingIndex("ArrowLeft", -1, COUNT)).toBe(COUNT - 2);
    expect(nextRovingIndex("Home", -1, COUNT)).toBe(0);
    expect(nextRovingIndex("End", -1, COUNT)).toBe(COUNT - 1);
  });

  it("🔴 never returns a negative, NaN or out-of-range index (swept)", () => {
    // The property, not the examples. Stated over a matrix so it holds for
    // inputs nobody enumerated — including stale indices left behind if an
    // option list ever shrinks, and the out-of-range values a caller could pass
    // by trusting `findIndex` without checking for -1.
    const currents = [-9, -2, -1, 0, 1, 5, 6, 7, 12, 99];
    const counts = [1, 2, 3, 6, 7, 20];

    for (const count of counts) {
      for (const current of currents) {
        for (const key of HANDLED) {
          const next = nextRovingIndex(key, current, count);
          const where = `${key} @ ${current} of ${count}`;

          expect(next, where).not.toBeNull();
          expect(Number.isInteger(next), where).toBe(true);
          expect(next, where).toBeGreaterThanOrEqual(0);
          expect(next, where).toBeLessThan(count);
        }
      }
    }
  });
});
