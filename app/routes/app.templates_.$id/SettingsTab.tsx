import { useState } from "react";
import { useAppBridge } from "@shopify/app-bridge-react";
import { AdminAppLink } from "../../components/AdminAppLink";
import { VISIBLE_TEMPLATE_STATUS_OPTIONS } from "../../utils/templateStatus";
import {
  SCOPE_NONE,
  VISIBLE_SCOPE_OPTIONS,
  isScopeSetComplete,
} from "../../utils/assignmentScope";
import type { ExcludeSeed, RowEngine, ScopeValueSeed } from "./useRowEngine";

// The editor's Settings-tab sidebar (feature 36 status control + feature 44 scope picker).
// Presentational — reads the live status/scope off the engine; both ride the meta-JSON dirty
// snapshot, so changing either opens the SaveBar. Renders in EditorShell's `settingsPanel` slot,
// INSIDE the editor's inert freeze wrapper, so it's frozen during a save — no separate `saving` guard.
//
// Division of labour with the header: the page-header <s-badge> shows the PERSISTED loader status;
// these controls show the PENDING edit. They converge after Save + revalidation.

// Read the `value` off a Polaris web-component change/input event (custom elements, so
// `currentTarget.value` isn't in the DOM typings).
function readValue(event: Event): string {
  return (event.currentTarget as unknown as { value: string }).value;
}

// The subset of an App Bridge resource-picker result we read. A product carries `images[]`, a
// collection a single `image`; each image field has historically been `originalSrc` (newer builds
// also expose `url`), so we read both defensively.
type PickedImage = { originalSrc?: string; url?: string };
type PickedResource = {
  id: string;
  title?: string;
  images?: PickedImage[];
  image?: PickedImage | null;
};

// Pull a thumbnail URL off a picked product/collection, tolerating either field
// name and a resource with no image (→ null, the chip renders a placeholder).
function pickedImageUrl(resource: PickedResource): string | null {
  const productImage = resource.images?.[0];
  const collectionImage = resource.image ?? undefined;
  return (
    productImage?.originalSrc ??
    productImage?.url ??
    collectionImage?.originalSrc ??
    collectionImage?.url ??
    null
  );
}

// A Kaching-style resource chip: thumbnail + title + a critical-tone trash button on one row
// (feature 47). Shared by the INCLUDE scope list and the EXCLUDE list so both read identically. A
// 3-column `auto 1fr auto` grid so the row NEVER wraps in the narrow (~300px) sidebar — thumbnail and
// trash keep their intrinsic width, the title column (1fr) absorbs the rest. `background="base"` + a
// border make it read as a distinct tile. `s-thumbnail` renders its own placeholder when `src` is empty.
function ResourceChipCard({
  image,
  label,
  onRemove,
  removeLabel,
}: {
  image: string | null;
  label: string;
  onRemove: () => void;
  removeLabel: string;
}) {
  return (
    <s-box
      background="base"
      border="base"
      borderRadius="base"
      padding="small-200"
    >
      <s-grid
        gridTemplateColumns="auto 1fr auto"
        gap="small-200"
        alignItems="center"
      >
        <s-thumbnail src={image ?? ""} alt="" size="small"></s-thumbnail>
        <s-text>{label}</s-text>
        <s-button
          variant="tertiary"
          tone="critical"
          icon="delete"
          accessibilityLabel={removeLabel}
          onClick={onRemove}
        ></s-button>
      </s-grid>
    </s-box>
  );
}

// Above this many selected resources the chip list collapses behind a "View all selected (N)" toggle,
// so a large assignment (e.g. 100 products) doesn't stack 100 cards down the narrow sidebar. At or
// below it, every chip renders inline.
const MAX_INLINE_CHIPS = 4;

type ChipItem = {
  key: string;
  image: string | null;
  label: string;
  removeLabel: string;
  onRemove: () => void;
};

// A chip list that collapses when long. ≤ MAX_INLINE_CHIPS → all inline. More → hidden behind a
// "View all selected (N)" toggle; expanding reveals the full list inside a height-capped scroller
// ("Show less" re-collapses). The trailing Add button is a sibling in the caller, so it stays visible.
// Returns null when empty (the caller renders the "Select …" button on its own).
function CollapsibleChipList({ items }: { items: ChipItem[] }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = items.length > MAX_INLINE_CHIPS;
  if (items.length === 0) return null;

  const chips = (
    <s-stack direction="block" gap="small-200">
      {items.map((item) => (
        <ResourceChipCard
          key={item.key}
          image={item.image}
          label={item.label}
          onRemove={item.onRemove}
          removeLabel={item.removeLabel}
        />
      ))}
    </s-stack>
  );

  return (
    <s-stack direction="block" gap="small-200">
      {!isLong ? (
        chips
      ) : expanded ? (
        // `s-box`'s `overflow` only supports hidden/visible, so a plain scroll div caps the
        // expanded list's height (~20rem) rather than growing unbounded.
        <div style={{ maxHeight: "20rem", overflowY: "auto" }}>{chips}</div>
      ) : null}
      {isLong ? (
        <s-button
          variant="tertiary"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Show less" : `View all selected (${items.length})`}
        </s-button>
      ) : null}
    </s-stack>
  );
}

export function SettingsTab({
  engine,
  adminAppBase,
}: {
  engine: RowEngine;
  // Admin deep-link base — the conflict banner's link to the colliding template goes through
  // `AdminAppLink` so "open in new tab" works. See `app/utils/adminAppLink.ts`.
  adminAppBase: string;
}) {
  const {
    status,
    setStatus,
    scope,
    scopeValues,
    setScopeKind,
    setScopeValues,
    conflicts,
    excludes,
    excludeLabels,
    excludeImages,
    setExcludes,
  } = engine;
  const shopify = useAppBridge();

  const isResourceScope = scope === "PRODUCT" || scope === "COLLECTION";
  const isTextScope = scope === "PRODUCT_TYPE" || scope === "VENDOR";
  // EXCLUDE carve-outs (feature 45) are shown ONLY under ALL_PRODUCTS: the one scope where a
  // carve-out has an unambiguous, always-honorable meaning (it overlaps every other scope, so the
  // only rule that can coexist with "all products EXCEPT X" is a dedicated PRODUCT:X template).
  const showExcludes = scope === "ALL_PRODUCTS";
  // A valued scope with an empty value set is incomplete — surface an inline error (Save is also
  // disabled by the engine's `canSave`).
  const scopeIncomplete = !isScopeSetComplete(
    scope,
    scopeValues.map((item) => item.value),
  );
  // An Active template with no assignment shows on no storefront page — warn so an ACTIVE-but-
  // invisible template is never a silent no-op.
  const activeButUnassigned = status === "ACTIVE" && scope === SCOPE_NONE;
  // Blocking conflicts we can name and link. An unnamed conflict is the gate's fail-closed case,
  // which the banner renders differently.
  const namedConflicts = conflicts.filter((conflict) => conflict.templateId);

  // Open the App Bridge resource picker for the current scope kind (feature 47: MULTI-select for
  // PRODUCT/COLLECTION). Preselect the current set via `selectionIds`; the picker returns the FULL
  // final selection, so we REPLACE the set (dedupe defensively). A cancel returns undefined → keep it.
  const pickResources = async () => {
    const type = scope === "PRODUCT" ? "product" : "collection";
    let selected: PickedResource[] | undefined;
    try {
      selected = (await shopify.resourcePicker({
        type,
        multiple: true,
        selectionIds: scopeValues.map((item) => ({ id: item.value })),
      })) as PickedResource[] | undefined;
    } catch {
      // A rejected picker (vs. a cancel, which resolves undefined) would otherwise be a silent no-op —
      // the merchant sees nothing change with no explanation. Surface it and keep the current set.
      shopify.toast.show("Couldn’t open the picker. Try again.", {
        isError: true,
      });
      return;
    }
    if (!selected) return;
    // Capture each resource's title + thumbnail for the rich chip (dedupe by GID).
    const byGid = new Map<string, ScopeValueSeed>();
    for (const resource of selected) {
      byGid.set(resource.id, {
        value: resource.id,
        label: resource.title ?? resource.id,
        image: pickedImageUrl(resource),
      });
    }
    setScopeValues([...byGid.values()]);
  };

  const removeScopeValue = (value: string) => {
    setScopeValues(scopeValues.filter((item) => item.value !== value));
  };

  // Edit the EXCLUDE carve-out list (feature 45). Same preselect + REPLACE model as the scope picker
  // above: the picker returns the full final selection, so unchecking one removes it (per-chip trash
  // works too). A cancel returns undefined → keep the current set.
  const addExcludes = async () => {
    let selected: PickedResource[] | undefined;
    try {
      selected = (await shopify.resourcePicker({
        type: "product",
        multiple: true,
        selectionIds: excludes.map((gid) => ({ id: gid })),
      })) as PickedResource[] | undefined;
    } catch {
      // See pickResources: a rejected picker must give feedback rather than silently keep the set.
      shopify.toast.show("Couldn’t open the picker. Try again.", {
        isError: true,
      });
      return;
    }
    if (!selected) return;
    const byGid = new Map<string, ExcludeSeed>();
    for (const product of selected) {
      byGid.set(product.id, {
        gid: product.id,
        label: product.title ?? product.id,
        image: pickedImageUrl(product),
      });
    }
    setExcludes([...byGid.values()]);
  };

  const removeExclude = (gid: string) => {
    setExcludes(
      excludes
        .filter((existing) => existing !== gid)
        .map((existing) => ({
          gid: existing,
          label: excludeLabels[existing] ?? existing,
          image: excludeImages[existing] ?? null,
        })),
    );
  };

  return (
    <s-stack direction="block" gap="base">
      <s-text type="strong">Settings</s-text>

      {/* Rich conflict banner (feature 44): a blocked activation returns the colliding template(s),
          each named with a bare link. Persistent until the merchant edits the pending scope/status or
          a save succeeds. Links go through `AdminAppLink` so "open in new tab" lands in the admin. */}
      {conflicts.length > 0 ? (
        <s-banner
          tone="critical"
          heading="Can’t activate — assignment conflict"
        >
          <s-stack direction="block" gap="small-200">
            <s-paragraph>
              This template’s assignment overlaps with another active template.
              Two active templates can’t target the same products.
            </s-paragraph>
            {namedConflicts.length > 0 ? (
              <s-stack direction="block" gap="small-100">
                {namedConflicts.map((conflict) => (
                  <AdminAppLink
                    key={conflict.templateId}
                    adminAppBase={adminAppBase}
                    appPath={`/app/templates/${conflict.templateId}`}
                  >
                    {conflict.templateName ?? "View conflicting template"}
                  </AdminAppLink>
                ))}
              </s-stack>
            ) : (
              <s-paragraph>{conflicts[0]?.reason}</s-paragraph>
            )}
          </s-stack>
        </s-banner>
      ) : null}

      <s-select
        label="Status"
        value={status}
        onChange={(event: Event) => setStatus(readValue(event))}
      >
        {VISIBLE_TEMPLATE_STATUS_OPTIONS.map((option) => (
          <s-option key={option.value} value={option.value}>
            {option.label}
          </s-option>
        ))}
      </s-select>
      <s-text color="subdued">
        Active makes this table eligible to show on the storefront for its
        assigned products. Draft is hidden. Your change takes effect when you
        save.
      </s-text>

      <s-divider></s-divider>

      {/* Assignment scope (features 44/46/47). Changing the kind resets the value set (setScopeKind);
          the conditional control below collects it (multi-select resource picker vs. free text). */}
      <s-select
        label="Show this table on"
        value={scope}
        onChange={(event: Event) => setScopeKind(readValue(event))}
      >
        {VISIBLE_SCOPE_OPTIONS.map((option) => (
          <s-option key={option.value} value={option.value}>
            {option.label}
          </s-option>
        ))}
      </s-select>

      {/* PRODUCT / COLLECTION value SET (feature 47). A multi-select picker → chip list with per-chip
          Remove + an Add button, mirroring the EXCLUDE control below (feature 45) — the same
          picker→chips pattern on the INCLUDE scope so a template can target several products. */}
      {isResourceScope ? (
        <s-stack direction="block" gap="small-200">
          <CollapsibleChipList
            items={scopeValues.map((item) => ({
              key: item.value,
              image: item.image,
              label: item.label,
              removeLabel: `Remove ${item.label} from this assignment`,
              onRemove: () => removeScopeValue(item.value),
            }))}
          />
          <s-button onClick={pickResources}>
            {scope === "PRODUCT"
              ? scopeValues.length > 0
                ? "Add more products"
                : "Select products"
              : scopeValues.length > 0
                ? "Add more collections"
                : "Select collections"}
          </s-button>
          {scopeIncomplete ? (
            <s-text tone="critical">
              {scope === "PRODUCT"
                ? "Choose at least one product to assign this table to."
                : "Choose at least one collection to assign this table to."}
            </s-text>
          ) : null}
        </s-stack>
      ) : null}

      {isTextScope ? (
        <s-text-field
          label={scope === "PRODUCT_TYPE" ? "Product type" : "Vendor"}
          value={scopeValues[0]?.value ?? ""}
          placeholder={
            scope === "PRODUCT_TYPE" ? "e.g. Snowboard" : "e.g. Acme"
          }
          onInput={(event: Event) => {
            const value = readValue(event);
            // Single-valued free text: the value IS its own label, no thumbnail. Emptiness is judged on
            // the TRIMMED text so a whitespace-only entry stays incomplete (a blank rule matches no
            // product — an Active-but-invisible template). The raw value is kept so multi-word entries
            // like "Sport Coat" can be typed without the interior/trailing space being eaten mid-keystroke.
            setScopeValues(
              value.trim() === "" ? [] : [{ value, label: value, image: null }],
            );
          }}
          error={scopeIncomplete ? "Enter a value." : undefined}
        />
      ) : null}

      {/* Scope help text. Suppressed under `activeButUnassigned`: the warning banner below states the
          SAME fact plus the Active nuance and the call to action, so showing both says it twice. */}
      {!activeButUnassigned ? (
        <s-text color="subdued">
          {scope === SCOPE_NONE
            ? "This table isn’t assigned to any products yet, so it won’t show on the storefront."
            : "When active, this table shows on every product that matches this assignment. Two active templates can’t target the same products."}
        </s-text>
      ) : null}

      {/* EXCLUDE carve-outs (feature 45). Shown only under ALL_PRODUCTS: carve specific products out
          of the catch-all so a dedicated per-product table can take them over. Rides the SaveBar. */}
      {showExcludes ? (
        <>
          <s-divider></s-divider>
          <s-stack direction="block" gap="small-200">
            {/* No help text: it renders directly beneath "Show this table on → All products", so the
                two read as one sentence — "show this table on all products, EXCEPT these". */}
            <s-text type="strong">Except these products</s-text>
            <CollapsibleChipList
              items={excludes.map((gid) => ({
                key: gid,
                image: excludeImages[gid] ?? null,
                label: excludeLabels[gid] ?? gid,
                removeLabel: `Remove ${excludeLabels[gid] ?? gid} from the exceptions`,
                onRemove: () => removeExclude(gid),
              }))}
            />
            <s-button onClick={addExcludes}>
              {excludes.length > 0 ? "Add more products" : "Select products"}
            </s-button>
          </s-stack>
        </>
      ) : null}

      {activeButUnassigned ? (
        <s-banner tone="warning">
          This template is Active but isn’t assigned to any products, so it
          won’t appear on the storefront. Choose what to show it on above.
        </s-banner>
      ) : null}
    </s-stack>
  );
}
