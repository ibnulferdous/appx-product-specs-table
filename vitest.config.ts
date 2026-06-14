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
    // Pure logic runs in plain Node — no DOM yet. A jsdom project gets added
    // later only if/when component tests are introduced.
    environment: "node",
    include: ["app/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
    },
  },
});
