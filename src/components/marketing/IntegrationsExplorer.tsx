"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { ArrowUpRight, Search } from "lucide-react";

/**
 * Integrations explorer (mirror: aimfox.com/integrations).
 *
 * Every category name, integration name, description and badge below is
 * copied verbatim from the downloaded mirror (ZIP 2,
 * "2. aimfox.com.integrations/www.aimfox.com/integrations.html") —
 * including the mirror's own spellings ("Hubspot", "code free
 * automations", "though LinkedIn"). The mirror renders all five
 * category sections; its category selector scrolls to a section and
 * highlights the one in view (scroll-spy), and its search box filters
 * the cards — both behaviours are reproduced here.
 *
 * Link mapping (no Aimfox URLs are carried over):
 * - Cards: the mirror links each card to a per-integration detail page
 *   (aimfox.com/integrations/<slug>) that was not part of the download
 *   and does not exist in this app, so cards map to the app route
 *   /signup?integration=<slug>.
 * - "Request integration": the mirror points at Aimfox's external
 *   roadmap board (userback.io); here it maps to the app route /contact.
 */

interface IntegrationItem {
  slug: string;
  name: string;
  description: string;
  badge?: string;
  logo: string;
}

const LOGOS = "/images/integrations/logos";

/* ── Integrations (mirror order within each category) ────────────────────── */
const INTEGRATIONS: Record<string, IntegrationItem> = {
  instantly: {
    slug: "instantly",
    name: "Instantly",
    description:
      "Connect your Instantly workspace to Aimfox and sync emails with LinkedIn outreach",
    badge: "2-way sync",
    logo: `${LOGOS}/instantly.svg`,
  },
  clay: {
    slug: "clay",
    name: "Clay",
    description: "Personalize your outbound by leveraging perfect data",
    logo: `${LOGOS}/clay.webp`,
  },
  n8n: {
    slug: "n8n",
    name: "n8n",
    description:
      "Automate your outreach with powerful workflows - connect Aimfox to n8n",
    badge: "2-way sync",
    logo: `${LOGOS}/n8n.svg`,
  },
  slack: {
    slug: "slack",
    name: "Slack",
    description: "Get notified to your Slack workspace once a lead engages",
    logo: `${LOGOS}/slack.svg`,
  },
  smartlead: {
    slug: "smartlead",
    name: "Smartlead",
    description:
      "Connect Aimfox to your Smartlead workspace and start with multichannel campaigns!",
    badge: "2-way sync",
    logo: `${LOGOS}/smartlead.svg`,
  },
  aimfox: {
    slug: "aimfox",
    name: "Aimfox",
    description:
      "Seamlessly sync your LinkedIn sessions with Aimfox without providing a password",
    badge: "Chrome extensions",
    logo: `${LOGOS}/aimfox.webp`,
  },
  zapier: {
    slug: "zapier",
    name: "Zapier",
    description:
      "Automate your outreach by connecting Aimfox to thousands of apps on Zapier",
    badge: "2-way sync",
    logo: `${LOGOS}/zapier.svg`,
  },
  make: {
    slug: "make",
    name: "Make",
    description: "Link Aimfox with Make to build custom, code free automations",
    badge: "2-way sync",
    logo: `${LOGOS}/make.svg`,
  },
  pabbly: {
    slug: "pabbly",
    name: "Pabbly",
    description:
      "Use Pabbly to link Aimfox to your favorite apps and streamline the flow",
    badge: "2-way sync",
    logo: `${LOGOS}/pabbly.svg`,
  },
  "outbound-sync": {
    slug: "outbound-sync",
    name: "Outbound Sync",
    description: "Integrate outbound with HubSpot and Salesforce",
    logo: `${LOGOS}/outbound-sync.png`,
  },
  hubspot: {
    slug: "hubspot",
    name: "Hubspot",
    description: "Send leads to your Hubspot workspace and never miss a deal",
    badge: "2-way sync",
    logo: `${LOGOS}/hubspot.svg`,
  },
  pipedrive: {
    slug: "pipedrive",
    name: "Pipedrive",
    description:
      "Sync your outreach efforts with your CRM and stay on top of opportunities",
    badge: "2-way sync",
    logo: `${LOGOS}/pipedrive.svg`,
  },
  close: {
    slug: "close",
    name: "Close",
    description: "Close deals by converting interested deals into contacts",
    badge: "2-way sync",
    logo: `${LOGOS}/close.svg`,
  },
  salesforce: {
    slug: "salesforce",
    name: "Salesforce",
    description: "Send qualified leads to Salesforce and keep it streamlined",
    badge: "2-way sync",
    logo: `${LOGOS}/salesforce.svg`,
  },
  masterinbox: {
    slug: "masterinbox",
    name: "Masterinbox",
    description:
      "Connect your mailboxes and LinkedIn inboxes through a single inbox manager",
    badge: "2-way sync",
    logo: `${LOGOS}/masterinbox.svg`,
  },
  emailbison: {
    slug: "emailbison",
    name: "EmailBison",
    description: "The leading email sequencer for top-tier agencies",
    badge: "2-way sync",
    logo: `${LOGOS}/emailbison.jpg`,
  },
  weezly: {
    slug: "weezly",
    name: "Weezly",
    description: "Send personalized videos at scale",
    badge: "Coming soon",
    logo: `${LOGOS}/weezly.svg`,
  },
  trigify: {
    slug: "trigify",
    name: "Trigify",
    description: "Connect with your leads at the perfect moment",
    badge: "Coming soon",
    logo: `${LOGOS}/trigify.svg`,
  },
  rb2b: {
    slug: "rb2b",
    name: "RB2b",
    description: "Reach out to your website visitors though LinkedIn",
    logo: `${LOGOS}/rb2b.svg`,
  },
};

/* ── Categories (mirror order; counts match the mirror's selector) ───────── */
const CATEGORIES: { title: string; slugs: string[] }[] = [
  { title: "Top Choice", slugs: ["instantly", "clay", "n8n", "slack", "smartlead"] },
  {
    title: "Automations",
    slugs: ["aimfox", "n8n", "zapier", "make", "pabbly", "slack", "clay", "outbound-sync"],
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
          Have an idea for an Aimfox integration? Share it here
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
        <Image
          src={item.logo}
          alt=""
          width={40}
          height={40}
          className="h-10 w-10 shrink-0"
        />
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
                placeholder="Search Integrations"
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
              No integrations match &quot;{query}&quot;.
            </p>
            <button
              type="button"
              onClick={() => setQuery("")}
              className="mt-4 text-14 font-semibold text-purple-400 hover:underline"
            >
              Clear search
            </button>
          </div>
        )}

        {/* Request-integration card — below the sections (below xl, mirror) */}
        <RequestIntegrationCard className="mt-16 xl:hidden" />
      </div>
    </div>
  );
}
