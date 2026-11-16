'use strict';

/**
 * Output fields shared by triggers, searches and creates.
 *
 * Field names follow the SERVER's records exactly (the Zapier REST
 * API serializes the product's own rows — see
 * src/lib/integrations/zapier/api.ts `serializeLead` /
 * `serializeCampaign`, which spread the record):
 *
 * - Lead: snake_case (`first_name`, `last_name`, `job_title`,
 *   `linkedin_url`, `workspace_id`, `created_at`, `updated_at`).
 *   There is NO `name`, `phone` or `source` field on a lead — the
 *   server silently drops unknown keys, so this app does not send
 *   them (sending them would pretend data was saved when it was
 *   not). Updatable lead fields:
 *   first_name, last_name, email, company, job_title,
 *   linkedin_url, status, tags, custom_fields.
 * - Campaign: `type` (linkedin | email | mixed), NOT `channel`;
 *   `status` is draft | active | paused | archived (there is no
 *   `stopped` — stop moves a campaign to `archived`).
 * - Conversation: snake_case (`contact_name`, `contact_email`,
 *   `lead_id`, `last_message_at`); there is no `updated_at`.
 * - Message (reply): snake_case (`conversation_id`, `sent_at`).
 * - Account: `display_name`, `handle_or_email`, `provider`,
 *   `channel`, `status`.
 *
 * NOTE on nested output: Zapier maps a field key containing `__`
 * to a nested object, so `data__email` reads `item.data.email`
 * and `stats__linkedin__accepted` reads
 * `item.stats.linkedin.accepted`. That is how the webhook-envelope
 * triggers expose `data` and the performance search exposes
 * `stats`.
 */

const leadOutputFields = [
  { key: 'id', label: 'Lead ID', type: 'string', primary: true },
  { key: 'workspace_id', label: 'Workspace ID', type: 'string' },
  { key: 'email', label: 'Email', type: 'string' },
  { key: 'first_name', label: 'First Name', type: 'string' },
  { key: 'last_name', label: 'Last Name', type: 'string' },
  { key: 'company', label: 'Company', type: 'string' },
  { key: 'job_title', label: 'Job Title', type: 'string' },
  { key: 'linkedin_url', label: 'LinkedIn URL', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'tags', label: 'Tags', type: 'string', list: true },
  { key: 'created_at', label: 'Created At', type: 'datetime' },
  { key: 'updated_at', label: 'Updated At', type: 'datetime' },
];

const campaignOutputFields = [
  { key: 'id', label: 'Campaign ID', type: 'string', primary: true },
  { key: 'workspace_id', label: 'Workspace ID', type: 'string' },
  { key: 'name', label: 'Campaign Name', type: 'string' },
  { key: 'type', label: 'Type', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'description', label: 'Description', type: 'string' },
  { key: 'created_at', label: 'Created At', type: 'datetime' },
  { key: 'updated_at', label: 'Updated At', type: 'datetime' },
];

const conversationOutputFields = [
  { key: 'id', label: 'Conversation ID', type: 'string', primary: true },
  { key: 'workspace_id', label: 'Workspace ID', type: 'string' },
  { key: 'lead_id', label: 'Lead ID', type: 'string' },
  { key: 'subject', label: 'Subject', type: 'string' },
  { key: 'channel', label: 'Channel', type: 'string' },
  { key: 'contact_name', label: 'Contact Name', type: 'string' },
  { key: 'contact_email', label: 'Contact Email', type: 'string' },
  { key: 'company', label: 'Company', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'unread', label: 'Unread', type: 'boolean' },
  { key: 'unread_count', label: 'Unread Count', type: 'integer' },
  { key: 'last_message_at', label: 'Last Message At', type: 'datetime' },
  { key: 'created_at', label: 'Created At', type: 'datetime' },
];

const replyOutputFields = [
  { key: 'id', label: 'Reply ID', type: 'string', primary: true },
  { key: 'workspace_id', label: 'Workspace ID', type: 'string' },
  { key: 'conversation_id', label: 'Conversation ID', type: 'string' },
  { key: 'lead_id', label: 'Lead ID', type: 'string' },
  { key: 'channel', label: 'Channel', type: 'string' },
  { key: 'direction', label: 'Direction', type: 'string' },
  { key: 'subject', label: 'Subject', type: 'string' },
  { key: 'content', label: 'Content', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
  { key: 'sent_at', label: 'Sent At', type: 'datetime' },
  { key: 'duplicate', label: 'Duplicate Replay', type: 'boolean' },
];

const accountOutputFields = [
  { key: 'id', label: 'Account ID', type: 'string', primary: true },
  { key: 'workspace_id', label: 'Workspace ID', type: 'string' },
  { key: 'display_name', label: 'Display Name', type: 'string' },
  { key: 'handle_or_email', label: 'Handle or Email', type: 'string' },
  { key: 'provider', label: 'Provider', type: 'string' },
  { key: 'channel', label: 'Channel', type: 'string' },
  { key: 'status', label: 'Status', type: 'string' },
];

const usageOutputFields = [
  { key: 'id', label: 'Usage ID', type: 'string', primary: true },
  { key: 'workspaceId', label: 'Workspace ID', type: 'string' },
  { key: 'plan', label: 'Plan', type: 'string' },
  { key: 'status', label: 'Subscription Status', type: 'string' },
  { key: 'created_at', label: 'Created At', type: 'datetime' },
  { key: 'updated_at', label: 'Updated At', type: 'datetime' },
];

/**
 * Webhook envelope fields. The server envelope
 * (src/lib/integrations/zapier/events.ts) is
 * `{id, type, created_at, workspace_id, data}`; `id` is the stable
 * event id receivers key dedup on. Per-event `data__*` fields are
 * appended by each instant trigger — they match the server's emit
 * payloads in src/lib/integrations/zapier/api.ts exactly
 * (note the emit payloads mix conventions: `leadId`/`campaignId`
 * camelCase, `changed_fields`/`previous_status` snake_case).
 */
const envelopeOutputFields = [
  { key: 'id', label: 'Event ID', type: 'string', primary: true },
  { key: 'type', label: 'Event Type', type: 'string' },
  { key: 'created_at', label: 'Event Created At', type: 'datetime' },
  { key: 'workspace_id', label: 'Workspace ID', type: 'string' },
];

const dropdownOutputFields = [
  { key: 'id', label: 'ID', type: 'string', primary: true },
  { key: 'label', label: 'Label', type: 'string' },
];

/**
 * Input fields for creating/updating a lead. `email` is the only
 * required field (the API dedups by email). Keys are the server's
 * snake_case names — camelCase keys are silently dropped by the
 * server, so they are not offered. `status` uses the
 * server-driven lead-statuses dropdown; `tags` is a
 * comma-separated string, sent as an array.
 */
const leadInputFields = [
  {
    key: 'email',
    label: 'Email',
    type: 'string',
    required: true,
    helpText: 'The lead’s email address. Leads are deduplicated by email.',
  },
  { key: 'first_name', label: 'First Name', type: 'string', required: false },
  { key: 'last_name', label: 'Last Name', type: 'string', required: false },
  { key: 'company', label: 'Company', type: 'string', required: false },
  { key: 'job_title', label: 'Job Title', type: 'string', required: false },
  {
    key: 'linkedin_url',
    label: 'LinkedIn URL',
    type: 'string',
    required: false,
    helpText: 'Link to the lead’s LinkedIn profile, if known.',
  },
  {
    key: 'status',
    label: 'Status',
    type: 'string',
    required: false,
    dynamic: 'list_lead_statuses.id.label',
    altersDynamicFields: true,
    helpText: 'Lead status, from your workspace’s statuses.',
  },
  {
    key: 'tags',
    label: 'Tags',
    type: 'string',
    required: false,
    helpText: 'Comma-separated tags (tags are NxtSend’s list model).',
  },
];

/**
 * Split a comma-separated tags string into an array, dropping
 * blanks. Returns undefined when nothing was given, so the field
 * is omitted from the request body entirely.
 */
const splitTags = (tags) => {
  if (tags === undefined || tags === null) {
    return undefined;
  }
  const list = String(tags)
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
  return list.length > 0 ? list : undefined;
};

/**
 * Build a lead request body from Zap input. Only fields the user
 * filled are sent, using the server's snake_case keys
 * (src/lib/integrations/zapier/api.ts `parseLeadInput` reads
 * exactly: email, first_name, last_name, company, job_title,
 * linkedin_url, status, tags).
 */
const buildLeadBody = (inputData) => {
  const body = {};
  for (const key of [
    'email',
    'first_name',
    'last_name',
    'company',
    'job_title',
    'linkedin_url',
    'status',
  ]) {
    if (inputData[key] !== undefined && inputData[key] !== '') {
      body[key] = inputData[key];
    }
  }
  const tags = splitTags(inputData.tags);
  if (tags !== undefined) {
    body.tags = tags;
  }
  return body;
};

module.exports = {
  leadOutputFields,
  campaignOutputFields,
  conversationOutputFields,
  replyOutputFields,
  accountOutputFields,
  usageOutputFields,
  envelopeOutputFields,
  dropdownOutputFields,
  leadInputFields,
  splitTags,
  buildLeadBody,
};
