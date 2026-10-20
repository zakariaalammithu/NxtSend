/**
 * Public unsubscribe endpoint — /api/unsubscribe/[token]
 *
 * The token (HMAC-signed, see src/lib/email/unsubscribe.ts) is the
 * only credential: it names exactly one workspace + one recipient.
 * There is deliberately NO session here — a recipient clicking from
 * their mail client is not logged in.
 *
 *  - GET renders a branded confirmation page (the address masked).
 *    GET never performs the unsubscribe: mail scanners prefetch links,
 *    so a GET that unsubscribed would silently opt people out.
 *  - POST performs it (RFC 8058 one-click: mail clients POST
 *    `List-Unsubscribe=One-Click`; the confirmation page's form POSTs
 *    too). Writing the suppression is idempotent.
 *  - Invalid/tampered token → 400 with a generic page. The endpoint
 *    never reveals whether an address exists in any workspace: a
 *    validly-signed token for an unknown address is recorded exactly
 *    like any other (that IS the correct outcome — the sender asked
 *    us to stop mailing that address in that workspace).
 */

import { createAdminClient } from "@/lib/supabase/server";
import { getDataMode } from "@/lib/data/mode";
import { maskEmail, verifyUnsubscribeToken } from "@/lib/email/unsubscribe";
import {
  performUnsubscribe,
  resolveUnsubscribeDeps,
} from "@/lib/email/unsubscribe-service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pageShell(title: string, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${title} — NxtSend</title>
<style>
  body { margin:0; font-family: -apple-system, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background:#0b0b12; color:#f4f4f5; }
  .wrap { max-width: 480px; margin: 10vh auto; padding: 32px 28px; background:#14141d; border:1px solid #262633; border-radius:16px; }
  h1 { font-size: 20px; margin: 0 0 12px; }
  p { font-size: 14px; line-height: 1.6; color:#c9c9d4; }
  .brand { font-size: 13px; letter-spacing: .08em; text-transform: uppercase; color:#a78bfa; margin-bottom: 20px; font-weight: 700; }
  button { background:#7c3aed; color:#fff; border:0; border-radius:10px; padding:12px 20px; font-size:14px; font-weight:600; cursor:pointer; width:100%; }
  button:hover { background:#6d28d9; }
  .muted { font-size: 12px; color:#8b8b9c; margin-top:16px; }
</style>
</head>
<body><div class="wrap"><div class="brand">NxtSend</div>${body}</div></body>
</html>`;
}

function htmlResponse(html: string, status: number): Response {
  return new Response(html, {
    status,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  });
}

function invalidResponse(wantsJson: boolean): Response {
  if (wantsJson) {
    return Response.json(
      { error: "This unsubscribe link is invalid." },
      { status: 400 }
    );
  }
  return htmlResponse(
    pageShell(
      "Invalid link",
      `<h1>This unsubscribe link is invalid</h1>
       <p>The link may be incomplete or corrupted. If you keep receiving email you did not ask for, reply to the message and ask to be removed.</p>`
    ),
    400
  );
}

function wantsJson(req: Request): boolean {
  const accept = req.headers.get("accept") ?? "";
  return accept.includes("application/json") && !accept.includes("text/html");
}

export async function GET(
  req: Request,
  { params }: { params: { token: string } }
) {
  const claims = verifyUnsubscribeToken(params.token);
  if (!claims) return invalidResponse(wantsJson(req));
  const masked = maskEmail(claims.email);
  return htmlResponse(
    pageShell(
      "Unsubscribe",
      `<h1>Unsubscribe ${masked}?</h1>
       <p>You will stop receiving outreach emails sent through NxtSend to <strong>${masked}</strong>. Transactional messages (receipts, account security) are not affected.</p>
       <form method="POST" action="">
         <button type="submit">Yes, unsubscribe me</button>
       </form>
       <p class="muted">Changed your mind? Just close this page — nothing has been changed yet.</p>`
    ),
    200
  );
}

export async function POST(
  req: Request,
  { params }: { params: { token: string } }
) {
  const json = wantsJson(req);
  // Resolve deps first: in live mode without a service-role client we
  // cannot write the suppression — answer 503 rather than pretend.
  const deps = resolveUnsubscribeDeps(
    getDataMode() === "demo" ? null : createAdminClient()
  );
  if (!deps) {
    return json
      ? Response.json(
          { error: "Unsubscribe is temporarily unavailable." },
          { status: 503 }
        )
      : htmlResponse(
          pageShell(
            "Unavailable",
            `<h1>Unsubscribe is temporarily unavailable</h1>
             <p>Please try again later, or reply to the email and ask to be removed.</p>`
          ),
          503
        );
  }

  const result = await performUnsubscribe(deps, params.token);
  if (result.outcome === "invalid") return invalidResponse(json);

  if (json) {
    return Response.json({
      ok: true,
      outcome: result.outcome,
      email: result.email,
    });
  }
  const masked = maskEmail(result.email);
  return htmlResponse(
    pageShell(
      "Unsubscribed",
      result.outcome === "already"
        ? `<h1>You are already unsubscribed</h1>
           <p><strong>${masked}</strong> is already on the do-not-email list for this sender. No further outreach email will be sent to this address.</p>`
        : `<h1>You have been unsubscribed</h1>
           <p><strong>${masked}</strong> has been added to the do-not-email list. You will not receive further outreach email from this sender.</p>`
    ),
    200
  );
}
