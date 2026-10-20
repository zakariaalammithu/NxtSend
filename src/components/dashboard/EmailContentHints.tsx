"use client";

/**
 * Deliverability hints under an email composing surface.
 *
 * Renders the heuristic hints from src/lib/email/content-lint.ts.
 * Rules of the presentation: hints are dismissible, they never block
 * or disable sending, and the copy says plainly that they are
 * heuristics — not a spam score and not an inbox-placement promise.
 */

import { useMemo, useState } from "react";
import { lintEmailContent } from "@/lib/email/content-lint";

export default function EmailContentHints({
  subject,
  body,
  context = "campaign",
  testId = "email-content-hints",
}: {
  subject?: string;
  body?: string;
  context?: "campaign" | "reply";
  testId?: string;
}) {
  const hints = useMemo(
    () => lintEmailContent({ subject, body, context }),
    [subject, body, context]
  );
  const [dismissed, setDismissed] = useState<ReadonlySet<string>>(new Set());
  const visible = hints.filter((h) => !dismissed.has(h.id));

  if (visible.length === 0) return null;

  return (
    <div
      data-testid={testId}
      className="rounded-xl border border-amber-400/25 bg-amber-400/5 p-3"
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold text-amber-200">
          Deliverability hints ({visible.length})
        </span>
        <button
          type="button"
          onClick={() => setDismissed(new Set(hints.map((h) => h.id)))}
          className="text-[11px] font-medium text-slate-400 underline-offset-2 hover:text-slate-200 hover:underline"
        >
          Dismiss all
        </button>
      </div>
      <p className="mt-1 text-[11px] leading-relaxed text-slate-400">
        Heuristic only — these never block sending, and following them
        cannot guarantee inbox placement. Content is one small factor;
        domain authentication and sender reputation matter more.
      </p>
      <ul className="mt-2 space-y-1.5">
        {visible.map((hint) => (
          <li
            key={hint.id}
            data-testid={`hint-${hint.id}`}
            className="flex items-start gap-2 text-xs leading-relaxed text-amber-100/90"
          >
            <span className="flex-1">{hint.message}</span>
            <button
              type="button"
              aria-label="Dismiss hint"
              onClick={() =>
                setDismissed((prev) => new Set(prev).add(hint.id))
              }
              className="shrink-0 rounded px-1 text-slate-400 hover:text-white"
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
