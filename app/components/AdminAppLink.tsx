import type { ReactNode } from "react";
import { useNavigate } from "react-router";

// A link to another page INSIDE this embedded app that behaves correctly in
// every way a merchant can open it: plain click, ⌘/Ctrl/Shift/middle click, and
// the browser's "Open link in new tab" context item.
//
// Shared by the templates list (row name links) and the editor's assignment
// conflict banner. Extracted from `app.templates.tsx` when the second call site
// appeared, so the two can never drift apart — the click semantics below are
// subtle and were arrived at by fixing two separate live bugs.
//
// The href is ABSOLUTE (`admin.shopify.com/store/<store>/apps/<client-id>/app/…`,
// built by `buildAdminAppBase`) because the browser's context-menu "Open in new
// tab" uses the raw href with no JS: an app-relative `/app/…` href would resolve
// against the app's own origin and load it standalone with no Shopify session.
//
// ⚠️ But a cross-origin href has a cost: App Bridge preventDefaults every click
// on it in a CAPTURE-phase listener and opens it in a new tab — so without the
// handler below, EVERY plain click would spawn a tab. App Bridge does not
// stopPropagation, so this bubble-phase handler still runs and owns all the
// outcomes: a plain primary click routes in place via the client router; an
// intent-to-open-new-tab does what the context item does.
//
// 🚫 Do NOT bail out of the handler on `event.defaultPrevented` — it is already
// true (App Bridge set it), so bailing skips the in-place navigation and a plain
// click does nothing at all.
export function AdminAppLink({
  adminAppBase,
  appPath,
  children,
}: {
  // Admin deep-link base for this shop + app, from the route loader.
  adminAppBase: string;
  // App-relative destination, e.g. `/app/templates/<id>`.
  appPath: string;
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const href = `${adminAppBase}${appPath}`;

  const handleClick = (event: Event) => {
    const mouse = event as MouseEvent;
    const wantsNewTab =
      mouse.metaKey || mouse.ctrlKey || mouse.shiftKey || mouse.button === 1;
    event.preventDefault();
    if (wantsNewTab) {
      window.open(href, "_blank", "noopener");
    } else if (mouse.button === 0) {
      navigate(appPath);
    }
  };

  return (
    <s-link href={href} onClick={handleClick}>
      {children}
    </s-link>
  );
}
