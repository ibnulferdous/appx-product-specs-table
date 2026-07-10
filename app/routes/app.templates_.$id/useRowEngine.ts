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
import { cellCount, gridToPastedRows } from "../../utils/clipboardTable";
import { readClipboardGrid } from "../../utils/clipboardTableDom";
import { isScopeComplete } from "../../utils/assignmentScope";
import {
  BULK_DELETE_CONFIRM_THRESHOLD,
  BULK_DELETE_MODAL_ID,
  INSERT_FIELD_MODAL_ID,
  MODAL_TRANSITION_MS,
  PASTE_CAP_MODAL_ID,
  metafieldChoiceValue,
  partToSelection,
  type EditTarget,
  type FieldSelection,
  type SavedCaret,
} from "./editorShared";

// A bulk paste that would cross the 200-row cap, captured for the confirmation
// modal (feature 24). The rows are already TRUNCATED to what fits and id-stamped,
// so confirming applies exactly what the modal previewed; `dropped` is what won't
// fit. `replace`/`afterId` carry the file-23/file-22 dispatch decision unchanged.
interface PendingPaste {
  pasted: Array<{ id: string; label: string; valueParts: ValuePart[] }>;
  dropped: number;
  replace: boolean;
  afterId: string | null;
}

// The template's assignment scope kind + value seeded from the loader (feature
// 44). `scope` is the picker-kind ("NONE" when the template has no INCLUDE rule,
// else a real AssignmentScope); `scopeValue` is the GID / free-text the rule
// carries (null for NONE / ALL_PRODUCTS); `scopeValueLabel` is the resolved
// display title for a PRODUCT/COLLECTION GID (falls back to the GID) so the picker
// shows a readable chip, not a raw id.
export interface ScopeSeed {
  scope: string;
  scopeValue: string | null;
  scopeValueLabel: string | null;
}

// One EXCLUDE carve-out for the Settings-tab "Except these products" list (feature
// 45): the excluded product's GID plus its resolved display title (falls back to
// the GID). Only the GIDs ride the dirty snapshot + Save payload; the label is
// presentation, mirroring the scope chip's `scopeValueLabel`.
export interface ExcludeSeed {
  gid: string;
  label: string;
}

export interface UseRowEngineArgs {
  initialRows: EditorRow[];
  initialName: string;
  initialStatus: string;
  // The persisted assignment scope (feature 44). Seeds the Settings-tab picker and
  // rides the dirty snapshot + Save payload exactly like `status`. Reseeded on
  // every remount (Discard / create-on-save) so Discard reverts a scope change.
  initialScope: string;
  initialScopeValue: string | null;
  initialScopeValueLabel: string | null;
  // The persisted EXCLUDE carve-outs (feature 45), seeded from the loader as
  // `{ gid, label }` pairs. Rides the dirty snapshot + Save payload like `scope`;
  // reseeded on every remount so Discard reverts an exclude change.
  initialExcludes: ExcludeSeed[];
  // True only for the `/app/templates/new` sentinel mount (route.tsx). A stable
  // per-mount fact: after the first Save the URL flips to the real cuid and the
  // engine remounts with `isNew = false`, so the scaffold-replace (file 23) can
  // fire at most once. Read in `pasteGrid` to gate the pristine-scaffold replace.
  isNew: boolean;
  // Remount the engine owner (parent bumps a key) so Discard resets the reducer to
  // the persisted rows — and reseeds name/status — without a dedicated reset action.
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
  initialScope,
  initialScopeValue,
  initialScopeValueLabel,
  initialExcludes,
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

  // Assignment scope (feature 44). Three pieces of state: the picker kind
  // (`scope`), the persisted value (`scopeValue` — a GID for PRODUCT/COLLECTION,
  // free text for TYPE/VENDOR, null for NONE/ALL_PRODUCTS), and a display-only
  // `scopeValueLabel` (the resolved resource title for a GID). Only scope +
  // scopeValue ride the dirty snapshot / Save payload; the label is presentation.
  // `setScope` replaces all three atomically so the SettingsTab can change the
  // kind (resetting value + label) or set a value (keeping the kind) in one call.
  const [scope, setScopeKind] = useState(initialScope);
  const [scopeValue, setScopeValue] = useState<string | null>(
    initialScopeValue,
  );
  const [scopeValueLabel, setScopeValueLabel] = useState<string | null>(
    initialScopeValueLabel,
  );
  const setScope = useCallback((next: ScopeSeed) => {
    setScopeKind(next.scope);
    setScopeValue(next.scopeValue);
    setScopeValueLabel(next.scopeValueLabel);
  }, []);

  // EXCLUDE carve-outs (feature 45). `excludes` is the ordered GID list that rides
  // the dirty snapshot + Save payload; `excludeLabels` is a GID→title map for
  // readable chips (presentation only). `setExcludes` replaces both from a
  // `{ gid, label }[]` (the SettingsTab builds the new list on add/remove). Shown
  // only under the ALL_PRODUCTS scope (SettingsTab gates the control), but the
  // state is unconditional so Discard/seed round-trips cleanly.
  const [excludes, setExcludeGids] = useState<string[]>(() =>
    initialExcludes.map((e) => e.gid),
  );
  const [excludeLabels, setExcludeLabels] = useState<Record<string, string>>(
    () => Object.fromEntries(initialExcludes.map((e) => [e.gid, e.label])),
  );
  const setExcludes = useCallback((next: ExcludeSeed[]) => {
    setExcludeGids(next.map((e) => e.gid));
    setExcludeLabels(Object.fromEntries(next.map((e) => [e.gid, e.label])));
  }, []);
  // Client mirror of the value-required rule (UX only; the server re-validates):
  // an incomplete scope (e.g. PRODUCT kind with no product picked) is an invalid
  // state, so Save is disabled until it is completed or set back to "None".
  const scopeComplete = isScopeComplete(scope, scopeValue);

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
  // Mirror the active row id into a ref so the paste closure (file 22) can read
  // the LIVE selection without depending on `activeRowId` — keeping `pasteGrid`
  // stable across selection changes (memoization-safe), the same pattern as
  // `rowsRef`.
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

  // --- Save (Step 9.5) -----------------------------------------------------
  // Persist the row array (plus name + status, ridden along unchanged for now) to
  // Postgres + the storefront metaobject via the route action. The editor sends
  // JSON so the structured valueParts survive (FormData would stringify them).
  const saveFetcher = useFetcher<typeof templateAction>();
  const revalidator = useRevalidator();
  const saving = saveFetcher.state !== "idle";
  // Mirror `saving` into a ref so deferred callbacks read the LIVE save state, not
  // the value captured at the time they were created. The Undo toast's `onAction`
  // (feature 33) is registered with the admin chrome and outlives the render that
  // showed it, so a plain `saving` closure there would be stale (always the value
  // at toast-show time, i.e. false) — letting Undo mutate rows during an in-flight
  // save started AFTER the toast appeared. Reading `savingRef.current` keeps the
  // guard honest, the same pattern as `rowsRef` / `activeRowIdRef`.
  const savingRef = useRef(saving);
  savingRef.current = saving;

  // Rich conflict banner state (feature 44). A blocked activation is discovered
  // server-side on Save (feature 42's model returns `{ blocked, conflicts }`); we
  // hold those conflicts here so the SettingsTab can render a persistent critical
  // banner naming the colliding template(s), not just the fleeting error toast.
  // Cleared when a save succeeds (below) and when the merchant edits the pending
  // scope/status (the clearing effect further down) — so the banner never lingers
  // after the merchant has moved to resolve it.
  const [conflicts, setConflicts] = useState<
    Array<{ templateId?: string; templateName?: string; reason: string }>
  >([]);

  // Dirty-tracking against the last-saved baseline. The baseline is a
  // META-SNAPSHOT of every editable surface — the row array, the template
  // name/status, AND the assignment scope (feature 44) — so a rename, a status
  // change, or a scope change each flips isDirty and opens the SaveBar, not just a
  // row edit (feature 20). The key order is fixed so the JSON compare is stable.
  // Excludes are a SET (order is meaningless), so the snapshot sorts a copy — a
  // reorder alone never flips isDirty, only a real membership change does.
  const currentMetaJson = JSON.stringify({
    rows,
    name,
    status,
    scope,
    scopeValue,
    excludes: [...excludes].sort(),
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
    // The payload is valid JSON at runtime; the cast satisfies SubmitTarget,
    // which the EditorRow interface union does not match structurally (interfaces
    // carry no implicit index signature). name/status/scope are sent from STATE, so
    // a rename or a scope change rides the existing Save payload (the action reads
    // scope + scopeValue and persists the rule alongside the template — feature 44).
    submittedMetaJsonRef.current = JSON.stringify({
      rows,
      name,
      status,
      scope,
      scopeValue,
      excludes: [...excludes].sort(),
    });
    saveFetcher.submit(
      {
        rows,
        name,
        status,
        scope,
        scopeValue,
        excludes,
      } as unknown as Parameters<typeof saveFetcher.submit>[0],
      { method: "post", encType: "application/json" },
    );
  }, [
    saveFetcher,
    rows,
    name,
    status,
    scope,
    scopeValue,
    excludes,
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
  // reported against (scope kind, scope value, or status) — the banner describes a
  // specific pending combination, so any change to that combination makes it stale.
  // Runs on mount too, but conflicts starts empty so that first pass is a no-op.
  useEffect(() => {
    setConflicts([]);
  }, [scope, scopeValue, status, excludes]);

  // Close the editor's body modals when a save begins. Both portal their content
  // (including their primary buttons) into the admin chrome, OUTSIDE the editor's
  // inert freeze wrapper — exactly like the SaveBar — so a save that starts while
  // one is open would otherwise leave that button live, a path to mutate rows
  // mid-save that the freeze cannot reach. Hiding them here, plus the hard `saving`
  // guards in handleCommit / handleConfirmPaste, blocks both ends. Clearing
  // `pendingPaste` also drops the captured rows so a later reopen can't re-apply a
  // stale paste. Hiding an already-hidden modal is a no-op, so this is safe to run
  // on any render where a save is in flight.
  useEffect(() => {
    if (saving) {
      shopify.modal.hide(INSERT_FIELD_MODAL_ID);
      shopify.modal.hide(PASTE_CAP_MODAL_ID);
      shopify.modal.hide(BULK_DELETE_MODAL_ID);
      setPendingPaste(null);
    }
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
    setTimeout(() => searchFieldRef.current?.focus(), MODAL_TRANSITION_MS);
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
          // Drop a trailing space after the new pill (Claude-style smart-pill UX)
          // so the merchant can keep typing without it abutting the pill; the
          // caret lands after BOTH the pill and the space (+2: pill = 1 slot,
          // space = 1 slot).
          pendingCaretByRowRef.current.set(saved.rowId, saved.linear + 2);
          dispatch({
            type: "INSERT_VALUE_PART_AT",
            id: saved.rowId,
            partIndex,
            offset,
            part,
            spaceAfter: true,
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

  // --- Bulk table paste → rows (Steps 12–13, refined files 21–24) ----------
  // Capture a multi-cell table pasted into the editor (Excel / Google Sheets / a
  // web <table>), parse it to a 2-D grid (Step 12), and bulk-insert it as rows
  // (Step 13): first column → Label, remaining columns → a TEXT/LINE_BREAK Value
  // (`gridToPastedRows`), inserted via PASTE_ROWS with the 200-row cap enforced
  // on paste. The block lands directly after the active row (file 22; appends
  // when none) — EXCEPT on a brand-new template still showing the untouched
  // starter scaffold, where the first bulk paste REPLACES the whole scaffold
  // (file 23; the empty section + 5 blanks go, leaving only the pasted rows).
  // When the paste would cross the cap, the merchant is asked to confirm first
  // (file 24) instead of silently dropping the overflow.

  // The over-cap paste awaiting the merchant's confirmation (feature 24). Null
  // unless the confirmation modal is open with a paste staged.
  const [pendingPaste, setPendingPaste] = useState<PendingPaste | null>(null);

  // Apply a prepared paste: dispatch PASTE_ROWS, move the selection to the last
  // inserted row + scroll it into view, and toast the outcome. Shared by the
  // fits-immediately path and the post-confirmation path so the dispatch +
  // affordance + toast live in one place. `replace` → the pasted rows become the
  // whole array (reducer bases on `[]`, ignoring `afterId`); otherwise the block
  // is spliced directly after the active row (file 22; the reducer appends when
  // nothing is selected or the active row is gone).
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

      // Focus affordance: set the last inserted row active and scroll it into
      // view so the merchant sees where the pasted block landed (and a second
      // consecutive paste stacks right under the first block).
      const lastId = prepared.pasted[prepared.pasted.length - 1]?.id;
      if (lastId) {
        scrollTargetRef.current = lastId;
        setActiveRowId(lastId);
      }

      const added = prepared.pasted.length;
      const rowWord = added === 1 ? "row" : "rows";
      if (prepared.dropped > 0) {
        // The merchant already confirmed via the modal; this restates the outcome
        // in plain language (the old terse "N over the limit weren't added" copy
        // tested poorly with merchants).
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
  // either apply it (fits) or stage it for confirmation (would cross the cap,
  // file 24). Reads `rowsRef.current` / `activeRowIdRef.current`, so it needs no
  // `rows`/`activeRowId` dep — the closure stays stable across selection changes.
  // Exposed as `onBulkPaste` so the value cell can route a table here instead of
  // flattening it.
  const pasteGrid = useCallback(
    (grid: string[][]) => {
      // file 23: on a brand-new template whose rows are still the untouched
      // scaffold (1 section + 5 blanks), the first bulk paste REPLACES the whole
      // scaffold. Compute room/dropped against an empty base (`MAX_TEMPLATE_ROWS`,
      // matching the reducer's base-`[]` replace path); every other state keeps
      // the file-22 insert-after-active math (`MAX − current length`).
      const replace = isNew && isPristineScaffold(rowsRef.current);
      const room = replace
        ? MAX_TEMPLATE_ROWS
        : MAX_TEMPLATE_ROWS - rowsRef.current.length;
      if (room <= 0) {
        // Already full — nothing can be added, so there is no "continue" choice to
        // offer; just say so plainly.
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

      // file 24: a paste that would cross the cap waits for confirmation — show
      // the merchant how many rows fit vs. won't, and apply only on Continue. A
      // paste that fits within the cap inserts immediately, unchanged.
      if (dropped > 0) {
        setPendingPaste(prepared);
        shopify.modal.show(PASTE_CAP_MODAL_ID);
        return;
      }
      applyPaste(prepared);
    },
    [shopify, isNew, applyPaste],
  );

  // Continue an over-cap paste (feature 24): apply exactly what the modal
  // previewed (the truncated, id-stamped rows captured when it opened), then
  // close + clear. Guard on `saving` — the modal portals outside the editor's
  // inert freeze, so a save starting while it is open must not let Continue mutate
  // rows mid-save (defense in depth alongside the hide-on-save effect).
  const handleConfirmPaste = useCallback(() => {
    shopify.modal.hide(PASTE_CAP_MODAL_ID);
    if (pendingPaste && !saving) applyPaste(pendingPaste);
    setPendingPaste(null);
  }, [shopify, saving, pendingPaste, applyPaste]);

  const handleCancelPaste = useCallback(() => {
    shopify.modal.hide(PASTE_CAP_MODAL_ID);
    setPendingPaste(null);
  }, [shopify]);

  // Content-first intent (file 21): the bulk-vs-in-cell decision comes from the
  // clipboard SHAPE, not where focus is. The value cell already handles its own
  // paste (table → onBulkPaste, single value → text-at-caret) and always
  // preventDefaults, so a value-cell paste arrives here defaultPrevented and is
  // skipped. For every other target (a Label/Section <input>, a focused
  // button/handle, the inter-cell padding), only a genuine multi-cell table is a
  // bulk gesture; a lone value falls through to the native field/text paste. This
  // replaces the old focus/target skip-guard — which is why a focused button or
  // the grey margin no longer triggers a surprise insert.
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
      const grid = readClipboardGrid(data);
      // A bulk gesture needs an actual multi-cell table (>1 cell — more than one
      // row OR column); a lone value (or empty grid) is not. A single value
      // pasted into a Label/Section <input> falls through to the native input
      // paste; pasted with a button/padding focused, it does nothing.
      if (cellCount(grid) <= 1) return;
      // We are consuming a table now — this also stops the native flatten when a
      // table is pasted into a Label/Section <input>.
      event.preventDefault();
      pasteGrid(grid);
    },
    [pasteGrid],
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
    // Template-level fields (feature 20; status setter added feature 36)
    name,
    setName,
    status,
    setStatus,
    // Assignment scope (feature 44)
    scope,
    scopeValue,
    scopeValueLabel,
    setScope,
    scopeComplete,
    conflicts,
    // EXCLUDE carve-outs (feature 45)
    excludes,
    excludeLabels,
    setExcludes,
    // Save / dirty
    isDirty,
    saving,
    // Save is blocked while a scope is incomplete (an invalid state) — the SaveBar
    // primary button reads this so an incomplete assignment can't be submitted.
    canSave: !saving && scopeComplete,
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
    // Multi-select bulk delete (feature 29)
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
    onBulkPaste: pasteGrid,
    // Over-cap paste confirmation (feature 24)
    pendingPaste,
    handleConfirmPaste,
    handleCancelPaste,
  };
}

export type RowEngine = ReturnType<typeof useRowEngine>;
