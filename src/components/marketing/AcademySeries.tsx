import Link from "next/link";
import Image from "next/image";

/**
 * Academy hero + course series.
 *
 * Three modules, ten topics in order, presented as a NxtSend
 * syllabus: the hero is a static native composition, lessons are
 * listed as curriculum items with no players, and a note on the page
 * states plainly that NxtSend Academy video lessons are in production.
 *
 * The right-hand panel of each module card carries a native visual
 * built from the module's own content — a curriculum stack for
 * module 2, a dark inbox mock for module 3 — and the card's glow
 * gradient alone for module 1.
 */

interface AcademyLesson {
  number: number;
  title: string;
  description: string;
}

interface AcademyModule {
  title: string;
  description: string;
  /** Native visual for the card's right panel; null = glow only. */
  visual: "curriculum" | "inbox" | null;
  /** Card glow (box-shadow / radial-gradient tint), as rgba. */
  glow: string;
  tint: string;
  lessons: AcademyLesson[];
}

const modules: AcademyModule[] = [
  {
    title: "Foundations and account setup",
    description:
      "Connect your LinkedIn profile, find your way around the workspace, and choose daily limits that keep your activity steady and safe.",
    visual: null,
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
    visual: "curriculum",
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
    visual: "inbox",
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

/* ── Native panel visuals (built from each module's own content) ─────── */

function CurriculumVisual({ lessons }: { lessons: AcademyLesson[] }) {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 bg-[linear-gradient(180deg,#05050f_0%,#1d1fc0_48%,#9db9ff_100%)]"
    >
      <div className="flex h-full flex-col items-center justify-center gap-2.5 p-6">
        {lessons.map((lesson) => (
          <div
            key={lesson.number}
            className="flex w-full max-w-80 items-center gap-3 rounded-2xl border border-white/25 bg-white/10 px-3.5 py-2.5 backdrop-blur-sm"
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-white/20 text-12 font-semibold text-white">
              {lesson.number}
            </span>
            <span className="text-13 leading-snug font-medium text-white">
              {lesson.title}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

const inboxRows = [
  { name: "Emily Johnson", photo: "/images/agents/emily-johnson.webp", unread: true },
  { name: "James Miller", photo: "/images/agents/james-miller.webp", unread: true },
  { name: "Olivia W.", photo: "/images/agents/olivia-w.webp", unread: false },
];

function InboxVisual() {
  return (
    <div
      aria-hidden="true"
      className="absolute inset-0 bg-[linear-gradient(160deg,#0b0b16_0%,#131328_55%,#1d1b4b_100%)]"
    >
      <div className="flex h-full items-center justify-center p-6">
        <div className="w-full max-w-80 overflow-hidden rounded-2xl border border-white/10 bg-black-900/80 shadow-2xl">
          <div className="flex items-center gap-1.5 border-b border-white/10 px-3.5 py-2.5">
            <span className="h-2 w-2 rounded-full bg-white/15" />
            <span className="h-2 w-2 rounded-full bg-white/15" />
            <span className="h-2 w-2 rounded-full bg-white/15" />
            <span className="ml-2 text-11 font-semibold text-white/70">
              Unified inbox
            </span>
          </div>
          <div className="divide-y divide-white/5">
            {inboxRows.map((row) => (
              <div key={row.name} className="flex items-center gap-3 px-3.5 py-3">
                <Image
                  src={row.photo}
                  alt=""
                  width={64}
                  height={64}
                  className="h-8 w-8 shrink-0 rounded-full object-cover object-top"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-12 font-semibold text-white">
                      {row.name}
                    </span>
                    {row.unread ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />
                    ) : null}
                  </div>
                  <div className="mt-1.5 h-1.5 w-4/5 rounded bg-white/15" />
                  <div className="mt-1 h-1.5 w-3/5 rounded bg-white/10" />
                </div>
              </div>
            ))}
          </div>
          <div className="border-t border-white/10 px-3.5 py-2.5">
            <div className="flex h-7 items-center rounded-full bg-white/5 px-3 text-11 text-white/35">
              Write a reply…
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function AcademySeries() {
  return (
    <>
      {/* ──────────────────────────────────────────────────────────────── */}
      {/* HERO (dark rounded banner, static artwork, copy bottom-left)    */}
      {/* ──────────────────────────────────────────────────────────────── */}
      <section className="px-2.5 pt-24 sm:pt-28">
        <div className="relative h-[548px] overflow-hidden rounded-5xl bg-black-900 p-2.5 md:h-[648px] md:p-4 xl:h-[700px] xl:rounded-8xl">
          <div className="relative flex size-full items-end overflow-hidden rounded-4xl">
            <div
              aria-hidden="true"
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(155deg, #05050f 0%, #101040 42%, #1d1fc0 78%, #9db9ff 125%)",
              }}
            />
            {/* Module cards composition — the syllabus itself, fanned
                over the banner's gradient. */}
            <div
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 right-6 hidden w-[21rem] -translate-y-1/2 flex-col gap-3.5 md:flex lg:right-14 lg:w-[24rem]"
            >
              {modules.map((mod, i) => (
                <div
                  key={mod.title}
                  className="rounded-3xl border border-white/20 bg-white/10 p-4 shadow-2xl backdrop-blur-md"
                  style={{
                    transform: `rotate(${[-2.5, 1.5, -1][i]}deg) translateX(${[0, 18, 6][i]}px)`,
                  }}
                >
                  <span className="text-11 font-semibold tracking-wide text-white/60 uppercase">
                    Module {i + 1} · {mod.lessons.length} lessons
                  </span>
                  <p className="mt-1 text-16 font-semibold text-white">
                    {mod.title}
                  </p>
                </div>
              ))}
            </div>
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
                <div className="relative h-64 shrink-0 md:h-auto md:w-2/5">
                  <div className="relative size-full overflow-hidden">
                    {mod.visual === "curriculum" ? (
                      <CurriculumVisual lessons={mod.lessons} />
                    ) : mod.visual === "inbox" ? (
                      <InboxVisual />
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
