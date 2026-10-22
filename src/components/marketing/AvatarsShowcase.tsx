"use client";

import { useState, type ComponentType } from "react";
import Link from "next/link";
import Image from "next/image";
import { Check, Flame, MapPin, Pencil, Send } from "lucide-react";

/**
 * Avatars strategy overview + "What you get" accordion.
 *
 * Phase-2 branding: all copy rewritten originally for NxtSend. The
 * strategy slot is a static overview composition — a gradient panel
 * with floating glass chips — rather than a video card: no video
 * embed, no presenter framing and no delivery-time promise; the
 * setup process is described generically (preparation,
 * customization, warm-up, handover). The "Talk to sales" buttons
 * map to /demo.
 *
 * The accordion's side visual is a native composition per feature:
 * a profile card, a market map and a handover checklist.
 */

/* Accordion icons (inline SVG paths). */
const featureIcons = [
  "M96.26 37a8 8 0 0 1 5.74-9.71 104.1 104.1 0 0 1 52 0 8 8 0 0 1-2 15.75 8.2 8.2 0 0 1-2-.26 88 88 0 0 0-44 0A8 8 0 0 1 96.26 37m-62.91 73a8 8 0 0 0 9.85-5.57 87.9 87.9 0 0 1 22-38.09 8 8 0 0 0-11.4-11.2 103.9 103.9 0 0 0-26 45 8 8 0 0 0 5.55 9.86M150 213.22a88 88 0 0 1-44 0 8 8 0 0 0-4 15.49 104.1 104.1 0 0 0 52 0 8 8 0 0 0-4-15.49m62.8-108.77a8 8 0 0 0 15.42-4.28 104 104 0 0 0-26-45 8 8 0 1 0-11.41 11.21 88.14 88.14 0 0 1 21.98 38.07Zm15.44 51.39a103.7 103.7 0 0 1-30.68 49.47 8 8 0 0 1-12.49-2.31 64 64 0 0 0-114.14 0 8 8 0 0 1-12.48 2.32 103.74 103.74 0 0 1-30.68-49.49 8 8 0 0 1 15.42-4.27 87.6 87.6 0 0 0 19 34.88 79.57 79.57 0 0 1 36.1-28.77 48 48 0 1 1 59.38 0 79.57 79.57 0 0 1 36.1 28.77 87.6 87.6 0 0 0 19-34.88 8 8 0 1 1 15.42 4.28ZM128 152a32 32 0 1 0-32-32 32 32 0 0 0 32 32",
  "M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m88 104a87.6 87.6 0 0 1-6.4 32.94l-44.7-27.49a15.9 15.9 0 0 0-6.24-2.23l-22.82-3.08a16.11 16.11 0 0 0-16 7.86h-8.72l-3.8-7.86a15.91 15.91 0 0 0-11-8.67l-8-1.73L96.14 104h16.71a16.06 16.06 0 0 0 7.73-2l12.25-6.76a16.6 16.6 0 0 0 3-2.14l26.91-24.34A15.93 15.93 0 0 0 166 49.1l-.36-.65A88.11 88.11 0 0 1 216 128m-176 0a87.5 87.5 0 0 1 8.54-37.8l11.34 30.27a16 16 0 0 0 11.62 10l21.43 4.61 3.81 7.92a16.09 16.09 0 0 0 14.4 9h1.48l-7.23 16.23a16 16 0 0 0 2.86 17.37l.14.14 19.61 20.2-1.94 10A88.11 88.11 0 0 1 40 128",
  "M232 136.66A104.12 104.12 0 1 1 119.34 24a8 8 0 0 1 1.32 16A88.12 88.12 0 1 0 216 135.34a8 8 0 0 1 16 1.32M120 72v56a8 8 0 0 0 8 8h56a8 8 0 0 0 0-16h-48V72a8 8 0 0 0-16 0m40-24a12 12 0 1 0-12-12 12 12 0 0 0 12 12m36 24a12 12 0 1 0-12-12 12 12 0 0 0 12 12m24 36a12 12 0 1 0-12-12 12 12 0 0 0 12 12",
];

const features = [
  {
    title: "Personalize every detail",
    text: "Set the photo, banner, headline, roles and summary for each profile, so it reflects the persona and offer you want to present",
    visual: "profile",
  },
  {
    title: "Matched to your market",
    text: "Choose the region your profiles should appear in, with location and connection settings aligned to the audience you plan to contact",
    visual: "market",
  },
  {
    title: "Prepared before handover",
    text: "Each profile is set up, customized to your brief and warmed through early activity before it appears in your workspace, ready for campaigns",
    visual: "handover",
  },
] as const;

type FeatureVisualKey = (typeof features)[number]["visual"];

/* ── Native accordion visuals (illustrative compositions) ────────────── */

function ProfileVisual() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto flex aspect-[1200/904] w-full max-w-[540px] items-center justify-center overflow-hidden rounded-3xl bg-[linear-gradient(150deg,#f3efff_0%,#e6e9ff_55%,#dbeafe_100%)] p-6"
    >
      <div className="w-full max-w-80 overflow-hidden rounded-3xl bg-white shadow-2xl ring-1 ring-black-900/5">
        <div className="h-16 bg-gradient-to-r from-purple-500 via-indigo-500 to-sky-400" />
        <div className="px-5 pb-5">
          <Image
            src="/images/agents/emily-johnson.webp"
            alt=""
            width={96}
            height={96}
            className="-mt-8 h-16 w-16 rounded-full object-cover object-top ring-4 ring-white"
          />
          <div className="mt-3 flex items-center justify-between gap-2">
            <span className="text-16 font-bold text-black-900">
              Emily Johnson
            </span>
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-purple-600/10 text-purple-600">
              <Pencil className="h-3.5 w-3.5" />
            </span>
          </div>
          <p className="text-13 text-black-500">Sales Agent</p>
          <div className="mt-4 space-y-2">
            <div className="h-2 w-full rounded bg-black-900/10" />
            <div className="h-2 w-4/5 rounded bg-black-900/10" />
            <div className="h-2 w-3/5 rounded bg-black-900/10" />
          </div>
          <div className="mt-4 flex gap-2">
            <span className="rounded-full bg-purple-600/10 px-2.5 py-1 text-11 font-semibold text-purple-700">
              Headline
            </span>
            <span className="rounded-full bg-purple-600/10 px-2.5 py-1 text-11 font-semibold text-purple-700">
              Banner
            </span>
            <span className="rounded-full bg-purple-600/10 px-2.5 py-1 text-11 font-semibold text-purple-700">
              Summary
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function MarketVisual() {
  const pins = [
    { photo: "/images/agents/daniel-c.webp", left: "18%", top: "30%" },
    { photo: "/images/agents/emery-e.webp", left: "47%", top: "24%" },
    { photo: "/images/agents/olivia-w.webp", left: "56%", top: "38%" },
    { photo: "/images/agents/chris-h.webp", left: "76%", top: "52%" },
    { photo: "/images/agents/james-miller.webp", left: "33%", top: "62%" },
  ];
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto flex aspect-square w-full max-w-[540px] items-center justify-center overflow-hidden rounded-3xl bg-[linear-gradient(160deg,#eef4ff_0%,#e9e7ff_60%,#fdeef7_100%)] p-6"
    >
      <div className="relative w-full overflow-hidden rounded-3xl bg-white/70 shadow-xl ring-1 ring-black-900/5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/images/world-dots.svg"
          alt=""
          className="h-auto w-full opacity-70"
        />
        {pins.map((pin) => (
          <span
            key={pin.photo}
            className="absolute -translate-x-1/2 -translate-y-1/2"
            style={{ left: pin.left, top: pin.top }}
          >
            <Image
              src={pin.photo}
              alt=""
              width={64}
              height={64}
              className="h-9 w-9 rounded-full object-cover object-top ring-2 ring-white"
            />
          </span>
        ))}
        <span className="absolute top-4 left-4 flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-12 font-semibold text-black-800 shadow-md ring-1 ring-black/5">
          <MapPin className="h-3.5 w-3.5 text-purple-600" />
          Location matched
        </span>
      </div>
    </div>
  );
}

function HandoverVisual() {
  const rows = [
    "Profile set up",
    "Customized to your brief",
    "Warmed through early activity",
  ];
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto flex aspect-square w-full max-w-[540px] items-center justify-center overflow-hidden rounded-3xl bg-[linear-gradient(150deg,#fff7ea_0%,#ffeef2_55%,#efe9ff_100%)] p-6"
    >
      <div className="w-full max-w-80 rounded-3xl bg-white p-5 shadow-2xl ring-1 ring-black-900/5">
        <div className="flex items-center gap-2.5">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-orange-400 to-rose-500 text-white">
            <Flame className="h-4.5 w-4.5" />
          </span>
          <span className="text-15 font-bold text-black-900">
            Warm-up progress
          </span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-black-900/10">
          <div className="h-full w-full rounded-full bg-gradient-to-r from-orange-400 to-rose-500" />
        </div>
        <div className="mt-5 space-y-3">
          {rows.map((row) => (
            <div key={row} className="flex items-center gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-white">
                <Check className="h-3 w-3" />
              </span>
              <span className="text-14 font-medium text-black-800">{row}</span>
            </div>
          ))}
        </div>
        <div className="mt-5 rounded-2xl bg-emerald-50 px-3.5 py-2.5 text-13 font-semibold text-emerald-700 ring-1 ring-emerald-100">
          Ready for campaigns
        </div>
      </div>
    </div>
  );
}

const featureVisuals: Record<FeatureVisualKey, ComponentType> = {
  profile: ProfileVisual,
  market: MarketVisual,
  handover: HandoverVisual,
};

export function AvatarsShowcase() {
  /* The second item starts open. */
  const [activeFeature, setActiveFeature] = useState(1);

  return (
    <section className="px-2.5">
      <div className="overflow-hidden rounded-5xl bg-white px-4 py-16 text-black-900 md:px-6 md:py-20 xl:rounded-8xl xl:px-10">
        {/* ────────────────────────────────────────────────────────────── */}
        {/* STRATEGY OVERVIEW (static section over a native gradient     */}
        {/* panel with floating glass chips)                             */}
        {/* ────────────────────────────────────────────────────────────── */}
        <div className="relative mx-auto w-full max-w-[1400px]">
          <div className="relative flex min-h-[560px] w-full flex-col justify-between overflow-hidden rounded-[2.5rem] pt-16 text-left md:pt-24 xl:min-h-[560px]">
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(155deg, #241254 0%, #12081f 55%, #0b0b16 100%)",
              }}
            />
            <div
              aria-hidden="true"
              className="absolute -top-24 left-1/3 h-96 w-96 rounded-full bg-purple-600/30 blur-[120px]"
            />
            <div
              aria-hidden="true"
              className="absolute right-0 bottom-0 h-72 w-72 rounded-full bg-indigo-500/20 blur-[100px]"
            />
            <div className="relative z-10 mx-auto flex max-w-xl flex-col items-center px-6">
              <h3 className="text-center text-36 font-semibold text-white md:text-48">
                More outreach capacity, managed in one place
              </h3>
              <p className="mt-4 text-center text-14 text-white md:text-16">
                Avatars give your team additional profiles for campaigns,
                market testing and follow-up — all run from the same
                workspace as your own accounts.
              </p>
              <div className="mt-8 flex items-center gap-x-5">
                <span className="hidden h-14 w-50 items-center justify-center rounded-full bg-white/15 text-16 font-semibold text-white backdrop-blur-2xl md:flex">
                  Campaigns
                </span>
                <span className="flex h-14 items-center justify-center rounded-full bg-white/15 px-6 text-16 font-semibold text-white backdrop-blur-2xl">
                  Unified inbox
                </span>
                <span className="hidden h-14 w-50 items-center justify-center rounded-full bg-white/15 text-16 font-semibold text-white backdrop-blur-2xl md:flex">
                  Your own seats
                </span>
              </div>
            </div>

            {/* Floating glass chips — native compositions */}
            <div
              aria-hidden="true"
              className="absolute bottom-24 left-6 z-10 hidden w-40 lg:block xl:left-16 xl:w-52"
            >
              <div className="aspect-square rounded-[2rem] border border-white/20 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
                <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-brand text-white">
                  <Send className="h-5 w-5" />
                </span>
                <div className="mt-4 space-y-2">
                  <div className="h-2 w-4/5 rounded bg-white/30" />
                  <div className="h-2 w-3/5 rounded bg-white/20" />
                  <div className="h-2 w-2/3 rounded bg-white/20" />
                </div>
                <div className="mt-4 flex gap-1.5">
                  <span className="h-5 w-10 rounded-full bg-white/15" />
                  <span className="h-5 w-8 rounded-full bg-white/10" />
                </div>
              </div>
            </div>
            <div
              aria-hidden="true"
              className="absolute right-6 bottom-40 z-10 hidden w-40 lg:block xl:right-16 xl:w-52"
            >
              <div className="aspect-square rounded-[2rem] border border-white/20 bg-white/10 p-4 shadow-2xl backdrop-blur-xl">
                <div className="flex items-center gap-2.5">
                  <Image
                    src="/images/agents/olivia-w.webp"
                    alt=""
                    width={64}
                    height={64}
                    className="h-9 w-9 rounded-full object-cover object-top"
                  />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-2 w-4/5 rounded bg-white/30" />
                    <div className="h-2 w-3/5 rounded bg-white/20" />
                  </div>
                  <span className="h-2 w-2 shrink-0 rounded-full bg-purple-400" />
                </div>
                <div className="mt-4 rounded-2xl bg-white/10 p-3">
                  <div className="space-y-1.5">
                    <div className="h-2 w-full rounded bg-white/25" />
                    <div className="h-2 w-2/3 rounded bg-white/15" />
                  </div>
                </div>
                <div className="mt-3 ml-auto w-3/5 rounded-2xl bg-purple-500/30 p-3">
                  <div className="space-y-1.5">
                    <div className="h-2 w-full rounded bg-white/30" />
                    <div className="h-2 w-1/2 rounded bg-white/20" />
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10 m-4 flex items-start gap-x-3 self-stretch rounded-3xl bg-black/30 p-4 backdrop-blur-2xl md:absolute md:right-24 md:bottom-6 md:m-0 md:w-80 xl:right-40">
              <p className="text-13 text-white xl:text-15">
                Use avatars to test a new segment, cover a second region,
                or keep prospecting going while your own profile focuses on
                replies.
              </p>
            </div>
          </div>
        </div>

        {/* ────────────────────────────────────────────────────────────── */}
        {/* WHAT YOU GET (accordion with switching image)                  */}
        {/* ────────────────────────────────────────────────────────────── */}
        <div className="mx-auto mt-20 grid w-full max-w-[1400px] gap-y-12 xl:grid-cols-[auto_max-content] xl:gap-x-6">
          <div className="flex flex-col items-center gap-y-6 xl:items-start">
            <div className="flex items-end justify-center gap-x-3">
              <h2 className="text-36 font-semibold md:text-48">
                What comes with each avatar
              </h2>
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="36"
                height="36"
                fill="none"
                viewBox="0 0 36 36"
                aria-hidden="true"
                className="mb-1.5 hidden md:block"
              >
                <path
                  fill="#000"
                  d="M24.94 11.357v19.156l7.484-7.484a1.607 1.607 0 1 1 2.273 2.272L24.469 35.53a1.61 1.61 0 0 1-2.273 0L11.969 25.301a1.607 1.607 0 1 1 2.273-2.272l7.484 7.484V14.57H.833v-3.214z"
                />
              </svg>
            </div>
            <Link
              href="/demo"
              className="flex h-12 items-center justify-center rounded-full bg-purple-600 px-6 text-16 font-semibold text-white transition-colors hover:bg-purple-800"
            >
              Talk to our team
            </Link>
          </div>

          <div className="relative order-first xl:order-none xl:row-span-2">
            {(() => {
              const Visual = featureVisuals[features[activeFeature].visual];
              return <Visual key={features[activeFeature].visual} />;
            })()}
          </div>

          <div className="flex flex-col justify-end gap-y-2 md:gap-y-3.5 xl:max-w-xl">
            {features.map((feature, i) => {
              const open = i === activeFeature;
              return (
                <button
                  key={feature.title}
                  type="button"
                  onClick={() => setActiveFeature(i)}
                  aria-expanded={open}
                  className={`group relative cursor-pointer overflow-hidden rounded-3xl p-px text-left ${
                    open ? "bg-purple-600/20" : ""
                  }`}
                >
                  <div
                    className={`relative z-10 flex flex-col gap-y-2.5 rounded-3xl px-6 transition-[padding] ${
                      open ? "bg-white pt-6 pb-8" : "py-4"
                    }`}
                  >
                    <div
                      className={`flex items-center gap-x-3 ${
                        open
                          ? "text-black-900"
                          : "text-black-500 group-hover:text-purple-600"
                      }`}
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        fill="currentColor"
                        viewBox="0 0 256 256"
                        className="size-6 shrink-0"
                        aria-hidden="true"
                      >
                        <path d={featureIcons[i]} />
                      </svg>
                      <span className="text-20 font-semibold xl:text-18">
                        {feature.title}
                      </span>
                    </div>
                    <div
                      className={`grid transition-all ${
                        open
                          ? "grid-rows-[1fr] opacity-100"
                          : "grid-rows-[0fr] opacity-0"
                      }`}
                    >
                      <p className="overflow-hidden pl-9 text-left text-18 font-medium text-black-500 xl:text-16">
                        {feature.text}
                      </p>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
