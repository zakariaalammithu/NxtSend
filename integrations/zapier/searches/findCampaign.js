'use strict';

const { apiUrl, unwrapList } = require('../lib/api');
const { campaignOutputFields } = require('../lib/fields');
const { sampleCampaign } = require('../lib/samples');

/**
 * SEARCH — "Find Campaign".
 * GET /v1/search/campaigns?q=&id=&status=. `status` is one of
 * draft, active, paused, archived. Paired with Create Campaign
 * as a search-or-create (see index.js `searchOrCreates`).
 */
const perform = async (z, bundle) => {
  const params = {};
  for (const key of ['q', 'id', 'status']) {
    if (bundle.inputData[key]) {
      params[key] = bundle.inputData[key];
    }
  }
  const response = await z.request({ url: apiUrl('/search/campaigns'), params });
  return unwrapList(response.json);
};

module.exports = {
  key: 'find_campaign',
  noun: 'Campaign',
  display: {
    label: 'Find Campaign',
    description: 'Finds a campaign by name, ID, or status. Use with “Find or Create” to create the campaign when it is not found.',
    hidden: false,
  },
  operation: {
    inputFields: [
      { key: 'q', label: 'Search Text', type: 'string', required: false, helpText: 'Campaign name to search for.' },
      { key: 'id', label: 'Campaign ID', type: 'string', required: false, dynamic: 'new_campaign.id.name', helpText: 'Pick a recent campaign, or paste an exact campaign ID to match.' },
      {
        key: 'status',
        label: 'Status',
        type: 'string',
        required: false,
        choices: { draft: 'Draft', active: 'Active', paused: 'Paused', archived: 'Archived' },
        helpText: 'Filter by campaign status.',
      },
    ],
    perform,
    sample: sampleCampaign,
    outputFields: campaignOutputFields,
  },
};
