import { defineConfig } from "vitest/config";

// Standalone Vitest config — deliberately does NOT extend the root vite.config.ts.
// That config registers the React Router plugin (`reactRouter()`), which expects
// the framework's build/runtime context and breaks under Vitest. Phase 1 unit
// tests are framework-free pure logic, so they need none of it.
//
// Testing strategy + phased rollout live in the project's testing plan; Phase 1
// covers app/utils/rows.ts (the spec-table editor reducer + helpers).
export default defineConfig({
  test: {
    // Pure logic runs in plain Node. The rare file that needs a DOM opts in for
    // itself with a `// @vitest-environment jsdom` docblock on line 1 — today only
    // `app/utils/valueDom.test.ts`, which covers the value cell's DOM glue. That is
    // one line at the top of the file that needs it, versus a second project and a
    // second run for every file that does not; revisit if DOM files outgrow a handful.
    // 🚫 This is NOT an opening for component tests: Polaris `<s-…>` web components do
    // not render in jsdom, and neither does contenteditable editing behaviour. Real
    // editor UI stays browser-verified (see code-standards.md → Testing).
    environment: "node",
    include: ["app/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
    },
  },
});
