'use strict';

const { apiUrl } = require('../lib/api');
const { campaignOutputFields } = require('../lib/fields');
const { sampleCampaign } = require('../lib/samples');

/**
 * CREATE — "Update Campaign".
 * PATCH /v1/campaigns/:id. Only the fields the user fills are
 * sent (name, type, description — the server's updatable set).
 * For status changes, prefer the dedicated Pause / Resume /
 * Stop / Archive actions instead of editing status here
 * (a `status` in the body follows the same transition rules).
 */
const perform = async (z, bundle) => {
  const { id, ...rest } = bundle.inputData;
  const body = {};
  for (const key of ['name', 'type', 'description']) {
    if (rest[key] !== undefined && rest[key] !== '') {
      body[key] = rest[key];
    }
  }
  const response = await z.request({
    url: apiUrl(`/campaigns/${encodeURIComponent(id)}`),
    method: 'PATCH',
    body,
  });
  const data = response.json || {};
  return data.campaign || data;
};

module.exports = {
  key: 'update_campaign',
  noun: 'Campaign',
  display: {
    label: 'Update Campaign',
    description: 'Updates a campaign’s name, type, or description. Only the fields you fill in are changed. For status changes, use Pause, Resume, Stop, or Archive.',
    hidden: false,
  },
  operation: {
    inputFields: [
      {
        key: 'id',
        label: 'Campaign',
        type: 'string',
        required: true,
        dynamic: 'new_campaign.id.name',
        helpText: 'Pick a recent campaign, or paste a campaign ID.',
      },
      { key: 'name', label: 'Campaign Name', type: 'string', required: false },
      {
        key: 'type',
        label: 'Type',
        type: 'string',
        required: false,
        choices: { email: 'Email', linkedin: 'LinkedIn', mixed: 'Mixed' },
      },
      { key: 'description', label: 'Description', type: 'string', required: false },
    ],
    perform,
    sample: sampleCampaign,
    outputFields: campaignOutputFields,
  },
};
