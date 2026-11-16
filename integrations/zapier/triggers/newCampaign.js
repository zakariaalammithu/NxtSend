'use strict';

const { fetchList, sortDesc } = require('../lib/api');
const { campaignOutputFields } = require('../lib/fields');
const { sampleCampaign } = require('../lib/samples');

/**
 * POLLING trigger — "New Campaign".
 * Polls GET /v1/campaigns (newest first, up to 100 per poll),
 * dedups on the stable campaign `id`. Polling latency is your
 * Zapier plan's interval — use "New Campaign (Instant)" for
 * webhook delivery.
 */
const perform = async (z, bundle) => {
  const campaigns = await fetchList(z, '/campaigns');
  return sortDesc(campaigns, 'created_at').slice(0, 100);
};

module.exports = {
  key: 'new_campaign',
  noun: 'Campaign',
  display: {
    label: 'New Campaign',
    description:
      'Triggers when a new campaign is created in your workspace. Polling: Zapier checks on your plan’s polling interval (minutes), not instantly.',
    hidden: false,
  },
  operation: {
    type: 'polling',
    perform,
    sample: sampleCampaign,
    outputFields: campaignOutputFields,
  },
};
