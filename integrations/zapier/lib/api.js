'use strict';

/**
 * Shared helpers for the NxtSend Zapier app.
 *
 * Base URL: the `ZAPIER_APP_BASE_URL` variable set in the Zapier
 * developer dashboard (per-app environment), falling back to the
 * production origin `https://nxtsend.com`. All API paths live under
 * `/api/integrations/zapier/v1/` (see the API contract in README.md).
 *
 * No secrets live in this file or anywhere in this package: the
 * OAuth client id/secret come from the Zapier dashboard env
 * (`process.env.CLIENT_ID` / `process.env.CLIENT_SECRET`) and the
 * access token from the connected account (`bundle.authData`).
 */

const DEFAULT_BASE_URL = 'https://nxtsend.com';
const API_PREFIX = '/api/integrations/zapier/v1';

/** Public origin of the NxtSend API (no trailing slash). */
const baseUrl = () =>
  (process.env.ZAPIER_APP_BASE_URL || DEFAULT_BASE_URL).replace(/\/+$/, '');

/** Full URL for a versioned API path such as `/leads`. */
const apiUrl = (path) => `${baseUrl()}${API_PREFIX}${path}`;

/**
 * Unwrap a list response. The contract says lists are newest-first
 * arrays; be liberal in what we accept because the exact envelope
 * shape is server-defined: a bare array, `{items: [...]}`, or an
 * object whose first array-valued key holds the rows.
 */
const unwrapList = (data) => {
  if (Array.isArray(data)) {
    return data;
  }
  if (data && typeof data === 'object') {
    for (const key of ['items', 'results', 'data']) {
      if (Array.isArray(data[key])) {
        return data[key];
      }
    }
    for (const value of Object.values(data)) {
      if (Array.isArray(value)) {
        return value;
      }
    }
  }
  return [];
};

/** Newest-first copy of `items` by ISO timestamp key `key`. */
const sortDesc = (items, key) =>
  [...items].sort((a, b) => String(b[key] || '').localeCompare(String(a[key] || '')));

/**
 * GET a list endpoint (limit 100 = the polling max) and return the
 * unwrapped rows. Extra `params` (e.g. `after`) are passed through.
 */
const fetchList = async (z, path, params = {}) => {
  const response = await z.request({
    url: apiUrl(path),
    params: { limit: 100, ...params },
  });
  return unwrapList(response.json);
};

/**
 * Normalise one dropdown row into `{id, label}`. Dropdown endpoints
 * may return bare strings (`"active"`) or objects shaped
 * `{id, label}`, `{value, label}` or `{id, name}` — accept all of
 * them so a server-side shape change degrades to a working list
 * instead of an empty dropdown.
 */
const normalizeDropdownItem = (item) => {
  if (typeof item === 'string') {
    return { id: item, label: item };
  }
  if (item && typeof item === 'object') {
    const id = item.id ?? item.value ?? item.key ?? item.slug;
    const label = item.label ?? item.name ?? item.title ?? id;
    if (id !== undefined && id !== null && String(id) !== '') {
      return { id: String(id), label: String(label) };
    }
  }
  return null;
};

/**
 * GET a dropdown endpoint and return `{id, label}` rows. Empty and
 * error responses become `[]` (never throw): a failed dropdown must
 * not break the whole Zap editor — the user can still type a value.
 */
const fetchDropdown = async (z, path) => {
  try {
    const response = await z.request({ url: apiUrl(path) });
    return unwrapList(response.json)
      .map(normalizeDropdownItem)
      .filter(Boolean);
  } catch (error) {
    // Dropdown endpoints are best-effort (the server may not have
    // implemented one yet); surface nothing, break nothing.
    z.console.log(`Dropdown ${path} unavailable: ${error.message}`);
    return [];
  }
};

module.exports = {
  DEFAULT_BASE_URL,
  API_PREFIX,
  baseUrl,
  apiUrl,
  unwrapList,
  sortDesc,
  fetchList,
  normalizeDropdownItem,
  fetchDropdown,
};
