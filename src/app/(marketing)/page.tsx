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
  Zap,
  Briefcase,
  Gem,
} from "lucide-react";
import { HomeFaq } from "@/components/marketing/HomeFaq";
import { TrustedLogoStrip } from "@/components/marketing/TrustedLogos";

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

/* ── Made to convert (mirror section 2) — artwork cards from the mirror ──── */
const convertCards = [
  {
    title: "Messages that sound human, not robotic",
    chips: ["AI customization", "Variables", "Attachments"],
    art: "/images/bento/1.webp",
    alt: "Messages that sound human, not robotic — InMail pitch artwork",
    layout: "wide",
    overlay: "bottom-left",
  },
  {
    title: "Break through the inbox noise",
    chips: ["Voice messages"],
    art: "/images/bento/2.webp",
    alt: "Break through the inbox noise — voice message artwork",
    layout: "narrow",
    overlay: "top-center",
  },
  {
    title: "Speak their language. Match their schedule",
    chips: ["Auto-translate", "Smart timezones"],
    art: "/images/bento/3.webp",
    alt: "Speak their language — auto-translate artwork",
    layout: "medium",
    overlay: "top-center-dark",
  },
  {
    title: "The right campaign for every goal",
    chips: ["Connections", "Messages", "Reactions"],
    art: "/images/bento/4.webp",
    alt: "The right campaign for every goal — campaign types artwork",
    layout: "medium",
    overlay: "top-center",
  },
  {
    title: "Optimize until it’s perfect",
    chips: ["A/B testing"],
    art: "/images/bento/5.webp",
    alt: "Optimize until it’s perfect — A/B testing artwork",
    layout: "narrow",
    overlay: "top-center",
  },
] as const;

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
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* TRUSTED BY — ratings + company logo strip (mirror) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative pb-4">
        <div className="section-container flex flex-col items-center">
          <span className="text-14 font-bold text-white/60">
            Trusted by more than 10,000 outreach experts
          </span>
          <div className="mt-3 flex items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-full border border-black-700 bg-black-800 px-3 py-1 text-12 font-semibold text-yellow-400">
              <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
              4.8 rating
            </span>
            <span className="inline-flex items-center gap-1 rounded-full border border-black-700 bg-black-800 px-3 py-1 text-12 font-semibold text-orange-400">
              <Star className="h-3.5 w-3.5 fill-orange-400 text-orange-400" />
              4.9 rating
            </span>
          </div>

          <div className="mt-10 w-full">
            <TrustedLogoStrip />
          </div>

          {/* Hero testimonials */}
          <div className="mt-14 grid w-full max-w-5xl grid-cols-1 gap-6 text-left md:grid-cols-3">
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
      <section className="relative py-24 lg:py-32">
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

          {/* Account pills — white cards, mirror layout (3 / 3 / 2 centred) */}
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
                    {agent.name}{" "}
                    <span className="font-medium text-black-400">• Lavazza</span>
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

          {/* Avatar map panel — mirror visual (features-grid) + chips + booked-calls card */}
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

              <div className="w-56 shrink-0 rounded-2xl bg-black-900 px-4 py-3.5 shadow-[0_16px_32px_rgba(0,0,0,0.35)] ring-1 ring-white/10">
                <div className="flex items-center justify-between text-white/60">
                  <span className="text-12 font-semibold">Booked calls</span>
                  <span className="text-11">Last month</span>
                </div>
                <div className="mt-1.5 flex items-end justify-between gap-2">
                  <span className="text-36 font-bold leading-none text-white">+381</span>
                  <Image
                    src="/images/tiny-graph.png"
                    alt=""
                    width={101}
                    height={58}
                    className="h-9 w-auto"
                  />
                </div>
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
              alt="Rented LinkedIn accounts across the map"
              width={1200}
              height={350}
              className="mt-2 h-auto w-full rounded-3xl"
            />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 2. MADE TO CONVERT NOT JUST CONNECT — artwork bento (mirror) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/30 py-24 lg:py-32">
        <div className="pointer-events-none absolute top-1/2 left-0 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-purple-600/10 blur-[130px]" />
        <div className="section-container relative z-10">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Made to convert not just connect
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
                    className="object-cover transition-transform duration-500 group-hover:scale-[1.02]"
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
      {/* 3. YOUR LINKEDIN CONTROL TOWER */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24 lg:py-32">
        <div className="section-container">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Your LinkedIn Control Tower
            </h2>
          </div>

          <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-12">
            {/* Left: tabs, heading, quote */}
            <div className="lg:col-span-5">
              <div className="inline-flex items-center gap-1 rounded-full border border-black-600 bg-black-800 p-1">
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white px-3.5 py-1.5 text-12 font-bold uppercase tracking-wide text-black-900">
                  Unibox
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
                All your conversations in one place
              </h3>
              <p className="mt-4 max-w-md text-16 leading-relaxed text-black-400">
                Chat with every lead from every profile straight from the Unibox.
              </p>

              <div className="mt-9">
                <div className="text-15">
                  <span className="font-bold text-white">Colton</span>{" "}
                  <span className="font-semibold text-purple-400">
                    Founder of Jumper Media
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-4 rounded-3xl bg-black-800 p-4 ring-1 ring-black-600/60">
                  <Image
                    src="/images/colton.webp"
                    alt="Colton, Founder of Jumper Media"
                    width={160}
                    height={160}
                    className="h-20 w-20 shrink-0 rounded-2xl object-cover"
                  />
                  <p className="text-14 leading-relaxed text-black-100">
                    We got one inbox manager handling inbox replies for 8 of our
                    sales reps. Aimfox&apos;s Unibox literally has every
                    functionality we need to stay organized!
                  </p>
                </div>
              </div>
            </div>

            {/* Right: big Unibox UI panel */}
            <div className="lg:col-span-7">
              <div className="rounded-[2rem] border border-black-700/80 bg-black-800/40 p-2 shadow-2xl sm:p-3">
                <div className="overflow-hidden rounded-[1.6rem] border border-black-700/60">
                  <Image
                    src="/images/unibox.webp"
                    alt="Unibox — all your conversations in one place"
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
              Integrates with your favorite tools
            </h2>
          </div>

          <div className="mx-auto mt-12 max-w-5xl">
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
      {/* 5. LOVED BY AGENCIES, SALES TEAMS & GTM EXPERTS */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section id="testimonials" className="relative border-t border-black-700/80 bg-black-900 py-24 lg:py-32">
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
      {/* 6. PRICING THAT SCALES WITH YOUR GROWTH — artwork cards (mirror) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/40 py-24 lg:py-32">
        <div className="section-container">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Pricing that scales with your growth
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
                  Connect your LinkedIn profiles and start your outreach
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
                  Start your free trial
                </Link>

                <div className="mt-9">
                  <div className="text-15 font-bold text-white">
                    For individuals and teams
                  </div>
                  <ul className="mt-4 space-y-3">
                    <li className="flex items-start gap-2.5 text-14 text-white/85">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                      <span>
                        Seamlessly connect{" "}
                        <Linkedin className="inline h-3.5 w-3.5 text-white" />{" "}
                        accounts
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 text-14 text-white/85">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                      <span>
                        Launch inbound &amp; outbound campaigns
                        <span className="mt-1 block text-12 leading-relaxed text-white/50">
                          Inbound campaigns are directed towards existing
                          connections, while outbound campaigns target new leads
                        </span>
                      </span>
                    </li>
                    <li className="flex items-start gap-2.5 text-14 text-white/85">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                      <span>Unified inbox access</span>
                    </li>
                    <li className="flex items-start gap-2.5 text-14 text-white/85">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                      <span>3rd party integrations</span>
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
                  Built for agencies working with clients&apos; profiles.
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
                  Schedule a call
                </Link>

                <div className="mt-9">
                  <div className="text-15 font-bold text-white">
                    Everything an agency needs
                  </div>
                  <ul className="mt-4 space-y-3">
                    {[
                      "Slack onboarding",
                      "Full whitelabel",
                      "Team collaboration",
                      "Profile migration assistance",
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
                    Scale beyond your limits by renting and customizing LinkedIn
                    profiles
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
                    Grab your avatars
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
                  <div className="mt-6 text-15 font-bold text-white">Made to scale</div>
                  <ul className="mt-4 space-y-3">
                    <li className="flex items-start gap-2.5 text-14 text-white/85">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-white" />
                      <span className="rounded-full border border-white/25 bg-white/10 px-2.5 py-0.5 text-13 font-medium text-white">
                        3x Outreach seat included
                      </span>
                    </li>
                    {[
                      "Customization of profiles",
                      "Fast delivery to workspace",
                      "Replacement guarantee",
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
              <span>View all features</span>
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
