-- ============================================================================
-- Migration 019 — Website support chat system (P10 Stage E)
-- ============================================================================
-- Why: NxtSend gains a real support-chat product: a knowledge-base
-- assistant + live human support for website visitors and signed-in
-- users, managed from Admin → Support. This migration creates its
-- eight tables:
--
--   support_conversations        one thread per visitor/user
--   support_messages             the thread's messages (incl. internal
--                                notes, which are NEVER exposed to
--                                visitors — enforced by the API DTOs)
--   support_knowledge_categories admin-managed KB taxonomy (rows, so
--                                admins can add/disable categories)
--   support_knowledge            KB entries; an entry is answerable
--                                only when status='published' AND
--                                enabled AND indexed_at IS NOT NULL
--                                (search_text/content_hash/indexed_at
--                                are maintained by the app write path
--                                in the same operation as the save)
--   support_saved_replies        reusable agent reply templates
--   support_settings             singleton ('global') behaviour/copy
--   support_agents               which admin profiles may work support
--                                (Sub-Admin = role 'admin' + enabled row
--                                here; eligibility is server-checked)
--   support_conversation_events  append-only product timeline
--                                (created/escalated/assigned/resolved…)
--
-- Access model — the house posture of 007/014/016/017: RLS ENABLED
-- with ZERO client policies on every table. Guests have no Supabase
-- identity, so ALL reads and writes run through the service role from
-- gated API routes (/api/support/* authorises by session or by the
-- SHA-256 hash of the guest cookie token; /api/admin/support/* runs
-- behind resolveAdminGate + the support permission matrix). A
-- conversation ID alone never authorises anything.
--
-- Transport note: there are deliberately NO Realtime policies or
-- publication changes here. The widget and the admin inbox poll the
-- API at short intervals (near-real-time, reconciled by the monotonic
-- support_messages.sequence_no) — Supabase Realtime for the admin
-- inbox is a documented optional phase 2 (SETUP.md §17).
--
-- Seeding: NO content is seeded by SQL. The knowledge base, categories,
-- saved replies and the settings singleton are seeded idempotently by
-- the app layer (src/lib/support/seeds.ts via the store's first-run
-- path) so admin edits are never overwritten by a re-run and the same
-- content backs Demo Mode fixtures.
--
-- Like migrations 001–018 this file is applied by the owner at
-- go-live, in order after 018; nothing here has been run against a
-- live database. Until it is applied, live mode has no support tables
-- and the support APIs fail closed (Demo Mode is unaffected — it uses
-- the in-process demo store).
-- ============================================================================

-- ── Conversations ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_conversations (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID        REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id                 UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  guest_name              TEXT,
  guest_email             TEXT,
  guest_access_token_hash TEXT        UNIQUE,
  guest_token_expires_at  TIMESTAMPTZ,
  status                  TEXT        NOT NULL DEFAULT 'open'
                            CHECK (status IN ('open', 'pending', 'resolved')),
  handling_mode           TEXT        NOT NULL DEFAULT 'bot'
                            CHECK (handling_mode IN ('bot', 'human')),
  source                  TEXT        NOT NULL DEFAULT 'marketing_widget'
                            CHECK (source IN ('marketing_widget', 'dashboard_widget', 'contact_form')),
  subject                 TEXT,
  first_message_preview   TEXT,
  last_message_preview    TEXT,
  last_message_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_visitor_message_at TIMESTAMPTZ,
  last_agent_message_at   TIMESTAMPTZ,
  visitor_unread_count    INT         NOT NULL DEFAULT 0 CHECK (visitor_unread_count >= 0),
  agent_unread_count      INT         NOT NULL DEFAULT 0 CHECK (agent_unread_count >= 0),
  assignee_id             UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  assigned_at             TIMESTAMPTZ,
  escalated_at            TIMESTAMPTZ,
  resolved_at             TIMESTAMPTZ,
  resolved_by             UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  pii_redacted_at         TIMESTAMPTZ,
  metadata                JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- A conversation must have an owner identity path: a registered user
  -- OR a guest token. A bare conversation ID is never an identity.
  CONSTRAINT support_conversations_owner_identity
    CHECK (user_id IS NOT NULL OR guest_access_token_hash IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_support_conversations_status_activity
  ON support_conversations (status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_conversations_mode_status_activity
  ON support_conversations (handling_mode, status, last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_conversations_assignee
  ON support_conversations (assignee_id, status);
CREATE INDEX IF NOT EXISTS idx_support_conversations_user
  ON support_conversations (user_id, last_message_at DESC);

ALTER TABLE support_conversations ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only, via gated routes.

-- ── Messages ───────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_messages (
  id                UUID   PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id   UUID   NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  -- Monotonic cursor for polling reconciliation (timestamps can tie).
  sequence_no       BIGINT GENERATED ALWAYS AS IDENTITY UNIQUE,
  sender_type       TEXT   NOT NULL
                      CHECK (sender_type IN ('visitor', 'user', 'ai', 'admin', 'agent')),
  sender_profile_id UUID   REFERENCES profiles(id) ON DELETE SET NULL,
  -- Display name snapshotted at send time; history never rewrites.
  sender_display_name TEXT,
  kind              TEXT   NOT NULL DEFAULT 'message'
                      CHECK (kind IN ('message', 'internal_note', 'system')),
  -- Plain text only, end to end. No HTML is stored or rendered.
  body              TEXT   NOT NULL,
  saved_reply_id    UUID,
  source_knowledge_id UUID,
  visitor_read_at   TIMESTAMPTZ,
  agent_read_at     TIMESTAMPTZ,
  -- Client-generated idempotency key for send retries.
  client_message_id TEXT,
  metadata          JSONB  NOT NULL DEFAULT '{}'::jsonb,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_messages_conversation_seq
  ON support_messages (conversation_id, sequence_no);
CREATE INDEX IF NOT EXISTS idx_support_messages_conversation_created
  ON support_messages (conversation_id, created_at);
-- Idempotent retries: the same client_message_id in one conversation
-- can only ever produce one message.
CREATE UNIQUE INDEX IF NOT EXISTS idx_support_messages_client_idempotency
  ON support_messages (conversation_id, client_message_id)
  WHERE client_message_id IS NOT NULL;

ALTER TABLE support_messages ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only, via gated routes.

-- ── Knowledge categories ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_knowledge_categories (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name        TEXT        NOT NULL,
  slug        TEXT        NOT NULL UNIQUE,
  description TEXT        NOT NULL DEFAULT '',
  enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  sort_order  INT         NOT NULL DEFAULT 0,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE support_knowledge_categories ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only, via gated routes.

-- ── Knowledge entries ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_knowledge (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID        NOT NULL REFERENCES support_knowledge_categories(id) ON DELETE RESTRICT,
  -- Stable seed identity; app seeding uses ON CONFLICT (slug) DO
  -- NOTHING so admin edits are never overwritten.
  slug        TEXT        NOT NULL UNIQUE,
  title       TEXT        NOT NULL,
  question    TEXT        NOT NULL,
  answer      TEXT        NOT NULL,
  keywords    TEXT[]      NOT NULL DEFAULT '{}',
  -- Same-site path (/…) or https://nxtsend.com URL only (service-validated).
  related_url TEXT,
  -- Tie-breaker ONLY — never a substitute for relevance.
  priority    INT         NOT NULL DEFAULT 50 CHECK (priority >= 0 AND priority <= 100),
  enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  status      TEXT        NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'published', 'archived')),
  -- Maintained by the app write path in the same operation as the save:
  -- search_text is the normalised searchable concatenation, content_hash
  -- proves what is indexed, indexed_at is set only when indexing ran.
  search_text TEXT        NOT NULL DEFAULT '',
  content_hash TEXT,
  indexed_at  TIMESTAMPTZ,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_knowledge_answerable
  ON support_knowledge (status, enabled, category_id, priority DESC);

ALTER TABLE support_knowledge ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only, via gated routes.

-- ── Saved replies ──────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_saved_replies (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title       TEXT        NOT NULL,
  category_id UUID        REFERENCES support_knowledge_categories(id) ON DELETE SET NULL,
  shortcut    TEXT,
  body        TEXT        NOT NULL,
  enabled     BOOLEAN     NOT NULL DEFAULT TRUE,
  created_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  updated_by  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Quick-insert shortcut is unique when present.
CREATE UNIQUE INDEX IF NOT EXISTS idx_support_saved_replies_shortcut
  ON support_saved_replies (shortcut)
  WHERE shortcut IS NOT NULL;

ALTER TABLE support_saved_replies ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only, via gated routes.

-- Message → saved reply / knowledge references. The body stores the
-- snapshot actually sent, so later template edits never rewrite
-- history; these FKs are traceability only.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_messages_saved_reply_fk'
  ) THEN
    ALTER TABLE support_messages
      ADD CONSTRAINT support_messages_saved_reply_fk
      FOREIGN KEY (saved_reply_id) REFERENCES support_saved_replies(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'support_messages_source_knowledge_fk'
  ) THEN
    ALTER TABLE support_messages
      ADD CONSTRAINT support_messages_source_knowledge_fk
      FOREIGN KEY (source_knowledge_id) REFERENCES support_knowledge(id) ON DELETE SET NULL;
  END IF;
END $$;

-- ── Settings (singleton) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS support_settings (
  id                        TEXT PRIMARY KEY CHECK (id = 'global'),
  -- Deterministic knowledge-base answers on/off.
  ai_kb_enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  -- Optional LLM grounded-rewriting layer (separate from KB answers;
  -- off until a provider is configured AND the owner enables it).
  ai_enhancement_enabled    BOOLEAN NOT NULL DEFAULT FALSE,
  live_support_enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  allow_user_escalation     BOOLEAN NOT NULL DEFAULT TRUE,
  display_name              TEXT    NOT NULL DEFAULT 'NxtSend Support',
  greeting                  TEXT    NOT NULL DEFAULT '',
  welcome_message           TEXT    NOT NULL DEFAULT '',
  offline_message           TEXT    NOT NULL DEFAULT '',
  closing_message           TEXT    NOT NULL DEFAULT '',
  support_email             TEXT    NOT NULL DEFAULT 'hello@nxtsend.com',
  updated_by                UUID    REFERENCES profiles(id) ON DELETE SET NULL,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE support_settings ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only, via gated routes.

-- ── Support agents ─────────────────────────────────────────────────────────
-- Eligibility is computed server-side: profile role admin/super_admin,
-- status active, AND enabled = TRUE here. Merely holding an admin login
-- does not grant customer-chat access.

CREATE TABLE IF NOT EXISTS support_agents (
  profile_id              UUID        PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  enabled                 BOOLEAN     NOT NULL DEFAULT FALSE,
  -- DECLARED state set by the agent's own toggle — not presence
  -- tracking. The widget may claim live availability only when live
  -- support is enabled AND at least one enabled agent is 'available'.
  availability            TEXT        NOT NULL DEFAULT 'offline'
                            CHECK (availability IN ('offline', 'available', 'busy')),
  availability_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_assigned_at        TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE support_agents ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only, via gated routes.

-- ── Conversation events (append-only product timeline) ─────────────────────
-- Assignment/status history is product data the inbox queries per
-- conversation; some events are caused by visitors or the system, who
-- are not audit_logs actors. Admin-caused mutations are ADDITIONALLY
-- mirrored into audit_logs by the API layer (SUPPORT_* actions).
-- Metadata holds IDs and codes only — never message bodies or emails.

CREATE TABLE IF NOT EXISTS support_conversation_events (
  id               UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id  UUID        NOT NULL REFERENCES support_conversations(id) ON DELETE CASCADE,
  event_type       TEXT        NOT NULL
                     CHECK (event_type IN (
                       'created', 'escalated', 'assigned', 'unassigned',
                       'transferred', 'status_changed', 'mode_changed',
                       'resolved', 'reopened', 'note_added'
                     )),
  actor_type       TEXT        NOT NULL
                     CHECK (actor_type IN ('visitor', 'user', 'ai', 'admin', 'agent', 'system')),
  actor_profile_id UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  from_status      TEXT,
  to_status        TEXT,
  from_assignee_id UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  to_assignee_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  from_mode        TEXT,
  to_mode          TEXT,
  metadata         JSONB       NOT NULL DEFAULT '{}'::jsonb,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_support_events_conversation
  ON support_conversation_events (conversation_id, created_at);

ALTER TABLE support_conversation_events ENABLE ROW LEVEL SECURITY;
-- No client policies on purpose: service role only, via gated routes.
