import { NextResponse } from "next/server";
import { resolveInboxContext } from "@/lib/server/inbox";
import { createAdminClient } from "@/lib/supabase/server";
import {
  ResendEmailAdapter,
  createConversationRoutingAdapter,
  type EmailProviderAdapter,
} from "@/lib/email";
import {
  sendInboxReply,
  type ReplyFailureCode,
  type ReplyVoiceNote,
} from "@/lib/inbox/reply";
import {
  audioDataUrl,
  buildVoiceAttachment,
} from "@/lib/voice/attachments";
import {
  downloadVoiceNoteAsAttachment,
  isWorkspaceVoicePath,
} from "@/lib/voice/storage";

export const dynamic = "force-dynamic";

const FAILURE_STATUS: Record<ReplyFailureCode, number> = {
  not_found: 404,
  empty_content: 400,
  missing_idempotency_key: 400,
  invalid_recipient: 400,
  linkedin_unavailable: 422,
  suppressed: 422,
  not_configured: 503,
  provider_error: 502,
};

/**
 * POST /api/inbox/conversations/[id]/reply
 * Body: { content: string, subject?: string, idempotencyKey: string }
 *
 * The real reply send path (see src/lib/inbox/reply.ts): the attempt is
 * persisted first under the idempotency key, then sent through the
 * email adapter — which checks the workspace suppression list before
 * any provider call — and the row ends in exactly the provider's
 * outcome (`sent` only with a provider message ID; `simulated` in Demo
 * Mode, never "delivered"). Retrying with the same idempotency key
 * re-uses the row and can never send twice. LinkedIn conversations are
 * refused: no authorized LinkedIn provider exists.
 */
export async function POST(
  req: Request,
  { params }: { params: { id: string } }
) {
  const ctx = await resolveInboxContext();
  if (!ctx.ok) {
    return NextResponse.json({ error: ctx.error }, { status: ctx.status });
  }

  let body: {
    content?: unknown;
    subject?: unknown;
    idempotencyKey?: unknown;
    voiceNote?: unknown;
  } = {};
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  // Voice note (P6 Stage C): the client sends either inline audio
  // (Demo Mode — stored as a data: URL, nothing leaves the browser
  // beyond this simulated send) or a storage path it obtained from
  // /api/voice/upload (live mode — the server downloads the bytes
  // here so the attachment is real). A path outside the caller's
  // workspace is refused outright.
  let voiceNote: ReplyVoiceNote | undefined;
  if (body.voiceNote && typeof body.voiceNote === "object") {
    const vn = body.voiceNote as Record<string, unknown>;
    const durationSec =
      typeof vn.durationSec === "number" ? Math.max(0, Math.round(vn.durationSec)) : null;
    const language = typeof vn.language === "string" ? vn.language : null;
    const transcript = typeof vn.transcript === "string" ? vn.transcript : null;
    if (typeof vn.path === "string" && vn.path) {
      if (!isWorkspaceVoicePath(ctx.workspaceId, vn.path)) {
        return NextResponse.json(
          { error: "That voice note does not belong to your workspace." },
          { status: 403 }
        );
      }
      const admin = createAdminClient();
      const attachment = admin
        ? await downloadVoiceNoteAsAttachment(admin, vn.path)
        : null;
      if (!attachment) {
        return NextResponse.json(
          { error: "The voice note could not be loaded from storage, so the reply was not sent." },
          { status: 502 }
        );
      }
      voiceNote = { path: vn.path, durationSec, language, transcript, attachment };
    } else if (
      typeof vn.dataBase64 === "string" &&
      typeof vn.contentType === "string"
    ) {
      const built = buildVoiceAttachment({
        contentType: vn.contentType,
        contentBase64: vn.dataBase64,
        filename: typeof vn.filename === "string" ? vn.filename : undefined,
      });
      if (!built.ok) {
        return NextResponse.json({ error: built.error }, { status: 400 });
      }
      voiceNote = {
        path: audioDataUrl(vn.contentType, vn.dataBase64),
        durationSec,
        language,
        transcript,
        attachment: built.attachment,
      };
    }
  }

  // The inbox owns its message rows (idempotency), so the adapter must
  // not write a second bookkeeping row for the same send.
  // Live mode (P5 Stage G): replies route through the conversation's
  // sending account — when that account (or the workspace's single
  // active OAuth mailbox) is a Gmail / Outlook mailbox, the reply is
  // sent from that mailbox; otherwise Resend, exactly as before.
  // Demo Mode keeps the plain Resend adapter (its demo branch yields
  // the labelled simulated outcome).
  let adapter: EmailProviderAdapter = new ResendEmailAdapter({
    skipMessageRecord: true,
  });
  if (ctx.mode !== "demo") {
    const admin = createAdminClient();
    if (admin) {
      adapter = createConversationRoutingAdapter(admin, params.id);
    }
  }

  const outcome = await sendInboxReply(
    { repo: ctx.repo, adapter },
    {
      workspaceId: ctx.workspaceId,
      conversationId: params.id,
      content: typeof body.content === "string" ? body.content : "",
      subject: typeof body.subject === "string" ? body.subject : undefined,
      idempotencyKey:
        typeof body.idempotencyKey === "string" ? body.idempotencyKey : "",
      voiceNote,
    }
  );

  if (outcome.ok) {
    return NextResponse.json(
      { message: outcome.message, duplicate: outcome.duplicate },
      { status: 201 }
    );
  }
  return NextResponse.json(
    { error: outcome.error, code: outcome.code, message: outcome.message },
    { status: FAILURE_STATUS[outcome.code] }
  );
}
