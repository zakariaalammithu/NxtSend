'use strict';

const { buildHookTrigger } = require('../../lib/hookTrigger');

/**
 * INSTANT trigger — "Lead Removed From Campaign (Instant)"
 * (`lead.removed_from_campaign`). No polling equivalent exists:
 * there is no list endpoint for campaign membership, so this
 * event is only available as a webhook. Delivery is best-effort
 * immediate + cron retry, NOT instant-guaranteed. Event data is
 * the server's emit payload (`zapierRemoveLeadFromCampaign`):
 * `{source, campaignId, leadId}`.
 */
module.exports = buildHookTrigger({
  key: 'lead_removed_from_campaign_instant',
  noun: 'Lead',
  label: 'Lead Removed From Campaign (Instant)',
  description:
    'Triggers when a lead’s enrollment is removed from a campaign. Delivered instantly by webhook (best-effort immediate delivery with retry — not instant-guaranteed).',
  event: 'lead.removed_from_campaign',
  dataOutputFields: [
    { key: 'data__source', label: 'Source', type: 'string' },
    { key: 'data__campaignId', label: 'Campaign ID', type: 'string' },
    { key: 'data__leadId', label: 'Lead ID', type: 'string' },
  ],
  sampleData: {
    source: 'zapier_api',
    campaignId: 'campaign_sample_01',
    leadId: 'lead_sample_01',
  },
});
