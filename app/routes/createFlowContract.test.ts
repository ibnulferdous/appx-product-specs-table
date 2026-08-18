// Feature 88 · step 92 — the create flow's wiring contract.
//
// Two route files, one claim: **Create leads to the gallery, and the gallery's
// `?style=` is honoured by the editor — and ONLY on the /new scaffold.** Neither
// half is testable by calling anything. `app.templates.tsx` renders Polaris web
// components (jsdom cannot mount them) and `app.templates_.$id/route.tsx`'s
// loader needs `authenticate.admin`, so both are read off disk with their
// comments stripped, the established technique (`styleTabContract`,
// `galleryRouteContract`). Comments MUST be stripped: both files narrate these
// exact strings in prose, and a guard that counts its own documentation passes
// vacuously.
//
// ⚠️ This file deliberately spans two directories. The claim is a WIRE — one end
// in the list route, the other in the editor route — and a guard living in
// either directory could be deleted with its route while the other kept
// asserting a connection that no longer exists.
//
// What it cannot see: whether the seeded scaffold actually LOOKS like the card,
// and whether the stamp survives to Postgres. Those are live checks 1 and 2.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (file: string) =>
  readFileSync(fileURLToPath(new URL(file, import.meta.url)), "utf8")
    .replace(/\{\s*\/\*[\s\S]*?\*\/\s*\}/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^[ \t]*\/\/.*$/gm, "");

const listRoute = read("./app.templates.tsx");
const editorRoute = read("./app.templates_.$id/route.tsx");

const countOf = (haystack: string, needle: string) =>
  haystack.split(needle).length - 1;

describe("both Create entry points lead to the style gallery", () => {
  it("links to /app/templates/choose-style exactly twice", () => {
    // The list page has two ways to start a template — the empty state's button
    // and the page's primary action — and a half-done repoint is invisible on a
    // shop that has templates, because the empty state never renders there.
    expect(countOf(listRoute, 'href="/app/templates/choose-style"')).toBe(2);
  });

  it("🔴 has NO link straight to /app/templates/new", () => {
    // The negative is the guard that actually rots. The gallery is UNSKIPPABLE
    // by merchant decision (doc 88), and "unskippable" is not a property of the
    // gallery — it is the property that NOTHING links past it. A third Create
    // affordance added later that pointed at /new would leave every template it
    // created stamped `null`, which now means "the merchant chose Blank" and
    // would be a lie.
    //
    // /new itself stays reachable by typed URL, bookmark and back button, and
    // is deliberately NOT redirected (D7) — this asserts only that the app
    // never sends a merchant there to create.
    expect(listRoute).not.toContain("/app/templates/new");
  });
});

describe("the ?style= seed is scoped to the /new scaffold", () => {
  const resolverAt = editorRoute.indexOf("resolveGalleryParams(");
  const branchAt = editorRoute.indexOf('params.id === "new"');
  const lookupAt = editorRoute.indexOf("getTemplateByIdForShop(");

  it("reads the param exactly once", () => {
    // Two reads would be two chances to disagree about what the URL said, and
    // the second one would not be inside the branch guarded below.
    expect(countOf(editorRoute, "resolveGalleryParams(")).toBe(1);
  });

  it("🔴 resolves INSIDE the new branch, before any template lookup", () => {
    // D3, and the one way this step could corrupt a SAVED template: applied
    // after the branch, `/app/templates/<real-id>?style=classic` would hand the
    // editor styling values that are not in Postgres, and the merchant's next
    // Save — of a rename, of anything — would write them plus a stamp the
    // template never earned. Silent, and indistinguishable from a real restyle.
    //
    // ⚠️ Each index is asserted found FIRST. An ordering guard written on
    // `indexOf` alone is vacuous the moment the thing it orders is deleted:
    // "-1 < lookupAt" is trivially true, so a file with no resolver call at all
    // would satisfy the ordering. Step 91's mutation caught exactly this shape
    // of hole in a neighbouring guard; this is that lesson applied up front.
    expect(resolverAt).toBeGreaterThanOrEqual(0);
    expect(branchAt).toBeGreaterThanOrEqual(0);
    expect(lookupAt).toBeGreaterThanOrEqual(0);

    expect(resolverAt).toBeGreaterThan(branchAt);
    expect(resolverAt).toBeLessThan(lookupAt);
  });

  it("returns the resolved pair, not the old literals", () => {
    // Makes the ordering guard above mean "the seed is applied here" rather
    // than "a function is called here". Before this step the /new branch
    // returned `styling: DEFAULT_STYLING_VALUES` and `basedOnPreset: null` as
    // literals; both now come out of the resolver.
    expect(editorRoute).toContain(
      "const { styling, basedOnPreset } = resolveGalleryParams(",
    );
    expect(editorRoute).not.toContain("styling: DEFAULT_STYLING_VALUES");
    expect(editorRoute).not.toContain("basedOnPreset: null");
  });
});
