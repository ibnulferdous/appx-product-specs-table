import { flatRoutes } from "@react-router/fs-routes";

// 🔴 Test files in `app/routes/` are NOT routes (feature 88 step 92).
//
// `flatRoutes()` treats every file directly under `app/routes/` as a route
// module — extension and name are irrelevant — so a co-located
// `something.test.ts` gets bundled for the BROWSER, and `npm run build` dies on
// `"readFileSync" is not exported by "__vite-browser-external"`. The suite
// stays green the whole time, because Vitest reads the same file happily; only
// the production build fails, which is the worst place to find out.
//
// This never fired before because every other contract test lives INSIDE a
// route directory (`app.templates_.$id/`, `app.templates_.choose-style/`),
// where flat-routes only ever looks at `route.tsx`. `createFlowContract.test.ts`
// is the first guard that spans two route directories and therefore belongs to
// neither — see its header for why it sits at the top level.
export default flatRoutes({ ignoredRouteFiles: ["**/*.test.{ts,tsx}"] });
