import type { ChangeEvent, Dispatch } from "react";
import { memo, useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  MAX_TEMPLATE_ROWS,
  newRowId,
  placeholderMetafieldPart,
  rowsReducer,
  type DataRow,
  type EditorRow,
  type RowsAction,
  type ValuePart,
} from "../../utils/rows";
import styles from "./SpecTableEditor.module.css";

// Shared grid template so the column header, data rows, and section rows all
// line up. First track is the fixed-width gutter (drag handle + delete).
const GUTTER = "2.75rem";
const DATA_COLUMNS = `${GUTTER} 1fr 1.6fr`;
const SECTION_COLUMNS = `${GUTTER} 1fr`;

// Polaris field events are typed as plain DOM `Event`; the field element exposes
// the current text on `value`, so we read it through this narrowed cast.
function readValue(event: Event): string {
  return (event.currentTarget as HTMLInputElement).value;
}

// --- Value-part presentation ------------------------------------------------
// Pill label format (resolved Step 2 open question): "Metafield · <key>" and
// "Field · <field>". A placeholder pill has no field chosen yet (Step 3 fills
// it), so it reads "· choose field" until then.
function pillLabel(part: Exclude<ValuePart, { type: "TEXT" }>): string {
  if (part.type === "METAFIELD") {
    return `Metafield · ${part.key || "choose field"}`;
  }
  return `Field · ${part.field || "choose field"}`;
}

function pillIcon(
  part: Exclude<ValuePart, { type: "TEXT" }>,
): "metafields" | "product" {
  return part.type === "METAFIELD" ? "metafields" : "product";
}

// --- Row gutter (drag handle + delete), shared by data and section rows ------
const RowGutter = memo(function RowGutter({
  rowNumber,
  onDelete,
}: {
  rowNumber: number;
  onDelete: () => void;
}) {
  return (
    <s-stack direction="block" gap="small-300" alignItems="center">
      {/* Drag-to-reorder is wired in Step 4; inert + hidden from AT for now. */}
      <span className={styles.dragHandle} aria-hidden="true">
        <s-icon type="drag-handle" color="subdued"></s-icon>
      </span>
      <s-button
        variant="tertiary"
        tone="critical"
        icon="delete"
        accessibilityLabel={`Delete row ${rowNumber}`}
        onClick={onDelete}
      ></s-button>
    </s-stack>
  );
});

// --- Segmented value cell ---------------------------------------------------
function ValueCell({
  row,
  rowNumber,
  dispatch,
}: {
  row: DataRow;
  rowNumber: number;
  dispatch: Dispatch<RowsAction>;
}) {
  const rowName = row.label || `row ${rowNumber}`;
  const single = row.valueParts.length === 1;

  return (
    <s-box border="base" borderRadius="base" padding="small-200">
      <div className={styles.cell}>
        {row.valueParts.map((part, partIndex) => {
          if (part.type === "TEXT") {
            return (
              <input
                key={`${partIndex}:TEXT`}
                className={styles.segment}
                type="text"
                value={part.text}
                // size tracks content so the segment grows as the merchant
                // types; min-width in CSS keeps an empty segment clickable.
                size={Math.max(part.text.length, 1)}
                placeholder={single ? "Value" : undefined}
                aria-label={`Value text for ${rowName}`}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  dispatch({
                    type: "SET_VALUE_TEXT",
                    id: row.id,
                    partIndex,
                    text: event.target.value,
                  })
                }
              />
            );
          }

          const label = pillLabel(part);
          // Two deliberate Polaris workarounds (current CDN build): `strong`
          // tone because chips have no blue/info variant, and an explicit
          // adjacent remove button because `<s-chip removable>` paints no ✕.
          // Do not "simplify" back to a blue or `removable` chip — both regress.
          // Step 4 replaces this whole pill surface with an inline token.
          return (
            <span key={`${partIndex}:${part.type}`} className={styles.pill}>
              <s-chip color="strong" accessibilityLabel={label}>
                <s-icon slot="graphic" type={pillIcon(part)}></s-icon>
                {label}
              </s-chip>
              <s-button
                variant="tertiary"
                icon="x"
                accessibilityLabel={`Remove ${label}`}
                onClick={() =>
                  dispatch({ type: "REMOVE_VALUE_PART", id: row.id, partIndex })
                }
              ></s-button>
            </span>
          );
        })}

        <s-button
          variant="tertiary"
          icon="plus"
          accessibilityLabel={`Insert field into ${rowName}`}
          onClick={() =>
            dispatch({
              type: "INSERT_VALUE_PART",
              id: row.id,
              part: placeholderMetafieldPart(),
            })
          }
        >
          Insert field
        </s-button>
      </div>
    </s-box>
  );
}

// --- Data row ---------------------------------------------------------------
interface RowItemProps {
  row: EditorRow;
  index: number;
  isActive: boolean;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  dispatch: Dispatch<RowsAction>;
}

// Memoized so a single cell edit re-renders only that row. `dispatch`,
// `onActivate`, and `onDelete` are stable; `isActive` is a boolean, so non-edited,
// non-(de)activated rows skip re-rendering entirely.
const EditorRowItem = memo(function EditorRowItem({
  row,
  index,
  isActive,
  onActivate,
  onDelete,
  dispatch,
}: RowItemProps) {
  const rowNumber = index + 1;

  const handleLabel = useCallback(
    (event: Event) =>
      dispatch({ type: "SET_LABEL", id: row.id, label: readValue(event) }),
    [dispatch, row.id],
  );
  const handleDelete = useCallback(() => onDelete(row.id), [onDelete, row.id]);
  const handleActivate = useCallback(
    () => onActivate(row.id),
    [onActivate, row.id],
  );

  const rowClass = isActive ? `${styles.row} ${styles.rowActive}` : styles.row;
  const isSection = row.rowType === "SECTION_HEADER";

  return (
    // Activation is a focus side effect: clicking any cell/control focuses it,
    // and keyboard tabbing focuses it too — both bubble to onFocusCapture. A
    // bare onClick here would be a non-interactive-div a11y violation.
    <div id={`row-${row.id}`} className={rowClass} onFocusCapture={handleActivate}>
      <s-box
        padding="small-200"
        borderRadius="base"
        {...(isActive ? { background: "subdued" } : {})}
      >
        <s-grid
          gridTemplateColumns={isSection ? SECTION_COLUMNS : DATA_COLUMNS}
          gap="base"
          alignItems="center"
        >
          <RowGutter rowNumber={rowNumber} onDelete={handleDelete} />

          {isSection ? (
            <s-box background="subdued" borderRadius="base" padding="small-200">
              <s-text-field
                label={`Section title for row ${rowNumber}`}
                labelAccessibilityVisibility="exclusive"
                placeholder="Section title"
                value={row.label}
                onInput={handleLabel}
              />
            </s-box>
          ) : (
            <>
              <s-text-field
                label={`Label for row ${rowNumber}`}
                labelAccessibilityVisibility="exclusive"
                placeholder="Label"
                value={row.label}
                onInput={handleLabel}
              />
              <ValueCell row={row} rowNumber={rowNumber} dispatch={dispatch} />
            </>
          )}
        </s-grid>
      </s-box>
    </div>
  );
});

// --- Editor container -------------------------------------------------------
export function SpecTableEditor({ initialRows }: { initialRows: EditorRow[] }) {
  const [rows, dispatch] = useReducer(rowsReducer, initialRows);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const atCap = rows.length >= MAX_TEMPLATE_ROWS;

  // A freshly created row should scroll into view once it has rendered.
  const scrollTargetRef = useRef<string | null>(null);
  useEffect(() => {
    const id = scrollTargetRef.current;
    if (!id) {
      return;
    }
    scrollTargetRef.current = null;
    document
      .getElementById(`row-${id}`)
      ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [rows]);

  const onActivate = useCallback((id: string) => setActiveRowId(id), []);

  const onDelete = useCallback((id: string) => {
    dispatch({ type: "DELETE_ROW", id });
    // The active id may now point at a removed row; clear it so toolbar inserts
    // fall back to appending until the merchant focuses another row.
    setActiveRowId((current) => (current === id ? null : current));
  }, []);

  // Toolbar inserts land directly below the active row (append when none); the
  // new row becomes active and is scrolled into view.
  const insertActive = useCallback(
    (action: (newId: string) => RowsAction) => {
      const id = newRowId();
      scrollTargetRef.current = id;
      dispatch(action(id));
      setActiveRowId(id);
    },
    [],
  );

  const handleAddRow = useCallback(
    () => insertActive((id) => ({ type: "ADD_ROW", id, afterId: activeRowId })),
    [insertActive, activeRowId],
  );
  const handleAddSection = useCallback(
    () =>
      insertActive((id) => ({ type: "ADD_SECTION", id, afterId: activeRowId })),
    [insertActive, activeRowId],
  );
  const handleDuplicate = useCallback(() => {
    if (!activeRowId) {
      return;
    }
    insertActive((id) => ({ type: "DUPLICATE_ROW", id: activeRowId, newId: id }));
  }, [insertActive, activeRowId]);

  // The bottom button always appends to the end, regardless of the active row.
  const handleAppendRow = useCallback(
    () => insertActive((id) => ({ type: "ADD_ROW", id })),
    [insertActive],
  );

  const canDuplicate = activeRowId !== null && !atCap;

  return (
    <s-stack direction="block" gap="base">
      <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
        {/* `<s-stack direction="inline">`, not `<s-button-group>`: the group's
            shadow root has no <slot> in the current Polaris CDN build, so its
            child buttons render at 0×0 / vanish. Do not switch to a button
            group — it regresses (confirmed in-browser, Step 2). */}
        <s-stack direction="inline" gap="base" alignItems="center">
          <s-button
            variant="primary"
            icon="plus"
            onClick={handleAddRow}
            {...(atCap ? { disabled: true } : {})}
          >
            Add row
          </s-button>
          <s-button
            variant="secondary"
            icon="layout-section"
            onClick={handleAddSection}
            {...(atCap ? { disabled: true } : {})}
          >
            Add section
          </s-button>
          <s-button
            variant="secondary"
            icon="duplicate"
            onClick={handleDuplicate}
            {...(canDuplicate ? {} : { disabled: true })}
          >
            Duplicate
          </s-button>
        </s-stack>
        <s-text
          color={atCap ? undefined : "subdued"}
          tone={atCap ? "critical" : undefined}
          fontVariantNumeric="tabular-nums"
        >
          Rows: {rows.length} / {MAX_TEMPLATE_ROWS}
        </s-text>
      </s-grid>

      {atCap ? (
        <s-banner tone="warning">
          You have reached the {MAX_TEMPLATE_ROWS} row limit. Delete a row before
          adding, duplicating, or adding a section.
        </s-banner>
      ) : null}

      {rows.length === 0 ? (
        <s-box padding="base" borderWidth="base" borderRadius="base">
          <s-paragraph>
            No rows yet. Choose Add row to start building your spec table.
          </s-paragraph>
        </s-box>
      ) : (
        <s-stack direction="block" gap="small-300">
          <s-grid gridTemplateColumns={DATA_COLUMNS} gap="base">
            <s-text> </s-text>
            <s-text type="strong">Label</s-text>
            <s-text type="strong">Value</s-text>
          </s-grid>

          {rows.map((row, index) => (
            <EditorRowItem
              key={row.id}
              row={row}
              index={index}
              isActive={row.id === activeRowId}
              onActivate={onActivate}
              onDelete={onDelete}
              dispatch={dispatch}
            />
          ))}
        </s-stack>
      )}

      <s-button
        variant="secondary"
        icon="plus"
        onClick={handleAppendRow}
        {...(atCap ? { disabled: true } : {})}
      >
        Add row
      </s-button>
    </s-stack>
  );
}
