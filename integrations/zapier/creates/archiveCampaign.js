'use strict';

const { buildCampaignAction } = require('../lib/campaignAction');

/** CREATE — "Archive Campaign": POST /v1/campaigns/:id/archive. */
module.exports = buildCampaignAction({
  key: 'archive_campaign',
  label: 'Archive Campaign',
  description: 'Archives a campaign (reversible from the NxtSend dashboard). Refused if the campaign is already archived.',
  action: 'archive',
  sampleStatus: 'archived',
});
