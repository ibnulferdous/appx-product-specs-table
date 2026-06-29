import { describe, it, expect } from "vitest";
import { buildEditorTips } from "./editorTips";

// The pure tip-list builder is the testable core of the editor tips footer
// (feature 32). The DOM read (`isMacPlatform`) is browser-verified glue; here we
// pin the contract the footer relies on: a stable ordered list whose ONLY
// platform-dependent text is the keyboard tip's ⌘/Ctrl glyph.

describe("buildEditorTips — list shape", () => {
  it("returns a non-empty list with the keyboard-nav tip first", () => {
    const tips = buildEditorTips(false);
    expect(tips.length).toBeGreaterThan(0);
    expect(tips[0].id).toBe("keyboard-nav");
  });

  it("every tip has a non-empty id and text", () => {
    for (const tip of buildEditorTips(true)) {
      expect(tip.id).toBeTruthy();
      expect(tip.text).toBeTruthy();
    }
  });

  it("ids are unique", () => {
    const ids = buildEditorTips(false).map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("the order of ids is stable across platforms", () => {
    const mac = buildEditorTips(true).map((t) => t.id);
    const other = buildEditorTips(false).map((t) => t.id);
    expect(mac).toEqual(other);
  });
});

describe("buildEditorTips — platform glyph", () => {
  it("the keyboard tip shows ⌘ on Mac and the arrow glyphs", () => {
    const kbd = buildEditorTips(true)[0];
    expect(kbd.text).toContain("⌘");
    expect(kbd.text).not.toContain("Ctrl");
    expect(kbd.text).toContain("↑");
    expect(kbd.text).toContain("↓");
  });

  it("the keyboard tip shows Ctrl off Mac and the arrow glyphs", () => {
    const kbd = buildEditorTips(false)[0];
    expect(kbd.text).toContain("Ctrl");
    expect(kbd.text).not.toContain("⌘");
    expect(kbd.text).toContain("↑");
    expect(kbd.text).toContain("↓");
  });

  it("the platform flag changes ONLY the keyboard tip's text", () => {
    const mac = buildEditorTips(true);
    const other = buildEditorTips(false);
    // Every entry after the keyboard tip is byte-identical across platforms.
    for (let i = 1; i < mac.length; i++) {
      expect(mac[i]).toEqual(other[i]);
    }
    // The keyboard tip differs only by glyph.
    expect(mac[0].id).toBe(other[0].id);
    expect(mac[0].text).not.toBe(other[0].text);
  });
});

describe("buildEditorTips — purity", () => {
  it("returns a fresh array each call (no shared mutable state)", () => {
    const a = buildEditorTips(true);
    const b = buildEditorTips(true);
    expect(a).not.toBe(b);
    expect(a[0]).not.toBe(b[0]);
    a[0].text = "mutated";
    expect(b[0].text).not.toBe("mutated");
  });
});
