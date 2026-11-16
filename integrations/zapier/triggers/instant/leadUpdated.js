'use strict';

const { buildHookTrigger } = require('../../lib/hookTrigger');

/**
 * INSTANT trigger — "Lead Updated (Instant)" (`lead.updated`).
 * Webhook delivery is best-effort immediate + cron retry, NOT
 * instant-guaranteed. Event data is the server's emit payload
 * (src/lib/integrations/zapier/api.ts `zapierUpdateLead`):
 * `{source, leadId, changed_fields}` — `changed_fields` holds
 * the snake_case field names that changed.
 */
module.exports = buildHookTrigger({
  key: 'updated_lead_instant',
  noun: 'Lead',
  label: 'Lead Updated (Instant)',
  description:
    'Triggers when a lead is updated in your workspace. Delivered instantly by webhook (best-effort immediate delivery with retry — not instant-guaranteed). The payload lists the changed fields.',
  event: 'lead.updated',
  dataOutputFields: [
    { key: 'data__source', label: 'Source', type: 'string' },
    { key: 'data__leadId', label: 'Lead ID', type: 'string' },
    {
      key: 'data__changed_fields',
      label: 'Changed Fields',
      type: 'string',
      list: true,
    },
  ],
  sampleData: {
    source: 'zapier_api',
    leadId: 'lead_sample_01',
    changed_fields: ['status'],
  },
});
