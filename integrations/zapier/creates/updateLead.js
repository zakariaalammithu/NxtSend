'use strict';

const { apiUrl } = require('../lib/api');
const { leadInputFields, leadOutputFields, buildLeadBody } = require('../lib/fields');
const { sampleLead } = require('../lib/samples');

/**
 * CREATE — "Update Lead".
 * PATCH /v1/leads/:id. Only the fields the user fills are sent.
 * The lead is picked from the Find Lead search (or an ID can be
 * typed directly).
 */
const perform = async (z, bundle) => {
  const { id, ...rest } = bundle.inputData;
  const response = await z.request({
    url: apiUrl(`/leads/${encodeURIComponent(id)}`),
    method: 'PATCH',
    body: buildLeadBody(rest),
  });
  const data = response.json || {};
  return data.lead || data;
};

module.exports = {
  key: 'update_lead',
  noun: 'Lead',
  display: {
    label: 'Update Lead',
    description: 'Updates a lead’s fields, tags, or status. Only the fields you fill in are changed.',
    hidden: false,
  },
  operation: {
    inputFields: [
      {
        key: 'id',
        label: 'Lead',
        type: 'string',
        required: true,
        dynamic: 'new_lead.id.name',
        helpText: 'Pick a recent lead, or paste a lead ID.',
      },
      ...leadInputFields.map((field) => ({ ...field, required: false })),
    ],
    perform,
    sample: sampleLead,
    outputFields: leadOutputFields,
  },
};
