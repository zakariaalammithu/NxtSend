'use strict';

const { buildDropdownTrigger } = require('../lib/dropdownTrigger');

/** Hidden trigger powering the Campaign dynamic dropdown. */
module.exports = buildDropdownTrigger({
  key: 'list_campaigns',
  label: 'List Campaigns',
  path: '/dropdowns/campaigns',
  sample: { id: 'campaign_sample_01', label: 'Example Outbound Campaign' },
});
