-- ============================================================================
-- Migration 005 — Inbox: conversations, message read state, reply idempotency
-- ============================================================================
-- Why: Round 1 stored outreach messages flat in `messages` (migration 001)
-- with provider linkage added by 004, but the Unified Inbox had no
-- conversation model at all: no thread identity, no read/unread state, and
-- no duplicate-send protection for replies. This migration adds exactly
-- that, without changing any existing column or policy semantics:
--
--   * `conversations` — one thread per (workspace, contact, channel).
--   * `messages.conversation_id` — thread membership (nullable so legacy /
--     campaign rows written before this migration stay valid).
--   * `messages.read_at` — per-message read marker for INBOUND messages.
--     Unread = direction 'inbound' AND read_at IS NULL. Marking a thread
--     read sets read_at on its unread inbound rows (the API route does it
--     through the session client, so the UPDATE policy below is required).
--   * `messages.idempotency_key` + `messages.error` — a reply attempt is
--     created as a row BEFORE the provider call, keyed by a client-supplied
--     idempotency key (unique per conversation). A retry re-uses the same
--     row, so a reply can never be sent twice by retrying. `error` keeps
--     the provider's failure text on the row instead of losing it.
--   * A partial unique index on (provider, provider_message_id) so an
--     inbound email ingested twice (webhook redelivery) can never create
--     two message rows — dedupe backstop behind `email_events`.
--
-- A backfill at the end groups pre-existing lead-linked messages into
-- conversations so older workspaces keep their history. It is a no-op on
-- a fresh database.
-- ============================================================================

-- ── Conversations ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS conversations (
  id              UUID            PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    UUID            NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  lead_id         UUID            REFERENCES leads(id) ON DELETE SET NULL,
  channel         message_channel NOT NULL,
  subject         TEXT,
  contact_email   TEXT            NOT NULL DEFAULT '',
  contact_name    TEXT            NOT NULL DEFAULT '',
  status          TEXT            NOT NULL DEFAULT 'open'
                    CHECK (status IN ('open', 'archived')),
  assignee_id     UUID            REFERENCES profiles(id) ON DELETE SET NULL,
  is_demo         BOOLEAN         NOT NULL DEFAULT FALSE,
  last_message_at TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  created_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ     NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_workspace
  ON conversations (workspace_id, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_conversations_lead
  ON conversations (lead_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact_email
  ON conversations (workspace_id, lower(contact_email));

ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "conversations: members can select" ON conversations
  FOR SELECT USING (is_workspace_member(workspace_id));

CREATE POLICY "conversations: members can insert" ON conversations
  FOR INSERT WITH CHECK (is_workspace_member(workspace_id));

CREATE POLICY "conversations: members can update" ON conversations
  FOR UPDATE USING (is_workspace_member(workspace_id));

CREATE POLICY "conversations: members can delete" ON conversations
  FOR DELETE USING (is_workspace_member(workspace_id));

-- ── Messages: thread membership, read state, idempotency, error ────────────

ALTER TABLE messages ADD COLUMN IF NOT EXISTS conversation_id UUID
  REFERENCES conversations(id) ON DELETE CASCADE;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS read_at TIMESTAMPTZ;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS error TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_conversation
  ON messages (conversation_id, sent_at);
CREATE INDEX IF NOT EXISTS idx_messages_unread
  ON messages (workspace_id, conversation_id)
  WHERE direction = 'inbound' AND read_at IS NULL;

-- One reply attempt per (conversation, idempotency key): the retry path
-- updates this row instead of inserting a second one.
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_idempotency
  ON messages (conversation_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- An inbound email (or any provider message) is stored at most once.
CREATE UNIQUE INDEX IF NOT EXISTS uq_messages_provider_message
  ON messages (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

-- The inbox marks threads read and updates reply rows through the
-- session client; migration 001 only granted SELECT/INSERT on messages.
CREATE POLICY "messages: members can update" ON messages
  FOR UPDATE USING (is_workspace_member(workspace_id));

-- ── Backfill: group legacy lead-linked messages into conversations ─────────
-- One conversation per (workspace, lead, channel); subject/contact come
-- from the lead and the earliest email subject in the thread.

INSERT INTO conversations (workspace_id, lead_id, channel, subject, contact_email, contact_name, last_message_at)
SELECT
  g.workspace_id,
  g.lead_id,
  g.channel,
  (
    SELECT m2.subject FROM messages m2
    WHERE m2.workspace_id = g.workspace_id AND m2.lead_id = g.lead_id
      AND m2.channel = g.channel AND m2.subject IS NOT NULL
    ORDER BY m2.sent_at ASC LIMIT 1
  ),
  COALESCE(l.email, ''),
  COALESCE(NULLIF(TRIM(COALESCE(l.first_name, '') || ' ' || COALESCE(l.last_name, '')), ''), ''),
  g.last_at
FROM (
  SELECT workspace_id, lead_id, channel, MAX(sent_at) AS last_at
  FROM messages
  WHERE lead_id IS NOT NULL AND conversation_id IS NULL
  GROUP BY workspace_id, lead_id, channel
) g
JOIN leads l ON l.id = g.lead_id
WHERE NOT EXISTS (
  SELECT 1 FROM conversations c
  WHERE c.workspace_id = g.workspace_id AND c.lead_id = g.lead_id AND c.channel = g.channel
);

UPDATE messages m
SET conversation_id = c.id
FROM conversations c
WHERE m.conversation_id IS NULL
  AND m.lead_id IS NOT NULL
  AND c.workspace_id = m.workspace_id
  AND c.lead_id = m.lead_id
  AND c.channel = m.channel;
