"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Search, Sparkles } from "lucide-react";

/**
 * Integrations explorer (layout/structure from the mirror:
 * aimfox.com/integrations, downloaded as ZIP 2).
 *
 * Phase-2 branding (2026-10-19): all copy below was rewritten in
 * NxtSend's own words. The mirror's own product entry was removed
 * entirely (D8): it described a session-sync/Chrome-extension product
 * NxtSend does not have. The category selector scrolls to a section
 * and highlights the one in view (scroll-spy), and the search box
 * filters the cards.
 *
 * P6 honesty reconciliation (2026-10-20): the Phase-2 copy still
 * claimed live connections the product does not have ("activity
 * synced both ways", "2-way sync" badges, "pass leads straight into
 * HubSpot"…). Every description and badge below now matches the
 * Integration Center registry (src/lib/integrations-center/registry.ts),
 * the same source the in-app Integration Center and the home section
 * use:
 * - n8n / Zapier / Make / Pabbly / Slack events ride the registry's
 *   "webhooks" descriptor: signed OUTBOUND events only — one-way,
 *   no native apps, nothing syncs back.
 * - Instantly is the registry's read-only warm-up status adapter —
 *   NxtSend reads its data and never sends through it.
 * - HubSpot is the registry's CRM entry: NOT implemented. The other
 *   CRMs and tools without a registry adapter say "Not implemented"
 *   too, with the real workaround where one exists (CSV export).
 * - Muse.ai leads the directory with its registry state: the Muse
 *   Connector Platform path — no public API drives a user's Muse
 *   agent, so nothing is "connected" from NxtSend's side.
 * No card here may claim a connection or sync the registry does not
 * support.
 *
 * Link mapping (no external URLs are carried over):
 * - Cards map to the app route /signup?integration=<slug>.
 * - "Request integration" maps to the app route /contact.
 */

interface IntegrationItem {
  slug: string;
  name: string;
  description: string;
  badge?: string;
  /** Real brand logo file under public/images/integrations/logos
      (every entry has one since the P6 logo pass — Muse.ai uses the
      genuine Muse squiggle served by muse.ai itself). */
  logo?: string;
  icon?: typeof Sparkles;
}

const LOGOS = "/images/integrations/logos";

/* ── Integrations (P6: Muse.ai first; copy reconciled with the registry) ── */
const INTEGRATIONS: Record<string, IntegrationItem> = {
  "muse-ai": {
    slug: "muse-ai",
    name: "Muse.ai",
    description:
      "Meta's Muse agent reaches NxtSend through the Muse Connector Platform — NxtSend exposes an API, Muse calls it. No public API exists for driving a user's Muse agent, so nothing connects from this side yet; the connector submission is prepared in the Integration Center",
    badge: "Connector Platform",
    logo: `${LOGOS}/muse.svg`,
  },
  instantly: {
    slug: "instantly",
    name: "Instantly",
    description:
      "Instantly runs mailbox warm-up on its own network. NxtSend only reads the warm-up status its API reports — per-mailbox state, provider-set limits and activity totals — and never sends mail through Instantly",
    badge: "Warm-up status · read-only",
    logo: `${LOGOS}/instantly.svg`,
  },
  clay: {
    slug: "clay",
    name: "Clay",
    description:
      "Enrich and build prospect lists in Clay, then bring them into NxtSend by importing the exported CSV on the Leads page. There is no direct Clay connection yet",
    badge: "Via CSV import",
    logo: `${LOGOS}/clay.webp`,
  },
  n8n: {
    slug: "n8n",
    name: "n8n",
    description:
      "NxtSend sends signed outbound events — lead.created, campaign.created, campaign.status_changed — to an n8n Webhook node, so your workflows react when outreach data changes",
    badge: "Via outbound webhooks",
    logo: `${LOGOS}/n8n.svg`,
  },
  slack: {
    slug: "slack",
    name: "Slack",
    description:
      "There is no native Slack app yet. NxtSend's signed outbound webhook events can be posted to any HTTPS endpoint, including a relay that forwards them into a Slack channel",
    badge: "Via outbound webhooks",
    logo: `${LOGOS}/slack.svg`,
  },
  smartlead: {
    slug: "smartlead",
    name: "Smartlead",
    description:
      "Smartlead is a separate email-sequencing tool, and no adapter connects it to NxtSend yet. Email campaigns here run through NxtSend's own sending providers — Resend, Gmail or Outlook",
    badge: "Not implemented",
    logo: `${LOGOS}/smartlead.svg`,
  },
  zapier: {
    slug: "zapier",
    name: "Zapier",
    description:
      "Send signed NxtSend events into your Zaps through a Zapier Catch Hook — lead and campaign changes only. This is a webhook connection, not a native Zapier app",
    badge: "Via outbound webhooks",
    logo: `${LOGOS}/zapier.svg`,
  },
  make: {
    slug: "make",
    name: "Make",
    description:
      "Make scenarios can start from NxtSend's signed outbound webhook events — point a Make Custom Webhook at the lead and campaign events you choose in the Integration Center",
    badge: "Via outbound webhooks",
    logo: `${LOGOS}/make.svg`,
  },
  pabbly: {
    slug: "pabbly",
    name: "Pabbly",
    description:
      "Pabbly Connect workflows can receive NxtSend's signed outbound events — lead.created, campaign.created, campaign.status_changed — through its webhook trigger",
    badge: "Via outbound webhooks",
    logo: `${LOGOS}/pabbly.svg`,
  },
  "outbound-sync": {
    slug: "outbound-sync",
    name: "Outbound Sync",
    description:
      "Outbound Sync aligns data between HubSpot and Salesforce on its own side. NxtSend has no connection to it and no CRM sync yet — leads leave NxtSend as CSV exports today",
    badge: "Not implemented",
    logo: `${LOGOS}/outbound-sync.png`,
  },
  hubspot: {
    slug: "hubspot",
    name: "HubSpot",
    description:
      "No HubSpot sync is built yet. NxtSend's Leads section is the built-in CRM today, with real CSV import and export — a HubSpot adapter is planned, not shipped",
    badge: "Not implemented",
    logo: `${LOGOS}/hubspot.svg`,
  },
  pipedrive: {
    slug: "pipedrive",
    name: "Pipedrive",
    description:
      "No Pipedrive adapter exists yet. Until a sync is built, export leads from NxtSend as CSV and import them into Pipedrive manually",
    badge: "Not implemented",
    logo: `${LOGOS}/pipedrive.svg`,
  },
  close: {
    slug: "close",
    name: "Close",
    description:
      "No Close adapter exists yet. Engaged prospects can be exported from NxtSend as CSV and imported into Close today",
    badge: "Not implemented",
    logo: `${LOGOS}/close.svg`,
  },
  salesforce: {
    slug: "salesforce",
    name: "Salesforce",
    description:
      "No Salesforce adapter exists yet. Qualified leads leave NxtSend as CSV exports, which Salesforce imports directly",
    badge: "Not implemented",
    logo: `${LOGOS}/salesforce.svg`,
  },
  masterinbox: {
    slug: "masterinbox",
    name: "Masterinbox",
    description:
      "NxtSend already has its own unified inbox for email and LinkedIn replies, so replies are handled inside NxtSend — no Masterinbox connection exists",
    badge: "Not implemented",
    logo: `${LOGOS}/masterinbox.svg`,
  },
  emailbison: {
    slug: "emailbison",
    name: "EmailBison",
    description:
      "EmailBison runs its own email sequencing outside NxtSend, and no adapter connects the two today — NxtSend sends through Resend, Gmail or Outlook mailboxes instead",
    badge: "Not implemented",
    logo: `${LOGOS}/emailbison.jpg`,
  },
  weezly: {
    slug: "weezly",
    name: "Weezly",
    description:
      "Personalized video steps with Weezly are not built yet. Campaign steps today are text — with voice notes recorded in the app and delivered as email attachments",
    badge: "Not implemented",
    logo: `${LOGOS}/weezly.svg`,
  },
  trigify: {
    slug: "trigify",
    name: "Trigify",
    description:
      "Trigify's buying signals are not connected to NxtSend yet — no signal feed reaches campaigns or leads today",
    badge: "Not implemented",
    logo: `${LOGOS}/trigify.svg`,
  },
  rb2b: {
    slug: "rb2b",
    name: "RB2b",
    description:
      "RB2B identifies visitors on your own website; NxtSend cannot receive those identifications yet — no connection exists between the two",
    badge: "Not implemented",
    logo: `${LOGOS}/rb2b.svg`,
  },
};

/* ── Categories (mirror order; Automations is one shorter after D8) ────── */
const CATEGORIES: { title: string; slugs: string[] }[] = [
  { title: "Top Choice", slugs: ["muse-ai", "instantly", "clay", "n8n", "slack", "smartlead"] },
  {
    title: "Automations",
    slugs: ["n8n", "zapier", "make", "pabbly", "slack", "clay", "outbound-sync"],
  },
  { title: "CRM", slugs: ["hubspot", "pipedrive", "close", "salesforce"] },
  {
    title: "Multi-channel",
    slugs: ["instantly", "masterinbox", "smartlead", "emailbison"],
  },
  { title: "Intent-based", slugs: ["weezly", "trigify", "rb2b"] },
];

function categoryId(title: string) {
  return `category-${title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
}

/* ── "Request integration" card (mirror: shown in the sidebar on xl,        */
/* and again below the last section on smaller screens) ──────────────────── */
function RequestIntegrationCard({ className = "" }: { className?: string }) {
  return (
    <div
      className={`flex flex-col gap-y-4 rounded-5xl bg-white p-4 md:flex-row-reverse md:items-center md:p-2.5 xl:flex-col xl:pb-6 ${className}`}
    >
      <Image
        src="/images/integrations/request-integration.webp"
        alt=""
        width={1200}
        height={773}
        className="mx-auto h-56 w-auto xl:h-52"
      />
      <div className="flex flex-col gap-y-6 px-3 md:px-4 xl:px-2">
        <p className="text-center text-24 font-semibold text-black-900 md:text-left xl:text-20">
          Missing a tool you rely on? Tell us which integration to add next
        </p>
        <Link
          href="/contact"
          className="flex h-10.5 shrink-0 items-center justify-center self-center rounded-full bg-black-900 px-5 text-16 font-semibold text-nowrap text-white transition-colors hover:bg-black-600 md:self-start"
        >
          Request integration
        </Link>
      </div>
    </div>
  );
}

/* ── Integration card (mirror: whole card is a link) ─────────────────────── */
function IntegrationCard({ item }: { item: IntegrationItem }) {
  return (
    <Link
      href={`/signup?integration=${item.slug}`}
      className="group relative flex flex-col gap-y-8 rounded-3xl border border-black-700 p-4 text-white transition-colors duration-200 hover:bg-white/[0.04]"
    >
      <div className="flex items-center gap-x-2">
        {item.logo ? (
          <Image
            src={item.logo}
            alt=""
            width={40}
            height={40}
            className="h-10 w-10 shrink-0 object-contain"
          />
        ) : item.icon ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-500/15 text-purple-300">
            <item.icon className="h-5 w-5" />
          </span>
        ) : null}
        <div className="ml-2 flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-24 font-bold">{item.name}</span>
          {item.badge && (
            <span className="rounded-full bg-gradient-to-r from-white/60 via-white/20 to-white/60 p-px">
              <span className="flex h-5 items-center justify-center rounded-full bg-black-900 px-1.5 text-12">
                {item.badge}
              </span>
            </span>
          )}
        </div>
        <div className="ml-auto flex size-9 shrink-0 self-start rounded-xl border border-black-700 opacity-0 transition-opacity group-hover:opacity-100 max-lg:hidden">
          <ArrowUpRight className="m-auto h-4 w-4" />
        </div>
      </div>
      <p className="text-14">{item.description}</p>
    </Link>
  );
}

export function IntegrationsExplorer() {
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>(
    CATEGORIES[0].title,
  );

  const visibleCategories = useMemo(() => {
    const q = query.trim().toLowerCase();
    return CATEGORIES.map((category) => ({
      title: category.title,
      count: category.slugs.length,
      items: category.slugs
        .map((slug) => INTEGRATIONS[slug])
        .filter(
          (item) =>
            !q ||
            item.name.toLowerCase().includes(q) ||
            item.description.toLowerCase().includes(q),
        ),
    })).filter((category) => category.items.length > 0);
  }, [query]);

  const totalVisible = visibleCategories.reduce(
    (sum, category) => sum + category.items.length,
    0,
  );

  /* Scroll-spy: highlight the category whose heading has scrolled past,
     like the mirror's on-window:scroll handler on its selector. */
  useEffect(() => {
    const onScroll = () => {
      let current: string | null = null;
      for (const category of CATEGORIES) {
        const el = document.getElementById(categoryId(category.title));
        if (el && el.getBoundingClientRect().top <= 180) {
          current = category.title;
        }
      }
      if (current) setActiveCategory(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const jumpToCategory = (title: string) => {
    setActiveCategory(title);
    const scroll = () =>
      document
        .getElementById(categoryId(title))
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (document.getElementById(categoryId(title))) {
      scroll();
    } else {
      /* Section is hidden by the current search — clear it, then scroll. */
      setQuery("");
      window.setTimeout(scroll, 60);
    }
  };

  return (
    <div className="section-container flex flex-col px-4 py-16 md:py-20 xl:flex-row xl:gap-20 xl:py-28">
      {/* ─── Sidebar: categories + search (mirror) ─────────────────────── */}
      <div className="h-fit shrink-0 self-start xl:sticky xl:top-24 xl:w-[22rem]">
        <div
          id="category-selector"
          className="mb-4 flex w-full flex-col gap-y-6 rounded-5xl bg-black-800 px-4 pt-6 pb-8 md:mb-9 md:px-6 xl:mb-6"
        >
          <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between xl:flex-col xl:items-stretch">
            <span className="text-14 font-semibold text-white">CATEGORIES</span>
            <div className="relative flex items-center text-white">
              <Search className="absolute left-3.5 h-5 w-5" />
              <input
                type="text"
                placeholder="Find an integration"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10 w-full rounded-xl bg-white/5 py-2.5 pr-3.5 pl-11 text-14 font-medium text-white transition-[background] placeholder:text-white hover:bg-white/10 focus:bg-black focus:outline-none focus:placeholder:text-white/20"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5 overflow-x-auto md:flex md:flex-row xl:flex-col xl:gap-4">
            {CATEGORIES.map((category) => {
              const active = activeCategory === category.title;
              return (
                <button
                  key={category.title}
                  type="button"
                  onClick={() => jumpToCategory(category.title)}
                  className={`flex items-center justify-between gap-x-1.5 rounded-xl border px-3.5 py-2.5 text-14 font-medium text-nowrap transition-[border,background,color] ${
                    active
                      ? "border-white bg-white text-black-900"
                      : "border-black-600 text-white hover:bg-white/5 xl:border-transparent"
                  }`}
                >
                  <span className="truncate">{category.title}</span>
                  <span className="flex w-7.5 shrink-0 justify-center rounded-full bg-black py-0.5 text-12 text-white">
                    {category.slugs.length}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Request-integration card — sidebar placement (xl only, mirror) */}
        <RequestIntegrationCard className="max-xl:hidden" />
      </div>

      {/* ─── Category sections (mirror) ────────────────────────────────── */}
      <div className="min-w-0 flex-1 pt-10 xl:pt-0">
        {visibleCategories.map((category, idx) => (
          <section key={category.title} className={idx > 0 ? "mt-6" : ""}>
            {idx > 0 && (
              <div
                aria-hidden="true"
                className="mt-9 mb-6 h-px w-full"
                style={{
                  backgroundImage:
                    "radial-gradient(circle, #3a3956 0.5px, transparent 0.5px)",
                  backgroundSize: "11px 1px",
                  backgroundPosition: "left top",
                  backgroundRepeat: "repeat-x",
                }}
              />
            )}
            <h3
              id={categoryId(category.title)}
              className="mb-9 scroll-mt-28 text-24 font-semibold text-white"
            >
              {category.title}
            </h3>
            <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
              {category.items.map((item) => (
                <IntegrationCard key={item.slug} item={item} />
              ))}
            </div>
          </section>
        ))}

        {totalVisible === 0 && (
          <div className="rounded-3xl border border-black-700 bg-black-800/40 px-6 py-12 text-center">
            <p className="text-16 text-black-300">
              Nothing here matches &quot;{query}&quot; yet.
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-4 text-14 font-semibold text-purple-400 hover:underline"
            >
              Reset the search
            </button>
          </div>
        )}

        {/* Request-integration card — below the sections (below xl, mirror) */}
        <RequestIntegrationCard className="mt-16 xl:hidden" />
      </div>
    </div>
  );
}
