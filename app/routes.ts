import { flatRoutes } from "@react-router/fs-routes";

// 🔴 Test files in `app/routes/` are NOT routes. `flatRoutes()` treats every
// file directly under it as a route module regardless of name, so a co-located
// `*.test.ts` gets bundled for the browser and `npm run build` dies on
// `"readFileSync" is not exported by "__vite-browser-external"` — while the
// suite stays green. Tests inside a route directory are unaffected.
export default flatRoutes({ ignoredRouteFiles: ["**/*.test.{ts,tsx}"] });
