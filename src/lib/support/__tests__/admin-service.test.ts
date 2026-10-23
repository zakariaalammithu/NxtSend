import { describe, it, expect } from "vitest";
import {
  createSupportCategory,
  createSupportKnowledge,
  createSupportSavedReply,
  deleteSupportCategory,
  getSupportSettings,
  getSupportThread,
  listSupportAgents,
  listSupportConversations,
  postSupportAgentMessage,
  previewSupportAnswer,
  updateSupportAgent,
  updateSupportConversation,
  updateSupportKnowledge,
  updateSupportSettings,
} from "../admin-service";
import { DEMO_SUPPORT_PROFILES, DemoSupportStore } from "../demo-store";
import {
  supportPermissions,
  type SupportActor,
} from "../permissions";
import { getCurrentSupportConversation } from "../public-service";
import type { SupportStore } from "../store";

const [SUPER, AGENT, OFFDUTY] = DEMO_SUPPORT_PROFILES;

function actorFor(
  profile: (typeof DEMO_SUPPORT_PROFILES)[number],
  agentEnabled: boolean
): SupportActor {
  return {
    profileId: profile.id,
    email: profile.email,
    displayName: profile.full_name,
    role: profile.role,
    agentEnabled,
    senderType: profile.role === "super_admin" ? "admin" : "agent",
  };
}

const superActor = actorFor(SUPER, true);
const agentActor = actorFor(AGENT, true);
const offDutyActor = actorFor(OFFDUTY, false);
const otherAgentActor: SupportActor = {
  profileId: "agent-elsewhere",
  email: "elsewhere@nxtsend.example",
  displayName: "Agent Elsewhere",
  role: "admin",
  agentEnabled: true,
  senderType: "agent",
};

const perms = (actor: SupportActor) => supportPermissions(actor.role, actor.agentEnabled);

async function fixtureConversation(store: SupportStore, guestNamePart: string) {
  const { conversations } = await store.listConversations({});
  const found = conversations.find((c) => (c.guest_name ?? "").includes(guestNamePart));
  if (!found) throw new Error(`fixture conversation missing: ${guestNamePart}`);
  return found;
}

describe("permission matrix", () => {
  it("super_admin can do everything, including settings and assigning to others", () => {
    const p = perms(superActor);
    expect(p.canManageSettings).toBe(true);
    expect(p.canAssignOthers).toBe(true);
    expect(p.canManageAgents).toBe(true);
    expect(p.canViewInbox).toBe(true);
  });

  it("an admin WITH an enabled agent row gets inbox/KB/replies but NOT settings or assigning to others", () => {
    const p = perms(agentActor);
    expect(p.canViewInbox).toBe(true);
    expect(p.canReply).toBe(true);
    expect(p.canClaim).toBe(true);
    expect(p.canManageKnowledge).toBe(true);
    expect(p.canManageSavedReplies).toBe(true);
    expect(p.canManageSettings).toBe(false);
    expect(p.canAssignOthers).toBe(false);
    expect(p.canManageAgents).toBe(false);
  });

  it("an admin WITHOUT an enabled agent row gets nothing", () => {
    const p = perms(offDutyActor);
    expect(p.canAccessSupport).toBe(false);
    expect(p.canViewInbox).toBe(false);
    expect(p.canManageKnowledge).toBe(false);
  });

  it("a plain user gets nothing", () => {
    const p = supportPermissions("user", true);
    expect(p.canAccessSupport).toBe(false);
  });
});

describe("inbox access control", () => {
  it("list + thread are 403 for an admin without an agent row", async () => {
    const store = new DemoSupportStore();
    const list = await listSupportConversations(store, offDutyActor, perms(offDutyActor), {});
    expect(list.status).toBe(403);
    const tom = await fixtureConversation(store, "Tom");
    const thread = await getSupportThread(store, offDutyActor, perms(offDutyActor), tom.id);
    expect(thread.status).toBe(403);
  });

  it("an enabled agent sees the queues with counts", async () => {
    const store = new DemoSupportStore();
    const list = await listSupportConversations(store, agentActor, perms(agentActor), {});
    expect(list.status).toBe(200);
    const counts = list.body.counts as { all: number; waiting_for_reply: number };
    expect(counts.all).toBe(4);
    expect(counts.waiting_for_reply).toBeGreaterThanOrEqual(1);
  });
});

describe("reply workflow", () => {
  it("replying to an unassigned conversation claims it and snapshots the sender", async () => {
    const store = new DemoSupportStore();
    const tom = await fixtureConversation(store, "Tom");
    expect(tom.assignee_id).toBeNull();

    const result = await postSupportAgentMessage(store, agentActor, perms(agentActor), tom.id, {
      body: "Hi Tom — a CSV row needs an email or a LinkedIn URL; duplicates are skipped. Can you share which rows were skipped?",
    });
    expect(result.status).toBe(201);
    const after = await store.getConversation(tom.id);
    expect(after?.assignee_id).toBe(AGENT.id);
    expect(after?.status).toBe("pending");
    expect(after?.agent_unread_count).toBe(0);
    const events = await store.listEvents(tom.id);
    expect(events.some((e) => e.event_type === "assigned")).toBe(true);
    expect(result.audit?.action).toBe("SUPPORT_REPLY_SENT");
  });

  it("an agent cannot reply to a conversation assigned to another agent", async () => {
    const store = new DemoSupportStore();
    const alex = (await store.listConversations({})).conversations.find(
      (c) => c.user_id === "demo-user-alex"
    );
    expect(alex?.assignee_id).toBe(AGENT.id);
    const result = await postSupportAgentMessage(
      store,
      otherAgentActor,
      perms(otherAgentActor),
      alex!.id,
      { body: "butting in" }
    );
    expect(result.status).toBe(403);
  });

  it("internal notes are visible in the admin thread but never in the visitor projection", async () => {
    const store = new DemoSupportStore();
    const tom = await fixtureConversation(store, "Tom");
    const note = await postSupportAgentMessage(store, agentActor, perms(agentActor), tom.id, {
      body: "Internal: likely a duplicate-heavy CSV.",
      kind: "internal_note",
    });
    expect(note.status).toBe(201);

    const thread = await getSupportThread(store, agentActor, perms(agentActor), tom.id);
    const adminMessages = thread.body.messages as Array<{ kind: string; body: string }>;
    expect(adminMessages.some((m) => m.kind === "internal_note")).toBe(true);

    const visitor = await getCurrentSupportConversation(store, {
      user: null,
      guestTokenHash: "demo-fixture-hash-tom",
    });
    expect(visitor.status).toBe(200);
    const visitorMessages = visitor.body.messages as Array<{ kind: string; body: string }>;
    expect(visitorMessages.some((m) => m.body.includes("Internal:"))).toBe(false);
  });

  it("a saved reply supplies a snapshotted body; later edits do not rewrite the sent message", async () => {
    const store = new DemoSupportStore();
    const created = await createSupportSavedReply(store, agentActor, perms(agentActor), {
      title: "Test template",
      body: "Original template text.",
      category_id: null,
      shortcut: null,
      enabled: true,
    });
    expect(created.status).toBe(201);
    const replyId = (created.body.reply as { id: string }).id;

    const tom = await fixtureConversation(store, "Tom");
    const sent = await postSupportAgentMessage(store, agentActor, perms(agentActor), tom.id, {
      savedReplyId: replyId,
    });
    expect(sent.status).toBe(201);
    const sentMessage = sent.body.message as { body: string; saved_reply_id: string };
    expect(sentMessage.body).toBe("Original template text.");
    expect(sentMessage.saved_reply_id).toBe(replyId);

    const { updateSupportSavedReply } = await import("../admin-service");
    await updateSupportSavedReply(store, agentActor, perms(agentActor), replyId, {
      body: "Edited template text.",
    });
    const messages = await store.listMessages(tom.id, { includeInternal: true });
    const stored = messages.find((m) => m.saved_reply_id === replyId);
    expect(stored?.body).toBe("Original template text.");
  });
});

describe("assignment & status", () => {
  it("agents claim unassigned conversations for themselves; assigning to others is super only", async () => {
    const store = new DemoSupportStore();
    const tom = await fixtureConversation(store, "Tom");

    const claim = await updateSupportConversation(store, agentActor, perms(agentActor), tom.id, {
      assignee_id: AGENT.id,
    });
    expect(claim.status).toBe(200);
    expect((await store.getConversation(tom.id))?.assignee_id).toBe(AGENT.id);

    const maya = await fixtureConversation(store, "Maya");
    const toOther = await updateSupportConversation(store, agentActor, perms(agentActor), maya.id, {
      assignee_id: SUPER.id,
    });
    expect(toOther.status).toBe(403);

    const bySuper = await updateSupportConversation(store, superActor, perms(superActor), maya.id, {
      assignee_id: AGENT.id,
    });
    expect(bySuper.status).toBe(200);
    const events = await store.listEvents(maya.id);
    expect(events.some((e) => e.event_type === "assigned" && e.to_assignee_id === AGENT.id)).toBe(true);
    expect(bySuper.audit?.action).toBe("SUPPORT_ASSIGNED");
  });

  it("assigning to someone who is not an enabled agent is rejected", async () => {
    const store = new DemoSupportStore();
    const maya = await fixtureConversation(store, "Maya");
    const result = await updateSupportConversation(store, superActor, perms(superActor), maya.id, {
      assignee_id: OFFDUTY.id,
    });
    expect(result.status).toBe(400);
  });

  it("resolving posts the closing message and records the event + audit", async () => {
    const store = new DemoSupportStore();
    const tom = await fixtureConversation(store, "Tom");
    const result = await updateSupportConversation(store, superActor, perms(superActor), tom.id, {
      status: "resolved",
    });
    expect(result.status).toBe(200);
    const after = await store.getConversation(tom.id);
    expect(after?.status).toBe("resolved");
    expect(after?.resolved_by).toBe(SUPER.id);
    const messages = await store.listMessages(tom.id, { includeInternal: true });
    expect(messages.some((m) => m.metadata.system_copy === "closing")).toBe(true);
    const events = await store.listEvents(tom.id);
    expect(events.some((e) => e.event_type === "resolved")).toBe(true);
    expect(result.audit?.action).toBe("SUPPORT_RESOLVED");
  });
});

describe("knowledge management", () => {
  it("create -> draft is not answerable; publish makes it answerable; duplicate question is a 409", async () => {
    const store = new DemoSupportStore();
    const categories = await store.listCategories();
    const created = await createSupportKnowledge(store, agentActor, perms(agentActor), {
      category_id: categories[0].id,
      title: "Zorblax handling",
      question: "What is a zorblax?",
      answer: "A test fixture entry.",
      keywords: ["zorblax"],
      related_url: null,
      priority: 50,
      enabled: true,
      status: "draft",
    });
    expect(created.status).toBe(201);
    const entry = created.body.entry as { id: string; indexed_at: string | null };
    expect(entry.indexed_at).not.toBeNull();
    expect((await store.listAnswerable()).some((a) => a.entry.id === entry.id)).toBe(false);

    const published = await updateSupportKnowledge(store, agentActor, perms(agentActor), entry.id, {
      status: "published",
    });
    expect(published.status).toBe(200);
    expect((await store.listAnswerable()).some((a) => a.entry.id === entry.id)).toBe(true);

    const duplicate = await createSupportKnowledge(store, agentActor, perms(agentActor), {
      category_id: categories[0].id,
      title: "Zorblax again",
      question: "what is a zorblax",
      answer: "Duplicate.",
      keywords: [],
      related_url: null,
      priority: 50,
      enabled: true,
      status: "draft",
    });
    expect(duplicate.status).toBe(409);
    expect(duplicate.body.code).toBe("duplicate_question");
  });

  it("category lifecycle: create, and delete blocked while entries reference it", async () => {
    const store = new DemoSupportStore();
    const created = await createSupportCategory(store, agentActor, perms(agentActor), {
      name: "Webinars",
      description: "Questions about webinars.",
      enabled: true,
      sort_order: 9,
    });
    expect(created.status).toBe(201);
    const categoryId = (created.body.category as { id: string }).id;

    const entry = await createSupportKnowledge(store, agentActor, perms(agentActor), {
      category_id: categoryId,
      title: "Webinar schedule",
      question: "When is the next webinar?",
      answer: "Check the Academy page for the schedule.",
      keywords: ["webinar"],
      related_url: "/academy",
      priority: 50,
      enabled: true,
      status: "draft",
    });
    expect(entry.status).toBe(201);

    const blocked = await deleteSupportCategory(store, agentActor, perms(agentActor), categoryId);
    expect(blocked.status).toBe(409);
  });

  it("preview runs the real pipeline and writes nothing", async () => {
    const store = new DemoSupportStore();
    const before = await store.listConversations({});
    const preview = await previewSupportAnswer(store, agentActor, perms(agentActor), {
      question: "How much does NxtSend cost?",
    });
    expect(preview.status).toBe(200);
    const body = preview.body.preview as {
      band: string;
      engine: string;
      answer: string | null;
      candidates: Array<{ slug: string; score: number }>;
    };
    expect(body.band).toBe("direct");
    expect(body.engine).toBe("kb_match");
    expect(body.answer).toContain("$49");
    expect(body.candidates[0].slug).toBe("how-much-does-nxtsend-cost");
    const after = await store.listConversations({});
    expect(after.conversations.length).toBe(before.conversations.length);
  });
});

describe("settings & agents administration", () => {
  it("settings are super_admin only, and changes take effect", async () => {
    const store = new DemoSupportStore();
    const asAgent = await getSupportSettings(store, agentActor, perms(agentActor));
    expect(asAgent.status).toBe(403);
    const putAsAgent = await updateSupportSettings(store, agentActor, perms(agentActor), {
      display_name: "Hijacked",
    });
    expect(putAsAgent.status).toBe(403);

    const put = await updateSupportSettings(store, superActor, perms(superActor), {
      display_name: "NxtSend Help",
      ai_kb_enabled: false,
    });
    expect(put.status).toBe(200);
    const settings = await store.getSettings();
    expect(settings.display_name).toBe("NxtSend Help");
    expect(settings.ai_kb_enabled).toBe(false);
    expect(put.audit?.action).toBe("SUPPORT_SETTINGS_UPDATED");
  });

  it("agents: own availability is self-service; enabling others is super only", async () => {
    const store = new DemoSupportStore();
    const ownAvailability = await updateSupportAgent(store, agentActor, perms(agentActor), {
      profile_id: AGENT.id,
      availability: "available",
    });
    expect(ownAvailability.status).toBe(200);

    const enableOther = await updateSupportAgent(store, agentActor, perms(agentActor), {
      profile_id: OFFDUTY.id,
      enabled: true,
    });
    expect(enableOther.status).toBe(403);

    const bySuper = await updateSupportAgent(store, superActor, perms(superActor), {
      profile_id: OFFDUTY.id,
      enabled: true,
    });
    expect(bySuper.status).toBe(200);
    const list = await listSupportAgents(store, superActor, perms(superActor));
    const agents = list.body.agents as Array<{ profile_id: string; eligible: boolean }>;
    expect(agents.find((a) => a.profile_id === OFFDUTY.id)?.eligible).toBe(true);
  });
});
