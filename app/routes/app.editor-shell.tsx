// THROWAWAY dev harness for the reshell A2 step — NOT a merchant-facing screen.
// It mounts the durable, presentational <EditorShell> with a long static dummy
// table so the mockup chrome (tabs + device toggle + sidebar reveal) can be
// proven in the real embedded admin without touching the working editor. Reach it
// at /app/editor-shell (it is deliberately NOT linked in <s-app-nav>). This whole
// file — route + dummy data + <DummyGrid> — is DELETED at A1, when the real
// engine-driven <ContentTab> replaces the dummy stage inside the same
// <EditorShell>. See context/features/16-reshell-a2-editor-shell.md.

import { useEffect, useRef } from "react";
import type { HeadersFunction, LoaderFunctionArgs } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";
import { EditorShell } from "./app.templates_.$id/EditorShell";
import { useScrollRegionHeight } from "./app.templates_.$id/useScrollRegionHeight";
import {
  MAX_TEMPLATE_ROWS,
  type DataRow,
  type EditorRow,
  type SectionHeaderRow,
  type ValuePart,
} from "../utils/rows";
import styles from "./app.templates_.$id/SpecTableEditor.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  // Authenticate so the embedded session + App Bridge resolve (the parent app.tsx
  // already provides AppProvider). No data is needed — the stage is dummy.
  await authenticate.admin(request);
  return null;
};

// Shared grid template so the column header, data rows, and section rows line up
// — mirrors the real editor's constants so A3's scroll work and A1's RowGrid port
// cleanly. First track is the fixed-width gutter.
const GUTTER = "2.75rem";
const DATA_COLUMNS = `${GUTTER} 1fr 1.6fr`;
const SECTION_COLUMNS = `${GUTTER} 1fr`;

// --- Dummy fixture ----------------------------------------------------------
// Value-part shorthands so the fixture reads like the mockup.
const T = (text: string): ValuePart => ({ type: "TEXT", text });
const F = (field: string): ValuePart => ({ type: "SHOPIFY_FIELD", field });
const M = (namespace: string, key: string): ValuePart => ({
  type: "METAFIELD",
  namespace,
  key,
});
const BR: ValuePart = { type: "LINE_BREAK" };

let seq = 0;
function data(label: string, parts: ValuePart[] = []): DataRow {
  seq += 1;
  return {
    id: `d${seq}`,
    key: `k${seq}`,
    rowType: "DATA",
    label,
    valueParts: parts.length > 0 ? parts : [T("")],
    hideWhenEmpty: true,
  };
}
function section(label: string): SectionHeaderRow {
  seq += 1;
  return {
    id: `s${seq}`,
    key: `sec${seq}`,
    rowType: "SECTION_HEADER",
    label,
    hideWhenEmpty: false,
  };
}

// ~60 rows across realistic sections — long enough to overflow the iframe (so A3
// has something to bound-scroll) and to exercise pills + multiline values.
const DUMMY_ROWS: EditorRow[] = [
  section("Display"),
  data("Size", [T("6.9-inch (diagonal)")]),
  data("Type", [T("Super Retina XDR display")]),
  data("Resolution", [T("2868 × 1320 pixels")]),
  data("Brightness", [T("Up to "), M("custom", "brightness"), T(" nits")]),
  data("Refresh rate", [T("120 Hz ProMotion")]),
  data("Aspect ratio", [T("19.5:9")]),

  section("Performance"),
  data("Chipset", [M("custom", "chipset")]),
  data("CPU", [T("6-core")]),
  data("GPU", [T("5-core")]),
  data("Memory", [T("8 GB RAM")]),
  data("Brand", [F("vendor")]),
  data("Storage options", [
    T("128 GB"),
    BR,
    T("256 GB"),
    BR,
    T("512 GB"),
    BR,
    T("1 TB"),
  ]),

  section("Battery"),
  data("Battery life", [T("Up to "), M("custom", "battery_life"), T(" hours")]),
  data("Capacity", [T("4685 mAh")]),
  data("Wired charging", [T("USB-C, up to 27 W")]),
  data("Wireless charging", [T("MagSafe up to 25 W")]),

  section("Camera"),
  data("Main", [T("48 MP, ƒ/1.78")]),
  data("Ultra wide", [T("48 MP, ƒ/2.2")]),
  data("Telephoto", [T("12 MP, ƒ/2.8, 5× optical")]),
  data("Front", [T("12 MP TrueDepth")]),
  data("Video", [T("4K Dolby Vision up to 120 fps")]),

  section("Connectivity"),
  data("Cellular", [T("5G (sub-6 GHz and mmWave)")]),
  data("Wi-Fi", [T("Wi-Fi 7 (802.11be)")]),
  data("Bluetooth", [T("5.3")]),
  data("SIM", [T("Dual eSIM")]),
  data("Port", [T("USB-C (USB 3, up to 10 Gb/s)")]),

  section("Build"),
  data("Frame", [T("Grade 5 titanium")]),
  data("Front", [T("Ceramic Shield 2")]),
  data("Water resistance", [T("IP68 (6 m for 30 min)")]),
  data("Weight", [F("weight")]),
  data("Dimensions", [
    T("163.0 mm (H)"),
    BR,
    T("77.6 mm (W)"),
    BR,
    T("8.25 mm (D)"),
  ]),

  section("Audio"),
  data("Speakers", [T("Stereo")]),
  data("Spatial audio", [T("Yes")]),
  data("Dolby Atmos", [T("Yes")]),

  section("Sensors"),
  data("Face ID", [T("Yes")]),
  data("Barometer", [T("High-g accelerometer")]),
  data("Gyro", [T("Three-axis gyro")]),
  data("Proximity", [T("Yes")]),
  data("Ambient light", [T("Yes")]),

  section("In the box"),
  data("Contents", [
    T("iPhone"),
    BR,
    T("USB-C Charge Cable (1 m)"),
    BR,
    T("Documentation"),
  ]),

  section("Warranty & support"),
  data("Limited warranty", [T("1 year")]),
  data("SKU", [F("sku")]),
  data("Price", [F("price")]),
  data("Support", [T("90 days complimentary technical support")]),
];

// --- Static stage (throwaway) ----------------------------------------------
// A non-interactive stand-in for the real RowGrid: a toolbar + hint + sticky-able
// header + a list of rows mirroring the real editor's DOM (gutter / label / value)
// so A3's sticky-header + scroll measurement and A1's RowGrid port cleanly.

function DummyValue({ parts }: { parts: ValuePart[] }) {
  return (
    <div>
      {parts.map((part, index) => {
        if (part.type === "TEXT") {
          return <span key={index}>{part.text}</span>;
        }
        if (part.type === "LINE_BREAK") {
          return <br key={index} />;
        }
        // Dynamic-field pills reuse the editor's link-styled token class.
        const label =
          part.type === "SHOPIFY_FIELD"
            ? `Field · ${part.field}`
            : `Metafield · ${part.key}`;
        return (
          <span key={index} className={styles.token}>
            {label}
          </span>
        );
      })}
    </div>
  );
}

function DummyRow({ row }: { row: EditorRow }) {
  const isSection = row.rowType === "SECTION_HEADER";
  return (
    <div>
      <s-box padding="small-200" borderRadius="base">
        <s-grid
          gridTemplateColumns={isSection ? SECTION_COLUMNS : DATA_COLUMNS}
          gap="base"
          alignItems="center"
        >
          {/* gutter (decorative in the dummy: drag handle + delete) */}
          <s-stack direction="block" gap="small-300" alignItems="center">
            <s-icon
              type="drag-handle"
              color="subdued"
              aria-hidden="true"
            ></s-icon>
            <s-icon type="x" color="subdued" aria-hidden="true"></s-icon>
          </s-stack>

          {isSection ? (
            <s-stack direction="inline" gap="small-200" alignItems="center">
              <s-icon type="chevron-right" color="subdued"></s-icon>
              <s-text type="strong" color="subdued">
                {row.label.toUpperCase()}
              </s-text>
            </s-stack>
          ) : (
            <>
              <s-text>{row.label}</s-text>
              <DummyValue parts={(row as DataRow).valueParts} />
            </>
          )}
        </s-grid>
      </s-box>
    </div>
  );
}

function DummyGrid({ rows }: { rows: EditorRow[] }) {
  useCapturedTokenColor();
  // Reshell A3: bound the rows scroller to the remaining iframe viewport so ONLY
  // the rows list scrolls (the toolbar + hint above it stay fixed). The real
  // RowGrid adopts this same scroller + hook at A1.
  const scrollerRef = useRef<HTMLDivElement>(null);
  const maxHeight = useScrollRegionHeight(scrollerRef, rows.length);

  return (
    <s-box padding="base">
      <s-stack direction="block" gap="base">
        {/* toolbar — FIXED (outside the scroller, always reachable) */}
        <s-grid gridTemplateColumns="1fr auto" gap="base" alignItems="center">
          <s-stack direction="inline" gap="small-300" alignItems="center">
            <s-button variant="primary" icon="plus">
              Add row
            </s-button>
            <s-button icon="layout-section">Add section</s-button>
            <s-button icon="duplicate">Duplicate</s-button>
            <s-button icon="metafields">Insert field</s-button>
          </s-stack>
          <s-text color="subdued" fontVariantNumeric="tabular-nums">
            Rows: {rows.length} / {MAX_TEMPLATE_ROWS}
          </s-text>
        </s-grid>

        <s-divider></s-divider>

        {/* Rows scroller — the ONLY thing that scrolls. Holds the rows + the
            bottom Add-row. Its max-height is measured by useScrollRegionHeight;
            the .rowsScroller class supplies overflow + the min-height floor. */}
        <div
          ref={scrollerRef}
          className={styles.rowsScroller}
          style={{ maxHeight }}
        >
          <s-stack direction="block" gap="base">
            <s-stack direction="block" gap="small-300">
              {rows.map((row) => (
                <DummyRow key={row.id} row={row} />
              ))}
            </s-stack>

            {/* bottom add-row: a dashed full-width affordance (Polaris dashed
                border). It scrolls WITH the rows (mockup-faithful); the toolbar's
                primary Add row stays fixed and always reachable. */}
            <s-box
              borderStyle="dashed"
              borderWidth="base"
              borderColor="base"
              borderRadius="base"
              padding="small-300"
            >
              <div style={{ display: "flex", justifyContent: "center" }}>
                <s-button variant="tertiary" icon="plus">
                  Add row
                </s-button>
              </div>
            </s-box>
          </s-stack>
        </div>
      </s-stack>
    </s-box>
  );
}

// Publish Polaris's link color as `--appx-token-color` so the dummy pills render
// in the same blue as the real editor (the .token class reads this variable).
// A throwaway copy of the editor's `useCapturedTokenColor` — this whole file is
// deleted at A1, so it intentionally does not touch the frozen SpecTableEditor.
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

export default function EditorShellPreview() {
  return (
    <s-page heading="Editor shell preview (dev)">
      <s-link slot="breadcrumb-actions" href="/app/templates">
        Templates
      </s-link>
      <EditorShell stage={<DummyGrid rows={DUMMY_ROWS} />} />
    </s-page>
  );
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
