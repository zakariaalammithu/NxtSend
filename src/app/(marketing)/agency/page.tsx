import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  Star,
  ShieldCheck,
  Headphones,
} from "lucide-react";
import { TrustedLogoStrip } from "@/components/marketing/TrustedLogos";
import { AgencyPricing } from "@/components/marketing/AgencyPricing";
import { VideoTestimonialCard } from "@/components/marketing/VideoTestimonialCard";

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

/* Photos, video thumbnails and Vimeo IDs are each person's own assets,
   shared with the Avatars/Demo wall (see VideoTestimonialCard.tsx). */
const videoTestimonials = [
  {
    name: "Bryan Seton",
    role: "Partner",
    photo: "/images/avatars/reviews/bryan-seton.jpg",
    thumbnail: "/images/avatars/reviews/bryan-seton-thumb.webp",
    videoId: "1118790353",
  },
  {
    name: "Jay Feldman",
    role: "Founder",
    photo: "/images/avatars/reviews/jay-feldman.jpg",
    thumbnail: "/images/avatars/reviews/jay-feldman-thumb.webp",
    videoId: "1118790843",
  },
  {
    name: "Dave Menjura",
    role: "CRO",
    photo: "/images/avatars/reviews/dave-menjura.jpg",
    thumbnail: "/images/avatars/reviews/dave-menjura-thumb.webp",
    videoId: "1118790539",
  },
  {
    name: "Balsa Kosic",
    role: "COO",
    photo: "/images/avatars/reviews/balsa-kosic.jpg",
    thumbnail: "/images/avatars/reviews/balsa-kosic-thumb.webp",
    videoId: "1118790221",
  },
  {
    name: "Roy Ripper",
    role: "CEO",
    photo: "/images/avatars/reviews/roy-ripper.jpg",
    thumbnail: "/images/avatars/reviews/roy-ripper-thumb.webp",
    videoId: "1118790702",
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

          {/* Trusted-by logo strip (batch 2 — same position/treatment as
              the pricing page: under the hero ratings) */}
          <TrustedLogoStrip />

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
                alt="Fully whitelabel. Completely yours."
                fill
                sizes="(max-width: 1200px) 100vw, 1180px"
                className="object-cover"
              />
              <div className="absolute inset-0 flex justify-center p-8 md:p-16 xl:items-end xl:justify-end xl:p-14">
                <h3 className="text-center text-30 font-bold text-white sm:text-36 xl:text-right xl:text-30">
                  Fully whitelabel.
                  <br />
                  Completely yours.
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
                    Keep your clients separate, while keeping the overview
                    &amp; control over their accounts.
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
                    Get a dedicated success manager + access to our Slack
                    channel + migration help. All in one package.
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
                      Multi-layer protection to keep your accounts safe &amp;
                      secure at all times.
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
                        "Residential IP addresses",
                        "Automated warmup",
                        "Auto stick to Interaction limits",
                        "Cloud-based & untraceable",
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
                    {/* The mirror's CTA panel centres this exact pill
                        artwork (extracted verbatim from the mirror HTML) */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src="/images/agency/safety-cta-pill.svg"
                      alt="Safety — built into every account"
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
                    Connecting a client account does not grant you access to
                    their profile, keeping your clients reassured that their
                    accounts stay private.
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
          </div>

          {/* Mirror order (batch 2, same as the homepage fix): borderless
              artwork first, button below it */}
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
      {/* 5. PRICING THAT SCALES WITH YOUR GROWTH */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-800/40 py-24 lg:py-32">
        <div className="section-container">
          <div className="text-center">
            <h2 className="text-36 sm:text-48 font-bold text-white tracking-tight">
              Pricing that scales with your growth
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
              <VideoTestimonialCard key={v.name} testimonial={v} />
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
