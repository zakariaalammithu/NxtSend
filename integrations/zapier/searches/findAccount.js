'use strict';

const { apiUrl, unwrapList } = require('../lib/api');
const { accountOutputFields } = require('../lib/fields');
const { sampleAccount } = require('../lib/samples');

/**
 * SEARCH — "Find LinkedIn Account".
 * GET /v1/search/accounts?q=. LinkedIn accounts are read-only
 * here: there is no authorized LinkedIn provider, so no action
 * sends or accepts anything on LinkedIn — this only finds the
 * connected account record.
 */
const perform = async (z, bundle) => {
  const params = {};
  if (bundle.inputData.q) {
    params.q = bundle.inputData.q;
  }
  const response = await z.request({ url: apiUrl('/search/accounts'), params });
  return unwrapList(response.json);
};

module.exports = {
  key: 'find_account',
  noun: 'LinkedIn Account',
  display: {
    label: 'Find LinkedIn Account',
    description: 'Finds a connected LinkedIn account by name, email, or ID. Read-only: nothing here sends or accepts on LinkedIn.',
    hidden: false,
  },
  operation: {
    inputFields: [
      { key: 'q', label: 'Search Text', type: 'string', required: false, helpText: 'Account name or email to search for.' },
    ],
    perform,
    sample: sampleAccount,
    outputFields: accountOutputFields,
  },
};
