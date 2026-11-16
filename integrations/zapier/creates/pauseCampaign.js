'use strict';

const { buildCampaignAction } = require('../lib/campaignAction');

/** CREATE — "Pause Campaign": POST /v1/campaigns/:id/pause. */
module.exports = buildCampaignAction({
  key: 'pause_campaign',
  label: 'Pause Campaign',
  description: 'Pauses an active campaign (stops future steps). Only an active campaign can be paused.',
  action: 'pause',
  sampleStatus: 'paused',
});
