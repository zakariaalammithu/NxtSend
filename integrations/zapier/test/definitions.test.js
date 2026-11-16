'use strict';

require('./setup');

const App = require('../index');
const { sampleLead, sampleCampaign } = require('../lib/samples');

/**
 * Flatten a sample object the way Zapier reads nested output:
 * `{data: {email: 'x'}}` becomes the key `data__email`.
 */
const flattenKeys = (obj, prefix = '') => {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const full = prefix ? `${prefix}__${key}` : key;
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, full));
    } else {
      keys.push(full);
    }
  }
  return keys;
};

const allTriggers = Object.values(App.triggers);
const allSearches = Object.values(App.searches);
const allCreates = Object.values(App.creates);

describe('app definition', () => {
  test('exports the app shape Zapier expects', () => {
    expect(App.version).toBe('1.0.0');
    expect(typeof App.platformVersion).toBe('string');
    expect(App.authentication.type).toBe('oauth2');
    expect(typeof App.beforeRequest).toBe('function');
    expect(typeof App.afterResponse).toBe('function');
  });

  test('trigger/search/create keys are unique', () => {
    const keys = [
      ...allTriggers.map((t) => t.key),
      ...allSearches.map((s) => s.key),
      ...allCreates.map((c) => c.key),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  test('every trigger, search and create has a label, a perform and a sample', () => {
    for (const item of [...allTriggers, ...allSearches, ...allCreates]) {
      expect(item.key).toBeTruthy();
      expect(item.display && item.display.label).toBeTruthy();
      expect(typeof item.operation.perform).toBe('function');
      expect(item.operation.sample).toBeTruthy();
    }
    // performList (sample data for the editor) exists ONLY on
    // REST-hook triggers in the installed schema (18.6.0) —
    // polling triggers and searches use `sample` instead, and
    // creates have no performList at all.
    for (const item of allTriggers) {
      if (item.operation.type === 'hook') {
        expect(typeof item.operation.performList).toBe('function');
      } else {
        expect(item.operation.performList).toBeUndefined();
      }
    }
    for (const item of [...allSearches, ...allCreates]) {
      expect(item.operation.performList).toBeUndefined();
    }
  });

  test('every sample’s keys are covered by its outputFields', () => {
    for (const item of [...allTriggers, ...allSearches, ...allCreates]) {
      const outputKeys = new Set(
        (item.operation.outputFields || []).map((field) => field.key)
      );
      expect(outputKeys.size).toBeGreaterThan(0);
      const missing = flattenKeys(item.operation.sample).filter(
        (key) => !outputKeys.has(key)
      );
      expect(
        missing.map((key) => `${item.key}: sample key "${key}" is not in outputFields`)
      ).toEqual([]);
    }
  });

  test('every trigger/search output has an id field marked primary for dedup', () => {
    // Primary fields drive polling/search dedup; creates return a
    // single result and do not dedup, so they are exempt.
    for (const item of [...allTriggers, ...allSearches]) {
      const primary = (item.operation.outputFields || []).filter(
        (field) => field.primary
      );
      expect(primary.length).toBeGreaterThanOrEqual(1);
    }
  });

  test('outputField keys are unique within each operation', () => {
    for (const item of [...allTriggers, ...allSearches, ...allCreates]) {
      const keys = (item.operation.outputFields || []).map((field) => field.key);
      expect(new Set(keys).size).toBe(keys.length);
    }
  });

  test('polling triggers are polling, hook triggers are hooks', () => {
    const polling = allTriggers.filter((t) => t.operation.type === 'polling');
    const hooks = allTriggers.filter((t) => t.operation.type === 'hook');
    expect(polling.map((t) => t.key).sort()).toEqual(
      [
        'campaign_status_changed',
        'list_accounts',
        'list_campaigns',
        'list_lead_statuses',
        'list_sequences',
        'new_campaign',
        'new_conversation',
        'new_lead',
        'updated_lead',
      ].sort()
    );
    expect(hooks.map((t) => t.key).sort()).toEqual(
      [
        'campaign_status_changed_instant',
        'lead_added_to_campaign_instant',
        'lead_removed_from_campaign_instant',
        'new_campaign_instant',
        'new_lead_instant',
        'new_reply_instant',
        'subscription_changed_instant',
        'updated_lead_instant',
      ].sort()
    );
    for (const hook of hooks) {
      expect(typeof hook.operation.performSubscribe).toBe('function');
      expect(typeof hook.operation.performUnsubscribe).toBe('function');
    }
  });

  test('hidden triggers are only the dropdown lists', () => {
    const hidden = allTriggers.filter((t) => t.display.hidden).map((t) => t.key);
    expect(hidden.sort()).toEqual(
      [
        'list_accounts',
        'list_campaigns',
        'list_lead_statuses',
        'list_sequences',
      ].sort()
    );
  });

  test('search-or-creates pair the right search with the right create', () => {
    expect(App.searchOrCreates.find_lead.search).toBe('find_lead');
    expect(App.searchOrCreates.find_lead.create).toBe('create_lead');
    expect(App.searchOrCreates.find_campaign.search).toBe('find_campaign');
    expect(App.searchOrCreates.find_campaign.create).toBe('create_campaign');
    expect(Object.keys(App.searchOrCreates).length).toBe(2);
  });

  test('dynamic dropdowns reference triggers that exist (searches are rejected, D005)', () => {
    const knownKeys = new Set(Object.keys(App.triggers));
    const collectDynamic = (fields) => {
      const found = [];
      for (const field of fields || []) {
        if (field.dynamic) {
          found.push(field.dynamic);
        }
        if (field.children) {
          found.push(...collectDynamic(field.children));
        }
      }
      return found;
    };
    for (const item of [...allSearches, ...allCreates]) {
      for (const dynamic of collectDynamic(item.operation.inputFields)) {
        const refKey = dynamic.split('.')[0];
        expect(knownKeys.has(refKey)).toBe(true);
      }
    }
  });

  test('no LinkedIn-send action or trigger exists', () => {
    const haystack = JSON.stringify({
      triggers: Object.keys(App.triggers),
      searches: Object.keys(App.searches),
      creates: Object.keys(App.creates),
    });
    expect(haystack).not.toMatch(/linkedin.*(send|accept|invite|connect)/i);
    expect(App.creates.send_reply).toBeTruthy();
    expect(App.creates.send_reply.display.description).toMatch(/EMAIL ONLY/i);
  });

  test('samples contain no real personal data', () => {
    expect(JSON.stringify(sampleLead)).toMatch(/example\.com/);
    expect(JSON.stringify(sampleCampaign)).toMatch(/Example/);
  });
});
