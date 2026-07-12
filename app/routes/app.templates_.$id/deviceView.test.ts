import { describe, expect, it } from "vitest";
import { isPreviewView, type ViewId } from "./deviceView";

// Feature 49 · Step 1. The pure predicate that carries the edit-vs-preview
// decision (the "stage renders the preview slot only off-Edit" rule). Node-env
// unit coverage; the actual DOM swap in EditorShell is browser-verified.
describe("isPreviewView", () => {
  it("is false for the editable view", () => {
    expect(isPreviewView("edit")).toBe(false);
  });

  it("is true for each device preview view", () => {
    expect(isPreviewView("desktop")).toBe(true);
    expect(isPreviewView("tablet")).toBe(true);
    expect(isPreviewView("mobile")).toBe(true);
  });

  it("covers every ViewId exactly once (edit off, the three devices on)", () => {
    const all: ViewId[] = ["edit", "desktop", "tablet", "mobile"];
    expect(all.filter(isPreviewView)).toEqual(["desktop", "tablet", "mobile"]);
  });
});
