import { INSERT_FIELD_MODAL_ID, metafieldChoiceValue } from "./editorShared";
import type { RowEngine } from "./useRowEngine";

// The single editor-level "Insert field" modal serving both create and edit
// (Steps 5–9), extracted verbatim from the former container (reshell A1). Hidden
// until `shopify.modal.show` is called — from the toolbar button (create) or a
// pill click (edit); <s-modal> provides the focus trap, Esc, and outside-click
// dismiss natively. The body is a search box over a native-field list plus a live
// metafield section; the primary button is disabled until a field is selected and
// commits create (Insert at the saved caret) or edit (Update the clicked pill in
// place). Cancel / Esc / outside-click commit nothing. Presentational — all state
// + handlers come from the engine.
export function InsertFieldModal({ engine }: { engine: RowEngine }) {
  const {
    editTarget,
    searchQuery,
    searchFieldRef,
    selection,
    visibleFields,
    metafieldsRequested,
    metafieldsLoading,
    metafieldsData,
    metafieldCount,
    visibleMetafields,
    showCombinedEmpty,
    handleSearchInput,
    handleSelectNative,
    handleSelectMetafield,
    loadMetafieldDefinitions,
    handleCommit,
    handleCancelInsertField,
  } = engine;

  return (
    <s-modal
      id={INSERT_FIELD_MODAL_ID}
      heading={editTarget ? "Edit field" : "Insert field"}
    >
      {/* Search box (Step 7): filters BOTH lists as the merchant types. Pure
          presentation — it never changes `selection`, so a pick that scrolls
          out of the filtered view stays committable. */}
      <s-stack direction="block" gap="base">
        <s-search-field
          ref={searchFieldRef}
          label="Search fields"
          labelAccessibilityVisibility="exclusive"
          placeholder="Search fields"
          value={searchQuery}
          onInput={handleSearchInput}
        />
        {/* Native fields (Step 6). No per-section empty message: an empty
            native list is silent, and the single combined empty state below
            covers the case where BOTH lists are empty. */}
        {visibleFields.length > 0 ? (
          <s-choice-list
            label="Product field"
            labelAccessibilityVisibility="exclusive"
            values={selection?.kind === "native" ? [selection.field] : []}
            onChange={handleSelectNative}
          >
            {visibleFields.map((nativeField) => (
              <s-choice key={nativeField.field} value={nativeField.field}>
                {nativeField.label}
              </s-choice>
            ))}
          </s-choice-list>
        ) : null}

        {/* Metafield section (Step 9): the shop's product metafield
            definitions as a selectable list below the native fields, filtered
            by the same search box. Loading / error+Retry / empty-store states
            are carried from Step 8. The heading stays visible whenever the
            section has been requested so it is always discoverable. */}
        {metafieldsRequested ? (
          <s-stack direction="block" gap="small-200">
            <s-divider />
            <s-text type="strong">Metafields</s-text>
            {metafieldsLoading ? (
              <s-stack direction="inline" gap="small-200" alignItems="center">
                <s-spinner accessibilityLabel="Loading metafields"></s-spinner>
                <s-text color="subdued">Loading metafields…</s-text>
              </s-stack>
            ) : metafieldsData && !metafieldsData.ok ? (
              <s-stack direction="block" gap="small-200">
                <s-banner tone="critical">{metafieldsData.error}</s-banner>
                <s-stack direction="inline">
                  <s-button onClick={loadMetafieldDefinitions}>Retry</s-button>
                </s-stack>
              </s-stack>
            ) : metafieldCount === 0 ? (
              <s-text color="subdued">
                This store has no product metafield definitions.
              </s-text>
            ) : visibleMetafields.length > 0 ? (
              <s-choice-list
                label="Metafield"
                labelAccessibilityVisibility="exclusive"
                values={
                  selection?.kind === "metafield"
                    ? [metafieldChoiceValue(selection)]
                    : []
                }
                onChange={handleSelectMetafield}
              >
                {visibleMetafields.map((definition) => (
                  <s-choice
                    key={definition.id || metafieldChoiceValue(definition)}
                    value={metafieldChoiceValue(definition)}
                  >
                    {definition.name}
                  </s-choice>
                ))}
              </s-choice-list>
            ) : null}
          </s-stack>
        ) : null}

        {/* Single combined empty state (Step 9): only when a query filters
            both loaded lists to nothing. */}
        {showCombinedEmpty ? (
          <s-paragraph color="subdued">
            No fields match “{searchQuery.trim()}”.
          </s-paragraph>
        ) : null}
      </s-stack>
      <s-button
        slot="primary-action"
        variant="primary"
        onClick={handleCommit}
        {...(selection ? {} : { disabled: true })}
      >
        {editTarget ? "Update" : "Insert"}
      </s-button>
      <s-button slot="secondary-actions" onClick={handleCancelInsertField}>
        Cancel
      </s-button>
    </s-modal>
  );
}
