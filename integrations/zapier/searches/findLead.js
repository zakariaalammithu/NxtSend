'use strict';

const { apiUrl, unwrapList } = require('../lib/api');
const { leadOutputFields } = require('../lib/fields');
const { sampleLead } = require('../lib/samples');

/**
 * SEARCH — "Find Lead".
 * GET /v1/search/leads?q=&email=&id=. At least one input should
 * be given; with none, the API's own behaviour applies. Paired
 * with Create Lead as a search-or-create (see index.js
 * `searchOrCreates`): a Zap can find a lead by email and create
 * it when missing (the API dedups by email anyway).
 */
const perform = async (z, bundle) => {
  const params = {};
  for (const key of ['q', 'email', 'id']) {
    if (bundle.inputData[key]) {
      params[key] = bundle.inputData[key];
    }
  }
  const response = await z.request({ url: apiUrl('/search/leads'), params });
  return unwrapList(response.json);
};

module.exports = {
  key: 'find_lead',
  noun: 'Lead',
  display: {
    label: 'Find Lead',
    description: 'Finds a lead by name, email, or ID. Use with “Find or Create” to create the lead when it is not found.',
    hidden: false,
  },
  operation: {
    inputFields: [
      { key: 'q', label: 'Search Text', type: 'string', required: false, helpText: 'Name, email, or company to search for.' },
      { key: 'email', label: 'Email', type: 'string', required: false, helpText: 'Exact email address to match.' },
      { key: 'id', label: 'Lead ID', type: 'string', required: false, dynamic: 'new_lead.id.name', helpText: 'Pick a recent lead, or paste an exact lead ID to match.' },
    ],
    perform,
    sample: sampleLead,
    outputFields: leadOutputFields,
  },
};
