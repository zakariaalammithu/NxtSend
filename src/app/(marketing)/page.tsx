import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Headphones,
  UserRound,
  Users,
} from "lucide-react";
import { HomeFaq } from "@/components/marketing/HomeFaq";
import { HomePricing } from "@/components/marketing/HomePricing";
import { TrustedBy } from "@/components/marketing/TrustedBy";
import { BentoFeatures } from "@/components/marketing/BentoFeatures";
import { LiveView } from "@/components/marketing/LiveView";
import { HomeIntegrations } from "@/components/marketing/HomeIntegrations";

export const metadata: Metadata = {
  title: { absolute: "NxtSend — Reach more of the right people on LinkedIn" },
  description:
    "Run LinkedIn outreach from one workspace with NxtSend — multi-profile campaigns, rented avatars, AI-personalised messages and a unified inbox for every reply.",
};

/* ── Rented accounts — sample profiles (illustrative personas, kept per D14) ── */
const rentedAgents = [
  { name: "Daniel C.", role: "Regional Director", photo: "/images/agents/daniel-c.webp" },
  { name: "Emery E.", role: "Head of Sales", photo: "/images/agents/emery-e.webp" },
  { name: "James Miller", role: "Senior Business Development", photo: "/images/agents/james-miller.webp" },
  { name: "Michael B.", role: "Sales Agent", photo: "/images/agents/michael-b.webp" },
  { name: "Thomas E.", role: "Sales Agent", photo: "/images/agents/thomas-e.webp" },
  { name: "Emily Johnson", role: "Sales Agent", photo: "/images/agents/emily-johnson.webp" },
  { name: "Olivia W.", role: "Sales Agent", photo: "/images/agents/olivia-w.webp" },
  { name: "Chris H.", role: "Sales Agent", photo: "/images/agents/chris-h.webp" },
];

/* Map pins — the same illustrative personas placed over the regions panel
   (positions are % of the 1200×350 panel slot, matched to the dot map). */
const mapPins = [
  { name: "Daniel C.", photo: "/images/agents/daniel-c.webp", left: "16.5%", top: "34%" },
  { name: "Michael B.", photo: "/images/agents/michael-b.webp", left: "23.5%", top: "36.5%" },
  { name: "Thomas E.", photo: "/images/agents/thomas-e.webp", left: "29.8%", top: "31.3%" },
  { name: "James Miller", photo: "/images/agents/james-miller.webp", left: "37%", top: "74.5%" },
  { name: "Emery E.", photo: "/images/agents/emery-e.webp", left: "49.4%", top: "31.5%" },
  { name: "Emily Johnson", photo: "/images/agents/emily-johnson.webp", left: "54%", top: "23%" },
  { name: "Olivia W.", photo: "/images/agents/olivia-w.webp", left: "57%", top: "33%" },
  { name: "Chris H.", photo: "/images/agents/chris-h.webp", left: "79.3%", top: "58.7%" },
];

/* ── How it works (original section — replaces the removed testimonial wall) ── */
const howItWorksSteps = [
  {
    step: "Step 1",
    title: "Build your lead list",
    text: "Start from a LinkedIn or Sales Navigator search, or import a CSV, then save the people you want to reach into a campaign list.",
  },
  {
    step: "Step 2",
    title: "Write the sequence",
    text: "Put connection requests, follow-up messages and gentle bumps into one flow, with natural pauses between each step.",
  },
  {
    step: "Step 3",
    title: "Personalise with AI",
    text: "Let AI tailor opening lines to each prospect’s profile, then review and edit every message before anything goes out.",
  },
  {
    step: "Step 4",
    title: "Send from multiple profiles",
    text: "Run the campaign from your own accounts, rented avatars, or a mix of both — with per-profile daily limits respected.",
  },
  {
    step: "Step 5",
    title: "Reply from one inbox",
    text: "Every answer, whichever profile it arrived on, lands in the unified inbox, ready for you or a teammate to pick up.",
  },
  {
    step: "Step 6",
    title: "Learn from the results",
    text: "Follow acceptance and reply rates per campaign and per profile, adjust the sequence, and send the next round with better information.",
  },
];

/* ── FAQ (section 7) ─────────────────────────────────────────────────────── */
const faqs = [
  {
    question: "Can I rent LinkedIn outreach profiles directly through NxtSend?",
    answer:
      "Yes. Rented profiles are ordered inside the app and added straight to your workspace, so you can include them in campaigns alongside your own accounts.",
  },
  {
    question:
      "I’m not interested in renting profiles, can I just add my own profiles?",
    answer:
      "Of course. NxtSend works as a complete LinkedIn outreach workspace with your own profiles connected — renting extra profiles is simply there if you want more capacity.",
  },
  {
    question: "Is there a free trial?",
    answer:
      "Yes — the LinkedIn Outreach plan comes with a 14-day free trial, so you can run a first campaign before you pay anything.",
  },
  {
    question: "Can I try rental LinkedIn accounts for free?",
    answer:
      "Rented profiles are paid for upfront, so there is no free rental period. If a rented profile turns out not to be right for you, a 48-hour money-back window applies.",
  },
  {
    question: "Can I message 1st connections?",
    answer:
      "Yes. Campaigns can speak to people already in your network, and you can narrow that audience with filters and list criteria before anything is sent.",
  },
  {
    question: "Do I need to share the LinkedIn password for my account?",
    answer:
      "No. Connecting an account follows a guided sign-in flow inside NxtSend, and you never hand your LinkedIn password to our team.",
  },
  {
    question: "Do you support Sales Navigator?",
    answer:
      "Yes. You can build lead lists from Sales Navigator searches and use them in your NxtSend campaigns, and lists can be shared with teammates inside the same workspace.",
  },
  {
    question: "What are the white-labeling options with NxtSend?",
    answer:
      "NxtSend is not a fully white-labelled product today. Agencies can brand parts of the experience, including the account connection flow and client reporting, and fuller white-labelling is on our roadmap.",
  },
  {
    question: "Do you provide proxies, or do I have to bring my own?",
    answer:
      "Rented profiles are set up to run from a location that matches the profile, so there is nothing separate for you to arrange. If you would rather use your own proxy setup, that is possible too.",
  },
];

export default function MarketingHomePage() {
  return (
    <div className="relative overflow-hidden bg-black-900">
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HERO */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col justify-center bg-gradient-hero pt-12 pb-20 lg:pt-20 lg:pb-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.15]"
          style={{
            backgroundImage:
              "radial-gradient(rgba(255, 255, 255, 0.25) 1px, transparent 1px)",
            backgroundSize: "28px 28px",
          }}
        />
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-purple-600/20 blur-[130px]" />
        <div className="pointer-events-none absolute top-1/3 -right-40 h-[350px] w-[350px] rounded-full bg-orange-600/15 blur-[120px]" />

        <div className="section-container relative z-10 flex flex-col items-center text-center">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-900/40 px-4 py-1.5 text-13 font-semibold text-purple-200 backdrop-blur-md">
            <span className="flex h-2 w-2 rounded-full bg-purple-400 animate-pulse" />
            <span>Built for agencies, sales teams and founders</span>
          </div>

          <h1 className="mt-8 max-w-4xl text-44 sm:text-54 lg:text-72 font-extrabold tracking-tight text-white leading-[1.08]">
            <span className="text-gradient-brand">Reach more</span> of the right
            people on LinkedIn
          </h1>

          <p className="mt-6 max-w-2xl text-17 sm:text-20 leading-relaxed text-black-300">
            NxtSend brings campaigns, rented profiles, personalised messaging
            and every reply into one workspace, so your team can run LinkedIn
            outreach without juggling separate tools.
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
            <Link
              href="/signup"
              className="group relative flex h-13 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-gradient-brand px-8 text-16 font-semibold text-white shadow-glow-purple transition-all duration-300 hover:shadow-glow-orange hover:scale-105 active:scale-95"
            >
              <span>Begin your first campaign</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-13 text-black-400">
            <div className="flex items-center gap-1.5 rounded-full border border-black-700/80 bg-black-800/60 px-3.5 py-1.5 backdrop-blur-sm">
              <Check className="h-3.5 w-3.5 text-purple-400" />
              <span>Free for 14 days</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-black-700/80 bg-black-800/60 px-3.5 py-1.5 backdrop-blur-sm">
              <Check className="h-3.5 w-3.5 text-purple-400" />
              <span>No credit card needed</span>
            </div>
            <div className="flex items-center gap-1.5 rounded-full border border-black-700/80 bg-black-800/60 px-3.5 py-1.5 backdrop-blur-sm">
              <Check className="h-3.5 w-3.5 text-purple-400" />
              <span>Quick workspace setup</span>
            </div>
          </div>

        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* TRUSTED BY — owner-supplied logos (P6) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <TrustedBy />

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 1. OUTREACH WITH RENTED ACCOUNTS */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative py-24 lg:py-32">
        <div className="section-container">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Grow your sending capacity with rented profiles
            </h2>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-black-700/60 px-4 py-1.5 text-13 font-medium text-black-300">
              Your own profiles
            </span>
            <span className="rounded-full bg-black-700/60 px-4 py-1.5 text-13 font-medium text-black-300">
              Bring your own
            </span>
            <span className="rounded-full bg-gradient-brand px-4 py-1.5 text-13 font-semibold text-white">
              Rent profiles
            </span>
          </div>

          {/* Account pills — white cards, laid out 3 / 3 / 2 centred.
              Sample profiles shown are illustrative personas. */}
          <div className="mx-auto mt-12 flex max-w-5xl flex-wrap items-stretch justify-center gap-4">
            {rentedAgents.map((agent, i) => (
              <div
                key={agent.name}
                className="flex w-full items-center gap-3 rounded-full bg-white py-2 pl-2 pr-3 shadow-[0_10px_30px_rgba(0,0,0,0.35)] sm:w-[calc(50%-0.5rem)] lg:w-[calc(33.333%-0.75rem)]"
              >
                <Image
                  src={agent.photo}
                  alt={agent.name}
                  width={88}
                  height={88}
                  className="h-11 w-11 shrink-0 rounded-full object-cover"
                />
                <div className="min-w-0 flex-1 leading-tight">
                  <div className="truncate text-14 font-bold text-black-900">
                    {agent.name}
                  </div>
                  <div className="truncate text-12 text-black-400">{agent.role}</div>
                </div>
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black-50 text-black-600">
                  {i < 3 ? (
                    <Users className="h-4.5 w-4.5" />
                  ) : (
                    <UserRound className="h-4.5 w-4.5" />
                  )}
                </span>
              </div>
            ))}
          </div>

          {/* Segment panel — dotted world map with profile pins + segment chips */}
          <div className="relative mx-auto mt-12 max-w-6xl rounded-[2rem] bg-white p-3 shadow-2xl sm:p-4">
            <div className="relative z-10 flex flex-col items-center gap-3 px-1 pt-1 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-12 font-semibold text-black-800 shadow-md ring-1 ring-black/5">
                  <span className="h-2 w-2 rounded-sm bg-red-500" />
                  California
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-12 font-semibold text-black-800 shadow-md ring-1 ring-black/5">
                  <span className="h-2 w-2 rounded-sm bg-purple-600" />
                  Bay Area
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-12 font-semibold text-black-800 shadow-md ring-1 ring-black/5">
                  <span className="h-2 w-2 rounded-sm bg-sky-500" />
                  HoReCa
                </span>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-12 font-semibold text-black-800 shadow-md ring-1 ring-black/5">
                  <span className="h-2 w-2 rounded-sm bg-pink-500" />
                  Procurement
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-12 font-semibold text-black-800 shadow-md ring-1 ring-black/5">
                  <span className="h-2 w-2 rounded-sm bg-blue-600" />
                  Business Development
                </span>
              </div>
            </div>

            <div
              role="img"
              aria-label="Rented LinkedIn profiles available across regions"
              className="relative mt-2 aspect-[1200/350] w-full overflow-hidden rounded-3xl bg-gradient-to-b from-[#f7f6ff] via-[#eef1fe] to-[#e4ebfd]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/images/world-dots.svg"
                alt=""
                aria-hidden="true"
                className="absolute inset-0 h-full w-full"
              />
              {mapPins.map((pin) => (
                <span
                  key={pin.name}
                  aria-hidden="true"
                  className="absolute h-6 w-6 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full shadow-lg ring-2 ring-white transition-transform duration-300 hover:scale-110 sm:h-8 sm:w-8 lg:h-10 lg:w-10"
                  style={{ left: pin.left, top: pin.top }}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={pin.photo} alt="" className="h-full w-full object-cover" />
                </span>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 2. BUILT TO START CONVERSATIONS — JSX bento (P6 rework) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <BentoFeatures />

      {/* 3. ONE LIVE VIEW OF EVERY CAMPAIGN — interactive preview (P6) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <LiveView />

      {/* 4. INTEGRATES WITH YOUR FAVORITE TOOLS — registry cards (P6) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <HomeIntegrations />

      {/* 5. HOW IT WORKS — original section (replaces the removed testimonial wall) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section id="how-it-works" className="relative border-t border-black-700/80 bg-black-900 py-24 lg:py-32">
        <div className="pointer-events-none absolute right-10 top-1/2 h-[350px] w-[350px] -translate-y-1/2 rounded-full bg-purple-600/15 blur-[140px]" />
        <div className="section-container relative z-10">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              From first list to live conversation
            </h2>
            <p className="mx-auto mt-6 max-w-2xl text-16 leading-relaxed text-black-300">
              One workspace follows the whole journey of a campaign, so nothing
              depends on spreadsheets, spare browser tabs or memory.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {howItWorksSteps.map((s) => (
              <div key={s.step} className="glass-card-hover flex flex-col p-8">
                <span className="text-11 font-bold uppercase tracking-wider text-purple-400">
                  {s.step}
                </span>
                <h3 className="mt-4 text-18 font-bold leading-snug text-white">
                  {s.title}
                </h3>
                <p className="mt-3 text-14 leading-relaxed text-black-300">
                  {s.text}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 6. PRICING THAT SCALES WITH YOUR GROWTH — artwork cards. */}
      {/* Rendered by the HomePricing client component so the billing      */}
      {/* toggle holds real state (model: src/lib/marketing-prices.ts).     */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <HomePricing />

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 7. FREQUENTLY ASKED QUESTIONS */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24 lg:py-32">
        <div className="section-container">
          <div className="mx-auto max-w-4xl">
            <div className="mb-12 text-center">
              <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
                Common questions about NxtSend
              </h2>
            </div>
            <HomeFaq items={faqs} />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 8. FINAL CTA */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-black-700/80 bg-gradient-hero py-24 lg:py-32">
        <div className="pointer-events-none absolute inset-0 bg-radial-glow opacity-30" />
        <div className="section-container relative z-10 text-center">
          <div className="mx-auto max-w-3xl rounded-3xl border border-purple-500/30 bg-black-800/80 p-8 shadow-glow-purple/20 backdrop-blur-2xl sm:p-14">
            <h2 className="text-36 sm:text-48 font-extrabold text-white tracking-tight">
              Your next customers are already on LinkedIn
            </h2>
            <p className="mt-4 text-17 sm:text-20 text-black-300">
              Set up your workspace, connect or rent your first profiles, and
              send a personalised campaign today — while every reply waits for
              you in one place.
            </p>
            <div className="mt-8 flex flex-col items-center justify-center gap-4 sm:flex-row">
              <Link
                href="/signup"
                className="group flex h-13 w-full items-center justify-center gap-2 rounded-full bg-gradient-brand px-9 text-16 font-semibold text-white shadow-glow-purple transition-all duration-300 hover:shadow-glow-orange hover:scale-105 sm:w-auto"
              >
                <span>Create your workspace</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-12 text-black-400">
              <span className="flex items-center gap-1.5">
                <Check className="h-3.5 w-3.5 text-green-400" /> No card required
                to start
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-green-400" /> Protected
                sign-in
              </span>
              <span className="flex items-center gap-1.5">
                <Headphones className="h-3.5 w-3.5 text-green-400" /> Support on
                hand
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
