'use strict';

const { apiUrl } = require('./api');
const { campaignOutputFields } = require('./fields');
const { sampleCampaign } = require('./samples');

/**
 * Build a campaign lifecycle action (pause / resume / stop /
 * archive): POST /v1/campaigns/:id/<action>, returning the
 * updated campaign.
 *
 * Transition rules (server, same as the MCP adapter): pause
 * needs an active campaign, resume needs a paused one, and
 * stop/archive refuse an already-archived campaign (400) — so
 * these are NOT safe to retry blindly; a retry after a
 * successful move fails with the server's message.
 * Stop moves the campaign to `archived` (there is no `stopped`
 * status).
 */
const buildCampaignAction = ({ key, label, description, action, sampleStatus }) => ({
  key,
  noun: 'Campaign',
  display: { label, description, hidden: false },
  operation: {
    inputFields: [
      {
        key: 'id',
        label: 'Campaign',
        type: 'string',
        required: true,
        dynamic: 'list_campaigns.id.label',
        helpText: 'Pick a campaign, or paste a campaign ID.',
      },
    ],
    perform: async (z, bundle) => {
      const response = await z.request({
        url: apiUrl(`/campaigns/${encodeURIComponent(bundle.inputData.id)}/${action}`),
        method: 'POST',
      });
      const data = response.json || {};
      return data.campaign || data;
    },
    sample: { ...sampleCampaign, status: sampleStatus },
    outputFields: campaignOutputFields,
  },
});

module.exports = { buildCampaignAction };
