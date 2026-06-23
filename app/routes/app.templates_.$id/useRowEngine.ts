import type { ClipboardEvent } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { useFetcher, useRevalidator } from "react-router";
import { useAppBridge } from "@shopify/app-bridge-react";
import {
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from "@dnd-kit/core";
import { sortableKeyboardCoordinates } from "@dnd-kit/sortable";
import type { loader as metafieldDefinitionsLoader } from "../app.metafield-definitions";
import type { action as templateAction } from "./route";
import {
  MAX_TEMPLATE_ROWS,
  newRowId,
  rowsReducer,
  type EditorRow,
  type RowsAction,
  type ValuePart,
} from "../../utils/rows";
import { linearToPartOffset, partOffsetToLinear } from "../../utils/valueParts";
import {
  filterMetafieldDefinitions,
  filterNativeFields,
} from "../../utils/shopifyFields";
import {
  announceReorderCancel,
  announceReorderEnd,
  announceReorderOver,
  announceReorderStart,
} from "../../utils/reorderAnnouncements";
import {
  cellCount,
  gridToPastedRows,
  parseClipboardTable,
} from "../../utils/clipboardTable";
import { extractHtmlTableGrid } from "../../utils/clipboardTableDom";
import {
  INSERT_FIELD_MODAL_ID,
  metafieldChoiceValue,
  partToSelection,
  type EditTarget,
  type FieldSelection,
  type SavedCaret,
} from "./editorShared";

export interface SpecTableEditorProps {
  initialRows: EditorRow[];
  initialName: string;
  initialStatus: string;
  // Remount the editor (parent bumps a key) so Discard resets the reducer to the
  // persisted rows without a dedicated reset action.
  onDiscard: () => void;
}

// Polaris's `s-*` color tokens live inside each component's shadow DOM and are
// NOT exposed as light-DOM CSS custom properties (confirmed in-browser:
// `--p-color-*` / `--s-color-*` all resolve empty on the document, body, and even
// on `s-*` hosts). So the inline value token — a plain light-DOM span — cannot
// reference `--p-color-text-link` directly. Instead, capture Polaris's own link
// color once from a throwaway `<s-link>`'s shadow and publish it as
// `--appx-token-color` for the scoped token CSS (which derives its hover / caret-on
// tints from the same value via color-mix). This keeps the blue a genuine Polaris
// value with no hardcoded hex; it degrades to `currentColor` if the read fails.
function useCapturedTokenColor() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.style.getPropertyValue("--appx-token-color")) return;
    const probe = document.createElement("s-link");
    probe.textContent = "link";
    probe.style.cssText = "position:fixed;left:-9999px;top:0;";
    document.body.appendChild(probe);
    const read = () => {
      const shadow = (probe as HTMLElement & { shadowRoot?: ShadowRoot })
        .shadowRoot;
      for (const node of shadow
        ? Array.from(shadow.querySelectorAll("*"))
        : []) {
        const color = getComputedStyle(node).color;
        const rgb = color.match(/\d+/g);
        // Skip the inherited near-black; the link text node carries the blue.
        if (rgb && !(rgb[0] === "0" && rgb[1] === "0" && rgb[2] === "0")) {
          root.style.setProperty("--appx-token-color", color);
          break;
        }
      }
      probe.remove();
    };
    const raf = requestAnimationFrame(read);
    return () => {
      cancelAnimationFrame(raf);
      probe.remove();
    };
  }, []);
}

// --- Editor engine ----------------------------------------------------------
// All editor state, refs, handlers, and effects, lifted out of the former
// monolithic container (reshell A1). Owns the App Bridge / fetcher / revalidator
// couplings so every downstream component (ContentTab / RowActionsToolbar /
// RowGrid / InsertFieldModal) stays presentational. Behavior is unchanged from
// the pre-reshell editor — this is a pure state lift.
export function useRowEngine({
  initialRows,
  initialName,
  initialStatus,
  onDiscard,
}: SpecTableEditorProps) {
  const [rows, dispatch] = useReducer(rowsReducer, initialRows);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const atCap = rows.length >= MAX_TEMPLATE_ROWS;
  useCapturedTokenColor();
  const shopify = useAppBridge();

  // --- Drag reorder (Steps 10–11) ------------------------------------------
  // Two sensors on one DndContext: a PointerSensor (mouse/touch, Step 10) with a
  // small activation distance so a click on the ⠿ handle is not mistaken for a
  // drag, and a KeyboardSensor (Step 11) whose `sortableKeyboardCoordinates` lets
  // the arrow keys step this vertical list (Space/Enter pick up & drop, Escape
  // cancels). Both produce the SAME onDragEnd, so the keyboard drop reuses the
  // Step 10 MOVE_ROW path unchanged; the reducer no-ops a drop onto the origin,
  // so a same-spot drag never flips the dirty flag.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    dispatch({
      type: "MOVE_ROW",
      activeId: String(active.id),
      overId: String(over.id),
    });
  }, []);

  // Screen-reader announcements for the keyboard drag (Step 11). dnd-kit renders
  // the hidden live region; we supply row-aware copy (its label + 1-based
  // position) from the pure `reorderAnnouncements` helper. The callbacks read
  // CURRENT rows via a ref so they never close over a stale array — the array
  // does not change mid-drag (MOVE_ROW only fires on drop), and the pre-move
  // `over` position is the slot the dragged row lands in (see the helper's note).
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  const dndAnnouncements = useMemo<Announcements>(
    () => ({
      onDragStart: ({ active }) =>
        announceReorderStart(rowsRef.current, String(active.id)),
      onDragOver: ({ active, over }) =>
        announceReorderOver(
          rowsRef.current,
          String(active.id),
          over ? String(over.id) : null,
        ),
      onDragEnd: ({ active, over }) =>
        announceReorderEnd(
          rowsRef.current,
          String(active.id),
          over ? String(over.id) : null,
        ),
      onDragCancel: ({ active }) =>
        announceReorderCancel(rowsRef.current, String(active.id)),
    }),
    [],
  );

  // --- Save (Step 9.5) -----------------------------------------------------
  // Persist the row array (plus name + status, ridden along unchanged for now) to
  // Postgres + the storefront metaobject via the route action. The editor sends
  // JSON so the structured valueParts survive (FormData would stringify them).
  const saveFetcher = useFetcher<typeof templateAction>();
  const revalidator = useRevalidator();
  const saving = saveFetcher.state !== "idle";

  // Dirty-tracking against the last-saved baseline. Rows are the only editable
  // surface here, so a JSON compare of the row array is the dirty signal.
  const currentRowsJson = JSON.stringify(rows);
  const rowsJsonRef = useRef(currentRowsJson);
  rowsJsonRef.current = currentRowsJson;
  const [savedRowsJson, setSavedRowsJson] = useState(currentRowsJson);
  const isDirty = currentRowsJson !== savedRowsJson;

  // Snapshot of the rows JSON actually sent to the server, captured at click
  // time. The completion effect resets the dirty baseline to THIS value, never to
  // the live rows — so any edit made while the save is in flight stays dirty (the
  // save bar remains open) instead of being silently marked saved and dropped.
  // The editor is also frozen during the save (see SpecTableEditor), making this
  // defense in depth against the edit-during-save race.
  const submittedRowsJsonRef = useRef<string | null>(null);

  const handleSave = useCallback(() => {
    if (saveFetcher.state !== "idle") return; // a save is already in flight
    // The payload is valid JSON at runtime; the cast satisfies SubmitTarget,
    // which the EditorRow interface union does not match structurally (interfaces
    // carry no implicit index signature).
    submittedRowsJsonRef.current = JSON.stringify(rows);
    saveFetcher.submit(
      {
        rows,
        name: initialName,
        status: initialStatus,
      } as unknown as Parameters<typeof saveFetcher.submit>[0],
      { method: "post", encType: "application/json" },
    );
  }, [saveFetcher, rows, initialName, initialStatus]);

  const handleDiscard = useCallback(() => {
    // Clear dirty immediately (hides the bar), then remount to the persisted rows.
    setSavedRowsJson(rowsJsonRef.current);
    onDiscard();
  }, [onDiscard]);

  // Process a completed save exactly once (guard on the data identity): reset the
  // dirty baseline, refresh the loader so a later Discard reverts to the saved
  // rows, and toast the outcome (incl. the metaobject round-trip result).
  const handledSaveRef = useRef<unknown>(null);
  useEffect(() => {
    if (saveFetcher.state !== "idle") return;
    const data = saveFetcher.data;
    if (!data || data === handledSaveRef.current) return;
    handledSaveRef.current = data;
    if (data.ok) {
      // Reset the baseline to exactly what was persisted (the submitted
      // snapshot), NOT the live rows — otherwise an edit made during the in-flight
      // save would be marked saved and lost. Falls back to the live rows if the
      // snapshot is somehow missing.
      setSavedRowsJson(submittedRowsJsonRef.current ?? rowsJsonRef.current);
      revalidator.revalidate();
      if (data.syncError) {
        shopify.toast.show(data.syncError, { isError: true });
      } else if (data.roundTripOk) {
        shopify.toast.show("Saved — storefront round-trip verified");
      } else {
        shopify.toast.show("Saved");
      }
    } else {
      shopify.toast.show(data.error ?? "Could not save template", {
        isError: true,
      });
    }
  }, [saveFetcher.state, saveFetcher.data, revalidator, shopify]);

  // Close the "Insert field" modal when a save begins. The modal portals its
  // content (including its Insert/Update primary button) into the admin chrome,
  // OUTSIDE the editor's inert freeze wrapper — exactly like the SaveBar — so a
  // save that starts while the modal is open would otherwise leave that button
  // live, a path to mutate rows mid-save that the freeze cannot reach. Hiding the
  // modal here, plus the hard `saving` guard in handleCommit, blocks it from both
  // ends. Hiding an already-hidden modal is a no-op, so this is safe to run on any
  // render where a save is in flight.
  useEffect(() => {
    if (saving) shopify.modal.hide(INSERT_FIELD_MODAL_ID);
  }, [saving, shopify]);

  // --- Metafield definitions fetch (Step 8) --------------------------------
  // The shop's product metafield definitions are fetched lazily from the
  // `/app/metafield-definitions` resource route the FIRST time the modal opens,
  // then cached for the editor's lifetime (reopening never refetches). The fetch
  // is observably async so the modal can show explicit loading / empty / error
  // states. Step 8 only confirms the fetch + states — the definitions are NOT
  // rendered as selectable choices yet (that is Step 9).
  const metafieldsFetcher = useFetcher<typeof metafieldDefinitionsLoader>();
  // Flips true on the first open; gates both the "load once" guard and whether
  // the status region renders at all (so it never shows a spinner before the
  // merchant has opened the modal).
  const [metafieldsRequested, setMetafieldsRequested] = useState(false);

  const loadMetafieldDefinitions = useCallback(() => {
    metafieldsFetcher.load("/app/metafield-definitions");
  }, [metafieldsFetcher]);

  // Trigger the fetch once, on the first modal open. Subsequent opens reuse the
  // cached result; the error state's Retry calls `loadMetafieldDefinitions`
  // directly to re-issue.
  const ensureMetafieldDefinitions = useCallback(() => {
    if (metafieldsRequested) return;
    setMetafieldsRequested(true);
    loadMetafieldDefinitions();
  }, [metafieldsRequested, loadMetafieldDefinitions]);

  // --- Insert field modal: caret bridge (Step 5) ---------------------------
  // `activeCaretRef` holds the live caret in whichever value cell last reported
  // one; it is NOT cleared when that cell blurs (so tabbing/clicking to the
  // toolbar button keeps a saved selection — the canonical rich-text-toolbar
  // pattern). It IS cleared when a Label/Section field is focused, since the
  // merchant is no longer editing a value. `savedCaretRef` is the snapshot taken
  // when the modal opens; `hasActiveCaret` only drives the button's disabled gate.
  const activeCaretRef = useRef<SavedCaret | null>(null);
  const savedCaretRef = useRef<SavedCaret | null>(null);
  const [hasActiveCaret, setHasActiveCaret] = useState(false);
  // The field the merchant has picked in the modal (Step 6 native, Step 9
  // metafield). Insert/Update is disabled while this is null. The discriminated
  // `kind` keeps the native and metafield choice lists mutually exclusive.
  // `editTarget` is null in create mode and holds the clicked pill's coordinate in
  // edit mode; together they drive the modal heading, the primary button label,
  // and which commit path runs.
  const [selection, setSelection] = useState<FieldSelection | null>(null);
  const [editTarget, setEditTarget] = useState<EditTarget | null>(null);
  // The modal's search query (Step 7). Pure UI: it filters which native fields
  // are rendered (`filterNativeFields`) and never touches `selectedField` — a
  // selected field filtered out of view stays selected and committable. Reset to
  // "" on every open so the list always opens full.
  const [searchQuery, setSearchQuery] = useState("");
  // The modal's search field. Focused shortly after open so the merchant can
  // type immediately; the focus is deliberately deferred past the modal's open
  // animation (see `focusSearchField`). Typed via the global tag-name map so the
  // JSX ref accepts it (the element is an <s-search-field>, not a plain element).
  const searchFieldRef = useRef<HTMLElementTagNameMap["s-search-field"] | null>(
    null,
  );
  // Caret positions queued for a value cell after a modal Insert, keyed by row id.
  // A ref-held Map so its identity is stable across renders (memoization-safe) and
  // mutating it never triggers a render; the target ValueCell consumes it once in
  // its reconcile effect. Created once.
  const pendingCaretByRowRef = useRef<Map<string, number>>(new Map());

  const onCaretChange = useCallback((rowId: string, linear: number | null) => {
    if (linear === null) {
      activeCaretRef.current = null;
      setHasActiveCaret(false);
    } else {
      activeCaretRef.current = { rowId, linear };
      setHasActiveCaret(true);
    }
  }, []);

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
    // If the deleted row held the saved caret, drop the Insert field gate so it
    // cannot target a row that no longer exists.
    if (activeCaretRef.current?.rowId === id) {
      activeCaretRef.current = null;
      setHasActiveCaret(false);
    }
  }, []);

  // Toolbar inserts land directly below the active row (append when none); the
  // new row becomes active and is scrolled into view.
  const insertActive = useCallback((action: (newId: string) => RowsAction) => {
    const id = newRowId();
    scrollTargetRef.current = id;
    dispatch(action(id));
    setActiveRowId(id);
  }, []);

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
    insertActive((id) => ({
      type: "DUPLICATE_ROW",
      id: activeRowId,
      newId: id,
    }));
  }, [insertActive, activeRowId]);

  // The bottom button always appends to the end, regardless of the active row.
  const handleAppendRow = useCallback(
    () => insertActive((id) => ({ type: "ADD_ROW", id })),
    [insertActive],
  );

  // Open the modal in CREATE mode, snapshotting the current value-cell caret
  // first. Runs on the button's click while the cell still holds the saved
  // selection (value-cell blur does not clear activeCaretRef), so the snapshot is
  // always valid. Resets editTarget + selectedField so a prior edit can't leak in.
  // Focus the modal's search field after it is open. App Bridge plays a view
  // transition when the modal shows; calling .focus() while that transition is
  // mid-flight aborts it (an "InvalidStateError: Transition was aborted" surfaces
  // in the admin console), so we defer past the animation. The modal's own focus
  // trap lands on the close button first; this moves it to the search field so
  // the merchant can type straight away.
  const focusSearchField = useCallback(() => {
    setTimeout(() => searchFieldRef.current?.focus(), 350);
  }, []);

  const handleOpenInsertField = useCallback(() => {
    savedCaretRef.current = activeCaretRef.current;
    if (!savedCaretRef.current) return;
    setEditTarget(null);
    setSelection(null);
    setSearchQuery("");
    ensureMetafieldDefinitions();
    shopify.modal.show(INSERT_FIELD_MODAL_ID);
    focusSearchField();
  }, [shopify, focusSearchField, ensureMetafieldDefinitions]);

  // Open the same modal in EDIT mode for a clicked pill (Step 6.3). No saved
  // caret — edit targets the pill's own slot, not an insertion point. Pre-select
  // the clicked pill: a METAFIELD pre-selects its namespace/key, a native
  // SHOPIFY_FIELD pre-selects its field (Step 9). An unknown native token opens
  // unselected; the pre-selected metafield radio shows checked once the
  // definitions have loaded (the selection is held regardless of render).
  const handleEditPart = useCallback(
    (rowId: string, partIndex: number, part: ValuePart) => {
      savedCaretRef.current = null;
      setEditTarget({ rowId, partIndex });
      setSelection(partToSelection(part));
      setSearchQuery("");
      ensureMetafieldDefinitions();
      shopify.modal.show(INSERT_FIELD_MODAL_ID);
      focusSearchField();
    },
    [shopify, focusSearchField, ensureMetafieldDefinitions],
  );

  // Track the merchant's search query (Step 7). `onInput` fires per keystroke,
  // before `onChange`, so the list filters live as they type.
  const handleSearchInput = useCallback((event: Event) => {
    const value = (event.currentTarget as unknown as { value?: string }).value;
    setSearchQuery(value ?? "");
  }, []);

  // Track the merchant's pick in the native-field choice list (Step 6). Setting a
  // native kind makes the metafield list's controlled values empty, so picking a
  // native field deselects any metafield.
  const handleSelectNative = useCallback((event: Event) => {
    const values = (event.currentTarget as unknown as { values?: string[] })
      .values;
    if (values && values.length > 0) {
      setSelection({ kind: "native", field: values[0] });
    }
  }, []);

  // Track the merchant's pick in the metafield choice list (Step 9). The picked
  // value is a `namespace.key`; decode it back to a definition by LOOKUP in the
  // loaded list (never by string-splitting, so a `.` in a key can't corrupt the
  // pair). Setting a metafield kind deselects any native field.
  const handleSelectMetafield = useCallback(
    (event: Event) => {
      const values = (event.currentTarget as unknown as { values?: string[] })
        .values;
      const picked = values && values.length > 0 ? values[0] : null;
      if (!picked) return;
      const data = metafieldsFetcher.data;
      const definitions = data && data.ok ? data.definitions : [];
      const match = definitions.find(
        (definition) => metafieldChoiceValue(definition) === picked,
      );
      if (match) {
        setSelection({
          kind: "metafield",
          namespace: match.namespace,
          key: match.key,
        });
      }
    },
    [metafieldsFetcher],
  );

  // Commit the picked field. One handler serves both modes: edit swaps the
  // clicked pill in place (SET_VALUE_PART), create inserts a new pill at the saved
  // caret (INSERT_VALUE_PART_AT, the Step 5 path). Either way the post-commit
  // caret lands just after the committed pill via pendingCaretByRowRef, and all
  // modal state is reset so create and edit can't leak into each other.
  const handleCommit = useCallback(() => {
    if (saving) return; // a save is in flight — the editor is frozen
    if (!selection) return; // primary button is disabled in this state
    const part: ValuePart =
      selection.kind === "native"
        ? { type: "SHOPIFY_FIELD", field: selection.field }
        : {
            type: "METAFIELD",
            namespace: selection.namespace,
            key: selection.key,
          };
    shopify.modal.hide(INSERT_FIELD_MODAL_ID);

    if (editTarget) {
      const row = rows.find((r) => r.id === editTarget.rowId);
      if (row && row.rowType === "DATA") {
        // In-place swap keeps the array length, so the caret index after the
        // pill is the start of the next part on the current valueParts.
        pendingCaretByRowRef.current.set(
          editTarget.rowId,
          partOffsetToLinear(row.valueParts, editTarget.partIndex + 1, 0),
        );
        dispatch({
          type: "SET_VALUE_PART",
          id: editTarget.rowId,
          partIndex: editTarget.partIndex,
          part,
        });
      }
    } else {
      const saved = savedCaretRef.current;
      if (saved) {
        const row = rows.find((r) => r.id === saved.rowId);
        if (row && row.rowType === "DATA") {
          const { partIndex, offset } = linearToPartOffset(
            row.valueParts,
            saved.linear,
          );
          pendingCaretByRowRef.current.set(saved.rowId, saved.linear + 1);
          dispatch({
            type: "INSERT_VALUE_PART_AT",
            id: saved.rowId,
            partIndex,
            offset,
            part,
          });
        }
      }
    }

    savedCaretRef.current = null;
    setEditTarget(null);
    setSelection(null);
    setSearchQuery("");
  }, [editTarget, rows, saving, selection, shopify]);

  const handleCancelInsertField = useCallback(() => {
    shopify.modal.hide(INSERT_FIELD_MODAL_ID);
    savedCaretRef.current = null;
    setEditTarget(null);
    setSelection(null);
    setSearchQuery("");
  }, [shopify]);

  // --- Bulk table paste → rows (Steps 12–13) -------------------------------
  // Capture a multi-cell table pasted into the editor (Excel / Google Sheets / a
  // web <table>), parse it to a 2-D grid (Step 12), and bulk-insert it as rows
  // (Step 13): first column → Label, remaining columns → a TEXT/LINE_BREAK Value
  // (`gridToPastedRows`), appended via PASTE_ROWS with the 200-row cap enforced
  // on paste (truncate to the room remaining + tell the merchant what was
  // dropped). The in-cell single-value paste (Step 4) is left untouched:
  // ValueCell.handlePaste calls preventDefault() unconditionally, so this bubbled
  // container handler sees event.defaultPrevented and skips it; a paste into a
  // Label/Section field (or the modal search field, if it bubbles here at all) is
  // skipped by its target.
  const handleContainerPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const data = event.clipboardData;
      if (!data) return; // no clipboard payload (e.g. a programmatic paste)
      if (event.defaultPrevented) return; // an in-cell value paste already ran
      const target = event.target as Element | null;
      if (
        target?.closest?.(
          "s-text-field, s-search-field, input, textarea, [contenteditable]",
        )
      ) {
        return; // a single-field edit, not a bulk-table gesture
      }
      const grid = parseClipboardTable({
        htmlGrid: extractHtmlTableGrid(data.getData("text/html")),
        text: data.getData("text/plain"),
      });
      // A bulk gesture needs an actual multi-cell table (>1 cell — more than one
      // row OR column); ignore an empty or degenerate 1×1 grid (a lone value is
      // not a bulk paste). A single-column, many-row paste IS admitted.
      if (cellCount(grid) <= 1) return;

      // We are consuming this paste now (after the skip-guards above).
      event.preventDefault();

      const room = MAX_TEMPLATE_ROWS - rowsRef.current.length;
      if (room <= 0) {
        shopify.toast.show(
          `Row limit reached — no rows added (max ${MAX_TEMPLATE_ROWS})`,
          { isError: true },
        );
        return;
      }

      const built = gridToPastedRows(grid);
      const toInsert = built.slice(0, room);
      const dropped = built.length - toInsert.length;
      const pasted = toInsert.map((row) => ({ id: newRowId(), ...row }));
      dispatch({ type: "PASTE_ROWS", rows: pasted });

      // Focus affordance: set the last inserted row active and scroll it into
      // view so the merchant sees where the pasted block landed.
      const lastId = pasted[pasted.length - 1]?.id;
      if (lastId) {
        scrollTargetRef.current = lastId;
        setActiveRowId(lastId);
      }

      const added = toInsert.length;
      const rowWord = added === 1 ? "row" : "rows";
      if (dropped > 0) {
        shopify.toast.show(
          `Added ${added} ${rowWord} — ${dropped} over the ${MAX_TEMPLATE_ROWS}-row limit ${
            dropped === 1 ? "wasn't" : "weren't"
          } added`,
        );
      } else {
        shopify.toast.show(`Added ${added} ${rowWord}`);
      }
    },
    [shopify],
  );

  const canDuplicate = activeRowId !== null && !atCap;
  // The native fields visible in the modal for the current search query (Step 7).
  // Cheap over 13 entries, so computed inline each render rather than memoized.
  const visibleFields = filterNativeFields(searchQuery);

  // Metafield fetch status for the modal's metafield section (Steps 8–9). `data`
  // is undefined until the first load resolves; treat that — and any non-idle
  // fetcher state, including a Retry that still holds stale data — as loading.
  const metafieldsData = metafieldsFetcher.data;
  const metafieldsLoading =
    metafieldsFetcher.state !== "idle" || metafieldsData === undefined;
  const metafieldDefinitions =
    metafieldsData && metafieldsData.ok ? metafieldsData.definitions : [];
  const metafieldCount = metafieldDefinitions.length;
  // The metafields visible for the current search query (Step 9), filtered by the
  // same shared rule as the native list above.
  const visibleMetafields = filterMetafieldDefinitions(
    metafieldDefinitions,
    searchQuery,
  );
  // The single combined empty state (Step 9): shown only when a non-empty query
  // filters BOTH the native list and the loaded metafield list to nothing, so the
  // merchant never sees two "no match" messages.
  const showCombinedEmpty =
    searchQuery.trim() !== "" &&
    visibleFields.length === 0 &&
    metafieldsData?.ok === true &&
    visibleMetafields.length === 0;

  return {
    // Rows + reducer
    rows,
    dispatch,
    activeRowId,
    atCap,
    canDuplicate,
    // Drag reorder
    sensors,
    handleDragEnd,
    dndAnnouncements,
    // Save / dirty
    isDirty,
    saving,
    handleSave,
    handleDiscard,
    // Caret bridge / modal state
    hasActiveCaret,
    selection,
    editTarget,
    searchQuery,
    searchFieldRef,
    pendingCaret: pendingCaretByRowRef.current,
    onCaretChange,
    // Row ops
    onActivate,
    onDelete,
    handleAddRow,
    handleAddSection,
    handleDuplicate,
    handleAppendRow,
    // Modal handlers
    handleOpenInsertField,
    handleEditPart,
    handleSearchInput,
    handleSelectNative,
    handleSelectMetafield,
    handleCommit,
    handleCancelInsertField,
    // Metafield fetch + derived modal data
    metafieldsRequested,
    loadMetafieldDefinitions,
    visibleFields,
    metafieldsData,
    metafieldsLoading,
    metafieldCount,
    visibleMetafields,
    showCombinedEmpty,
    // Bulk paste
    handleContainerPaste,
  };
}

export type RowEngine = ReturnType<typeof useRowEngine>;
