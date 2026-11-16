'use strict';

const { apiUrl } = require('../lib/api');
const { leadInputFields, leadOutputFields, buildLeadBody } = require('../lib/fields');
const { sampleLead } = require('../lib/samples');

/**
 * CREATE — "Create Lead".
 * POST /v1/leads. The API dedups by email and returns
 * `{lead, duplicate}`; the output is the lead plus a `duplicate`
 * flag (true when the email already existed — no second lead is
 * created). A retried create with the same email is therefore
 * safe: it returns the existing lead instead of duplicating.
 */
const perform = async (z, bundle) => {
  const response = await z.request({
    url: apiUrl('/leads'),
    method: 'POST',
    body: buildLeadBody(bundle.inputData),
  });
  const data = response.json || {};
  const lead = data.lead || data;
  return { ...lead, duplicate: Boolean(data.duplicate) };
};

module.exports = {
  key: 'create_lead',
  noun: 'Lead',
  display: {
    label: 'Create Lead',
    description: 'Creates a lead in your workspace. Leads are deduplicated by email — creating a lead that already exists returns the existing lead with “Duplicate” set to true.',
    hidden: false,
  },
  operation: {
    inputFields: leadInputFields,
    perform,
    sample: { ...sampleLead, duplicate: false },
    outputFields: [
      ...leadOutputFields,
      { key: 'duplicate', label: 'Duplicate', type: 'boolean' },
    ],
  },
};
