'use strict';

const { fetchDropdown } = require('./api');
const { dropdownOutputFields } = require('./fields');

/**
 * Build a HIDDEN polling trigger that powers a dynamic dropdown.
 * Hidden triggers never appear in the Zap editor; they exist so an
 * input field can use `dynamic: '<key>.id.label'`. The perform
 * hits the matching `/v1/dropdowns/*` endpoint and returns
 * `{id, label}` rows — empty (never an error) when the endpoint is
 * unavailable, so the editor stays usable and the user can type a
 * value instead.
 */
const buildDropdownTrigger = ({ key, label, path, sample }) => ({
  key,
  noun: label,
  display: {
    label,
    description: `Lists ${label.toLowerCase()} for dynamic dropdowns. Hidden: not shown in the Zap editor.`,
    hidden: true,
  },
  operation: {
    type: 'polling',
    perform: async (z, bundle) => fetchDropdown(z, path),
    sample,
    outputFields: dropdownOutputFields,
  },
});

module.exports = { buildDropdownTrigger };
