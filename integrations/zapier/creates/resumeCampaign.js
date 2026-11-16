'use strict';

const { buildCampaignAction } = require('../lib/campaignAction');

/** CREATE — "Resume Campaign": POST /v1/campaigns/:id/resume. */
module.exports = buildCampaignAction({
  key: 'resume_campaign',
  label: 'Resume Campaign',
  description: 'Resumes a paused campaign. Only a paused campaign can be resumed. Actual sending additionally depends on a connected, authorized provider.',
  action: 'resume',
  sampleStatus: 'active',
});
