#!/usr/bin/env node

const hookUrl = (process.env.POLITY_RENDER_SYNC_URL || process.env.RENDER_DEPLOY_HOOK_URL || "").trim();
const method = (process.env.POLITY_RENDER_SYNC_METHOD || "GET").trim().toUpperCase();

function redactUrl(value) {
  try {
    const url = new URL(value);
    if (url.searchParams.has("key")) url.searchParams.set("key", "REDACTED");
    return url.toString();
  } catch {
    return "<invalid url>";
  }
}

if (!hookUrl) {
  process.stderr.write("Missing POLITY_RENDER_SYNC_URL. Set it to the secret Render sync/deploy hook URL before running render:sync.\n");
  process.exit(1);
}

if (method !== "GET" && method !== "POST") {
  process.stderr.write("POLITY_RENDER_SYNC_METHOD must be GET or POST.\n");
  process.exit(1);
}

let response;
try {
  response = await fetch(hookUrl, { method });
} catch (error) {
  process.stderr.write(`Render sync request failed for ${redactUrl(hookUrl)}: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
}

const body = await response.text();
process.stdout.write(`Render sync ${method} ${redactUrl(hookUrl)} -> ${response.status} ${response.statusText}\n`);
if (body.trim()) process.stdout.write(`${body}\n`);
if (!response.ok) process.exit(1);
