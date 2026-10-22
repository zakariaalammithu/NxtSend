"use client";

/** Integration Hub — small presentational pieces shared by the Hub pages. */

import * as React from "react";
import { TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";
import { Modal } from "@/components/ui/Modal";
import type {
  HubCredentialEnvironment,
  HubCredentialStatus,
  HubIntegrationStatus,
} from "@/lib/integration-hub/hub-core";
import {
  CREDENTIAL_ENV_META,
  CREDENTIAL_STATUS_META,
  HUB_STATUS_META,
  TONE_CLASSES,
  type BadgeTone,
} from "./hub-ui";

export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: BadgeTone;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-11 font-medium whitespace-nowrap",
        TONE_CLASSES[tone],
        className
      )}
    >
      {children}
    </span>
  );
}

export function IntegrationStatusBadge({
  status,
}: {
  status: HubIntegrationStatus;
}) {
  const meta = HUB_STATUS_META[status];
  return <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>;
}

export function CredentialStatusBadge({
  status,
}: {
  status: HubCredentialStatus;
}) {
  const meta = CREDENTIAL_STATUS_META[status];
  return <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>;
}

export function CredentialEnvBadge({
  environment,
}: {
  environment: HubCredentialEnvironment;
}) {
  const meta = CREDENTIAL_ENV_META[environment];
  return <ToneBadge tone={meta.tone}>{meta.label}</ToneBadge>;
}

/** Checklist progress bar + "x/y · z%" caption. */
export function ChecklistProgress({
  done,
  total,
  percent,
}: {
  done: number;
  total: number;
  percent: number;
}) {
  return (
    <div>
      <div className="flex items-center justify-between text-12 text-black-400">
        <span>
          Checklist {done}/{total} done
        </span>
        <span className="text-black-300">{percent}%</span>
      </div>
      <div
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black-700"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        <div
          className={cn(
            "h-full rounded-full",
            percent >= 100 ? "bg-emerald-500" : "bg-rose-500"
          )}
          style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
        />
      </div>
    </div>
  );
}

/** Label/value row used across the read-only tab layouts. */
export function FieldRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1 py-2.5 sm:grid-cols-[180px_1fr] sm:gap-4">
      <dt className="text-12 font-medium tracking-wide text-black-400 uppercase">
        {label}
      </dt>
      <dd className="min-w-0 text-14 text-black-100">{children}</dd>
    </div>
  );
}

export function SectionCard({
  title,
  description,
  children,
  action,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <section className="glass-card p-6 sm:p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-16 font-semibold text-white">{title}</h3>
          {description && (
            <p className="mt-0.5 text-12 text-black-400">{description}</p>
          )}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

export function WarningNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-amber-500/40 bg-amber-950/20 p-3.5 text-12 text-amber-300">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

export function ErrorNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 rounded-xl border border-rose-500/40 bg-rose-950/20 p-3.5 text-12 text-rose-300">
      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-rose-400" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** Explicit confirmation dialog — used for deletes and for the guarded
 *  approved/live status transitions. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  busy,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body: React.ReactNode;
  confirmLabel: string;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal
      isOpen={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-black-600 bg-black-800 px-4 py-2 text-13 font-medium text-black-200 transition-colors hover:text-white disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy}
            className="rounded-xl bg-rose-600 px-4 py-2 text-13 font-semibold text-white transition-colors hover:bg-rose-500 disabled:opacity-50"
          >
            {busy ? "Working…" : confirmLabel}
          </button>
        </div>
      }
    >
      <div className="text-13 text-black-300">{body}</div>
    </Modal>
  );
}

/** Monospace, copy-friendly value display. */
export function MonoValue({ children }: { children: React.ReactNode }) {
  return (
    <code className="font-mono text-13 break-all text-black-100">
      {children}
    </code>
  );
}
