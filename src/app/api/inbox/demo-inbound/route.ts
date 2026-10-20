/**
 * Demo inbound seam — POST /api/inbox/demo-inbound (P5 Stage D).
 *
 * DEMO MODE ONLY. In live mode this route answers 404: real inbound
 * mail arrives exclusively through the Svix-verified Resend webhook,
 * and no unauthenticated endpoint may inject mail into conversations.
 *
 * In demo mode there is no webhook (no database, no provider), so
 * this seam is how a simulated reply is exercised end-to-end: it runs
 * the REAL ingestion pipeline (src/lib/inbox/inbound.ts — the same
 * tenant-refusing matcher the live webhook store uses) against the
 * demo repositories, records the simulated email.received event in
 * the demo event log with its routing outcome (routed / unrouted —
 * unrouted mail stays visible in the admin deliverability log), and
 * files the reply, which creates the same reply notification the
 * live path creates.
 *
 * Body: { from: "Name <a@b.c>" | "a@b.c", subject?, text? }.
 */

import { NextResponse } from "next/server";
import { getDataMode } from "@/lib/data/mode";
import { isValidEmailAddress } from "@/lib/data/inbox";
import {
  ingestReceivedEmail,
  parseAddress,
  type ReceivedEmailContent,
} from "@/lib/inbox/inbound";
import { createDemoInboundStore } from "@/lib/inbox/demo-inbound-store";
import { recordDemoEmailEvent } from "@/lib/email/demo-events";
import { generateId } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  if (getDataMode() !== "demo") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let body: { from?: unknown; subject?: unknown; text?: unknown };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const from = typeof body.from === "string" ? body.from.trim() : "";
  const sender = parseAddress(from);
  if (!sender.email || !isValidEmailAddress(sender.email)) {
    return NextResponse.json(
      { error: "A parseable sender address (from) is required." },
      { status: 400 }
    );
  }
  const subject =
    typeof body.subject === "string" && body.subject.trim()
      ? body.subject.trim()
      : null;
  const text =
    typeof body.text === "string" && body.text.trim()
      ? body.text
      : "Thanks — this sounds interesting. Can you send more detail?";

  const providerMessageId = `demo-rcv-${generateId()}`;
  const email: ReceivedEmailContent = {
    providerMessageId,
    from,
    to: ["demo@mail.nxtsend-demo.com"],
    subject,
    text,
    html: null,
    messageIdHeader: null,
    inReplyTo: null,
    references: [],
    receivedAt: new Date().toISOString(),
  };

  const outcome = await ingestReceivedEmail(createDemoInboundStore(), email);

  // Record the simulated webhook event with its routing outcome —
  // the demo counterpart of the live handler recording every
  // email.received delivery (routed or not) in `email_events`.
  recordDemoEmailEvent({
    event_type: "email.received",
    provider_message_id: providerMessageId,
    routing: outcome.status === "ingested" ? "routed" : "unrouted",
    detail: `from ${from}${subject ? ` · “${subject}”` : ""}`,
    payload: {
      type: "email.received",
      data: { email_id: providerMessageId, from, subject },
      simulated: true,
    },
  });

  return NextResponse.json({ mode: "demo", outcome });
}
