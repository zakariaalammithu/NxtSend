import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Headphones,
  Briefcase,
  ChevronLeft,
  CreditCard,
  KeyRound,
  Lock,
  Palette,
  Receipt,
  Rocket,
  Send,
  Settings2,
  UserPlus,
  UserRound,
  Users,
  Webhook,
  Workflow,
} from "lucide-react";
import { AgencyPricing } from "@/components/marketing/AgencyPricing";

export const metadata: Metadata = {
  title: { absolute: "NxtSend Agency – Agency outreach that grows with your clients" },
  description:
    "Run LinkedIn outreach for every client from separate workspaces, present it under your own brand, and handle replies together in one unified inbox.",
};

/* ── Support cards ─────────────────────────────────────────────────────── */
const supportCards = [
  {
    title: "Onboarding",
    text: "A specialist walks your team through account setup, workspace configuration and your first client campaign launch.",
    icon: Rocket,
    art: "linear-gradient(150deg, #312e81 0%, #1e1b4b 55%, #0f0c29 100%)",
    glow: "bg-purple-500/25",
  },
  {
    title: "Advanced workflows",
    text: "Apply ready-made sequence patterns designed for multi-client outreach work.",
    icon: Workflow,
    art: "linear-gradient(150deg, #0c4a6e 0%, #082f49 55%, #0b1226 100%)",
    glow: "bg-sky-500/25",
  },
  {
    title: "Help when you need it",
    text: "Your account manager answers questions and troubleshoots issues as they arise.",
    icon: Headphones,
    art: "linear-gradient(150deg, #4a044e 0%, #2a0a33 55%, #150a24 100%)",
    glow: "bg-fuchsia-500/25",
  },
];

/* ── How agencies run client campaigns (original process section,
      replacing the removed review wall) ──────────────────────────────────── */
const processSteps = [
  {
    step: "Step 1",
    title: "Create a workspace per client",
    text: "Each client gets a dedicated space for their profiles, campaigns and conversations, so accounts, data and reporting never mix across your roster.",
  },
  {
    step: "Step 2",
    title: "Connect or rent sender profiles",
    text: "Attach a client's own LinkedIn profile, or add a rented avatar profile when a campaign needs extra sending capacity.",
  },
  {
    step: "Step 3",
    title: "Build the campaign together",
    text: "Set the audience, write the connection and follow-up sequence, and agree sending limits with your team before anything goes live.",
  },
  {
    step: "Step 4",
    title: "Launch with safeguards in place",
    text: "Campaigns run from the cloud with warm-up, activity limits and residential IP routing applied to every connected profile.",
  },
  {
    step: "Step 5",
    title: "Handle replies in one inbox",
    text: "Every conversation from every client account lands in a shared unified inbox, where your team can assign, reply and follow up.",
  },
  {
    step: "Step 6",
    title: "Review, report, add seats",
    text: "Check results workspace by workspace, share progress with clients under your brand, and add seats as new accounts join.",
  },
];

/* ── Hero artwork: the Agency Plan settings panel, built as native
      JSX (P6 clip fix). The previous raster capture was cropped
      inside the file itself — its right column and bottom row are
      cut off in the source pixels, and its overlay rendering clipped
      the panel's top as well. A live panel cannot be clipped at any
      viewport and carries NxtSend's own domain and branding. ──────── */
const panelNav = [
  { label: "Profile settings", icon: UserRound },
  { label: "General", icon: Settings2 },
  { label: "Billing", icon: CreditCard },
  { label: "Invoices", icon: Receipt },
  { label: "Members", icon: Users },
  { label: "Clients", icon: Briefcase },
  { label: "API keys", icon: KeyRound },
  { label: "Webhooks", icon: Webhook },
  { label: "Agency Plan", icon: Briefcase, active: true },
  { label: "White label", icon: Palette },
];

const panelRows = [
  { name: "Nexora", meta: "2 accounts", bg: "bg-gradient-to-br from-slate-200 to-slate-400", hide: "" },
  { name: "Utopia", meta: "8 accounts", bg: "bg-gradient-to-br from-indigo-500 to-purple-700", hide: "" },
  { name: "Miracle", meta: "4 accounts · 5 avatars", bg: "bg-gradient-to-br from-neutral-700 to-black", hide: "hidden min-[500px]:flex" },
  { name: "Northbeam", meta: "6 accounts · 3 avatars", bg: "bg-gradient-to-br from-orange-400 to-rose-500", hide: "hidden lg:flex" },
];

function AgencyPlanPanel() {
  return (
    <div
      aria-hidden="true"
      className="absolute right-3 top-1/2 w-[76%] -translate-y-1/2 sm:right-5 sm:w-[68%] lg:right-6"
    >
      <div className="overflow-hidden rounded-xl bg-white text-left shadow-2xl ring-1 ring-black-900/10">
        {/* Browser chrome */}
        <div className="flex items-center gap-1.5 border-b border-black-900/[0.06] px-3 py-2">
          <span className="h-2 w-2 rounded-full bg-[#FF5F57]" />
          <span className="h-2 w-2 rounded-full bg-[#FEBC2E]" />
          <span className="h-2 w-2 rounded-full bg-[#28C840]" />
          <span className="ml-2 flex items-center gap-1 rounded-md bg-black-50 px-2 py-0.5 text-[9px] font-medium text-black-400">
            <Lock className="h-2.5 w-2.5" />
            app.nxtsend.com
          </span>
        </div>
        <div className="flex">
          {/* Settings sidebar */}
          <div className="hidden w-[7.5rem] shrink-0 flex-col border-r border-black-900/[0.06] px-2 py-3 sm:flex lg:w-[8.5rem]">
            <p className="flex items-center gap-0.5 px-1 text-11 font-semibold text-black-900">
              <ChevronLeft className="h-3 w-3" />
              Settings
            </p>
            <div className="mt-2 flex items-center gap-1.5 px-1 py-1">
              <span className="h-4 w-4 shrink-0 rounded bg-gradient-brand" />
              <span className="truncate text-10 font-semibold text-black-900">
                Northbeam
              </span>
            </div>
            <ul className="mt-1 space-y-0.5">
              {panelNav.map((item) => (
                <li
                  key={item.label}
                  className={`flex items-center gap-1.5 rounded-md px-1.5 py-1 text-10 ${
                    item.active
                      ? "bg-purple-600/10 font-semibold text-purple-700"
                      : "text-black-500"
                  }`}
                >
                  <item.icon className="h-3 w-3 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </li>
              ))}
            </ul>
          </div>
          {/* Plan content */}
          <div className="min-w-0 flex-1 px-3 py-3 sm:px-4">
            <p className="text-13 font-bold text-black-900">Agency Plan</p>
            <div className="mt-2 rounded-lg border border-black-900/[0.08] p-2.5">
              <div className="flex items-center gap-2">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
                  <Briefcase className="h-3.5 w-3.5" />
                </span>
                <span className="text-12 font-bold text-black-900">
                  Agency Plan
                </span>
                <span className="rounded-full bg-emerald-50 px-1.5 py-px text-[9px] font-semibold text-emerald-600 ring-1 ring-emerald-200">
                  Active
                </span>
              </div>
              <p className="mt-1.5 text-10 text-black-400">
                Grow your LinkedIn network with fully automated campaigns
              </p>
              <div className="mt-2 flex items-center gap-1.5 border-t border-dashed border-black-900/10 pt-2 text-[9px] text-black-500 sm:text-10">
                <span>Next billing on Jun 25th, 2025</span>
                <span className="text-black-300">|</span>
                <span>**** 4444</span>
                <span className="font-semibold text-purple-600">Edit</span>
              </div>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <div className="rounded-lg border border-black-900/[0.08] p-2.5">
                <p className="text-[9px] text-black-400 sm:text-10">Total seats</p>
                <p className="mt-0.5 text-16 font-bold text-black-900">70</p>
              </div>
              <div className="rounded-lg border border-black-900/[0.08] p-2.5">
                <p className="text-[9px] text-black-400 sm:text-10">
                  Assigned seats
                </p>
                <p className="mt-0.5 text-16 font-bold text-purple-600">49</p>
              </div>
            </div>
            {/* Workspace table — hidden on the smallest frames so the
                panel always fits its stage without clipping. */}
            <div className="hidden min-[500px]:block">
            <p className="mt-2.5 flex items-center gap-1.5 px-0.5 text-[9px] font-medium text-black-400 sm:text-10">
              Name
              <span className="rounded bg-purple-600/10 px-1 font-semibold text-purple-600">
                7
              </span>
            </p>
            <ul className="mt-0.5 divide-y divide-black-900/[0.06]">
              {panelRows.map((row) => (
                <li key={row.name} className={`flex items-center gap-2 py-1.5 ${row.hide}`}>
                  <span className={`h-6 w-6 shrink-0 rounded-md ${row.bg}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-11 font-semibold text-black-900">
                      {row.name}
                    </span>
                    <span className="block truncate text-[9px] text-black-400">
                      {row.meta}
                    </span>
                  </span>
                </li>
              ))}
            </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Privacy visibility table (native composition): who can see what
      inside a client workspace. Illustrative rows only — data areas
      and viewer roles, never client names or addresses. ─────────────── */
const privacyRows = [
  "Campaigns & sequences",
  "Inbox conversations",
  "Leads & contacts",
  "Billing & invoices",
];

function PrivacyTable() {
  return (
    <div className="relative w-full overflow-hidden rounded-6xl bg-white text-left text-black-900 shadow-2xl">
      <div className="flex items-center gap-2 border-b border-black-900/[0.06] px-4 py-3 sm:px-5">
        <Lock className="h-3.5 w-3.5 text-purple-600" />
        <span className="text-12 font-bold sm:text-13">
          Workspace visibility
        </span>
        <span className="ml-auto rounded-full bg-purple-600/10 px-2 py-0.5 text-[10px] font-semibold text-purple-700">
          Per client
        </span>
      </div>
      <div className="px-4 py-2 sm:px-5">
        <div className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.9fr] items-center gap-2 border-b border-black-900/[0.06] py-2 text-[10px] font-bold tracking-wide text-black-400 uppercase sm:text-11">
          <span>Data</span>
          <span className="text-center">Your team</span>
          <span className="text-center">The client</span>
          <span className="text-center">Other clients</span>
        </div>
        {privacyRows.map((row) => (
          <div
            key={row}
            className="grid grid-cols-[1.5fr_0.8fr_0.8fr_0.9fr] items-center gap-2 border-b border-black-900/[0.05] py-2.5 last:border-0"
          >
            <span className="text-12 font-semibold sm:text-13">{row}</span>
            {[0, 1].map((col) => (
              <span key={col} className="flex justify-center">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 text-white">
                  <Check className="h-3 w-3" />
                </span>
              </span>
            ))}
            <span className="flex items-center justify-center gap-1 text-11 font-semibold text-black-400">
              <Lock className="h-3 w-3" />
              Never
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Grow-card visuals (native compositions) ─────────────────────────────
   Seats: owner-supplied headshots (public/images/people) orbit a
   central briefcase tile over dashed connectors. Avatars: the
   segment chips + a rounded-tile grid of the app's illustrative
   persona photos (public/images/agents), echoing the homepage's
   segment panel. ─────────────────────────────────────────────────────── */
const seatPeople = [
  { photo: "/images/people/austin-smith.jpg", left: "11%", top: "13%" },
  { photo: "/images/people/emily-davidson.jpg", left: "29%", top: "10%" },
  { photo: "/images/people/brandon-pindulic.jpg", left: "47%", top: "9%" },
  { photo: "/images/people/misti-morgenstern.jpg", left: "65%", top: "10%" },
  { photo: "/images/people/robert-tas.jpg", left: "13%", top: "76%" },
  { photo: "/images/people/dave-mattso.jpg", left: "50%", top: "78%" },
  { photo: "/images/people/bill-bradford.jpg", left: "87%", top: "74%" },
];

function GrowSeatsVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative aspect-[1096/1067] w-full overflow-hidden bg-white"
    >
      <svg
        className="absolute inset-0 h-full w-full"
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
      >
        {seatPeople.map((person) => (
          <line
            key={person.photo}
            x1={parseFloat(person.left)}
            y1={parseFloat(person.top)}
            x2="50"
            y2="48"
            stroke="#d8d5ec"
            strokeWidth="0.5"
            strokeDasharray="2 2"
          />
        ))}
        <line
          x1="84"
          y1="13"
          x2="50"
          y2="48"
          stroke="#d8d5ec"
          strokeWidth="0.5"
          strokeDasharray="2 2"
        />
      </svg>
      <div className="absolute top-[48%] left-1/2 flex aspect-square w-[24%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-[1.6rem] bg-white shadow-[0_18px_50px_rgba(88,80,236,0.25)] ring-1 ring-purple-100">
        <span className="flex h-3/5 w-3/5 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-400 to-indigo-500 text-white">
          <Briefcase className="h-1/2 w-1/2" />
        </span>
      </div>
      {seatPeople.map((person) => (
        <span
          key={person.photo}
          className="absolute aspect-square w-[17%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full shadow-xl ring-4 ring-white"
          style={{ left: person.left, top: person.top }}
        >
          <Image
            src={person.photo}
            alt=""
            fill
            sizes="120px"
            className="object-cover object-top"
          />
        </span>
      ))}
      <span className="absolute top-[13%] left-[84%] flex aspect-square w-[17%] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-[#f2f1fa] shadow-xl ring-4 ring-white">
        <UserPlus className="h-2/5 w-2/5 text-indigo-500" />
      </span>
    </div>
  );
}

const growAvatarTiles: (string | null)[] = [
  null,
  "/images/agents/emery-e.webp",
  null,
  "/images/agents/olivia-w.webp",
  "/images/agents/james-miller.webp",
  null,
  "/images/agents/emily-johnson.webp",
  null,
  null,
  "/images/agents/daniel-c.webp",
  null,
  "/images/agents/chris-h.webp",
];

const growSegmentChips = [
  { label: "California", swatch: "bg-red-500" },
  { label: "Bay Area", swatch: "bg-purple-600" },
  { label: "HoReCa", swatch: "bg-sky-500" },
  { label: "Procurement", swatch: "bg-pink-500" },
  { label: "Business Development", swatch: "bg-blue-600" },
];

function GrowAvatarsVisual() {
  return (
    <div aria-hidden="true" className="relative w-full bg-[#f6f6fa] p-4 sm:p-5">
      <div className="flex flex-wrap gap-2">
        {growSegmentChips.map((chip) => (
          <span
            key={chip.label}
            className="inline-flex items-center gap-1.5 rounded-full bg-black-900 px-3 py-1.5 text-12 font-semibold text-white"
          >
            <span className={`h-2.5 w-2.5 rounded-[4px] ${chip.swatch}`} />
            {chip.label}
          </span>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2.5 sm:gap-3">
        {growAvatarTiles.map((photo, i) =>
          photo ? (
            <div
              key={i}
              className="relative aspect-square overflow-hidden rounded-[1.4rem] shadow-md ring-1 ring-black-900/5"
            >
              <Image
                src={photo}
                alt=""
                fill
                sizes="150px"
                className="object-cover object-top"
              />
            </div>
          ) : (
            <div
              key={i}
              className="aspect-square rounded-[1.4rem] bg-white shadow-[inset_0_0_0_1px_rgba(15,15,30,0.04)]"
            />
          ),
        )}
      </div>
    </div>
  );
}

export default function AgencyPage() {
  return (
    <div className="relative min-h-screen bg-black-900">
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HERO */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* Hero shell restyled to the bizreviewradar.com treatment
          (P6 addendum): near-black #05070f base, a white 1px grid at
          64px cells / 5% opacity masked by a radial fade, and an
          emerald radial glow at the top — the reference's agency
          section treatment, with NxtSend's own copy kept. */}
      <section className="relative isolate overflow-hidden bg-[#05070f] pt-12 pb-20 lg:pt-20 lg:pb-28">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[40rem]"
          style={{
            background:
              "radial-gradient(110% 60% at 50% 0%, rgba(16,185,129,0.28) 0%, rgba(12,17,80,0.35) 45%, rgba(5,7,15,0) 75%)",
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
              "radial-gradient(70% 50% at 50% 20%, #000, transparent)",
            WebkitMaskImage:
              "radial-gradient(70% 50% at 50% 20%, #000, transparent)",
          }}
        />

        <div className="section-container relative z-10">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div className="text-center lg:text-left">
              <p className="text-12 font-semibold uppercase tracking-widest text-emerald-400">
                For agencies &amp; consultants
              </p>
              <h1 className="mt-4 text-44 sm:text-54 lg:text-64 font-semibold tracking-tight text-white leading-[1.08]">
                Agency outreach that{" "}
                <span className="text-gradient-brand">grows with your clients</span>
              </h1>

              <p className="mx-auto mt-6 max-w-xl text-17 sm:text-20 leading-relaxed text-white/60 lg:mx-0">
                White-label LinkedIn campaign management for teams handling
                many client accounts.
              </p>

              <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 lg:justify-start">
                <Link
                  href="/demo"
                  className="group flex h-13 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-gradient-brand px-8 text-16 font-semibold text-white shadow-glow-purple transition-all duration-300 hover:shadow-glow-orange hover:scale-105 active:scale-95"
                >
                  <span>Talk to sales</span>
                  <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                </Link>
              </div>
            </div>

            {/* Artwork frame: aspect-matched stage for the gradient
                backdrop + the JSX Agency Plan panel (clip fix — the
                old raster overlay was cropped inside its own file and
                again by this frame). The panel is live markup, so no
                text in it can be cut at any viewport. */}
            <div className="relative aspect-[4/3] overflow-hidden rounded-3xl border border-black-700/80 shadow-2xl min-[500px]:aspect-[16/10] lg:aspect-[6/5]">
              <div
                aria-hidden="true"
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(80% 70% at 85% 0%, rgba(255,196,150,0.65) 0%, transparent 55%), radial-gradient(90% 80% at 0% 100%, rgba(165,180,252,0.55) 0%, transparent 60%), linear-gradient(140deg, #f6f4ff 0%, #e9edff 48%, #ffe9db 100%)",
                }}
              />
              <AgencyPlanPanel />
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 1. LINKEDIN CAMPAIGNS BUILT TO GROW WITH YOU */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24 lg:py-32">
        <div className="section-container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              LinkedIn campaigns built to grow with you
            </h2>
            <p className="mt-5 text-16 sm:text-18 leading-relaxed text-black-300">
              Give every client a separate workspace, bring their profiles
              together in a unified inbox, and manage the whole roster with
              20 included seats.
            </p>
          </div>

          {/* Bento grid — card compositions: full-bleed visual panels,
              title positions per card, Safety's visual panel + orange
              CTA panel; the section keeps this site's dark theme. */}
          <div className="mx-auto mt-14 grid w-full max-w-[73.75rem] gap-6 sm:gap-8">
            {/* Fully whitelabel — title bottom-right at xl. Below xl
                the title sits above the card: the card's bright mock
                panel fills the frame and leaves no legible spot for
                white text over it (P6 clip fix). */}
            <div>
              <h3 className="mb-4 text-24 font-bold text-white sm:text-30 xl:hidden">
                Fully white-label. Entirely your brand.
              </h3>
              <div className="relative aspect-[2384/1328] overflow-hidden rounded-7xl bg-[linear-gradient(140deg,#1e1b4b_0%,#312e81_52%,#4c1d95_100%)]">
                {/* White-label preview mock — native composition */}
                <div
                  aria-hidden="true"
                  className="absolute top-1/2 left-6 w-[64%] max-w-md -translate-y-1/2 sm:left-10 sm:w-[52%]"
                >
                  <div className="overflow-hidden rounded-2xl bg-white shadow-2xl ring-1 ring-black-900/10">
                    <div className="flex items-center gap-1.5 border-b border-black-900/[0.06] px-3.5 py-2.5">
                      <span className="h-2 w-2 rounded-full bg-[#FF5F57]" />
                      <span className="h-2 w-2 rounded-full bg-[#FEBC2E]" />
                      <span className="h-2 w-2 rounded-full bg-[#28C840]" />
                      <span className="ml-2 rounded-md bg-black-50 px-2 py-0.5 text-[10px] font-medium text-black-400">
                        yourbrand.com
                      </span>
                    </div>
                    <div className="p-4 sm:p-5">
                      <div className="flex items-center gap-2.5">
                        <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-violet-500 to-indigo-600" />
                        <span className="space-y-1.5">
                          <span className="block h-2 w-28 rounded bg-black-900/25" />
                          <span className="block h-2 w-20 rounded bg-black-900/10" />
                        </span>
                        <span className="ml-auto flex h-7 w-7 items-center justify-center rounded-full bg-purple-600/10 text-purple-600">
                          <Palette className="h-3.5 w-3.5" />
                        </span>
                      </div>
                      <div className="mt-4 flex items-center gap-1.5 sm:gap-2">
                        {[
                          "bg-violet-500",
                          "bg-indigo-500",
                          "bg-sky-500",
                          "bg-emerald-500",
                          "bg-orange-400",
                          "bg-rose-500",
                        ].map((swatch) => (
                          <span
                            key={swatch}
                            className={`h-5 w-5 shrink-0 rounded-full sm:h-6 sm:w-6 ${swatch} ring-2 ring-white`}
                          />
                        ))}
                        <span className="ml-1 hidden text-11 font-medium text-black-400 md:inline">
                          Brand colours
                        </span>
                      </div>
                      <div className="mt-4 space-y-2 border-t border-dashed border-black-900/10 pt-3">
                        <div className="h-2 w-3/4 rounded bg-black-900/10" />
                        <div className="h-2 w-1/2 rounded bg-black-900/10" />
                      </div>
                    </div>
                  </div>
                </div>
                <div className="absolute inset-0 hidden items-end justify-end p-14 xl:flex">
                  <h3 className="text-right text-30 font-bold text-white">
                    Fully white-label.
                    <br />
                    Entirely your brand.
                  </h3>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6 sm:gap-8 xl:flex-row">
              {/* Workspaces — title at the top, workspace rows below */}
              <div className="relative aspect-[1480/1328] grow overflow-hidden rounded-7xl bg-[linear-gradient(165deg,#171431_0%,#0d0b1e_60%,#08070f_100%)] xl:aspect-auto xl:h-[41.5rem]">
                <div
                  aria-hidden="true"
                  className="absolute -top-20 right-0 h-72 w-72 rounded-full bg-indigo-500/20 blur-[100px]"
                />
                <div className="relative z-10 px-4 pt-6 text-center sm:pt-14">
                  <h3 className="text-24 font-bold text-white sm:text-30">Workspaces</h3>
                  <p className="mx-auto mt-2 max-w-[18.25rem] text-13 text-white sm:mt-3 sm:text-15">
                    Each client stays in their own space, while your team
                    keeps oversight of every account.
                  </p>
                </div>
                {/* Workspace rows — native composition */}
                <div
                  aria-hidden="true"
                  className="relative z-10 mx-auto mt-6 w-full max-w-sm space-y-2.5 px-6 sm:mt-10"
                >
                  {[
                    "from-violet-500 to-indigo-600",
                    "from-sky-400 to-blue-600",
                    "from-orange-400 to-rose-500",
                  ].map((gradient) => (
                    <div
                      key={gradient}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] px-4 py-3 backdrop-blur-sm"
                    >
                      <span
                        className={`h-9 w-9 shrink-0 rounded-lg bg-gradient-to-br ${gradient}`}
                      />
                      <span className="min-w-0 flex-1 space-y-1.5">
                        <span className="block h-2 w-3/5 rounded bg-white/30" />
                        <span className="block h-2 w-2/5 rounded bg-white/15" />
                      </span>
                      <Users className="h-4 w-4 shrink-0 text-white/40" />
                    </div>
                  ))}
                  <div className="flex items-center justify-center gap-2 rounded-2xl border border-dashed border-white/15 px-4 py-3 text-12 font-semibold text-white/50">
                    <span className="text-14 leading-none">+</span>
                    New workspace
                  </div>
                </div>
              </div>

              {/* Account manager — dark text on a light gradient panel */}
              <div className="relative aspect-[1568/1440] overflow-hidden rounded-7xl bg-[linear-gradient(165deg,#ffffff_0%,#eef0ff_55%,#ffe9f3_100%)] xl:aspect-auto xl:h-[41.5rem] xl:w-[26.25rem] xl:shrink-0">
                <div className="relative z-10 px-4 pt-6 text-center text-black-900 sm:pt-14">
                  <h3 className="text-24 font-bold sm:text-30">Account manager</h3>
                  <p className="mx-auto mt-2 max-w-[18.25rem] text-13 sm:mt-3 sm:text-15">
                    Work with a named account manager, reach the team in
                    Slack, and get help moving profiles over.
                  </p>
                </div>
                {/* Support chat — native composition */}
                <div
                  aria-hidden="true"
                  className="relative z-10 mx-auto mt-6 w-full max-w-xs px-6 sm:mt-10"
                >
                  <div className="rounded-3xl bg-white p-4 shadow-2xl ring-1 ring-black-900/5">
                    <div className="flex items-center gap-2.5 border-b border-black-900/[0.06] pb-3">
                      <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-600 text-white">
                        <UserRound className="h-4.5 w-4.5" />
                        <span className="absolute right-0 bottom-0 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
                      </span>
                      <span className="min-w-0 flex-1 space-y-1.5">
                        <span className="block h-2 w-3/5 rounded bg-black-900/25" />
                        <span className="block h-2 w-2/5 rounded bg-black-900/10" />
                      </span>
                      <Headphones className="h-4 w-4 shrink-0 text-black-300" />
                    </div>
                    <div className="space-y-2.5 pt-3">
                      <div className="w-4/5 rounded-2xl rounded-tl-md bg-black-50 p-3">
                        <div className="space-y-1.5">
                          <div className="h-2 w-full rounded bg-black-900/15" />
                          <div className="h-2 w-2/3 rounded bg-black-900/10" />
                        </div>
                      </div>
                      <div className="ml-auto w-3/5 rounded-2xl rounded-tr-md bg-purple-600 p-3">
                        <div className="space-y-1.5">
                          <div className="h-2 w-full rounded bg-white/40" />
                          <div className="h-2 w-1/2 rounded bg-white/25" />
                        </div>
                      </div>
                      <div className="flex items-center rounded-full border border-black-900/10 px-3.5 py-2">
                        <span className="h-2 w-24 rounded bg-black-900/10" />
                        <Send className="ml-auto h-3.5 w-3.5 text-purple-600" />
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6 sm:gap-8 xl:flex-row">
              {/* Safety — tall card: header, visual panel with the
                  feature chips, and the orange CTA panel */}
              <div className="relative flex h-[38rem] flex-col overflow-hidden rounded-7xl bg-[linear-gradient(170deg,#1b2340_0%,#101623_55%,#0a0e18_100%)] sm:h-[59.5rem] xl:h-[41.5rem] xl:w-[26.25rem] xl:shrink-0">
                <div className="relative z-10 flex h-full flex-col p-1 pt-14 xl:pt-14">
                  <div className="px-4 text-center">
                    <h3 className="text-30 font-bold text-white">Safety</h3>
                    <p className="mx-auto mt-3 max-w-[18.25rem] text-15 text-white/80">
                      Layered safeguards work in the background to protect
                      every profile you manage.
                    </p>
                  </div>

                  <div className="relative mt-auto flex flex-col items-center justify-center overflow-hidden rounded-7xl bg-[#10171D] p-4 pt-8">
                    <div
                      aria-hidden="true"
                      className="absolute top-0 left-1/2 h-40 w-40 -translate-x-1/2 rounded-full bg-sky-500/20 blur-[60px]"
                    />
                    {/* Shield composition — native */}
                    <div
                      aria-hidden="true"
                      className="relative flex h-28 w-28 items-center justify-center rounded-full border border-white/10 bg-white/[0.04]"
                    >
                      <span className="absolute inset-3 rounded-full border border-white/[0.07]" />
                      <ShieldCheck className="h-12 w-12 text-sky-300" />
                    </div>
                    <div className="relative mt-6 flex flex-row flex-wrap items-center justify-center gap-x-1.5 gap-y-2">
                      {[
                        "Residential IP routing",
                        "Gradual account warm-up",
                        "Automatic activity limits",
                        "Cloud-hosted profile sessions",
                      ].map((chip) => (
                        <span
                          key={chip}
                          className="rounded-full bg-[#60607D4D] px-2.5 py-1 text-12 font-semibold text-white"
                        >
                          {chip}
                        </span>
                      ))}
                    </div>
                  </div>

                  <div className="relative mt-1 flex items-center justify-center overflow-hidden rounded-full bg-[linear-gradient(120deg,#ff9a3d_0%,#ff7a1a_55%,#ff5f3d_100%)] p-4 py-10 shadow-[inset_0_0_20px_8px_rgba(255,255,255,0.58)] md:py-[3.375rem]">
                    <span className="relative flex items-center gap-2 rounded-full bg-white px-4 py-2 text-13 font-semibold whitespace-nowrap text-black-900 shadow-lg">
                      <ShieldCheck className="h-4 w-4 text-orange-500" />
                      Protection included with every profile
                    </span>
                  </div>
                </div>
              </div>

              {/* Privacy — filled card: centred header, the visibility
                  table filling the card's lower half, a shield
                  composition overlapping it */}
              <div className="relative flex h-[38rem] grow flex-col justify-between overflow-hidden rounded-7xl border border-black-700/60 bg-black-900 px-4 pt-14 pb-4 sm:h-[48.5rem] xl:h-[41.5rem]">
                <div className="px-4 text-center">
                  <h3 className="text-30 font-bold text-white">Privacy</h3>
                  <p className="mx-auto mt-3 max-w-[18.25rem] text-15 text-white/70">
                    When a client connects an account, that connection alone
                    never opens up their profile — clients stay in control of
                    what remains private.
                  </p>
                </div>
                <div className="relative">
                  {/* Shield composition — native */}
                  <div
                    aria-hidden="true"
                    className="absolute -top-32 right-4 z-10 flex h-[124px] w-[122px] items-center justify-center md:-top-44 md:right-18 md:h-[347px] md:w-[344px]"
                  >
                    <span className="absolute inset-0 rounded-full border border-white/[0.08] bg-white/[0.03]" />
                    <span className="absolute inset-[18%] rounded-full border border-white/10 bg-white/[0.04]" />
                    <ShieldCheck className="relative h-1/3 w-1/3 text-purple-300" />
                  </div>
                  <PrivacyTable />
                </div>
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 2. SUPPORT FROM SETUP ONWARDS */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/30 py-24 lg:py-32">
        <div className="section-container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Support from setup onwards
            </h2>
            <p className="mt-5 text-16 sm:text-18 leading-relaxed text-black-300">
              From first-time setup to campaign strategy and day-to-day
              questions, real people are on hand to help you.
            </p>
          </div>

          {/* Card anatomy: tall full-bleed gradient panel (h-100) with
              a centred icon tile, narrow text block underneath */}
          <div className="mx-auto mt-14 grid w-full max-w-[73.75rem] grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
            {supportCards.map((card) => (
              <div
                key={card.title}
                className="glass-card-hover flex h-full flex-col items-center justify-between overflow-hidden p-0"
              >
                <div
                  aria-hidden="true"
                  className="relative flex h-100 w-full items-center justify-center overflow-hidden"
                  style={{ background: card.art }}
                >
                  <span
                    className={`absolute h-56 w-56 rounded-full blur-[90px] ${card.glow}`}
                  />
                  <span className="relative flex h-24 w-24 items-center justify-center rounded-[2rem] border border-white/15 bg-white/[0.07] text-white shadow-2xl backdrop-blur-md">
                    <card.icon className="h-11 w-11" />
                  </span>
                </div>
                <div className="mx-auto flex max-w-[15.25rem] flex-col gap-3 pt-4 pb-13 text-center 2xl:max-w-72">
                  <h3 className="text-24 font-bold text-white">{card.title}</h3>
                  <p className="text-15 font-medium text-black-300">
                    {card.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 3. GROWING YOUR CLIENT ROSTER? */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24 lg:py-32">
        <div className="section-container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Growing your client roster?
            </h2>
            <p className="mt-5 text-16 sm:text-18 leading-relaxed text-black-300">
              NxtSend expands alongside your agency. Add seats when new
              clients sign, or bring in Avatars — rented LinkedIn profiles
              that add sending capacity.
            </p>
            <div className="mt-8">
              <Link
                href="/demo"
                className="group inline-flex items-center gap-2 rounded-full bg-gradient-brand px-8 py-3 text-15 font-semibold text-white shadow-glow-purple transition-all hover:scale-105"
              >
                <span>Talk to sales</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 md:grid-cols-2">
            {/* Agency seats */}
            <div className="glass-card-hover overflow-hidden p-0">
              <GrowSeatsVisual />
              <div className="p-8">
                <h3 className="text-22 font-bold text-white">Agency seats</h3>
                <p className="mt-3 text-14 leading-relaxed text-black-400">
                  Add seats to your plan whenever a new client comes on
                  board — each one costs $20.
                </p>
                <span className="mt-6 inline-flex items-center rounded-full bg-black-700/80 border border-black-600 px-3.5 py-1.5 text-13 font-semibold text-purple-300">
                  +$20 per new seat
                </span>
              </div>
            </div>

            {/* Outreach Avatars */}
            <Link
              href="/avatars"
              className="glass-card-hover group block overflow-hidden p-0"
            >
              <GrowAvatarsVisual />
              <div className="p-8">
                <h3 className="flex items-center gap-2 text-22 font-bold text-white">
                  Outreach Avatars
                  <ArrowRight className="h-5 w-5 text-purple-400 transition-transform group-hover:translate-x-1" />
                </h3>
                <p className="mt-3 text-14 leading-relaxed text-black-400">
                  Rented LinkedIn profiles, already warmed up, for campaigns
                  that need more senders.
                </p>
                <span className="mt-6 inline-flex items-center rounded-full bg-black-700/80 border border-black-600 px-3.5 py-1.5 text-13 font-semibold text-purple-300">
                  Profile plus a seat
                </span>
              </div>
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 4. WORKS ALONGSIDE YOUR EXISTING STACK */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/30 py-24 lg:py-32">
        <div className="section-container">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Works alongside your existing stack
            </h2>
          </div>

          {/* Borderless artwork first, button below it */}
          <div className="mx-auto mt-12 max-w-5xl">
            <Image
              src="/images/home-integrations/integrations-desktop.webp"
              alt="NxtSend Integration Center — the tools connected to your workspace"
              width={2000}
              height={838}
              className="hidden h-auto w-full sm:block"
            />
            <Image
              src="/images/home-integrations/integrations.webp"
              alt="NxtSend Integration Center — the tools connected to your workspace"
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
              <span>View Integrations</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 5. PRICING THAT FITS AN EXPANDING AGENCY */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/40 py-24 lg:py-32">
        <div className="section-container">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Pricing that fits an expanding agency
            </h2>
          </div>

          {/* Wide artwork pricing card (batch 2) — the Monthly/Yearly
              toggle lives inside the card */}
          <div className="mt-14">
            <AgencyPricing />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 6. HOW AGENCIES RUN CLIENT CAMPAIGNS WITH NXTSEND */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-900 py-24 lg:py-32">
        <div className="pointer-events-none absolute right-10 top-1/2 h-[350px] w-[350px] -translate-y-1/2 rounded-full bg-purple-600/15 blur-[140px]" />
        <div className="section-container relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              How agencies run client campaigns with NxtSend
            </h2>
            <p className="mt-5 text-16 sm:text-18 leading-relaxed text-black-300">
              A repeatable way to take a client from signed agreement to live
              outreach — the same steps, workspace by workspace, every time
              a new account joins your roster.
            </p>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {processSteps.map((s) => (
              <div key={s.step} className="glass-card-hover flex flex-col p-8">
                <span className="text-11 font-bold uppercase tracking-wider text-purple-400">
                  {s.step}
                </span>
                <h3 className="mt-5 text-18 font-bold leading-snug text-white">
                  {s.title}
                </h3>
                <p className="mt-3 text-14 leading-relaxed text-black-300">
                  {s.text}
                </p>
              </div>
            ))}
          </div>

          <div className="glass-card mt-6 p-8 text-center">
            <h3 className="text-18 font-bold text-white">
              One place for the whole roster
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-14 leading-relaxed text-black-300">
              Your team signs in once and moves between client workspaces as
              work demands, while each client continues to see reporting and
              communication presented under your agency&apos;s name.
            </p>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 7. START YOUR NEXT CLIENT CAMPAIGN HERE */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-black-700/80 bg-gradient-hero py-24 lg:py-32">
        <div className="pointer-events-none absolute inset-0 bg-radial-glow opacity-30" />
        <div className="section-container relative z-10 text-center">
          <div className="mx-auto max-w-3xl rounded-3xl border border-purple-500/30 bg-black-800/80 p-8 shadow-glow-purple/20 backdrop-blur-2xl sm:p-14">
            <h2 className="text-36 sm:text-48 font-extrabold text-white tracking-tight">
              Start your next client campaign here
            </h2>
            <p className="mt-4 text-17 sm:text-20 text-black-300">
              Bring your clients&apos; LinkedIn outreach into one organized
              workspace, with campaigns your team can set up, run and report
              on together.
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
                <ShieldCheck className="h-3.5 w-3.5 text-green-400" /> Safe &amp;
                secure
              </span>
              <span className="flex items-center gap-1.5">
                <Headphones className="h-3.5 w-3.5 text-green-400" /> Support
                included
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
