import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  ClipboardList,
  ShieldCheck,
  Headphones,
  Star,
} from "lucide-react";
import { AvatarsShowcase } from "@/components/marketing/AvatarsShowcase";
import { AvatarsPricing } from "@/components/marketing/AvatarsPricing";
import { AvatarsWall } from "@/components/marketing/AvatarsWall";

export const metadata: Metadata = {
  title: "NxtSend Avatars – Rent LinkedIn accounts for outreach",
  description:
    "NxtSend Avatars are pre-warmed up LinkedIn accounts you can rent to scale your LinkedIn outreach.",
};

/* ──────────────────────────────────────────────────────────────────────── */
/* Avatars page (mirror: aimfox.com/avatars — ZIP 4,                        */
/* "6. aimfox.com.avatars/www.aimfox.com/avatars.html").                    */
/*                                                                          */
/* Every heading, paragraph, step, feature, plan figure and testimonial   */
/* below is copied verbatim from the mirror, including its original       */
/* typos ("LinekdIn", "dosen't"). Data that only exists in the mirror's   */
/* serialized page state (the 16 wall reviews with photos, video          */
/* thumbnails and Vimeo IDs, the strategy video ID) was decoded from      */
/* that state — see AVATARS_MAP.md. The mirror's sales CTAs point at an   */
/* Aimfox Calendly link; they map to the app's /demo page, as on          */
/* /pricing. No Aimfox tracking scripts/IDs and no aimfox.com or          */
/* app.aimfox.com links are carried over.                                 */
/* ──────────────────────────────────────────────────────────────────────── */

/* ── Hero company testimonials (mirror: two testimonial popups in the ──── */
/* trusted-by logo strip — Xavier C. / oneaway, Marc Gaudett / instantly)  */
const companyTestimonials = [
  {
    quote:
      "The thing that probably sets Aimfox apart the most from other LinkedIn outreach tools is the the option to rent LinkedIn profiles natively. For us this means that we can scale LinekdIn outbound at the same pace we scale email outbound.",
    name: "Xavier C.",
    title: "Founder",
    company: "oneaway",
    photo: "/images/testimonials/xavier-c..jpeg",
  },
  {
    quote:
      "I always thought that LinekdIn outreach dosen't scale - until Aimfox proved me wrong. Such an amazing team behind the product. Super excited for what the future holds!",
    name: "Marc Gaudett",
    title: "Head of Partnerships",
    company: "instantly",
    photo: "/images/testimonials/marc-gaudett.jpeg",
  },
];

/* ── How it works (mirror: three steps) ────────────────────────────────── */
const steps = [
  {
    number: "1",
    title: "Rent an account",
    text: "Talk to our sales team to purchase the avatars",
    image: "/images/avatars/step-1.webp",
  },
  {
    number: "2",
    title: "Fill out the customization form",
    text: "Fill out the form we send - we’ll take care of the setup",
    image: null,
  },
  {
    number: "3",
    title: "Scale your LinkedIn outreach",
    text: "Go past the LinkedIn limits and start more conversations faster",
    image: "/images/avatars/step-3.webp",
  },
];

export default function AvatarsPage() {
  return (
    <div className="relative overflow-hidden bg-black-900">
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HERO (mirror: rounded banner — hero-bg artwork with the avatar     */}
      {/* profile collage from hero.webp along the bottom, gradient headline) */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="px-2.5 pt-24 sm:pt-28">
        <div className="relative flex min-h-[720px] flex-col items-center overflow-hidden rounded-5xl px-4 pt-16 md:px-6 xl:rounded-8xl">
          <Image
            src="/images/avatars/hero-bg.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover"
          />
          <Image
            src="/images/avatars/hero.webp"
            alt=""
            width={3362}
            height={1442}
            priority
            className="pointer-events-none absolute bottom-0 left-1/2 w-[140%] max-w-none -translate-x-1/2 sm:w-full"
          />
          <h1 className="relative z-10 mb-5 max-w-4xl bg-gradient-purple-horizontal bg-clip-text text-center text-48 font-semibold text-transparent md:text-54 2xl:text-64">
            Customizable LinkedIn accounts for faster outreach
          </h1>
          <p className="relative z-10 mb-6 text-center text-15 font-medium text-white">
            Rent LinkedIn accounts and get more done, faster.
          </p>
          <div className="relative z-10 flex justify-center gap-x-3">
            <Link
              href="/demo"
              className="flex h-10.5 items-center justify-center rounded-full bg-black-900 px-5 text-16 font-semibold whitespace-nowrap text-white transition-colors hover:bg-black-600"
            >
              Talk to sales
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* TRUSTED BY (mirror: ratings + company testimonial popups; the      */}
      {/* mirror's G2 / Capterra links point at Aimfox's own review          */}
      {/* profiles, so the ratings render without outbound links)             */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="px-5.5 py-16 lg:pb-20">
        <p className="mx-auto mb-1.5 text-center text-sm font-bold text-white/60">
          Trusted by more than 10,000 outreach experts
        </p>
        <div className="mx-auto mb-12 flex items-center justify-center gap-x-7 text-14 font-bold text-white/40">
          <span className="flex items-center gap-2">
            <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
            4.8 rating
          </span>
          <span className="flex items-center gap-2">
            <Star className="h-4 w-4 fill-orange-400 text-orange-400" />
            4.9 rating
          </span>
        </div>

        <div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 text-left md:grid-cols-2">
          {companyTestimonials.map((t) => (
            <div
              key={t.name}
              className="glass-card flex flex-col justify-between p-6"
            >
              <div>
                <span className="text-11 font-bold tracking-wider text-purple-400 uppercase">
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
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HOW IT WORKS (mirror: 3 step cards over the bg-graphic artwork)    */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24 lg:py-32">
        <div className="section-container relative">
          <div className="text-center">
            <span className="text-13 font-bold tracking-widest text-purple-400 uppercase">
              How it works
            </span>
            <h2 className="mt-4 text-36 font-bold tracking-tight text-white sm:text-48">
              Three simple steps to scale your outreach
            </h2>
          </div>

          <div className="relative mx-auto mt-20 flex max-w-5xl flex-col gap-y-14">
            <Image
              src="/images/avatars/steps-bg.webp"
              alt=""
              width={1200}
              height={806}
              className="pointer-events-none absolute top-1/2 left-1/2 w-full max-w-3xl -translate-x-1/2 -translate-y-1/2 opacity-30"
            />
            {steps.map((step) => (
              <div
                key={step.number}
                className="relative flex flex-col gap-8 rounded-[2.5rem] border border-white/10 bg-white/[0.03] px-3 pt-10 pb-9 shadow-[2px_4px_16px_0_rgba(247,247,247,0.06)_inset] backdrop-blur-md md:flex-row md:items-center"
              >
                <div className="absolute inset-x-0 -top-6 mx-auto flex h-12 w-16 items-center justify-center rounded-2xl border border-white/5 bg-white/5 text-14 font-medium text-white shadow-[0_0_0_2px_rgba(18,18,18,0.20)]">
                  {step.number}
                </div>
                <div className="flex-1">
                  {step.image ? (
                    <Image
                      src={step.image}
                      alt={step.title}
                      width={648}
                      height={648}
                      className="mx-auto max-h-72 w-auto"
                    />
                  ) : (
                    /* The mirror draws step 2's visual as a large inline
                       SVG form illustration (not a downloadable asset);
                       a form panel stands in for it — see AVATARS_MAP.md. */
                    <div className="mx-auto flex max-h-72 w-full max-w-sm flex-col gap-3 rounded-3xl border border-white/10 bg-black-800/60 p-6">
                      <span className="flex items-center gap-2 text-14 font-semibold text-white">
                        <ClipboardList className="h-5 w-5 text-purple-400" />
                        Customization form
                      </span>
                      <span className="h-9 rounded-xl bg-white/5" />
                      <span className="h-9 rounded-xl bg-white/5" />
                      <span className="h-9 rounded-xl bg-white/5" />
                      <span className="h-10 rounded-xl bg-gradient-brand" />
                    </div>
                  )}
                </div>
                <div className="flex flex-col gap-y-3 px-5 md:flex-1 md:px-0 xl:flex-none xl:px-5">
                  <h3 className="text-20 font-medium text-white/90 md:text-24 xl:text-20">
                    {step.title}
                  </h3>
                  <p className="text-16 text-white/50">{step.text}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-14 text-center">
            <Link
              href="/demo"
              className="inline-flex h-12 items-center justify-center rounded-full bg-purple-600 px-6 text-16 font-semibold text-white transition-colors hover:bg-purple-800"
            >
              Talk to the sales team
            </Link>
          </div>

          {/* Mirror: responsive app screenshot under the steps */}
          <div className="mx-auto mt-16 max-w-6xl">
            <Image
              src="/images/avatars/showcase-desktop.webp"
              alt="Rented LinkedIn avatars in NxtSend"
              width={1200}
              height={503}
              className="hidden h-auto w-full sm:block"
            />
            <Image
              src="/images/avatars/showcase-mobile.webp"
              alt="Rented LinkedIn avatars in NxtSend"
              width={1200}
              height={825}
              className="h-auto w-full sm:hidden"
            />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* STRATEGY VIDEO + WHAT YOU GET (mirror: one white panel)            */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <AvatarsShowcase />

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* PRICING THAT SCALES WITH YOUR GROWTH (mirror: single avatar card)  */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 py-24 lg:py-32">
        <div className="section-container flex flex-col items-center">
          <div className="mx-auto mb-12 flex max-w-2xl flex-col items-center text-center">
            <h2 className="text-48 font-semibold text-white xl:text-54">
              Pricing that scales with your growth
            </h2>
          </div>
          <AvatarsPricing />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* LOVED BY AGENCIES, SALES TEAMS & GTM EXPERTS (mirror wall)         */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative border-t border-black-700/80 bg-black-900 py-24 lg:py-32">
        <div className="pointer-events-none absolute top-1/2 right-10 h-[350px] w-[350px] -translate-y-1/2 rounded-full bg-purple-600/15 blur-[140px]" />
        <div className="section-container relative z-10">
          <div className="text-center">
            <h2 className="text-36 font-bold tracking-tight text-white sm:text-48">
              Loved by agencies, sales teams &amp; GTM experts
            </h2>
          </div>
          <AvatarsWall />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* START SCALING YOUR OUTREACH TODAY (mirror final CTA)               */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-black-700/80 bg-gradient-hero py-24">
        <div className="pointer-events-none absolute inset-0 bg-radial-glow opacity-30" />
        <div className="section-container relative z-10 text-center">
          <div className="mx-auto max-w-3xl rounded-3xl border border-purple-500/30 bg-black-800/80 p-8 shadow-glow-purple/20 backdrop-blur-2xl sm:p-14">
            <h2 className="text-36 font-extrabold tracking-tight text-white sm:text-48">
              Start scaling your outreach today
            </h2>
            <p className="mt-4 text-17 text-black-300 sm:text-20">
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
