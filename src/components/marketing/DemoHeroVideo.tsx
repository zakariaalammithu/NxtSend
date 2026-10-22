import Image from "next/image";
import { Check, Inbox, Send, Target } from "lucide-react";

/**
 * Hero visual for the demo page.
 *
 * The slot originally held a click-to-play product video. That
 * recording is not carried over: this slot now shows a static,
 * native preview composition of the workspace instead — a miniature
 * interface in the product's own dark UI language, labelled as a
 * preview. The component name and export are unchanged so the page
 * layout slot stays the same, and the slot can take an
 * owner-supplied NxtSend recording later if one is produced.
 */

const campaignRows = [
  { gradient: "from-violet-500 to-indigo-600", width: "w-4/5" },
  { gradient: "from-sky-400 to-blue-600", width: "w-3/5" },
  { gradient: "from-orange-400 to-rose-500", width: "w-2/3" },
];

const inboxRows = [
  { name: "Emily Johnson", photo: "/images/agents/emily-johnson.webp", unread: true },
  { name: "James Miller", photo: "/images/agents/james-miller.webp", unread: true },
  { name: "Olivia W.", photo: "/images/agents/olivia-w.webp", unread: false },
];

function WorkspacePreview() {
  return (
    <div
      role="img"
      aria-label="Preview of the NxtSend workspace — campaigns, inbox and follow-ups side by side"
      className="relative flex aspect-[1200/788] w-full flex-col overflow-hidden bg-[#0d0d12] text-left"
    >
      {/* Window chrome */}
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-3">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
          <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
        </span>
        <span className="rounded-full bg-white/5 px-2.5 py-0.5 text-11 text-white/40">
          app.nxtsend.com
        </span>
        <span className="ml-auto rounded-full bg-purple-500/15 px-2 py-0.5 text-10 font-bold tracking-wider text-purple-300 uppercase">
          Interface preview
        </span>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3.5 sm:grid-cols-3 sm:gap-4 sm:p-5">
        {/* Campaigns */}
        <div className="flex flex-col rounded-2xl border border-white/[0.07] bg-white/[0.03] p-3.5 sm:p-4">
          <div className="flex items-center gap-2 text-12 font-bold tracking-wider text-white/50 uppercase">
            <Target className="h-4 w-4 text-purple-300" />
            Campaigns
          </div>
          <div className="mt-3.5 space-y-2.5">
            {campaignRows.map((row) => (
              <div
                key={row.gradient}
                className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2.5"
              >
                <span
                  className={`h-7 w-7 shrink-0 rounded-lg bg-gradient-to-br ${row.gradient}`}
                />
                <span className="min-w-0 flex-1 space-y-1.5">
                  <span className={`block h-1.5 rounded bg-white/25 ${row.width}`} />
                  <span className="block h-1.5 w-2/5 rounded bg-white/10" />
                </span>
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-400" />
              </div>
            ))}
          </div>
          <div className="mt-auto hidden items-center gap-2 pt-3 text-12 font-semibold text-white/60 sm:flex">
            <Send className="h-3.5 w-3.5 text-purple-300" />
            Sequences run on schedule
          </div>
        </div>

        {/* Inbox */}
        <div className="hidden flex-col rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 sm:flex">
          <div className="flex items-center gap-2 text-12 font-bold tracking-wider text-white/50 uppercase">
            <Inbox className="h-4 w-4 text-purple-300" />
            Inbox
          </div>
          <div className="mt-3.5 space-y-2.5">
            {inboxRows.map((row) => (
              <div
                key={row.name}
                className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2.5"
              >
                <Image
                  src={row.photo}
                  alt=""
                  width={56}
                  height={56}
                  className="h-7 w-7 shrink-0 rounded-full object-cover object-top"
                />
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2">
                    <span className="truncate text-12 font-semibold text-white">
                      {row.name}
                    </span>
                    {row.unread ? (
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-purple-400" />
                    ) : null}
                  </span>
                  <span className="mt-1.5 block h-1.5 w-4/5 rounded bg-white/15" />
                </span>
              </div>
            ))}
          </div>
          <div className="mt-auto flex items-center rounded-full bg-white/5 px-3.5 py-2 text-11 text-white/35">
            Write a reply…
          </div>
        </div>

        {/* Follow-ups */}
        <div className="hidden flex-col rounded-2xl border border-white/[0.07] bg-white/[0.03] p-4 sm:flex">
          <div className="flex items-center gap-2 text-12 font-bold tracking-wider text-white/50 uppercase">
            <Send className="h-4 w-4 text-purple-300" />
            Follow-ups
          </div>
          <div className="mt-3.5 space-y-2.5">
            {[
              { label: "Connection note", done: true },
              { label: "First follow-up", done: true },
              { label: "Second follow-up", done: false },
            ].map((step) => (
              <div
                key={step.label}
                className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2.5"
              >
                <span
                  className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    step.done
                      ? "bg-emerald-500 text-white"
                      : "border border-white/20 text-transparent"
                  }`}
                >
                  <Check className="h-3 w-3" />
                </span>
                <span className="text-12 font-medium text-white/80">
                  {step.label}
                </span>
              </div>
            ))}
          </div>
          <div className="mt-auto space-y-1.5 pt-3">
            <div className="h-1.5 w-full rounded bg-white/10" />
            <div className="h-1.5 w-3/5 rounded bg-white/10" />
          </div>
        </div>
      </div>
    </div>
  );
}

export function DemoHeroVideo() {
  return (
    <figure className="relative flex w-full max-w-[1200px] flex-col items-center justify-center overflow-hidden rounded-3xl border border-white bg-black-100 shadow-2xl backdrop-blur-sm md:rounded-7xl">
      <WorkspacePreview />
      <figcaption className="w-full bg-black-900 px-6 py-4 text-center text-14 font-medium text-white/80">
        A preview of the NxtSend workspace — campaigns, inbox and
        follow-ups side by side.
      </figcaption>
    </figure>
  );
}
