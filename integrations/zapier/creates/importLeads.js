'use strict';

const { apiUrl } = require('../lib/api');
const { splitTags, leadOutputFields } = require('../lib/fields');
const { sampleLead } = require('../lib/samples');

/**
 * CREATE — "Import Leads".
 * POST /v1/leads/import with `{leads: [...]}` (email required
 * per row; at most 100 rows per call). The server dedups by
 * email and returns `{created, skipped, leads}` — `skipped`
 * covers invalid rows and duplicates; the created lead records
 * come back in `leads`.
 */
const perform = async (z, bundle) => {
  const rows = Array.isArray(bundle.inputData.leads) ? bundle.inputData.leads : [];
  const leads = rows.map((row) => {
    const lead = {};
    for (const key of [
      'email',
      'first_name',
      'last_name',
      'company',
      'job_title',
      'linkedin_url',
      'status',
    ]) {
      if (row[key] !== undefined && row[key] !== '') {
        lead[key] = row[key];
      }
    }
    const tags = splitTags(row.tags);
    if (tags !== undefined) {
      lead.tags = tags;
    }
    return lead;
  });
  const response = await z.request({
    url: apiUrl('/leads/import'),
    method: 'POST',
    body: { leads },
  });
  const data = response.json || {};
  return {
    created: data.created ?? leads.length,
    skipped: data.skipped ?? 0,
    leads: Array.isArray(data.leads) ? data.leads : [],
  };
};

module.exports = {
  key: 'import_leads',
  noun: 'Lead',
  display: {
    label: 'Import Leads',
    description: 'Bulk-imports leads from line items (one row per lead, at most 100). Email is required per row; leads are deduplicated by email and duplicates are counted as skipped.',
    hidden: false,
  },
  operation: {
    inputFields: [
      {
        key: 'leads',
        label: 'Leads',
        required: true,
        children: [
          { key: 'email', label: 'Email', type: 'string', required: true },
          { key: 'first_name', label: 'First Name', type: 'string', required: false },
          { key: 'last_name', label: 'Last Name', type: 'string', required: false },
          { key: 'company', label: 'Company', type: 'string', required: false },
          { key: 'job_title', label: 'Job Title', type: 'string', required: false },
          { key: 'linkedin_url', label: 'LinkedIn URL', type: 'string', required: false },
          { key: 'status', label: 'Status', type: 'string', required: false },
          { key: 'tags', label: 'Tags (comma-separated)', type: 'string', required: false },
        ],
      },
    ],
    perform,
    sample: { created: 2, skipped: 0, leads: [sampleLead] },
    outputFields: [
      { key: 'created', label: 'Created', type: 'integer' },
      { key: 'skipped', label: 'Skipped', type: 'integer' },
      { key: 'leads', label: 'Leads', type: 'string', list: true, children: leadOutputFields },
    ],
  },
};
