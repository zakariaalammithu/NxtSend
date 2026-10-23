/**
 * P10 Stage D — professional footer pins:
 *
 * - Four-column structure: Brand (Logo lockup + description + the
 *   BRAND_TAGLINE from src/lib/brand.ts + configured socials),
 *   Product, Resources, Company & Legal.
 * - Every href in FOOTER_COLUMNS resolves to a real app route, and
 *   every #anchor resolves to an id that exists in the target page's
 *   source. Zero "#" placeholders. (Features / Campaigns / About have
 *   no public routes and are deliberately not linked.)
 * - The copyright year is dynamic — the hard-coded "© 2025" and the
 *   retired "Scale your outreach" line are gone.
 * - The bottom row is slim: dynamic copyright + hello@nxtsend.com;
 *   legal links live in Company & Legal, not duplicated in the bar.
 */

import * as React from "react";
import { renderToString } from "react-dom/server";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FOOTER_COLUMNS, Footer } from "../Footer";
import { BRAND_TAGLINE } from "@/lib/brand";

(globalThis as { React?: typeof React }).React = React;

const render = (node: React.ReactElement) =>
  renderToString(node).replace(/<!-- -->/g, "");

const here = path.dirname(fileURLToPath(import.meta.url));
const APP_DIR = path.resolve(here, "../../../app");

/** Map every page.tsx under src/app to its public route path, with
    route-group segments "(…)" treated as transparent. */
function collectRoutes(dir: string, segments: string[]): Map<string, string> {
  const routes = new Map<string, string>();
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      const next = entry.name.startsWith("(")
        ? segments
        : [...segments, entry.name];
      collectRoutes(full, next).forEach((file, route) =>
        routes.set(route, file),
      );
    } else if (entry.name === "page.tsx" || entry.name === "page.ts") {
      routes.set("/" + segments.join("/"), full);
    }
  }
  return routes;
}

const ROUTES = collectRoutes(APP_DIR, []);
const ALL_LINKS = FOOTER_COLUMNS.flatMap((col) => col.links);

describe("P10 footer — structure", () => {
  it("has the Product / Resources / Company & Legal columns in order", () => {
    expect(FOOTER_COLUMNS.map((c) => c.title)).toEqual([
      "Product",
      "Resources",
      "Company & Legal",
    ]);
  });

  it("Product links the real product routes", () => {
    const product = FOOTER_COLUMNS.find((c) => c.title === "Product")!;
    expect(product.links).toEqual([
      { label: "Integrations", href: "/integrations" },
      { label: "Avatars", href: "/avatars" },
      { label: "Agency", href: "/agency" },
      { label: "Pricing", href: "/pricing" },
      { label: "Developers", href: "/developers" },
      { label: "Get Started", href: "/signup" },
    ]);
  });

  it("Resources links support, academy and the support-page guides", () => {
    const resources = FOOTER_COLUMNS.find((c) => c.title === "Resources")!;
    expect(resources.links).toEqual([
      { label: "Help & Support", href: "/support" },
      { label: "Academy", href: "/academy" },
      { label: "FAQ", href: "/support#faq" },
      { label: "Getting Started", href: "/support#getting-started" },
      { label: "Campaign Setup", href: "/support#campaigns" },
      { label: "Contact Us", href: "/contact" },
    ]);
  });

  it("Company & Legal carries the demo link and the three legal pages", () => {
    const company = FOOTER_COLUMNS.find(
      (c) => c.title === "Company & Legal",
    )!;
    expect(company.links).toEqual([
      { label: "Book a Demo", href: "/demo" },
      { label: "Terms & Conditions", href: "/terms" },
      { label: "Privacy Policy", href: "/privacy" },
      { label: "Cookie Policy", href: "/cookies" },
    ]);
  });

  it("links nothing twice and uses no placeholder hrefs", () => {
    const hrefs = ALL_LINKS.map((l) => l.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
    for (const href of hrefs) {
      expect(href.startsWith("/")).toBe(true);
      expect(href).not.toBe("#");
      expect(href).not.toContain("#placeholder");
    }
  });
});

describe("P10 footer — link integrity", () => {
  it("every column href resolves to a real app route", () => {
    for (const link of ALL_LINKS) {
      const route = link.href.split("#")[0];
      expect(ROUTES.has(route), `${link.href} → route ${route}`).toBe(true);
    }
  });

  it("every #anchor exists as an id in the target page source", () => {
    for (const link of ALL_LINKS) {
      const [route, hash] = link.href.split("#");
      if (!hash) continue;
      const file = ROUTES.get(route);
      expect(file, `${link.href} target page`).toBeDefined();
      const source = readFileSync(file!, "utf8");
      // Anchors appear as id="…" attributes or as guide data ids
      // (id: "…") that the page renders into id={guide.id}.
      expect(
        source.includes(`id="${hash}"`) || source.includes(`id: "${hash}"`),
        `${link.href} → #${hash} in ${path.basename(path.dirname(file!))}`,
      ).toBe(true);
    }
  });
});

describe("P10 footer — brand block and bottom row", () => {
  const html = render(<Footer />);

  it("renders the official tagline from the brand module", () => {
    expect(BRAND_TAGLINE).toBe("Move Forward. Connect Faster.");
    expect(html).toContain(BRAND_TAGLINE);
    expect(html).not.toContain("Scale your outreach");
  });

  it("renders the configured social profiles", () => {
    expect(html).toContain("https://www.linkedin.com/company/NxtSend");
    expect(html).toContain("https://web.facebook.com/NxtSend");
  });

  it("shows a dynamic copyright year, never the hard-coded 2025", () => {
    expect(html).toContain(`© ${new Date().getFullYear()} NxtSend`);
    expect(html).not.toContain("© 2025");
  });

  it("keeps the public contact email in the slim bottom row", () => {
    expect(html).toContain('href="mailto:hello@nxtsend.com"');
    expect(html).toContain("hello@nxtsend.com");
  });

  it("does not duplicate the legal links outside the column data", () => {
    // Each legal href appears exactly once in the rendered footer —
    // in the Company & Legal column, not again in the bottom bar.
    for (const href of ["/terms", "/privacy", "/cookies"]) {
      const count = html.split(`href="${href}"`).length - 1;
      expect(count, href).toBe(1);
    }
    expect(existsSync(path.join(APP_DIR, "(marketing)", "terms"))).toBe(true);
  });
});
