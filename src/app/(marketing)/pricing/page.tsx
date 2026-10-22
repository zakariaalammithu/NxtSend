import { Fragment } from "react";
import Link from "next/link";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  X,
  ShieldCheck,
  Headphones,
} from "lucide-react";
import { HomeFaq } from "@/components/marketing/HomeFaq";
import { PricingCards } from "@/components/marketing/PricingCards";
import { BillingProvider } from "@/components/marketing/BillingContext";
import { CompareTableHead } from "@/components/marketing/CompareTableHead";

export const metadata: Metadata = {
  title: { absolute: "NxtSend Pricing – Transparent Plans for LinkedIn Automation" },
  description:
    "Compare NxtSend plans for solo senders, teams and agencies. Start with a 14-day free trial, pay per outreach seat, add rented avatar profiles, or run clients from an agency workspace.",
};

/* ── Feature comparison table ──────────────────────────────────────────── */
/* Cell values: "check" = included, "x" = not included, otherwise literal  */
/* text (e.g. "200/week", "Unlimited", "Not Applicable").                  */
/* Column order: Outreach seat · Outreach avatar · Agency.                 */
type CompareCell = "check" | "x" | string;

interface CompareRow {
  name: string;
  note?: string;
  cells: [CompareCell, CompareCell, CompareCell];
}

interface CompareGroup {
  title: string;
  rows: CompareRow[];
}

const comparisonGroups: CompareGroup[] = [
  {
    title: "Everyday essentials",
    rows: [
      { name: "Outreach using rented profiles", cells: ["x", "check", "x"] },
      { name: "Viewing prospect profiles", cells: ["check", "check", "check"] },
      {
        name: "Connection invitations",
        note: "Sending a note with a connection invitation requires a Premium or Sales Navigator licence on the profile",
        cells: ["200/week", "100/week", "200/week"],
      },
      {
        name: "Multi-step message sequences",
        cells: ["Unlimited", "Unlimited", "Unlimited"],
      },
      { name: "Personalisation variables", cells: ["check", "check", "check"] },
      {
        name: "Messaging requests",
        cells: ["200/week", "150/week", "200/week"],
      },
      {
        name: "Reacting to posts",
        note: "Beyond a standard like, pick from love, insightful, funny, celebrate and support reactions for each post you engage with",
        cells: ["check", "check", "check"],
      },
      {
        name: "Free InMails for open profiles",
        note: "Free InMails can go to open profiles, and the monthly allowance depends on the account — typically between 100 and 800 per month",
        cells: ["check", "check", "check"],
      },
      { name: "Endorsing skills", cells: ["check", "check", "check"] },
      {
        name: "Voice messages",
        note: "Recorded in the app and delivered as email attachments — in campaigns or from the unified inbox",
        cells: ["check", "check", "check"],
      },
      {
        name: "File attachments",
        note: "Share files through campaign steps or the unified inbox",
        cells: ["check", "check", "check"],
      },
      {
        name: "Video messages",
        note: "Include videos in campaign steps or the unified inbox",
        cells: ["check", "check", "check"],
      },
      {
        name: "Analytics & reporting",
        note: "See workspace-level reporting alongside results for every campaign you run",
        cells: ["check", "check", "check"],
      },
    ],
  },
  {
    title: "Campaign starting points",
    rows: [
      { name: "Standard LinkedIn search", cells: ["check", "check", "check"] },
      {
        name: "Sales Navigator search",
        note: "Running these campaigns requires an active Sales Navigator subscription on LinkedIn for at least one profile linked to your workspace",
        cells: ["check", "check", "check"],
      },
      { name: "People who engaged with a post", cells: ["check", "check", "check"] },
      { name: "Event participant lists", cells: ["check", "check", "check"] },
      { name: "Members of LinkedIn groups", cells: ["check", "check", "check"] },
      { name: "Your own uploaded list", cells: ["check", "check", "check"] },
      { name: "Filtering for 1st-degree connections", cells: ["check", "check", "check"] },
    ],
  },
  {
    title: "Protection & account safety",
    rows: [
      {
        name: "Region-matched IP addresses",
        note: "Choose IP locations across a wide range of countries, matched to where each profile normally operates",
        cells: ["check", "check", "check"],
      },
      { name: "Use your own IP addresses", cells: ["check", "check", "check"] },
      { name: "Password-free sign-in", cells: ["check", "check", "check"] },
      {
        name: "Controls for inbox privacy",
        note: "Limit inbox access to conversations that started through NxtSend campaigns",
        cells: ["check", "check", "check"],
      },
      { name: "Built-in activity caps", cells: ["check", "check", "check"] },
      { name: "Gradual account warm-up", cells: ["check", "check", "check"] },
    ],
  },
  {
    title: "Tuning campaign performance",
    rows: [
      { name: "Sending in the prospect's time zone", cells: ["check", "check", "check"] },
      { name: "Workspace-wide analytics", cells: ["check", "check", "check"] },
      { name: "A/B split testing", cells: ["check", "check", "check"] },
      { name: "Tags & labels for organisation", cells: ["check", "check", "check"] },
      { name: "Person blocklist", cells: ["check", "check", "check"] },
      { name: "Company blocklist", cells: ["check", "check", "check"] },
      { name: "Reusable custom variables", cells: ["check", "check", "check"] },
      { name: "Automatic message translation", cells: ["check", "check", "check"] },
      {
        name: "Distributing Sales Navigator leads",
        note: "Distribute leads across profiles connected to your workspace",
        cells: ["check", "check", "check"],
      },
    ],
  },
  {
    title: "White-label branding",
    rows: [
      {
        name: "Your branding on the dashboard",
        cells: ["x", "Not Applicable", "check"],
      },
      {
        name: "Branded account-connection flow",
        cells: ["x", "Not Applicable", "check"],
      },
      { name: "Central master view", cells: ["x", "Not Applicable", "check"] },
      {
        name: "Unbranded login extension",
        cells: ["x", "Not Applicable", "check"],
      },
      {
        name: "Emails sent under your brand",
        cells: ["x", "Not Applicable", "check"],
      },
      {
        name: "Help centre with your branding",
        cells: ["x", "Not Applicable", "check"],
      },
    ],
  },
  {
    title: "Working as a team",
    rows: [
      { name: "No cap on team members", cells: ["check", "check", "check"] },
      { name: "Role & permission controls", cells: ["check", "check", "check"] },
    ],
  },
];

/* ── FAQ — the same 9 questions as the homepage ─────────────────────────── */
const faqs = [
  {
    question: "Can I rent LinkedIn profiles for outreach inside NxtSend?",
    answer:
      "Yes — avatar profiles can be rented without leaving the app. Ordering takes a few clicks, profiles are added directly to your workspace, and you can start planning outreach around them straight away.",
  },
  {
    question:
      "What if I would rather use my own LinkedIn profiles instead of renting?",
    answer:
      "That works too. Renting is entirely optional — NxtSend is a complete outreach platform on its own, and you can connect as many of your own LinkedIn profiles to a workspace as you need.",
  },
  {
    question: "Is a free trial available?",
    answer:
      "Yes — every LinkedIn Outreach plan starts with a 14-day free trial.",
  },
  {
    question: "Can rental profiles be tried out at no cost?",
    answer:
      "Not at the moment — rented profiles are paid for in advance. To keep the risk low, each rental is covered by a money-back guarantee for the first 48 hours if it is not right for you.",
  },
  {
    question: "Can existing connections be messaged too?",
    answer:
      "Yes — seven campaign types are built for first-degree connections, with detailed filters and criteria to help you pick exactly who receives them.",
  },
  {
    question: "Do I have to give you my LinkedIn password to connect an account?",
    answer:
      "No. Connecting a profile never means handing your password to NxtSend — the app does not ask for, store or reuse LinkedIn passwords. You link the account by following the connection steps inside your workspace instead.",
  },
  {
    question: "Does NxtSend work alongside Sales Navigator?",
    answer:
      "Yes. You can run campaigns built on Sales Navigator searches inside NxtSend, and leads can be exported and shared with the other profiles linked to your workspace. One active Sales Navigator subscription, on at least one connected profile, is enough for the team to use them.",
  },
  {
    question: "What white-label options are available for agencies?",
    answer:
      "A fully white-labelled product is not something we offer today. What agencies can brand today includes selected parts of the experience — the LinkedIn connection flow and client reporting among them — so client-facing surfaces carry your identity where it counts.",
  },
  {
    question: "Are proxies included, or should I supply my own?",
    answer:
      "Both routes are open: a proxy pool is included at no extra cost, and you are free to connect your own proxies if you prefer.",
  },
];

function CompareCellValue({ value }: { value: CompareCell }) {
  if (value === "check") {
    return <Check className="mx-auto h-5 w-5 text-purple-400" />;
  }
  if (value === "x") {
    return <X className="mx-auto h-5 w-5 text-black-500" />;
  }
  return <span className="font-semibold text-white">{value}</span>;
}

export default function PricingPage() {
  return (
    <div className="relative overflow-hidden bg-black-900">
      {/* BillingProvider spans the plan cards and the comparison table so
          every Monthly/Yearly toggle on this page shares one state. */}
      <BillingProvider>
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HERO + PLAN CARDS */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative pt-12 pb-24 lg:pt-20">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-purple-600/20 blur-[130px]" />
        <div className="section-container relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-40 sm:text-54 font-extrabold tracking-tight text-white">
              Pricing that grows as your outreach does
            </h1>
            <p className="mt-4 text-16 sm:text-18 leading-relaxed text-black-300">
              Every plan includes the core platform. Choose the setup that
              fits your team today, and upgrade, downgrade or cancel whenever
              things change.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-13 text-black-400">
              <div className="flex items-center gap-1.5 rounded-full border border-black-700/80 bg-black-800/60 px-3.5 py-1.5 backdrop-blur-sm">
                <Check className="h-3.5 w-3.5 text-purple-400" />
                <span>Free 14-day trial</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-black-700/80 bg-black-800/60 px-3.5 py-1.5 backdrop-blur-sm">
                <Check className="h-3.5 w-3.5 text-purple-400" />
                <span>No card required</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-black-700/80 bg-black-800/60 px-3.5 py-1.5 backdrop-blur-sm">
                <Check className="h-3.5 w-3.5 text-purple-400" />
                <span>Ready in minutes</span>
              </div>
            </div>
          </div>

          <div className="mt-12">
            <PricingCards />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* FEATURE COMPARISON TABLE */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24">
        <div className="section-container">
          <div className="overflow-x-auto rounded-2xl border border-black-700 bg-black-800/40 backdrop-blur-md">
            <table className="w-full min-w-[720px] border-collapse text-left text-13">
              <CompareTableHead />
              <tbody className="divide-y divide-black-800">
                {comparisonGroups.map((group) => (
                  <Fragment key={group.title}>
                    <tr className="bg-black-900/90">
                      <td
                        colSpan={4}
                        className="px-5 py-4 text-15 font-bold text-white sm:px-6"
                      >
                        {group.title}
                      </td>
                    </tr>
                    {group.rows.map((row) => (
                      <tr key={row.name} className="table-row-hover">
                        <td className="px-5 py-3.5 font-medium text-white sm:px-6">
                          {row.name}
                          {row.note && (
                            <span className="mt-0.5 block text-12 font-normal leading-relaxed text-black-500">
                              {row.note}
                            </span>
                          )}
                        </td>
                        {row.cells.map((cell, i) => (
                          <td key={i} className="px-5 py-3.5 text-center sm:px-6">
                            <CompareCellValue value={cell} />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
      </BillingProvider>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* FREQUENTLY ASKED QUESTIONS */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/40 py-24">
        <div className="section-container">
          <div className="mx-auto max-w-4xl">
            <div className="mb-12 text-center">
              <h2 className="text-36 sm:text-48 font-bold tracking-tight text-white">
                Answers to common questions
              </h2>
            </div>
            <HomeFaq items={faqs} />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* START SCALING YOUR OUTREACH TODAY */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-black-700/80 bg-gradient-hero py-24">
        <div className="pointer-events-none absolute inset-0 bg-radial-glow opacity-30" />
        <div className="section-container relative z-10 text-center">
          <div className="mx-auto max-w-3xl rounded-3xl border border-purple-500/30 bg-black-800/80 p-8 shadow-glow-purple/20 backdrop-blur-2xl sm:p-14">
            <h2 className="text-36 sm:text-48 font-extrabold tracking-tight text-white">
              Start building a bigger LinkedIn pipeline
            </h2>
            <p className="mt-4 text-17 sm:text-20 text-black-300">
              Bring your campaigns, replies and leads into one place, and run
              LinkedIn outreach that is easier to manage and easier to grow.
              Create your account to begin.
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
                required
              </span>
              <span className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-green-400" /> Secure
                by design
              </span>
              <span className="flex items-center gap-1.5">
                <Headphones className="h-3.5 w-3.5 text-green-400" /> Support
                around the clock
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
