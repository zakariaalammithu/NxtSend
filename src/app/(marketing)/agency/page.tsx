import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  Star,
  Play,
  ShieldCheck,
  Headphones,
} from "lucide-react";

export const metadata: Metadata = {
  title: "NxtSend Agency – Built for agencies. Made to scale.",
  description:
    "Built for agencies working with clients' profiles. Get 20+ premium seats, kept in separate workspaces, managed in a single unibox.",
};

/* ── Hero testimonials (mirror: aimfox.com/agency) ───────────────────────── */
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

/* ── Support cards (mirror: "We've got your back") ───────────────────────── */
const supportCards = [
  {
    title: "Onboarding",
    text: "We’ll work with you to get your accounts set up and ensure your success.",
    image: "/images/agency/support-onboarding.webp",
    alt: "Onboarding",
  },
  {
    title: "Advanced workflows",
    text: "Access our library of advanced workflows to maximize results.",
    image: "/images/agency/support-workflows.webp",
    alt: "Advanced workflows",
  },
  {
    title: "Support at every step",
    text: "Your account manager helps resolve issues in real time.",
    image: "/images/agency/support-help.webp",
    alt: "Support at every step",
  },
];

/* ── Testimonial wall (mirror: "Loved by agencies, sales teams & GTM experts") */
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
                Built for agencies.{" "}
                <span className="text-gradient-brand">Made to scale.</span>
              </h1>

              <p className="mx-auto mt-6 max-w-xl text-17 sm:text-20 leading-relaxed text-black-300 lg:mx-0">
                The perfect whitelabel partner for your LinkedIn outrech.
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
                alt="Agency plan"
                width={4096}
                height={1497}
                className="h-full w-full object-cover"
                priority
              />
              <Image
                src="/images/agency/agency-plan.webp"
                alt="Agency plan"
                width={1200}
                height={1128}
                className="absolute bottom-0 right-0 w-1/2 object-cover"
              />
            </div>
          </div>

          <div className="mt-14 flex flex-col items-center gap-3">
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

          {/* Hero testimonials */}
          <div className="mt-10 grid w-full grid-cols-1 gap-6 text-left md:grid-cols-3">
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
      {/* 1. LINKEDIN OUTREACH THAT'S MEANT TO SCALE */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24 lg:py-32">
        <div className="section-container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              LinkedIn outreach that&apos;s meant to scale
            </h2>
            <p className="mt-5 text-16 sm:text-18 leading-relaxed text-black-300">
              Maximize your clients&apos; results. Get 20+ premium seats, kept
              in separate workspaces, managed in a single unibox. All at a fair
              price.
            </p>
          </div>

          <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-2">
            {/* Fully whitelabel */}
            <div className="relative overflow-hidden rounded-3xl border border-black-700 md:col-span-2">
              <Image
                src="/images/agency/whitelabel-bg.webp"
                alt="Fully whitelabel. Completely yours."
                width={2384}
                height={1328}
                className="h-64 w-full object-cover sm:h-80"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black-900/90 via-black-900/20 to-transparent" />
              <h3 className="absolute bottom-0 left-0 p-8 text-28 sm:text-36 font-bold text-white tracking-tight">
                Fully whitelabel. Completely yours.
              </h3>
            </div>

            {/* Workspaces */}
            <div className="relative overflow-hidden rounded-3xl border border-black-700">
              <Image
                src="/images/agency/workspaces-bg.webp"
                alt="Workspaces"
                width={1480}
                height={1328}
                className="h-72 w-full object-cover sm:h-96"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black-900/90 via-black-900/20 to-transparent" />
              <div className="absolute bottom-0 left-0 p-8">
                <h3 className="text-24 font-bold text-white">Workspaces</h3>
                <p className="mt-2 max-w-md text-14 leading-relaxed text-black-200">
                  Keep your clients separate, while keeping the overview &amp;
                  control over their accounts.
                </p>
              </div>
            </div>

            {/* Account manager */}
            <div className="relative overflow-hidden rounded-3xl border border-black-700">
              <Image
                src="/images/agency/account-manager-bg.webp"
                alt="Account manager"
                width={1568}
                height={1440}
                className="h-72 w-full object-cover sm:h-96"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black-900/90 via-black-900/20 to-transparent" />
              <div className="absolute bottom-0 left-0 p-8">
                <h3 className="text-24 font-bold text-white">Account manager</h3>
                <p className="mt-2 max-w-md text-14 leading-relaxed text-black-200">
                  Get a dedicated success manager + access to our Slack channel
                  + migration help. All in one package.
                </p>
              </div>
            </div>

            {/* Safety */}
            <div className="relative overflow-hidden rounded-3xl border border-black-700 md:col-span-2">
              <Image
                src="/images/agency/safety-bg.webp"
                alt="Safety"
                width={1152}
                height={1560}
                className="absolute inset-0 h-full w-full object-cover opacity-40"
              />
              <div className="relative z-10 flex flex-col items-start p-8 sm:p-12">
                <Image
                  src="/images/agency/safety-icon.webp"
                  alt="Safety"
                  width={2442}
                  height={1224}
                  className="h-14 w-auto"
                />
                <h3 className="mt-6 text-28 sm:text-32 font-bold text-white tracking-tight">
                  Safety
                </h3>
                <p className="mt-3 max-w-xl text-15 leading-relaxed text-black-300">
                  Multi-layer protection to keep your accounts safe &amp; secure
                  at all times.
                </p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {[
                    "Residential IP addresses",
                    "Automated warmup",
                    "Auto stick to Interaction limits",
                    "Cloud-based & untraceable",
                  ].map((chip) => (
                    <span
                      key={chip}
                      className="inline-flex items-center gap-1.5 rounded-full border border-black-600 bg-black-800/80 px-3.5 py-1.5 text-13 font-medium text-white"
                    >
                      <Check className="h-3.5 w-3.5 text-purple-400" />
                      {chip}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Privacy */}
          <div className="mx-auto mt-20 grid max-w-6xl grid-cols-1 items-center gap-10 lg:grid-cols-2">
            <div>
              <h3 className="text-28 sm:text-36 font-bold text-white tracking-tight">
                Privacy
              </h3>
              <p className="mt-4 max-w-xl text-16 leading-relaxed text-black-300">
                Connecting a client account does not grant you access to their
                profile, keeping your clients reassured that their accounts
                stay private.
              </p>
              <Image
                src="/images/agency/privacy-icon.webp"
                alt="Privacy illustration"
                width={1200}
                height={1192}
                className="mt-8 w-full max-w-sm rounded-3xl"
              />
            </div>
            <div className="rounded-2xl border border-black-700/80 bg-black-800/40 p-2 sm:p-3 shadow-2xl">
              <div className="overflow-hidden rounded-xl border border-black-700/60">
                <Image
                  src="/images/agency/privacy-table.webp"
                  alt="Privacy feature comparison table"
                  width={1200}
                  height={611}
                  className="hidden h-auto w-full sm:block"
                />
                <Image
                  src="/images/agency/privacy-table-mobile.webp"
                  alt="Privacy feature comparison table"
                  width={1092}
                  height={1131}
                  className="h-auto w-full sm:hidden"
                />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 2. WE'VE GOT YOUR BACK */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/30 py-24 lg:py-32">
        <div className="section-container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              We&apos;ve got your back
            </h2>
            <p className="mt-5 text-16 sm:text-18 leading-relaxed text-black-300">
              Whether you need help with the setup, the tactics, or advanced
              workflows, our team is there for you.
            </p>
          </div>

          <div className="mx-auto mt-14 grid max-w-6xl grid-cols-1 gap-6 md:grid-cols-3">
            {supportCards.map((card) => (
              <div
                key={card.title}
                className="glass-card-hover overflow-hidden p-0"
              >
                <Image
                  src={card.image}
                  alt={card.alt}
                  width={1200}
                  height={667}
                  className="h-48 w-full object-cover"
                />
                <div className="p-8">
                  <h3 className="text-20 font-bold text-white">{card.title}</h3>
                  <p className="mt-3 text-14 leading-relaxed text-black-400">
                    {card.text}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 3. LOOKING TO GROW? */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24 lg:py-32">
        <div className="section-container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Looking to grow?
            </h2>
            <p className="mt-5 text-16 sm:text-18 leading-relaxed text-black-300">
              Aimfox grows with you. Add seats to your agency plan or activate
              Avatars - customizable LinkedIn accounts to scale further and
              faster.
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
                  You can add seats to you plan at any time at just $20 per seat
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
                  Pre-warmed LinkedIn profiles you rent to scale beyond
                  LinkedIn limits
                </p>
                <span className="mt-6 inline-flex items-center rounded-full bg-black-700/80 border border-black-600 px-3.5 py-1.5 text-13 font-semibold text-purple-300">
                  Account with a seat
                </span>
              </div>
            </Link>
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
      {/* 5. PRICING THAT SCALES WITH YOUR GROWTH */}
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

          <div className="mx-auto mt-14 grid max-w-5xl grid-cols-1 gap-6 rounded-3xl border border-black-700 bg-black-800/50 p-8 sm:p-12 lg:grid-cols-2">
            <div>
              <h3 className="text-22 font-bold text-white">Agency</h3>
              <p className="mt-2 text-14 leading-relaxed text-black-400">
                Built for agencies working with clients&apos; profiles.
              </p>
              <div className="mt-6 text-13 text-black-400">From:</div>
              <div className="flex items-baseline gap-1">
                <span className="text-20 font-bold text-white">$</span>
                <span className="text-48 font-extrabold text-white">499</span>
                <span className="text-14 text-black-400">/20 seats</span>
              </div>
              <div className="text-13 text-black-400">+$20 per new seat</div>

              <Link
                href="/demo"
                className="mt-8 flex h-12 w-full items-center justify-center rounded-xl bg-gradient-brand text-14 font-semibold text-white shadow-glow-purple transition-all duration-200 hover:scale-[1.02] sm:w-auto sm:px-8"
              >
                Schedule a call
              </Link>
            </div>

            <div className="border-t border-black-700/80 pt-8 lg:border-l lg:border-t-0 lg:pl-12 lg:pt-0">
              <div className="text-15 font-semibold text-white">
                Everything an agency needs
              </div>
              <ul className="mt-5 space-y-3.5">
                {[
                  "Slack onboarding",
                  "Full whitelabel",
                  "Team collaboration",
                  "Profile migration assistance",
                ].map((feat) => (
                  <li
                    key={feat}
                    className="flex items-start gap-2.5 text-14 text-black-300"
                  >
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-purple-400" />
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
              <Link
                href="/pricing"
                className="mt-8 inline-flex items-center gap-2 text-15 font-semibold text-purple-400 transition-colors hover:text-purple-300"
              >
                <span>View all features</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* 6. LOVED BY AGENCIES, SALES TEAMS & GTM EXPERTS */}
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
      {/* 7. START SCALING YOUR OUTREACH TODAY */}
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
