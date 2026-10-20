import Link from "next/link";
import Image from "next/image";

/**
 * Academy hero + course series (mirror: aimfox.com/academy).
 *
 * The mirror page built this series around recorded lessons for the
 * mirror product. Those recordings are not carried over. What remains
 * is the same shape — three modules, ten topics in order — rewritten
 * as a NxtSend syllabus: the hero is a static visual, lessons are
 * listed as curriculum items with no players, and a note on the page
 * states plainly that NxtSend Academy video lessons are in production.
 *
 * The right-hand panel of each module card shows the module's own
 * still image where the download contains one (modules 2 and 3) and
 * the card's glow gradient alone for module 1.
 */

interface AcademyLesson {
  number: number;
  title: string;
  description: string;
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
    title: "Foundations and account setup",
    description:
      "Connect your LinkedIn profile, find your way around the workspace, and choose daily limits that keep your activity steady and safe.",
    image: null,
    glow: "rgba(0,170,255,0.35)",
    tint: "rgba(0,170,255,0.16)",
    lessons: [
      {
        number: 1,
        title: "Linking your LinkedIn profile to NxtSend",
        description:
          "What to check before you connect, and how to confirm the link is active.",
      },
      {
        number: 2,
        title: "Finding your way around the workspace",
        description:
          "A tour of campaigns, inbox, contacts and settings, and where each task lives.",
      },
      {
        number: 3,
        title: "Choosing daily limits and safety preferences",
        description:
          "How limits work, why pacing matters, and how to pick a sensible starting point.",
      },
    ],
  },
  {
    title: "Planning and launching a campaign",
    description:
      "Define who you want to reach, write messages in your own voice, and build a sequence that is ready to launch.",
    image: "/images/academy/module-2.webp",
    glow: "rgba(255,110,26,0.35)",
    tint: "rgba(255,110,26,0.16)",
    lessons: [
      {
        number: 4,
        title: "Defining your audience and refining search filters",
        description:
          "Using role, company and location filters to build a focused prospect list.",
      },
      {
        number: 5,
        title: "Writing an opening message people want to answer",
        description:
          "Keeping connection notes short, specific and personal, without sounding scripted.",
      },
      {
        number: 6,
        title: "Building a follow-up sequence that stays polite",
        description:
          "Spacing your follow-ups, varying the wording, and knowing when to stop.",
      },
      {
        number: 7,
        title: "Launching your first campaign, step by step",
        description:
          "A final check of audience, messages and limits before you press start.",
      },
    ],
  },
  {
    title: "Handling replies and improving results",
    description:
      "Manage new replies, read your results clearly, and diagnose campaigns that have stalled.",
    image: "/images/academy/module-3.webp",
    glow: "rgba(0,170,255,0.35)",
    tint: "rgba(0,170,255,0.16)",
    lessons: [
      {
        number: 8,
        title: "Keeping on top of your inbox and new replies",
        description:
          "Sorting conversations, replying promptly, and moving interested prospects forward.",
      },
      {
        number: 9,
        title: "Reading campaign results without guesswork",
        description:
          "The key figures to watch, and what changes they usually point to.",
      },
      {
        number: 10,
        title: "Diagnosing a campaign that has slowed down",
        description:
          "Working through audience, message and timing checks to find the likely cause.",
      },
    ],
  },
];

export function AcademySeries() {
  return (
    <>
      {/* ──────────────────────────────────────────────────────────────── */}
      {/* HERO (dark rounded banner, static artwork, copy bottom-left)    */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <section className="px-2.5 pt-24 sm:pt-28">
        <div className="relative h-[548px] overflow-hidden rounded-5xl bg-black-900 p-2.5 md:h-[648px] md:p-4 xl:h-[700px] xl:rounded-8xl">
          <div className="relative flex size-full items-end overflow-hidden rounded-4xl">
            <Image
              src="/images/academy/module-2.webp"
              alt="NxtSend Academy course artwork"
              width={1280}
              height={720}
              priority
              className="absolute inset-0 size-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-r from-black-900/85 via-black-900/40 to-transparent" />
            <div className="absolute inset-0 bg-gradient-to-t from-black-900/95 via-black-900/45 to-transparent" />
            <div className="relative flex max-w-160 flex-col items-start p-8 md:p-14 xl:p-16">
              <span className="mb-2 text-13 font-semibold uppercase tracking-wide text-white/60">
                NxtSend Academy
              </span>
              <h1 className="mb-4 text-36 font-semibold text-white md:text-54">
                Build stronger outreach, one lesson at a time
              </h1>
              <p className="mb-6 text-white/80 md:text-18">
                A structured path through setting up NxtSend, finding the
                right audience, and running campaigns you can keep
                improving.
              </p>
              <Link
                href="#series-1"
                className="flex h-10.5 shrink-0 items-center justify-center rounded-full bg-black-900 px-5 text-base font-semibold whitespace-nowrap text-white transition-colors hover:bg-white hover:text-black-900"
              >
                Get started
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ──────────────────────────────────────────────────────────────── */}
      {/* COURSE SERIES (3 module cards, 10 syllabus lessons)             */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <section id="series-1">
        <div className="mx-auto flex w-full max-w-[1492px] flex-col px-4 py-8 md:px-6 md:py-10 xl:px-24">
          <p className="mb-4 text-center text-14 font-medium text-white/50 md:text-15">
            Ten lessons in three modules, taking you from first setup to
            steady, well-run campaigns.
          </p>
          <p className="mx-auto mb-8 max-w-2xl text-center text-14 font-medium text-white/50 md:text-15">
            NxtSend Academy video lessons are currently in production.
            The curriculum below is the syllabus for the series — it sets
            out, in order, the topics each lesson will cover.
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
                      <div
                        key={lesson.number}
                        className="-mx-2 flex items-start gap-x-4 rounded-xl px-2 py-3"
                      >
                        <span className="flex size-6 shrink-0 items-center justify-center rounded-full border border-white/20 text-12 font-semibold text-white/70">
                          {lesson.number}
                        </span>
                        <span className="flex-1">
                          <span className="block text-14 font-medium text-white/90 md:text-15">
                            {lesson.title}
                          </span>
                          <span className="mt-0.5 block text-13 font-medium text-white/50">
                            {lesson.description}
                          </span>
                        </span>
                      </div>
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
    </>
  );
}
