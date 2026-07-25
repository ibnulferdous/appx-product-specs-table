import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { modalPreviewHeight, type DeviceView } from "./deviceView";
import { SegmentedControl, type SegOption } from "./SegmentedControl";
import { PREVIEW_MODAL_ID } from "./editorShared";

// Feature 75 — the full-size preview modal.
//
// THE BUG IT FIXES. `previewDeviceWidth("desktop")` is `"100%"`, so the inline
// "Desktop" preview is only as wide as the leftover editor column: viewport −
// admin chrome − the 18.75rem Style rail − `.stage`'s padding. On a laptop that
// lands UNDER the storefront stylesheet's 749px mobile breakpoint, so the
// Desktop preview honestly renders the STACKED layout — the merchant asks for
// desktop and sees mobile. This modal gives the same preview a width the admin
// column cannot constrain.
//
// It is a VERIFICATION surface, not an authoring one: the Style knobs stay in
// the rail behind it. The merchant's need is "a clear idea about the layout",
// which is a look-at-it task. Live styling still flows — the modal renders the
// same `preview` render prop the card does, off the same engine state, so a knob
// turned behind the overlay repaints it.
//
// 🚫 Do NOT "fix" the underlying bug by lowering the 749px breakpoint in
// `spec-table.css`. It is Dawn's mobile breakpoint, it is byte-drift-guarded by
// `specTableCssContract.test.ts`, and moving it would change what real shoppers
// see on real phones to work around an admin sizing problem.

// Devices only — `edit` is not a preview, and this surface has no editing to do.
// Labels are shown rather than icon-only (unlike the card's cramped control row):
// there is room here, and this control is the modal's only affordance besides
// Close, so it should read as words.
const MODAL_DEVICES: ReadonlyArray<SegOption<DeviceView>> = [
  { value: "desktop", label: "Desktop", icon: "desktop" },
  { value: "mobile", label: "Mobile", icon: "mobile" },
];

/**
 * The app iframe's viewport height, kept current across admin window resizes.
 *
 * `undefined` on the first render (there is no height before mount, and reading
 * `window` during render would break SSR), which `modalPreviewHeight` turns into
 * `null` → let CSS decide, exactly like every other pre-measurement path in the
 * preview pipeline.
 */
function useViewportHeight(): number | undefined {
  const [height, setHeight] = useState<number | undefined>(undefined);

  useEffect(() => {
    let frame = 0;
    const measure = () => {
      const next = window.innerHeight;
      setHeight((prev) => (prev === next ? prev : next));
    };
    // Coalesce a resize drag into one read per frame, after layout settles.
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };

    measure();
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  return height;
}

export function PreviewModal({
  device,
  onDeviceChange,
  preview,
}: {
  /** The SHARED preview device (`tabViewMemory`), not a modal-local copy. */
  device: DeviceView;
  onDeviceChange: (next: DeviceView) => void;
  /** The same render prop the card's stage uses — see `EditorShellProps`. */
  preview?: (
    view: DeviceView,
    options?: { availableHeight?: number },
  ) => ReactNode;
}) {
  // `<s-modal>` keeps its children in the DOM while hidden, so rendering the
  // preview unconditionally would run a SECOND full storefront document forever —
  // rebuilding its `srcDoc` on every keystroke in the editor behind it. Gate on
  // the modal's own lifecycle callbacks so the extra iframe exists only while the
  // merchant is actually looking at it. `onAfterHide` (not `onHide`) so the
  // unmount lands after the exit animation, and it fires for Esc and backdrop
  // dismiss too — not just the header's ✕.
  const [isOpen, setIsOpen] = useState(false);

  const viewportHeight = useViewportHeight();
  const availableHeight = modalPreviewHeight(viewportHeight);

  return (
    <s-modal
      id={PREVIEW_MODAL_ID}
      heading="Storefront preview"
      // Edge-to-edge: the preview supplies its own `.stage` padding and device
      // chrome, and every pixel of modal padding is width the desktop mockup
      // does not get — which is the entire point of this surface.
      padding="none"
      // The widest size App Home offers. There is deliberately no `max` in
      // App Home's ModalProps (small-100 | small | base | large | large-100), so
      // this is as wide as a Polaris modal goes.
      size="large-100"
      onShow={() => setIsOpen(true)}
      onAfterHide={() => setIsOpen(false)}
    >
      {/* NO footer action buttons, deliberately. On the reporter's laptop the
          app iframe is only 487px tall, and a footer "Close" cost 53px of that
          — 11% of the entire budget — to duplicate dismissal the modal already
          offers three ways: the heading bar's ✕, Esc, and a backdrop click. On a
          surface whose only job is showing as much table as possible, that trade
          is the wrong way round. Measured, not assumed — see the Step 0 log in
          `context/features/75-…`. */}
      <s-box padding="base" paddingBlockEnd="none">
        <SegmentedControl
          // Distinct from the card's "Preview device" so a screen reader never
          // announces two identically-named radiogroups.
          ariaLabel="Full-size preview device"
          options={MODAL_DEVICES}
          value={device}
          onChange={onDeviceChange}
        />
      </s-box>

      {/* Mounted only while open (see `isOpen` above). The height budget is
          viewport-derived rather than measured off this modal's body, which
          would be circular — an <s-modal> sizes to its content. From there the
          per-device rules are the card's, unchanged: Mobile fits the phone,
          Desktop clamps the browser window. */}
      {isOpen
        ? preview?.(device, { availableHeight: availableHeight ?? undefined })
        : null}
    </s-modal>
  );
}
