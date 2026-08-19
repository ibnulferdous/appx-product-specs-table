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

// Renders when the app URL is hit without a `shop` param (login entry point).
export default function App() {
  const { showForm } = useLoaderData<typeof loader>();

  return (
    <div className={styles.page}>
      <header className={styles.topbar}>
        <a className={styles.brand} href="/" aria-label="Appx home">
          <Logo />
          <span className={styles.brandName}>
            Appx
            <span className={styles.brandSub}>Product Specs Table</span>
          </span>
        </a>
        <nav className={styles.topnav} aria-label="Primary">
          <a className={styles.navLink} href="https://hiappx.com">
            Website
          </a>
          <a className={styles.navLink} href="mailto:support@hiappx.com">
            Support
          </a>
        </nav>
      </header>

      <main className={styles.main}>
        <section className={styles.hero}>
          <div className={styles.heroCopy}>
            <span className={styles.eyebrow}>
              <span className={styles.eyebrowDot} aria-hidden="true" />
              Shopify Theme App Extension
            </span>
            <h1 className={styles.heading}>
              Product spec tables that sell the details.
            </h1>
            <p className={styles.text}>
              Give shoppers the specifications they need to buy with confidence.
              Build a spec table once, assign it to the right products, and it
              renders cleanly on your storefront product pages.
            </p>

            {showForm && (
              <Form className={styles.form} method="post" action="/auth/login">
                <label className={styles.label} htmlFor="shop">
                  Install on your store
                </label>
                <div className={styles.formRow}>
                  <input
                    className={styles.input}
                    id="shop"
                    type="text"
                    name="shop"
                    placeholder="my-shop-domain.myshopify.com"
                    autoComplete="off"
                    autoCapitalize="off"
                    spellCheck={false}
                  />
                  <button className={styles.button} type="submit">
                    Log in
                  </button>
                </div>
                <p className={styles.hint}>
                  Enter your <code>.myshopify.com</code> domain to open the app.
                </p>
              </Form>
            )}

            <ul className={styles.trust}>
              <li className={styles.trustItem}>
                <CheckIcon />
                No code required
              </li>
              <li className={styles.trustItem}>
                <CheckIcon />
                Works with your theme
              </li>
              <li className={styles.trustItem}>
                <CheckIcon />
                Merchant data stays isolated
              </li>
            </ul>
          </div>

          <div className={styles.heroVisual} aria-hidden="true">
            <SpecTablePreview />
          </div>
        </section>

        <section className={styles.features} aria-label="Features">
          <article className={styles.feature}>
            <span className={styles.featureIcon}>
              <TemplatesIcon />
            </span>
            <h2 className={styles.featureTitle}>Reusable templates</h2>
            <p className={styles.featureText}>
              Author a spec table once and reuse it across a product, a type, a
              vendor, or a whole collection.
            </p>
          </article>
          <article className={styles.feature}>
            <span className={styles.featureIcon}>
              <SyncIcon />
            </span>
            <h2 className={styles.featureTitle}>Values that stay current</h2>
            <p className={styles.featureText}>
              Pull rows from a product&apos;s own fields and metafields, so the
              table follows the product instead of going stale.
            </p>
          </article>
          <article className={styles.feature}>
            <span className={styles.featureIcon}>
              <BrushIcon />
            </span>
            <h2 className={styles.featureTitle}>Styled to match your theme</h2>
            <p className={styles.featureText}>
              Start from a built-in style, adjust layout, colors, and
              typography, and preview it before it goes live.
            </p>
          </article>
        </section>
      </main>

      <footer className={styles.footer}>
        <span className={styles.footerBrand}>
          <Logo small />
          Appx · Product Specs Table
        </span>
        <span className={styles.footerLinks}>
          <a className={styles.footerLink} href="https://hiappx.com">
            hiappx.com
          </a>
          <span className={styles.footerDivider} aria-hidden="true">
            ·
          </span>
          <a className={styles.footerLink} href="mailto:support@hiappx.com">
            support@hiappx.com
          </a>
        </span>
      </footer>
    </div>
  );
}

function Logo({ small = false }: { small?: boolean }) {
  const size = small ? 22 : 34;
  return (
    <svg
      className={styles.logo}
      width={size}
      height={size}
      viewBox="0 0 34 34"
      role="img"
      aria-hidden="true"
      focusable="false"
    >
      <rect width="34" height="34" rx="9" fill="url(#appxGrad)" />
      <rect x="8" y="9" width="18" height="16" rx="2.5" fill="#fff" />
      <rect x="8" y="9" width="18" height="4.5" rx="2.5" fill="#c7d0ff" />
      <rect x="11" y="16" width="4.5" height="1.8" rx="0.9" fill="#4338ca" />
      <rect x="17.5" y="16" width="6" height="1.8" rx="0.9" fill="#a9b4f5" />
      <rect x="11" y="20" width="4.5" height="1.8" rx="0.9" fill="#4338ca" />
      <rect x="17.5" y="20" width="6" height="1.8" rx="0.9" fill="#a9b4f5" />
      <defs>
        <linearGradient
          id="appxGrad"
          x1="0"
          y1="0"
          x2="34"
          y2="34"
          gradientUnits="userSpaceOnUse"
        >
          <stop stopColor="#6366f1" />
          <stop offset="1" stopColor="#4338ca" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function SpecTablePreview() {
  const rows: Array<[string, string, boolean]> = [
    ["Material", "Aircraft-grade aluminum", false],
    ["Weight", "249 g", true],
    ["Battery life", "Up to 34 min", false],
    ["Water resistance", "IP67", true],
    ["Warranty", "2 years", false],
  ];

  return (
    <div className={styles.previewCard}>
      <div className={styles.previewBar}>
        <span className={styles.previewDot} />
        <span className={styles.previewDot} />
        <span className={styles.previewDot} />
        <span className={styles.previewUrl}>Product page</span>
      </div>
      <div className={styles.previewBody}>
        <p className={styles.previewCaption}>Specifications</p>
        <table className={styles.previewTable}>
          <tbody>
            {rows.map(([label, value, dynamic]) => (
              <tr key={label} className={styles.previewRow}>
                <th className={styles.previewLabel} scope="row">
                  {label}
                </th>
                <td className={styles.previewValue}>
                  {value}
                  {dynamic && <span className={styles.previewPill}>live</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="8" cy="8" r="8" fill="#e0e4ff" />
      <path
        d="M4.5 8.2 6.9 10.5 11.5 5.5"
        stroke="#4338ca"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function TemplatesIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <rect
        x="3"
        y="4"
        width="18"
        height="16"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.7"
      />
      <path d="M3 9h18M9 9v11" stroke="currentColor" strokeWidth="1.7" />
    </svg>
  );
}

function SyncIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 11a8 8 0 0 0-14-4.5M4 13a8 8 0 0 0 14 4.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <path
        d="M6 3v3.5H9.5M18 21v-3.5H14.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function BrushIcon() {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M4 20c0-2.2 1.3-3.5 3-3.5S10 18 10 20a2 2 0 0 1-3 1.7A2.9 2.9 0 0 1 4 20Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
      <path
        d="M9.5 15.5 18 7a2.1 2.1 0 0 1 3 3l-8.5 8.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
