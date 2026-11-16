'use strict';

const { apiUrl } = require('../lib/api');

/**
 * CREATE — "Remove Lead from Campaign".
 * DELETE /v1/campaigns/:id/leads/:leadId. The server response
 * shape for a removal is not pinned by the contract, so the
 * output echoes the request plus `removed: true`.
 */
const perform = async (z, bundle) => {
  const { campaignId, leadId } = bundle.inputData;
  const response = await z.request({
    url: apiUrl(
      `/campaigns/${encodeURIComponent(campaignId)}/leads/${encodeURIComponent(leadId)}`
    ),
    method: 'DELETE',
  });
  const data = response.json || {};
  return {
    campaignId,
    leadId,
    removed: data.removed ?? true,
  };
};

module.exports = {
  key: 'remove_lead_from_campaign',
  noun: 'Campaign',
  display: {
    label: 'Remove Lead From Campaign',
    description: 'Removes a lead’s enrollment from a campaign.',
    hidden: false,
  },
  operation: {
    inputFields: [
      {
        key: 'campaignId',
        label: 'Campaign',
        type: 'string',
        required: true,
        dynamic: 'list_campaigns.id.label',
        helpText: 'Pick a campaign, or paste a campaign ID.',
      },
      {
        key: 'leadId',
        label: 'Lead',
        type: 'string',
        required: true,
        dynamic: 'new_lead.id.email',
        helpText: 'Pick a lead, or paste a lead ID.',
      },
    ],
    perform,
    sample: { campaignId: 'campaign_sample_01', leadId: 'lead_sample_01', removed: true },
    outputFields: [
      { key: 'campaignId', label: 'Campaign ID', type: 'string' },
      { key: 'leadId', label: 'Lead ID', type: 'string' },
      { key: 'removed', label: 'Removed', type: 'boolean' },
    ],
  },
};
