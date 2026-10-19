import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Headphones,
} from "lucide-react";
import { IntegrationsExplorer } from "@/components/marketing/IntegrationsExplorer";

export const metadata: Metadata = {
  title: "NxtSend Integrations – Connect Your Tech Stack for LinkedIn Outreach",
  description:
    "Seamlessly integrate your CRM, Zapier, Slack and other tools with NxtSend to automate LinkedIn campaigns, build leads and unlock your growth stack.",
};

export default function IntegrationsPage() {
  return (
    <div className="relative overflow-hidden bg-black-900">
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HERO (mirror: aimfox.com/integrations — rounded banner image with   */}
      {/* the H1 sitting at its bottom; hero-large.webp on very wide screens) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="px-2.5 pt-24 sm:pt-28">
        <div className="relative flex h-[34.5rem] flex-col items-center overflow-hidden rounded-5xl bg-black-800 px-6 md:h-[32.5rem] xl:h-[34rem] xl:rounded-8xl">
          <Image
            src="/images/integrations/hero.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <Image
            src="/images/integrations/hero-large.webp"
            alt=""
            fill
            sizes="100vw"
            className="hidden object-cover min-[1920px]:block"
          />
          <h1 className="relative z-10 mt-auto mb-0 w-full max-w-[50rem] pb-9 text-center text-36 font-semibold text-white md:text-54 lg:mb-6 xl:text-64 xl:pb-10">
            Browse our expanding collection of integrations
          </h1>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* CATEGORIES + SEARCH + INTEGRATION CARDS (mirror)                    */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <IntegrationsExplorer />

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* START SCALING YOUR OUTREACH TODAY (mirror final CTA)                */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-black-700/80 bg-gradient-hero py-24">
        <div className="pointer-events-none absolute inset-0 bg-radial-glow opacity-30" />
        <div className="section-container relative z-10 text-center">
          <div className="mx-auto max-w-3xl rounded-3xl border border-purple-500/30 bg-black-800/80 p-8 shadow-glow-purple/20 backdrop-blur-2xl sm:p-14">
            <h2 className="text-36 sm:text-48 font-extrabold tracking-tight text-white">
              Start scaling your outreach today
            </h2>
            <p className="mt-4 text-17 sm:text-20 text-black-300">
              Master your LinkedIn outreach. Register now for simple and
              intuitive campaign management and lead generation that delivers.
              Your upgrade starts here
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
              <span className="flex items-center gap-1.5">
                <Headphones className="h-3.5 w-3.5 text-green-400" /> 24/7
                Support
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
