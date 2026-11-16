'use strict';

/**
 * SAMPLE data — clearly labelled, used ONLY for `sample` (the
 * sample Zapier shows when a user builds a Zap) and for tests.
 * These are NOT real records: names are Example names, domains are
 * example.com, and dates are fixed ISO 8601 strings with an offset.
 * Every sample's keys must be a subset of its object's outputFields
 * (enforced by test/definitions.test.js). Field names match the
 * server's records (snake_case for leads/campaigns/conversations/
 * messages/accounts — see lib/fields.js). Webhook samples use the
 * server envelope `{id, type, created_at, workspace_id, data}`
 * (src/lib/integrations/zapier/events.ts) with the exact emit
 * payloads from src/lib/integrations/zapier/api.ts.
 */

const sampleLead = {
  id: 'lead_sample_01',
  workspace_id: 'workspace_sample_01',
  email: 'jordan@example.com',
  first_name: 'Jordan',
  last_name: 'Example',
  company: 'Example Corp',
  job_title: 'Head of Sales',
  linkedin_url: 'https://www.linkedin.com/in/jordan-example',
  status: 'new',
  tags: ['sample'],
  created_at: '2026-11-17T10:00:00.000Z',
  updated_at: '2026-11-17T10:00:00.000Z',
};

const sampleCampaign = {
  id: 'campaign_sample_01',
  workspace_id: 'workspace_sample_01',
  name: 'Example Outbound Campaign',
  type: 'email',
  status: 'draft',
  description: 'Sample campaign shown while building a Zap.',
  created_at: '2026-11-17T10:00:00.000Z',
  updated_at: '2026-11-17T10:00:00.000Z',
};

const sampleConversation = {
  id: 'conversation_sample_01',
  workspace_id: 'workspace_sample_01',
  lead_id: 'lead_sample_01',
  subject: 'Re: Example Corp — intro',
  channel: 'email',
  contact_name: 'Jordan Example',
  contact_email: 'jordan@example.com',
  company: 'Example Corp',
  status: 'open',
  unread: true,
  unread_count: 1,
  last_message_at: '2026-11-17T10:05:00.000Z',
  created_at: '2026-11-17T10:00:00.000Z',
};

const sampleReply = {
  id: 'reply_sample_01',
  workspace_id: 'workspace_sample_01',
  conversation_id: 'conversation_sample_01',
  lead_id: 'lead_sample_01',
  channel: 'email',
  direction: 'outbound',
  subject: 'Re: Example Corp — intro',
  content: 'Hi Jordan — thanks for getting back to me. Here is the sample reply.',
  status: 'sent',
  sent_at: '2026-11-17T10:05:00.000Z',
  duplicate: false,
};

const sampleAccount = {
  id: 'account_sample_01',
  workspace_id: 'workspace_sample_01',
  display_name: 'Example LinkedIn Account',
  handle_or_email: 'jordan-example',
  provider: 'linkedin',
  channel: 'linkedin',
  status: 'connected',
};

const sampleUsage = {
  id: 'usage_sample_01',
  workspaceId: 'workspace_sample_01',
  plan: 'pro',
  status: 'active',
  created_at: '2026-11-17T10:00:00.000Z',
  updated_at: '2026-11-17T10:00:00.000Z',
};

const sampleAuthTest = {
  user: { id: 'user_sample_01', email: 'owner@example.com' },
  workspace: { id: 'workspace_sample_01', name: 'Example Workspace' },
  scopes: ['zapier.read', 'zapier.write'],
};

/**
 * Build a webhook-envelope sample for an event type. `data` holds
 * the event payload; its keys must match the trigger's `data__*`
 * output fields.
 */
const sampleEnvelope = (type, data) => ({
  id: `evt_sample_${type.replace(/[^a-z0-9]+/gi, '_')}_01`,
  type,
  created_at: '2026-11-17T10:00:00.000Z',
  workspace_id: 'workspace_sample_01',
  data,
});

module.exports = {
  sampleLead,
  sampleCampaign,
  sampleConversation,
  sampleReply,
  sampleAccount,
  sampleUsage,
  sampleAuthTest,
  sampleEnvelope,
};
