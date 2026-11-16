'use strict';

const { apiUrl, unwrapList } = require('../lib/api');
const { conversationOutputFields } = require('../lib/fields');
const { sampleConversation } = require('../lib/samples');

/**
 * SEARCH — "Find Conversation".
 * GET /v1/search/conversations?q=. Searches by contact name,
 * email, company, or subject.
 */
const perform = async (z, bundle) => {
  const params = {};
  if (bundle.inputData.q) {
    params.q = bundle.inputData.q;
  }
  const response = await z.request({ url: apiUrl('/search/conversations'), params });
  return unwrapList(response.json);
};

module.exports = {
  key: 'find_conversation',
  noun: 'Conversation',
  display: {
    label: 'Find Conversation',
    description: 'Finds an inbox conversation by contact name, email, company, subject, or ID.',
    hidden: false,
  },
  operation: {
    inputFields: [
      { key: 'q', label: 'Search Text', type: 'string', required: false, helpText: 'Contact name, email, company, or subject to search for.' },
    ],
    perform,
    sample: sampleConversation,
    outputFields: conversationOutputFields,
  },
};
