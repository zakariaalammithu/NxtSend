'use strict';

const { buildHookTrigger } = require('../../lib/hookTrigger');

/**
 * INSTANT trigger — "Campaign Status Changed (Instant)"
 * (`campaign.status_changed`). Webhook delivery is best-effort
 * immediate + cron retry, NOT instant-guaranteed. Event data is
 * the server's emit payload (`zapierCampaignAction`):
 * `{source, campaignId, status, previous_status}`.
 */
module.exports = buildHookTrigger({
  key: 'campaign_status_changed_instant',
  noun: 'Campaign',
  label: 'Campaign Status Changed (Instant)',
  description:
    'Triggers when a campaign’s lifecycle status changes (pause, resume, archive, draft). Delivered instantly by webhook (best-effort immediate delivery with retry — not instant-guaranteed).',
  event: 'campaign.status_changed',
  dataOutputFields: [
    { key: 'data__source', label: 'Source', type: 'string' },
    { key: 'data__campaignId', label: 'Campaign ID', type: 'string' },
    { key: 'data__status', label: 'Status', type: 'string' },
    { key: 'data__previous_status', label: 'Previous Status', type: 'string' },
  ],
  sampleData: {
    source: 'zapier_api',
    campaignId: 'campaign_sample_01',
    status: 'active',
    previous_status: 'draft',
  },
});
