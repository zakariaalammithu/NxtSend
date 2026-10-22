import Link from "next/link";
import Image from "next/image";
import { ArrowRight } from "lucide-react";
import { INTEGRATION_REGISTRY } from "@/lib/integrations-center/registry";

/**
 * Home integrations section (P6 rebuild) — real cards, Muse.ai first.
 *
 * Names and purpose lines come from the Integration Center registry
 * (src/lib/integrations-center/registry.ts) — the same descriptors the
 * in-app Integration Center renders — so this section cannot drift
 * from the product's source of truth. The status chip on each card is
 * the honest, registry-derived state for a fresh workspace:
 *
 * - muse-ai      → kind "unsupported": no public API drives a user's
 *                  Muse agent; the supported path is the Muse
 *                  Connector Platform. Chip says exactly that — the
 *                  card NEVER claims "Connected".
 * - openai / anthropic → real adapters that need the owner's API key.
 * - resend       → the sending provider adapter.
 * - gmail / microsoft → real OAuth mailbox adapters; connecting
 *                  happens inside the app, per mailbox.
 * - n8n / zapier → both ride the registry's "webhooks" descriptor:
 *                  signed outbound events, not native apps.
 * - warmup (Instantly) → read-only warm-up status reporting.
 * - google-sheets / crm (HubSpot) → kind "info": NOT implemented;
 *                  the chips say so instead of implying a sync.
 *
 * Logos: every card carries the company's REAL brand mark from
 * public/images/integrations/logos/ (P6 logo pass) — the Muse
 * squiggle served by muse.ai itself, the simple-icons brand glyphs
 * for OpenAI, Claude, Resend, Gmail, Outlook and Google Sheets in
 * their official brand colours (white variants for the two marks
 * whose brand colour is black), and the brand files for n8n,
 * Zapier, Instantly and HubSpot. No fabricated logos.
 */

const byId = (id: string) => {
  const d = INTEGRATION_REGISTRY.find((entry) => entry.id === id);
  if (!d) throw new Error(`Integration registry is missing "${id}"`);
  return d;
};

type ChipTone = "setup" | "ready" | "neutral" | "planned";

const chipTones: Record<ChipTone, string> = {
  // Action the owner must take (key, plan, OAuth, connector setup).
  setup: "bg-amber-400/10 text-amber-200 ring-amber-300/25",
  // A real adapter/mechanism exists in the product.
  ready: "bg-emerald-400/10 text-emerald-200 ring-emerald-300/25",
  // Factual mechanism note.
  neutral: "bg-white/[0.06] text-white/55 ring-white/10",
  // Honestly not built yet.
  planned: "bg-white/[0.04] text-white/40 ring-white/10",
};

interface HomeCard {
  name: string;
  purpose: string;
  chip: string;
  tone: ChipTone;
  logo: string;
}

const LOGOS = "/images/integrations/logos";

/**
 * Constellation layout (5 columns × 4 rows, row-major; null = the
 * empty outline tile). Filled positions follow a scattered pattern
 * and use only real logo files: Make, OpenAI,
 * Muse, Zapier, Google, Slack, n8n, and the outbound-sync mark.
 */
const CONSTELLATION: (string | null)[] = [
  null, `${LOGOS}/make.svg`, null, `${LOGOS}/openai.svg`, null,
  `${LOGOS}/muse.svg`, null, `${LOGOS}/zapier.svg`, null, `${LOGOS}/google.svg`,
  null, `${LOGOS}/slack.svg`, null, `${LOGOS}/n8n.svg`, null,
  null, null, `${LOGOS}/outbound-sync.png`, null, null,
];

const CARDS: HomeCard[] = [
  {
    // Registry: muse-ai — "Muse.ai (Meta Muse)", kind unsupported.
    name: byId("muse-ai").name,
    purpose:
      "Connect NxtSend to Meta's Muse agent through the Muse Connector Platform — NxtSend exposes the API, Muse calls it.",
    chip: "Connector Platform — see setup",
    tone: "setup",
    logo: `${LOGOS}/muse.svg`,
  },
  {
    name: byId("openai").name,
    purpose: byId("openai").tagline,
    chip: "API key required",
    tone: "setup",
    logo: `${LOGOS}/openai.svg`,
  },
  {
    name: byId("anthropic").name,
    purpose: byId("anthropic").tagline,
    chip: "API key required",
    tone: "setup",
    logo: `${LOGOS}/claude.svg`,
  },
  {
    // Registry name: "Email / Resend".
    name: "Resend",
    purpose: byId("resend").tagline,
    chip: "Sending provider",
    tone: "ready",
    logo: `${LOGOS}/resend.svg`,
  },
  {
    name: byId("gmail").name,
    purpose: byId("gmail").tagline,
    chip: "OAuth — connect in the app",
    tone: "ready",
    logo: `${LOGOS}/gmail.svg`,
  },
  {
    name: byId("microsoft").name,
    purpose: byId("microsoft").tagline,
    chip: "OAuth — connect in the app",
    tone: "ready",
    logo: `${LOGOS}/outlook.svg`,
  },
  {
    // Rides the registry "webhooks" descriptor (signed outbound events).
    name: "n8n",
    purpose:
      "Trigger n8n workflows from signed NxtSend events when leads and campaigns change.",
    chip: "Via outbound webhooks",
    tone: "neutral",
    logo: `${LOGOS}/n8n.svg`,
  },
  {
    // Rides the registry "webhooks" descriptor (signed outbound events).
    name: "Zapier",
    purpose:
      "Send NxtSend events into your Zaps through a Zapier Catch Hook endpoint.",
    chip: "Via outbound webhooks",
    tone: "neutral",
    logo: `${LOGOS}/zapier.svg`,
  },
  {
    // Registry: warmup — "Email Warm-up (Instantly)", read-only status.
    name: "Instantly — Email Warm-up",
    purpose: byId("warmup").tagline,
    chip: "Warm-up status — read-only",
    tone: "neutral",
    logo: `${LOGOS}/instantly.svg`,
  },
  {
    name: byId("google-sheets").name,
    purpose: byId("google-sheets").tagline,
    chip: "Not implemented — CSV export today",
    tone: "planned",
    logo: `${LOGOS}/google-sheets.svg`,
  },
  {
    // Registry: crm — "CRM (HubSpot)", kind info, not implemented.
    name: "HubSpot CRM",
    purpose: byId("crm").tagline,
    chip: "Not implemented",
    tone: "planned",
    logo: `${LOGOS}/hubspot.svg`,
  },
];

export function HomeIntegrations() {
  return (
    /* Section shell restyled to the bizreviewradar.com treatment
       (P6 addendum): near-black #05070f base, a white 1px grid at
       64px cells / 5% opacity masked by a radial fade near the top,
       and a deep-blue radial glow anchored low in the section. */
    <section className="relative isolate overflow-hidden border-t border-white/10 bg-[#05070f]">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-x-0 top-0 h-[46rem]"
        style={{
          background:
            "radial-gradient(120% 70% at 50% 78%, rgba(23,37,215,0.55) 0%, rgba(12,17,80,0.5) 42%, rgba(5,7,15,0) 72%)",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-[0.05]"
        style={{
          backgroundImage:
            "linear-gradient(to right, #fff 1px, transparent 1px), linear-gradient(to bottom, #fff 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          maskImage:
            "radial-gradient(60% 45% at 50% 18%, #000, transparent)",
          WebkitMaskImage:
            "radial-gradient(60% 45% at 50% 18%, #000, transparent)",
        }}
      />
      <div className="section-container relative py-24 lg:py-32">
        {/* Decorative tile constellation above the heading — the
            bizreviewradar.com header treatment the owner asked for
            (P6 follow-up): a 5×4 grid of rounded tiles, most of them
            EMPTY outline boxes (part of the design), the rest filled
            with real brand logos. Purely decorative: aria-hidden, no
            links, no status claims. */}
        <div
          aria-hidden="true"
          className="mx-auto mb-12 grid w-fit grid-cols-5 gap-3 sm:mb-16 sm:gap-5"
        >
          {CONSTELLATION.map((logo, i) =>
            logo ? (
              <span
                key={i}
                className="flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.16] via-white/[0.06] to-white/[0.02] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] sm:h-20 sm:w-20 sm:rounded-[1.4rem] sm:p-4"
              >
                <Image
                  src={logo}
                  alt=""
                  width={48}
                  height={48}
                  className="max-h-full w-auto max-w-full object-contain"
                />
              </span>
            ) : (
              <span
                key={i}
                className="h-14 w-14 rounded-2xl border border-white/[0.07] bg-white/[0.015] sm:h-20 sm:w-20 sm:rounded-[1.4rem]"
              />
            ),
          )}
        </div>

        <div className="mx-auto max-w-3xl text-center">
          <p className="text-12 font-semibold uppercase tracking-widest text-emerald-400">
            Integrations
          </p>
          <h2 className="mt-4 text-36 font-semibold leading-[1.08] tracking-tight text-white sm:text-48">
            Integrates with your favorite tools
          </h2>
          <p className="mx-auto mt-5 max-w-2xl text-16 leading-relaxed text-white/60">
            Every card below shows the integration&rsquo;s real state in
            NxtSend today — what works, what needs your key or plan, and
            what is not built yet. Nothing is presented as connected
            until it is configured in the Integration Center.
          </p>
        </div>

        <ul className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {CARDS.map((card) => (
            <li key={card.name} className="group relative">
              <Link
                href="/integrations"
                className="relative flex h-full flex-col rounded-3xl border border-white/10 bg-white/[0.04] p-6 shadow-[0_18px_50px_-24px_rgba(0,0,0,0.9)] backdrop-blur-xl transition-all duration-300 group-hover:-translate-y-1 group-hover:border-white/20 group-hover:bg-white/[0.07]"
              >
                <div className="flex items-start gap-3">
                  <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.16] via-white/[0.06] to-white/[0.02] p-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)]">
                    <Image
                      src={card.logo}
                      alt=""
                      width={44}
                      height={44}
                      className="max-h-full w-auto max-w-full object-contain"
                    />
                  </span>
                  <span
                    className={`ml-auto shrink-0 rounded-full px-2.5 py-0.5 text-10 font-semibold uppercase tracking-wider ring-1 ring-inset ${chipTones[card.tone]}`}
                  >
                    {card.chip}
                  </span>
                </div>
                <span className="mt-4 text-16 font-semibold text-white">
                  {card.name}
                </span>
                <span className="mt-1.5 text-14 leading-relaxed text-white/60">
                  {card.purpose}
                </span>
              </Link>
            </li>
          ))}
        </ul>

        <div className="mt-12 flex justify-center">
          <Link
            href="/integrations"
            className="group inline-flex h-10 items-center justify-center gap-2 rounded-full bg-white px-7 text-14 font-semibold text-[#05070f] shadow-[0_8px_30px_-8px_rgba(255,255,255,0.45)] transition hover:bg-white/90"
          >
            <span>Explore integrations</span>
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
          </Link>
        </div>
      </div>
    </section>
  );
}
