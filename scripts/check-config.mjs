#!/usr/bin/env node
/**
 * npm run config:check [-- --live] [-- --env-file <path>]
 *
 * Prints the NxtSend configuration matrix — every variable from
 * .env.example classified as SET / PLACEHOLDER / MISSING, grouped by
 * feature — WITHOUT printing any values.
 *
 * Source of truth for the catalogue + classification rules is
 * src/lib/config-status.ts (a unit test pins that catalogue to
 * .env.example); this script mirrors it so it can run offline with
 * zero dependencies before `npm install`.
 *
 * Values are read from .env.local when present (default path), else
 * from the process environment. Exit code: 0 normally; with --live,
 * exit 1 when any REQUIRED-for-live variable is missing or still a
 * placeholder.
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const CATALOG = [
  // [name, group, requiredForLive]
  ["NEXT_PUBLIC_APP_URL", "core", true],
  ["NODE_ENV", "core", false],
  ["NEXT_PUBLIC_SUPABASE_URL", "core", true],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "core", true],
  ["SUPABASE_SERVICE_ROLE_KEY", "core", true],
  ["ADMIN_BOOTSTRAP_SECRET", "core", false],
  ["RESEND_API_KEY", "email", false],
  ["EMAIL_FROM", "email", false],
  ["RESEND_WEBHOOK_SECRET", "email", false],
  ["STRIPE_SECRET_KEY", "billing", false],
  ["STRIPE_WEBHOOK_SECRET", "billing", false],
  ["NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY", "billing", false],
  ["STRIPE_PRICE_ID_STARTER", "billing", false],
  ["STRIPE_PRICE_ID_STARTER_ANNUAL", "billing", false],
  ["STRIPE_PRICE_ID_GROWTH", "billing", false],
  ["STRIPE_PRICE_ID_GROWTH_ANNUAL", "billing", false],
  ["STRIPE_PRICE_ID_AGENCY", "billing", false],
  ["STRIPE_PRICE_ID_AGENCY_ANNUAL", "billing", false],
  ["OPENAI_API_KEY", "ai", false],
  ["OPENAI_MODEL", "ai", false],
  ["ANTHROPIC_API_KEY", "ai", false],
  ["ANTHROPIC_MODEL", "ai", false],
  ["MODEL_API_KEY", "ai", false],
  ["META_MODEL", "ai", false],
  ["NEXT_PUBLIC_META_PIXEL_ID", "pixel", false],
  ["CRON_SECRET", "jobs", true],
  ["LINKEDIN_CLIENT_ID", "integrations", false],
  ["LINKEDIN_CLIENT_SECRET", "integrations", false],
  ["LINKEDIN_REDIRECT_URI", "integrations", false],
];

const GROUP_LABELS = {
  core: "Core (app + Supabase + bootstrap)",
  email: "Email (Resend)",
  billing: "Billing (Stripe)",
  ai: "AI providers",
  pixel: "Meta Pixel",
  jobs: "Background jobs",
  integrations: "Integrations (LinkedIn — documented demo)",
};

/** Mirrors isConfiguredValue() in src/lib/env.ts. */
function isConfiguredValue(value) {
  if (!value) return false;
  const v = String(value).trim();
  if (v.length === 0) return false;
  const lower = v.toLowerCase();
  if (lower.includes("placeholder")) return false;
  if (lower.includes("your-") || lower.includes("your_")) return false;
  if (lower.startsWith("change-me")) return false;
  if (lower === "demo" || lower === "test") return false;
  return true;
}

function classify(name, raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return "MISSING";
  }
  if (name === "NODE_ENV") return "SET";
  return isConfiguredValue(raw) ? "SET" : "PLACEHOLDER";
}

function parseEnvFile(path) {
  const out = {};
  if (!existsSync(path)) return out;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq < 0) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[key] = value;
  }
  return out;
}

const args = process.argv.slice(2);
const live = args.includes("--live");
const envFileIdx = args.indexOf("--env-file");
const envFile = envFileIdx >= 0 ? args[envFileIdx + 1] : ".env.local";
const fileEnv = parseEnvFile(resolve(process.cwd(), envFile));
const source = existsSync(resolve(process.cwd(), envFile))
  ? envFile
  : "process environment (no env file found)";

const merged = {};
for (const [name] of CATALOG) {
  merged[name] = fileEnv[name] !== undefined ? fileEnv[name] : process.env[name];
}
if (!merged.NODE_ENV) merged.NODE_ENV = process.env.NODE_ENV ?? "development";

console.log(`NxtSend configuration check — source: ${source}`);
console.log("Values are never printed; classifications only.\n");

let currentGroup = null;
let valid = 0;
let placeholder = 0;
let missing = 0;
const missingRequired = [];
for (const [name, group, required] of CATALOG) {
  if (group !== currentGroup) {
    currentGroup = group;
    console.log(`\n${GROUP_LABELS[group]}`);
  }
  const status = classify(name, merged[name]);
  if (status === "SET") valid++;
  else if (status === "PLACEHOLDER") placeholder++;
  else missing++;
  if (required && status !== "SET") missingRequired.push(name);
  const tag = required ? " [REQUIRED for live]" : "";
  console.log(`  ${status.padEnd(11)} ${name}${tag}`);
}

console.log(
  `\nTotals: ${valid} set · ${placeholder} placeholder · ${missing} missing (of ${CATALOG.length}).`
);
if (missingRequired.length > 0) {
  console.log(
    `Required for live but not validly set: ${missingRequired.join(", ")}`
  );
} else {
  console.log("All required-for-live variables are set.");
}

if (live && missingRequired.length > 0) {
  console.error("\n--live: configuration is NOT live-ready.");
  process.exit(1);
}
