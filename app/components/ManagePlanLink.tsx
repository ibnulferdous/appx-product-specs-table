import type { ReactNode } from "react";

// A link to Shopify's hosted plan-selection page (App Store req 1.2.3 — a merchant must be able to
// change plan in-app without contacting support or reinstalling). The page lives on
// admin.shopify.com, OUTSIDE this embedded app's iframe, so the click navigates the TOP frame —
// mirroring the billing loader gate's `redirect(..., { target: "_top" })`. App Bridge intercepts
// clicks on absolute hrefs to spawn a new tab, so we preventDefault and drive the top-frame
// navigation ourselves (the plan page then renders in-admin, same as the gate redirect).
export function ManagePlanLink({
  url,
  children,
}: {
  url: string;
  children: ReactNode;
}) {
  const handleClick = (event: Event) => {
    event.preventDefault();
    // Navigating the top frame is permitted cross-origin even though reading it is not.
    const top = window.top ?? window;
    top.location.href = url;
  };

  return (
    <s-link href={url} onClick={handleClick}>
      {children}
    </s-link>
  );
}
