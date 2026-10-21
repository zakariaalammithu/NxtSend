/**
 * Executor voice tests (P6 Stage C): an email step carrying
 * config.voice_note sends the note as a real attachment and records
 * the voice fields on the stored message; a storage note without a
 * resolver still sends the email but logs — loudly — that the note
 * was NOT attached; steps without a note are unchanged.
 */

import { describe, it, expect } from "vitest";
import { executeDueSteps } from "../core";
import type {
  ExecutorCampaign,
  ExecutorEnrollment,
  ExecutorStore,
  StepExecutionRecord,
} from "../types";
import type { CampaignStep, Lead } from "@/types";
import type { InboxMessage, InsertMessageInput } from "@/lib/data/inbox";
import type {
  EmailAttachment,
  EmailProviderAdapter,
  SendEmailInput,
  SendEmailResult,
} from "@/lib/email/types";
import type { ProviderState } from "@/lib/env";
import { audioDataUrl, bytesToBase64 } from "@/lib/voice/attachments";

const WS = "ws_1";
const NOW = new Date("2026-10-20T10:00:00.000Z");

const LEAD: Lead = {
  id: "lead_1",
  workspace_id: WS,
  first_name: "Sarah",
  last_name: "Chen",
  email: "sarah@acme.test",
  company: "Acme",
  job_title: "VP Sales",
  status: "new",
  tags: [],
  custom_fields: {},
  created_at: NOW.toISOString(),
};

const CAMPAIGN: ExecutorCampaign = {
  id: "camp_1",
  workspace_id: WS,
  name: "Voice campaign",
  type: "email",
  status: "active",
};

const ENROLLMENT: ExecutorEnrollment = {
  id: "enr_1",
  workspace_id: WS,
  campaign_id: "camp_1",
  lead_id: "lead_1",
  status: "active",
  current_step: 0,
  enrolled_at: NOW.toISOString(),
  last_step_at: null,
};

type RecordedInput = InsertMessageInput & { campaign_id?: string | null };

class FakeStore implements ExecutorStore {
  readonly simulated = false;
  messages: RecordedInput[] = [];
  activities: Array<{ campaign_id: string | null; action: string; details: string }> = [];
  private claims = new Map<string, StepExecutionRecord>();
  constructor(private steps: CampaignStep[]) {}
  async listEnrollments() {
    return [ENROLLMENT];
  }
  async getCampaign() {
    return CAMPAIGN;
  }
  async getSenderIdentity() {
    return null;
  }
  async getSteps() {
    return this.steps;
  }
  async getLead() {
    return LEAD;
  }
  async getLeadSignals() {
    return { repliedAt: null, suppressionReason: null };
  }
  async getWorkspacePlan() {
    return "growth" as const;
  }
  async countEmailsThisMonth() {
    return 0;
  }
  async claimStepExecution(
    input: Parameters<ExecutorStore["claimStepExecution"]>[0]
  ): Promise<StepExecutionRecord | null> {
    if (this.claims.has(input.idempotency_key)) return null;
    const record = {
      id: "exec_1",
      ...input,
      status: "sending",
      detail: "",
      message_id: null,
      provider: null,
      provider_message_id: null,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
    } as StepExecutionRecord;
    this.claims.set(input.idempotency_key, record);
    return record;
  }
  async completeStepExecution() {}
  async releaseStepExecution() {}
  async ensureConversation() {
    return "conv_1";
  }
  async insertMessage(input: RecordedInput): Promise<InboxMessage> {
    this.messages.push(input);
    return { id: "msg_1", conversation_id: input.conversation_id } as unknown as InboxMessage;
  }
  async updateEnrollment() {}
  async appendActivity(
    _ws: string,
    entry: { campaign_id: string | null; action: string; details: string }
  ) {
    this.activities.push(entry);
  }
}

class FakeAdapter implements EmailProviderAdapter {
  readonly provider = "fake-provider";
  calls: SendEmailInput[] = [];
  getState(): ProviderState {
    return "connected";
  }
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.calls.push(input);
    return {
      status: "sent",
      provider: "fake-provider",
      providerMessageId: "pm_1",
      message: "accepted",
    };
  }
}

function emailStep(config: Record<string, unknown>): CampaignStep {
  return {
    id: "step_1",
    campaign_id: "camp_1",
    step_order: 0,
    step_type: "email",
    delay_hours: 0,
    subject: "Quick note",
    content: "Hi {{first_name}} — voice note attached.",
    config,
  };
}

const AUDIO_B64 = bytesToBase64(new TextEncoder().encode("executor-voice-bytes"));

describe("executeDueSteps — step voice notes", () => {
  it("attaches a data-source step voice note and records the voice fields", async () => {
    const store = new FakeStore([
      emailStep({
        voice_note: {
          source: "data",
          dataUrl: audioDataUrl("audio/webm", AUDIO_B64),
          filename: "intro.webm",
          contentType: "audio/webm",
          durationSec: 23,
          language: "en-GB",
          transcript: "Hi Sarah, quick intro.",
        },
      }),
    ]);
    const adapter = new FakeAdapter();
    const summary = await executeDueSteps(
      { store, adapter, now: NOW },
      { workspaceId: WS }
    );
    expect(summary.sent).toBe(1);
    expect(adapter.calls).toHaveLength(1);
    const attachment = adapter.calls[0].attachments?.[0] as EmailAttachment;
    expect(attachment.filename).toBe("intro.webm");
    expect(attachment.contentType).toBe("audio/webm");
    expect(attachment.contentBase64).toBe(AUDIO_B64);
    expect(store.messages).toHaveLength(1);
    expect(store.messages[0].voice_note_duration_sec).toBe(23);
    expect(store.messages[0].voice_note_language).toBe("en-GB");
    expect(store.messages[0].transcript).toBe("Hi Sarah, quick intro.");
    expect(store.messages[0].voice_note_path).toContain("data:audio/webm");
    expect(
      store.activities.some((a) => a.details.includes("Voice note attached"))
    ).toBe(true);
  });

  it("storage-source note without a resolver: email sends, failure is logged, no fake voice fields", async () => {
    const store = new FakeStore([
      emailStep({
        voice_note: {
          source: "storage",
          path: "ws_1/note_9/intro.webm",
          filename: "intro.webm",
          contentType: "audio/webm",
          durationSec: 12,
          language: "en-US",
        },
      }),
    ]);
    const adapter = new FakeAdapter();
    const summary = await executeDueSteps(
      { store, adapter, now: NOW },
      { workspaceId: WS }
    );
    expect(summary.sent).toBe(1);
    expect(adapter.calls[0].attachments).toBeUndefined();
    expect(store.messages[0].voice_note_path ?? null).toBeNull();
    const complaint = store.activities.find(
      (a) => a.action === "voice_note_not_attached"
    );
    expect(complaint).toBeDefined();
    expect(complaint!.details).toMatch(/WITHOUT its voice note/);
  });

  it("storage-source note WITH a resolver attaches the downloaded bytes", async () => {
    const store = new FakeStore([
      emailStep({
        voice_note: {
          source: "storage",
          path: "ws_1/note_9/intro.webm",
          filename: "intro.webm",
          contentType: "audio/webm",
          durationSec: 12,
          language: "en-US",
        },
      }),
    ]);
    const adapter = new FakeAdapter();
    await executeDueSteps(
      {
        store,
        adapter,
        now: NOW,
        resolveVoiceAttachment: async (path) => {
          expect(path).toBe("ws_1/note_9/intro.webm");
          return {
            filename: "intro.webm",
            contentType: "audio/webm",
            contentBase64: AUDIO_B64,
          };
        },
      },
      { workspaceId: WS }
    );
    expect(adapter.calls[0].attachments?.[0].contentBase64).toBe(AUDIO_B64);
    expect(store.messages[0].voice_note_path).toBe("ws_1/note_9/intro.webm");
  });

  it("a step without a voice note sends exactly as before", async () => {
    const store = new FakeStore([emailStep({})]);
    const adapter = new FakeAdapter();
    const summary = await executeDueSteps(
      { store, adapter, now: NOW },
      { workspaceId: WS }
    );
    expect(summary.sent).toBe(1);
    expect(adapter.calls[0].attachments).toBeUndefined();
    expect(store.messages[0].voice_note_path ?? null).toBeNull();
  });
});
