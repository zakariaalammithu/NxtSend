import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  BellRing,
  Code2,
  KeyRound,
  LifeBuoy,
  MailCheck,
  PlugZap,
  Webhook,
} from "lucide-react";

export const metadata: Metadata = {
  title: "Developers",
  description:
    "What developers can build with NxtSend today: signed outbound webhooks with a documented payload and signature scheme, configured in the Integration Center. A public REST API is not available yet.",
};

/**
 * Developers page (P8) — written strictly against what the codebase
 * implements today:
 *
 * - Outbound webhooks are real (src/lib/webhooks): three events, a
 *   versioned envelope, an HMAC-SHA256 signature header, a delivery
 *   log, and retries at 5 min / 30 min with a 3-attempt cap. The
 *   payload example below is built from the actual emission code in
 *   src/lib/data/webhook-emission.ts, and the verification sample
 *   mirrors src/lib/webhooks/signing.ts.
 * - There is NO public REST API, no customer API key, no SDK and no
 *   inbound-webhook product. Those are labelled "Coming Soon" /
 *   "API Access Required" — never documented as if they existed.
 * - Mailbox OAuth (Gmail / Outlook) is a real end-user capability,
 *   described as such — not as a developer API.
 */

const EVENTS = [
  {
    type: "lead.created",
    description: "A lead was created — added manually or via CSV import.",
    data: "Manual adds carry the lead's id, email, first name and company; CSV imports carry a count and the list of new lead ids.",
  },
  {
    type: "campaign.created",
    description: "A campaign was created.",
    data: "Carries the campaign id, its name and its starting status.",
  },
  {
    type: "campaign.status_changed",
    description:
      "A campaign's lifecycle status changed — pause, resume, archive or a move back to draft.",
    data: "Carries the campaign id and the new status.",
  },
] as const;

const PAYLOAD_EXAMPLE = `{
  "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "type": "lead.created",
  "created_at": "2026-10-22T08:15:30.000Z",
  "workspace_id": "51e3f7d2-9c4a-4b1e-8d2f-3a5c6e7b8d90",
  "data": {
    "source": "manual",
    "leadId": "b3d51f49-1a2c-4e77-9a01-2f4c8d6e5b70",
    "email": "alex@example.com",
    "firstName": "Alex",
    "company": "Example Co"
  }
}`;

const VERIFY_EXAMPLE = `import { createHmac, timingSafeEqual } from "node:crypto";

// Verify against the RAW request body, before any JSON parsing.
export function verifyNxtSendWebhook(rawBody, signatureHeader, secret) {
  // Header format: "t=<unix seconds>,v1=<hex hmac>"
  const parts = Object.fromEntries(
    signatureHeader.split(",").map((kv) => {
      const [k, ...rest] = kv.split("=");
      return [k.trim(), rest.join("=").trim()];
    })
  );
  const ts = Number(parts.t);
  if (!Number.isFinite(ts) || !parts.v1) return false;

  // Replay protection: reject events older than 5 minutes.
  if (Math.abs(Math.floor(Date.now() / 1000) - ts) > 300) return false;

  const expected = createHmac("sha256", secret)
    .update(\`\${ts}.\${rawBody}\`)
    .digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(parts.v1, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}`;

const CONFIGURE_STEPS = [
  {
    title: "Open the Integration Center",
    text: "Sign in to NxtSend and go to Dashboard → Integration Center → Outbound Webhooks.",
  },
  {
    title: "Paste your endpoint and pick events",
    text: "Enter the public HTTPS URL that should receive events — an n8n Webhook node, a Zapier Catch Hook, or your own service — and choose which of the three events it receives.",
  },
  {
    title: "Save the signing secret somewhere safe",
    text: "When you save, NxtSend generates a shared signing secret and shows it once. Store it in your receiver; it is never shown again and never appears inside a delivery.",
  },
  {
    title: "Send a test event and check the delivery log",
    text: "The same screen keeps a delivery log for your workspace, so you can confirm the endpoint answered and see the outcome of every attempt.",
  },
] as const;

const COMING_SOON = [
  {
    title: "Public REST API",
    text: "There is no public, versioned REST API for NxtSend workspaces yet, so there is no endpoint catalogue to publish — we would rather say that plainly than document endpoints that do not exist.",
  },
  {
    title: "API keys & token authentication",
    text: "Customers cannot issue API keys or bearer tokens today. Key management arrives together with the public API, not before it.",
  },
  {
    title: "SDKs & client libraries",
    text: "No official SDKs exist for any language yet. Webhooks need nothing but an HTTPS endpoint and the verification snippet above.",
  },
  {
    title: "Inbound webhooks",
    text: "You cannot push events into NxtSend over webhooks today. The only inbound webhook endpoints in the product are callbacks from our own providers (email and billing), which are not a customer feature.",
  },
] as const;

const TROUBLESHOOTING = [
  {
    title: "Signature verification keeps failing",
    text: "Three causes cover almost every case: verify against the exact raw body (re-serialised JSON will not match), use the signing secret from the workspace that owns the endpoint, and check your server clock — signatures older than 5 minutes are rejected as replays.",
  },
  {
    title: "Deliveries are marked failed",
    text: "Any response outside the 2xx range counts as a failure, and an endpoint that does not answer within 10 seconds times out. Failed deliveries retry automatically after 5 minutes and again after 30 minutes, up to 3 attempts in total.",
  },
  {
    title: "Where can I see what was sent?",
    text: "Every delivery is recorded in the delivery log in Dashboard → Integration Center → Outbound Webhooks before the first attempt is made, with its status, attempt count and last error.",
  },
  {
    title: "Deliveries show as \u201csimulated\u201d",
    text: "In Demo Mode no HTTP call leaves NxtSend — deliveries are written to the log and labelled simulated so the log never pretends an endpoint was reached. Live deliveries need a workspace running against a configured deployment.",
  },
] as const;

function CodeBlock({ code, label }: { code: string; label: string }) {
  return (
    <figure className="overflow-hidden rounded-2xl border border-white/10 bg-black-800">
      <figcaption className="border-b border-white/10 px-5 py-2.5 text-12 font-semibold uppercase tracking-wider text-white/50">
        {label}
      </figcaption>
      <pre className="overflow-x-auto p-5 font-mono text-13 leading-relaxed text-purple-100/90">
        {code}
      </pre>
    </figure>
  );
}

export default function DevelopersPage() {
  return (
    <div className="relative overflow-hidden bg-black-900">
      {/* ── Hero ─────────────────────────────────────────────────────── */}
      <section className="relative pt-32 pb-16 sm:pt-36">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 rounded-full bg-purple-600/10 blur-[140px]"
        />
        <div className="section-container relative z-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="inline-flex items-center gap-1.5 rounded-full border border-purple-500/30 bg-purple-900/30 px-3.5 py-1 text-12 font-semibold text-purple-300">
              <Code2 className="h-3.5 w-3.5" />
              Developers
            </p>
            <h1 className="mt-5 text-36 font-extrabold tracking-tight text-white sm:text-48">
              React to NxtSend events, in real time
            </h1>
            <p className="mt-5 text-17 leading-relaxed text-black-300">
              The developer surface that exists today is signed outbound
              webhooks: NxtSend posts a versioned JSON event to your
              endpoint whenever a lead or campaign changes, and you verify
              every delivery with an HMAC signature. Everything below is
              documented from the implementation that actually ships —
              including the parts that are not built yet.
            </p>
          </div>

          {/* What exists today */}
          <div className="mx-auto mt-14 grid max-w-5xl gap-5 md:grid-cols-3">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-600/20 text-purple-300">
                <Webhook className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-17 font-bold text-white">
                Outbound webhooks
              </h2>
              <p className="mt-2 text-14 leading-relaxed text-black-300">
                Three signed events — lead.created, campaign.created and
                campaign.status_changed — delivered to the endpoint you
                configure, with a delivery log and automatic retries.
              </p>
              <span className="mt-4 inline-flex rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-11 font-semibold uppercase tracking-wider text-emerald-200 ring-1 ring-inset ring-emerald-300/25">
                Available today
              </span>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-600/20 text-purple-300">
                <PlugZap className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-17 font-bold text-white">
                Integration Center
              </h2>
              <p className="mt-2 text-14 leading-relaxed text-black-300">
                Webhooks and every other integration are configured inside
                the product, where each status is derived from a real
                configuration or a real verification call — never assumed.
              </p>
              <span className="mt-4 inline-flex rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-11 font-semibold uppercase tracking-wider text-emerald-200 ring-1 ring-inset ring-emerald-300/25">
                Available today
              </span>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-purple-600/20 text-purple-300">
                <MailCheck className="h-5 w-5" />
              </span>
              <h2 className="mt-4 text-17 font-bold text-white">
                Connect your mailbox (OAuth)
              </h2>
              <p className="mt-2 text-14 leading-relaxed text-black-300">
                Users connect their own Gmail or Outlook mailbox with an
                OAuth sign-in inside the app, so campaigns can send and
                receive through it. A product capability — not an API.
              </p>
              <span className="mt-4 inline-flex rounded-full bg-emerald-400/10 px-2.5 py-0.5 text-11 font-semibold uppercase tracking-wider text-emerald-200 ring-1 ring-inset ring-emerald-300/25">
                Available today
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* ── Outbound webhooks ──────────────────────────────────────── */}
      <section className="relative border-t border-white/10 py-20">
        <div className="section-container">
          <div className="mx-auto max-w-3xl">
            <h2 className="text-28 font-bold tracking-tight text-white sm:text-36">
              Outbound webhooks
            </h2>
            <p className="mt-4 text-16 leading-relaxed text-black-300">
              NxtSend webhooks are workspace-scoped: one endpoint per
              workspace, subscribed to the events you choose. Deliveries
              work the same whether the receiver is an automation tool
              (an n8n Webhook node, a Zapier Catch Hook, a Make Custom
              Webhook) or your own service.
            </p>
          </div>

          {/* Configure steps */}
          <ol className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2">
            {CONFIGURE_STEPS.map((step, i) => (
              <li
                key={step.title}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-brand text-14 font-bold text-white">
                  {i + 1}
                </span>
                <h3 className="mt-4 text-16 font-bold text-white">
                  {step.title}
                </h3>
                <p className="mt-2 text-14 leading-relaxed text-black-300">
                  {step.text}
                </p>
              </li>
            ))}
          </ol>

          {/* Events */}
          <div className="mx-auto mt-16 max-w-5xl">
            <h3 className="text-22 font-bold text-white">Events</h3>
            <div className="mt-6 overflow-hidden rounded-3xl border border-white/10">
              {EVENTS.map((event, i) => (
                <div
                  key={event.type}
                  className={`grid gap-2 bg-white/[0.03] p-6 sm:grid-cols-[240px_1fr] sm:gap-6 ${
                    i > 0 ? "border-t border-white/10" : ""
                  }`}
                >
                  <code className="font-mono text-14 font-semibold text-purple-300">
                    {event.type}
                  </code>
                  <div>
                    <p className="text-14 leading-relaxed text-white">
                      {event.description}
                    </p>
                    <p className="mt-1 text-13 leading-relaxed text-black-400">
                      {event.data}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Payload + headers */}
          <div className="mx-auto mt-16 grid max-w-5xl gap-10 lg:grid-cols-2">
            <div>
              <h3 className="text-22 font-bold text-white">The payload</h3>
              <p className="mt-3 text-14 leading-relaxed text-black-300">
                Every event uses the same versioned envelope:{" "}
                <code className="font-mono text-13 text-purple-200">
                  {"{ id, type, created_at, workspace_id, data }"}
                </code>
                . The <code className="font-mono text-13 text-purple-200">id</code>{" "}
                is unique per event, so receivers can safely ignore
                duplicates. A delivery also carries three headers:{" "}
                <code className="font-mono text-13 text-purple-200">X-NxtSend-Event</code>{" "}
                (the event type),{" "}
                <code className="font-mono text-13 text-purple-200">X-NxtSend-Timestamp</code>{" "}
                (unix seconds, matching the signature) and the signature
                header described next.
              </p>
              <div className="mt-6">
                <CodeBlock label="Example — lead.created" code={PAYLOAD_EXAMPLE} />
              </div>
            </div>

            <div>
              <h3 className="text-22 font-bold text-white">
                Verify the signature
              </h3>
              <p className="mt-3 text-14 leading-relaxed text-black-300">
                Deliveries are signed with HMAC-SHA256 over{" "}
                <code className="font-mono text-13 text-purple-200">
                  {"<timestamp>.<raw body>"}
                </code>{" "}
                using your workspace&apos;s signing secret, and sent in the{" "}
                <code className="font-mono text-13 text-purple-200">
                  X-NxtSend-Signature: t=&lt;ts&gt;,v1=&lt;hex&gt;
                </code>{" "}
                header. Always verify before trusting a payload — and note
                that Zapier Catch Hook URLs cannot verify signatures, so
                treat that URL itself as a secret.
              </p>
              <div className="mt-6">
                <CodeBlock label="Node.js — verification" code={VERIFY_EXAMPLE} />
              </div>
            </div>
          </div>

          {/* Endpoint requirements + retries */}
          <div className="mx-auto mt-16 grid max-w-5xl gap-5 md:grid-cols-2">
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h3 className="flex items-center gap-2 text-17 font-bold text-white">
                <BellRing className="h-5 w-5 text-purple-300" />
                Endpoint requirements
              </h3>
              <ul className="mt-4 list-disc space-y-2 pl-5 text-14 leading-relaxed text-black-300">
                <li>A public HTTPS URL that accepts POST requests with a JSON body.</li>
                <li>Answer with any 2xx status — quickly. Deliveries time out after 10 seconds.</li>
                <li>Verify the signature (above) and deduplicate on the event <code className="font-mono text-13 text-purple-200">id</code>.</li>
                <li>Do the slow work after responding; long-running handlers cause failed deliveries.</li>
              </ul>
            </div>
            <div className="rounded-3xl border border-white/10 bg-white/[0.04] p-6">
              <h3 className="text-17 font-bold text-white">
                Retries &amp; the delivery log
              </h3>
              <p className="mt-4 text-14 leading-relaxed text-black-300">
                Each delivery is written to your workspace&apos;s delivery
                log before the first attempt. If an attempt fails — a
                non-2xx response or a timeout — NxtSend retries after 5
                minutes and again after 30 minutes, for up to 3 attempts
                in total. The log shows every delivery&apos;s status,
                attempt count and last error, so nothing fails silently.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Public API — access required ───────────────────────────── */}
      <section className="relative border-t border-white/10 py-20">
        <div className="section-container">
          <div className="mx-auto max-w-5xl rounded-3xl border border-amber-300/25 bg-amber-400/[0.04] p-8 sm:p-10">
            <div className="flex flex-wrap items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-amber-400/15 text-amber-200">
                <KeyRound className="h-5 w-5" />
              </span>
              <h2 className="text-24 font-bold tracking-tight text-white sm:text-28">
                Public API — API Access Required
              </h2>
              <span className="rounded-full bg-amber-400/10 px-3 py-1 text-11 font-semibold uppercase tracking-wider text-amber-200 ring-1 ring-inset ring-amber-300/25">
                Coming Soon
              </span>
            </div>
            <p className="mt-5 max-w-3xl text-15 leading-relaxed text-black-300">
              A public API is on the roadmap, but it does not exist yet —
              so there are no endpoints, keys or published rate limits to
              document, and anything you may see elsewhere claiming
              otherwise is not official. Because there is no public API,
              there are also no published API rate limits at this time.
            </p>
            <div className="mt-8 grid gap-5 sm:grid-cols-2">
              {COMING_SOON.map((item) => (
                <div
                  key={item.title}
                  className="rounded-2xl border border-white/10 bg-black-800/60 p-5"
                >
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-15 font-bold text-white">
                      {item.title}
                    </h3>
                    <span className="shrink-0 rounded-full bg-white/[0.06] px-2.5 py-0.5 text-10 font-semibold uppercase tracking-wider text-white/60 ring-1 ring-inset ring-white/10">
                      Coming Soon
                    </span>
                  </div>
                  <p className="mt-2 text-13 leading-relaxed text-black-400">
                    {item.text}
                  </p>
                </div>
              ))}
            </div>
            <p className="mt-8 text-14 leading-relaxed text-black-300">
              Building something that needs API access when it opens?
              Write to{" "}
              <a
                href="mailto:hello@nxtsend.com"
                className="font-semibold text-purple-300 hover:underline"
              >
                hello@nxtsend.com
              </a>{" "}
              and tell us what you would build — integration interest
              shapes the order we ship things.
            </p>
          </div>
        </div>
      </section>

      {/* ── Errors & troubleshooting ───────────────────────────────── */}
      <section className="relative border-t border-white/10 py-20">
        <div className="section-container">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-28 font-bold tracking-tight text-white sm:text-36">
              Errors &amp; troubleshooting
            </h2>
            <p className="mt-4 text-16 leading-relaxed text-black-300">
              Webhook problems are almost always one of these four.
            </p>
          </div>
          <div className="mx-auto mt-12 grid max-w-5xl gap-5 sm:grid-cols-2">
            {TROUBLESHOOTING.map((item) => (
              <div
                key={item.title}
                className="rounded-3xl border border-white/10 bg-white/[0.04] p-6"
              >
                <h3 className="text-16 font-bold text-white">{item.title}</h3>
                <p className="mt-2 text-14 leading-relaxed text-black-300">
                  {item.text}
                </p>
              </div>
            ))}
          </div>

          {/* Developer support */}
          <div className="mx-auto mt-14 max-w-5xl rounded-3xl border border-white/10 bg-gradient-to-br from-[#2a1650] via-[#170b33] to-black-900 p-8 text-center sm:p-10">
            <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-white">
              <LifeBuoy className="h-5 w-5" />
            </span>
            <h2 className="mt-4 text-24 font-bold text-white">
              Developer support
            </h2>
            <p className="mx-auto mt-3 max-w-2xl text-15 leading-relaxed text-white/70">
              Stuck on a signature that will not verify, or planning an
              integration around the webhook events? Email us at{" "}
              <a
                href="mailto:hello@nxtsend.com"
                className="font-semibold text-white hover:underline"
              >
                hello@nxtsend.com
              </a>{" "}
              with your event type and delivery timestamp, or browse the{" "}
              <Link href="/support" className="font-semibold text-white hover:underline">
                Help &amp; Support
              </Link>{" "}
              page for product guides.
            </p>
            <Link
              href="/contact"
              className="group mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-full bg-white px-7 text-14 font-semibold text-black-900 transition hover:bg-white/90"
            >
              <span>Contact the team</span>
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
