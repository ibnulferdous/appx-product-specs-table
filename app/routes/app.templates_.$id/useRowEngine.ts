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
  isPristineScaffold,
  MAX_TEMPLATE_ROWS,
  newRowId,
  rowsReducer,
  type EditorRow,
  type RowsAction,
  type ValuePart,
} from "../../utils/rows";
import {
  formatFieldToken,
  formatMetafieldToken,
  partsToText,
  textToParts,
} from "../../utils/valueText";
import {
  DEFAULT_STYLING_VALUES,
  serializeStylingOverrides,
  type StylingValues,
} from "../../utils/tableStyling";
import { editorMetaSnapshot } from "./editorSnapshot";
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
import { cellCount, gridToPastedRows } from "../../utils/clipboardTable";
import { readClipboardGrid } from "../../utils/clipboardTableDom";
import { isScopeSetComplete } from "../../utils/assignmentScope";
import {
  BULK_DELETE_CONFIRM_THRESHOLD,
  BULK_DELETE_MODAL_ID,
  INSERT_FIELD_MODAL_ID,
  MODAL_TRANSITION_MS,
  PASTE_CAP_MODAL_ID,
  metafieldChoiceValue,
  type FieldSelection,
  type SavedCaret,
} from "./editorShared";

// A bulk paste that would cross the row cap, captured for the confirmation modal.
// The rows are already TRUNCATED to what fits and id-stamped, so confirming
// applies exactly what the modal previewed; `dropped` is what will not fit.
interface PendingPaste {
  pasted: Array<{ id: string; label: string; valueParts: ValuePart[] }>;
  dropped: number;
  replace: boolean;
  afterId: string | null;
}

// One member of a template's assignment scope value SET: the raw value (a
// PRODUCT/COLLECTION GID, or free text for TYPE/VENDOR) plus a resolved display
// label and optional thumbnail, so the picker shows a rich chip rather than a raw
// id. ⚠️ Only `value` rides the dirty snapshot + Save payload; the rest is
// presentation.
export interface ScopeValueSeed {
  value: string;
  label: string;
  image: string | null;
}

// One EXCLUDE carve-out for the Settings-tab "Except these products" list. Only
// the GIDs ride the dirty snapshot + Save payload; label and image are
// presentation, mirroring the scope chip.
export interface ExcludeSeed {
  gid: string;
  label: string;
  image: string | null;
}

export interface UseRowEngineArgs {
  initialRows: EditorRow[];
  initialName: string;
  initialStatus: string;
  // The persisted assignment scope kind + its value SET. Reseeded on every
  // remount (Discard / create-on-save) so Discard reverts a scope change. The set
  // is homogeneous in `initialScope`: empty for NONE/ALL_PRODUCTS, one member for
  // TYPE/VENDOR, 1..N for PRODUCT/COLLECTION.
  initialScope: string;
  initialScopeValues: ScopeValueSeed[];
  initialExcludes: ExcludeSeed[];
  // Already RESOLVED by the loader: the server decodes the `TableStyling` row —
  // or its absence — into a complete `StylingValues` once, so the client never
  // handles raw DB columns. ⚠️ Not the same as `resetStyling`: Discard reverts to
  // the LAST SAVED styling, Reset goes to theme defaults.
  initialStyling: StylingValues;
  // The style-preset stamp, already normalized by the loader. ⚠️ PROVENANCE ONLY
  // — never re-read as a live link, so changing a bundle constant in a future
  // release cannot restyle an existing template (`data-model.md` §5).
  initialBasedOnPreset: string | null;
  // True only for the `/app/templates/new` sentinel mount. A stable per-mount
  // fact: after the first Save the URL flips to the real cuid and the engine
  // remounts with `isNew = false`, so the scaffold-replace fires at most once.
  isNew: boolean;
  // Remount the engine owner (parent bumps a key) so Discard resets the reducer to
  // the persisted rows — and reseeds name/status — without a dedicated reset action.
  onDiscard: () => void;
}

// 🔴 Polaris's `s-*` color tokens live inside each component's shadow DOM and are
// NOT exposed as light-DOM custom properties — `--p-color-*` / `--s-color-*` all
// resolve empty on the document, body, and even on `s-*` hosts. So the editor's
// scoped CSS cannot reference them directly.
//
// Instead, capture Polaris's own link color once from a throwaway `<s-link>`'s
// shadow and publish it as `--appx-token-color`: the shared accent for the
// active-cell outline, the active-row highlight and the checkbox `accent-color`.
// Keeps the blue a genuine Polaris value with no hardcoded hex, degrading to
// `currentColor` if the read fails.
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
  initialScope,
  initialScopeValues,
  initialExcludes,
  initialStyling,
  initialBasedOnPreset,
  isNew,
  onDiscard,
}: UseRowEngineArgs) {
  const [rows, dispatch] = useReducer(rowsReducer, initialRows);
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  // Multi-select for bulk delete (feature 29). KEPT SEPARATE from `activeRowId`:
  // `activeRowId` is single-focus (caret / insert-after-active / scroll), while
  // `selectedRowIds` is an orthogonal Set of rows ticked for a bulk action, so the
  // two never interfere. Reseeds empty on every remount (Discard / create-on-save).
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(
    () => new Set(),
  );
  const atCap = rows.length >= MAX_TEMPLATE_ROWS;
  useCapturedTokenColor();
  const shopify = useAppBridge();

  // Template-level editable fields tracked alongside rows in the dirty model
  // (feature 20). `name` has a setter wired to the header Rename action; `status`
  // gained its setter in feature 36 (the editor Settings tab). Both ride the dirty
  // snapshot, so changing either flips isDirty + opens the SaveBar; Save persists
  // them (and re-syncs the metaobject). Both reseed from props on remount (the
  // engine owner is keyed on `${id}:${nonce}`), so Discard reverts a change.
  const [name, setName] = useState(initialName);
  const [status, setStatus] = useState(initialStatus);

  // Table styling (feature 57 Step 5). ONE state cell holding the WHOLE resolved
  // value — never a cell per knob. That is what keeps the Save payload a
  // whole-value replace (the server has no field-level patch API by design, see
  // Step 4) and what lets Steps 8/10 add the remaining ~19 controls without
  // touching the engine again: they all go through `setStylingField`.
  const [styling, setStyling] = useState<StylingValues>(initialStyling);

  // A SECOND cell rather than another styling field, because it is not styling:
  // not in `STYLING_FIELD_NAMES`, emits no CSS, never reaches the storefront.
  // Folding it into `styling` would push it through `serializeStylingOverrides`
  // and into the metaobject.
  const [basedOnPreset, setBasedOnPreset] = useState<string | null>(
    initialBasedOnPreset,
  );

  // The ONE mutator every Style-tab control calls. Generic over the field so the
  // value type is checked against that field's type at the call site — a control
  // cannot write "STRIPES" into `density`. No knob gets a bespoke setter.
  //
  // ⚠️ It deliberately LEAVES `basedOnPreset` ALONE. That is not an omission —
  // the stamp is PROVENANCE, not a live link: it records which card the template
  // was created from, and tuning a knob afterwards does not change where the
  // merchant started. Clearing it here would erase that history on the first
  // edit and make the column answer a different question than it was added for.
  const setStylingField = useCallback(
    <K extends keyof StylingValues>(field: K, value: StylingValues[K]) => {
      setStyling((previous) => ({ ...previous, [field]: value }));
    },
    [],
  );

  // 🚫 There is deliberately NO `applyStylePreset` mutator. Presets are
  // CREATE-TIME ONLY: a pattern is chosen at `/app/templates/choose-style` and
  // applied by the `/new?style=` LOADER before the engine mounts. If a later phase
  // reopens in-editor picking, add it back as ONE action that moves BOTH cells —
  // the values must never be able to disagree with the stamp.

  // Reset to theme defaults. A WHOLESALE replace, not a loop over
  // `setStylingField` — per-field writes would be one render and dirty-check
  // each. The target is `DEFAULT_STYLING_VALUES`, the same constant the loader
  // resolves an ABSENT `TableStyling` row into, so reset state and never-styled
  // state are identical by construction, and it needs no server work: an
  // all-default value serializes to `{}`.
  //
  // Clears the stamp too: reset is the ONE edit that is not tuning — it discards
  // the pattern itself, so its provenance is genuinely gone. Reset and the "Blank"
  // card must be indistinguishable afterwards.
  const resetStyling = useCallback(() => {
    setStyling(DEFAULT_STYLING_VALUES);
    setBasedOnPreset(null);
  }, []);

  // Assignment scope: the picker kind and its value SET. ⚠️ `setScopeKind` RESETS
  // the set — a product GID is meaningless for a VENDOR scope, which is the
  // homogeneous-kind invariant.
  const [scope, setScopeKindState] = useState(initialScope);
  const [scopeValues, setScopeValuesState] =
    useState<ScopeValueSeed[]>(initialScopeValues);
  const setScopeKind = useCallback((kind: string) => {
    setScopeKindState(kind);
    setScopeValuesState([]);
  }, []);
  const setScopeValues = useCallback((next: ScopeValueSeed[]) => {
    setScopeValuesState(next);
  }, []);

  // EXCLUDE carve-outs. `excludes` is the ordered GID list that rides the dirty
  // snapshot + Save payload; the label/image maps are presentation-only. Shown
  // only under the ALL_PRODUCTS scope, but the state is unconditional so
  // Discard/seed round-trips cleanly.
  const [excludes, setExcludeGids] = useState<string[]>(() =>
    initialExcludes.map((e) => e.gid),
  );
  const [excludeLabels, setExcludeLabels] = useState<Record<string, string>>(
    () => Object.fromEntries(initialExcludes.map((e) => [e.gid, e.label])),
  );
  const [excludeImages, setExcludeImages] = useState<
    Record<string, string | null>
  >(() => Object.fromEntries(initialExcludes.map((e) => [e.gid, e.image])));
  const setExcludes = useCallback((next: ExcludeSeed[]) => {
    setExcludeGids(next.map((e) => e.gid));
    setExcludeLabels(Object.fromEntries(next.map((e) => [e.gid, e.label])));
    setExcludeImages(Object.fromEntries(next.map((e) => [e.gid, e.image])));
  }, []);
  // Client mirror of the value-required rule (UX only; the server re-validates).
  // A valued kind with an empty set is incomplete, NOT a clear — Save stays
  // disabled until it is completed or set back to "None".
  const scopeComplete = isScopeSetComplete(
    scope,
    scopeValues.map((item) => item.value),
  );

  // --- Drag reorder ---------------------------------------------------------
  // Two sensors on one DndContext: a PointerSensor with a small activation
  // distance so a click on the ⠿ handle is not mistaken for a drag, and a
  // KeyboardSensor for arrow-key stepping. Both produce the SAME onDragEnd, so
  // the keyboard drop reuses the MOVE_ROW path unchanged.
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

  // Screen-reader announcements for the keyboard drag; dnd-kit renders the hidden
  // live region. ⚠️ The callbacks read CURRENT rows via a ref so they never close
  // over a stale array.
  const rowsRef = useRef(rows);
  rowsRef.current = rows;
  // Mirrored into a ref so the paste closure reads the LIVE selection without
  // depending on `activeRowId`, keeping `pasteGrid` stable across selection
  // changes.
  const activeRowIdRef = useRef(activeRowId);
  activeRowIdRef.current = activeRowId;
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

  // --- Save -----------------------------------------------------------------
  // Persist rows, name and status to Postgres + the storefront metaobject via the
  // route action. ⚠️ Sends JSON so the structured `valueParts` survive — FormData
  // would stringify them.
  const saveFetcher = useFetcher<typeof templateAction>();
  const revalidator = useRevalidator();
  const saving = saveFetcher.state !== "idle";
  // 🔴 Mirrored into a ref so deferred callbacks read the LIVE save state. The
  // Undo toast's `onAction` is registered with the admin chrome and outlives the
  // render that showed it, so a plain `saving` closure would be stale (always
  // false) — letting Undo mutate rows during a save started AFTER the toast.
  const savingRef = useRef(saving);
  savingRef.current = saving;

  // A blocked activation is discovered server-side on Save; these conflicts are
  // held so the SettingsTab can render a persistent banner naming the colliding
  // templates, not just a fleeting toast. Cleared on a successful save and when
  // the merchant edits the pending scope/status.
  const [conflicts, setConflicts] = useState<
    Array<{ templateId?: string; templateName?: string; reason: string }>
  >([]);

  // Dirty-tracking against the last-saved baseline. The baseline is a
  // META-SNAPSHOT of every editable surface — the row array, the template
  // name/status, the assignment scope (feature 44), AND the table styling
  // (feature 57 Step 5) — so a rename, a status change, a scope change, or a
  // styling change each flips isDirty and opens the SaveBar, not just a row edit
  // (feature 20).
  //
  // ⚠️ The serialization lives in the pure `editorMetaSnapshot` and is called
  // again verbatim in `handleSave` — one function, two call sites, so the
  // baseline and the submitted snapshot cannot drift apart.
  const currentMetaJson = editorMetaSnapshot({
    rows,
    name,
    status,
    scope,
    scopeValues: scopeValues.map((item) => item.value),
    excludes,
    styling,
    basedOnPreset,
  });
  const metaJsonRef = useRef(currentMetaJson);
  metaJsonRef.current = currentMetaJson;
  const [savedMetaJson, setSavedMetaJson] = useState(currentMetaJson);
  const isDirty = currentMetaJson !== savedMetaJson;

  // Snapshot of the meta-JSON actually sent to the server, captured at click
  // time. The completion effect resets the dirty baseline to THIS value, never to
  // the live state — so any edit made while the save is in flight stays dirty (the
  // save bar remains open) instead of being silently marked saved and dropped.
  // The editor is also frozen during the save (see SpecTableEditor), making this
  // defense in depth against the edit-during-save race.
  const submittedMetaJsonRef = useRef<string | null>(null);

  const handleSave = useCallback(() => {
    if (saveFetcher.state !== "idle") return; // a save is already in flight
    if (!scopeComplete) return; // an incomplete scope is not submittable (Save is disabled)
    // The cast satisfies `SubmitTarget`, which the `EditorRow` union does not
    // match structurally (interfaces carry no implicit index signature).
    const scopeValuesPayload = scopeValues.map((item) => item.value);
    submittedMetaJsonRef.current = editorMetaSnapshot({
      rows,
      name,
      status,
      scope,
      scopeValues: scopeValuesPayload,
      excludes,
      styling,
      basedOnPreset,
    });
    saveFetcher.submit(
      {
        rows,
        name,
        status,
        scope,
        scopeValues: scopeValuesPayload,
        excludes,
        // The OVERRIDES-ONLY wire shape, not the resolved value: an all-default
        // table sends `{}`, which the server writes as an all-NULL row, so
        // resetting a knob genuinely CLEARS the stored override.
        styling: serializeStylingOverrides(styling),
        // Sent raw; the server re-validates with `normalizeStylePresetStamp`, so
        // an unknown id stores NULL rather than junk. ⚠️ The server reads an
        // ABSENT stamp as `null`, so this key must always ride alongside
        // `styling`.
        basedOnPreset,
      } as unknown as Parameters<typeof saveFetcher.submit>[0],
      { method: "post", encType: "application/json" },
    );
  }, [
    saveFetcher,
    rows,
    name,
    status,
    scope,
    scopeValues,
    excludes,
    styling,
    basedOnPreset,
    scopeComplete,
  ]);

  const handleDiscard = useCallback(() => {
    // Clear dirty immediately (hides the bar), then remount to the persisted
    // state (rows + name + status).
    setSavedMetaJson(metaJsonRef.current);
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
      // A successful save clears any prior conflict banner (feature 44).
      setConflicts([]);
      // Reset the baseline to exactly what was persisted (the submitted
      // snapshot), NOT the live state — otherwise an edit made during the
      // in-flight save would be marked saved and lost. Falls back to the live
      // snapshot if the submitted one is somehow missing.
      setSavedMetaJson(submittedMetaJsonRef.current ?? metaJsonRef.current);
      revalidator.revalidate();
      // Both storefront-delivery writes are best-effort (Postgres holds the
      // durable save); surface whichever warned. `routingError` only appears when
      // the save changed the ACTIVE set (feature 42).
      const deliveryWarning = data.syncError ?? data.routingError;
      if (deliveryWarning) {
        shopify.toast.show(deliveryWarning, { isError: true });
      } else {
        shopify.toast.show("Saved");
      }
    } else {
      // On a blocked activation (feature 42/44) capture the structured conflicts
      // for the rich banner; other failures carry none. The toast fires either way
      // as a fallback / for non-block errors.
      setConflicts(
        "blocked" in data && data.blocked && "conflicts" in data
          ? data.conflicts
          : [],
      );
      shopify.toast.show(data.error ?? "Could not save template", {
        isError: true,
      });
    }
  }, [saveFetcher.state, saveFetcher.data, revalidator, shopify]);

  // Clear the conflict banner once the merchant edits the pending state it was
  // reported against — the banner describes a specific combination, so any change
  // to it makes the banner stale. `scopeValues` is state, so its identity changes
  // only on a real edit, never per render.
  useEffect(() => {
    setConflicts([]);
  }, [scope, scopeValues, status, excludes]);

  // 🔴 Close the body modals when a save begins. They portal their content —
  // including their primary buttons — into the admin chrome, OUTSIDE the editor's
  // inert freeze wrapper, so a save starting while one is open would leave that
  // button live: a path to mutate rows mid-save the freeze cannot reach. Clearing
  // `pendingPaste` also drops the captured rows so a reopen cannot re-apply a
  // stale paste.
  useEffect(() => {
    if (saving) {
      shopify.modal.hide(INSERT_FIELD_MODAL_ID);
      shopify.modal.hide(PASTE_CAP_MODAL_ID);
      shopify.modal.hide(BULK_DELETE_MODAL_ID);
      setPendingPaste(null);
    }
  }, [saving, shopify]);

  // --- Metafield definitions fetch ------------------------------------------
  // Fetched lazily from the `/app/metafield-definitions` resource route the FIRST
  // time the modal opens, then cached for the editor's lifetime.
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

  // --- Insert field modal: caret bridge -------------------------------------
  // ⚠️ `activeCaretRef` is NOT cleared when a value cell blurs, so tabbing to the
  // toolbar button keeps the saved selection — the canonical rich-text-toolbar
  // pattern. It IS cleared when a Label/Section field is focused.
  // `savedCaretRef` is the snapshot taken when the modal opens.
  const activeCaretRef = useRef<SavedCaret | null>(null);
  const savedCaretRef = useRef<SavedCaret | null>(null);
  const [hasActiveCaret, setHasActiveCaret] = useState(false);
  // The field picked in the modal; Insert is disabled while null. The
  // discriminated `kind` keeps the native and metafield lists mutually exclusive.
  // The modal is create-only — committing always splices a new token at the saved
  // caret.
  const [selection, setSelection] = useState<FieldSelection | null>(null);
  // Pure UI: filters which fields are rendered and never touches the selection,
  // so a selected field filtered out of view stays committable.
  const [searchQuery, setSearchQuery] = useState("");
  // Focused shortly after open, deliberately deferred past the modal's open
  // animation (see `focusSearchField`).
  const searchFieldRef = useRef<HTMLElementTagNameMap["s-search-field"] | null>(
    null,
  );
  // Caret positions queued for a value cell after a modal Insert, keyed by row id.
  // A ref-held Map so its identity is stable across renders and mutating it never
  // triggers one; the target ValueCell consumes it once in its reconcile effect.
  const pendingCaretByRowRef = useRef<Map<string, number>>(new Map());

  const onCaretChange = useCallback((rowId: string, offset: number | null) => {
    if (offset === null) {
      activeCaretRef.current = null;
      setHasActiveCaret(false);
    } else {
      activeCaretRef.current = { rowId, offset };
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

  // Shared post-delete cleanup for BOTH the single ✕ and the bulk delete, so the
  // two paths cannot drift: after rows leave the array, null out any active-row
  // or saved-caret state that pointed into the removed set, so the toolbar and
  // Insert-field gates can never target a row that no longer exists. `wasRemoved`
  // is a predicate over row ids (single delete → one id; bulk → a Set lookup).
  const cleanupAfterDelete = useCallback(
    (wasRemoved: (id: string) => boolean) => {
      setActiveRowId((current) =>
        current !== null && wasRemoved(current) ? null : current,
      );
      const caretRowId = activeCaretRef.current?.rowId;
      if (caretRowId !== undefined && wasRemoved(caretRowId)) {
        activeCaretRef.current = null;
        setHasActiveCaret(false);
      }
    },
    [],
  );

  const onDelete = useCallback(
    (id: string) => {
      dispatch({ type: "DELETE_ROW", id });
      cleanupAfterDelete((rowId) => rowId === id);
    },
    [cleanupAfterDelete],
  );

  // --- Multi-select + bulk delete (feature 29) -----------------------------
  const selectedCount = selectedRowIds.size;
  const allSelected = rows.length > 0 && selectedCount === rows.length;

  const toggleSelected = useCallback((id: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);
  // Reads the LIVE rows via the ref so the callback stays stable across selection
  // changes (it is fanned out to every row's checkbox indirectly, and the bar).
  const selectAll = useCallback(
    () => setSelectedRowIds(new Set(rowsRef.current.map((r) => r.id))),
    [],
  );
  const clearSelection = useCallback(() => setSelectedRowIds(new Set()), []);

  // Keep the selection pruned to LIVE row ids after any structural edit. Delete
  // clears it outright, but a paste-replace (new-template scaffold swap) or a
  // single ✕ on a selected row can leave a dangling id; pruning here keeps the
  // "N selected" count and `allSelected` honest, and returns the SAME Set when
  // nothing changed so it never forces a needless re-render of the rows.
  useEffect(() => {
    setSelectedRowIds((prev) => {
      if (prev.size === 0) return prev;
      const live = new Set(rows.map((r) => r.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (live.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : prev;
    });
  }, [rows]);

  // Apply the bulk delete: one DELETE_ROWS step, shared cleanup so the active-row
  // / Insert-field gates can't point at a deleted row, clear the selection, toast
  // the count. Guards on `saving` — the editor is frozen during a save, and this
  // can be reached from the modal's Confirm, which portals outside that freeze.
  const handleDeleteSelected = useCallback(() => {
    if (saving) return;
    const ids = [...selectedRowIds];
    if (ids.length === 0) return;
    // Capture the live pre-delete array BEFORE dispatching, so the Undo toast can
    // restore the exact rows (same id / key / valueParts / order). The reducer
    // never mutates `rows` in place, so this reference stays a valid snapshot even
    // after DELETE_ROWS swaps in a new array (feature 33).
    const snapshot = rowsRef.current;
    dispatch({ type: "DELETE_ROWS", ids });
    const removed = new Set(ids);
    cleanupAfterDelete((rowId) => removed.has(rowId));
    clearSelection();
    const n = ids.length;
    const word = n === 1 ? "row" : "rows";
    // The "Undo" toast portals to the admin chrome, OUTSIDE the editor's inert
    // freeze (like the modals), so re-guard on the LIVE save state via savingRef
    // — the toast can outlive its showing render, so a plain `saving` closure here
    // would be stale. RESTORE_ROWS returns the exact snapshot array, so isDirty (a
    // JSON compare) flips back precisely: not dirty if the pre-delete state was the
    // saved baseline, still dirty if it was already dirty.
    shopify.toast.show(`Deleted ${n} ${word}`, {
      duration: 10000,
      action: "Undo",
      onAction: () => {
        if (savingRef.current) return;
        dispatch({ type: "RESTORE_ROWS", rows: snapshot });
        shopify.toast.show(`Restored ${n} ${word}`);
      },
    });
  }, [saving, selectedRowIds, cleanupAfterDelete, clearSelection, shopify]);

  // Entry point from the bulk bar's Delete: 1–2 rows apply immediately (a
  // deliberate small action), 3+ (and Select all → Delete) confirm first.
  const requestDeleteSelected = useCallback(() => {
    if (saving || selectedCount === 0) return;
    if (selectedCount >= BULK_DELETE_CONFIRM_THRESHOLD) {
      shopify.modal.show(BULK_DELETE_MODAL_ID);
    } else {
      handleDeleteSelected();
    }
  }, [saving, selectedCount, shopify, handleDeleteSelected]);

  const handleConfirmBulkDelete = useCallback(() => {
    shopify.modal.hide(BULK_DELETE_MODAL_ID);
    // Re-guard on `saving`: the modal portals outside the editor's inert freeze,
    // so Continue must not mutate rows mid-save (defense in depth alongside the
    // hide-on-save effect and the guard inside handleDeleteSelected).
    if (!saving) handleDeleteSelected();
  }, [shopify, saving, handleDeleteSelected]);

  const handleCancelBulkDelete = useCallback(() => {
    // Hide only; deletes nothing, selection preserved.
    shopify.modal.hide(BULK_DELETE_MODAL_ID);
  }, [shopify]);

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

  // Open the modal, snapshotting the current value-cell caret first. Runs on the
  // button's click while the cell still holds the saved selection (value-cell blur
  // does not clear activeCaretRef), so the snapshot is always valid. Resets the
  // selection so a prior pick can't leak in.
  // Focus the modal's search field after it is open. App Bridge plays a view
  // transition when the modal shows; calling .focus() while that transition is
  // mid-flight aborts it (an "InvalidStateError: Transition was aborted" surfaces
  // in the admin console), so we defer past the animation. The modal's own focus
  // trap lands on the close button first; this moves it to the search field so
  // the merchant can type straight away.
  const focusSearchField = useCallback(() => {
    setTimeout(() => searchFieldRef.current?.focus(), MODAL_TRANSITION_MS);
  }, []);

  const handleOpenInsertField = useCallback(() => {
    savedCaretRef.current = activeCaretRef.current;
    if (!savedCaretRef.current) return;
    setSelection(null);
    setSearchQuery("");
    ensureMetafieldDefinitions();
    shopify.modal.show(INSERT_FIELD_MODAL_ID);
    focusSearchField();
  }, [shopify, focusSearchField, ensureMetafieldDefinitions]);

  // `onInput` fires per keystroke, before `onChange`, so the list filters live.
  const handleSearchInput = useCallback((event: Event) => {
    const value = (event.currentTarget as unknown as { value?: string }).value;
    setSearchQuery(value ?? "");
  }, []);

  // Setting a native kind empties the metafield list's controlled values, so
  // picking a native field deselects any metafield.
  const handleSelectNative = useCallback((event: Event) => {
    const values = (event.currentTarget as unknown as { values?: string[] })
      .values;
    if (values && values.length > 0) {
      setSelection({ kind: "native", field: values[0] });
    }
  }, []);

  // ⚠️ The picked value is a `namespace.key`; decode it by LOOKUP in the loaded
  // list, never by string-splitting, so a `.` in a key cannot corrupt the pair.
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

  // Splice the field's token into the value string at the saved offset, reparse,
  // and replace the whole value. The caret lands just after the inserted token.
  const handleCommit = useCallback(() => {
    if (saving) return; // a save is in flight — the editor is frozen
    if (!selection) return; // primary button is disabled in this state
    shopify.modal.hide(INSERT_FIELD_MODAL_ID);

    const saved = savedCaretRef.current;
    if (saved) {
      const row = rows.find((r) => r.id === saved.rowId);
      if (row && row.rowType === "DATA") {
        // The trailing space lets the merchant keep typing without abutting the
        // token; the caret lands after both.
        const token =
          selection.kind === "native"
            ? formatFieldToken(selection.field)
            : formatMetafieldToken(selection.namespace, selection.key);
        const current = partsToText(row.valueParts);
        const offset = Math.min(saved.offset, current.length);
        const insert = `${token} `;
        const nextText =
          current.slice(0, offset) + insert + current.slice(offset);
        pendingCaretByRowRef.current.set(saved.rowId, offset + insert.length);
        dispatch({
          type: "SET_VALUE_PARTS",
          id: saved.rowId,
          valueParts: textToParts(nextText),
        });
      }
    }

    savedCaretRef.current = null;
    setSelection(null);
    setSearchQuery("");
  }, [rows, saving, selection, shopify]);

  const handleCancelInsertField = useCallback(() => {
    shopify.modal.hide(INSERT_FIELD_MODAL_ID);
    savedCaretRef.current = null;
    setSelection(null);
    setSearchQuery("");
  }, [shopify]);

  // --- Bulk table paste → rows ----------------------------------------------
  // A multi-cell table pasted into the editor becomes rows: first column → Label,
  // remaining columns → a TEXT/LINE_BREAK Value, inserted via PASTE_ROWS with the
  // row cap enforced. The block lands after the active row (appending when there
  // is none) — EXCEPT on a brand-new template still showing the untouched starter
  // scaffold, where the first bulk paste REPLACES it. A paste that would cross the
  // cap asks for confirmation rather than silently dropping the overflow.

  // Null unless the confirmation modal is open with a paste staged.
  const [pendingPaste, setPendingPaste] = useState<PendingPaste | null>(null);

  // Apply a prepared paste. Shared by the fits-immediately and post-confirmation
  // paths so the dispatch, focus affordance and toast live in one place.
  const applyPaste = useCallback(
    (prepared: PendingPaste) => {
      dispatch(
        prepared.replace
          ? { type: "PASTE_ROWS", rows: prepared.pasted, replace: true }
          : {
              type: "PASTE_ROWS",
              rows: prepared.pasted,
              afterId: prepared.afterId,
            },
      );

      // Set the last inserted row active and scroll it into view, so the merchant
      // sees where the block landed and a second paste stacks under it.
      const lastId = prepared.pasted[prepared.pasted.length - 1]?.id;
      if (lastId) {
        scrollTargetRef.current = lastId;
        setActiveRowId(lastId);
      }

      const added = prepared.pasted.length;
      const rowWord = added === 1 ? "row" : "rows";
      if (prepared.dropped > 0) {
        const droppedWord = prepared.dropped === 1 ? "row" : "rows";
        shopify.toast.show(
          `Added ${added} ${rowWord} — ${prepared.dropped} ${droppedWord} didn't fit (${MAX_TEMPLATE_ROWS}-row limit)`,
        );
      } else {
        shopify.toast.show(`Added ${added} ${rowWord}`);
      }
    },
    [shopify],
  );

  // Prepare a bulk paste from a normalized grid, cap it to the room remaining, and
  // either apply it or stage it for confirmation. Reads the refs rather than
  // `rows`/`activeRowId`, so the closure stays stable across selection changes.
  // Exposed as `onBulkPaste` so the value cell can route a table here instead of
  // flattening it.
  const pasteGrid = useCallback(
    (grid: string[][]) => {
      // On a brand-new template still showing the untouched scaffold, the first
      // bulk paste REPLACES it — so room is computed against an empty base,
      // matching the reducer's base-`[]` replace path.
      const replace = isNew && isPristineScaffold(rowsRef.current);
      const room = replace
        ? MAX_TEMPLATE_ROWS
        : MAX_TEMPLATE_ROWS - rowsRef.current.length;
      if (room <= 0) {
        // Already full, so there is no "continue" choice to offer.
        shopify.toast.show(
          `This template is full (${MAX_TEMPLATE_ROWS} rows). Delete a row before pasting.`,
          { isError: true },
        );
        return;
      }

      const built = gridToPastedRows(grid);
      const toInsert = built.slice(0, room);
      const dropped = built.length - toInsert.length;
      const pasted = toInsert.map((row) => ({ id: newRowId(), ...row }));
      const prepared: PendingPaste = {
        pasted,
        dropped,
        replace,
        afterId: activeRowIdRef.current,
      };

      // A paste that would cross the cap waits for confirmation; one that fits
      // inserts immediately.
      if (dropped > 0) {
        setPendingPaste(prepared);
        shopify.modal.show(PASTE_CAP_MODAL_ID);
        return;
      }
      applyPaste(prepared);
    },
    [shopify, isNew, applyPaste],
  );

  // Apply exactly what the modal previewed, then close and clear. ⚠️ Guarded on
  // `saving`: the modal portals outside the editor's inert freeze, so a save
  // starting while it is open must not let Continue mutate rows mid-save.
  const handleConfirmPaste = useCallback(() => {
    shopify.modal.hide(PASTE_CAP_MODAL_ID);
    if (pendingPaste && !saving) applyPaste(pendingPaste);
    setPendingPaste(null);
  }, [shopify, saving, pendingPaste, applyPaste]);

  const handleCancelPaste = useCallback(() => {
    shopify.modal.hide(PASTE_CAP_MODAL_ID);
    setPendingPaste(null);
  }, [shopify]);

  // 🔴 Content-first intent: the bulk-vs-in-cell decision comes from the clipboard
  // SHAPE, not where focus is. The value cell handles its own paste and always
  // preventDefaults, so a value-cell paste arrives here defaultPrevented. For
  // every other target only a genuine multi-cell table is a bulk gesture; a lone
  // value falls through to the native paste, which is why a focused button or the
  // grey margin no longer triggers a surprise insert.
  const handleContainerPaste = useCallback(
    (event: ClipboardEvent<HTMLDivElement>) => {
      const data = event.clipboardData;
      if (!data) return; // no clipboard payload (e.g. a programmatic paste)
      if (event.defaultPrevented) return; // the value cell already handled this
      // The Insert-field modal's <s-search-field> is a field PICKER, not table
      // data. In this App Bridge build it renders inside the editor wrapper, so
      // its paste bubbles here (file 21 assumed it portaled out — browser-verified
      // false). A table pasted to filter that field list must not bulk-create
      // rows, so skip it. This is the ONLY target guard kept from Step 13; the
      // value-cell / label-input / contenteditable skips were intentionally
      // dropped so a table bulk-inserts from those (file 21, content-first).
      if ((event.target as Element | null)?.closest?.("s-search-field")) return;
      // The VALUE CELL is the sole authority for its own paste (feature 115). It
      // consumes a multi-COLUMN table itself (preventDefault + onBulkPaste) and
      // deliberately lets everything else — including plain multi-line text —
      // fall through to its native textarea paste, so the lines become one
      // multiline value. Without this skip that fall-through would arrive here
      // still un-prevented, `cellCount > 1` would call it a table, and we would
      // bulk-insert rows anyway — re-creating the exact bug feature 115 fixes.
      // (For the table case this is a no-op: the value cell already
      // preventDefaulted, so the `defaultPrevented` return above catches it.)
      if ((event.target as Element | null)?.closest?.("[data-value-cell]")) {
        return;
      }
      const grid = readClipboardGrid(data);
      // A bulk gesture needs a real multi-cell table; a lone value falls through
      // to the native input paste.
      if (cellCount(grid) <= 1) return;
      // Consuming the table also stops the native flatten into a Label input.
      event.preventDefault();
      pasteGrid(grid);
    },
    [pasteGrid],
  );

  const canDuplicate = activeRowId !== null && !atCap;
  // Cheap over this many entries, so computed inline rather than memoized.
  const visibleFields = filterNativeFields(searchQuery);

  // `data` is undefined until the first load resolves; treat that — and any
  // non-idle state, including a Retry still holding stale data — as loading.
  const metafieldsData = metafieldsFetcher.data;
  const metafieldsLoading =
    metafieldsFetcher.state !== "idle" || metafieldsData === undefined;
  const metafieldDefinitions =
    metafieldsData && metafieldsData.ok ? metafieldsData.definitions : [];
  const metafieldCount = metafieldDefinitions.length;
  // Filtered by the same shared rule as the native list above.
  const visibleMetafields = filterMetafieldDefinitions(
    metafieldDefinitions,
    searchQuery,
  );
  // Shown only when a query filters BOTH lists to nothing, so the merchant never
  // sees two "no match" messages.
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
    // Template-level fields
    name,
    setName,
    status,
    setStatus,
    // Assignment scope
    scope,
    scopeValues,
    setScopeKind,
    setScopeValues,
    scopeComplete,
    conflicts,
    // EXCLUDE carve-outs
    excludes,
    excludeLabels,
    excludeImages,
    setExcludes,
    // Table styling. Read by StyleTab and the device previews — and by NOTHING
    // else: 🚫 the editing grid deliberately never reflects merchant styling
    // (`context/features/67-…`).
    styling,
    setStylingField,
    // Wholesale reset to theme defaults, behind a confirm dialog.
    resetStyling,
    // Provenance stamp. Read by NO component — it exists to ride the dirty
    // snapshot and the Save payload, which is its whole write path. Presets are
    // create-time only, so there is nothing here for a merchant to pick.
    basedOnPreset,
    // Save / dirty
    isDirty,
    saving,
    // Blocked while a scope is incomplete, so an invalid assignment cannot be
    // submitted.
    canSave: !saving && scopeComplete,
    handleSave,
    handleDiscard,
    // Caret bridge / modal state
    hasActiveCaret,
    selection,
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
    // Multi-select bulk delete
    selectedRowIds,
    selectedCount,
    allSelected,
    toggleSelected,
    selectAll,
    clearSelection,
    requestDeleteSelected,
    handleConfirmBulkDelete,
    handleCancelBulkDelete,
    // Modal handlers
    handleOpenInsertField,
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
    onBulkPaste: pasteGrid,
    // Over-cap paste confirmation
    pendingPaste,
    handleConfirmPaste,
    handleCancelPaste,
  };
}

export type RowEngine = ReturnType<typeof useRowEngine>;
