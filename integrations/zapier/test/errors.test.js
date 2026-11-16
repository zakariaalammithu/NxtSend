'use strict';

require('./setup');

const { nock } = require('./setup');
const zapier = require('zapier-platform-core');
const App = require('../index');

const appTester = zapier.createAppTester(App);
const BASE = 'https://nxtsend.com';
const authBundle = { authData: { access_token: 'test-token' } };
const withInput = (inputData) => ({ ...authBundle, inputData });

describe('beforeRequest', () => {
  test('injects the Bearer token when absent', () => {
    const request = { url: `${BASE}/x`, headers: {} };
    const out = App.beforeRequest(request, {}, authBundle);
    expect(out.headers.Authorization).toBe('Bearer test-token');
  });

  test('does not overwrite an existing Authorization header', () => {
    const request = { url: `${BASE}/x`, headers: { Authorization: 'Bearer existing' } };
    const out = App.beforeRequest(request, {}, authBundle);
    expect(out.headers.Authorization).toBe('Bearer existing');
  });

  test('leaves unauthenticated requests alone', () => {
    const request = { url: `${BASE}/x`, headers: {} };
    const out = App.beforeRequest(request, {}, { authData: {} });
    expect(out.headers.Authorization).toBeUndefined();
  });
});

describe('afterResponse (unit)', () => {
  const fakeZ = {};
  const bundle = {};

  test('passes 2xx responses through untouched', () => {
    const response = { status: 200, json: { ok: true } };
    expect(App.afterResponse(response, fakeZ, bundle)).toBe(response);
  });

  test('passes 401 through untouched — the core refreshes it first', () => {
    // Verified in the installed core
    // (src/tools/create-app-request-client.js): throwForStaleAuth
    // runs BEFORE app.afterResponse when autoRefresh is on, so a
    // live 401 never reaches here. Throwing here would break the
    // refresh + retry.
    const response = { status: 401, json: { error: 'invalid_token' } };
    expect(App.afterResponse(response, fakeZ, bundle)).toBe(response);
  });

  test('422 maps to a refusal error carrying the server message', () => {
    const response = { status: 422, json: { error: 'LinkedIn replies are not supported' } };
    expect(() => App.afterResponse(response, fakeZ, bundle)).toThrow(
      /422.*LinkedIn replies are not supported/
    );
  });

  test('503 maps to a demo-mode error', () => {
    const response = { status: 503, json: { error: 'zapier disabled' } };
    expect(() => App.afterResponse(response, fakeZ, bundle)).toThrow(
      /demo mode.*zapier disabled/
    );
  });

  test('404 and other errors carry the server message', () => {
    expect(() =>
      App.afterResponse({ status: 404, json: { error: 'lead not found' } }, fakeZ, bundle)
    ).toThrow(/404.*lead not found/);
    expect(() =>
      App.afterResponse({ status: 500, json: { error: 'boom' } }, fakeZ, bundle)
    ).toThrow(/500.*boom/);
  });
});

describe('error mapping (integration, via appTester + Nock)', () => {
  test('422 LinkedIn refusal on send reply surfaces as a refusal', async () => {
    nock(BASE)
      .post('/api/integrations/zapier/v1/conversations/conv_1/replies')
      .reply(422, { error: 'LinkedIn replies are not supported' });
    await expect(
      appTester(App.creates.send_reply.operation.perform, withInput({
        conversationId: 'conv_1',
        content: 'Hi!',
      }))
    ).rejects.toThrow(/LinkedIn replies are not supported/);
  });

  test('503 demo mode on a polling trigger surfaces as demo mode', async () => {
    nock(BASE)
      .get('/api/integrations/zapier/v1/leads')
      .query(true)
      .reply(503, { error: 'demo mode' });
    await expect(
      appTester(App.triggers.new_lead.operation.perform, authBundle)
    ).rejects.toThrow(/demo mode/);
  });

  test('every request carries the Bearer token', async () => {
    nock(BASE)
      .get('/api/integrations/zapier/v1/leads')
      .query(true)
      .matchHeader('authorization', 'Bearer test-token')
      .reply(200, []);
    const result = await appTester(App.triggers.new_lead.operation.perform, authBundle);
    expect(result).toEqual([]);
  });
});
