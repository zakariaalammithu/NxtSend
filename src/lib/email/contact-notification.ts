/**
 * Contact-form notification sender (P10 Stage C) — platform mail.
 *
 * When a visitor submits the marketing contact form, the submission
 * row is persisted FIRST (Admin → Submissions is the source of
 * truth) and this sender then emails a notification to the internal
 * recipient in CONTACT_NOTIFICATION_EMAIL (the owner's
 * nxtsendai@gmail.com). The visitor's own address goes in Reply-To,
 * so the team can answer straight from their inbox.
 *
 * This is deliberately NOT the workspace Resend adapter
 * (src/lib/email/resend.ts): that adapter requires a workspaceId,
 * consults the workspace suppression list and records campaign
 * `messages` rows. A contact notification has no workspace, no lead
 * and no suppression semantics — forcing it through the adapter
 * would corrupt those tables. This module is a minimal dedicated
 * sender over the same provider (Resend's REST API), with the same
 * honesty discipline:
 *
 *   - "sent" is returned ONLY when Resend accepts the message and
 *     returns its message ID.
 *   - Missing RESEND_API_KEY, EMAIL_FROM or
 *     CONTACT_NOTIFICATION_EMAIL → "not_configured": NO send is
 *     attempted and no success is claimed. (The recipient has no
 *     code-level fallback — an unset variable must surface as
 *     not_configured in Admin → Submissions, not silently reroute.)
 *   - Provider/network failure → "failed" with a sanitised summary
 *     (whitespace-collapsed, truncated to 500 chars; the API key is
 *     never part of any string built here).
 *
 * The From address is the codebase's canonical EMAIL_FROM (a
 * Resend-verified sender). There is intentionally no second sender
 * variable: EMAIL_FROM is the single source of truth for every
 * sending path in the app.
 *
 * Server-side only: the API key is read from env and used in a
 * server fetch; nothing here may be imported by client code.
 */

import { isConfiguredValue } from "@/lib/env";
import { isEmailFromConfigured } from "./state";
import type { SubmissionNotificationStatus } from "@/lib/admin/submissions-core";

export interface ContactNotificationEnv {
  RESEND_API_KEY?: string;
  EMAIL_FROM?: string;
  CONTACT_NOTIFICATION_EMAIL?: string;
}

export interface ContactNotificationInput {
  /** Submission row id — the reference quoted to the visitor. */
  id: string;
  name: string;
  /** The visitor's validated email (becomes Reply-To). */
  email: string;
  subject: string | null;
  message: string;
  /** ISO timestamp of the submission. */
  created_at: string;
}

export type ContactNotificationOutcome = Extract<
  SubmissionNotificationStatus,
  "sent" | "failed" | "not_configured"
>;

export interface ContactNotificationResult {
  status: ContactNotificationOutcome;
  /** Resend message ID when status is "sent". */
  providerId: string | null;
  /** Sanitised failure summary when status is "failed". */
  error: string | null;
  /** The resolved recipient (null when unset/invalid). */
  recipient: string | null;
}

/** Minimal fetch contract (injectable for tests). */
export type ContactNotificationFetch = (
  url: string,
  init: {
    method: string;
    headers: Record<string, string>;
    body: string;
  }
) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const RESEND_ENDPOINT = "https://api.resend.com/emails";

function envFromProcess(): ContactNotificationEnv {
  return {
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    CONTACT_NOTIFICATION_EMAIL: process.env.CONTACT_NOTIFICATION_EMAIL,
  };
}

/**
 * The effective notification recipient: the CONTACT_NOTIFICATION_EMAIL
 * value when it is set, non-placeholder and email-shaped; otherwise
 * null (→ not_configured). No hard-coded fallback by design.
 */
export function getContactNotificationRecipient(
  env: ContactNotificationEnv = envFromProcess()
): string | null {
  const raw = env.CONTACT_NOTIFICATION_EMAIL?.trim();
  if (!raw || !isConfiguredValue(raw) || !EMAIL_RE.test(raw)) return null;
  return raw;
}

/** Short form of a submission reference, for subjects and the UI. */
export function shortSubmissionRef(id: string): string {
  return id.slice(0, 8);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function sanitiseError(message: string): string {
  return message.replace(/\s+/g, " ").trim().slice(0, 500);
}

export interface ContactNotificationEmail {
  from: string;
  to: string;
  replyTo: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Builds the notification email for a stored submission. The body
 * carries everything the team needs to act without opening the
 * admin first: sender name + email, subject, message, submission
 * time and the submission reference. All visitor-supplied values
 * are HTML-escaped in the HTML part (the text part is plain by
 * construction).
 */
export function buildContactNotificationEmail(
  input: ContactNotificationInput,
  recipient: string,
  from: string
): ContactNotificationEmail {
  const subjectText = input.subject ?? "(no subject)";
  const ref = shortSubmissionRef(input.id);
  const subject = `[NxtSend Contact] ${subjectText} — ref ${ref}`;

  const text = [
    "New contact-form submission on NxtSend",
    "",
    `Name: ${input.name}`,
    `Email: ${input.email}`,
    `Subject: ${subjectText}`,
    `Submitted: ${input.created_at}`,
    `Reference: ${input.id}`,
    "",
    "Message:",
    input.message,
    "",
    "—",
    "Reply to this email to answer the visitor (Reply-To is set to",
    "their address), or open Admin → Submissions in NxtSend.",
  ].join("\n");

  const html = [
    "<h2>New contact-form submission on NxtSend</h2>",
    `<p><strong>Name:</strong> ${escapeHtml(input.name)}<br/>`,
    `<strong>Email:</strong> ${escapeHtml(input.email)}<br/>`,
    `<strong>Subject:</strong> ${escapeHtml(subjectText)}<br/>`,
    `<strong>Submitted:</strong> ${escapeHtml(input.created_at)}<br/>`,
    `<strong>Reference:</strong> ${escapeHtml(input.id)}</p>`,
    "<p><strong>Message:</strong></p>",
    `<p>${escapeHtml(input.message).replace(/\n/g, "<br/>")}</p>`,
    "<hr/>",
    "<p>Reply to this email to answer the visitor (Reply-To is set to their address), or open Admin → Submissions in NxtSend.</p>",
  ].join("\n");

  return { from, to: recipient, replyTo: input.email, subject, text, html };
}

/**
 * Attempts the notification for one stored contact submission.
 * Never throws — outcomes are values, so callers can record the
 * result on the submission row and move on (the visitor's response
 * never depends on this succeeding).
 */
export async function sendContactNotification(
  input: ContactNotificationInput,
  options: {
    env?: ContactNotificationEnv;
    fetchImpl?: ContactNotificationFetch;
  } = {}
): Promise<ContactNotificationResult> {
  const env = options.env ?? envFromProcess();
  const recipient = getContactNotificationRecipient(env);
  const apiKey = isConfiguredValue(env.RESEND_API_KEY)
    ? (env.RESEND_API_KEY as string).trim()
    : null;
  const from =
    env.EMAIL_FROM && isEmailFromConfigured(env.EMAIL_FROM)
      ? env.EMAIL_FROM.trim()
      : null;

  if (!apiKey || !from || !recipient) {
    return { status: "not_configured", providerId: null, error: null, recipient };
  }

  const email = buildContactNotificationEmail(input, recipient, from);
  const doFetch: ContactNotificationFetch =
    options.fetchImpl ?? (globalThis.fetch as unknown as ContactNotificationFetch);

  try {
    const response = await doFetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
        // One logical notification per submission: a retry after an
        // ambiguous failure replays against the same key instead of
        // double-sending unknowingly.
        "Idempotency-Key": `contact-notification/${input.id}`,
      },
      body: JSON.stringify({
        from: email.from,
        to: [email.to],
        reply_to: email.replyTo,
        subject: email.subject,
        text: email.text,
        html: email.html,
      }),
    });

    if (!response.ok) {
      let detail = `Resend responded with HTTP ${response.status}`;
      try {
        const body = (await response.json()) as { message?: unknown } | null;
        if (body && typeof body.message === "string" && body.message.trim()) {
          detail = body.message;
        }
      } catch {
        // Non-JSON error body — keep the HTTP summary.
      }
      return {
        status: "failed",
        providerId: null,
        error: sanitiseError(detail),
        recipient,
      };
    }

    const body = (await response.json().catch(() => null)) as {
      id?: unknown;
    } | null;
    const providerId =
      body && typeof body.id === "string" && body.id.length > 0 ? body.id : null;
    if (!providerId) {
      return {
        status: "failed",
        providerId: null,
        error: "Resend accepted the request but returned no message id",
        recipient,
      };
    }
    return { status: "sent", providerId, error: null, recipient };
  } catch (err) {
    return {
      status: "failed",
      providerId: null,
      error: sanitiseError(
        err instanceof Error ? err.message : "Notification request failed"
      ),
      recipient,
    };
  }
}
