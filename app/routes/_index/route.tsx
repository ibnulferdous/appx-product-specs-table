import type { LoaderFunctionArgs } from "react-router";
import { redirect, Form, useLoaderData } from "react-router";

import { login } from "../../shopify.server";

import styles from "./styles.module.css";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

// Step 107 (D6) replaced the Shopify template's placeholder prose here. 🚫 The
// page itself is NOT deleted: this is what renders when the app URL is hit
// WITHOUT a `shop` param, and the `showForm` branch below is the shop-domain
// login path — a working entry point that would have been removed to fix copy.
// Structure, loader, form and `styles.module.css` are untouched; only the
// heading, tagline and the three bullets changed.
export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.index}>
      <div className={styles.content}>
        <h1 className={styles.heading}>Product spec tables for Shopify</h1>
        <p className={styles.text}>
          Give shoppers the details they need. Build a spec table once, assign
          it to the right products, and it renders on your storefront product
          pages.
        </p>
        {showForm && (
          <Form className={styles.form} method="post" action="/auth/login">
            <label className={styles.label}>
              <span>Shop domain</span>
              <input className={styles.input} type="text" name="shop" />
              <span>e.g: my-shop-domain.myshopify.com</span>
            </label>
            <button className={styles.button} type="submit">
              Log in
            </button>
          </Form>
        )}
        <ul className={styles.list}>
          <li>
            <strong>Reusable templates</strong>. Author a spec table once and
            reuse it across a product, a type, a vendor or a collection.
          </li>
          <li>
            <strong>Values that stay current</strong>. Pull rows from a
            product&apos;s own fields and metafields, so the table follows the
            product instead of going stale.
          </li>
          <li>
            <strong>Styled to match your theme</strong>. Start from a built-in
            style, adjust layout, colors and typography, and preview it before
            it goes live.
          </li>
        </ul>
      </div>
    </div>
  );
}
