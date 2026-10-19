"use client";

import { useState } from "react";
import Link from "next/link";
import Image from "next/image";

/**
 * Avatars strategy overview + "What you get" accordion
 * (layout provenance: aimfox.com/avatars mirror, ZIP 4).
 *
 * Phase-2 branding: all copy rewritten originally for NxtSend. The
 * mirror's strategy video card (hosted-video embed with a presenter
 * photo and quote) is removed per owner-approved default D7 and
 * replaced by a
 * static strategy/overview section that reuses the kept abstract
 * avatars artwork (strategy-bg + floating boxes). No video embed, no
 * presenter framing and no delivery-time promise remain; the setup
 * process is described generically (preparation, customization,
 * warm-up, handover). The "Talk to sales" buttons map to /demo.
 */

/* Accordion icons, paths copied from the mirror's own icon set. */
const featureIcons = [
  "M96.26 37a8 8 0 0 1 5.74-9.71 104.1 104.1 0 0 1 52 0 8 8 0 0 1-2 15.75 8.2 8.2 0 0 1-2-.26 88 88 0 0 0-44 0A8 8 0 0 1 96.26 37m-62.91 73a8 8 0 0 0 9.85-5.57 87.9 87.9 0 0 1 22-38.09 8 8 0 0 0-11.4-11.2 103.9 103.9 0 0 0-26 45 8 8 0 0 0 5.55 9.86M150 213.22a88 88 0 0 1-44 0 8 8 0 0 0-4 15.49 104.1 104.1 0 0 0 52 0 8 8 0 0 0-4-15.49m62.8-108.77a8 8 0 0 0 15.42-4.28 104 104 0 0 0-26-45 8 8 0 1 0-11.41 11.21 88.14 88.14 0 0 1 21.98 38.07Zm15.44 51.39a103.7 103.7 0 0 1-30.68 49.47 8 8 0 0 1-12.49-2.31 64 64 0 0 0-114.14 0 8 8 0 0 1-12.48 2.32 103.74 103.74 0 0 1-30.68-49.49 8 8 0 0 1 15.42-4.27 87.6 87.6 0 0 0 19 34.88 79.57 79.57 0 0 1 36.1-28.77 48 48 0 1 1 59.38 0 79.57 79.57 0 0 1 36.1 28.77 87.6 87.6 0 0 0 19-34.88 8 8 0 1 1 15.42 4.28ZM128 152a32 32 0 1 0-32-32 32 32 0 0 0 32 32",
  "M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m88 104a87.6 87.6 0 0 1-6.4 32.94l-44.7-27.49a15.9 15.9 0 0 0-6.24-2.23l-22.82-3.08a16.11 16.11 0 0 0-16 7.86h-8.72l-3.8-7.86a15.91 15.91 0 0 0-11-8.67l-8-1.73L96.14 104h16.71a16.06 16.06 0 0 0 7.73-2l12.25-6.76a16.6 16.6 0 0 0 3-2.14l26.91-24.34A15.93 15.93 0 0 0 166 49.1l-.36-.65A88.11 88.11 0 0 1 216 128m-176 0a87.5 87.5 0 0 1 8.54-37.8l11.34 30.27a16 16 0 0 0 11.62 10l21.43 4.61 3.81 7.92a16.09 16.09 0 0 0 14.4 9h1.48l-7.23 16.23a16 16 0 0 0 2.86 17.37l.14.14 19.61 20.2-1.94 10A88.11 88.11 0 0 1 40 128",
  "M232 136.66A104.12 104.12 0 1 1 119.34 24a8 8 0 0 1 1.32 16A88.12 88.12 0 1 0 216 135.34a8 8 0 0 1 16 1.32M120 72v56a8 8 0 0 0 8 8h56a8 8 0 0 0 0-16h-48V72a8 8 0 0 0-16 0m40-24a12 12 0 1 0-12-12 12 12 0 0 0 12 12m36 24a12 12 0 1 0-12-12 12 12 0 0 0 12 12m24 36a12 12 0 1 0-12-12 12 12 0 0 0 12 12",
];

const features = [
  {
    title: "Personalize every detail",
    text: "Set the photo, banner, headline, roles and summary for each profile, so it reflects the persona and offer you want to present",
    image: "/images/avatars/feature-1.webp",
    imageWidth: 1200,
    imageHeight: 904,
  },
  {
    title: "Matched to your market",
    text: "Choose the region your profiles should appear in, with location and connection settings aligned to the audience you plan to contact",
    image: "/images/avatars/feature-2.webp",
    imageWidth: 1200,
    imageHeight: 1200,
  },
  {
    title: "Prepared before handover",
    text: "Each profile is set up, customized to your brief and warmed through early activity before it appears in your workspace, ready for campaigns",
    image: "/images/avatars/feature-3.webp",
    imageWidth: 1200,
    imageHeight: 1200,
  },
];

export function AvatarsShowcase() {
  /* The second item starts open. */
  const [activeFeature, setActiveFeature] = useState(1);

  return (
    <section className="px-2.5">
      <div className="overflow-hidden rounded-5xl bg-white px-4 py-16 text-black-900 md:px-6 md:py-20 xl:rounded-8xl xl:px-10">
        {/* ────────────────────────────────────────────────────────────── */}
        {/* STRATEGY OVERVIEW (static section over strategy-bg.webp with  */}
        {/* the floating UI boxes; replaces the removed video card)      */}
        {/* ────────────────────────────────────────────────────────────── */}
        <div className="relative mx-auto w-full max-w-[1400px]">
          <div className="relative flex min-h-[560px] w-full flex-col justify-between overflow-hidden rounded-[2.5rem] pt-16 text-left md:pt-24 xl:min-h-[560px]">
            <Image
              src="/images/avatars/strategy-bg.webp"
              alt=""
              fill
              sizes="100vw"
              className="object-cover"
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

            <Image
              src="/images/avatars/floating-box-1.webp"
              alt=""
              width={873}
              height={876}
              className="absolute bottom-24 left-6 z-10 hidden w-40 lg:block xl:left-16 xl:w-52"
            />
            <Image
              src="/images/avatars/floating-box-2.webp"
              alt=""
              width={833}
              height={833}
              className="absolute right-6 bottom-40 z-10 hidden w-40 lg:block xl:right-16 xl:w-52"
            />

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
            <Image
              src={features[activeFeature].image}
              alt={features[activeFeature].title}
              width={features[activeFeature].imageWidth}
              height={features[activeFeature].imageHeight}
              className="mx-auto max-h-[540px] w-auto rounded-3xl object-contain"
            />
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
