import { useAppBridge } from "@shopify/app-bridge-react";
import { TEMPLATE_STATUS_OPTIONS } from "../../utils/templateStatus";
import {
  SCOPE_NONE,
  SCOPE_OPTIONS,
  isScopeComplete,
} from "../../utils/assignmentScope";
import type { RowEngine } from "./useRowEngine";

// The editor's Settings-tab sidebar (feature 36 status control + feature 44
// assignment scope picker). Presentational — it reads the live status/scope off
// the engine and renders the controls; both ride the meta-JSON dirty snapshot, so
// changing either opens the contextual SaveBar and Save persists them together
// (route action). This panel renders in EditorShell's `settingsPanel` slot, INSIDE
// the editor's inert freeze wrapper (SpecTableEditor), so it is frozen with the
// rest of the editor during an in-flight save — no separate `saving` guard here.
//
// Note the division of labour with the header: the <s-badge> in the page header
// (TemplateHeaderActions) shows the PERSISTED loader status; these controls show
// the PENDING edit. They converge after Save + revalidation.

// Read the `value` off a Polaris web-component change/input event (the elements are
// custom, so `currentTarget.value` isn't in the DOM typings).
function readValue(event: Event): string {
  return (event.currentTarget as unknown as { value: string }).value;
}

export function SettingsTab({ engine }: { engine: RowEngine }) {
  const {
    status,
    setStatus,
    scope,
    scopeValue,
    scopeValueLabel,
    setScope,
    conflicts,
    excludes,
    excludeLabels,
    setExcludes,
  } = engine;
  const shopify = useAppBridge();

  const isResourceScope = scope === "PRODUCT" || scope === "COLLECTION";
  const isTextScope = scope === "PRODUCT_TYPE" || scope === "VENDOR";
  // EXCLUDE carve-outs (feature 45) are shown ONLY under ALL_PRODUCTS: it is the
  // one scope where a carve-out has an unambiguous, always-honorable meaning (it
  // overlaps every other scope, so the only rule that can coexist with
  // "all products EXCEPT X" is a dedicated PRODUCT:X template — exactly the case the
  // gate resolves). See feature 45's settled decision.
  const showExcludes = scope === "ALL_PRODUCTS";
  // A valued scope with no value yet is an invalid (incomplete) state — surface an
  // inline error (Save is also disabled by the engine's `canSave`).
  const scopeIncomplete = !isScopeComplete(scope, scopeValue);
  // An Active template with no assignment (or a still-incomplete one) shows on no
  // storefront page — warn so an ACTIVE-but-invisible template is never a silent
  // no-op.
  const activeButUnassigned = status === "ACTIVE" && scope === SCOPE_NONE;

  // Open the App Bridge resource picker for the current scope kind and store the
  // picked GID + its title (feature 44; single-select — one resource per scope).
  const pickResource = async () => {
    const type = scope === "PRODUCT" ? "product" : "collection";
    const selected = (await shopify.resourcePicker({
      type,
      multiple: false,
    })) as Array<{ id: string; title?: string }> | undefined;
    if (selected && selected.length > 0) {
      const picked = selected[0];
      setScope({
        scope,
        scopeValue: picked.id,
        scopeValueLabel: picked.title ?? picked.id,
      });
    }
  };

  // Add products to the EXCLUDE carve-out list (feature 45). Multi-select picker;
  // MERGE the picked products into the existing set (dedupe by GID, keep existing
  // labels) so a second "Add more" pass appends rather than replaces. Removal is
  // per-chip below.
  const addExcludes = async () => {
    const selected = (await shopify.resourcePicker({
      type: "product",
      multiple: true,
    })) as Array<{ id: string; title?: string }> | undefined;
    if (!selected || selected.length === 0) return;
    const byGid = new Map<string, string>(
      excludes.map((gid) => [gid, excludeLabels[gid] ?? gid]),
    );
    for (const product of selected) {
      byGid.set(product.id, product.title ?? product.id);
    }
    setExcludes([...byGid].map(([gid, label]) => ({ gid, label })));
  };

  const removeExclude = (gid: string) => {
    setExcludes(
      excludes
        .filter((existing) => existing !== gid)
        .map((existing) => ({
          gid: existing,
          label: excludeLabels[existing] ?? existing,
        })),
    );
  };

  return (
    <s-stack direction="block" gap="base">
      <s-text type="strong">Settings</s-text>

      {/* Rich conflict banner (feature 44): a blocked activation returns the
          colliding template(s); name each with a link and the three resolutions.
          Persistent until the merchant edits the pending scope/status or a save
          succeeds (the engine clears `conflicts` on either). */}
      {conflicts.length > 0 ? (
        <s-banner
          tone="critical"
          heading="Can’t activate — assignment conflict"
        >
          <s-stack direction="block" gap="small-200">
            <s-paragraph>
              This template’s assignment overlaps one that’s already active. Two
              active templates can’t target the same products.
            </s-paragraph>
            {conflicts.some((conflict) => conflict.templateId) ? (
              <s-stack direction="block" gap="small-100">
                {conflicts
                  .filter((conflict) => conflict.templateId)
                  .map((conflict) => (
                    <s-link
                      key={conflict.templateId}
                      href={`/app/templates/${conflict.templateId}`}
                    >
                      {conflict.templateName ?? "View conflicting template"}
                    </s-link>
                  ))}
              </s-stack>
            ) : (
              <s-paragraph>{conflicts[0]?.reason}</s-paragraph>
            )}
            <s-paragraph>
              To resolve: narrow this template’s scope, set it to “No products”,
              or set the other template back to Draft.
            </s-paragraph>
          </s-stack>
        </s-banner>
      ) : null}

      <s-select
        label="Status"
        value={status}
        onChange={(event: Event) => setStatus(readValue(event))}
      >
        {TEMPLATE_STATUS_OPTIONS.map((option) => (
          <s-option key={option.value} value={option.value}>
            {option.label}
          </s-option>
        ))}
      </s-select>
      <s-text color="subdued">
        Active makes this table eligible to show on the storefront for its
        assigned products. Draft and Archived are hidden. Your change takes
        effect when you save.
      </s-text>

      <s-divider></s-divider>

      {/* Assignment scope (feature 44). Changing the kind resets the value; the
          conditional control below collects it (resource picker vs. free text). */}
      <s-select
        label="Show this table on"
        value={scope}
        onChange={(event: Event) =>
          // A kind change clears the value + label — a product GID is meaningless
          // for a VENDOR scope, etc.
          setScope({
            scope: readValue(event),
            scopeValue: null,
            scopeValueLabel: null,
          })
        }
      >
        {SCOPE_OPTIONS.map((option) => (
          <s-option key={option.value} value={option.value}>
            {option.label}
          </s-option>
        ))}
      </s-select>

      {isResourceScope ? (
        <s-stack direction="block" gap="small-200">
          {scopeValue ? (
            <s-stack
              direction="inline"
              gap="small-200"
              alignItems="center"
              justifyContent="space-between"
            >
              <s-text>{scopeValueLabel ?? scopeValue}</s-text>
              <s-button variant="tertiary" onClick={pickResource}>
                Change
              </s-button>
            </s-stack>
          ) : (
            <s-button onClick={pickResource}>
              {scope === "PRODUCT" ? "Select product" : "Select collection"}
            </s-button>
          )}
          {scopeIncomplete ? (
            <s-text tone="critical">
              {scope === "PRODUCT"
                ? "Choose a product to assign this table to."
                : "Choose a collection to assign this table to."}
            </s-text>
          ) : null}
        </s-stack>
      ) : null}

      {isTextScope ? (
        <s-text-field
          label={scope === "PRODUCT_TYPE" ? "Product type" : "Vendor"}
          value={scopeValue ?? ""}
          placeholder={
            scope === "PRODUCT_TYPE" ? "e.g. Snowboard" : "e.g. Acme"
          }
          onInput={(event: Event) => {
            const value = readValue(event);
            // For type/vendor the value IS the label (free text).
            setScope({ scope, scopeValue: value, scopeValueLabel: value });
          }}
          error={scopeIncomplete ? "Enter a value." : undefined}
        />
      ) : null}

      <s-text color="subdued">
        {scope === SCOPE_NONE
          ? "This table isn’t assigned to any products yet, so it won’t show on the storefront."
          : "When active, this table shows on every product that matches this assignment. Two active templates can’t target the same products."}
      </s-text>

      {/* EXCLUDE carve-outs (feature 45). Shown only under ALL_PRODUCTS: carve
          specific products out of the catch-all so a dedicated per-product table
          can take them over (or they render nothing). Multi-select picker → chip
          list with per-chip remove; rides the SaveBar via the engine. */}
      {showExcludes ? (
        <>
          <s-divider></s-divider>
          <s-stack direction="block" gap="small-200">
            <s-text type="strong">Except these products</s-text>
            <s-text color="subdued">
              These products won’t show this table, even though they match the
              assignment above. Assign them their own table, or leave them with
              nothing.
            </s-text>
            {excludes.length > 0 ? (
              <s-stack direction="block" gap="small-100">
                {excludes.map((gid) => (
                  <s-stack
                    key={gid}
                    direction="inline"
                    gap="small-200"
                    alignItems="center"
                    justifyContent="space-between"
                  >
                    <s-text>{excludeLabels[gid] ?? gid}</s-text>
                    <s-button
                      variant="tertiary"
                      onClick={() => removeExclude(gid)}
                      accessibilityLabel={`Remove ${excludeLabels[gid] ?? gid} from the exceptions`}
                    >
                      Remove
                    </s-button>
                  </s-stack>
                ))}
              </s-stack>
            ) : null}
            <s-button onClick={addExcludes}>
              {excludes.length > 0 ? "Add more products" : "Select products"}
            </s-button>
          </s-stack>
        </>
      ) : null}

      {activeButUnassigned ? (
        <s-banner tone="warning">
          This template is set to Active but isn’t assigned to any products, so
          it won’t appear on the storefront. Choose what to show it on above.
        </s-banner>
      ) : null}
    </s-stack>
  );
}
