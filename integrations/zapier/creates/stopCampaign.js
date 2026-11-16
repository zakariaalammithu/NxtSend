'use strict';

const { buildCampaignAction } = require('../lib/campaignAction');

/**
 * CREATE — "Stop Campaign": POST /v1/campaigns/:id/stop.
 * Stop moves the campaign to `archived` (there is no `stopped`
 * status) and refuses an already-archived campaign.
 */
module.exports = buildCampaignAction({
  key: 'stop_campaign',
  label: 'Stop Campaign',
  description: 'Stops a campaign (moves it to archived). Refused if the campaign is already archived.',
  action: 'stop',
  sampleStatus: 'archived',
});
