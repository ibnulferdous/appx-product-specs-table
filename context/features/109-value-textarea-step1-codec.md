# Value textarea — Step 1: pure string↔parts codec + grammar lock

**Status: ✅ Shipped 2026-08-07.** Part 1 of 6 in the "value cell → textarea"
migration (features 109–114). Pure, additive module + tests — **zero behavior
change**, nothing wired into the UI yet. `valueText.ts` + `valueText.test.ts` (19
tests) landed; full gate green (typecheck, lint, 1462 tests, build). Verification
notes at the bottom.

## Why this migration (the whole arc, stated once)

The value cell is one `contenteditable` surface with a hand-built linear-caret
model ([ValueCell.tsx](app/routes/app.templates_.$id/ValueCell.tsx),
[valueParts.ts](app/utils/valueParts.ts), [valueDom.ts](app/utils/valueDom.ts)).
`contenteditable` is the source of a class of real bugs — the one that forced
this decision is **broken Ctrl+Z**: when the surface empties, the browser injects
a placeholder `<br>`, `handleInput` sees "structure drifted" and re-renders from
state, and that re-render's `host.textContent = ""` **wipes the browser's native
undo stack for good** (documented in the "three hard-won rules" comment in
`valueDom.ts`). Undo is unrecoverable by design of that path.

A native `<textarea>` has a fully isolated, robust undo/redo stack our code never
touches, plus native selection, multiline, IME, and first-class accessibility.
The merchant loses the colored inline pill and click-to-edit-pill; dynamic fields
become plain **text tokens** like `{% mf custom.battery_life %}`. That trade was
explicitly approved.

## The load-bearing constraint (do not violate)

**`ValuePart[]` stays the canonical persisted + delivered + previewed shape.** The
textarea is *only* an editing surface. We introduce a bidirectional codec at the
editor boundary and change nothing downstream:

- [rowsSerialize.ts](app/utils/rowsSerialize.ts) `parseValuePart` — **unchanged**
  (still the save-boundary validator).
- `extensions/product-specs-table/snippets/spec-table-value.liquid` — **unchanged**
  (still loops over `row.valueParts`, switching on `part.type`).
- [specTablePreviewHtml.ts](app/routes/app.templates_.$id/specTablePreviewHtml.ts)
  — **unchanged** (the live preview keeps showing *resolved* values, so it stays
  the WYSIWYG surface while the textarea shows raw tokens).
- **No data migration** — the stored `valueParts` shape is untouched, so every
  existing template loads as-is.

Do **not** move token parsing into Liquid: Liquid has no regex and weak string
splitting, and the storefront already chunks around a 50-iteration `for` cap.
Parsing per-row per-product on the storefront would be fragile and slow. The clean
structured array delivered today is an asset — keep it.

## Goal in one sentence

Add one framework-free module `app/utils/valueText.ts` that losslessly converts
between a `ValuePart[]` and its `{% … %}` text representation, fully unit-tested,
with **nothing wired into the editor yet**.

## Grammar (LOCKED here — every later step depends on it)

| Part | Text form | Notes |
|------|-----------|-------|
| `TEXT` | verbatim | the merchant's literal characters |
| `SHOPIFY_FIELD` | `{% field <token> %}` | `<token>` is the locked `field` string from [shopifyFields.ts](app/utils/shopifyFields.ts) (`vendor`, `price`, `sku`, …) |
| `METAFIELD` | `{% mf <namespace>.<key> %}` | e.g. `{% mf custom.battery_life %}` |
| `LINE_BREAK` | `\n` | native textarea newline |

- **Parse regex:** match `{%` + optional space + (`field`\|`mf`) + space +
  argument + optional space + `%}`. Argument for `field` is a single snake_case
  token; for `mf` it is `namespace.key` split on the **first** `.` (Shopify
  metafield namespaces/keys are `[a-z0-9_]+`, so a single `.` separator is
  unambiguous).
- **Malformed / unknown token → literal `TEXT`.** `{% mf %}` (no arg),
  `{% mf a.b.c %}`-style junk after normalization, `{% field %}`, an unclosed
  `{%`, or any unrecognized keyword is emitted back as the literal characters the
  merchant typed. Nothing is silently dropped in the editor. (This mirrors the
  storefront's "unresolvable token → renders empty" philosophy: an invalid
  reference simply doesn't resolve, but here the merchant still sees their text so
  they can fix it.)
- **Validation of `field` tokens:** `textToParts` accepts ANY snake_case token as
  a `SHOPIFY_FIELD` (it does not cross-check `NATIVE_SHOPIFY_FIELDS`). Rationale:
  the codec is a syntactic layer; an unknown field token resolves to empty on the
  storefront exactly like a deleted native field, and the picker is still the only
  way to *insert* one. Keeping the codec from importing the field catalog avoids a
  second source of truth. (Revisit only if merchants typo field tokens in
  practice.)
- **No `TEXT` may itself contain a literal `{% … %}` that parses as a token** —
  otherwise a round-trip would reinterpret merchant prose as a token. **Escape
  decision (locked):** we do **not** add a backslash escape in this MVP. A literal
  `{%` in a spec *value* is vanishingly rare, and adding an escape grammar now
  costs more than it saves. If a merchant does type `{% mf x.y %}` as literal
  prose, it will be treated as a token — documented as a known limitation, not a
  bug. (An escape hatch stays an open door for a later step if real usage needs
  it.)

## Module surface (`app/utils/valueText.ts`)

```ts
// Bidirectional codec between the canonical ValuePart[] and the textarea's
// {% … %} token string. Framework-free and pure, like rows.ts / valueParts.ts.
// Imports ONLY the ValuePart type from rows.ts (one direction — no cycle).

export function formatFieldToken(field: string): string;       // "vendor" → "{% field vendor %}"
export function formatMetafieldToken(ns: string, key: string): string; // → "{% mf custom.battery_life %}"

export function partsToText(parts: ValuePart[]): string;        // parts → token string
export function textToParts(raw: string): ValuePart[];          // token string → normalizeValueParts(parts)
```

- `partsToText`: TEXT verbatim, `LINE_BREAK` → `\n`, tokens via the formatters. No
  separators added between parts (the merchant's own text carries the spacing).
- `textToParts`: scan `raw`, splitting out tokens and `\n`; everything else is
  TEXT; run `normalizeValueParts` so adjacent TEXT merges and the ≥1-TEXT
  guarantee holds.
- The two token formatters are exported because Step 111's modal-insert path
  needs to build a token string to splice at the caret.

## Round-trip invariants (the heart of the test file)

`app/utils/valueText.test.ts`:

1. **text → parts → text is identity for canonical strings (primary contract):**
   `partsToText(textToParts(s)) === s` for canonical inputs (well-formed tokens,
   no redundant whitespace inside `{% %}`). The string is the source of truth for
   the textarea surface, so this is the load-bearing invariant.
2. **parts → text → parts is idempotent + content-preserving:** the string form is
   lossy **only** w.r.t. empty TEXT slots (an empty string encodes nothing, and
   the storefront renders empty TEXT as nothing anyway). So `textToParts(partsToText(p))`
   canonicalizes empty TEXT away while preserving every token, `LINE_BREAK`, and
   non-empty TEXT run, and re-parsing its own output is a fixpoint. (It does **not**
   deep-equal `normalizeValueParts(p)` when `p` carries empty TEXT slots — that was
   the plan's original wording; corrected here after implementation.)
3. **Whitespace fidelity:** `"Up to {% mf custom.hours %} hours"` preserves the
   `"Up to "` and `" hours"` TEXT edges exactly (leading/trailing spaces are
   author-meaningful — the storefront relies on them).
4. **Malformed tokens stay literal:** `"{% mf %}"`, `"{% field %}"`, `"a {% b"` →
   a single TEXT part with those exact characters.
5. **`\n` ↔ `LINE_BREAK`** both directions, including a value that is only
   `TEXT + LINE_BREAK + TEXT`.
6. **Empty string** → `[{ type: "TEXT", text: "" }]` (the always-editable seed).

## Files

- **New:** `app/utils/valueText.ts` (framework-free; imports `ValuePart` type +
  `normalizeValueParts` from [rows.ts](app/utils/rows.ts)).
- **New:** `app/utils/valueText.test.ts`.
- **Touched:** none. No UI, no reducer, no serialize change.

## Boundaries (not this step)

- No `<textarea>`, no `ValueCell` change — Step 111.
- No reducer action — Step 110.
- No deletion of `valueParts.ts` / `valueDom.ts` or any reducer action — Step 113.

## Done when

1. `valueText.ts` exports the four functions above and is pure / framework-free
   (no React, no DOM).
2. `valueText.test.ts` covers all six invariant groups and passes.
3. No import cycle (`valueText` → `rows` only).
4. `npm run typecheck`, `npm run lint`, `npm run test:run`, `npm run build` all
   pass. The editor is byte-for-byte unchanged at runtime (nothing imports the new
   module yet).

## Verification (2026-08-07) — ✅ all met

- `app/utils/valueText.ts` + `app/utils/valueText.test.ts` created. Codec exports
  `formatFieldToken`, `formatMetafieldToken`, `partsToText`, `textToParts`; pure /
  framework-free; imports only `ValuePart` + `normalizeValueParts` from `rows.ts`
  (no cycle).
- `valueText.test.ts`: **19 tests pass**, covering the formatters, `partsToText`,
  `textToParts` (incl. flexible in-brace whitespace), malformed-token→literal,
  `\n`↔`LINE_BREAK`, and the round-trip invariants above.
- Full gate green: **typecheck** ✓, **lint** ✓, **test:run** 1462/1462 ✓,
  **build** ✓. No existing file imports the module yet → runtime unchanged.
- One test expectation was corrected during the run: a string that already
  contains a TEXT part before a trailing token gets **no** appended trailing
  `TEXT ""` (normalize only seeds one when the array has no TEXT at all).
