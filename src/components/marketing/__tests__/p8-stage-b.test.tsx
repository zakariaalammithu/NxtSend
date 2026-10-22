/**
 * P8 Stage B — pins for the new/rewritten marketing surfaces:
 *
 * - Header nav carries "Developers" right after "Agency" (one data
 *   source feeds both the desktop nav and the mobile menu).
 * - Footer Resources column links /support + /developers, and the
 *   bottom legal row links /cookies (previously orphaned).
 * - /developers documents ONLY what the code implements (outbound
 *   webhooks) and labels the public API "Coming Soon" / "API Access
 *   Required" — with no invented endpoints and no rate-limit numbers.
 * - /support describes billing as per-seat subscriptions; the word
 *   "credit" never appears (NxtSend has no credit/balance system).
 * - /terms, /privacy and /cookies no longer carry the draft-template
 *   banner, are dated 22 October 2026, name the real contact address,
 *   and contain none of the old template's unverifiable claims
 *   (SOC 2, Amazon SES, residential proxies, Cloudflare).
 * - /integrations no longer renders the retired artwork
 *   (hero.webp / hero-large.webp / request-integration.webp).
 */

import * as React from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NAV_ITEMS } from "../Header";
import { FOOTER_COLUMNS, Footer } from "../Footer";
import DevelopersPage from "@/app/(marketing)/developers/page";
import SupportPage from "@/app/(marketing)/support/page";
import TermsPage from "@/app/(marketing)/terms/page";
import PrivacyPage from "@/app/(marketing)/privacy/page";
import CookiesPage from "@/app/(marketing)/cookies/page";
import IntegrationsPage from "@/app/(marketing)/integrations/page";

/* The app is compiled by Next with the automatic JSX runtime, so page
   modules do not import React. Vitest/esbuild transforms JSX to the
   classic runtime — expose React globally so those modules render. */
(globalThis as { React?: typeof React }).React = React;

/** SSR output splits adjacent text nodes with <!-- --> markers; strip
    them so assertions run against the visible text. */
const render = (node: React.ReactElement) =>
  renderToString(node).replace(/<!-- -->/g, "");

describe("P8 Stage B — navigation", () => {
  it("header NAV_ITEMS places Developers immediately after Agency", () => {
    const labels = NAV_ITEMS.map((item) => item.label);
    const agencyIdx = labels.indexOf("Agency");
    expect(agencyIdx).toBeGreaterThanOrEqual(0);
    expect(labels[agencyIdx + 1]).toBe("Developers");
    const developers = NAV_ITEMS.find((item) => item.label === "Developers");
    expect(developers?.href).toBe("/developers");
  });

  it("footer Resources column links Help & Support and Developers", () => {
    const resources = FOOTER_COLUMNS.find((col) => col.title === "Resources");
    expect(resources).toBeDefined();
    const byLabel = new Map(resources!.links.map((l) => [l.label, l.href]));
    expect(byLabel.get("Help & Support")).toBe("/support");
    expect(byLabel.get("Developers")).toBe("/developers");
  });

  it("footer bottom legal row links the Cookie Policy", () => {
    const html = render(<Footer />);
    expect(html).toContain('href="/cookies"');
    expect(html).toContain("Cookie Policy");
    expect(html).toContain('href="/terms"');
    expect(html).toContain('href="/privacy"');
  });
});

describe("P8 Stage B — /developers honesty", () => {
  const html = render(<DevelopersPage />);

  it("documents the three real webhook events and the signature header", () => {
    expect(html).toContain("lead.created");
    expect(html).toContain("campaign.created");
    expect(html).toContain("campaign.status_changed");
    expect(html).toContain("X-NxtSend-Signature");
    expect(html).toContain("hello@nxtsend.com");
  });

  it("labels the public API as not yet available", () => {
    expect(html).toContain("API Access Required");
    expect(html).toContain("Coming Soon");
  });

  it("invents no REST endpoints and no rate-limit numbers", () => {
    expect(html).not.toContain("/api/v1");
    expect(html).not.toMatch(
      /\d+\s*(requests|req)\s*(per|\/)\s*(minute|second|hour|day)/i,
    );
    expect(html).not.toMatch(/rate limit of \d+/i);
  });
});

describe("P8 Stage B — /support honesty", () => {
  const html = render(<SupportPage />);

  it("renders the guides, the FAQ and the real support contact", () => {
    expect(html).toContain("hello@nxtsend.com");
    expect(html).toContain("Getting started");
    expect(html).toContain("Configuration Required");
    expect(html).toContain("Frequently asked questions");
  });

  it("never mentions credits — billing is subscriptions + plan limits", () => {
    expect(html).not.toMatch(/credit/i);
    expect(html).toContain("$49");
    expect(html).toContain("$499");
    expect(html).toContain("$387");
  });
});

describe("P8 Stage B — legal pages", () => {
  it("/terms is a dated, banner-free rewrite with the canonical prices", () => {
    const html = render(<TermsPage />);
    expect(html).toContain("Last updated: 22 October 2026");
    expect(html).not.toContain("Draft Template");
    expect(html).not.toContain("Legal Notice");
    expect(html).toContain("$49");
    expect(html).toContain("$499");
    expect(html).toContain("$387");
    expect(html).toContain("hello@nxtsend.com");
    expect(html).not.toMatch(/residential prox/i);
    expect(html).not.toMatch(/legal@nxtsend\.com/);
    /* No credit system is offered. (The Terms state the opposite —
       "does not sell credits" — which must stay allowed.) */
    expect(html).not.toMatch(/credit (balance|system)|buy credits|top up your/i);
  });

  it("/privacy names the real processors and claims no certifications", () => {
    const html = render(<PrivacyPage />);
    expect(html).toContain("Last updated: 22 October 2026");
    expect(html).not.toContain("Draft Template");
    expect(html).toContain("Supabase");
    expect(html).toContain("Stripe");
    expect(html).toContain("Resend");
    expect(html).toContain("hello@nxtsend.com");
    expect(html).not.toMatch(/SOC[- ]?2/i);
    expect(html).not.toMatch(/ISO 27001/i);
    expect(html).not.toContain("Amazon SES");
    expect(html).not.toMatch(/privacy@nxtsend\.com/);
  });

  it("/cookies lost the banner, the invented identifiers and Cloudflare", () => {
    const html = render(<CookiesPage />);
    expect(html).toContain("Last updated: 22 October 2026");
    expect(html).not.toContain("Draft Template");
    expect(html).not.toContain("Cloudflare");
    expect(html).not.toContain("ph_app_metrics");
    expect(html).not.toContain("_li_fat_id");
    expect(html).toContain("hello@nxtsend.com");
  });
});

describe("P8 Stage B — /integrations artwork", () => {
  it("renders the native constellation and none of the retired files", () => {
    const html = render(<IntegrationsPage />);
    expect(html).not.toContain("integrations/hero.webp");
    expect(html).not.toContain("integrations/hero-large.webp");
    expect(html).not.toContain("request-integration.webp");
    /* The centre tile is /logo.png, served through the image
       optimizer (its URL appears percent-encoded in the markup). */
    expect(html).toContain("logo.png");
    expect(html).toContain("Connect NxtSend to the tools you already work with");
  });
});
