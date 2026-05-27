// Cytidel weekly-briefing signup endpoint.
// ---------------------------------------------------------------------------
// Flow: format check -> free/disposable provider blocklist -> MX record check
//       -> create a pending member in Ghost (double opt-in).
// Served at /api/briefing via the redirect in netlify.toml.
//
// Returns JSON the front-end can act on:
//   { ok: true }                      success (incl. "already a member")
//   { ok: false, code: <reason> }     reason in: invalid_format | free_provider
//                                      | no_mx | rate_limited | error
//
// No external npm dependencies — Node built-ins only.

import dns from 'node:dns/promises';
import crypto from 'node:crypto';
import { FREE_EMAIL_SET } from './_free-email-blocklist.mjs';

// Pragmatic format check (not full RFC 5322 — that's the MX + Ghost steps' job).
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

// Exact match or subdomain of a blocked registrable domain
// (so "gmail.com" also blocks "mail.gmail.com").
function isBlockedDomain(domain) {
  if (FREE_EMAIL_SET.has(domain)) return true;
  for (const blocked of FREE_EMAIL_SET) {
    if (domain.endsWith('.' + blocked)) return true;
  }
  return false;
}

async function hasMxRecord(domain) {
  try {
    const records = await dns.resolveMx(domain);
    return Array.isArray(records) && records.length > 0;
  } catch {
    return false;
  }
}

// Short-lived Ghost Admin API JWT from the {id}:{secret} key.
function ghostAdminToken(adminKey) {
  const [id, secret] = adminKey.split(':');
  if (!id || !secret) throw new Error('Malformed GHOST_ADMIN_API_KEY (expected id:secret)');
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT', kid: id };
  const payload = { iat, exp: iat + 5 * 60, aud: '/admin/' };
  const data = `${b64(header)}.${b64(payload)}`;
  const sig = crypto
    .createHmac('sha256', Buffer.from(secret, 'hex'))
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

export default async (req) => {
  if (req.method !== 'POST') return json(405, { ok: false, code: 'method_not_allowed' });

  // === TODO (dev handoff — intentionally not built in this pass) ===
  // 1. Bot protection: verify a Cloudflare Turnstile / hCaptcha token here,
  //    before any processing. Read body.token, POST it to the provider's
  //    /siteverify with the secret (env var), reject on failure. No reCAPTCHA.
  // 2. Rate limiting: limit per client IP / hour. Stateless functions can't do
  //    this reliably in-memory — use a shared store (Upstash Redis / Netlify
  //    Blobs). Client IP: req.headers.get('x-nf-client-connection-ip').
  //    On limit, return json(429, { ok: false, code: 'rate_limited' }).
  // The honeypot below is the only bot mitigation currently active.

  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, code: 'error' });
  }

  // Honeypot: real users never fill "company". Bots that do get a fake success.
  if (body && typeof body.company === 'string' && body.company.trim() !== '') {
    return json(200, { ok: true });
  }

  // Normalise to lowercase; keep plus-addressing intact.
  const email = (body && typeof body.email === 'string' ? body.email : '').trim().toLowerCase();

  // 1. Format
  if (!EMAIL_RE.test(email) || email.length > 254) {
    console.log('briefing.reject', { code: 'invalid_format' });
    return json(200, { ok: false, code: 'invalid_format' });
  }

  const domain = email.slice(email.lastIndexOf('@') + 1);

  // 2. Free / disposable provider blocklist
  if (isBlockedDomain(domain)) {
    console.log('briefing.reject', { code: 'free_provider', domain });
    return json(200, { ok: false, code: 'free_provider' });
  }

  // 3. MX record — catches typo and parked/dead domains
  if (!(await hasMxRecord(domain))) {
    console.log('briefing.reject', { code: 'no_mx', domain });
    return json(200, { ok: false, code: 'no_mx' });
  }

  // === Ghost: create pending member (double opt-in) ===
  const apiUrl = process.env.GHOST_ADMIN_API_URL; // e.g. https://blog.cytidel.com
  const apiKey = process.env.GHOST_ADMIN_API_KEY; // {id}:{secret}, Ghost Admin > Settings > Integrations
  if (!apiUrl || !apiKey) {
    console.log('briefing.error', { reason: 'ghost_env_missing' });
    return json(500, { ok: false, code: 'error' });
  }

  let token;
  try {
    token = ghostAdminToken(apiKey);
  } catch (e) {
    console.log('briefing.error', { reason: 'ghost_token', message: e.message });
    return json(500, { ok: false, code: 'error' });
  }

  // send_email=true + email_type=signup triggers Ghost's double opt-in email.
  // NOTE (dev): newsletter assignment depends on the Ghost site's default
  // newsletter settings. If members must land on a specific newsletter, add
  // `newsletters: [{ id: '<newsletter_id>' }]` to the member object below.
  const endpoint = `${apiUrl.replace(/\/$/, '')}/ghost/api/admin/members/?send_email=true&email_type=signup`;

  let resp;
  try {
    resp = await fetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Ghost ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ members: [{ email }] }),
    });
  } catch (e) {
    console.log('briefing.error', { reason: 'ghost_fetch', message: e.message });
    return json(502, { ok: false, code: 'error' });
  }

  if (resp.ok) return json(200, { ok: true });

  // Already a member → still confirm success (never reveal membership state).
  let detail = '';
  try {
    detail = await resp.text();
  } catch { /* ignore */ }
  if (resp.status === 422 && /already|exists/i.test(detail)) {
    return json(200, { ok: true });
  }

  console.log('briefing.error', { reason: 'ghost_api', status: resp.status });
  return json(502, { ok: false, code: 'error' });
};
