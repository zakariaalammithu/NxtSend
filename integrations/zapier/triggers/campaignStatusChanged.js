'use strict';

const { fetchList } = require('../lib/api');
const { campaignOutputFields } = require('../lib/fields');
const { sampleCampaign } = require('../lib/samples');

/**
 * POLLING trigger — "Campaign Status Changed".
 * Polls GET /v1/campaigns and fires once per distinct status.
 *
 * Dedupe needs a composite id: the stable campaign id alone would
 * never re-fire, so the item `id` is `<campaignId>__<status>` and
 * the original campaign id is carried in `campaign_id` (use that
 * in later steps). A status that flips away and back to the same
 * value fires once per value — and a change on a campaign outside
 * the most recent 100 is not seen. Use
 * "Campaign Status Changed (Instant)" for guaranteed delivery.
 */
const withCompositeId = (campaign) => ({
  ...campaign,
  id: `${campaign.id}__${campaign.status || ''}`,
  campaign_id: campaign.id,
});

const perform = async (z, bundle) => {
  const campaigns = await fetchList(z, '/campaigns');
  const sorted = [...campaigns].sort((a, b) =>
    String(b.updated_at || b.created_at || '').localeCompare(
      String(a.updated_at || a.created_at || '')
    )
  );
  return sorted.slice(0, 100).map(withCompositeId);
};

const sample = withCompositeId({ ...sampleCampaign, status: 'active' });

module.exports = {
  key: 'campaign_status_changed',
  noun: 'Campaign',
  display: {
    label: 'Campaign Status Changed',
    description:
      'Triggers when a campaign’s status changes (draft, active, paused, archived). Polling: Zapier checks on your plan’s polling interval. The item ID is the campaign ID plus its status, so each status fires once; the original campaign ID is in the “Campaign ID” field.',
    hidden: false,
  },
  operation: {
    type: 'polling',
    perform,
    sample,
    outputFields: [
      { key: 'id', label: 'Status Change ID', type: 'string', primary: true },
      { key: 'campaign_id', label: 'Campaign ID', type: 'string' },
      ...campaignOutputFields.filter((field) => field.key !== 'id'),
    ],
  },
};
