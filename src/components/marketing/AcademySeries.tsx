"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { X } from "lucide-react";

/**
 * Academy hero + course series (mirror: aimfox.com/academy).
 *
 * Every heading, module title, description, lesson title and duration
 * below is copied verbatim from the downloaded mirror (ZIP 3,
 * "4. aimfox.com.academy/www.aimfox.com/academy.html"), including the
 * lesson video IDs from the mirror's serialized page state — in the
 * mirror, clicking the hero play button or a lesson opens that lesson's
 * video in a player overlay, reproduced here with a privacy-enhanced
 * (youtube-nocookie) embed. No Aimfox tracking scripts/IDs and no
 * aimfox.com links are carried over.
 *
 * In the mirror, the right-hand panel of each module card is an animated
 * iframe served from aimfox.com (/academy/module-N-animation.html) —
 * neither the animation pages nor module 1's still image
 * (/images/academy/module-1.webp) are part of the download, so the panel
 * shows the module's own still image where the mirror download contains
 * it (modules 2 and 3) and the card's glow gradient alone for module 1.
 */

const HERO_VIDEO = {
  title: "Welcome to Aimfox Academy",
  videoId: "VHpm6VjEVZ8",
};

interface AcademyLesson {
  number: number;
  title: string;
  duration: string;
  videoId: string;
}

interface AcademyModule {
  title: string;
  description: string;
  /** Still for the card's right panel; null when not in the download. */
  image: string | null;
  /** Mirror card glow (box-shadow / radial-gradient tint), verbatim rgba. */
  glow: string;
  tint: string;
  lessons: AcademyLesson[];
}

const modules: AcademyModule[] = [
  {
    title: "Getting Started",
    description:
      "Connect your LinkedIn account, get familiar with the dashboard, and set safe sending limits before you launch anything.",
    image: null,
    glow: "rgba(0,170,255,0.35)",
    tint: "rgba(0,170,255,0.16)",
    lessons: [
      {
        number: 1,
        title: "How to connect your LinkedIn account to Aimfox",
        duration: "3–4 min",
        videoId: "GVdt5vaSYx8",
      },
      {
        number: 2,
        title: "Aimfox dashboard walkthrough: where everything is",
        duration: "4–5 min",
        videoId: "AY7w2rvKOFk",
      },
      {
        number: 3,
        title: "How to set your daily limits and safety settings",
        duration: "2–3 min",
        videoId: "48TcFYaMFmQ",
      },
    ],
  },
  {
    title: "Building Your First Campaign",
    description:
      "Define your audience, write outreach that gets replies, and launch your first campaign end to end.",
    image: "/images/academy/module-2.webp",
    glow: "rgba(255,110,26,0.35)",
    tint: "rgba(255,110,26,0.16)",
    lessons: [
      {
        number: 4,
        title: "How to define your target audience and set search filters",
        duration: "4–5 min",
        videoId: "9iqwa8BtM4Q",
      },
      {
        number: 5,
        title: "How to write a connection request that gets accepted",
        duration: "3–4 min",
        videoId: "ixny-b5gRaw",
      },
      {
        number: 6,
        title: "How to build your follow-up message sequence",
        duration: "4–5 min",
        videoId: "gUB8eChLVac",
      },
      {
        number: 7,
        title: "How to launch your first campaign (full walkthrough)",
        duration: "5–6 min",
        videoId: "WUqMcLUs-Ko",
      },
    ],
  },
  {
    title: "Managing Replies and Results",
    description:
      "Handle incoming replies, read your analytics, and troubleshoot campaigns that aren't converting.",
    image: "/images/academy/module-3.webp",
    glow: "rgba(0,170,255,0.35)",
    tint: "rgba(0,170,255,0.16)",
    lessons: [
      {
        number: 8,
        title: "How to manage your inbox and handle replies in Aimfox",
        duration: "3–4 min",
        videoId: "Mhdid4yuJE0",
      },
      {
        number: 9,
        title: "How to read your campaign analytics",
        duration: "3–4 min",
        videoId: "Y8YjR0lb3xo",
      },
      {
        number: 10,
        title: "How to troubleshoot a campaign that is not performing",
        duration: "3–4 min",
        videoId: "HFnRgsx_iWc",
      },
    ],
  },
];

/** Play-circle glyph, path copied from the mirror's own icon set. */
function PlayCircleIcon({ className }: { className?: string }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="currentColor"
      viewBox="0 0 256 256"
      className={className}
      aria-hidden="true"
    >
      <path d="M128 24a104 104 0 1 0 104 104A104.11 104.11 0 0 0 128 24m0 192a88 88 0 1 1 88-88 88.1 88.1 0 0 1-88 88m48.24-94.78-64-40A8 8 0 0 0 100 88v80a8 8 0 0 0 12.24 6.78l64-40a8 8 0 0 0 0-13.56M116 153.57v-51.14L156.91 128Z" />
    </svg>
  );
}

interface ActiveVideo {
  title: string;
  videoId: string;
}

export function AcademySeries() {
  const [active, setActive] = useState<ActiveVideo | null>(null);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setActive(null);
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [active]);

  return (
    <>
      {/* ──────────────────────────────────────────────────────────────── */}
      {/* HERO (mirror: dark rounded banner over the intro video          */}
      {/* thumbnail, play button opens the video, copy bottom-left)       */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <section className="px-2.5 pt-24 sm:pt-28">
        <div className="relative h-[548px] overflow-hidden rounded-5xl bg-black-900 p-2.5 md:h-[648px] md:p-4 xl:h-[700px] xl:rounded-8xl">
          <div className="relative flex size-full items-end overflow-hidden rounded-4xl">
            <Image
              src="/images/academy/hero-video.jpg"
              alt="Welcome to Aimfox Academy"
              width={1280}
              height={720}
              priority
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black-900/95 via-black-900/20 to-transparent" />
            <button
              type="button"
              aria-label="Play video: Welcome to Aimfox Academy"
              onClick={() => setActive(HERO_VIDEO)}
              className="absolute left-1/2 top-[38%] size-20 -translate-x-1/2 -translate-y-1/2 cursor-pointer md:size-28"
            >
              <PlayCircleIcon className="size-full text-white drop-shadow-[0_2px_12px_rgba(0,0,0,0.5)] transition-transform hover:scale-105" />
            </button>
            <div className="pointer-events-none relative flex max-w-160 flex-col items-start p-8 md:p-14 xl:p-16">
              <span className="mb-2 text-13 font-semibold uppercase tracking-wide text-white/60">
                Aimfox Academy
              </span>
              <h1 className="mb-4 text-36 font-semibold text-white md:text-54">
                Level up your outreach
              </h1>
              <p className="mb-6 text-white/80 md:text-18">
                Guides, videos, and resources to help you scale your LinkedIn
                outreach faster.
              </p>
              <Link
                href="#series-1"
                className="pointer-events-auto flex h-10.5 shrink-0 items-center justify-center rounded-full bg-black-900 px-5 text-base font-semibold whitespace-nowrap text-white transition-colors hover:bg-white hover:text-black-900"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* COURSE SERIES (mirror: 3 module cards, 10 lessons)              */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <section id="series-1">
        <div className="mx-auto flex w-full max-w-[1492px] flex-col px-4 py-8 md:px-6 md:py-10 xl:px-24">
          <p className="mb-8 text-center text-14 font-medium text-white/50 md:text-15">
            10 lessons across 3 modules to take you from setup to scale.
          </p>
          <div className="flex flex-col gap-y-8 md:gap-y-10">
            {modules.map((mod, moduleIndex) => (
              <div
                key={mod.title}
                style={{
                  boxShadow: `-24px 24px 80px -20px ${mod.glow}`,
                  backgroundImage: `radial-gradient(120% 120% at 0% 100%, ${mod.tint}, transparent 60%)`,
                }}
                className="flex flex-col overflow-hidden rounded-3xl border border-white/10 md:flex-row"
              >
                <div className="flex flex-1 flex-col p-6 md:p-8">
                  <span className="mb-2 text-13 font-semibold uppercase tracking-wide text-white/40">
                    Module {moduleIndex + 1}
                  </span>
                  <h3 className="mb-2 text-[22px] leading-7 font-bold text-white md:text-24">
                    {mod.title}
                  </h3>
                  <p className="mb-6 text-14 font-medium text-white/60 md:text-15">
                    {mod.description}
                  </p>
                  <div className="flex flex-col divide-y divide-white/10">
                    {mod.lessons.map((lesson) => (
                      <button
                        key={lesson.number}
                        type="button"
                        onClick={() =>
                          setActive({
                            title: lesson.title,
                            videoId: lesson.videoId,
                          })
                        }
                        className="-mx-2 flex cursor-pointer items-center gap-x-4 rounded-xl px-2 py-3 text-left transition-colors hover:bg-white/5"
                      >
                        <PlayCircleIcon className="size-6 shrink-0 text-white/70" />
                        <span className="flex-1 text-14 font-medium text-white/90 md:text-15">
                          {lesson.title}
                        </span>
                        <span className="shrink-0 text-13 whitespace-nowrap text-white/40">
                          {lesson.duration}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
                <div className="relative h-56 shrink-0 md:h-auto md:w-2/5">
                  <div className="relative size-full overflow-hidden">
                    {mod.image ? (
                      <Image
                        src={mod.image}
                        alt=""
                        fill
                        sizes="(min-width: 768px) 40vw, 100vw"
                        className="object-cover"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* VIDEO PLAYER (mirror: clicking a lesson or the hero play        */}
      {/* button opens the lesson video in an overlay player)             */}
      {/* ──────────────────────────────────────────────────────────────── */}
      {active ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
          onClick={() => setActive(null)}
          role="dialog"
          aria-modal="true"
          aria-label={active.title}
        >
          <div
            className="w-full max-w-4xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="text-16 font-semibold text-white">{active.title}</p>
              <button
                type="button"
                aria-label="Close video"
                onClick={() => setActive(null)}
                className="flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full border border-white/20 text-white/70 transition-colors hover:bg-white/10 hover:text-white"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="aspect-video w-full overflow-hidden rounded-2xl bg-black">
              <iframe
                src={`https://www.youtube-nocookie.com/embed/${active.videoId}?autoplay=1&rel=0`}
                title={active.title}
                className="size-full"
                allow="accelerometer; autoplay; encrypted-media; picture-in-picture"
                allowFullScreen
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
