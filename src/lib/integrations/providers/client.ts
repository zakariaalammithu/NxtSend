/**
 * ProviderHttpClient — the ONE typed HTTP client every provider
 * adapter must use to call a third-party provider.
 *
 * Rules:
 *  - 10s default timeout (AbortController). A timeout is a
 *    `provider_timeout` ProviderError — it is NOT retried.
 *  - Retries ONLY on retryable statuses (429, 502, 503, 504) with
 *    exponential backoff, max 3 attempts total (2 retries).
 *    4xx (other than 429) and other 5xx are returned immediately
 *    as ProviderErrors — a 400 is a caller bug, not a retry.
 *  - Non-2xx maps to a stable `ProviderError` code:
 *    `provider_http_<status>` / `provider_timeout` /
 *    `provider_network`. `status` is the HTTP status, or 408 for a
 *    timeout and 0 when no HTTP response was received.
 *  - Secrets never leak into errors: auth-header values supplied
 *    by `getAuthHeaders` are redacted from every error message,
 *    along with generic `Bearer <token>` / `api-key <value>`
 *    patterns in provider-supplied bodies.
 *  - No real network calls in unit tests — test with a mocked
 *    global fetch (see `__tests__/client.test.ts`).
 */

import type { ProviderError } from "./types";

export const PROVIDER_HTTP_TIMEOUT_MS = 10_000;
export const PROVIDER_HTTP_MAX_ATTEMPTS = 3;
export const PROVIDER_HTTP_RETRY_STATUSES = new Set([429, 502, 503, 504]);
const RETRY_BASE_DELAY_MS = 250;
const MAX_ERROR_BODY_CHARS = 500;

export type ProviderHttpMethod = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";

export interface ProviderHttpRequestOptions {
  method: ProviderHttpMethod;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
  headers?: Record<string, string>;
}

export interface ProviderHttpClientOptions {
  baseUrl: string;
  getAuthHeaders: () => Record<string, string> | Promise<Record<string, string>>;
  /** Per-attempt timeout in ms. Default 10_000. */
  timeoutMs?: number;
  /** Retries after the first attempt. Default 2 (3 attempts total). */
  maxRetries?: number;
  /** Base delay for exponential backoff in ms. Default 250. */
  retryDelayMs?: number;
  /** Delay between attempts; defaults to an exponential backoff sleep. */
  sleep?: (ms: number) => Promise<void>;
}

function sleepDefault(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Redacts every known secret value plus generic credential patterns
 * from a string. Auth-header values are known secrets: they are
 * passed in by the caller (the client does this for every error
 * message it builds).
 */
export function redactSecrets(text: string, secrets: string[] = []): string {
  let out = text;
  for (const secret of secrets) {
    if (secret && secret.length >= 4 && out.includes(secret)) {
      out = out.split(secret).join("[redacted]");
    }
  }
  // Generic patterns — a provider error body must never echo a
  // credential back into our logs, even one we did not send.
  out = out.replace(/Bearer\s+[A-Za-z0-9\-._~+/=]+/gi, "Bearer [redacted]");
  out = out.replace(
    /(api[_-]?key|access[_-]?token|client[_-]?secret)\s*[:=]\s*["']?[^\s"',}]+["']?/gi,
    "$1 [redacted]"
  );
  return out;
}

export function isProviderError(x: unknown): x is ProviderError {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.code === "string" &&
    e.code.startsWith("provider_") &&
    typeof e.status === "number" &&
    typeof e.retryable === "boolean" &&
    typeof e.message === "string"
  );
}

function makeProviderError(
  code: string,
  status: number,
  retryable: boolean,
  message: string
): ProviderError {
  const error = new Error(message) as Error & ProviderError;
  error.code = code;
  error.status = status;
  error.retryable = retryable;
  return error;
}

/** Normalises any thrown value into a ProviderError (never throws). */
export function toProviderError(err: unknown): ProviderError {
  if (isProviderError(err)) return err;
  if (err instanceof Error) {
    const name = err.name ?? "";
    if (name === "AbortError" || name === "TimeoutError") {
      return makeProviderError("provider_timeout", 408, false, "Provider request timed out.");
    }
    return makeProviderError(
      "provider_network",
      0,
      false,
      `Provider request failed: ${redactSecrets(err.message)}`
    );
  }
  return makeProviderError("provider_network", 0, false, "Provider request failed.");
}

export class ProviderHttpClient {
  private readonly baseUrl: string;
  private readonly getAuthHeaders: () => Record<string, string> | Promise<Record<string, string>>;
  private readonly timeoutMs: number;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(opts: ProviderHttpClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.getAuthHeaders = opts.getAuthHeaders;
    this.timeoutMs = opts.timeoutMs ?? PROVIDER_HTTP_TIMEOUT_MS;
    this.maxRetries = opts.maxRetries ?? PROVIDER_HTTP_MAX_ATTEMPTS - 1;
    this.retryDelayMs = opts.retryDelayMs ?? RETRY_BASE_DELAY_MS;
    this.sleep = opts.sleep ?? sleepDefault;
  }

  async request<T>(opts: ProviderHttpRequestOptions): Promise<T> {
    const authHeaders = await this.getAuthHeaders();
    const secretValues = Object.values(authHeaders).filter((v) => v.length >= 4);
    const headers: Record<string, string> = {
      Accept: "application/json",
      ...authHeaders,
      ...(opts.headers ?? {}),
    };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(opts.body);
    }

    const url = new URL(`${this.baseUrl}${opts.path}`);
    if (opts.query) {
      for (const [key, value] of Object.entries(opts.query)) {
        url.searchParams.set(key, value);
      }
    }

    const maxAttempts = this.maxRetries + 1;
    let lastError: ProviderError | null = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      try {
        const response = await fetch(url.toString(), {
          method: opts.method,
          headers,
          body,
          signal: controller.signal,
        });
        clearTimeout(timer);

        if (response.ok) {
          if (response.status === 204) return undefined as T;
          const text = await response.text();
          if (!text.trim()) return undefined as T;
          const contentType = response.headers.get("content-type") ?? "";
          if (contentType.includes("application/json")) {
            return JSON.parse(text) as T;
          }
          return text as T;
        }

        const rawBody = await response.text().catch(() => "");
        const detail = redactSecrets(rawBody.slice(0, MAX_ERROR_BODY_CHARS), secretValues);
        const error = makeProviderError(
          `provider_http_${response.status}`,
          response.status,
          PROVIDER_HTTP_RETRY_STATUSES.has(response.status),
          detail
            ? `Provider request failed (${response.status}): ${detail}`
            : `Provider request failed with status ${response.status}.`
        );
        if (!error.retryable || attempt === maxAttempts) throw error;
        lastError = error;
      } catch (err) {
        clearTimeout(timer);
        if (isProviderError(err)) {
          // Retryable HTTP error from above: back off, then retry.
          if (err.retryable && attempt < maxAttempts) {
            lastError = err;
          } else {
            throw err;
          }
        } else {
          // Timeout / network failure: never retried.
          throw toProviderError(err);
        }
      }

      if (attempt < maxAttempts) {
        await this.sleep(this.retryDelayMs * 2 ** (attempt - 1));
      }
    }

    // Unreachable in practice (the loop always throws or returns),
    // but fail closed rather than returning undefined.
    throw (
      lastError ??
      makeProviderError("provider_network", 0, false, "Provider request failed.")
    );
  }
}
