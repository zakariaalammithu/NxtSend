'use strict';

const { buildHookTrigger } = require('../../lib/hookTrigger');

/**
 * INSTANT trigger — "Lead Added to Campaign (Instant)"
 * (`lead.added_to_campaign`). No polling equivalent exists: there
 * is no list endpoint for campaign membership, so this event is
 * only available as a webhook. Delivery is best-effort immediate
 * + cron retry, NOT instant-guaranteed. Event data is the server's
 * emit payload (`zapierAddLeadsToCampaign`):
 * `{source, campaignId, leadIds, enrolled}`.
 */
module.exports = buildHookTrigger({
  key: 'lead_added_to_campaign_instant',
  noun: 'Lead',
  label: 'Lead Added to Campaign (Instant)',
  description:
    'Triggers when a lead is enrolled into a campaign. Delivered instantly by webhook (best-effort immediate delivery with retry — not instant-guaranteed).',
  event: 'lead.added_to_campaign',
  dataOutputFields: [
    { key: 'data__source', label: 'Source', type: 'string' },
    { key: 'data__campaignId', label: 'Campaign ID', type: 'string' },
    { key: 'data__leadIds', label: 'Lead IDs', type: 'string', list: true },
    { key: 'data__enrolled', label: 'Enrolled', type: 'integer' },
  ],
  sampleData: {
    source: 'zapier_api',
    campaignId: 'campaign_sample_01',
    leadIds: ['lead_sample_01'],
    enrolled: 1,
  },
});
