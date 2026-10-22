"use client";

/**
 * CopyButton — the admin-wide copy control (Integration Hub, P7 Stage C).
 *
 * One honest copy behaviour everywhere: the value is written to the
 * clipboard (async Clipboard API, with the legacy textarea fallback for
 * non-secure contexts), success is confirmed only after the write actually
 * resolves, and a failure shows a failure state — never a fake success.
 *
 * `text` may be a resolver function so callers can fetch the value first
 * (e.g. the Hub's audited credential-copy endpoint) and only then write it.
 * If the resolver throws (API error, demo-mode 503, revoked 409), the
 * button surfaces that error message via `onError` and shows the failure
 * state without touching the clipboard.
 */

import * as React from "react";
import { Check, Copy, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

/** Injectable clipboard behaviour so the write path is unit-testable. */
export interface ClipboardDeps {
  writeText?: (text: string) => Promise<void>;
  legacyCopy?: (text: string) => boolean;
}

function defaultWriteText(text: string): Promise<void> {
  if (
    typeof navigator !== "undefined" &&
    navigator.clipboard &&
    typeof navigator.clipboard.writeText === "function"
  ) {
    return navigator.clipboard.writeText(text);
  }
  return Promise.reject(new Error("Clipboard API unavailable"));
}

function defaultLegacyCopy(text: string): boolean {
  if (typeof document === "undefined") return false;
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/**
 * Copy `text` to the clipboard. Resolves true ONLY when a write actually
 * succeeded (Clipboard API first, legacy fallback second).
 */
export async function copyTextToClipboard(
  text: string,
  deps: ClipboardDeps = {}
): Promise<boolean> {
  if (typeof text !== "string" || text === "") return false;
  const writeText = deps.writeText ?? defaultWriteText;
  try {
    await writeText(text);
    return true;
  } catch {
    const legacy = deps.legacyCopy ?? defaultLegacyCopy;
    try {
      return legacy(text);
    } catch {
      return false;
    }
  }
}

export type CopyTextSource = string | (() => string | Promise<string>);

export interface CopyButtonProps {
  /** The text to copy, or an async resolver producing it. */
  text: CopyTextSource;
  label?: string;
  copiedLabel?: string;
  failedLabel?: string;
  className?: string;
  disabled?: boolean;
  /** Called with the API/resolver error message when the resolver throws. */
  onError?: (message: string) => void;
  /** Called after a verified-successful clipboard write. */
  onCopied?: () => void;
  title?: string;
}

type CopyState = "idle" | "busy" | "copied" | "failed";

export function CopyButton({
  text,
  label = "Copy",
  copiedLabel = "Copied",
  failedLabel = "Copy failed",
  className,
  disabled,
  onError,
  onCopied,
  title,
}: CopyButtonProps) {
  const [state, setState] = React.useState<CopyState>("idle");
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  React.useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    []
  );

  const resetSoon = React.useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 2000);
  }, []);

  const handleClick = async () => {
    if (state === "busy") return;
    setState("busy");
    try {
      const value = typeof text === "function" ? await text() : text;
      const ok = await copyTextToClipboard(value);
      if (ok) {
        setState("copied");
        onCopied?.();
      } else {
        setState("failed");
        onError?.(
          "Copy failed — your browser blocked clipboard access. Select the text and copy it manually."
        );
      }
    } catch (err) {
      setState("failed");
      onError?.(
        err instanceof Error ? err.message : "Copy failed. Please try again."
      );
    }
    resetSoon();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || state === "busy"}
      title={
        state === "failed"
          ? "Copy failed — select the text and copy it manually."
          : title
      }
      className={cn(
        "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-12 font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
        state === "copied"
          ? "border-emerald-500/40 bg-emerald-950/30 text-emerald-300"
          : state === "failed"
            ? "border-rose-500/40 bg-rose-950/30 text-rose-300"
            : "border-black-600 bg-black-800 text-black-200 hover:border-black-500 hover:text-white",
        className
      )}
    >
      {state === "copied" ? (
        <Check className="h-3.5 w-3.5" />
      ) : state === "failed" ? (
        <TriangleAlert className="h-3.5 w-3.5" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
      {state === "copied"
        ? copiedLabel
        : state === "failed"
          ? failedLabel
          : label}
    </button>
  );
}
