import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  Check,
  ShieldCheck,
  Headphones,
} from "lucide-react";
import { DemoHeroVideo } from "@/components/marketing/DemoHeroVideo";
import { DemoBookingForm } from "@/components/marketing/DemoBookingForm";

export const metadata: Metadata = {
  title: { absolute: "Book a Demo – See NxtSend in Action" },
  description:
    "Request a guided tour of NxtSend and see how your team can plan LinkedIn campaigns, manage replies in one inbox, and follow up without the manual work.",
};

/**
 * Demo page (mirror: aimfox.com/demo, ZIP 4 mirror).
 *
 * Sections follow the mirror in order: hero with a static product
 * visual, the webinar / book-a-call options under a shared heading,
 * the booking-request form, and the standard final CTA. The review
 * wall that previously sat on this page has been removed — NxtSend
 * does not reuse another product's reviews.
 *
 * Booking substitution: on the mirror, booking runs through an
 * external calendar service and a webinar registration link. None of
 * those external services are embedded or linked here — both cards
 * lead to the app's own booking-request form (DemoBookingForm,
 * #book-a-demo).
 */
export default function DemoPage() {
  return (
    <div className="relative min-h-screen overflow-x-clip bg-black-900">
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HERO — headline + static product visual                             */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative bg-black-900 px-2.5 pt-24 sm:pt-28">
        <div className="relative overflow-hidden rounded-5xl bg-white px-4 pt-12 pb-16 md:px-6 md:py-20 xl:rounded-8xl 2xl:px-40 2xl:py-28">
          <Image
            src="/images/demo/hero.webp"
            alt=""
            fill
            priority
            className="object-cover"
          />
          <div className="relative z-10 flex flex-col items-center">
            <h1 className="mb-4 max-w-[50rem] text-center text-36 font-semibold text-black-900 md:mb-6 md:text-54 2xl:text-64">
              See how NxtSend runs{" "}
              <span className="text-gradient-brand">LinkedIn outreach</span>
            </h1>
            <p className="mb-6 max-w-[38rem] text-center text-16 font-medium text-black-600 md:mb-9 2xl:mb-12">
              Take a closer look at campaigns, inboxes and follow-ups —
              and how they fit together in one workspace for your team.
            </p>
            <Link
              href="/signup"
              className="mb-6 inline-flex h-10.5 items-center justify-center rounded-full bg-black-900 px-7 text-15 font-semibold text-white transition-colors hover:bg-black-600 md:mb-9 2xl:mb-12"
            >
              Try for free
            </Link>
            <DemoHeroVideo />
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* EVERY CONVERSATION, ONE INBOX — webinar / book-a-call cards         */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative bg-black-900 py-24 lg:py-28">
        <div className="section-container">
          <div className="mx-auto mb-12 flex max-w-2xl flex-col items-center text-center">
            <h2 className="text-36 font-bold tracking-tight text-white sm:text-48">
              Every conversation, one inbox
            </h2>
            <p className="mt-4 text-16 font-medium text-black-300">
              Choose the format that suits where you are — a group session
              for a first look, or a one-to-one call shaped around your
              team.
            </p>
          </div>

          <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 xl:grid-cols-2 xl:gap-10">
            {/* Join a live webinar */}
            <div className="flex flex-col rounded-3xl bg-white p-6 md:p-8">
              <Image
                src="/images/demo/hero.webp"
                alt=""
                width={404}
                height={384}
                className="mb-6 w-20 rounded-2xl object-cover md:mb-8"
              />
              <h3 className="mb-4 text-24 font-bold text-black-900 md:text-30">
                Join a live webinar
              </h3>
              <p className="mb-6 text-16 font-medium text-black-600 md:mb-8">
                Still comparing your options? Join a live product webinar
                with our team and watch a campaign being set up, launched
                and managed, with time for questions at the end.
              </p>
              <Link
                href="#book-a-demo"
                className="group mt-auto inline-flex h-11 items-center justify-center gap-2 self-start rounded-full bg-purple-600 px-6 text-15 font-semibold text-white shadow-glow-purple transition-colors hover:bg-purple-800"
              >
                <span>Join a webinar</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>

            {/* Book a call */}
            <div className="flex flex-col rounded-3xl bg-white p-6 md:p-8">
              <Image
                src="/images/demo/hero.webp"
                alt=""
                width={402}
                height={389}
                className="mb-6 w-20 rounded-2xl object-cover md:mb-8"
              />
              <h3 className="mb-4 text-24 font-bold text-black-900 md:text-30">
                Book a call with our sales team
              </h3>
              <p className="mb-6 text-16 font-medium text-black-600 md:mb-8">
                Already planning to run outreach across several LinkedIn
                accounts? Book a call with our sales team and we will talk
                through your goals, your accounts and the setup that fits.
              </p>
              <Link
                href="#book-a-demo"
                className="group mt-auto inline-flex h-11 items-center justify-center gap-2 self-start rounded-full bg-black-50 px-6 text-15 font-semibold text-black-900 transition-colors hover:bg-black-100 xl:self-end"
              >
                <span>Get Started</span>
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* BOOKING REQUEST — the app's own form                                */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section
        id="book-a-demo"
        className="relative border-t border-black-700/80 bg-black-900 py-24 lg:py-32"
      >
        <div className="pointer-events-none absolute top-0 left-1/2 h-[400px] w-[700px] -translate-x-1/2 rounded-full bg-purple-600/15 blur-[140px]" />
        <div className="section-container relative z-10">
          <DemoBookingForm />
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* START SCALING YOUR OUTREACH TODAY                                  */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-t border-black-700/80 bg-gradient-hero py-24 lg:py-32">
        <div className="pointer-events-none absolute inset-0 bg-radial-glow opacity-30" />
        <div className="section-container relative z-10 text-center">
          <div className="mx-auto max-w-3xl rounded-3xl border border-purple-500/30 bg-black-800/80 p-8 shadow-glow-purple/20 backdrop-blur-2xl sm:p-14">
            <h2 className="text-36 sm:text-48 font-extrabold text-white tracking-tight">
              Put your outreach on a steadier footing
            </h2>
            <p className="mt-4 text-17 sm:text-20 text-black-300">
              Create your account, connect your first LinkedIn profile and
              draft a campaign you can review before anything is sent.
              Everything stays visible in one place, from first message to
              final reply.
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
