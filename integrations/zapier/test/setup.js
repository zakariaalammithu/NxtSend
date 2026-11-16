'use strict';

/**
 * Shared test setup: forbid ALL real network access (every test
 * must mock the NxtSend API with Nock — no live credentials, no
 * live calls), and clear mocks between tests.
 */
const nock = require('nock');

nock.disableNetConnect();

afterEach(() => {
  nock.cleanAll();
});

module.exports = { nock };
