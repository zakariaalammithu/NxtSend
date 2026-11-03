/**
 * SectionGlow pins:
 * - every variant renders a top-anchored radial glow (never a flat band)
 *   plus the faint 64px grid, both decorative (aria-hidden,
 *   pointer-events-none)
 * - the glow treatment is actually used across the public marketing
 *   pages: every page.tsx under src/app/(marketing) renders it at
 *   least once (the agency hero and HomeIntegrations keep their
 *   earlier inline version of the same treatment, so they are exempt
 *   from the per-file count but still covered by the variant tests)
 */

import * as React from "react";
import { renderToString } from "react-dom/server";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SectionGlow } from "../SectionGlow";
import { Footer } from "../Footer";
import { TrustedBy } from "../TrustedBy";

(globalThis as { React?: typeof React }).React = React;

const render = (node: React.ReactElement) =>
  renderToString(node).replace(/<!-- -->/g, "");

describe("SectionGlow", () => {
  it.each(["emerald", "blue", "violet", "teal"] as const)(
    "%s renders a radial glow and the faint grid, both decorative",
    (variant) => {
      const html = render(<SectionGlow variant={variant} />);
      expect(html).toContain("radial-gradient");
      expect(html).toContain("64px 64px");
      expect(html).toContain('aria-hidden="true"');
      expect(html).toContain("pointer-events-none");
    },
  );

  it("renders without the grid when grid is off", () => {
    const html = render(<SectionGlow variant="blue" grid={false} />);
    expect(html).toContain("radial-gradient");
    expect(html).not.toContain("64px 64px");
  });
});

describe("Footer bookend", () => {
  it("the shared footer carries the same emerald glow as the home hero", () => {
    const html = render(<Footer />);
    expect(html).toContain("radial-gradient");
    expect(html).toContain("64px 64px");
  });
});

describe("TrustedBy logo wall", () => {
  it("has no white tiles and uses the dark-background logo files", () => {
    const html = render(<TrustedBy />);
    expect(html).not.toContain("bg-white");
    // Next Image URL-encodes the src in srcSet, so match the encoded path.
    expect(html).toContain("logos%2Fdark%2Fhubspot.png");
    expect(html).toContain("logos%2Fdark%2Fclay.png");
    expect(html).toContain("logos%2Fdark%2Fflip-electronics.png");
    for (const name of [
      "HubSpot",
      "Clay",
      "Pavilion",
      "Flip Electronics",
      "McKinsey",
      "Indoorcare",
      "XBag",
      "LinkedIn",
      "Sandler Training",
      "Spacebar Studios",
      "ContactReachout",
      "BizReviewRadar",
      "nsave",
      "Acquisition Systems",
      "Exter Media",
    ]) {
      expect(html).toContain(name);
    }
  });
});

describe("SectionGlow usage across the marketing site", () => {
  const here = path.dirname(fileURLToPath(import.meta.url));
  const marketingDir = path.resolve(here, "../../../app/(marketing)");

  function collectPages(dir: string): string[] {
    const out: string[] = [];
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      if (statSync(full).isDirectory()) out.push(...collectPages(full));
      else if (entry === "page.tsx") out.push(full);
    }
    return out;
  }

  it("every public marketing page renders SectionGlow at least once", () => {
    const pages = collectPages(marketingDir);
    expect(pages.length).toBeGreaterThanOrEqual(13);
    const missing = pages.filter(
      (file) => !readFileSync(file, "utf8").includes("SectionGlow"),
    );
    expect(missing).toEqual([]);
  });
});
