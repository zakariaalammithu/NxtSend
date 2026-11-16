'use strict';

const { apiUrl, unwrapList, normalizeDropdownItem } = require('../lib/api');
const { dropdownOutputFields } = require('../lib/fields');

/**
 * Hidden trigger powering the Sequence dynamic dropdown.
 *
 * There is no workspace-wide sequence list in the product —
 * steps belong to a campaign — so the server requires
 * `campaign_id` (`GET /v1/dropdowns/sequences?campaign_id=`).
 * The campaign id is read from the Zap's input data (the
 * campaign being edited); without one the dropdown is empty and
 * the user types a step id instead. Items are the campaign's
 * steps (`Step <n>: <step_type>`).
 */
const perform = async (z, bundle) => {
  const campaignId =
    (bundle.inputData && (bundle.inputData.id || bundle.inputData.campaignId)) ||
    undefined;
  if (!campaignId) {
    return [];
  }
  try {
    const response = await z.request({
      url: apiUrl('/dropdowns/sequences'),
      params: { campaign_id: campaignId },
    });
    return unwrapList(response.json).map(normalizeDropdownItem).filter(Boolean);
  } catch (error) {
    z.console.log(`Dropdown /dropdowns/sequences unavailable: ${error.message}`);
    return [];
  }
};

module.exports = {
  key: 'list_sequences',
  noun: 'Sequence',
  display: {
    label: 'List Sequences',
    description:
      'Lists a campaign’s steps for dynamic dropdowns. Hidden: not shown in the Zap editor.',
    hidden: true,
  },
  operation: {
    type: 'polling',
    perform,
    sample: { id: 'step_sample_01', label: 'Step 1: email' },
    outputFields: dropdownOutputFields,
  },
};
