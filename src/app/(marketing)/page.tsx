import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  Star,
  Play,
  Linkedin,
  ShieldCheck,
  Headphones,
  TrendingUp,
} from "lucide-react";
import { HomeFaq } from "@/components/marketing/HomeFaq";

export const metadata: Metadata = {
  title: "NxtSend — Supercharge your LinkedIn pipeline. At scale.",
  description:
    "Reach thousands of leads per day with NxtSend — AI-powered personalization, multi-account automation, and a unified inbox.",
};

/* ── Hero testimonials (mirror: aimfox.com homepage) ─────────────────────── */
const heroTestimonials = [
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

/* ── Rented accounts (mirror section 1) ──────────────────────────────────── */
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

/* ── Made to convert (mirror section 2) ──────────────────────────────────── */
const convertCards = [
  {
    title: "Messages that sound human, not robotic",
    chips: ["AI customization", "Variables", "Attachments"],
  },
  {
    title: "Break through the inbox noise",
    chips: ["Voice messages"],
  },
  {
    title: "Speak their language. Match their schedule",
    chips: ["Auto-translate", "Smart timezones"],
  },
  {
    title: "The right campaign for every goal",
    chips: ["Connections", "Messages", "Reactions"],
  },
  {
    title: "Optimize until it’s perfect",
    chips: ["A/B testing"],
  },
];

/* ── Testimonial wall (mirror section 5) ─────────────────────────────────── */
const wallTestimonials = [
  {
    title: "Watch out Expandi! You have competition",
    quote:
      "I tried both Expandi and Aimfox—Expandi was unresponsive, while Aimfox impressed me with fast, helpful support.",
    name: "Adrian D.",
    role: "Head of Growth",
  },
  {
    title: "Event campaigns are a game changer!",
    quote:
      "Can't express how annoying it is to do Linkedin outreach manually. I'd give it up if not for Aimfox. I find Linkedin event campaigns most useful. Just paste the event link and get the leads on autopilot!",
    name: "Oleg D.",
    role: "CMO at Maildoso",
  },
  {
    title: "Awesome toolkit for LinkedIn outreach",
    quote:
      "I love how Aimfox combines a great UI with smart features that keep LinkedIn use safe, like geo-based IP and proxy selection.",
    name: "Luca P.",
    role: "Founder",
  },
  {
    title: "The LinkedIn tool that makes life easier",
    quote:
      "I’ve tried many LinkedIn tools, but Aimfox stands out—it’s easy to set up, has great support, and just works. It’s been a game-changer for my lead generation.",
    name: "Alex S.",
    role: "Consulting",
  },
  {
    title: "Unmatched customer support!",
    quote: "The BEST cold outreach tool by far!!! Switched from Lemlist...",
    name: "Tyrone D.",
    role: "Coach",
  },
  {
    title: "Scaling made easy and stellar support",
    quote:
      "I love using Aimfox with my SDR team—it helps us scale outreach, stay engaged beyond email, and with Ksenija’s ongoing support and expertise, it’s been an invaluable tool I highly recommend.",
    name: "Charlotte Jackson",
    role: "SDR Team Lead",
  },
  {
    title: "The app is built on user feedback",
    quote:
      "I was a bit frustrated at first, but the team came through fast with a fix and totally turned things around—I’m genuinely impressed!",
    name: "Nick Lazarev",
    role: "Lead-Gen specialist",
  },
  {
    title: "Only tool that let's you natively rent profiles",
    quote:
      "As an early adopter of Aimfox, I'm genuinely impressed with the platform's potential. It offers some truly unique features that set it apart from other LinkedIn automation tools I've tried.",
    name: "Vinod Krisshna",
    role: "Outbound Agency",
  },
  {
    title: "Best customer support experience I ever had",
    quote:
      "It’s rare to find customer service this good—she was friendly, patient, and really knew her stuff. If you’re on the fence about AimFox, their customer service alone makes it worth it!",
    name: "Jessica Presco",
    role: "Customer support",
  },
  {
    title: "Effective Tool for Generating Leads",
    quote:
      "I have tested other solutions, and Aimfox has been the most effective in helping me schedule more meetings with new leads. Switched from Doux-soup",
    name: "Leandro G.",
    role: "Lead Gen",
  },
  {
    title: "Best value-for-money in class!",
    quote:
      "Aimfox is a genuine GAME CHANGER! And the price is a steal.. Switched from Dripify...",
    name: "Roy R.",
    role: "CEO and Founder",
  },
];

const videoTestimonials = [
  { name: "Bryan Seton", role: "Partner" },
  { name: "Jay Feldman", role: "Founder" },
  { name: "Dave Menjura", role: "CRO" },
  { name: "Balsa Kosic", role: "COO" },
  { name: "Roy Ripper", role: "CEO" },
];

/* ── FAQ (mirror section 7) ──────────────────────────────────────────────── */
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

export default function MarketingHomePage() {
  return (
    <div className="relative overflow-hidden bg-black-900">
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HERO */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative flex flex-col justify-center bg-gradient-hero pt-12 pb-20 lg:pt-20 lg:pb-28">
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
            <span>Lead-gen agencies, sales teams &amp; GTM experts</span>
          </div>

          <h1 className="mt-8 max-w-4xl text-44 sm:text-54 lg:text-72 font-extrabold tracking-tight text-white leading-[1.08]">
            <span className="text-gradient-brand">Supercharge</span> your LinkedIn
            pipeline. At scale.
          </h1>

          <p className="mt-6 max-w-2xl text-17 sm:text-20 leading-relaxed text-black-300">
            Reach thousands of leads per day with an end-to-end tool that gives
            you access to unlimited LinkedIn profiles for scale
          </p>

          <div className="mt-10 flex flex-col sm:flex-row items-center justify-center gap-4 w-full sm:w-auto">
            <Link
              href="/signup"
              className="group relative flex h-13 w-full sm:w-auto items-center justify-center gap-2 rounded-full bg-gradient-brand px-8 text-16 font-semibold text-white shadow-glow-purple transition-all duration-300 hover:shadow-glow-orange hover:scale-105 active:scale-95"
            >
              <span>Start your outreach</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2 sm:gap-4 text-13 text-black-400">
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

          <div className="mt-12 flex flex-col items-center gap-3">
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

          <div className="mt-14 w-full max-w-5xl rounded-2xl border border-black-700/80 bg-black-800/40 p-2 sm:p-3 shadow-2xl backdrop-blur-xl">
            <div className="overflow-hidden rounded-xl border border-black-700/60 shadow-inner">
              <Image
                src="/images/hero.webp"
                alt="NxtSend LinkedIn outreach platform"
                width={2000}
                height={1031}
                className="h-auto w-full"
                priority
              />
            </div>
          </div>

          {/* Hero testimonials */}
          <div className="mt-10 grid w-full max-w-5xl grid-cols-1 gap-6 text-left md:grid-cols-3">
            {heroTestimonials.map((t) => (
              <div key={t.name} className="glass-card flex flex-col justify-between p-6">
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
                      {t.title} · <span className="text-purple-300">{t.company}</span>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 1. UNLIMITED OUTREACH WITH RENTED ACCOUNTS */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24 lg:py-32">
        <div className="section-container">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Unlimited outreach with rented accounts
            </h2>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-black-700/60 px-4 py-1.5 text-13 font-medium text-black-300">
              Your Accounts
            </span>
            <span className="rounded-full bg-black-700/60 px-4 py-1.5 text-13 font-medium text-black-300">
              BYO Accounts
            </span>
            <span className="rounded-full bg-gradient-brand px-4 py-1.5 text-13 font-semibold text-white">
              Rented Accounts
            </span>
          </div>

          <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:col-span-2">
              {rentedAgents.map((agent) => (
                <div
                  key={agent.name}
                  className="glass-card flex items-center gap-4 p-4"
                >
                  <Image
                    src={agent.photo}
                    alt={agent.name}
                    width={72}
                    height={72}
                    className="h-14 w-14 rounded-2xl object-cover"
                  />
                  <div>
                    <div className="text-15 font-bold text-white">
                      {agent.name} <span className="font-medium text-black-400">• Lavazza</span>
                    </div>
                    <div className="text-13 text-black-400">{agent.role}</div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-4">
              <div className="glass-card p-6">
                <div className="text-20 font-bold text-white">California</div>
                <div className="mt-1 text-14 text-black-400">Bay Area</div>
                <div className="mt-3 inline-flex rounded-full bg-purple-600/20 border border-purple-500/30 px-3 py-1 text-12 font-semibold text-purple-300">
                  HoReCa
                </div>
              </div>
              <div className="glass-card p-6">
                <div className="flex items-center justify-between">
                  <span className="text-14 font-semibold text-black-300">Booked calls</span>
                  <span className="text-12 text-black-500">Last month</span>
                </div>
                <div className="mt-2 flex items-center gap-2 text-32 font-extrabold text-white">
                  +381
                  <TrendingUp className="h-6 w-6 text-green-400" />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <span className="rounded-full bg-black-700/60 px-3 py-1 text-12 font-medium text-black-300">
                    Procurement
                  </span>
                  <span className="rounded-full bg-black-700/60 px-3 py-1 text-12 font-medium text-black-300">
                    Business Development
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 2. MADE TO CONVERT NOT JUST CONNECT */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/30 py-24 lg:py-32">
        <div className="pointer-events-none absolute top-1/2 left-0 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-purple-600/10 blur-[130px]" />
        <div className="section-container relative z-10">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Made to convert not just connect
            </h2>
          </div>

          <div className="mx-auto mt-16 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {convertCards.map((card) => (
              <div key={card.title} className="glass-card-hover flex flex-col justify-between p-8">
                <h3 className="text-20 font-bold leading-snug text-white">
                  {card.title}
                </h3>
                <div className="mt-6 flex flex-wrap gap-2">
                  {card.chips.map((chip) => (
                    <span
                      key={chip}
                      className="rounded-full bg-purple-600/15 border border-purple-500/30 px-3 py-1 text-12 font-semibold text-purple-300"
                    >
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            ))}
            <div className="glass-card overflow-hidden p-2">
              <Image
                src="/images/features-grid.png"
                alt="Made to convert — feature grid"
                width={1200}
                height={350}
                className="h-full w-full rounded-xl object-cover"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 3. YOUR LINKEDIN CONTROL TOWER */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24 lg:py-32">
        <div className="section-container">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Your LinkedIn Control Tower
            </h2>
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-2">
            <span className="rounded-full bg-gradient-brand px-4 py-1.5 text-13 font-semibold text-white">
              unibox
            </span>
            <span className="rounded-full bg-black-700/60 px-4 py-1.5 text-13 font-medium text-black-300">
              leads
            </span>
            <span className="rounded-full bg-black-700/60 px-4 py-1.5 text-13 font-medium text-black-300">
              analytics
            </span>
          </div>

          <div className="mx-auto mt-12 grid max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div className="rounded-2xl border border-black-700/80 bg-black-800/40 p-2 sm:p-3 shadow-2xl">
              <div className="overflow-hidden rounded-xl border border-black-700/60">
                <Image
                  src="/images/unibox.webp"
                  alt="Unibox — all your conversations in one place"
                  width={1600}
                  height={1175}
                  className="h-auto w-full"
                />
              </div>
            </div>

            <div>
              <h3 className="text-28 sm:text-32 font-bold text-white tracking-tight">
                All your conversations in one place
              </h3>
              <p className="mt-4 text-16 leading-relaxed text-black-400">
                Chat with every lead from every profile straight from the Unibox.
              </p>

              <div className="glass-card mt-8 p-6">
                <p className="text-15 leading-relaxed text-black-200">
                  We got one inbox manager handling inbox replies for 8 of our
                  sales reps. Aimfox&apos;s Unibox literally has every
                  functionality we need to stay organized!
                </p>
                <div className="mt-5 border-t border-black-700/70 pt-4">
                  <div className="text-14 font-bold text-white">Colton</div>
                  <div className="text-12 text-black-400">
                    Founder of Jumper Media
                  </div>
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
              Integrates with your favorite tools
            </h2>
            <div className="mt-8">
              <Link
                href="/integrations"
                className="group inline-flex items-center gap-2 rounded-full border border-black-600 bg-black-800 px-7 py-3 text-15 font-semibold text-white transition-all hover:border-purple-500/50 hover:text-purple-300"
              >
                <span>View Integrations</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>

          <div className="mx-auto mt-14 max-w-5xl rounded-2xl border border-black-700/80 bg-black-800/40 p-2 sm:p-3 shadow-2xl">
            <div className="overflow-hidden rounded-xl border border-black-700/60">
              <Image
                src="/images/home-integrations/integrations-desktop.webp"
                alt="Integrates with your favorite tools"
                width={2000}
                height={838}
                className="hidden h-auto w-full sm:block"
              />
              <Image
                src="/images/home-integrations/integrations.webp"
                alt="Integrates with your favorite tools"
                width={1200}
                height={1089}
                className="h-auto w-full sm:hidden"
              />
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 5. LOVED BY AGENCIES, SALES TEAMS & GTM EXPERTS */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-900 py-24 lg:py-32">
        <div className="pointer-events-none absolute right-10 top-1/2 h-[350px] w-[350px] -translate-y-1/2 rounded-full bg-purple-600/15 blur-[140px]" />
        <div className="section-container relative z-10">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Loved by agencies, sales teams &amp; GTM experts
            </h2>
          </div>

          <div className="mt-16 grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
            {wallTestimonials.map((t) => (
              <div key={t.title} className="glass-card-hover flex flex-col justify-between p-8">
                <div>
                  <div className="flex items-center gap-1 text-orange-500">
                    {[...Array(5)].map((_, i) => (
                      <Star key={i} className="h-4 w-4 fill-orange-500 text-orange-500" />
                    ))}
                  </div>
                  <h3 className="mt-5 text-18 font-bold leading-snug text-white">
                    {t.title}
                  </h3>
                  <p className="mt-3 text-14 leading-relaxed text-black-300">
                    {t.quote}
                  </p>
                </div>
                <div className="mt-8 border-t border-black-700/80 pt-5">
                  <div className="text-15 font-bold text-white">{t.name}</div>
                  <div className="text-12 text-black-400">{t.role}</div>
                </div>
              </div>
            ))}

            {videoTestimonials.map((v) => (
              <div
                key={v.name}
                className="glass-card flex flex-col items-start justify-between p-8"
              >
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-gradient-brand text-white shadow-glow-purple">
                  <Play className="h-5 w-5 fill-white text-white" />
                </span>
                <div className="mt-10">
                  <div className="text-16 font-bold text-white">{v.name}</div>
                  <div className="text-13 text-black-400">{v.role}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 6. PRICING THAT SCALES WITH YOUR GROWTH */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/40 py-24 lg:py-32">
        <div className="section-container">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Pricing that scales with your growth
            </h2>
            <div className="mt-8 inline-flex items-center gap-1 rounded-full border border-black-600 bg-black-800 p-1">
              <span className="rounded-full bg-gradient-brand px-4 py-1.5 text-13 font-semibold text-white">
                Monthly
              </span>
              <span className="rounded-full px-4 py-1.5 text-13 font-medium text-black-300">
                Yearly <span className="text-green-400">up to -25%</span>
              </span>
            </div>
          </div>

          <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-6 sm:gap-8 md:grid-cols-3">
            {/* Outreach seat */}
            <div className="relative flex flex-col justify-between rounded-3xl border-2 border-purple-600 bg-black-800/90 p-8 shadow-glow-purple">
              <div>
                <h3 className="text-22 font-bold text-white">Outreach seat</h3>
                <p className="mt-2 text-13 leading-relaxed text-black-400">
                  Connect your LinkedIn profiles and start your outreach
                </p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-20 font-bold text-white">$</span>
                  <span className="text-44 font-extrabold text-white">49</span>
                  <span className="text-14 text-black-400">/ mo</span>
                </div>
                <div className="text-13 text-black-400">per seat</div>

                <Link
                  href="/signup"
                  className="mt-6 flex h-12 w-full items-center justify-center rounded-xl bg-gradient-brand text-14 font-semibold text-white shadow-glow-purple transition-all duration-200 hover:scale-[1.02]"
                >
                  Start your free trial
                </Link>

                <div className="mt-8 border-t border-black-700/80 pt-6">
                  <div className="text-13 font-semibold text-white">
                    For individuals and teams
                  </div>
                  <ul className="mt-4 space-y-3">
                    <li className="flex items-start gap-2.5 text-13 text-black-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                      <span>
                        Seamlessly connect{" "}
                        <Linkedin className="inline h-3.5 w-3.5 text-purple-300" />{" "}
                        accounts
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 text-13 text-black-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                      <span>
                        Launch inbound &amp; outbound campaigns
                        <span className="mt-1 block text-12 text-black-500">
                          Inbound campaigns are directed towards existing
                          connections, while outbound campaigns target new leads
                        </span>
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 text-13 text-black-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                      <span>Unified inbox access</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-13 text-black-300">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                      <span>3rd party integrations</span>
                    </li>
                  </ul>
                </div>
              </div>
            </div>

            {/* Agency */}
            <div className="flex flex-col justify-between rounded-3xl border border-black-700 bg-black-800/50 p-8 transition-all duration-300 hover:border-black-600">
              <div>
                <h3 className="text-22 font-bold text-white">Agency</h3>
                <p className="mt-2 text-13 leading-relaxed text-black-400">
                  Built for agencies working with clients&apos; profiles.
                </p>
                <div className="mt-6 text-13 text-black-400">From:</div>
                <div className="flex items-baseline gap-1">
                  <span className="text-20 font-bold text-white">$</span>
                  <span className="text-44 font-extrabold text-white">499</span>
                  <span className="text-14 text-black-400">/ 20 seats</span>
                </div>
                <div className="text-13 text-black-400">+$20 per new seat</div>

                <Link
                  href="/demo"
                  className="mt-6 flex h-12 w-full items-center justify-center rounded-xl border border-black-600 bg-black-700 text-14 font-semibold text-white transition-all duration-200 hover:bg-black-600"
                >
                  Schedule a call
                </Link>

                <div className="mt-8 border-t border-black-700/80 pt-6">
                  <div className="text-13 font-semibold text-white">
                    Everything an agency needs
                  </div>
                  <ul className="mt-4 space-y-3">
                    {[
                      "Slack onboarding",
                      "Full whitelabel",
                      "Team collaboration",
                      "Profile migration assistance",
                    ].map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-13 text-black-300">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                        <span>{feat}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Outreach avatar */}
            <div className="flex flex-col justify-between rounded-3xl border border-black-700 bg-black-800/50 p-8 transition-all duration-300 hover:border-black-600">
              <div>
                <h3 className="text-22 font-bold text-white">Outreach avatar</h3>
                <p className="mt-2 text-13 leading-relaxed text-black-400">
                  Scale beyond your limits by renting and customizing LinkedIn
                  profiles
                </p>
                <div className="mt-6 flex items-baseline gap-1">
                  <span className="text-20 font-bold text-white">$</span>
                  <span className="text-44 font-extrabold text-white">387</span>
                  <span className="text-14 text-black-400">/ month</span>
                </div>
                <div className="text-13 text-black-400">3 profiles included</div>

                <Link
                  href="/avatars"
                  className="mt-6 flex h-12 w-full items-center justify-center rounded-xl border border-black-600 bg-black-700 text-14 font-semibold text-white transition-all duration-200 hover:bg-black-600"
                >
                  Grab your avatars
                </Link>

                <div className="mt-8 border-t border-black-700/80 pt-6">
                  <div className="text-13 font-semibold text-white">Made to scale</div>
                  <ul className="mt-4 space-y-3">
                    {[
                      "3x Outreach seat included",
                      "Customization of profiles",
                      "Fast delivery to workspace",
                      "Replacement guarantee",
                    ].map((feat) => (
                      <li key={feat} className="flex items-start gap-2.5 text-13 text-black-300">
                        <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
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
              className="inline-flex items-center gap-2 text-15 font-semibold text-purple-400 transition-colors hover:text-purple-300"
            >
              <span>View all features</span>
              <ArrowRight className="h-4 w-4" />
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
                Frequently asked questions
              </h2>
            </div>
            <HomeFaq items={faqs} />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 8. START SCALING YOUR OUTREACH TODAY */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-black-700/80 bg-gradient-hero py-24 lg:py-32">
        <div className="pointer-events-none absolute inset-0 bg-radial-glow opacity-30" />
        <div className="section-container relative z-10 text-center">
          <div className="mx-auto max-w-3xl rounded-3xl border border-purple-500/30 bg-black-800/80 p-8 shadow-glow-purple/20 backdrop-blur-2xl sm:p-14">
            <h2 className="text-36 sm:text-48 font-extrabold text-white tracking-tight">
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
                <ShieldCheck className="h-3.5 w-3.5 text-green-400" /> Safe &amp;
                secure
              </span>
              <span className="flex items-center gap-1.5">
                <Headphones className="h-3.5 w-3.5 text-green-400" /> 24/7 Support
              </span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
