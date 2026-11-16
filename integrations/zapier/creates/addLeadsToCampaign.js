'use strict';

const { apiUrl } = require('../lib/api');

/**
 * CREATE — "Add Leads to Campaign".
 * POST /v1/campaigns/:id/leads with `{lead_ids: [...]}`.
 * Returns `{enrolled, skipped, notFound}`: enrolled = newly
 * added, skipped = already enrolled, notFound = ids with no
 * lead in the workspace. Adding the same lead twice is safe
 * (the second add is skipped, not duplicated).
 */
const perform = async (z, bundle) => {
  const rows = Array.isArray(bundle.inputData.leads) ? bundle.inputData.leads : [];
  const leadIds = rows.map((row) => row.leadId).filter(Boolean);
  const response = await z.request({
    url: apiUrl(`/campaigns/${encodeURIComponent(bundle.inputData.campaignId)}/leads`),
    method: 'POST',
    body: { lead_ids: leadIds },
  });
  const data = response.json || {};
  return {
    campaignId: bundle.inputData.campaignId,
    enrolled: data.enrolled ?? leadIds.length,
    skipped: data.skipped ?? 0,
    notFound: Array.isArray(data.notFound) ? data.notFound : [],
  };
};

module.exports = {
  key: 'add_leads_to_campaign',
  noun: 'Campaign',
  display: {
    label: 'Add Leads to Campaign',
    description: 'Enrolls leads into a campaign. Leads already enrolled are skipped, not duplicated; unknown lead IDs are reported as not found.',
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
        key: 'leads',
        label: 'Leads',
        required: true,
        children: [
          {
            key: 'leadId',
            label: 'Lead',
            type: 'string',
            required: true,
            dynamic: 'new_lead.id.email',
            helpText: 'Pick a lead, or paste a lead ID.',
          },
        ],
      },
    ],
    perform,
    sample: { campaignId: 'campaign_sample_01', enrolled: 2, skipped: 0, notFound: [] },
    outputFields: [
      { key: 'campaignId', label: 'Campaign ID', type: 'string' },
      { key: 'enrolled', label: 'Enrolled', type: 'integer' },
      { key: 'skipped', label: 'Skipped', type: 'integer' },
      { key: 'notFound', label: 'Not Found Lead IDs', type: 'string', list: true },
    ],
  },
};
