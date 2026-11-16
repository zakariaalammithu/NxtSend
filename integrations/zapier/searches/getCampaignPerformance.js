'use strict';

const { apiUrl } = require('../lib/api');

/**
 * SEARCH — "Get Campaign Performance".
 * GET /v1/campaigns/:id/performance. Real stats via the
 * server's campaign stats loader
 * (src/lib/integrations/zapier/api.ts
 * `zapierCampaignPerformance` → `{campaign_id, stats}`).
 * `stats.linkedin.accepted` is always null — no data source
 * exists for accepted connections anywhere in the product, and
 * it is never fabricated.
 */
const perform = async (z, bundle) => {
  const response = await z.request({
    url: apiUrl(`/campaigns/${encodeURIComponent(bundle.inputData.campaignId)}/performance`),
  });
  const data = response.json || {};
  return [data];
};

const sample = {
  campaign_id: 'campaign_sample_01',
  stats: {
    campaignId: 'campaign_sample_01',
    prospects: 10,
    enrollments: { total: 10, inProgress: 6, completed: 3, stopped: 1 },
    linkedin: {
      providerConnected: false,
      connectionRequestsSent: 0,
      accepted: null,
      messagesSent: 0,
      replied: 0,
      stepsSkipped: 0,
    },
    email: {
      sent: 8,
      sentProviderConfirmed: 8,
      sentSimulated: 0,
      failed: 0,
      opened: 5,
      clicked: 1,
      bounced: 0,
      complained: 0,
    },
    repliesTotal: 2,
    meetingsBooked: 1,
    executions: {
      total: 8,
      sent: 8,
      simulated: 0,
      skipped: 0,
      stopped: 0,
      executed: 8,
      failed: 0,
    },
  },
};

module.exports = {
  key: 'get_campaign_performance',
  noun: 'Campaign Performance',
  display: {
    label: 'Get Campaign Performance',
    description: 'Gets real performance stats for a campaign (enrollments, email/LinkedIn outcomes, replies, meetings booked). LinkedIn “accepted” is always null — no data source exists for it.',
    hidden: false,
  },
  operation: {
    inputFields: [
      {
        key: 'campaignId',
        label: 'Campaign',
        type: 'string',
        required: true,
        dynamic: 'new_campaign.id.name',
        helpText: 'Pick a campaign, or paste a campaign ID.',
      },
    ],
    perform,
    sample,
    outputFields: [
      { key: 'campaign_id', label: 'Campaign ID', type: 'string', primary: true },
      { key: 'stats__campaignId', label: 'Stats Campaign ID', type: 'string' },
      { key: 'stats__prospects', label: 'Prospects', type: 'integer' },
      { key: 'stats__repliesTotal', label: 'Replies Total', type: 'integer' },
      { key: 'stats__meetingsBooked', label: 'Meetings Booked', type: 'integer' },
      { key: 'stats__enrollments__total', label: 'Enrollments Total', type: 'integer' },
      { key: 'stats__enrollments__inProgress', label: 'Enrollments In Progress', type: 'integer' },
      { key: 'stats__enrollments__completed', label: 'Enrollments Completed', type: 'integer' },
      { key: 'stats__enrollments__stopped', label: 'Enrollments Stopped', type: 'integer' },
      { key: 'stats__linkedin__providerConnected', label: 'LinkedIn Provider Connected', type: 'boolean' },
      { key: 'stats__linkedin__connectionRequestsSent', label: 'Connection Requests Sent', type: 'integer' },
      { key: 'stats__linkedin__accepted', label: 'LinkedIn Accepted (always null)', type: 'integer' },
      { key: 'stats__linkedin__messagesSent', label: 'LinkedIn Messages Sent', type: 'integer' },
      { key: 'stats__linkedin__replied', label: 'LinkedIn Replied', type: 'integer' },
      { key: 'stats__linkedin__stepsSkipped', label: 'LinkedIn Steps Skipped', type: 'integer' },
      { key: 'stats__email__sent', label: 'Emails Sent', type: 'integer' },
      { key: 'stats__email__sentProviderConfirmed', label: 'Emails Provider Confirmed', type: 'integer' },
      { key: 'stats__email__sentSimulated', label: 'Emails Simulated', type: 'integer' },
      { key: 'stats__email__failed', label: 'Emails Failed', type: 'integer' },
      { key: 'stats__email__opened', label: 'Emails Opened', type: 'integer' },
      { key: 'stats__email__clicked', label: 'Emails Clicked', type: 'integer' },
      { key: 'stats__email__bounced', label: 'Emails Bounced', type: 'integer' },
      { key: 'stats__email__complained', label: 'Emails Complained', type: 'integer' },
      { key: 'stats__executions__total', label: 'Executions Total', type: 'integer' },
      { key: 'stats__executions__sent', label: 'Executions Sent', type: 'integer' },
      { key: 'stats__executions__simulated', label: 'Executions Simulated', type: 'integer' },
      { key: 'stats__executions__skipped', label: 'Executions Skipped', type: 'integer' },
      { key: 'stats__executions__stopped', label: 'Executions Stopped', type: 'integer' },
      { key: 'stats__executions__executed', label: 'Executions Executed', type: 'integer' },
      { key: 'stats__executions__failed', label: 'Executions Failed', type: 'integer' },
    ],
  },
};
