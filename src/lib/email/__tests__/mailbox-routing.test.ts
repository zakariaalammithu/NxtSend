import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  decideSendRoute,
  MailboxRoutingAdapter,
} from "../mailbox-router";
import { GmailEmailAdapter } from "../gmail";
import { executeDueSteps } from "@/lib/executor/core";
import type {
  ExecutorCampaign,
  ExecutorEnrollment,
  ExecutorStore,
  StepExecutionRecord,
} from "@/lib/executor/types";
import { sendInboxReply } from "@/lib/inbox/reply";
import type { InboxRepository } from "@/lib/data/inbox";
import { encryptToken } from "@/lib/oauth/crypto";
import type {
  OAuthConnectionRow,
  OAuthTokenStore,
} from "@/lib/oauth/types";
import type { ConnectedAccount, CampaignStep, Lead } from "@/types";
import type {
  EmailProviderAdapter,
  SendEmailInput,
  SendEmailResult,
} from "../types";

/**
 * Routing tests (P5 Stage G): the executor / inbox selection logic.
 *  - oauth account selected → the mailbox adapter sends, From = the
 *    mailbox address;
 *  - resend (or no) account → the Resend fallback, unchanged;
 *  - a selected-but-unusable OAuth mailbox → honest error and the
 *    fallback is NEVER used (a silent identity switch is worse than
 *    a failed step).
 * Provider HTTP is mocked; no real Google/Microsoft calls.
 */

const KEY = Buffer.alloc(32, 0x55).toString("base64");
const OAUTH_ENV = {
  GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "GOCSPX-secret",
  MICROSOFT_CLIENT_ID: "ms-client-id",
  MICROSOFT_CLIENT_SECRET: "ms-secret",
  TOKEN_ENCRYPTION_KEY: KEY,
  NEXT_PUBLIC_APP_URL: "https://app.nxtsend.example",
  NODE_ENV: "test",
};
const UNSUB_ENV = {
  NEXT_PUBLIC_APP_URL: "https://app.nxtsend.example",
  SUPABASE_SERVICE_ROLE_KEY: "svc-role-test-key",
};
const WS = "ws_1";
const NOW = new Date("2026-10-20T02:00:00.000Z");

const PREV_KEY = process.env.TOKEN_ENCRYPTION_KEY;
beforeAll(() => {
  process.env.TOKEN_ENCRYPTION_KEY = KEY;
});
afterAll(() => {
  if (PREV_KEY === undefined) delete process.env.TOKEN_ENCRYPTION_KEY;
  else process.env.TOKEN_ENCRYPTION_KEY = PREV_KEY;
});

function makeAccount(partial: Partial<ConnectedAccount> = {}): ConnectedAccount {
  return {
    id: "acct_gmail",
    workspace_id: WS,
    channel: "email",
    provider: "gmail",
    display_name: "Olivia Owner",
    handle_or_email: "owner@gmail.com",
    avatar_url: null,
    status: "connected",
    provider_account_id: "google-sub-42",
    auth_status: "ok",
    last_sync_at: null,
    last_error: null,
    warmup_enabled: false,
    daily_limits: {
      connection_requests: 20,
      messages: 40,
      inMails: 20,
      profile_views: 80,
      likes: 40,
      endorsements: 20,
    },
    sender_first_name: "Olivia",
    sender_last_name: "Owner",
    sender_job_title: "",
    sender_company: "",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...partial,
  } as ConnectedAccount;
}

function makeConnection(partial: Partial<OAuthConnectionRow> = {}): OAuthConnectionRow {
  return {
    id: "conn_google",
    workspace_id: WS,
    account_id: "acct_gmail",
    provider: "google",
    provider_account_email: "owner@gmail.com",
    scopes: "test",
    access_token_enc: encryptToken("access-token-1", OAUTH_ENV),
    refresh_token_enc: encryptToken("refresh-token-1", OAUTH_ENV),
    token_expires_at: new Date(Date.now() + 3600_000).toISOString(),
    status: "active",
    created_at: NOW.toISOString(),
    updated_at: NOW.toISOString(),
    ...partial,
  };
}

class SpyAdapter implements EmailProviderAdapter {
  readonly provider: string;
  calls: SendEmailInput[] = [];
  constructor(
    provider: string,
    private result: SendEmailResult
  ) {
    this.provider = provider;
  }
  getState() {
    return "connected" as const;
  }
  async sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
    this.calls.push(input);
    return this.result;
  }
}

const FALLBACK_SENT: SendEmailResult = {
  status: "sent",
  provider: "resend",
  providerMessageId: "resend-msg-1",
  message: "sent via resend",
};
const MAILBOX_SENT: SendEmailResult = {
  status: "sent",
  provider: "gmail",
  providerMessageId: "gmail-msg-1",
  message: "sent via gmail",
};

describe("decideSendRoute", () => {
  it("no account → fallback", () => {
    expect(decideSendRoute(null, null)).toEqual({ kind: "fallback" });
  });
  it("a Resend account → fallback", () => {
    expect(
      decideSendRoute(makeAccount({ provider: "resend" }), null)
    ).toEqual({ kind: "fallback" });
  });
  it("gmail account with no stored grant → refuse (never fallback)", () => {
    const d = decideSendRoute(makeAccount(), null);
    expect(d.kind).toBe("refuse");
    if (d.kind === "refuse") {
      expect(d.provider).toBe("google");
      expect(d.message).toContain("NOT used");
    }
  });
  it("gmail account with a needs_reconnect grant → refuse", () => {
    const d = decideSendRoute(
      makeAccount(),
      makeConnection({ status: "needs_reconnect" })
    );
    expect(d.kind).toBe("refuse");
  });
  it("microsoft account with expired auth → refuse", () => {
    const d = decideSendRoute(
      makeAccount({
        id: "acct_ms",
        provider: "microsoft",
        handle_or_email: "owner@contoso.com",
        auth_status: "expired",
      }),
      makeConnection({
        id: "conn_ms",
        account_id: "acct_ms",
        provider: "microsoft",
        provider_account_email: "owner@contoso.com",
      })
    );
    expect(d.kind).toBe("refuse");
    if (d.kind === "refuse") expect(d.provider).toBe("microsoft");
  });
  it("healthy gmail account + active grant → mailbox route", () => {
    const d = decideSendRoute(makeAccount(), makeConnection());
    expect(d.kind).toBe("mailbox");
    if (d.kind === "mailbox") {
      expect(d.provider).toBe("google");
      expect(d.connection.id).toBe("conn_google");
    }
  });
});

describe("MailboxRoutingAdapter delegation", () => {
  const INPUT: SendEmailInput = {
    workspaceId: WS,
    to: "lead@acme.test",
    subject: "Hi",
    text: "body",
    campaignId: "camp_1",
  };

  function router(opts: {
    account: ConnectedAccount | null;
    connection: OAuthConnectionRow | null;
  }) {
    const fallback = new SpyAdapter("resend", FALLBACK_SENT);
    const mailbox = new SpyAdapter("gmail", MAILBOX_SENT);
    const adapter = new MailboxRoutingAdapter({
      fallback,
      resolveAccount: async () => opts.account,
      loadConnection: async () => opts.connection,
      buildMailboxAdapter: () => mailbox,
    });
    return { adapter, fallback, mailbox };
  }

  it("oauth route: mailbox sends with From = the mailbox address; fallback untouched", async () => {
    const { adapter, fallback, mailbox } = router({
      account: makeAccount(),
      connection: makeConnection(),
    });
    const result = await adapter.sendEmail(INPUT);
    expect(result).toEqual(MAILBOX_SENT);
    expect(mailbox.calls).toHaveLength(1);
    expect(mailbox.calls[0].from).toBe("owner@gmail.com");
    expect(fallback.calls).toHaveLength(0);
  });

  it("refusal: honest error and the fallback is NEVER called", async () => {
    const { adapter, fallback, mailbox } = router({
      account: makeAccount({ auth_status: "needs_reconnect" }),
      connection: makeConnection(),
    });
    const result = await adapter.sendEmail(INPUT);
    expect(result.status).toBe("error");
    expect(result.provider).toBe("gmail");
    expect(result.providerMessageId).toBeNull();
    expect(fallback.calls).toHaveLength(0);
    expect(mailbox.calls).toHaveLength(0);
  });

  it("resend account: delegates to the fallback unchanged", async () => {
    const { adapter, fallback } = router({
      account: makeAccount({ provider: "resend" }),
      connection: null,
    });
    const result = await adapter.sendEmail(INPUT);
    expect(result).toEqual(FALLBACK_SENT);
    expect(fallback.calls).toHaveLength(1);
    expect(fallback.calls[0].from).toBeUndefined();
  });

  it("no account: delegates to the fallback", async () => {
    const { adapter, fallback } = router({ account: null, connection: null });
    await adapter.sendEmail(INPUT);
    expect(fallback.calls).toHaveLength(1);
  });
});

// ── Executor integration ────────────────────────────────────────────

class FakeExecutorStore implements ExecutorStore {
  readonly simulated = false;
  enrollments: ExecutorEnrollment[] = [];
  campaigns = new Map<string, ExecutorCampaign>();
  stepsByCampaign = new Map<string, CampaignStep[]>();
  leads = new Map<string, Lead>();
  claims = new Map<string, StepExecutionRecord>();
  activities: Array<{ campaign_id: string | null; action: string; details: string }> = [];
  private seq = 0;

  async listEnrollments(workspaceId: string | null) {
    return this.enrollments.filter(
      (e) => !workspaceId || e.workspace_id === workspaceId
    );
  }
  async getCampaign(workspaceId: string, campaignId: string) {
    const c = this.campaigns.get(campaignId);
    return c && c.workspace_id === workspaceId ? c : null;
  }
  async getSenderIdentity() {
    return null;
  }
  async getSteps(campaignId: string) {
    return this.stepsByCampaign.get(campaignId) ?? [];
  }
  async getLead(_ws: string, leadId: string) {
    return this.leads.get(leadId) ?? null;
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
    const record: StepExecutionRecord = {
      id: `exec_${++this.seq}`,
      workspace_id: input.workspace_id,
      campaign_id: input.campaign_id,
      enrollment_id: input.enrollment_id,
      lead_id: input.lead_id,
      step_order: input.step_order,
      step_type: input.step_type,
      channel: input.channel,
      status: "sending",
      detail: "",
      message_id: null,
      provider: null,
      provider_message_id: null,
      idempotency_key: input.idempotency_key,
      simulated: input.simulated,
      created_at: NOW.toISOString(),
      updated_at: NOW.toISOString(),
    };
    this.claims.set(input.idempotency_key, record);
    return record;
  }
  async completeStepExecution(
    id: string,
    patch: Partial<
      Pick<
        StepExecutionRecord,
        "status" | "detail" | "message_id" | "provider" | "provider_message_id"
      >
    >
  ) {
    for (const rec of Array.from(this.claims.values())) {
      if (rec.id === id) Object.assign(rec, patch);
    }
  }
  async releaseStepExecution(id: string) {
    for (const [key, rec] of Array.from(this.claims.entries())) {
      if (rec.id === id) this.claims.delete(key);
    }
  }
  async ensureConversation() {
    return "conv_1";
  }
  async insertMessage(input: Parameters<ExecutorStore["insertMessage"]>[0]) {
    return { id: "msg_row_1", conversation_id: input.conversation_id } as never;
  }
  async updateEnrollment(
    enrollmentId: string,
    patch: { status?: string; current_step?: number; last_step_at?: string | null }
  ) {
    const e = this.enrollments.find((x) => x.id === enrollmentId);
    if (!e) throw new Error("enrollment not found");
    if (patch.status !== undefined) e.status = patch.status;
    if (patch.current_step !== undefined) e.current_step = patch.current_step;
    if (patch.last_step_at !== undefined) e.last_step_at = patch.last_step_at;
  }
  async appendActivity(
    _ws: string,
    entry: { campaign_id: string | null; action: string; details: string }
  ) {
    this.activities.push(entry);
  }
}

class FakeOAuthStore implements OAuthTokenStore {
  constructor(private connection: OAuthConnectionRow) {}
  async getConnectionById() {
    return { ...this.connection };
  }
  async getConnectionByAccountId() {
    return { ...this.connection };
  }
  async listConnectionViews() {
    return [];
  }
  async persistConnection(): Promise<{ accountId: string; connectionId: string }> {
    throw new Error("unused");
  }
  async updateTokens() {}
  async setConnectionStatus() {}
  async updateAccountAuth() {}
  async deleteConnection() {}
}

function gmailFetch() {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const impl = vi.fn(async (url: unknown, init?: RequestInit) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes("gmail/v1/users/me/messages/send")) {
      return {
        ok: true,
        status: 200,
        json: async () => ({ id: "gmail-msg-exec-1" }),
        text: async () => "",
      } as unknown as Response;
    }
    throw new Error(`unexpected fetch: ${u}`);
  });
  return { impl: impl as unknown as typeof fetch, calls };
}

function buildExecutorRun(account: ConnectedAccount | null) {
  const store = new FakeExecutorStore();
  const campaign: ExecutorCampaign = {
    id: "camp_1",
    workspace_id: WS,
    name: "Routing campaign",
    type: "email",
    status: "active",
  };
  store.campaigns.set("camp_1", campaign);
  store.leads.set("lead_1", {
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
  } as Lead);
  store.enrollments = [
    {
      id: "enr_1",
      workspace_id: WS,
      campaign_id: "camp_1",
      lead_id: "lead_1",
      status: "active",
      current_step: 0,
      enrolled_at: new Date(NOW.getTime() - 7200_000).toISOString(),
      last_step_at: null,
    },
  ];
  store.stepsByCampaign.set("camp_1", [
    {
      id: "step_1",
      campaign_id: "camp_1",
      step_order: 0,
      step_type: "email",
      delay_hours: 0,
      subject: "Intro",
      content: "Hi {{first_name}}",
      config: {},
    } as CampaignStep,
  ]);

  const { impl, calls } = gmailFetch();
  const connection = makeConnection();
  const fallback = new SpyAdapter("resend", FALLBACK_SENT);
  const adapter = new MailboxRoutingAdapter({
    fallback,
    resolveAccount: async () => account,
    loadConnection: async () => (account ? connection : null),
    buildMailboxAdapter: (_provider, conn) =>
      new GmailEmailAdapter({
        connectionId: conn.id,
        store: new FakeOAuthStore(conn),
        adminClient: null,
        suppressionCheck: async () => false,
        stateOverride: "connected",
        skipMessageRecord: true,
        unsubscribeEnv: UNSUB_ENV,
        env: OAUTH_ENV,
        fetchFn: impl,
      }),
  });
  return { store, adapter, fallback, calls };
}

describe("executor routing integration", () => {
  it("a campaign on a Gmail account sends through Gmail and records the provider", async () => {
    const { store, adapter, fallback, calls } = buildExecutorRun(makeAccount());
    await executeDueSteps({ store, adapter, now: NOW }, { workspaceId: WS });
    const claims = Array.from(store.claims.values());
    expect(claims).toHaveLength(1);
    expect(claims[0].status).toBe("sent");
    expect(claims[0].provider).toBe("gmail");
    expect(claims[0].provider_message_id).toBe("gmail-msg-exec-1");
    expect(calls.some((c) => c.url.includes("messages/send"))).toBe(true);
    expect(fallback.calls).toHaveLength(0);
    expect(store.enrollments[0].current_step).toBe(1);
  });

  it("a campaign with a disconnected Gmail account is NOT sent — no fallback, step stays due", async () => {
    const { store, adapter, fallback, calls } = buildExecutorRun(
      makeAccount({ auth_status: "needs_reconnect" })
    );
    const summary = await executeDueSteps(
      { store, adapter, now: NOW },
      { workspaceId: WS }
    );
    // Executor semantics for error/not_configured: the claim is
    // RELEASED (the step remains due for a later scan) and the refusal
    // is recorded verbatim in the campaign activity log.
    expect(summary.errors).toBe(1);
    expect(summary.sent).toBe(0);
    expect(store.claims.size).toBe(0);
    const failures = store.activities.filter((a) => a.action === "step_send_failed");
    expect(failures).toHaveLength(1);
    expect(failures[0].details).toContain("NOT used");
    expect(failures[0].details).toContain("needs_reconnect");
    // The enrollment did not advance and NOTHING was sent anywhere.
    expect(store.enrollments[0].current_step).toBe(0);
    expect(fallback.calls).toHaveLength(0);
    expect(calls).toHaveLength(0);
  });
});

// ── Inbox reply integration ─────────────────────────────────────────

describe("inbox reply routing integration", () => {
  function fakeRepo() {
    const messages: Array<Record<string, unknown>> = [];
    let seq = 0;
    const repo = {
      mode: "live",
      async getThread(_ws: string, conversationId: string) {
        return {
          conversation: {
            id: conversationId,
            workspace_id: WS,
            lead_id: "lead_1",
            channel: "email",
            contact_email: "sarah@acme.test",
            subject: "Intro",
            status: "open",
          },
          messages: [],
        };
      },
      async findMessageByIdempotencyKey() {
        return null;
      },
      async insertMessage(input: Record<string, unknown>) {
        const row = { id: `rmsg_${++seq}`, ...input };
        messages.push(row);
        return row;
      },
      async updateMessage(_ws: string, id: string, patch: Record<string, unknown>) {
        const row = messages.find((m) => m.id === id);
        if (row) Object.assign(row, patch);
        return row;
      },
      async touchConversation() {},
    };
    return { repo: repo as unknown as InboxRepository, messages };
  }

  it("a reply on a Gmail-routed conversation sends through Gmail", async () => {
    const { repo, messages } = fakeRepo();
    const { impl } = gmailFetch();
    const connection = makeConnection();
    const fallback = new SpyAdapter("resend", FALLBACK_SENT);
    const adapter = new MailboxRoutingAdapter({
      fallback,
      resolveAccount: async () => makeAccount(),
      loadConnection: async () => connection,
      buildMailboxAdapter: (_provider, conn) =>
        new GmailEmailAdapter({
          connectionId: conn.id,
          store: new FakeOAuthStore(conn),
          adminClient: null,
          suppressionCheck: async () => false,
          stateOverride: "connected",
          skipMessageRecord: true,
          unsubscribeEnv: UNSUB_ENV,
          env: OAUTH_ENV,
          fetchFn: impl,
        }),
    });
    const outcome = await sendInboxReply(
      { repo, adapter },
      {
        workspaceId: WS,
        conversationId: "conv_1",
        content: "Thanks — Thursday works.",
        idempotencyKey: "reply-key-1",
      }
    );
    expect(outcome.ok).toBe(true);
    if (outcome.ok) {
      expect(outcome.message.provider).toBe("gmail");
      expect(outcome.message.provider_message_id).toBe("gmail-msg-exec-1");
    }
    expect(fallback.calls).toHaveLength(0);
    expect(messages).toHaveLength(1);
  });
});
