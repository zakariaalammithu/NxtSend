'use strict';

const { buildHookTrigger } = require('../../lib/hookTrigger');

/**
 * INSTANT trigger — "New Lead (Instant)" (`lead.created`).
 * Webhook delivery is best-effort immediate + cron retry, NOT
 * instant-guaranteed. Event data is the server's emit payload
 * (src/lib/integrations/zapier/api.ts `zapierCreateLead`):
 * `{source, leadId, email, firstName, company}`.
 */
module.exports = buildHookTrigger({
  key: 'new_lead_instant',
  noun: 'Lead',
  label: 'New Lead (Instant)',
  description:
    'Triggers when a lead is created in your workspace. Delivered instantly by webhook (best-effort immediate delivery with retry — not instant-guaranteed).',
  event: 'lead.created',
  dataOutputFields: [
    { key: 'data__source', label: 'Source', type: 'string' },
    { key: 'data__leadId', label: 'Lead ID', type: 'string' },
    { key: 'data__email', label: 'Email', type: 'string' },
    { key: 'data__firstName', label: 'First Name', type: 'string' },
    { key: 'data__company', label: 'Company', type: 'string' },
  ],
  sampleData: {
    source: 'zapier_api',
    leadId: 'lead_sample_01',
    email: 'jordan@example.com',
    firstName: 'Jordan',
    company: 'Example Corp',
  },
});
