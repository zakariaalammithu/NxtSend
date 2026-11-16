'use strict';

const { buildDropdownTrigger } = require('../lib/dropdownTrigger');

/** Hidden trigger powering the LinkedIn Account dynamic dropdown. */
module.exports = buildDropdownTrigger({
  key: 'list_accounts',
  label: 'List LinkedIn Accounts',
  path: '/dropdowns/accounts',
  sample: { id: 'account_sample_01', label: 'Example LinkedIn Account' },
});
