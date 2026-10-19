import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Headphones,
} from "lucide-react";
import { AvatarsShowcase } from "@/components/marketing/AvatarsShowcase";
import { AvatarsPricing } from "@/components/marketing/AvatarsPricing";

export const metadata: Metadata = {
  title: { absolute: "NxtSend Avatars – Rent LinkedIn accounts for outreach" },
  description:
    "NxtSend Avatars are prepared LinkedIn profiles you can rent, personalize and manage alongside your own accounts — so you can run more outreach from one workspace.",
};

/* ──────────────────────────────────────────────────────────────────────── */
/* Avatars page (layout provenance: aimfox.com/avatars mirror, ZIP 4).    */
/* Phase-2 branding: all body copy rewritten originally for NxtSend.      */
/* Removed per owner-approved defaults: the two hero testimonials, the    */
/* trusted-by ratings/claims row, the company wordmark row and the        */
/* 16-review wall (D1–D4). The wall section is replaced by an original    */
/* "What's included" product section below. No third-party tracking       */
/* scripts/IDs and no external brand links are carried over.              */
/* ──────────────────────────────────────────────────────────────────────── */

/* ── How it works (three steps) ────────────────────────────────────────── */
const steps = [
  {
    number: "1",
    title: "Choose your avatars",
    text: "Pick how many profiles you need and tell our team which market you want to cover",
    image: "/images/avatars/step-1.webp",
  },
  {
    number: "2",
    title: "Shape each profile",
    text: "Share the headline, photo, experience and location you want — we prepare and warm each profile for you",
    image: "/images/avatars/step-2.svg",
  },
  {
    number: "3",
    title: "Launch from one workspace",
    text: "Run campaigns and handle every reply from the same NxtSend inbox you use for your own accounts",
    image: "/images/avatars/step-3.webp",
  },
];

/* ── What's included with every avatar (original product section that ─── */
/* replaces the removed review wall; product copy only, no testimonials)  */
const included = [
  {
    title: "Personalized profile setup",
    text: "Photo, banner, headline, experience and summary are shaped around the persona and offer you want each profile to carry.",
  },
  {
    title: "Location matched to your market",
    text: "Profiles are prepared for the region you sell into, so your outreach comes from a presence that fits your audience.",
  },
  {
    title: "Warmed before you start",
    text: "Every profile goes through preparation and early activity before handover, so it arrives ready to join your campaigns.",
  },
  {
    title: "One inbox for everything",
    text: "Replies from avatar profiles land in the same NxtSend inbox as your own accounts — no separate tools or logins to juggle.",
  },
  {
    title: "Campaigns alongside your seats",
    text: "Run avatar profiles in the same campaigns and sequences as your connected seats, and manage sending limits in one place.",
  },
  {
    title: "Ongoing care from our team",
    text: "If a profile needs attention, our team helps you review it and keep your outreach running from your workspace.",
  },
];

export default function AvatarsPage() {
  return (
    <div className="relative overflow-hidden bg-black-900">
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HERO (rounded banner — hero-bg artwork with the avatar profile     */}
      {/* collage from hero.webp along the bottom, gradient headline)        */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="px-2.5 pt-24 sm:pt-28">
        <div className="relative flex min-h-[720px] flex-col items-center overflow-hidden rounded-5xl px-4 pt-16 md:px-6 xl:rounded-8xl">
          <Image
            src="/images/avatars/hero-bg.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <Image
            src="/images/avatars/hero.webp"
            alt=""
            width={3362}
            height={1442}
            priority
            className="pointer-events-none absolute bottom-0 left-1/2 w-[140%] max-w-none -translate-x-1/2 sm:w-full"
          />
          <h1 className="relative z-10 mb-5 max-w-4xl bg-gradient-purple-horizontal bg-clip-text text-center text-48 font-semibold text-transparent md:text-54 2xl:text-64">
            Additional LinkedIn profiles, tailored and ready to send
          </h1>
          <p className="relative z-10 mb-6 text-center text-15 font-medium text-white">
            Rent fully prepared profiles and expand your outreach without
            tying up your own account.
          </p>
          <div className="relative z-10 flex justify-center gap-x-3">
            <Link
              href="/demo"
              className="flex h-10.5 items-center justify-center rounded-full bg-black-900 px-5 text-16 font-semibold whitespace-nowrap text-white transition-colors hover:bg-black-600"
            >
              Talk to our team
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HOW IT WORKS (3 step cards over the bg-graphic artwork)             */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24 lg:py-32">
        <div className="section-container relative">
          <div className="text-center">
            <span className="text-13 font-bold tracking-widest text-purple-400 uppercase">
              How it works
            </span>
            <h2 className="mt-4 text-36 font-bold tracking-tight text-white sm:text-48">
              From setup to sending in three steps
            </h2>
          </div>

          {/* Layout: the 3 step cards stand side by side on xl (each w-90,
              visual on top, text below); below xl they stack as wide
              horizontal cards. */}
          <div className="relative mx-auto mt-20 flex w-full max-w-[74.5rem] flex-col gap-y-16 px-6 md:px-2.5 xl:flex-row xl:justify-between xl:px-0">
            <Image
              src="/images/avatars/steps-bg.webp"
              alt=""
              width={1200}
              height={806}
              className="pointer-events-none absolute top-1/2 left-1/2 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 opacity-30"
            />
            {steps.map((step) => (
              <div
                key={step.number}
                className="relative flex flex-col gap-8 rounded-7xl border border-white/10 bg-white/[2.5%] px-3 pt-7 pb-9 shadow-[2px_4px_16px_0_rgba(247,247,247,0.06)_inset] backdrop-blur-md md:flex-row md:items-center md:py-0 xl:w-90 xl:flex-col xl:pt-7 xl:pb-9 xl:backdrop-blur-xl"
              >
                <div className="absolute inset-x-0 -top-6.5 mx-auto flex h-13 w-17 items-center justify-center rounded-5xl border border-white/5 bg-white/5 text-14 font-medium text-white shadow-[0_0_0_2px_rgba(18,18,18,0.20),_2px_4px_16px_0_rgba(247,247,247,0.06)_inset]">
                  {step.number}
                </div>
                <div className="flex-1">
                  {step.image?.endsWith(".svg") ? (
                    /* Step 2's visual is a static form illustration file. */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={step.image}
                      alt={step.title}
                      width={648}
                      height={648}
                      className="mx-auto h-full max-h-[21rem] w-auto"
                    />
                  ) : (
                    <Image
                      src={step.image!}
                      alt={step.title}
                      width={648}
                      height={648}
                      className="mx-auto h-full max-h-[21rem] w-auto"
                    />
                  )}
                </div>
                <div className="flex flex-col gap-y-3 px-5 md:flex-1 md:px-0 xl:flex-none xl:px-5">
                  <h3 className="text-20 font-medium text-white/90 md:text-24 xl:text-20">
                    {step.title}
                  </h3>
                  <p className="text-16 text-white/50">{step.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-14 text-center">
            <Link
              href="/demo"
              className="inline-flex h-12 items-center justify-center rounded-full bg-purple-600 px-6 text-16 font-semibold text-white transition-colors hover:bg-purple-800"
            >
              Speak with our team
            </Link>
          </div>

          {/* Responsive app screenshot under the steps */}
          <div className="mx-auto mt-16 max-w-6xl">
            <Image
              src="/images/avatars/showcase-desktop.webp"
              alt="Rented LinkedIn avatars in NxtSend"
              width={1200}
              height={503}
              className="hidden h-auto w-full sm:block"
            />
            <Image
              src="/images/avatars/showcase-mobile.webp"
              alt="Rented LinkedIn avatars in NxtSend"
              width={1200}
              height={825}
              className="h-auto w-full sm:hidden"
            />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* STRATEGY OVERVIEW + WHAT YOU GET (one white panel)                  */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <AvatarsShowcase />

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* PRICING (single avatar card)                                        */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24 lg:py-32">
        <div className="section-container flex flex-col items-center">
          <div className="mx-auto mb-12 flex max-w-2xl flex-col items-center text-center">
            <h2 className="text-48 font-semibold text-white xl:text-54">
              Simple pricing that grows with you
            </h2>
          </div>
          <AvatarsPricing />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* WHAT'S INCLUDED WITH EVERY AVATAR (original section replacing      */}
      {/* the removed review wall — same footprint, product copy only)       */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-900 py-24 lg:py-32">
        <div className="pointer-events-none absolute top-1/2 right-10 h-[350px] w-[350px] -translate-y-1/2 rounded-full bg-purple-600/15 blur-[140px]" />
        <div className="section-container relative z-10">
          <div className="text-center">
            <h2 className="text-36 font-bold tracking-tight text-white sm:text-48">
              What&apos;s included with every avatar
            </h2>
            <p className="mx-auto mt-4 max-w-2xl text-16 text-white/60">
              Each rented profile arrives as a complete, managed package —
              set up around your brief and looked after inside your NxtSend
              workspace.
            </p>
          </div>
          <div className="mx-auto mt-14 grid w-full max-w-5xl grid-cols-1 gap-6 text-left md:grid-cols-2 lg:grid-cols-3">
            {included.map((item) => (
              <div key={item.title} className="glass-card flex flex-col p-6">
                <h3 className="text-16 font-bold text-white">{item.title}</h3>
                <p className="mt-3 text-14 leading-relaxed text-black-200">
                  {item.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* FINAL CTA                                                           */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-black-700/80 bg-gradient-hero py-24">
        <div className="pointer-events-none absolute inset-0 bg-radial-glow opacity-30" />
        <div className="section-container relative z-10 text-center">
          <div className="mx-auto max-w-3xl rounded-3xl border border-purple-500/30 bg-black-800/80 p-8 shadow-glow-purple/20 backdrop-blur-2xl sm:p-14">
            <h2 className="text-36 font-extrabold tracking-tight text-white sm:text-48">
              Ready to add more outreach capacity?
            </h2>
            <p className="mt-4 text-17 text-black-300 sm:text-20">
              Bring prepared avatar profiles into the workspace where you
              already plan campaigns, send sequences and answer replies —
              and give every campaign more room to run.
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
                <Check className="h-3.5 w-3.5 text-green-400" /> No card
                needed to start
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-green-400" />{" "}
                Profiles managed in NxtSend
              </span>
              <span className="flex items-center gap-1.5">
                <Headphones className="h-3.5 w-3.5 text-green-400" /> Help
                from a real team
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
