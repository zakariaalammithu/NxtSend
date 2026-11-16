'use strict';

const { buildDropdownTrigger } = require('../lib/dropdownTrigger');

/** Hidden trigger powering the Lead Status dynamic dropdown. */
module.exports = buildDropdownTrigger({
  key: 'list_lead_statuses',
  label: 'List Lead Statuses',
  path: '/dropdowns/lead-statuses',
  sample: { id: 'new', label: 'New' },
});
