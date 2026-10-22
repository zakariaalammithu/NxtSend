import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  MessageCircle,
} from "lucide-react";
import { IntegrationsExplorer } from "@/components/marketing/IntegrationsExplorer";

export const metadata: Metadata = {
  title: { absolute: "NxtSend Integrations – Connect Your Tech Stack for LinkedIn Outreach" },
  description:
    "Browse the tools that sit alongside NxtSend — what connects today through signed outbound webhooks and CSV import, and what is still planned. Every card states the integration's real status.",
};

const LOGOS = "/images/integrations/logos";

/**
 * Hero constellation (P8): a native JSX tile composition in the same
 * visual language as the home integrations section — real brand logos
 * from the Integration Center registry set around the NxtSend mark at
 * the centre, on the deep-glow + fine-grid shell. It replaces the
 * retired banner artwork, whose centrepiece was another product's
 * logo. Layout: 5 columns × 4 rows, row-major; null = the
 * empty outline tile that is part of the design.
 */
const HERO_CONSTELLATION: (string | null)[] = [
  null, `${LOGOS}/openai.svg`, null, `${LOGOS}/make.svg`, null,
  `${LOGOS}/slack.svg`, null, `${LOGOS}/muse.svg`, null, `${LOGOS}/zapier.svg`,
  null, `${LOGOS}/n8n.svg`, "/logo.png", `${LOGOS}/google.svg`, null,
  null, null, `${LOGOS}/resend.svg`, null, null,
];

export default function IntegrationsPage() {
  return (
    <div className="relative overflow-hidden bg-black-900">
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HERO — native tile constellation with the H1 at its bottom         */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="px-2.5 pt-24 sm:pt-28">
        <div className="relative flex h-[34.5rem] flex-col items-center overflow-hidden rounded-5xl bg-[#05070f] px-6 md:h-[32.5rem] xl:h-[34rem] xl:rounded-8xl">
          {/* Deep-blue glow + fine grid (home integrations shell) */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0"
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
          {/* Tile constellation — decorative; the centre tile is the
              NxtSend mark itself. */}
          <div
            aria-hidden="true"
            className="relative z-10 grid flex-1 grid-cols-5 content-center gap-3 sm:gap-5"
          >
            {HERO_CONSTELLATION.map((logo, i) =>
              logo ? (
                <span
                  key={i}
                  className={`flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-br from-white/[0.16] via-white/[0.06] to-white/[0.02] p-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] sm:h-20 sm:w-20 sm:rounded-[1.4rem] sm:p-4 ${
                    logo === "/logo.png"
                      ? "ring-1 ring-white/25"
                      : ""
                  }`}
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
          <h1 className="relative z-10 mt-auto mb-0 w-full max-w-[50rem] pb-9 text-center text-36 font-semibold text-white md:text-54 lg:mb-6 xl:text-64 xl:pb-10">
            Connect NxtSend to the tools you already work with
          </h1>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* CATEGORIES + SEARCH + INTEGRATION CARDS                             */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <IntegrationsExplorer />

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* START SCALING YOUR OUTREACH TODAY (final CTA)                       */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-black-700/80 bg-gradient-hero py-24">
        <div className="pointer-events-none absolute inset-0 bg-radial-glow opacity-30" />
        <div className="section-container relative z-10 text-center">
          <div className="mx-auto max-w-3xl rounded-3xl border border-purple-500/30 bg-black-800/80 p-8 shadow-glow-purple/20 backdrop-blur-2xl sm:p-14">
            <h2 className="text-36 sm:text-48 font-extrabold tracking-tight text-white">
              Put your whole outreach stack to work
            </h2>
            <p className="mt-4 text-17 sm:text-20 text-black-300">
              Bring your CRM, automation and messaging tools into one flow,
              so campaigns are easier to run and every lead is easier to
              follow.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="group flex h-13 w-full items-center justify-center gap-2 rounded-full bg-gradient-brand px-9 text-16 font-semibold text-white shadow-glow-purple transition-all duration-300 hover:shadow-glow-orange hover:scale-105 sm:w-auto"
              >
                <span>Get started</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-12 text-black-400">
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-green-400" /> No credit card
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-green-400" /> Safe
                &amp; secure
              </span>
              <Link
                href="/contact"
                className="flex items-center gap-1.5 transition-colors hover:text-white"
              >
                <MessageCircle className="h-3.5 w-3.5 text-green-400" />{" "}
                Questions? Contact us
              </Link>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
