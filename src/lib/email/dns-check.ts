/**
 * Domain authentication checker — REAL DNS lookups for SPF / DKIM /
 * DMARC, server-side only.
 *
 * What this is: a reader of public DNS records. It reports which
 * authentication records exist for a domain and whether they are
 * well-formed, quoting the actual record text.
 *
 * What this is NOT: a deliverability oracle. SPF/DKIM/DMARC
 * authenticate a domain; they do not guarantee inbox placement, and
 * nothing in this module (or its UI) may claim otherwise.
 *
 * Transport: node's resolver first (`node:dns/promises`). Some
 * networks refuse direct DNS (sandboxed CI, restrictive resolvers) —
 * on resolver-FAILURE errors (REFUSED / SERVFAIL / timeout) the
 * lookup falls back to DNS-over-HTTPS (Google Public DNS JSON API),
 * which answers from the same public DNS data. Authoritative
 * "no such name / no records" answers from either transport are
 * final and never trigger the fallback.
 *
 * DKIM selectors: the ones the connected provider reports for the
 * domain are authoritative (`source: "provider"`). The built-in
 * common selectors are only guesses and are labelled as such in the
 * verdict — a "not found" for a guessed selector usually just means
 * the provider uses a different selector name.
 */

import { promises as nativeDns } from "node:dns";

// ── Types ────────────────────────────────────────────────────────────────

export type DnsCheckState = "valid" | "invalid" | "not_found" | "error";

export interface ProtocolVerdict {
  protocol: "SPF" | "DKIM" | "DMARC";
  state: DnsCheckState;
  /** The exact record texts found (empty when none). */
  records: string[];
  /** Specific problems, in plain language. */
  issues: string[];
  /** Informational notes (not problems). */
  notes: string[];
  /** What to add or change at the DNS host. */
  fix: string;
  /** DKIM only: the selector that was checked. */
  selector?: string;
  /** DKIM only: where the selector came from. */
  selectorSource?: "provider" | "guess";
}

export interface DomainAuthCheck {
  domain: string;
  checkedAt: string;
  spf: ProtocolVerdict;
  dkim: ProtocolVerdict[];
  dmarc: ProtocolVerdict;
}

/** Injectable TXT/CNAME resolver — unit tests feed fixtures through it. */
export interface TxtResolver {
  resolveTxt(hostname: string): Promise<string[][]>;
  resolveCname(hostname: string): Promise<string[]>;
}

export interface DkimSelectorToCheck {
  selector: string;
  source: "provider" | "guess";
}

export interface CheckDomainAuthDeps {
  resolver?: TxtResolver;
  /** Extra DKIM selectors (provider-reported first). Guesses are added automatically. */
  dkimSelectors?: DkimSelectorToCheck[];
}

/** Common DKIM selectors tried as GUESSES when no provider selector is known. */
export const COMMON_DKIM_SELECTORS = ["resend", "mail", "dkim"] as const;

// ── Domain normalisation ─────────────────────────────────────────────────

/**
 * Normalises user input ("https://Example.com/path", "EXAMPLE.com.")
 * to a bare domain, or returns null when the input is not a plausible
 * domain name.
 */
export function normalizeDomain(input: string | undefined | null): string | null {
  if (!input) return null;
  let v = input.trim().toLowerCase();
  if (!v) return null;
  v = v.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // strip scheme
  v = v.split("/")[0].split("?")[0].split("#")[0]; // strip path/query
  v = v.split(":")[0]; // strip port
  v = v.replace(/\.$/, ""); // trailing dot
  if (v.length === 0 || v.length > 253) return null;
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/.test(v)) {
    return null;
  }
  const tld = v.split(".").pop() ?? "";
  if (!/^[a-z]{2,}$/.test(tld)) return null;
  return v;
}

// ── Default resolver: native DNS with DoH fallback ───────────────────────

const NO_RECORD_CODES = new Set(["ENOTFOUND", "ENODATA", "NXDOMAIN"]);

function isNoRecordError(err: unknown): boolean {
  const code = (err as { code?: string } | null)?.code;
  return typeof code === "string" && NO_RECORD_CODES.has(code);
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "unknown DNS error";
}

/**
 * Parses one TXT `data` string from a DNS-over-HTTPS JSON answer.
 * TXT data arrives as one or more quoted segments ("abc" "def") that
 * must be concatenated WITHOUT the quotes/spaces between them.
 */
export function parseDohTxtData(data: string): string {
  const quoted: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(data)) !== null) {
    quoted.push(m[1].replace(/\\"/g, '"'));
  }
  if (quoted.length > 0) return quoted.join("");
  return data.replace(/^"|"$/g, "");
}

interface DohAnswer {
  name: string;
  type: number;
  data: string;
}

async function dohQuery(
  name: string,
  type: "TXT" | "CNAME",
  fetchFn: typeof fetch
): Promise<DohAnswer[]> {
  const url = `https://dns.google/resolve?name=${encodeURIComponent(name)}&type=${type}`;
  const res = await fetchFn(url, {
    headers: { accept: "application/dns-json" },
  });
  if (!res.ok) {
    throw new Error(`DNS-over-HTTPS lookup failed (HTTP ${res.status})`);
  }
  const body = (await res.json()) as {
    Status?: number;
    Answer?: DohAnswer[];
  };
  // Status 3 = NXDOMAIN (authoritative: nothing exists) → no answers.
  if (body.Status === 3) return [];
  if (typeof body.Status === "number" && body.Status !== 0) {
    throw new Error(`DNS-over-HTTPS resolver returned status ${body.Status}`);
  }
  return body.Answer ?? [];
}

/**
 * The production resolver: native DNS first, DoH fallback when the
 * native resolver itself fails (refused/servfail/timeout). Exported
 * so tests can drive the fallback logic with fakes.
 */
export function createDefaultTxtResolver(
  fetchFn: typeof fetch = fetch,
  native: Pick<TxtResolver, "resolveTxt" | "resolveCname"> = nativeDns
): TxtResolver {
  return {
    async resolveTxt(hostname) {
      try {
        return await native.resolveTxt(hostname);
      } catch (err) {
        if (isNoRecordError(err)) return [];
        const answers = await dohQuery(hostname, "TXT", fetchFn);
        return answers
          .filter((a) => a.type === 16)
          .map((a) => [parseDohTxtData(a.data)]);
      }
    },
    async resolveCname(hostname) {
      try {
        return await native.resolveCname(hostname);
      } catch (err) {
        if (isNoRecordError(err)) return [];
        const answers = await dohQuery(hostname, "CNAME", fetchFn);
        return answers
          .filter((a) => a.type === 5)
          .map((a) => a.data.replace(/\.$/, ""));
      }
    },
  };
}

async function txtAt(
  resolver: TxtResolver,
  hostname: string
): Promise<{ records: string[] } | { error: string }> {
  try {
    const chunks = await resolver.resolveTxt(hostname);
    return { records: chunks.map((parts) => parts.join("")) };
  } catch (err) {
    return { error: errorMessage(err) };
  }
}

// ── SPF ──────────────────────────────────────────────────────────────────

const SPF_LOOKUP_MECHANISMS =
  /^(include:|a$|a:|mx$|mx:|ptr$|ptr:|exists:|redirect=)/;

export function evaluateSpfRecords(
  records: string[],
  domain: string,
  locationNote?: string
): ProtocolVerdict {
  const base: ProtocolVerdict = {
    protocol: "SPF",
    state: "not_found",
    records: [],
    issues: [],
    notes: locationNote ? [locationNote] : [],
    fix: `Add a TXT record for ${domain} that starts with "v=spf1", lists the services allowed to send as this domain, and ends with "~all" (softfail) or "-all" (fail). Your sending provider's domain page shows the exact value — for Resend, the SPF record is published on the "send" subdomain and shown in Resend → Domains.`,
  };
  const spfRecords = records.filter((r) => /^v=spf1(\s|$)/i.test(r.trim()));
  if (spfRecords.length === 0) {
    return base;
  }
  base.records = spfRecords;
  if (spfRecords.length > 1) {
    return {
      ...base,
      state: "invalid",
      issues: [
        `${spfRecords.length} SPF records found — RFC 7208 allows exactly ONE v=spf1 record per name. Receivers may treat this as a permanent error (permerror) and SPF will fail. Merge them into a single record.`,
      ],
    };
  }

  const record = spfRecords[0];
  const tokens = record.trim().split(/\s+/).slice(1); // drop "v=spf1"
  const issues: string[] = [];
  const notes: string[] = [...base.notes];

  const allToken = tokens.find((t) => /^[+\-~?]?all$/i.test(t));
  const redirect = tokens.find((t) => t.toLowerCase().startsWith("redirect="));
  if (!allToken && !redirect) {
    issues.push(
      'The record has no "all" mechanism — it never states what receivers should do with senders it does not list. End the record with "~all" or "-all".'
    );
  } else if (allToken === "+all" || (allToken && /^all$/i.test(allToken))) {
    issues.push(
      `The record ends in "${allToken}", which authorises ANY server on the internet to send as ${domain}. Replace it with "~all" or "-all".`
    );
  } else if (allToken === "?all") {
    issues.push(
      'The record ends in "?all" (neutral) — it takes no position on unlisted senders, which spammers exploit. Use "~all" or "-all" instead.'
    );
  } else if (allToken === "~all") {
    notes.push(
      "Ends in ~all (softfail): unlisted senders are flagged but not outright rejected. This is the common transitional setting; -all is stronger once you are sure every sender is listed."
    );
  } else if (allToken === "-all") {
    notes.push(
      "Ends in -all (fail): receivers are told to reject mail from senders not listed in this record — the strongest SPF stance."
    );
  }

  const includes = tokens
    .filter((t) => t.toLowerCase().startsWith("include:"))
    .map((t) => t.slice("include:".length));
  if (includes.length > 0) {
    notes.push(`Authorises these services via include: ${includes.join(", ")}.`);
  }
  if (redirect) {
    notes.push(
      `This record redirects all SPF evaluation to ${redirect.slice("redirect=".length)} — the effective policy, including its "all" mechanism, comes from that record (RFC 7208 §6.1), so no local "all" is required. This checker does not follow the redirect; verify the target record separately if you need its policy.`
    );
    if (allToken) {
      notes.push(
        'Because a redirect modifier is present, the local "all" mechanism is ignored by receivers (the redirect wins).'
      );
    }
  }
  const lookupCount = tokens.filter((t) => SPF_LOOKUP_MECHANISMS.test(t.toLowerCase())).length;
  if (lookupCount > 10) {
    issues.push(
      `The record triggers ~${lookupCount} DNS lookups — RFC 7208 caps SPF at 10 lookups per check; beyond that receivers return permerror and SPF fails. Remove or flatten some include/a/mx mechanisms.`
    );
  }
  if (tokens.length === 0) {
    issues.push('The record is just "v=spf1" with no mechanisms — it authorises nothing and takes no position. Add your senders and an "all" mechanism.');
  }

  return {
    ...base,
    state: issues.length > 0 ? "invalid" : "valid",
    issues,
    notes,
    fix:
      issues.length > 0
        ? `Edit the single v=spf1 TXT record for ${domain}: keep exactly one record, list only the services that really send as this domain, stay under 10 DNS lookups, and end with "~all" or "-all" — never "+all" or "?all".`
        : base.fix,
  };
}

async function checkSpf(
  resolver: TxtResolver,
  domain: string
): Promise<ProtocolVerdict> {
  const atRoot = await txtAt(resolver, domain);
  if ("error" in atRoot) {
    return {
      protocol: "SPF",
      state: "error",
      records: [],
      issues: [`The SPF lookup for ${domain} failed: ${atRoot.error}`],
      notes: [],
      fix: "Retry the check — if DNS lookups keep failing, verify the domain's nameservers are answering.",
    };
  }
  if (atRoot.records.some((r) => /^v=spf1(\s|$)/i.test(r.trim()))) {
    return evaluateSpfRecords(atRoot.records, domain);
  }
  // Resend (and several other providers) publish the sending SPF
  // record on the "send" subdomain instead of the root. Check there
  // before declaring SPF missing.
  const atSend = await txtAt(resolver, `send.${domain}`);
  if (!("error" in atSend) && atSend.records.some((r) => /^v=spf1(\s|$)/i.test(r.trim()))) {
    return evaluateSpfRecords(
      atSend.records,
      domain,
      `SPF was found on the "send" subdomain (send.${domain}) rather than the root — this is where Resend publishes the sending SPF record. The root domain itself has no SPF record, which is fine unless the root also sends mail directly.`
    );
  }
  return evaluateSpfRecords(atRoot.records, domain);
}

// ── DMARC ────────────────────────────────────────────────────────────────

export function evaluateDmarcRecords(
  records: string[],
  domain: string
): ProtocolVerdict {
  const base: ProtocolVerdict = {
    protocol: "DMARC",
    state: "not_found",
    records: [],
    issues: [],
    notes: [],
    fix: `Add a TXT record at _dmarc.${domain} with the value "v=DMARC1; p=none; rua=mailto:dmarc@${domain}" to start monitoring, then tighten the policy to "quarantine" and finally "reject" once the aggregate reports show all legitimate senders passing SPF/DKIM alignment.`,
  };
  const dmarcRecords = records.filter((r) => /^\s*v=DMARC1(\s|;|$)/i.test(r));
  if (dmarcRecords.length === 0) {
    const otherTxt = records.length > 0;
    return {
      ...base,
      notes: otherTxt
        ? [`A TXT record exists at _dmarc.${domain} but it is not a DMARC record.`]
        : [],
    };
  }
  base.records = dmarcRecords;
  if (dmarcRecords.length > 1) {
    return {
      ...base,
      state: "invalid",
      issues: [
        `${dmarcRecords.length} DMARC records found at _dmarc.${domain} — only one is allowed; receivers ignore DMARC entirely when more than one record exists. Delete the duplicates.`,
      ],
    };
  }

  const tags = new Map<string, string>();
  for (const part of dmarcRecords[0].split(";")) {
    const eq = part.indexOf("=");
    if (eq > 0) {
      tags.set(part.slice(0, eq).trim().toLowerCase(), part.slice(eq + 1).trim());
    }
  }
  const issues: string[] = [];
  const notes: string[] = [];
  const policy = (tags.get("p") ?? "").toLowerCase();

  if (!policy) {
    issues.push('The record has no "p=" policy tag — a DMARC record without a policy is invalid and receivers will ignore it.');
  } else if (policy === "none") {
    notes.push(
      "Policy is p=none (monitor-only): mail that fails authentication is still delivered. This is the right starting point — tighten to p=quarantine, then p=reject, once aggregate reports show every legitimate sender aligned."
    );
  } else if (policy === "quarantine") {
    notes.push("Policy is p=quarantine: failing mail is treated as suspicious (typically sent to spam).");
  } else if (policy === "reject") {
    notes.push("Policy is p=reject: failing mail is refused outright — the strongest DMARC stance.");
  } else {
    issues.push(`Unrecognised policy "p=${policy}" — valid policies are none, quarantine and reject.`);
  }

  const rua = tags.get("rua");
  if (rua) {
    notes.push(`Aggregate reports (rua) go to ${rua.replace(/^mailto:/i, "")} — review them to see who sends as ${domain}.`);
  } else if (policy) {
    notes.push(
      "No rua= tag — you will not receive aggregate reports, so you cannot see which senders pass or fail. Add rua=mailto:<an address you read>."
    );
  }
  const sp = tags.get("sp");
  if (sp) notes.push(`Subdomain policy (sp) is ${sp} — it applies to subdomains without their own DMARC record.`);
  const pct = tags.get("pct");
  if (pct && pct !== "100") {
    notes.push(`pct=${pct}: the policy applies to only ${pct}% of failing mail — raise it to 100 when ready.`);
  }
  const adkim = tags.get("adkim");
  const aspf = tags.get("aspf");
  if (adkim || aspf) {
    notes.push(
      `Alignment mode: DKIM ${adkim === "s" ? "strict" : "relaxed (default)"}, SPF ${aspf === "s" ? "strict" : "relaxed (default)"}. Relaxed alignment (an organisational-domain match) is normal for provider sending.`
    );
  }

  return {
    ...base,
    state: issues.length > 0 ? "invalid" : "valid",
    issues,
    notes,
    fix:
      issues.length > 0
        ? `Fix the TXT record at _dmarc.${domain} so it is a single record starting with "v=DMARC1" and containing a valid "p=" policy (none, quarantine or reject).`
        : base.fix,
  };
}

// ── DKIM ─────────────────────────────────────────────────────────────────

async function checkDkimSelector(
  resolver: TxtResolver,
  domain: string,
  selector: string,
  source: "provider" | "guess"
): Promise<ProtocolVerdict> {
  const host = `${selector}._domainkey.${domain}`;
  const base: ProtocolVerdict = {
    protocol: "DKIM",
    state: "not_found",
    records: [],
    issues: [],
    notes: [],
    fix:
      source === "provider"
        ? `Add the DKIM TXT record your provider shows for selector "${selector}" at ${host}, exactly as given (it is long — do not wrap or truncate it).`
        : `No DKIM record was found at the guessed selector "${selector}" (${host}). DKIM selector names are chosen by your provider — check the selector your provider reports (Resend uses "resend") and run the check with the provider connected.`,
    selector,
    selectorSource: source,
  };

  const txt = await txtAt(resolver, host);
  if ("error" in txt) {
    return {
      ...base,
      state: "error",
      issues: [`The DKIM lookup for ${host} failed: ${txt.error}`],
    };
  }

  const keyRecord = txt.records.find((r) => /(^|;)\s*p=/.test(r) || /v=DKIM1/i.test(r));
  if (keyRecord) {
    base.records = [keyRecord];
    const pMatch = keyRecord.match(/(^|;)\s*p=([^;]*)/);
    const pValue = (pMatch?.[2] ?? "").trim();
    if (!pValue) {
      return {
        ...base,
        state: "invalid",
        issues: [
          `A DKIM record exists at ${host} but its p= value is empty — that means the key has been revoked. Generate a new key pair with your provider and republish the record.`,
        ],
      };
    }
    return {
      ...base,
      state: "valid",
      notes: [
        source === "provider"
          ? `DKIM key published at ${host} (selector reported by your provider).`
          : `DKIM key published at ${host} (selector found by guessing — your provider's selector happened to match).`,
      ],
    };
  }
  if (txt.records.length > 0) {
    return {
      ...base,
      state: "invalid",
      records: txt.records,
      issues: [
        `A TXT record exists at ${host} but it does not look like a DKIM key record (no p= tag). Check for a copy/paste error against the value your provider shows.`,
      ],
    };
  }

  // Delegated DKIM (e.g. Microsoft 365) publishes a CNAME instead of
  // a key record — follow it one hop.
  try {
    const cnames = await resolver.resolveCname(host);
    if (cnames.length > 0) {
      const target = cnames[0];
      const targetTxt = await txtAt(resolver, target);
      if (!("error" in targetTxt) && targetTxt.records.some((r) => /(^|;)\s*p=\s*[^;\s]/.test(r))) {
        return {
          ...base,
          state: "valid",
          records: targetTxt.records.filter((r) => /(^|;)\s*p=/.test(r)),
          notes: [`${host} is a CNAME to ${target} (delegated DKIM) and a key record is published at the target.`],
        };
      }
      return {
        ...base,
        state: "invalid",
        issues: [
          `${host} is a CNAME to ${target}, but no DKIM key record was found at that target. The delegation looks broken — check the setup with the provider that owns the target.`,
        ],
      };
    }
  } catch {
    // CNAME probing is best-effort; a failure leaves the not_found verdict.
  }
  return base;
}

// ── Orchestration ────────────────────────────────────────────────────────

export async function checkDomainAuth(
  domain: string,
  deps: CheckDomainAuthDeps = {}
): Promise<DomainAuthCheck> {
  const resolver = deps.resolver ?? createDefaultTxtResolver();
  const selectorMap = new Map<string, "provider" | "guess">();
  for (const s of deps.dkimSelectors ?? []) {
    if (s.selector.trim()) selectorMap.set(s.selector.trim().toLowerCase(), s.source);
  }
  for (const guess of COMMON_DKIM_SELECTORS) {
    if (!selectorMap.has(guess)) selectorMap.set(guess, "guess");
  }
  const selectors: DkimSelectorToCheck[] = [];
  selectorMap.forEach((source, selector) =>
    selectors.push({ selector, source })
  );

  const [spf, dmarcResult, ...dkim] = await Promise.all([
    checkSpf(resolver, domain),
    (async (): Promise<ProtocolVerdict> => {
      const res = await txtAt(resolver, `_dmarc.${domain}`);
      if ("error" in res) {
        return {
          protocol: "DMARC",
          state: "error",
          records: [],
          issues: [`The DMARC lookup for _dmarc.${domain} failed: ${res.error}`],
          notes: [],
          fix: "Retry the check — if DNS lookups keep failing, verify the domain's nameservers are answering.",
        };
      }
      return evaluateDmarcRecords(res.records, domain);
    })(),
    ...selectors.map((s) =>
      checkDkimSelector(resolver, domain, s.selector, s.source)
    ),
  ]);

  return {
    domain,
    checkedAt: new Date().toISOString(),
    spf,
    dkim,
    dmarc: dmarcResult,
  };
}
