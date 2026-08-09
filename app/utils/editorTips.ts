// Pure builder for the editor tips footer — one source of truth for every
// discoverability message the editor surfaces.
//
// The only platform-dependent entry is the keyboard tip (⌘ vs. Ctrl); the browser
// read behind it is isolated in `platform.ts`.

export interface EditorTip {
  /** Stable React key + test anchor. */
  id: string;
  /** Plain-text tip with inline unicode glyphs (↑ ↓ ⠿ ✕ ⌘). */
  text: string;
}

// The keyboard-nav tip leads — it is the reason this footer ships.
export function buildEditorTips(isMac: boolean): EditorTip[] {
  const mod = isMac ? "⌘" : "Ctrl";
  return [
    {
      id: "keyboard-nav",
      text: `Move between cells with ${mod} + ↑ ↓. Tab / Shift+Tab move across Label and Value.`,
    },
    {
      id: "device-views",
      text: "Switch Edit → Desktop / Mobile with the toggle — Edit is editable; the device views are view-only previews.",
    },
    {
      id: "gutter",
      text: "Each row's gutter pairs a ⠿ drag handle with a ✕ delete; tick the checkbox to select rows for a bulk delete.",
    },
    {
      id: "insert-field",
      text: "Insert field (toolbar) opens a modal — pick a field, then Insert; Cancel / Esc / click-outside inserts nothing.",
    },
    {
      id: "smart-pills",
      text: "Dynamic-field tokens are smart pills — click one to edit it, Backspace / Delete to remove it (no ✕).",
    },
    {
      id: "add-row",
      text: "Add row inserts below the active row; the bottom + Add row appends at the end.",
    },
    {
      id: "paste",
      text: "Paste a table from Google Sheets or Excel to bulk-create rows — first column → Label, the rest → Value.",
    },
  ];
}
