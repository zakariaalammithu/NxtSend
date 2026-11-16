'use strict';

const { apiUrl } = require('../lib/api');
const { campaignOutputFields } = require('../lib/fields');
const { sampleCampaign } = require('../lib/samples');

/**
 * CREATE — "Create Campaign".
 * POST /v1/campaigns. Creates a DRAFT campaign — it never
 * activates sending by itself (the server refuses any
 * non-draft status). At least one sequence step is REQUIRED by
 * the server (400 without one). Step shape
 * (src/lib/integrations/zapier/api.ts `parseCampaignSteps`):
 * `{step_type, delay_hours?, subject?, content?, config?}` —
 * `email` and `linkedin_message` steps require non-empty
 * `content`. `type` is linkedin | email | mixed (default email).
 *
 * A retried create has no natural key (campaigns are not
 * deduped), so retrying this action can create a duplicate
 * draft; check Find Campaign first, or use the Find-or-Create
 * pairing.
 */
const perform = async (z, bundle) => {
  const body = { name: bundle.inputData.name };
  if (bundle.inputData.type) {
    body.type = bundle.inputData.type;
  }
  if (bundle.inputData.description) {
    body.description = bundle.inputData.description;
  }
  const steps = Array.isArray(bundle.inputData.steps) ? bundle.inputData.steps : [];
  body.steps = steps.map((step) => {
    const out = { step_type: step.step_type };
    if (step.delay_hours !== undefined && step.delay_hours !== '') {
      out.delay_hours = Number(step.delay_hours);
    }
    if (step.subject) {
      out.subject = step.subject;
    }
    if (step.content) {
      out.content = step.content;
    }
    return out;
  });
  const response = await z.request({
    url: apiUrl('/campaigns'),
    method: 'POST',
    body,
  });
  const data = response.json || {};
  return data.campaign || data;
};

module.exports = {
  key: 'create_campaign',
  noun: 'Campaign',
  display: {
    label: 'Create Campaign',
    description: 'Creates a draft campaign with at least one sequence step. It never activates sending by itself — launch a draft from the NxtSend dashboard. Note: campaigns have no natural dedup key, so retrying this action can create a duplicate draft — use Find Campaign first when that matters.',
    hidden: false,
  },
  operation: {
    inputFields: [
      { key: 'name', label: 'Campaign Name', type: 'string', required: true },
      {
        key: 'type',
        label: 'Type',
        type: 'string',
        required: false,
        choices: { email: 'Email', linkedin: 'LinkedIn', mixed: 'Mixed' },
        helpText: 'Email, LinkedIn, or Mixed. A LinkedIn campaign is a draft only — LinkedIn sending is not available (no authorized provider).',
      },
      { key: 'description', label: 'Description', type: 'string', required: false },
      {
        key: 'steps',
        label: 'Steps',
        required: true,
        children: [
          {
            key: 'step_type',
            label: 'Step Type',
            type: 'string',
            required: true,
            choices: {
              email: 'Email',
              linkedin_message: 'LinkedIn Message',
              connection_request: 'Connection Request',
              wait: 'Wait',
              condition: 'Condition',
              like_post: 'Like Post',
              view_profile: 'View Profile',
              endorse_skills: 'Endorse Skills',
            },
          },
          {
            key: 'delay_hours',
            label: 'Delay (hours)',
            type: 'integer',
            required: false,
            helpText: 'Hours to wait before this step (0 = immediately).',
          },
          { key: 'subject', label: 'Subject', type: 'string', required: false },
          {
            key: 'content',
            label: 'Content',
            type: 'text',
            required: false,
            helpText: 'Required for Email and LinkedIn Message steps.',
          },
        ],
      },
    ],
    perform,
    sample: sampleCampaign,
    outputFields: campaignOutputFields,
  },
};
