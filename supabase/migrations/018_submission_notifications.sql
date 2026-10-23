-- ============================================================================
-- Migration 018 — Contact-form notification tracking on `submissions`
-- (P10 Stage C)
-- ============================================================================
-- Why: POST /api/submissions has always PERSISTED contact-form
-- enquiries (migration 007) and shown them in Admin → Submissions,
-- but it never told the team a message had arrived. P10 adds a
-- dedicated Resend notification (src/lib/email/contact-notification
-- .ts — platform mail, deliberately NOT the workspace outreach
-- adapter) and these columns are its durable outcome record:
--
--   notification_status     pending | sent | failed | not_configured
--                           | simulated, or NULL when no notification
--                           applies (demo-booking submissions) or the
--                           attempt has not run yet. "simulated" is
--                           the Demo Mode outcome: the submission was
--                           captured in the demo store and NO email
--                           was sent or claimed.
--   notification_provider_id  The Resend message ID on success.
--   notification_error      Sanitised failure summary (writer
--                           truncates to 500 chars; never contains
--                           the API key or other secrets).
--   notification_attempts   Provider send attempts (an admin retry
--                           from Admin → Submissions increments it;
--                           not_configured/simulated record 0 — no
--                           provider call was possible/made).
--   notification_sent_at    When the successful send was accepted.
--   notification_recipient  The address the notification went (or
--                           would go) to — the CONTACT_NOTIFICATION_
--                           EMAIL value at attempt time, recorded so
--                           an operator can see where it was routed
--                           even if the env value changes later.
--
-- A failed or unconfigured notification NEVER loses the submission:
-- the row is written first, the notification second, and the admin
-- UI surfaces the status plus a retry action.
--
-- Access model is unchanged from migration 007: `submissions`
-- already has RLS ENABLED with ZERO client policies — all reads and
-- writes (including these columns) run through the service role from
-- gated server routes only. This migration adds no policies.
--
-- Like migrations 001–017 this file is applied by the owner at
-- go-live, in order after 017; nothing here has been run against a
-- live database.
-- ============================================================================

ALTER TABLE submissions
  ADD COLUMN IF NOT EXISTS notification_status TEXT,
  ADD COLUMN IF NOT EXISTS notification_provider_id TEXT,
  ADD COLUMN IF NOT EXISTS notification_error TEXT,
  ADD COLUMN IF NOT EXISTS notification_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS notification_sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS notification_recipient TEXT;

-- The status vocabulary is a closed set (mirrors
-- SubmissionNotificationStatus in src/lib/admin/submissions-core.ts).
-- NULL stays valid: it means "not applicable / not attempted".
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'submissions_notification_status_check'
  ) THEN
    ALTER TABLE submissions
      ADD CONSTRAINT submissions_notification_status_check
      CHECK (
        notification_status IS NULL
        OR notification_status IN (
          'pending', 'sent', 'failed', 'not_configured', 'simulated'
        )
      );
  END IF;
END $$;

-- Admin → Submissions triage filters on delivery problems.
CREATE INDEX IF NOT EXISTS idx_submissions_notification_status
  ON submissions (notification_status)
  WHERE notification_status IN ('failed', 'not_configured');
