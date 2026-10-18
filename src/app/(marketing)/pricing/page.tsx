import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  X,
  Star,
  ShieldCheck,
  Headphones,
} from "lucide-react";
import { HomeFaq } from "@/components/marketing/HomeFaq";
import { PricingCards } from "@/components/marketing/PricingCards";

export const metadata: Metadata = {
  title: "NxtSend Pricing – Transparent Plans for LinkedIn Automation",
  description:
    "Explore NxtSend pricing plans designed for agencies, growth teams and solo founders — start with a free CRM, pay only for outreach seats when you scale.",
};

/* ── Testimonials (mirror: aimfox.com/pricing — same 3 as homepage hero) ── */
const testimonials = [
  {
    quote:
      "Aimfox really gave us every single functionality we could think of. It has become an integral part of our GTM stack and an amzing source of new interested leads!",
    name: "Jessica Looney",
    title: "Enterprise AE",
    company: "chargebee",
    photo: "/images/testimonials/jessica-looney.jpeg",
  },
  {
    quote:
      "I always thought that LinekdIn outreach dosen't scale - until Aimfox proved me wrong. Such an amazing team behind the product. Super excited for what the future holds!",
    name: "Marc Gaudett",
    title: "Head of Partnerships",
    company: "instantly",
    photo: "/images/testimonials/marc-gaudett.jpeg",
  },
  {
    quote:
      "The thing that probably sets Aimfox apart the most from other LinkedIn outreach tools is the the option to rent LinkedIn profiles natively. For us this means that we can scale LinekdIn outbound at the same pace we scale email outbound.",
    name: "Xavier C.",
    title: "Founder",
    company: "oneaway",
    photo: "/images/testimonials/xavier-c..jpeg",
  },
];

/* ── Feature comparison (mirror: aimfox.com/pricing table) ──────────────── */
/* Cell values: "check" = included, "x" = not included, otherwise literal  */
/* text from the mirror (e.g. "200/week", "Unlimited", "Not Applicable").   */
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
    title: "Highlights",
    rows: [
      { name: "Outreach with rental profiles", cells: ["x", "check", "x"] },
      { name: "Profile viewing", cells: ["check", "check", "check"] },
      {
        name: "Connection requests",
        note: "In order to send notes with connection requests, you need to have a Premium or Sales Navigator licence",
        cells: ["200/week", "100/week", "200/week"],
      },
      {
        name: "Messaging sequences",
        cells: ["Unlimited", "Unlimited", "Unlimited"],
      },
      { name: "Custom variables", cells: ["check", "check", "check"] },
      {
        name: "Message requests",
        cells: ["200/week", "150/week", "200/week"],
      },
      {
        name: "Reactions to posts",
        note: "Alongside the “like” option, we also let you choose from “love”, “insightful”, “funny”, “celebrate” and “support”.",
        cells: ["check", "check", "check"],
      },
      {
        name: "Free InMails",
        note: "Free InMail can be sent to Open profiles and limits very on each account. Usually the go from 100 to 800 free InMails per month",
        cells: ["check", "check", "check"],
      },
      { name: "Skill endorsements", cells: ["check", "check", "check"] },
      {
        name: "Voice notes",
        note: "Can be sent both from the campaigns and unibox",
        cells: ["check", "check", "check"],
      },
      {
        name: "Attachments",
        note: "Can be sent both from the campaigns and unibox",
        cells: ["check", "check", "check"],
      },
      {
        name: "Videos",
        note: "Can be sent both from the campaigns and unibox",
        cells: ["check", "check", "check"],
      },
      {
        name: "Reporting & Analytics",
        note: "Get detailed reports for your workspace and campaign performance",
        cells: ["check", "check", "check"],
      },
    ],
  },
  {
    title: "Campaign types",
    rows: [
      { name: "LinkedIn search", cells: ["check", "check", "check"] },
      {
        name: "Sales Navigator",
        note: "In order to use Sales Navigator campaigns you need to have an active Sales Navigator subscription on Linkedin for at least one profile connected to your workspace",
        cells: ["check", "check", "check"],
      },
      { name: "Post engagers", cells: ["check", "check", "check"] },
      { name: "Event attendees", cells: ["check", "check", "check"] },
      { name: "Group members", cells: ["check", "check", "check"] },
      { name: "Custom List", cells: ["check", "check", "check"] },
      { name: "1st degree filtering", cells: ["check", "check", "check"] },
    ],
  },
  {
    title: "Safety and security",
    rows: [
      {
        name: "Local IP addresses",
        note: "We have over 70 countries in our IP address pool. We guarantee top quality.",
        cells: ["check", "check", "check"],
      },
      { name: "Bring-your-own IPs", cells: ["check", "check", "check"] },
      { name: "Passwordless login", cells: ["check", "check", "check"] },
      {
        name: "Inbox privacy settings",
        note: "Allow access only to conversations generated through Aimfox",
        cells: ["check", "check", "check"],
      },
      { name: "Hard-coded limits", cells: ["check", "check", "check"] },
      { name: "Warmup", cells: ["check", "check", "check"] },
    ],
  },
  {
    title: "Performance optimization",
    rows: [
      { name: "Target’s Time Zone", cells: ["check", "check", "check"] },
      { name: "Global Analytics", cells: ["check", "check", "check"] },
      { name: "A/B Testing", cells: ["check", "check", "check"] },
      { name: "Tagging and Labeling", cells: ["check", "check", "check"] },
      { name: "User blacklist", cells: ["check", "check", "check"] },
      { name: "Company blacklist", cells: ["check", "check", "check"] },
      { name: "Custom variables", cells: ["check", "check", "check"] },
      { name: "Auto-translation", cells: ["check", "check", "check"] },
      {
        name: "Sales Navigator lead distribution",
        note: "Allow access only to conversations generated through Aimfox",
        cells: ["check", "check", "check"],
      },
    ],
  },
  {
    title: "Full whitelabel",
    rows: [
      {
        name: "Dashboard branding",
        cells: ["x", "Not Applicable", "check"],
      },
      {
        name: "Connection flow branding",
        cells: ["x", "Not Applicable", "check"],
      },
      { name: "Master view", cells: ["x", "Not Applicable", "check"] },
      {
        name: "Brand-neutral login extention",
        cells: ["x", "Not Applicable", "check"],
      },
      {
        name: "Branded email flows",
        cells: ["x", "Not Applicable", "check"],
      },
      {
        name: "Branded knowledge base",
        cells: ["x", "Not Applicable", "check"],
      },
    ],
  },
  {
    title: "Team Collaboration",
    rows: [
      { name: "Unlimited team members", cells: ["check", "check", "check"] },
      { name: "Permissions settings", cells: ["check", "check", "check"] },
    ],
  },
];

/* ── FAQ (mirror: aimfox.com/pricing — same 9 questions as the homepage;   */
/* answers are the ones recovered from the homepage mirror's state, since  */
/* the pricing mirror lazy-loads its answers and ships none in its HTML)   */
const faqs = [
  {
    question: "Can I rent LinkedIn outreach profiles directly through Aimfox?",
    answer:
      "Yes. You can rent LinkedIn profiles directly through the app. The experience is seamless and delivery is instant. We keep it simple and effective!",
  },
  {
    question:
      "I’m not interested in renting profiles, can I just add my own profiles?",
    answer:
      "Absolutely. Aimfox is a full-fledged LinkedIn outreach tool and you can add an unlimited number of LinkedIn profiles to your workspace. LinkedIn profile rental is optional.",
  },
  {
    question: "Is there a free trial?",
    answer: "Yes, there's a 14-day free trial for the LinkedIn Outreach plan.",
  },
  {
    question: "Can I try rental LinkedIn accounts for free?",
    answer:
      "Sadly, this is not an option, you have to pay upfront. However, the good thing is that we offer a 48h money back guarantee, in case you’re not satisfied!",
  },
  {
    question: "Can I message 1st connections?",
    answer:
      "Yes you can! We give you 7 different campaign options for your 1st connections, with a plethora of advanced filters and selection criteria.",
  },
  {
    question: "Do I need to share the LinkedIn password for my account?",
    answer:
      "You don’t. When connecting a LinkedIn account to Aimfox you have an option to use our Google Chrome Extension to sync an existing LinkedIn session from your browser with Aimfox. No password required. Alternatively, you can always connect using your credentials.",
  },
  {
    question: "Do you support Sales Navigator?",
    answer:
      "Yes! We are the only tool on the market that has a native Sales Navigator integration. This means that you can manage your Sales Navigator through Aimfox and even export and share leads with other connected LinkedIn profiles. With Aimfox, your team only needs one Sales Navigator licence.",
  },
  {
    question: "What are the white-labeling options with Aimfox?",
    answer:
      "We don’t provide a full whitelabel. However, we give you options to whitelabel parts of the app such as LinkedIn account connection flow, reporting, etc. This is intended to support agencies. A full whitelabel is in the pipeline!",
  },
  {
    question: "Do you provide proxies, or do I have to bring my own?",
    answer:
      "You can access, for free, our pool of top-notch proxies from over 60 countries! If you prefer to bring your own, that's also an option!",
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
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HERO + PLAN CARDS (mirror: aimfox.com/pricing) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative pt-12 pb-24 lg:pt-20">
        <div className="pointer-events-none absolute -top-40 left-1/2 h-[500px] w-[800px] -translate-x-1/2 rounded-full bg-purple-600/20 blur-[130px]" />
        <div className="section-container relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <h1 className="text-40 sm:text-54 font-extrabold tracking-tight text-white">
              Pricing that scales with your growth
            </h1>
            <p className="mt-4 text-16 sm:text-18 leading-relaxed text-black-300">
              Get full access to all core features. Choose a plan that fits
              your team, upgrade or cancel anytime.
            </p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-13 text-black-400">
              <div className="flex items-center gap-1.5 rounded-full border border-black-700/80 bg-black-800/60 px-3.5 py-1.5 backdrop-blur-sm">
                <Check className="h-3.5 w-3.5 text-purple-400" />
                <span>14-day free trial</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-black-700/80 bg-black-800/60 px-3.5 py-1.5 backdrop-blur-sm">
                <Check className="h-3.5 w-3.5 text-purple-400" />
                <span>No credit card required</span>
              </div>
              <div className="flex items-center gap-1.5 rounded-full border border-black-700/80 bg-black-800/60 px-3.5 py-1.5 backdrop-blur-sm">
                <Check className="h-3.5 w-3.5 text-purple-400" />
                <span>2 minute setup</span>
              </div>
            </div>
          </div>

          <div className="mt-12">
            <PricingCards />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* TRUSTED BY + TESTIMONIALS */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/40 py-24">
        <div className="section-container">
          <div className="flex flex-col items-center gap-3 text-center">
            <span className="text-14 font-semibold text-black-300">
              Trusted by more than 10,000 outreach experts
            </span>
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1 rounded-full border border-black-700 bg-black-800 px-3 py-1 text-12 font-semibold text-yellow-400">
                <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                4.8 rating
              </span>
              <span className="inline-flex items-center gap-1 rounded-full border border-black-700 bg-black-800 px-3 py-1 text-12 font-semibold text-orange-400">
                <Star className="h-3.5 w-3.5 fill-orange-400 text-orange-400" />
                4.9 rating
              </span>
            </div>
          </div>

          <div className="mx-auto mt-12 grid w-full max-w-6xl grid-cols-1 gap-6 text-left md:grid-cols-3">
            {testimonials.map((t) => (
              <div
                key={t.name}
                className="glass-card flex flex-col justify-between p-6"
              >
                <div>
                  <span className="text-11 font-bold uppercase tracking-wider text-purple-400">
                    Testimonial
                  </span>
                  <p className="mt-3 text-14 leading-relaxed text-black-200">
                    {t.quote}
                  </p>
                </div>
                <div className="mt-6 flex items-center gap-3 border-t border-black-700/70 pt-4">
                  <Image
                    src={t.photo}
                    alt={t.name}
                    width={44}
                    height={44}
                    className="h-11 w-11 rounded-full object-cover"
                  />
                  <div>
                    <div className="text-14 font-bold text-white">{t.name}</div>
                    <div className="text-12 text-black-400">
                      {t.title} ·{" "}
                      <span className="text-purple-300">{t.company}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
              <thead>
                <tr className="border-b border-black-700 bg-black-900/80 align-top text-white">
                  <th className="w-2/5 p-5 sm:p-6">
                    <p className="text-14 font-medium text-black-400">
                      Preferred billing cycle
                    </p>
                    <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-black-600 bg-black-800 p-1">
                      <span className="rounded-full bg-gradient-brand px-4 py-1.5 text-13 font-semibold text-white">
                        Monthly
                      </span>
                      <span className="rounded-full px-4 py-1.5 text-13 font-medium text-black-300">
                        Yearly <span className="text-green-400">up to -25%</span>
                      </span>
                    </div>
                  </th>
                  <th className="w-[20%] p-5 sm:p-6">
                    <div className="text-18 font-semibold">Outreach seat</div>
                    <p className="mt-1 text-13 font-medium text-black-400">
                      $49 per seat / month
                    </p>
                    <Link
                      href="/signup"
                      className="mt-4 inline-flex h-9 items-center justify-center rounded-full border border-black-600 bg-black-700 px-4 text-13 font-semibold text-white transition-colors hover:bg-black-600"
                    >
                      Start free trial
                    </Link>
                  </th>
                  <th className="w-[20%] p-5 sm:p-6">
                    <div className="text-18 font-semibold">Outreach avatar</div>
                    <p className="mt-1 text-13 font-medium text-black-400">
                      $387 per profile / month
                    </p>
                    <Link
                      href="/avatars"
                      className="mt-4 inline-flex h-9 items-center justify-center rounded-full border border-black-600 bg-black-700 px-4 text-13 font-semibold text-white transition-colors hover:bg-black-600"
                    >
                      Get an avatar
                    </Link>
                  </th>
                  <th className="w-[20%] p-5 sm:p-6">
                    <div className="text-18 font-semibold">Agency</div>
                    <p className="mt-1 text-13 font-medium text-black-400">
                      from $499 for 20 seats / month
                    </p>
                    <Link
                      href="/demo"
                      className="mt-4 inline-flex h-9 items-center justify-center rounded-full border border-black-600 bg-black-700 px-4 text-13 font-semibold text-white transition-colors hover:bg-black-600"
                    >
                      Schedule a call
                    </Link>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-black-800">
                {comparisonGroups.map((group) => (
                  <tr key={group.title} className="contents">
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* FREQUENTLY ASKED QUESTIONS */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/40 py-24">
        <div className="section-container">
          <div className="mx-auto max-w-4xl">
            <div className="mb-12 text-center">
              <h2 className="text-36 sm:text-48 font-bold tracking-tight text-white">
                Frequently asked questions
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
