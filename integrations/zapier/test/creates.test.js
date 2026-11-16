'use strict';

require('./setup');

const { nock } = require('./setup');
const zapier = require('zapier-platform-core');
const App = require('../index');

const appTester = zapier.createAppTester(App);
const BASE = 'https://nxtsend.com';
const authBundle = { authData: { access_token: 'test-token' } };
const withInput = (inputData) => ({ ...authBundle, inputData });

describe('creates', () => {
  test('create lead dedups by email and surfaces the duplicate flag', async () => {
    let captured;
    nock(BASE)
      .post('/api/integrations/zapier/v1/leads', (body) => {
        captured = body;
        return true;
      })
      .reply(200, {
        lead: {
          id: 'lead_1',
          email: 'jordan@example.com',
          first_name: 'Jordan',
          last_name: 'Example',
        },
        duplicate: true,
      });
    const result = await appTester(App.creates.create_lead.operation.perform, withInput({
      email: 'jordan@example.com',
      first_name: 'Jordan',
      last_name: 'Example',
      tags: 'vip, outbound',
    }));
    expect(result.duplicate).toBe(true);
    expect(result.id).toBe('lead_1');
    expect(captured.email).toBe('jordan@example.com');
    expect(captured.first_name).toBe('Jordan');
    expect(captured.last_name).toBe('Example');
    expect(captured.tags).toEqual(['vip', 'outbound']);
    // No camelCase keys: the server silently drops them.
    expect(captured.firstName).toBeUndefined();
    expect(captured.name).toBeUndefined();
  });

  test('update lead PATCHes only the filled fields', async () => {
    let captured;
    nock(BASE)
      .patch('/api/integrations/zapier/v1/leads/lead_1', (body) => {
        captured = body;
        return true;
      })
      .reply(200, { id: 'lead_1', email: 'a@example.com', status: 'contacted' });
    const result = await appTester(App.creates.update_lead.operation.perform, withInput({
      id: 'lead_1',
      status: 'contacted',
    }));
    expect(result.status).toBe('contacted');
    expect(captured).toEqual({ status: 'contacted' });
  });

  test('import leads posts rows and returns the summary counts', async () => {
    let captured;
    nock(BASE)
      .post('/api/integrations/zapier/v1/leads/import', (body) => {
        captured = body;
        return true;
      })
      .reply(200, {
        created: 1,
        skipped: 1,
        leads: [{ id: 'lead_1', email: 'a@example.com', first_name: 'Ann' }],
      });
    const result = await appTester(App.creates.import_leads.operation.perform, withInput({
      leads: [
        { email: 'a@example.com', first_name: 'Ann' },
        { email: 'b@example.com', first_name: 'Ben', tags: 'x, y' },
      ],
    }));
    expect(result.created).toBe(1);
    expect(result.skipped).toBe(1);
    expect(result.leads).toHaveLength(1);
    expect(result.leads[0].first_name).toBe('Ann');
    expect(captured.leads).toHaveLength(2);
    expect(captured.leads[0].first_name).toBe('Ann');
    expect(captured.leads[1].tags).toEqual(['x', 'y']);
  });

  test('create campaign posts a draft and never activates sending', async () => {
    let captured;
    nock(BASE)
      .post('/api/integrations/zapier/v1/campaigns', (body) => {
        captured = body;
        return true;
      })
      .reply(201, {
        campaign: { id: 'camp_1', name: 'Draft', type: 'email', status: 'draft' },
      });
    const result = await appTester(App.creates.create_campaign.operation.perform, withInput({
      name: 'Draft',
      type: 'email',
      steps: [{ step_type: 'email', subject: 'Hi', content: 'Hello!' }],
    }));
    expect(result.status).toBe('draft');
    expect(captured).toEqual({
      name: 'Draft',
      type: 'email',
      steps: [{ step_type: 'email', subject: 'Hi', content: 'Hello!' }],
    });
  });

  test('campaign lifecycle actions hit the right endpoints', async () => {
    const cases = [
      ['pause_campaign', 'pause', 'paused'],
      ['resume_campaign', 'resume', 'active'],
      ['stop_campaign', 'stop', 'archived'],
      ['archive_campaign', 'archive', 'archived'],
    ];
    for (const [key, action, status] of cases) {
      nock(BASE)
        .post(`/api/integrations/zapier/v1/campaigns/camp_1/${action}`)
        .reply(200, { id: 'camp_1', name: 'One', status });
      const result = await appTester(
        App.creates[key].operation.perform,
        withInput({ id: 'camp_1' })
      );
      expect(result.status).toBe(status);
    }
  });

  test('add leads posts leadIds and returns enrolled/skipped', async () => {
    let captured;
    nock(BASE)
      .post('/api/integrations/zapier/v1/campaigns/camp_1/leads', (body) => {
        captured = body;
        return true;
      })
      .reply(200, { enrolled: 1, skipped: 1, notFound: [] });
    const result = await appTester(
      App.creates.add_leads_to_campaign.operation.perform,
      withInput({
        campaignId: 'camp_1',
        leads: [{ leadId: 'lead_1' }, { leadId: 'lead_2' }],
      })
    );
    expect(captured).toEqual({ lead_ids: ['lead_1', 'lead_2'] });
    expect(result).toEqual({
      campaignId: 'camp_1',
      enrolled: 1,
      skipped: 1,
      notFound: [],
    });
  });

  test('remove lead DELETEs the enrollment', async () => {
    nock(BASE)
      .delete('/api/integrations/zapier/v1/campaigns/camp_1/leads/lead_1')
      .reply(200, { removed: true });
    const result = await appTester(
      App.creates.remove_lead_from_campaign.operation.perform,
      withInput({ campaignId: 'camp_1', leadId: 'lead_1' })
    );
    expect(result).toEqual({ campaignId: 'camp_1', leadId: 'lead_1', removed: true });
  });

  test('send reply posts content + an auto-generated idempotency key', async () => {
    let captured;
    nock(BASE)
      .post('/api/integrations/zapier/v1/conversations/conv_1/replies', (body) => {
        captured = body;
        return true;
      })
      .reply(201, {
        message: {
          id: 'reply_1',
          conversation_id: 'conv_1',
          content: 'Hi!',
          status: 'sent',
        },
        duplicate: false,
      });
    const result = await appTester(App.creates.send_reply.operation.perform, withInput({
      conversationId: 'conv_1',
      content: 'Hi!',
    }));
    expect(result.id).toBe('reply_1');
    expect(result.conversation_id).toBe('conv_1');
    expect(result.duplicate).toBe(false);
    expect(captured.content).toBe('Hi!');
    expect(captured.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
  });

  test('send reply passes a user-supplied idempotency key through', async () => {
    let captured;
    nock(BASE)
      .post('/api/integrations/zapier/v1/conversations/conv_1/replies', (body) => {
        captured = body;
        return true;
      })
      .reply(201, {
        message: { id: 'reply_1', conversation_id: 'conv_1', content: 'Hi!' },
        duplicate: false,
      });
    await appTester(App.creates.send_reply.operation.perform, withInput({
      conversationId: 'conv_1',
      content: 'Hi!',
      idempotencyKey: 'my-key-123',
    }));
    expect(captured.idempotencyKey).toBe('my-key-123');
  });
});

describe('searches', () => {
  test('find lead searches by email', async () => {
    nock(BASE)
      .get('/api/integrations/zapier/v1/search/leads')
      .query({ email: 'a@example.com' })
      .reply(200, { leads: [{ id: 'lead_1', email: 'a@example.com' }] });
    const result = await appTester(App.searches.find_lead.operation.perform, withInput({
      email: 'a@example.com',
    }));
    expect(result[0].id).toBe('lead_1');
  });

  test('find lead returns [] when nothing matches', async () => {
    nock(BASE)
      .get('/api/integrations/zapier/v1/search/leads')
      .query(true)
      .reply(200, { leads: [] });
    const result = await appTester(App.searches.find_lead.operation.perform, withInput({
      q: 'nobody',
    }));
    expect(result).toEqual([]);
  });

  test('find campaign searches by name and status', async () => {
    nock(BASE)
      .get('/api/integrations/zapier/v1/search/campaigns')
      .query({ q: 'Outbound', status: 'active' })
      .reply(200, {
        campaigns: [{ id: 'camp_1', name: 'Outbound', status: 'active' }],
      });
    const result = await appTester(App.searches.find_campaign.operation.perform, withInput({
      q: 'Outbound',
      status: 'active',
    }));
    expect(result[0].status).toBe('active');
  });

  test('find conversation and find account search by q', async () => {
    nock(BASE)
      .get('/api/integrations/zapier/v1/search/conversations')
      .query({ q: 'Jordan' })
      .reply(200, { conversations: [{ id: 'conv_1', subject: 'Hi Jordan' }] });
    nock(BASE)
      .get('/api/integrations/zapier/v1/search/accounts')
      .query({ q: 'Jordan' })
      .reply(200, { accounts: [{ id: 'acc_1', display_name: 'Jordan' }] });
    const convs = await appTester(
      App.searches.find_conversation.operation.perform,
      withInput({ q: 'Jordan' })
    );
    expect(convs[0].id).toBe('conv_1');
    const accounts = await appTester(
      App.searches.find_account.operation.perform,
      withInput({ q: 'Jordan' })
    );
    expect(accounts[0].id).toBe('acc_1');
  });

  test('get campaign performance returns flattened stats', async () => {
    nock(BASE)
      .get('/api/integrations/zapier/v1/campaigns/camp_1/performance')
      .reply(200, {
        campaign_id: 'camp_1',
        stats: {
          campaignId: 'camp_1',
          prospects: 10,
          enrollments: { total: 10, inProgress: 6, completed: 3, stopped: 1 },
          linkedin: {
            providerConnected: false,
            connectionRequestsSent: 0,
            accepted: null,
            messagesSent: 0,
            replied: 0,
            stepsSkipped: 0,
          },
          email: {
            sent: 8,
            sentProviderConfirmed: 8,
            sentSimulated: 0,
            failed: 0,
            opened: 5,
            clicked: 1,
            bounced: 0,
            complained: 0,
          },
          repliesTotal: 2,
          meetingsBooked: 1,
          executions: {
            total: 8,
            sent: 8,
            simulated: 0,
            skipped: 0,
            stopped: 0,
            executed: 8,
            failed: 0,
          },
        },
      });
    const result = await appTester(
      App.searches.get_campaign_performance.operation.perform,
      withInput({ campaignId: 'camp_1' })
    );
    expect(result[0].campaign_id).toBe('camp_1');
    expect(result[0].stats.prospects).toBe(10);
    expect(result[0].stats.linkedin.accepted).toBeNull();
    expect(result[0].stats.email.sent).toBe(8);
  });
});
