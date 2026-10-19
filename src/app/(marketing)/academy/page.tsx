import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ShieldCheck,
  Headphones,
} from "lucide-react";
import { AcademySeries } from "@/components/marketing/AcademySeries";

export const metadata: Metadata = {
  title: { absolute: "NxtSend Academy – Learn LinkedIn outreach step by step" },
  description:
    "Work through the NxtSend Academy syllabus: account setup, audience targeting, message writing, follow-up sequences, inbox habits and reading your campaign results.",
};

/* ──────────────────────────────────────────────────────────────────────── */
/* More-resources cards. The mirror page pointed two of these cards at   */
/* its own help and documentation subdomains; those addresses are never */
/* carried over, and this app has no separate help or docs routes, so   */
/* both cards lead to /contact — the same target the app's Footer uses. */
/* The mirror's third card promoted a directory of outside consultants; */
/* it has been replaced with a direct route to the NxtSend team.        */
/* ──────────────────────────────────────────────────────────────────────── */
const resources = [
  {
    title: "Help Center",
    description:
      "Guides for getting set up, answers to everyday questions, and help when something does not behave as expected.",
    href: "/contact",
  },
  {
    title: "API Docs",
    description: "Connect your own tools to NxtSend and work with the public API.",
    href: "/contact",
  },
  {
    title: "Talk to our team",
    description: "Questions the lessons do not cover? Send us a message and we will point you in the right direction.",
    href: "/contact",
  },
];

/** Link glyph, path copied from the mirror's own icon set. */
function LinkIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      viewBox="0 0 256 256"
      className={className}
      aria-hidden="true"
    >
      <path d="M165.66 90.34a8 8 0 0 1 0 11.32l-64 64a8 8 0 0 1-11.32-11.32l64-64a8 8 0 0 1 11.32 0M215.6 40.4a56 56 0 0 0-79.2 0l-30.06 30.05a8 8 0 0 0 11.32 11.32l30.06-30a40 40 0 0 1 56.57 56.56l-30.07 30.06a8 8 0 0 0 11.31 11.32l30.07-30.11a56 56 0 0 0 0-79.2m-77.26 133.82-30.06 30.06a40 40 0 1 1-56.56-56.57l30.05-30.05a8 8 0 0 0-11.32-11.32L40.4 136.4a56 56 0 0 0 79.2 79.2l30.06-30.07a8 8 0 0 0-11.32-11.31" />
    </svg>
  );
}

export default function AcademyPage() {
  return (
    <div className="relative overflow-hidden bg-black-900">
      {/* Hero + course series (client component) */}
      <AcademySeries />

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* MORE RESOURCES (3 cards under a centred heading)                    */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section>
        <div className="mx-auto flex w-full max-w-[1492px] flex-col px-4 py-8 md:px-6 md:py-10 xl:px-24">
          <div className="mx-auto mt-16 mb-12 flex w-full max-w-[648px] flex-col items-center md:mt-20 xl:mt-28 xl:mb-20">
            <h2 className="mb-6 text-center text-30 font-semibold text-white last:mb-0 md:text-36 xl:text-54">
              More resources
            </h2>
          </div>
          <div className="flex flex-wrap justify-center gap-4 md:gap-6">
            {resources.map((resource) => (
              <Link
                key={resource.title}
                href={resource.href}
                className="group relative flex h-full w-full flex-col rounded-3xl border border-white/10 p-4 text-left text-white transition-colors hover:bg-white/5 md:w-[calc(50%-12px)] xl:w-[calc(25%-18px)]"
              >
                <div className="relative flex flex-1 flex-col">
                  <div className="mb-6 flex size-11 items-center justify-center rounded-2xl bg-black-800">
                    <LinkIcon className="size-5" />
                  </div>
                  <span className="mb-2 text-18 font-bold">
                    {resource.title}
                  </span>
                  <p className="mb-8 flex-1 text-14 font-medium text-white/70">
                    {resource.description}
                  </p>
                  <div className="relative flex size-9 rounded-xl border border-black-700">
                    <ArrowUpRight className="m-auto size-4 text-white/20 transition-colors group-hover:text-white" />
                  </div>
                </div>
              </Link>
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
            <h2 className="text-36 sm:text-48 font-extrabold tracking-tight text-white">
              Ready to put the lessons into practice?
            </h2>
            <p className="mt-4 text-17 sm:text-20 text-black-300">
              Open your workspace, connect an account and work through your
              first campaign at your own pace — the Academy syllabus stays
              here whenever you need to revisit a step.
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
