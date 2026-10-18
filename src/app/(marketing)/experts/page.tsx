import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  ShieldCheck,
  Headphones,
} from "lucide-react";

export const metadata: Metadata = {
  title: "NxtSend Experts – Certified LinkedIn Outreach & Growth Consultants",
  description:
    "Meet the NxtSend Experts network — trusted consultants and agencies specialized in scaling LinkedIn outreach campaigns for B2B brands and lead-gen teams.",
};

/* ──────────────────────────────────────────────────────────────────────── */
/* Expert directory (verbatim from the mirror: aimfox.com/experts —        */
/* name, bio and company exactly as published, including original typos).  */
/* The mirror cards link to per-expert detail pages on aimfox.com, which   */
/* are not part of the download; cards therefore link to the app's         */
/* contact page with the expert slug, mirroring the integrations mapping.  */
/* ──────────────────────────────────────────────────────────────────────── */
const experts = [
  {
    slug: "jay-feldman",
    name: "Jay Feldman",
    bio: "YouTube's #1 Expert in B2B Lead Generation through LinkedIn and Cold Email Outreach.",
    company: "Lead Gen Jay",
    photo: "/images/experts/jay-feldman.jpg",
    logo: "/images/experts/jay-feldman-logo.jpg",
  },
  {
    slug: "sander-aavik",
    name: "Sander Aavik",
    bio: "As one of the leading lead generation agencies in the Baltic region, Sander services clients from all over the world. He connects all the dots and makes robust outbound machines.",
    company: "Leadprinter",
    photo: "/images/experts/sander-aavik.jpg",
    logo: "/images/experts/sander-aavik-logo.jpg",
  },
  {
    slug: "manthan-patel",
    name: "Manthan Patel",
    bio: "Manthan is the go-to-person for building complex outbound workflows through n8n. He's always at the bleeding edge of tech.",
    company: "Lead Gen Man",
    photo: "/images/experts/manthan-patel.jpg",
    logo: "/images/experts/manthan-patel-logo.jpg",
  },
  {
    slug: "kevin-patrick",
    name: "Kevin Patrick",
    bio: "With havy focus on LinkedIn in general, Kevin is a safe bet when it comes to laser focused outreach on the platform.",
    company: "Astris Partners",
    photo: "/images/experts/kevin-patrick.jpg",
    logo: "/images/experts/kevin-patrick-logo.jpg",
  },
  {
    slug: "dave-menjura",
    name: "Dave Menjura",
    bio: "An expert in building recruiting funnels that always deliver new and qualified candidates.",
    company: "CloudTask",
    photo: "/images/experts/dave-menjura.jpg",
    logo: "/images/experts/dave-menjura-logo.jpg",
  },
  {
    slug: "raouf-lemouchi",
    name: "Raouf Lemouchi",
    bio: "After testing dozens of tools, Raouf has built a rock-solid outbound stack that keeps it simple and get's results.",
    company: "Alpaca Leads",
    photo: "/images/experts/raouf-lemouchi.jpg",
    logo: "/images/experts/raouf-lemouchi-logo.jpg",
  },
  {
    slug: "jeremy-hamilton",
    name: "Jeremy Hamilton",
    bio: "The Hamilton Growth Solution is designed to provide scaleups with a complete marketing solution that will ensure an increase in marketing effectiveness.",
    company: "Hamilton Growth",
    photo: "/images/experts/jeremy-hamilton.jpg",
    logo: "/images/experts/jeremy-hamilton-logo.jpg",
  },
  {
    slug: "teodora-vukasinovic",
    name: "Teodora Vukasinovic",
    bio: "Pushing limits in everything she does. If you need a sharp mind to break down your current setup and improve it, she's your go-to.",
    company: "Dreamforge",
    photo: "/images/experts/teodora-vukasinovic.jpg",
    logo: "/images/experts/teodora-vukasinovic-logo.jpg",
  },
  {
    slug: "alex-colhoun",
    name: "Alex Colhoun",
    bio: "If you're looking for more than just outbound and need a wider scope of services around LinkedIn, he's the one-stop-shop.",
    company: "The Growth Inovator",
    photo: "/images/experts/alex-colhoun.jpg",
    logo: "/images/experts/alex-colhoun-logo.jpg",
  },
  {
    slug: "marielle-camba",
    name: "Marielle Camba",
    bio: "Well versed in Clay workflows, Data scraping, Lead list building, AI and Claygent Prompting, HTTP API setup, and Webhook setup. Specialized in building outbound email campaigns.",
    company: "Growth Engine X",
    photo: "/images/experts/marielle-camba.jpg",
    logo: "/images/experts/marielle-camba-logo.jpg",
  },
  {
    slug: "frederick-potticary",
    name: "Frederick Potticary",
    bio: "Specializing in demand origination for AI enterprise, Frederick is the go-to if you're a raising series A-B2 founder. He's built a few marketing agencies generating 7 figures in ARR for B2B SaaS - reach out if you want a real heavyweight.",
    company: "Bambo Group",
    photo: "/images/experts/frederick-potticary.jpg",
    logo: "/images/experts/frederick-potticary-logo.png",
  },
];

export default function ExpertsPage() {
  return (
    <div className="relative overflow-hidden bg-black-900">
      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* HERO (mirror: aimfox.com/experts — light rounded banner image with  */}
      {/* dark headline at its bottom; hero-lg.webp on very wide screens)     */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section className="px-2.5 pt-24 sm:pt-28">
        <div className="relative flex flex-col items-center overflow-hidden rounded-5xl px-4 pt-52 pb-9 md:px-6 md:pb-12 xl:rounded-8xl xl:pb-14">
          <Image
            src="/images/experts/hero.webp"
            alt=""
            fill
            priority
            sizes="100vw"
            className="object-cover object-top"
          />
          <Image
            src="/images/experts/hero-lg.webp"
            alt=""
            fill
            sizes="100vw"
            className="hidden object-cover object-top min-[1920px]:block"
          />
          <h1 className="relative z-10 mb-4 text-center text-48 font-semibold text-black-900 md:text-54 xl:text-64">
            Aimfox
            <br />
            Certified Experts
          </h1>
          <p className="relative z-10 mb-6 text-center text-16 font-medium text-black-600 xl:max-w-[47.5rem] xl:text-20">
            Find outbound experts that have extensive knowledge in scaling
            LinkedIn lead generation campaigns for Aimfox users
          </p>
          <div className="relative z-10 flex gap-x-3">
            <Link
              href="/contact"
              className="flex h-10.5 items-center justify-center rounded-full bg-black-900 px-5 text-16 font-semibold whitespace-nowrap text-white transition-colors hover:bg-black-600"
            >
              Become an expert
            </Link>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* EXPERTS DIRECTORY (mirror: 11 certified expert cards)               */}
      {/* ──────────────────────────────────────────────────────────────────── */}
      <section>
        <div className="mx-auto grid w-full max-w-[1400px] grid-cols-1 gap-4 px-4 py-16 md:grid-cols-2 md:gap-6 md:px-6 md:py-20 xl:grid-cols-3 xl:px-20 xl:py-28 2xl:px-40">
          {experts.map((expert) => (
            <Link
              key={expert.slug}
              href={`/contact?expert=${expert.slug}`}
              className="group relative flex flex-col rounded-3xl border border-black-700 bg-black-800/40 p-4 text-white transition-colors hover:bg-black-800"
            >
              <div className="mb-6 flex items-center gap-x-4">
                <Image
                  src={expert.photo}
                  alt=""
                  width={48}
                  height={48}
                  className="rounded-2xl"
                />
                <span className="text-24 font-bold">{expert.name}</span>
              </div>
              <p className="mb-8 flex-1 text-16 font-medium">{expert.bio}</p>
              <div className="flex items-center gap-x-2.5">
                <Image
                  src={expert.logo}
                  alt=""
                  width={32}
                  height={32}
                  className="rounded-full"
                />
                <span className="text-14 font-semibold">{expert.company}</span>
                <div className="ml-auto flex size-9 items-center justify-center rounded-xl border border-black-700">
                  <ArrowUpRight className="size-4 text-white/20 transition-colors group-hover:text-white" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────────── */}
      {/* START SCALING YOUR OUTREACH TODAY (mirror final CTA)                */}
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
