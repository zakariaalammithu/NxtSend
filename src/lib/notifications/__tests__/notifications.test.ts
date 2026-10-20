import { describe, it, expect, beforeEach } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { setDemoStorage, createMemoryStorage } from "@/lib/data/demo-store";
import { buildReplyNotification, countUnread } from "../core";
import {
  createDemoNotificationStore,
  createSupabaseNotificationStore,
} from "../store";

/**
 * Notifications (P5 Stage D, migration 012). Two backends, one
 * contract — the properties pinned here: workspace isolation (a
 * store bound to workspace A can never list or mark workspace B's
 * rows), read-state transitions, and the reply-notification wording
 * both ingestion stores share.
 */

const WS_A = "ws_a";
const WS_B = "ws_b";

function replyNotif(workspaceId: string) {
  return buildReplyNotification({
    workspaceId,
    conversationId: "conv_1",
    senderName: "Elena Rostova",
    senderEmail: "elena@scalewave.io",
    subject: "Re: Scaling founder-led outbound",
    preview: "Do you have 15 mins this Thursday?",
  });
}

describe("buildReplyNotification", () => {
  it("builds a workspace-wide reply notification linking to the conversation", () => {
    const n = replyNotif(WS_A);
    expect(n.type).toBe("reply_received");
    expect(n.user_id).toBeNull();
    expect(n.title).toBe("New reply from Elena Rostova");
    expect(n.body).toContain("Re: Scaling founder-led outbound");
    expect(n.link).toBe("/dashboard/inbox?conversation=conv_1");
  });

  it("falls back to the email address when no name is known", () => {
    const n = buildReplyNotification({
      workspaceId: WS_A,
      conversationId: "c",
      senderName: "",
      senderEmail: "a@b.c",
      subject: null,
      preview: "",
    });
    expect(n.title).toBe("New reply from a@b.c");
  });
});

describe("demo notification store", () => {
  beforeEach(() => {
    setDemoStorage(createMemoryStorage());
  });

  it("inserts, lists newest-first, counts unread and marks read", async () => {
    const store = createDemoNotificationStore();
    const first = await store.insert(replyNotif(WS_A));
    await store.insert({ ...replyNotif(WS_A), title: "Second" });
    expect(await store.unreadCount(WS_A)).toBe(2);

    const list = await store.list(WS_A);
    expect(list).toHaveLength(2);
    expect(countUnread(list)).toBe(2);

    expect(await store.markRead(WS_A, first.id)).toBe(true);
    expect(await store.unreadCount(WS_A)).toBe(1);
    // Marking an already-read row reports false (no double transition).
    expect(await store.markRead(WS_A, first.id)).toBe(false);

    expect(await store.markAllRead(WS_A)).toBe(1);
    expect(await store.unreadCount(WS_A)).toBe(0);
  });

  it("never leaks across workspaces", async () => {
    const store = createDemoNotificationStore();
    const mine = await store.insert(replyNotif(WS_A));
    await store.insert(replyNotif(WS_B));
    expect(await store.list(WS_A)).toHaveLength(1);
    expect(await store.list(WS_B)).toHaveLength(1);
    // Cross-tenant mark attempts are inert.
    expect(await store.markRead(WS_B, mine.id)).toBe(false);
    expect(await store.unreadCount(WS_A)).toBe(1);
  });
});

// ── Supabase store against a chainable fake client ──────────────────────────

type Row = Record<string, unknown>;

class FakeQuery {
  private filters: Array<{ col: string; val: unknown; isNull?: boolean }> = [];
  private op: "select" | "insert" | "update" = "select";
  private payload: Row | null = null;
  private countMode = false;

  constructor(
    private table: Row[],
    private counter: { n: number }
  ) {}

  insert(payload: Row) {
    this.op = "insert";
    this.payload = payload;
    return this;
  }
  update(payload: Row) {
    this.op = "update";
    this.payload = payload;
    return this;
  }
  select(_cols?: string, opts?: { count?: string; head?: boolean }) {
    if (opts?.count) this.countMode = true;
    return this;
  }
  eq(col: string, val: unknown) {
    this.filters.push({ col, val });
    return this;
  }
  is(col: string, val: unknown) {
    this.filters.push({ col, val, isNull: val === null });
    return this;
  }
  order() {
    return this;
  }
  limit() {
    return this;
  }

  private matches(row: Row): boolean {
    return this.filters.every((f) =>
      f.isNull ? row[f.col] === null || row[f.col] === undefined : row[f.col] === f.val
    );
  }

  private execSelect(): Row[] {
    return this.table.filter((r) => this.matches(r));
  }

  async single(): Promise<{ data: Row | null; error: { message: string } | null }> {
    if (this.op === "insert") {
      const row: Row = {
        id: `row_${++this.counter.n}`,
        created_at: new Date().toISOString(),
        read_at: null,
        ...this.payload,
      };
      this.table.push(row);
      return { data: row, error: null };
    }
    return { data: null, error: { message: "not an insert" } };
  }

  then<T>(resolve: (v: { data: Row[] | null; count?: number; error: null }) => T) {
    if (this.op === "update") {
      const changed: Row[] = [];
      for (const row of this.table) {
        if (this.matches(row)) {
          Object.assign(row, this.payload);
          changed.push(row);
        }
      }
      return resolve({ data: changed, error: null });
    }
    const rows = this.execSelect();
    return resolve({
      data: rows,
      count: this.countMode ? rows.length : undefined,
      error: null,
    });
  }
}

function fakeSupabase() {
  const table: Row[] = [];
  const counter = { n: 0 };
  const client = {
    from: () => new FakeQuery(table, counter),
  } as unknown as SupabaseClient;
  return { client, table };
}

describe("supabase notification store (fake client)", () => {
  it("inserts and reads back through the workspace filter", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseNotificationStore(client);
    const created = await store.insert(replyNotif(WS_A));
    expect(created.workspace_id).toBe(WS_A);
    expect(created.read_at).toBeNull();
    expect(await store.unreadCount(WS_A)).toBe(1);
    expect(await store.list(WS_A)).toHaveLength(1);
  });

  it("markRead is workspace-scoped — another tenant's id does not move", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseNotificationStore(client);
    const created = await store.insert(replyNotif(WS_A));
    expect(await store.markRead(WS_B, created.id)).toBe(false);
    expect(await store.unreadCount(WS_A)).toBe(1);
    expect(await store.markRead(WS_A, created.id)).toBe(true);
    expect(await store.unreadCount(WS_A)).toBe(0);
  });

  it("markAllRead only touches the caller's workspace", async () => {
    const { client } = fakeSupabase();
    const store = createSupabaseNotificationStore(client);
    await store.insert(replyNotif(WS_A));
    await store.insert(replyNotif(WS_B));
    expect(await store.markAllRead(WS_A)).toBe(1);
    expect(await store.unreadCount(WS_B)).toBe(1);
  });
});
