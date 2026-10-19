import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  Linkedin,
  ShieldCheck,
  Headphones,
  Zap,
  Briefcase,
  Gem,
} from "lucide-react";
import { HomeFaq } from "@/components/marketing/HomeFaq";

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

/* ── Made to convert (mirror section 2) — artwork cards from the mirror ──── */
const convertCards = [
  {
    title: "Messages that read like a person wrote them",
    chips: ["AI personalisation", "Custom variables", "Attachments"],
    art: "/images/bento/1.webp",
    alt: "Messages that read like a person wrote them — personalised pitch artwork",
    layout: "wide",
    overlay: "bottom-left",
  },
  {
    title: "Get noticed in a busy inbox",
    chips: ["Voice notes"],
    art: "/images/bento/2.webp",
    alt: "Get noticed in a busy inbox — voice message artwork",
    layout: "narrow",
    overlay: "top-center",
  },
  {
    title: "Their language, their timezone",
    chips: ["Automatic translation", "Timezone-aware sending"],
    art: "/images/bento/3.webp",
    alt: "Their language, their timezone — translation artwork",
    layout: "medium",
    overlay: "top-center-dark",
  },
  {
    title: "A campaign shape for every goal",
    chips: ["Connection requests", "Message sequences", "Reactions"],
    art: "/images/bento/4.webp",
    alt: "A campaign shape for every goal — campaign types artwork",
    layout: "medium",
    overlay: "top-center",
  },
  {
    title: "Test variations, keep what works",
    chips: ["A/B testing"],
    art: "/images/bento/5.webp",
    alt: "Test variations, keep what works — A/B testing artwork",
    layout: "narrow",
    overlay: "top-center",
  },
] as const;

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

/* ── FAQ (mirror section 7) ──────────────────────────────────────────────── */
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

          {/* Account pills — white cards, mirror layout (3 / 3 / 2 centred).
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
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black-50">
                  <Image
                    src={i < 3 ? "/images/icons/multi-accounts.png" : "/images/icons/sdr.png"}
                    alt=""
                    width={20}
                    height={20}
                    className="h-4.5 w-4.5 object-contain"
                  />
                </span>
              </div>
            ))}
          </div>

          {/* Segment panel — abstract artwork strip (features-grid) + segment chips */}
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

            <Image
              src="/images/features-grid.png"
              alt="Abstract gradient artwork in soft violet and blue tones"
              width={1200}
              height={350}
              className="mt-2 h-auto w-full rounded-3xl"
            />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 2. BUILT TO START CONVERSATIONS — artwork bento (mirror) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/30 py-24 lg:py-32">
        <div className="pointer-events-none absolute top-1/2 left-0 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-purple-600/10 blur-[130px]" />
        <div className="section-container relative z-10">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Built to start conversations, not just send requests
            </h2>
          </div>

          <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-12">
            {convertCards.map((card) => {
              const span =
                card.layout === "wide"
                  ? "lg:col-span-12 h-[440px] sm:h-[520px] lg:h-[600px]"
                  : card.layout === "narrow"
                    ? "lg:col-span-5 h-[440px] lg:h-[560px]"
                    : "lg:col-span-7 h-[440px] lg:h-[560px]";
              const dark = card.overlay !== "top-center-dark";
              return (
                <div
                  key={card.title}
                  className={`group relative overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-white/10 ${span}`}
                >
                  <Image
                    src={card.art}
                    alt={card.alt}
                    fill
                    sizes="(max-width: 1024px) 100vw, 1150px"
                    className={`object-cover transition-transform duration-500 group-hover:scale-[1.02] ${
                      card.overlay === "bottom-left"
                        ? "object-left sm:object-center"
                        : ""
                    }`}
                  />
                  {card.overlay === "bottom-left" ? (
                    <div className="absolute bottom-0 left-0 p-7 sm:p-9">
                      <h3 className="max-w-[300px] text-24 sm:text-28 font-bold leading-snug text-white">
                        {card.title}
                      </h3>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {card.chips.map((chip) => (
                          <span
                            key={chip}
                            className="rounded-full border border-white/25 bg-black-900/35 px-3 py-1 text-12 font-semibold text-white backdrop-blur-md"
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="absolute inset-x-0 top-0 flex flex-col items-center p-7 text-center sm:p-9">
                      <h3
                        className={`max-w-[340px] text-24 sm:text-28 font-bold leading-snug ${dark ? "text-white" : "text-black-900"}`}
                      >
                        {card.title}
                      </h3>
                      <div className="mt-4 flex flex-wrap justify-center gap-2">
                        {card.chips.map((chip) => (
                          <span
                            key={chip}
                            className={
                              dark
                                ? "rounded-full border border-white/25 bg-black-900/35 px-3 py-1 text-12 font-semibold text-white backdrop-blur-md"
                                : "rounded-full border border-black/10 bg-white/60 px-3 py-1 text-12 font-semibold text-black-700 backdrop-blur-md"
                            }
                          >
                            {chip}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 3. ONE LIVE VIEW OF EVERY CAMPAIGN */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24 lg:py-32">
        <div className="section-container">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              One live view of every campaign
            </h2>
          </div>

          <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-12">
            {/* Left: tabs, heading, copy */}
            <div className="lg:col-span-5">
              <div className="inline-flex items-center gap-1 rounded-full border border-black-600 bg-black-800 p-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-12 font-bold uppercase tracking-wide text-black-900">
                  Unified inbox
                  <Image src="/images/icons/unibox.png" alt="" width={18} height={18} className="h-4 w-4 object-contain" />
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-12 font-bold uppercase tracking-wide text-black-300">
                  Leads
                  <Image src="/images/icons/leads.png" alt="" width={18} height={18} className="h-4 w-4 object-contain" />
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-12 font-bold uppercase tracking-wide text-black-300">
                  Analytics
                  <Image src="/images/icons/analytics.png" alt="" width={18} height={18} className="h-4 w-4 object-contain" />
                </span>
              </div>

              <h3 className="mt-8 text-36 sm:text-44 font-bold leading-[1.12] text-white tracking-tight">
                Every reply lands in a single inbox
              </h3>
              <p className="mt-4 max-w-md text-16 leading-relaxed text-black-400">
                Answer messages from every connected and rented profile in one
                thread view, without switching accounts or losing track of who
                said what.
              </p>

              <ul className="mt-8 space-y-3">
                <li className="flex items-start gap-2.5 text-15 text-black-200">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                  <span>Filter conversations by account or by campaign</span>
                </li>
                <li className="flex items-start gap-2.5 text-15 text-black-200">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                  <span>Assign a thread to a teammate inside the same workspace</span>
                </li>
                <li className="flex items-start gap-2.5 text-15 text-black-200">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                  <span>Search past messages before you write the follow-up</span>
                </li>
              </ul>
            </div>

            {/* Right: big unified-inbox UI panel */}
            <div className="lg:col-span-7">
              <div className="rounded-[2rem] border border-black-700/80 bg-black-800/40 p-2 shadow-2xl sm:p-3">
                <div className="overflow-hidden rounded-[1.6rem] border border-black-700/60">
                  <Image
                    src="/images/unibox.webp"
                    alt="NxtSend dashboard — unified inbox with conversations from every profile in one place"
                    width={1600}
                    height={1175}
                    className="h-auto w-full"
                  />
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 4. INTEGRATES WITH YOUR FAVORITE TOOLS */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/30 py-24 lg:py-32">
        <div className="section-container">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Works alongside the tools you already use
            </h2>
          </div>

          <div className="mx-auto mt-12 max-w-5xl">
            <Image
              src="/images/home-integrations/integrations-desktop.webp"
              alt="NxtSend Integration Center — connect your CRM, email and automation tools"
              width={2000}
              height={838}
              className="hidden h-auto w-full sm:block"
            />
            <Image
              src="/images/home-integrations/integrations.webp"
              alt="NxtSend Integration Center — connect your CRM, email and automation tools"
              width={1200}
              height={1089}
              className="h-auto w-full sm:hidden"
            />
          </div>

          <div className="mt-10 text-center">
            <Link
              href="/integrations"
              className="group inline-flex items-center gap-2 rounded-full border border-black-600 bg-black-800 px-7 py-3 text-15 font-semibold text-white transition-all hover:border-purple-500/50 hover:text-purple-300"
            >
              <span>Explore integrations</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
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
      {/* 6. PRICING THAT SCALES WITH YOUR GROWTH — artwork cards (mirror) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/40 py-24 lg:py-32">
        <div className="section-container">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Straightforward pricing that grows with your team
            </h2>
            <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-white/15 bg-black-800 p-1">
              <span className="rounded-full bg-black-900 px-4 py-1.5 text-13 font-bold text-white ring-1 ring-white/20">
                Monthly
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-13 font-semibold text-white/70">
                Yearly
                <span className="rounded-full bg-purple-600 px-2 py-0.5 text-10 font-bold text-white">
                  up to -25%
                </span>
              </span>
            </div>
          </div>

          <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
            {/* Outreach seat */}
            <div className="relative overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-white/10">
              <Image
                src="/images/pricing/card-bg-1.webp"
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 500px"
                className="object-cover"
              />
              <div className="relative flex h-full flex-col p-8">
                <div className="flex items-center gap-2 text-white">
                  <Zap className="h-5 w-5 fill-white" />
                  <h3 className="text-17 font-semibold">Outreach seat</h3>
                </div>
                <p className="mt-3 max-w-[260px] text-14 leading-relaxed text-white/70">
                  For running campaigns from LinkedIn profiles you connect to
                  your workspace
                </p>
                <div className="mt-7 flex flex-wrap items-end gap-x-2.5 gap-y-2">
                  <span className="text-54 font-semibold leading-none text-white">$49</span>
                  <span className="pb-1 text-15 text-white/60">/mo</span>
                  <span className="mb-1 rounded-full border border-purple-400/40 bg-purple-600/30 px-2.5 py-0.5 text-11 font-semibold text-purple-100">
                    per seat
                  </span>
                </div>

                <Link
                  href="/signup"
                  className="mt-8 flex h-12 w-full items-center justify-center rounded-full border border-white/15 bg-white/10 text-15 font-semibold text-white backdrop-blur-md transition-all duration-200 hover:bg-white/20"
                >
                  Try it free for 14 days
                </Link>

                <div className="mt-9">
                  <div className="text-15 font-bold text-white">
                    What each seat includes
                  </div>
                  <ul className="mt-4 space-y-3">
                    <li className="flex items-start gap-2.5 text-14 text-white/85">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                      <span>
                        Connect and manage{" "}
                        <Linkedin className="inline h-3.5 w-3.5 text-white" />{" "}
                        accounts
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 text-14 text-white/85">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                      <span>
                        Run inbound and outbound campaigns
                        <span className="mt-1 block text-12 leading-relaxed text-white/50">
                          Inbound campaigns speak to people already in your
                          network, while outbound campaigns open conversations
                          with new prospects
                        </span>
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 text-14 text-white/85">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                      <span>Access to the unified inbox</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-14 text-white/85">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                      <span>Integrations with third-party tools</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Agency */}
            <div className="relative overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-white/10">
              <Image
                src="/images/pricing/card-bg-2.webp"
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 500px"
                className="object-cover"
              />
              <div className="relative flex h-full flex-col p-8">
                <div className="flex items-center gap-2 text-white">
                  <Briefcase className="h-5 w-5" />
                  <h3 className="text-17 font-semibold">Agency</h3>
                </div>
                <p className="mt-3 max-w-[260px] text-14 leading-relaxed text-white/70">
                  For agencies running outreach across client accounts and
                  teams.
                </p>
                <div className="mt-7">
                  <div className="text-13 text-white/60">From:</div>
                  <div className="mt-1 flex flex-wrap items-end gap-x-2.5 gap-y-2">
                    <span className="text-54 font-semibold leading-none text-white">$499</span>
                    <span className="pb-1 text-15 text-white/60">/20 seats</span>
                    <span className="mb-1 rounded-full border border-purple-400/40 bg-purple-600/30 px-2.5 py-0.5 text-11 font-semibold text-purple-100">
                      +$20 per new seat
                    </span>
                  </div>
                </div>

                <Link
                  href="/demo"
                  className="mt-8 flex h-12 w-full items-center justify-center rounded-full border border-white/15 bg-white/10 text-15 font-semibold text-white backdrop-blur-md transition-all duration-200 hover:bg-white/20"
                >
                  Book an agency call
                </Link>

                <div className="mt-9">
                  <div className="text-15 font-bold text-white">
                    Agency essentials included
                  </div>
                  <ul className="mt-4 space-y-3">
                    {[
                      "Onboarding via Slack",
                      "White-label client reporting",
                      "Collaboration for your whole team",
                      "Help migrating existing profiles",
                    ].map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-14 text-white/85">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Outreach avatar — wide card */}
            <div className="relative overflow-hidden rounded-[2rem] shadow-2xl ring-1 ring-white/10 lg:col-span-2">
              <Image
                src="/images/pricing/card-bg-3.webp"
                alt=""
                fill
                sizes="(max-width: 1024px) 100vw, 1024px"
                className="object-cover"
              />
              <div className="relative grid gap-8 p-8 md:grid-cols-2">
                <div>
                  <div className="flex items-center gap-2 text-white">
                    <Gem className="h-5 w-5" />
                    <h3 className="text-17 font-semibold">Outreach avatar</h3>
                  </div>
                  <p className="mt-3 max-w-[280px] text-14 leading-relaxed text-white/70">
                    Add ready-to-use LinkedIn profiles to your workspace and
                    shape them around your offer
                  </p>
                  <div className="mt-7 flex flex-wrap items-end gap-x-2.5 gap-y-2">
                    <span className="text-54 font-semibold leading-none text-white">$387</span>
                    <span className="pb-1 text-15 text-white/60">/month</span>
                    <span className="mb-1 rounded-full border border-purple-400/40 bg-purple-600/30 px-2.5 py-0.5 text-11 font-semibold text-purple-100">
                      3 profiles included
                    </span>
                  </div>
                  <Link
                    href="/avatars"
                    className="mt-8 flex h-12 w-full items-center justify-center rounded-full border border-white/15 bg-white/10 text-15 font-semibold text-white backdrop-blur-md transition-all duration-200 hover:bg-white/20"
                  >
                    See rented profiles
                  </Link>
                </div>

                <div className="md:pt-1">
                  <div className="flex md:justify-end">
                    <span className="inline-flex items-center gap-1 rounded-full border border-white/15 bg-black-900/40 p-1 backdrop-blur-md">
                      <span className="rounded-full bg-black-900 px-3 py-1 text-11 font-bold text-white ring-1 ring-white/20">
                        Monthly
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-11 font-semibold text-white/70">
                        Yearly
                        <span className="rounded-full bg-purple-600 px-1.5 py-px text-9 font-bold text-white">
                          up to -25%
                        </span>
                      </span>
                    </span>
                  </div>
                  <div className="mt-6 text-15 font-bold text-white">Ready when you are</div>
                  <ul className="mt-4 space-y-3">
                    <li className="flex items-start gap-2.5 text-14 text-white/85">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                      <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-13 font-medium text-white">
                        3x Outreach seat included
                      </span>
                    </li>
                    {[
                      "Profiles tailored to your market",
                      "Delivered straight into your workspace",
                      "Covered by a replacement guarantee",
                    ].map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-14 text-white/85">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          <div className="mt-12 text-center">
            <Link
              href="/pricing"
              className="inline-flex items-center gap-2 rounded-full border border-black-600 bg-black-800 px-7 py-3 text-15 font-semibold text-white transition-all hover:border-purple-500/50 hover:text-purple-300"
            >
              <span>Compare all plans</span>
            </Link>
          </div>
        </div>
      </section>

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
