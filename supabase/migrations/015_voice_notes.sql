-- ============================================================================
-- Migration 015 — Voice notes: message columns + private storage bucket
-- (P6 Stage C)
-- ============================================================================
-- Why: voice notes let a user record a short audio message and send
-- it with an email (inbox reply or sequence step). The audio bytes
-- themselves do NOT belong in the messages table — they live in a
-- private Supabase Storage bucket; the message row keeps only the
-- pointer + metadata:
--
--   * `voice_note_path` — the bucket object path
--     (`<workspace_id>/<note_id>/<filename>`), whose first segment is
--     the owning workspace (the storage RLS policies below key on
--     exactly that segment). In Demo Mode no row ever reaches this
--     table with a data: URL — demo data lives in the browser demo
--     store; this column is live-mode only.
--   * `voice_note_duration_sec` — the recorded length in seconds.
--   * `voice_note_language` — the BCP-47 locale the note was recorded
--     / dictated in (voice catalogue, src/lib/voice/languages.ts).
--   * `transcript` — the note's transcript when one was produced
--     (browser dictation or Whisper); a voice-only reply stores the
--     transcript as its message body so threads stay readable.
--
-- Delivery honesty: a voice note is delivered as an EMAIL attachment
-- (Resend / Gmail / Graph). There is NO LinkedIn voice-note delivery
-- — no approved LinkedIn provider exists — and nothing in this
-- migration changes that.
--
-- Bucket: `voice-notes` is PRIVATE (public = false): no public URL
-- exists for any object. Reads/writes from the app go through
-- server routes using the service role AFTER session + workspace
-- checks, and playback uses short-lived signed URLs. The storage RLS
-- policies additionally scope any direct authenticated access to
-- objects under a workspace the caller belongs to (first folder
-- segment = workspace id, compared as TEXT so a malformed path can
-- never error the policy's cast).
--
-- Like migrations 001–014 this file is applied by the owner at
-- go-live; nothing here has been run against a live database.
-- ============================================================================

-- ── Message voice-note columns ──────────────────────────────────────────────

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS voice_note_path TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS voice_note_duration_sec INTEGER
    CHECK (voice_note_duration_sec IS NULL OR voice_note_duration_sec >= 0);

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS voice_note_language TEXT;

ALTER TABLE messages
  ADD COLUMN IF NOT EXISTS transcript TEXT;

CREATE INDEX IF NOT EXISTS idx_messages_voice_note_path
  ON messages (voice_note_path)
  WHERE voice_note_path IS NOT NULL;

-- ── Private storage bucket ──────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'voice-notes',
  'voice-notes',
  false,
  10485760, -- 10 MB per object (matches MAX_VOICE_NOTE_BYTES in the app)
  ARRAY['audio/webm', 'audio/mp4', 'audio/ogg', 'audio/mpeg', 'audio/wav', 'audio/x-m4a']
)
ON CONFLICT (id) DO NOTHING;

-- ── Storage RLS: objects are scoped to the uploader's workspace ───────────
-- Path layout: <workspace_id>/<note_id>/<filename>. A caller may only
-- touch objects whose first folder segment is a workspace they are a
-- member of (same membership source as is_workspace_member, compared
-- as text to avoid casting untrusted path segments).

DROP POLICY IF EXISTS "voice-notes: members can select" ON storage.objects;
CREATE POLICY "voice-notes: members can select" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'voice-notes'
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "voice-notes: members can insert" ON storage.objects;
CREATE POLICY "voice-notes: members can insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'voice-notes'
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "voice-notes: members can update" ON storage.objects;
CREATE POLICY "voice-notes: members can update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'voice-notes'
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.workspace_id::text = (storage.foldername(name))[1]
    )
  )
  WITH CHECK (
    bucket_id = 'voice-notes'
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );

DROP POLICY IF EXISTS "voice-notes: members can delete" ON storage.objects;
CREATE POLICY "voice-notes: members can delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'voice-notes'
    AND EXISTS (
      SELECT 1 FROM workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.workspace_id::text = (storage.foldername(name))[1]
    )
  );
