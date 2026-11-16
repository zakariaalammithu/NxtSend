'use strict';

require('./setup');

const { nock } = require('./setup');
const zapier = require('zapier-platform-core');
const App = require('../index');

const appTester = zapier.createAppTester(App);
const BASE = 'https://nxtsend.com';
const authBundle = { authData: { access_token: 'test-token' } };

const leadA = {
  id: 'lead_1',
  email: 'a@example.com',
  firstName: 'Ann',
  created_at: '2026-11-17T09:00:00.000Z',
  updated_at: '2026-11-17T09:00:00.000Z',
};
const leadB = {
  id: 'lead_2',
  email: 'b@example.com',
  firstName: 'Ben',
  created_at: '2026-11-17T10:00:00.000Z',
  updated_at: '2026-11-17T11:00:00.000Z',
};

describe('polling triggers', () => {
  test('new lead returns newest first', async () => {
    nock(BASE)
      .get('/api/integrations/zapier/v1/leads')
      .query(true)
      .reply(200, { leads: [leadA, leadB], count: 2 });
    const result = await appTester(App.triggers.new_lead.operation.perform, authBundle);
    expect(result.map((lead) => lead.id)).toEqual(['lead_2', 'lead_1']);
  });

  test('lead updated uses a composite id and keeps the real id', async () => {
    // Updated-first ordering is requested from the server
    // (order=updated_at_desc), so the newest update is first.
    nock(BASE)
      .get('/api/integrations/zapier/v1/leads')
      .query({ limit: '100', order: 'updated_at_desc' })
      .reply(200, { leads: [leadB, leadA], count: 2 });
    const result = await appTester(App.triggers.updated_lead.operation.perform, authBundle);
    expect(result[0].id).toBe('lead_2__2026-11-17T11:00:00.000Z');
    expect(result[0].lead_id).toBe('lead_2');
    expect(result[1].id).toBe('lead_1__2026-11-17T09:00:00.000Z');
  });

  test('campaign status changed uses a composite id of campaign + status', async () => {
    const campaigns = [
      { id: 'camp_1', name: 'One', status: 'draft', created_at: '2026-11-17T09:00:00.000Z' },
      { id: 'camp_2', name: 'Two', status: 'active', created_at: '2026-11-17T10:00:00.000Z' },
    ];
    nock(BASE)
      .get('/api/integrations/zapier/v1/campaigns')
      .query(true)
      .reply(200, { campaigns, count: 2 });
    const result = await appTester(
      App.triggers.campaign_status_changed.operation.perform,
      authBundle
    );
    expect(result[0].id).toBe('camp_2__active');
    expect(result[0].campaign_id).toBe('camp_2');
  });

  test('new campaign and new conversation return newest first', async () => {
    nock(BASE)
      .get('/api/integrations/zapier/v1/campaigns')
      .query(true)
      .reply(200, {
        campaigns: [
          { id: 'camp_1', name: 'One', created_at: '2026-11-17T09:00:00.000Z' },
          { id: 'camp_2', name: 'Two', created_at: '2026-11-17T10:00:00.000Z' },
        ],
        count: 2,
      });
    nock(BASE)
      .get('/api/integrations/zapier/v1/conversations')
      .query(true)
      .reply(200, {
        conversations: [
          { id: 'conv_1', subject: 'Old', created_at: '2026-11-17T09:00:00.000Z' },
          { id: 'conv_2', subject: 'New', created_at: '2026-11-17T10:00:00.000Z' },
        ],
        count: 2,
      });
    const campaigns = await appTester(App.triggers.new_campaign.operation.perform, authBundle);
    expect(campaigns[0].id).toBe('camp_2');
    const conversations = await appTester(
      App.triggers.new_conversation.operation.perform,
      authBundle
    );
    expect(conversations[0].id).toBe('conv_2');
  });

  test('every polling trigger carries a sample with an id', () => {
    for (const trigger of Object.values(App.triggers)) {
      if (trigger.operation.type !== 'polling') continue;
      expect(trigger.operation.sample).toBeTruthy();
      expect(trigger.operation.sample.id).toBeTruthy();
    }
  });
});

describe('REST hook triggers', () => {
  const envelope = {
    id: 'evt_1',
    type: 'lead.created',
    created_at: '2026-11-17T10:00:00.000Z',
    workspace_id: 'ws_1',
    data: { id: 'lead_1', email: 'a@example.com' },
  };

  test('subscribe posts event + target_url and returns the subscription', async () => {
    nock(BASE)
      .post('/api/integrations/zapier/v1/webhooks/subscribe', {
        event: 'lead.created',
        target_url: 'https://hooks.zapier.com/hooks/catch/1/abc/',
      })
      .reply(201, {
        id: 'sub_1',
        event: 'lead.created',
        target_url: 'https://hooks.zapier.com/hooks/catch/1/abc/',
      });
    const bundle = {
      ...authBundle,
      targetUrl: 'https://hooks.zapier.com/hooks/catch/1/abc/',
    };
    const result = await appTester(
      App.triggers.new_lead_instant.operation.performSubscribe,
      bundle
    );
    expect(result.id).toBe('sub_1');
  });

  test('unsubscribe posts the stored subscription id', async () => {
    nock(BASE)
      .post('/api/integrations/zapier/v1/webhooks/unsubscribe', { id: 'sub_1' })
      .reply(200, { id: 'sub_1', deleted: true });
    const bundle = { ...authBundle, subscribeData: { id: 'sub_1' } };
    const result = await appTester(
      App.triggers.new_lead_instant.operation.performUnsubscribe,
      bundle
    );
    expect(result.id).toBe('sub_1');
  });

  test('unsubscribe treats an unknown id (404) as already unsubscribed', async () => {
    nock(BASE)
      .post('/api/integrations/zapier/v1/webhooks/unsubscribe', { id: 'sub_gone' })
      .reply(404, { error: 'Subscription not found.', code: 'not_found' });
    const bundle = { ...authBundle, subscribeData: { id: 'sub_gone' } };
    const result = await appTester(
      App.triggers.new_lead_instant.operation.performUnsubscribe,
      bundle
    );
    expect(result).toEqual({ id: 'sub_gone', unsubscribed: true });
  });

  test('perform returns the cleaned webhook request as an array', async () => {
    const bundle = { ...authBundle, cleanedRequest: envelope };
    const result = await appTester(
      App.triggers.new_lead_instant.operation.perform,
      bundle
    );
    expect(result).toEqual([envelope]);
  });

  test('performList returns the sample envelope for every hook trigger', async () => {
    for (const trigger of Object.values(App.triggers)) {
      if (trigger.operation.type !== 'hook') continue;
      const result = await appTester(trigger.operation.performList, authBundle);
      expect(result.length).toBe(1);
      expect(result[0].id).toBeTruthy();
      expect(result[0].type).toBeTruthy();
      expect(result[0].workspace_id).toBeTruthy();
      expect(result[0].data).toBeTruthy();
    }
  });

  test('every hook trigger subscribes with a distinct real event name', async () => {
    const events = new Set();
    for (const trigger of Object.values(App.triggers)) {
      if (trigger.operation.type !== 'hook') continue;
      let captured;
      nock(BASE)
        .post('/api/integrations/zapier/v1/webhooks/subscribe', (body) => {
          captured = body;
          return true;
        })
        .reply(201, { id: 'sub_x', event: 'x', target_url: 'https://hooks.zapier.com/t' });
      await appTester(trigger.operation.performSubscribe, {
        ...authBundle,
        targetUrl: 'https://hooks.zapier.com/t',
      });
      expect(captured.event).toMatch(/^[a-z]+\.[a-z_]+$/);
      events.add(captured.event);
    }
    expect([...events].sort()).toEqual(
      [
        'campaign.created',
        'campaign.status_changed',
        'conversation.reply_created',
        'lead.added_to_campaign',
        'lead.created',
        'lead.removed_from_campaign',
        'lead.updated',
        'subscription.changed',
      ].sort()
    );
  });
});

describe('dynamic dropdowns (hidden triggers)', () => {
  test('campaigns dropdown returns normalized id/label rows', async () => {
    nock(BASE)
      .get('/api/integrations/zapier/v1/dropdowns/campaigns')
      .reply(200, [
        { id: 'camp_1', name: 'One' },
        { id: 'camp_2', label: 'Two' },
      ]);
    const result = await appTester(App.triggers.list_campaigns.operation.perform, authBundle);
    expect(result).toEqual([
      { id: 'camp_1', label: 'One' },
      { id: 'camp_2', label: 'Two' },
    ]);
  });

  test('sequences dropdown passes the campaign id through', async () => {
    nock(BASE)
      .get('/api/integrations/zapier/v1/dropdowns/sequences')
      .query({ campaign_id: 'camp_1' })
      .reply(200, {
        items: [
          { id: 'step_1', name: 'Step 1: email', step_type: 'email', step_order: 1 },
          { id: 'step_2', name: 'Step 2: wait', step_type: 'wait', step_order: 2 },
        ],
      });
    const result = await appTester(App.triggers.list_sequences.operation.perform, {
      ...authBundle,
      inputData: { id: 'camp_1' },
    });
    expect(result).toEqual([
      { id: 'step_1', label: 'Step 1: email' },
      { id: 'step_2', label: 'Step 2: wait' },
    ]);
  });

  test('sequences dropdown is empty without a campaign id', async () => {
    const result = await appTester(
      App.triggers.list_sequences.operation.perform,
      authBundle
    );
    expect(result).toEqual([]);
  });

  test('bare-string dropdown rows become id = label', async () => {
    nock(BASE)
      .get('/api/integrations/zapier/v1/dropdowns/lead-statuses')
      .reply(200, ['new', 'contacted']);
    const result = await appTester(
      App.triggers.list_lead_statuses.operation.perform,
      authBundle
    );
    expect(result).toEqual([
      { id: 'new', label: 'new' },
      { id: 'contacted', label: 'contacted' },
    ]);
  });

  test('empty and error dropdown responses become [] instead of throwing', async () => {
    nock(BASE).get('/api/integrations/zapier/v1/dropdowns/accounts').reply(200, []);
    const empty = await appTester(App.triggers.list_accounts.operation.perform, authBundle);
    expect(empty).toEqual([]);

    // Sequences need a campaign id; with one, a 404 still degrades to [].
    nock(BASE)
      .get('/api/integrations/zapier/v1/dropdowns/sequences')
      .query({ campaign_id: 'camp_1' })
      .reply(404, { error: 'not found' });
    const missing = await appTester(App.triggers.list_sequences.operation.perform, {
      ...authBundle,
      inputData: { id: 'camp_1' },
    });
    expect(missing).toEqual([]);

    nock(BASE).get('/api/integrations/zapier/v1/dropdowns/campaigns').reply(500, {
      error: 'boom',
    });
    const errored = await appTester(
      App.triggers.list_campaigns.operation.perform,
      authBundle
    );
    expect(errored).toEqual([]);
  });
});
