import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Headphones,
} from "lucide-react";
import { AgencyPricing } from "@/components/marketing/AgencyPricing";

export const metadata: Metadata = {
  title: { absolute: "NxtSend Agency – Agency outreach that grows with your clients" },
  description:
    "Run LinkedIn outreach for every client from separate workspaces, present it under your own brand, and handle replies together in one unified inbox.",
};

/* ── Support cards (mirror: aimfox.com/agency) ───────────────────────────── */
const supportCards = [
  {
    title: "Onboarding",
    text: "A specialist walks your team through account setup, workspace configuration and your first client campaign launch.",
    image: "/images/agency/support-onboarding.webp",
    alt: "Onboarding",
  },
  {
    title: "Advanced workflows",
    text: "Apply ready-made sequence patterns designed for multi-client outreach work.",
    image: "/images/agency/support-workflows.webp",
    alt: "Advanced workflows",
  },
  {
    title: "Help when you need it",
    text: "Your account manager answers questions and troubleshoots issues as they arise.",
    image: "/images/agency/support-help.webp",
    alt: "Help when you need it",
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

export default function AgencyPage() {
  return (
    <div className="relative min-h-screen bg-black-900">
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HERO */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden bg-gradient-hero pt-12 pb-20 lg:pt-20 lg:pb-28">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-purple-600/20 blur-[130px]" />
        <div className="pointer-events-none absolute top-1/3 -right-40 h-[350px] w-[350px] rounded-full bg-orange-600/15 blur-[120px]" />

        <div className="section-container relative z-10">
          <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2">
            <div className="text-center lg:text-left">
              <h1 className="text-44 sm:text-54 lg:text-64 font-extrabold tracking-tight text-white leading-[1.08]">
                Agency outreach that{" "}
                <span className="text-gradient-brand">grows with your clients</span>
              </h1>

              <p className="mx-auto mt-6 max-w-xl text-17 sm:text-20 leading-relaxed text-black-300 lg:mx-0">
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

            <div className="relative overflow-hidden rounded-3xl border border-black-700/80 shadow-2xl">
              <Image
                src="/images/agency/hero.webp"
                alt="Agency plan artwork"
                width={4096}
                height={1497}
                className="h-full w-full object-cover"
                priority
              />
              <Image
                src="/images/agency/agency-plan.webp"
                alt="Agency plan details"
                width={1200}
                height={1128}
                className="absolute bottom-0 right-0 w-1/2 object-cover"
              />
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

          {/* Bento grid — batch 2: rebuilt to the mirror's own card
              compositions (mirror: agency.html "scale" bento). The mirror
              lays the section on a white panel; the cards' internal
              compositions (full-bleed artwork, title positions, Safety's
              3D-visual panel + orange CTA panel) are the mirror's, while
              the section keeps this site's dark theme. */}
          <div className="mx-auto mt-14 grid w-full max-w-[73.75rem] gap-6 sm:gap-8">
            {/* Fully whitelabel — title bottom-right, as in the mirror */}
            <div className="relative h-[26rem] overflow-hidden rounded-7xl xl:h-[41.5rem]">
              <Image
                src="/images/agency/whitelabel-bg.webp"
                alt="Fully white-label. Entirely your brand."
                fill
                sizes="(max-width: 1200px) 100vw, 1180px"
                className="object-cover"
              />
              <div className="absolute inset-0 flex justify-center p-8 md:p-16 xl:items-end xl:justify-end xl:p-14">
                <h3 className="text-center text-30 font-bold text-white sm:text-36 xl:text-right xl:text-30">
                  Fully white-label.
                  <br />
                  Entirely your brand.
                </h3>
              </div>
            </div>

            <div className="flex flex-col gap-6 sm:gap-8 xl:flex-row">
              {/* Workspaces — title at the top, as in the mirror */}
              <div className="relative h-[26rem] grow overflow-hidden rounded-7xl xl:h-[41.5rem]">
                <Image
                  src="/images/agency/workspaces-bg.webp"
                  alt="Workspaces"
                  fill
                  sizes="(max-width: 1280px) 100vw, 720px"
                  className="object-cover object-center"
                />
                <div className="relative z-10 px-4 pt-14 text-center">
                  <h3 className="text-30 font-bold text-white">Workspaces</h3>
                  <p className="mx-auto mt-3 max-w-[18.25rem] text-15 text-white">
                    Each client stays in their own space, while your team
                    keeps oversight of every account.
                  </p>
                </div>
              </div>

              {/* Account manager — dark text on the light artwork (mirror) */}
              <div className="relative h-[26rem] overflow-hidden rounded-7xl xl:h-[41.5rem] xl:w-[26.25rem] xl:shrink-0">
                <Image
                  src="/images/agency/account-manager-bg.webp"
                  alt="Account manager"
                  fill
                  sizes="(max-width: 1280px) 100vw, 420px"
                  className="object-cover object-center"
                />
                <div className="relative z-10 px-4 pt-14 text-center text-black-900">
                  <h3 className="text-30 font-bold">Account manager</h3>
                  <p className="mx-auto mt-3 max-w-[18.25rem] text-15">
                    Work with a named account manager, reach the team in
                    Slack, and get help moving profiles over.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-6 sm:gap-8 xl:flex-row">
              {/* Safety — tall card: header, 3D-visual panel with the
                  feature chips, and the mirror's orange CTA panel */}
              <div className="relative flex h-[38rem] flex-col overflow-hidden rounded-7xl sm:h-[59.5rem] xl:h-[41.5rem] xl:w-[26.25rem] xl:shrink-0">
                <Image
                  src="/images/agency/safety-bg.webp"
                  alt=""
                  fill
                  sizes="(max-width: 1280px) 100vw, 420px"
                  className="object-cover object-center"
                />
                <div className="relative z-10 flex h-full flex-col p-1 pt-14 xl:pt-14">
                  <div className="px-4 text-center">
                    <h3 className="text-30 font-bold text-white">Safety</h3>
                    <p className="mx-auto mt-3 max-w-[18.25rem] text-15 text-white/80">
                      Layered safeguards work in the background to protect
                      every profile you manage.
                    </p>
                  </div>

                  <div className="relative mt-auto flex items-end justify-center overflow-hidden rounded-7xl bg-[#10171D] p-4">
                    <Image
                      src="/images/agency/safety-icon.webp"
                      alt="Safety"
                      fill
                      sizes="(max-width: 1280px) 100vw, 420px"
                      className="object-cover object-center"
                    />
                    <div className="relative flex flex-row flex-wrap items-center justify-center gap-x-1.5 gap-y-2 pt-46">
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

                  <div className="relative mt-1 flex items-center justify-center overflow-hidden rounded-full p-4 py-10 shadow-[inset_0_0_20px_8px_rgba(255,255,255,0.58)] md:py-[3.375rem]">
                    <Image
                      src="/images/agency/safety-cta-bg.webp"
                      alt=""
                      fill
                      sizes="(max-width: 1280px) 100vw, 420px"
                      className="object-cover object-center"
                    />
                    {/* The mirror's CTA panel centres this pill
                        artwork (extracted from the mirror HTML) */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/agency/safety-cta-pill.svg"
                      alt="Protection included with every profile"
                      className="relative h-8 w-auto"
                    />
                  </div>
                </div>
              </div>

              {/* Privacy — filled card (mirror): centred header, the
                  comparison table artwork filling the card's lower half,
                  privacy icon overlapping it */}
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
                  <Image
                    src="/images/agency/privacy-icon.webp"
                    alt="Privacy illustration"
                    width={1200}
                    height={1192}
                    className="absolute -top-24 right-10 z-10 h-[207px] w-[204px] object-cover md:-top-44 md:right-18 md:h-[347px] md:w-[344px]"
                  />
                  <div className="relative w-full overflow-hidden rounded-6xl">
                    <Image
                      src="/images/agency/privacy-table.webp"
                      alt="Privacy feature comparison table"
                      width={1200}
                      height={611}
                      className="hidden h-auto w-full md:block"
                    />
                    <Image
                      src="/images/agency/privacy-table-mobile.webp"
                      alt="Privacy feature comparison table"
                      width={1092}
                      height={1131}
                      className="block h-auto w-full md:hidden"
                    />
                  </div>
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

          {/* Mirror card anatomy: tall full-bleed artwork (h-100),
              centred narrow text block underneath */}
          <div className="mx-auto mt-14 grid w-full max-w-[73.75rem] grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
            {supportCards.map((card) => (
              <div
                key={card.title}
                className="glass-card-hover flex h-full flex-col items-center justify-between overflow-hidden p-0"
              >
                <Image
                  src={card.image}
                  alt={card.alt}
                  width={1200}
                  height={667}
                  className="h-100 w-full object-cover"
                />
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
              <Image
                src="/images/agency/grow-seats.webp"
                alt="Agency seats"
                width={1096}
                height={1067}
                className="h-64 w-full object-cover"
              />
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
              <Image
                src="/images/agency/grow-avatars.webp"
                alt="Outreach Avatars"
                width={1124}
                height={1061}
                className="h-64 w-full object-cover"
              />
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

          {/* Mirror order (batch 2, same as the homepage fix): borderless
              artwork first, button below it */}
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
              toggle lives inside the card, as in the mirror */}
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
