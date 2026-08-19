import { INSERT_FIELD_MODAL_ID, metafieldChoiceValue } from "./editorShared";
import type { RowEngine } from "./useRowEngine";

// The single editor-level "Insert field" modal (Steps 5–9). Create-only since feature 112 (the
// edit-a-pill path is gone — tokens are edited as text in the textarea). Hidden until shown from the
// toolbar button. The body is a search box over a native-field list plus a live metafield section; the
// primary button is disabled until a field is selected and commits Insert at the saved caret.
// Presentational.
export function InsertFieldModal({ engine }: { engine: RowEngine }) {
  const {
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
    <s-modal id={INSERT_FIELD_MODAL_ID} heading="Insert field">
      {/* Search box (Step 7): filters BOTH lists as the merchant types. Never changes `selection`, so
          a pick that scrolls out of the filtered view stays committable. */}
      <s-stack direction="block" gap="base">
        <s-search-field
          ref={searchFieldRef}
          label="Search fields"
          labelAccessibilityVisibility="exclusive"
          placeholder="Search fields"
          value={searchQuery}
          onInput={handleSearchInput}
        />
        {/* Native fields (Step 6). No per-section empty message: an empty native list is silent, and
            the combined empty state below covers the both-empty case. */}
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

        {/* Metafield section (Step 9): the shop's product metafield definitions as a selectable list,
            filtered by the same search box. Loading / error+Retry / empty-store states from Step 8. The
            heading stays visible once the section has been requested. */}
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

        {/* Combined empty state (Step 9): only when a query filters both loaded lists to nothing. */}
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
        Insert
      </s-button>
      <s-button slot="secondary-actions" onClick={handleCancelInsertField}>
        Cancel
      </s-button>
    </s-modal>
  );
}
