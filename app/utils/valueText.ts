// Bidirectional codec between the canonical `ValuePart[]` and the value cell's
// `{% … %}` token STRING. Pure; imports only from `rows.ts` (no cycle).
//
// The textarea edits a plain string while `ValuePart[]` stays the canonical
// persisted + delivered + previewed shape, so this converts at the editor
// boundary ONLY — nothing downstream changes.
//
// ## Token grammar (LOCKED — see `context/features/109-…`)
//
//   TEXT           → the literal characters
//   SHOPIFY_FIELD  → `{% field <token> %}`   e.g. `{% field vendor %}`
//   METAFIELD      → `{% mf <ns>.<key> %}`   e.g. `{% mf custom.battery_life %}`
//   LINE_BREAK     → `\n`
//
// Anything starting `{%` that is NOT well-formed — `{% mf %}`, `{% mf a.b.c %}`,
// an unclosed `{%` — is emitted back as LITERAL TEXT, so nothing is silently
// dropped. ⚠️ A literal `{% mf x.y %}` typed as prose is therefore treated as a
// token: an accepted MVP limitation, since there is no escape syntax.

import { normalizeValueParts, type ValuePart } from "./rows";

/** Serialize a `SHOPIFY_FIELD` token, e.g. `vendor` → `{% field vendor %}`. */
export function formatFieldToken(field: string): string {
  return `{% field ${field} %}`;
}

/**
 * Serialize a `METAFIELD` token, e.g. `("custom", "battery_life")` →
 * `{% mf custom.battery_life %}`.
 */
export function formatMetafieldToken(namespace: string, key: string): string {
  return `{% mf ${namespace}.${key} %}`;
}

/**
 * Serialize a `ValuePart[]` to its `{% … %}` token string. TEXT is emitted
 * verbatim, `LINE_BREAK` as `\n`, tokens via the formatters above. No separators
 * are inserted between parts — the merchant's own TEXT carries all spacing (the
 * storefront relies on those edge spaces like `"Up to "`).
 */
export function partsToText(parts: ValuePart[]): string {
  let out = "";
  for (const part of parts) {
    switch (part.type) {
      case "TEXT":
        out += part.text;
        break;
      case "LINE_BREAK":
        out += "\n";
        break;
      case "SHOPIFY_FIELD":
        out += formatFieldToken(part.field);
        break;
      case "METAFIELD":
        out += formatMetafieldToken(part.namespace, part.key);
        break;
    }
  }
  return out;
}

// One well-formed token, with flexible surrounding whitespace. Braces escaped so
// `{` is never read as a quantifier.
//
// 🔴 **Do not narrow `NS_KEY` — it mirrors Shopify's rule (alphanumeric, hyphen,
// underscore).** It was first written `[a-z0-9_]+`, excluding HYPHENS, so every
// standard-taxonomy metafield (`shopify.battery-size`, `power-source`) fell
// through to the literal-TEXT branch and the merchant saw raw `{% mf … %}` source
// printed on the storefront. A `.` stays excluded: it is the ns/key separator, so
// `{% mf a.b.c %}` must stay literal rather than split ambiguously.
const NS_KEY = "[A-Za-z0-9_-]+";
const TOKEN_RE = new RegExp(
  `\\{%\\s*(?:field\\s+([a-z0-9_]+)|mf\\s+(${NS_KEY})\\.(${NS_KEY}))\\s*%\\}`,
  "g",
);

/**
 * Append a run of plain text to `parts`, converting each `\n` into a `LINE_BREAK`
 * part. Empty TEXT runs are skipped (an empty string carries nothing and would
 * only be re-merged away); the `≥1 TEXT` guarantee is restored by
 * `normalizeValueParts` in `textToParts`.
 */
function appendTextSegment(parts: ValuePart[], segment: string): void {
  const lines = segment.split("\n");
  lines.forEach((line, index) => {
    if (index > 0) parts.push({ type: "LINE_BREAK" });
    if (line !== "") parts.push({ type: "TEXT", text: line });
  });
}

/**
 * Parse a token string back into a canonical `ValuePart[]`. Well-formed tokens
 * become `SHOPIFY_FIELD` / `METAFIELD` parts; `\n` becomes `LINE_BREAK`;
 * everything else (including malformed `{% … %}`) is literal TEXT. The result is
 * run through `normalizeValueParts`, so it always has ≥1 TEXT part and no adjacent
 * TEXT — the same canonical shape every reducer action produces.
 */
export function textToParts(raw: string): ValuePart[] {
  const parts: ValuePart[] = [];
  let lastIndex = 0;
  // Fresh lastIndex per call: TOKEN_RE is a module-level /g regex, so reset it.
  TOKEN_RE.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(raw)) !== null) {
    appendTextSegment(parts, raw.slice(lastIndex, match.index));
    if (match[1] !== undefined) {
      parts.push({ type: "SHOPIFY_FIELD", field: match[1] });
    } else if (match[2] !== undefined && match[3] !== undefined) {
      parts.push({ type: "METAFIELD", namespace: match[2], key: match[3] });
    }
    lastIndex = TOKEN_RE.lastIndex;
  }
  appendTextSegment(parts, raw.slice(lastIndex));
  return normalizeValueParts(parts);
}
