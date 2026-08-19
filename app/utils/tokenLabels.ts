// Display strings for a dynamic-field token — the visible text, tooltip and
// accessible name used when a token renders as an inert labeled pill.
//
// Its one consumer is the storefront-fidelity inline preview; the editor surface
// no longer renders pills, so this is presentation-only formatting.

import type { ValuePart } from "./rows";

export interface TokenLabels {
  /** Inline text shown in the token, e.g. "Metafield · battery_life". */
  text: string;
  /** Native + assistive tooltip, e.g. "custom · battery_life". */
  title: string;
  /** Screen-reader name, e.g. "Metafield, custom, battery_life". */
  aria: string;
}

type FieldPart = Extract<ValuePart, { type: "METAFIELD" | "SHOPIFY_FIELD" }>;

/** Visible label / tooltip / accessible name for a dynamic-field token. */
export function tokenLabels(part: FieldPart): TokenLabels {
  if (part.type === "METAFIELD") {
    const key = part.key || "—";
    return {
      text: `Metafield · ${key}`,
      title: `${part.namespace || "—"} · ${key}`,
      aria: `Metafield, ${part.namespace || "no namespace"}, ${
        part.key || "no key"
      }`,
    };
  }
  return {
    text: `Field · ${part.field}`,
    title: `Product field · ${part.field}`,
    aria: `Product field, ${part.field}`,
  };
}
