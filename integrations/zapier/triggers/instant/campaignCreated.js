'use strict';

const { buildHookTrigger } = require('../../lib/hookTrigger');

/**
 * INSTANT trigger — "New Campaign (Instant)" (`campaign.created`).
 * Webhook delivery is best-effort immediate + cron retry, NOT
 * instant-guaranteed. Event data is the server's emit payload
 * (`zapierCreateCampaign`): `{source, campaignId, name, status}`.
 */
module.exports = buildHookTrigger({
  key: 'new_campaign_instant',
  noun: 'Campaign',
  label: 'New Campaign (Instant)',
  description:
    'Triggers when a campaign is created in your workspace. Delivered instantly by webhook (best-effort immediate delivery with retry — not instant-guaranteed).',
  event: 'campaign.created',
  dataOutputFields: [
    { key: 'data__source', label: 'Source', type: 'string' },
    { key: 'data__campaignId', label: 'Campaign ID', type: 'string' },
    { key: 'data__name', label: 'Campaign Name', type: 'string' },
    { key: 'data__status', label: 'Status', type: 'string' },
  ],
  sampleData: {
    source: 'zapier_api',
    campaignId: 'campaign_sample_01',
    name: 'Example Outbound Campaign',
    status: 'draft',
  },
});
