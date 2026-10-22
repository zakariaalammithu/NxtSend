import Image from "next/image";
import {
  ArrowRight,
  Heart,
  MessageCircle,
  Play,
  UserPlus,
} from "lucide-react";

/**
 * "Built to start conversations" bento (P6 rework).
 *
 * Same section, grid, card sizes, titles and chips as before — but the
 * baked artwork is retired. Each card is now a NxtSend-styled
 * composition built in JSX/CSS: the owner's supplied headshots
 * (public/images/people/) plus native UI elements (voice-note player,
 * language/timezone rows, sequence steps, A/B variants, a message
 * thread). Nothing here is a screenshot of another product.
 */

const chipClass =
  "rounded-full border border-white/25 bg-black-900/35 px-3 py-1 text-12 font-semibold text-white backdrop-blur-md";

function CardHeader({
  title,
  chips,
}: {
  title: string;
  chips: readonly string[];
}) {
  return (
    <div className="relative z-10 flex flex-col items-center px-6 pt-5 pb-1 text-center sm:p-8">
      <h3 className="max-w-[340px] text-24 font-bold leading-snug text-white sm:text-28">
        {title}
      </h3>
      <div className="mt-3 flex flex-wrap justify-center gap-2 sm:mt-4">
        {chips.map((chip) => (
          <span key={chip} className={chipClass}>
            {chip}
          </span>
        ))}
      </div>
    </div>
  );
}

function Stage({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-1 items-center justify-center px-5 pb-3 sm:px-8 sm:pb-6">
      {children}
    </div>
  );
}

const glassPanel =
  "w-full max-w-md rounded-3xl bg-white/10 p-4 shadow-2xl ring-1 ring-white/15 backdrop-blur-md sm:p-5";

/* ── Card 2 visual: voice-note player ─────────────────────────────────── */
const WAVEFORM = [10, 16, 22, 13, 26, 18, 12, 24, 28, 16, 21, 11, 18, 25, 14, 22, 12, 17, 20, 10];

function VoiceNoteVisual() {
  return (
    <div className={glassPanel}>
      <div className="flex items-center gap-3">
        <Image
          src="/images/people/emily-davidson.jpg"
          alt="Emily Davidson"
          width={96}
          height={96}
          className="h-12 w-12 shrink-0 rounded-full object-cover object-top ring-2 ring-white/40"
        />
        <div className="min-w-0 leading-tight">
          <div className="truncate text-14 font-bold text-white">Emily D.</div>
          <div className="text-12 text-white/60">Voice note · Email attachment</div>
        </div>
        <span className="ml-auto flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white text-black-900 shadow-lg">
          <Play className="ml-0.5 h-4 w-4 fill-current" />
        </span>
      </div>
      <div className="mt-4 flex h-8 items-center gap-[3px]" aria-hidden="true">
        {WAVEFORM.map((h, i) => (
          <span
            key={i}
            className={`w-[3px] rounded-full ${i < 8 ? "bg-purple-300" : "bg-white/30"}`}
            style={{ height: `${h}px` }}
          />
        ))}
        <span className="ml-2 text-12 font-semibold text-white/80">0:42</span>
      </div>
      <p className="mt-3 border-t border-white/10 pt-3 text-12 leading-relaxed text-white/70">
        Transcript: “Hi Sarah — quick hello from our team. We help agencies
        run outreach from several profiles without losing a single reply…”
      </p>
    </div>
  );
}

/* ── Card 3 visual: languages + timezones ─────────────────────────────── */
const LANGUAGE_ROWS = [
  { photo: "/images/people/paola-marinone.jpg", name: "Paola M.", lang: "ES · Español", place: "Madrid · UTC+1" },
  { photo: "/images/people/misti-morgenstern.jpg", name: "Misti M.", lang: "FR · Français", place: "Lyon · UTC+1" },
  { photo: "/images/people/michael-jessimy.jpg", name: "Michael J.", lang: "DE · Deutsch", place: "Berlin · UTC+1" },
] as const;

function LanguageVisual() {
  return (
    <div className={glassPanel}>
      <ul className="divide-y divide-white/10">
        {LANGUAGE_ROWS.map((row) => (
          <li key={row.name} className="flex items-center gap-3 py-2.5 first:pt-0 last:pb-0">
            <Image
              src={row.photo}
              alt={row.name}
              width={80}
              height={80}
              className="h-10 w-10 shrink-0 rounded-full object-cover object-top ring-2 ring-white/30"
            />
            <div className="min-w-0 flex-1 leading-tight">
              <div className="truncate text-13 font-bold text-white">{row.name}</div>
              <div className="text-11 text-white/55">{row.place}</div>
            </div>
            <span className="shrink-0 rounded-full bg-white/15 px-2.5 py-1 text-11 font-semibold text-white">
              {row.lang}
            </span>
            <span className="hidden shrink-0 text-11 text-white/55 sm:block">Sends 09:00 local</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ── Card 4 visual: audience stack + sequence steps ───────────────────── */
const STACK = [
  { src: "/images/people/austin-smith.jpg", name: "Austin Smith" },
  { src: "/images/people/brandon-pindulic.jpg", name: "Brandon Pindulic" },
  { src: "/images/people/robert-tas.jpg", name: "Robert Tas" },
  { src: "/images/people/bruce-dinger.jpg", name: "Bruce Dinger" },
  { src: "/images/people/michael-kokernak.jpg", name: "Michael Kokernak" },
] as const;

const STEP_FLOW = [
  { icon: UserPlus, label: "Connection request" },
  { icon: MessageCircle, label: "Follow-up message" },
  { icon: Heart, label: "Reaction" },
] as const;

function CampaignShapeVisual() {
  return (
    <div className={glassPanel}>
      <div className="flex items-center gap-3">
        <div className="flex -space-x-2.5">
          {STACK.map((person) => (
            <Image
              key={person.name}
              src={person.src}
              alt={person.name}
              width={72}
              height={72}
              className="h-9 w-9 rounded-full object-cover object-top ring-2 ring-[#241546]"
            />
          ))}
        </div>
        <div className="leading-tight">
          <div className="text-13 font-bold text-white">Campaign audience</div>
          <div className="text-11 text-white/55">One list, every goal type</div>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-white/10 pt-3 sm:mt-4 sm:pt-4">
        {STEP_FLOW.map((step, i) => (
          <span key={step.label} className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-11 font-semibold text-white sm:py-1.5">
              <step.icon className="h-3.5 w-3.5" />
              {step.label}
            </span>
            {i < STEP_FLOW.length - 1 && (
              <ArrowRight className="h-3.5 w-3.5 text-white/50" />
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Card 5 visual: A/B variants ──────────────────────────────────────── */
function AbTestVisual() {
  return (
    <div className="grid w-full max-w-md grid-cols-2 gap-3">
      <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/15 backdrop-blur-md">
        <div className="flex items-center justify-between">
          <span className="text-11 font-bold uppercase tracking-wider text-white/70">Variant A</span>
          <span className="rounded-full bg-gradient-brand px-2 py-0.5 text-10 font-bold text-white">Winner</span>
        </div>
        <Image
          src="/images/people/bill-bradford.jpg"
          alt="Dr. Bill Bradford"
          width={80}
          height={80}
          className="mt-3 h-10 w-10 rounded-full object-cover object-top ring-2 ring-white/30"
        />
        <div className="mt-3 space-y-1.5" aria-hidden="true">
          <div className="h-1.5 w-full rounded-full bg-white/25" />
          <div className="h-1.5 w-4/5 rounded-full bg-white/25" />
        </div>
        <div className="mt-4" aria-hidden="true">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/15">
            <div className="h-full w-[68%] rounded-full bg-purple-300" />
          </div>
          <div className="mt-1.5 text-11 text-white/60">Replies · 68%</div>
        </div>
      </div>
      <div className="rounded-3xl bg-white/5 p-4 ring-1 ring-white/10 backdrop-blur-md">
        <span className="text-11 font-bold uppercase tracking-wider text-white/50">Variant B</span>
        <div className="mt-3 flex h-10 items-center" aria-hidden="true">
          <div className="space-y-1.5">
            <div className="h-1.5 w-16 rounded-full bg-white/20" />
            <div className="h-1.5 w-12 rounded-full bg-white/20" />
          </div>
        </div>
        <div className="mt-3 space-y-1.5" aria-hidden="true">
          <div className="h-1.5 w-full rounded-full bg-white/15" />
          <div className="h-1.5 w-3/5 rounded-full bg-white/15" />
        </div>
        <div className="mt-4" aria-hidden="true">
          <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-[41%] rounded-full bg-white/40" />
          </div>
          <div className="mt-1.5 text-11 text-white/45">Replies · 41%</div>
        </div>
      </div>
    </div>
  );
}

/* ── Card 1 visual: personalised message thread ───────────────────────── */
function MessageThreadVisual() {
  return (
    <div className="absolute inset-x-5 top-4 bottom-[150px] sm:inset-x-9 sm:top-9 sm:bottom-[140px] lg:left-auto lg:w-[640px]">
      <div className="ml-auto flex max-h-full w-full max-w-[640px] flex-col justify-start overflow-hidden rounded-3xl bg-white/10 p-3 shadow-2xl ring-1 ring-white/15 backdrop-blur-md sm:p-5">
        <div className="flex items-center gap-3">
          <Image
            src="/images/people/robert-tas.jpg"
            alt="Robert Tas"
            width={80}
            height={80}
            className="h-10 w-10 rounded-full object-cover object-top ring-2 ring-white/30"
          />
          <div className="leading-tight">
            <div className="text-13 font-bold text-white">Robert T.</div>
            <div className="text-11 text-white/55">Sequence · Step 2 of 5</div>
          </div>
        </div>
        <div className="mt-3 max-w-[85%] self-start rounded-2xl rounded-tl-md bg-white/15 px-3.5 py-2.5 text-12 leading-relaxed text-white/90 sm:mt-4">
          Thanks for connecting! What is your team using for outbound today?
        </div>
        <div className="mt-2.5 max-w-[85%] self-end rounded-2xl rounded-tr-md bg-gradient-brand px-3.5 py-2.5 text-12 leading-relaxed text-white shadow-lg">
          Hi{" "}
          <span className="rounded-md bg-white/25 px-1 py-0.5 font-semibold">{"{first_name}"}</span>{" "}
          — noticed{" "}
          <span className="rounded-md bg-white/25 px-1 py-0.5 font-semibold">{"{company}"}</span>{" "}
          is growing its sales team. We help teams like yours start more
          conversations from the profiles they already have.
        </div>
      </div>
    </div>
  );
}

export function BentoFeatures() {
  return (
    <section className="relative border-t border-black-700/80 bg-black-800/30 py-12 lg:py-20">
      <div className="pointer-events-none absolute top-1/2 left-0 h-[400px] w-[400px] -translate-y-1/2 rounded-full bg-purple-600/10 blur-[130px]" />
      <div className="section-container relative z-10">
        <div className="text-center">
          <h2 className="text-36 font-bold tracking-tight text-white sm:text-48">
            Built to start conversations, not just send requests
          </h2>
        </div>

        <div className="mx-auto mt-8 grid max-w-6xl grid-cols-1 gap-5 lg:mt-12 lg:grid-cols-12 lg:gap-6">
          {/* Card 1 — wide */}
          <div className="group relative h-[420px] overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#2a1650] via-[#170b33] to-black-900 shadow-2xl ring-1 ring-white/10 sm:h-[460px] lg:col-span-12 lg:h-[480px]">
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.12]"
              style={{
                backgroundImage:
                  "radial-gradient(rgba(255, 255, 255, 0.35) 1px, transparent 1px)",
                backgroundSize: "26px 26px",
              }}
            />
            <MessageThreadVisual />
            <div className="absolute bottom-0 left-0 z-10 p-7 sm:p-9">
              <h3 className="max-w-[300px] text-24 font-bold leading-snug text-white sm:text-28">
                Messages that read like a person wrote them
              </h3>
              <div className="mt-4 flex flex-wrap gap-2">
                {["AI personalisation", "Custom variables", "Attachments"].map((chip) => (
                  <span key={chip} className={chipClass}>
                    {chip}
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Card 2 — voice notes (narrow) */}
          <div className="group relative flex h-[400px] flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#3b1470] via-[#1d0b40] to-black-900 shadow-2xl ring-1 ring-white/10 lg:col-span-5 lg:h-[460px]">
            <CardHeader title="Get noticed in a busy inbox" chips={["Voice notes"]} />
            <Stage>
              <VoiceNoteVisual />
            </Stage>
          </div>

          {/* Card 3 — language / timezone (medium) */}
          <div className="group relative flex h-[400px] flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#123a6b] via-[#0d1440] to-black-900 shadow-2xl ring-1 ring-white/10 lg:col-span-7 lg:h-[460px]">
            <CardHeader
              title="Their language, their timezone"
              chips={["Automatic translation", "Timezone-aware sending"]}
            />
            <Stage>
              <LanguageVisual />
            </Stage>
          </div>

          {/* Card 4 — campaign shapes (medium) */}
          <div className="group relative flex h-[400px] flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#4a154b] via-[#20093a] to-black-900 shadow-2xl ring-1 ring-white/10 lg:col-span-7 lg:h-[460px]">
            <CardHeader
              title="A campaign shape for every goal"
              chips={["Connection requests", "Message sequences", "Reactions"]}
            />
            <Stage>
              <CampaignShapeVisual />
            </Stage>
          </div>

          {/* Card 5 — A/B testing (narrow) */}
          <div className="group relative flex h-[400px] flex-col overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#173a2e] via-[#0c1f33] to-black-900 shadow-2xl ring-1 ring-white/10 lg:col-span-5 lg:h-[460px]">
            <CardHeader title="Test variations, keep what works" chips={["A/B testing"]} />
            <Stage>
              <AbTestVisual />
            </Stage>
          </div>
        </div>
      </div>
    </section>
  );
}
