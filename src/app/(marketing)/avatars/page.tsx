import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  Send,
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
/* Avatars page.                                                          */
/* Phase-2 branding: all body copy rewritten originally for NxtSend.      */
/* Removed per owner-approved defaults: the two hero testimonials, the    */
/* trusted-by ratings/claims row, the company wordmark row and the        */
/* 16-review wall (D1–D4). The wall section is replaced by an original    */
/* "What's included" product section below. No third-party tracking       */
/* scripts/IDs and no external brand links are carried over.              */
/* All visuals on this page are native compositions built from the        */
/* app's illustrative persona set (public/images/agents).                 */
/* ──────────────────────────────────────────────────────────────────────── */

/* Illustrative personas — the same set the homepage uses. */
const personas = [
  { name: "Daniel C.", role: "Regional Director", photo: "/images/agents/daniel-c.webp" },
  { name: "Emery E.", role: "Head of Sales", photo: "/images/agents/emery-e.webp" },
  { name: "James Miller", role: "Senior Business Development", photo: "/images/agents/james-miller.webp" },
  { name: "Michael B.", role: "Sales Agent", photo: "/images/agents/michael-b.webp" },
  { name: "Emily Johnson", role: "Sales Agent", photo: "/images/agents/emily-johnson.webp" },
  { name: "Olivia W.", role: "Sales Agent", photo: "/images/agents/olivia-w.webp" },
  { name: "Chris H.", role: "Sales Agent", photo: "/images/agents/chris-h.webp" },
  { name: "Thomas E.", role: "Sales Agent", photo: "/images/agents/thomas-e.webp" },
];

/* ── How it works (three steps) ────────────────────────────────────────── */
const steps = [
  {
    number: "1",
    title: "Choose your avatars",
    text: "Pick how many profiles you need and tell our team which market you want to cover",
    visual: "select",
  },
  {
    number: "2",
    title: "Shape each profile",
    text: "Share the headline, photo, experience and location you want — we prepare and warm each profile for you",
    visual: "form",
  },
  {
    number: "3",
    title: "Launch from one workspace",
    text: "Run campaigns and handle every reply from the same NxtSend inbox you use for your own accounts",
    visual: "workspace",
  },
] as const;

/* Step 1 visual — profile select cards (native composition). */
function SelectVisual() {
  const rows = personas.slice(0, 3);
  return (
    <div
      aria-hidden="true"
      className="mx-auto flex aspect-square w-full max-w-[21rem] items-center justify-center rounded-3xl bg-[linear-gradient(150deg,#f4f2ff_0%,#e8ecff_60%,#ffeef5_100%)] p-5"
    >
      <div className="w-full space-y-2.5">
        {rows.map((persona, i) => (
          <div
            key={persona.name}
            className={`flex items-center gap-3 rounded-2xl bg-white p-3 shadow-lg ${
              i === 0 ? "ring-2 ring-purple-600" : "ring-1 ring-black-900/5"
            }`}
          >
            <Image
              src={persona.photo}
              alt=""
              width={72}
              height={72}
              className="h-10 w-10 shrink-0 rounded-full object-cover object-top"
            />
            <span className="min-w-0 flex-1 leading-tight">
              <span className="block truncate text-14 font-bold text-black-900">
                {persona.name}
              </span>
              <span className="block truncate text-12 text-black-400">
                {persona.role}
              </span>
            </span>
            <span
              className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                i === 0
                  ? "bg-purple-600 text-white"
                  : "border border-black-900/15 text-transparent"
              }`}
            >
              <Check className="h-3 w-3" />
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* Step 3 visual — a mini workspace window (native composition). */
function WorkspaceVisual() {
  const rows = personas.slice(3, 6);
  return (
    <div
      aria-hidden="true"
      className="mx-auto flex aspect-square w-full max-w-[21rem] items-center justify-center rounded-3xl bg-[linear-gradient(160deg,#14142b_0%,#0b0b16_70%)] p-5"
    >
      <div className="w-full overflow-hidden rounded-2xl border border-white/10 bg-black-900 shadow-2xl">
        <div className="flex items-center gap-1.5 border-b border-white/10 px-3.5 py-2.5">
          <span className="h-2 w-2 rounded-full bg-white/15" />
          <span className="h-2 w-2 rounded-full bg-white/15" />
          <span className="h-2 w-2 rounded-full bg-white/15" />
          <span className="ml-2 rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-medium text-white/40">
            app.nxtsend.com
          </span>
        </div>
        <div className="space-y-2 p-3.5">
          {rows.map((persona) => (
            <div
              key={persona.name}
              className="flex items-center gap-2.5 rounded-xl bg-white/5 px-3 py-2.5"
            >
              <Image
                src={persona.photo}
                alt=""
                width={56}
                height={56}
                className="h-7 w-7 shrink-0 rounded-full object-cover object-top"
              />
              <span className="min-w-0 flex-1 space-y-1.5">
                <span className="block h-1.5 w-4/5 rounded bg-white/25" />
                <span className="block h-1.5 w-3/5 rounded bg-white/15" />
              </span>
              <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
            </div>
          ))}
          <div className="flex items-center justify-center gap-2 rounded-xl bg-gradient-brand px-3 py-2.5 text-12 font-semibold text-white">
            <Send className="h-3.5 w-3.5" />
            Launch campaign
          </div>
        </div>
      </div>
    </div>
  );
}

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
      {/* HERO (rounded banner — gradient backdrop with a native fan of       */}
      {/* persona profile cards along the bottom, gradient headline)         */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="px-2.5 pt-24 sm:pt-28">
        <div className="relative flex min-h-[720px] flex-col items-center overflow-hidden rounded-5xl px-4 pt-16 md:px-6 xl:rounded-8xl">
          <div
            aria-hidden="true"
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(90% 60% at 50% 0%, rgba(124,58,237,0.35) 0%, transparent 60%), radial-gradient(60% 45% at 50% 110%, rgba(37,99,235,0.25) 0%, transparent 65%), linear-gradient(180deg, #0d0a1a 0%, #07070f 100%)",
            }}
          />
          {/* Persona card fan — native composition */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 flex items-end justify-center"
          >
            {[
              { persona: personas[3], rotate: "-13deg", y: "2.5rem", hide: "hidden lg:block" },
              { persona: personas[4], rotate: "-6.5deg", y: "1rem", hide: "hidden sm:block" },
              { persona: personas[0], rotate: "0deg", y: "0px", hide: "" },
              { persona: personas[5], rotate: "6.5deg", y: "1rem", hide: "hidden sm:block" },
              { persona: personas[6], rotate: "13deg", y: "2.5rem", hide: "hidden lg:block" },
            ].map(({ persona, rotate, y, hide }) => (
              <div
                key={persona.name}
                className={`-mx-3 w-44 shrink-0 sm:w-52 ${hide}`}
                style={{ transform: `rotate(${rotate}) translateY(${y})` }}
              >
                <div className="overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black-900/10">
                  <div className="h-12 bg-gradient-to-r from-purple-500 via-indigo-500 to-sky-400" />
                  <div className="px-4 pb-4">
                    <Image
                      src={persona.photo}
                      alt=""
                      width={96}
                      height={96}
                      className="-mt-7 h-14 w-14 rounded-full object-cover object-top ring-4 ring-white"
                    />
                    <p className="mt-2 truncate text-15 font-bold text-black-900">
                      {persona.name}
                    </p>
                    <p className="truncate text-12 text-black-400">
                      {persona.role}
                    </p>
                    <div className="mt-3 space-y-1.5">
                      <div className="h-1.5 w-full rounded bg-black-900/10" />
                      <div className="h-1.5 w-2/3 rounded bg-black-900/10" />
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
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
      {/* HOW IT WORKS (3 step cards over a soft gradient glow)               */}
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
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-1/2 h-[26rem] w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 rounded-full bg-purple-600/25 opacity-30 blur-[130px]"
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
                  {step.visual === "select" ? (
                    <SelectVisual />
                  ) : step.visual === "workspace" ? (
                    <WorkspaceVisual />
                  ) : (
                    /* Step 2's visual is a static form illustration file. */
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src="/images/avatars/step-2.svg"
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

          {/* Persona grid under the steps (native composition) */}
          <div
            role="img"
            aria-label="Rented LinkedIn avatars in NxtSend"
            className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            {personas.map((persona) => (
              <div
                key={persona.name}
                className="flex items-center gap-3 rounded-3xl border border-white/10 bg-white/[2.5%] p-4"
              >
                <Image
                  src={persona.photo}
                  alt=""
                  width={96}
                  height={96}
                  className="h-12 w-12 shrink-0 rounded-full object-cover object-top"
                />
                <span className="min-w-0 leading-tight">
                  <span className="block truncate text-15 font-bold text-white">
                    {persona.name}
                  </span>
                  <span className="block truncate text-12 text-white/50">
                    {persona.role}
                  </span>
                </span>
              </div>
            ))}
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
