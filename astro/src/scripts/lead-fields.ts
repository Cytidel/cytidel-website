// Shared helpers for the site's lead forms (the assessment gate and the
// white paper form). Pure functions, unit-tested in lead-fields.test.ts.

import { isFreeEmail } from './free-email';

export interface LeadFields {
  name: string;
  email: string;
  company: string;
}

/** The first problem found, or 'ok'. One message at a time keeps the form calm. */
export type LeadProblem = 'ok' | 'name' | 'email' | 'free' | 'company';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function validateLead(l: LeadFields): LeadProblem {
  if (!l.name.trim()) return 'name';
  const email = l.email.trim();
  if (!EMAIL_RE.test(email)) return 'email';
  if (isFreeEmail(email)) return 'free';
  if (!l.company.trim()) return 'company';
  return 'ok';
}

/** One "Name" field → HubSpot's firstname / lastname. The last word is the
 *  surname; everything before it is the first name, so "Mary Anne Smith"
 *  keeps "Mary Anne". A single word is a first name with no surname. */
export function splitName(name: string): { firstname: string; lastname: string } {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstname: '', lastname: '' };
  if (parts.length === 1) return { firstname: parts[0], lastname: '' };
  return { firstname: parts.slice(0, -1).join(' '), lastname: parts[parts.length - 1] };
}

export function emailDomain(email: string): string {
  const at = email.lastIndexOf('@');
  return at < 0 ? '' : email.slice(at + 1).trim().toLowerCase();
}

// Two-label public suffixes we strip before reading the company label.
// Not exhaustive: this only drives a prefill the visitor can edit.
const TWO_PART_SUFFIXES = new Set([
  'co.uk', 'org.uk', 'ac.uk', 'gov.uk', 'me.uk', 'ltd.uk', 'plc.uk', 'nhs.uk',
  'com.au', 'net.au', 'org.au', 'co.nz', 'co.za', 'com.br', 'co.jp', 'co.in',
  'com.sg', 'com.hk', 'co.il', 'com.mx', 'com.tr', 'co.kr', 'com.ar',
]);

/** A display-friendly company name guessed from a work email's domain:
 *  "j@mail.north-bridge.co.uk" → "North Bridge". Empty when there is no
 *  usable guess (free email, no dot, very short label). Prefill only; HubSpot's
 *  own domain → company association is what sales relies on. */
export function companyFromEmail(email: string): string {
  const domain = emailDomain(email);
  if (!domain || !domain.includes('.') || isFreeEmail(email)) return '';
  const labels = domain.split('.').filter(Boolean);
  const core = labels.length >= 3 && TWO_PART_SUFFIXES.has(labels.slice(-2).join('.'))
    ? labels.slice(0, -2)
    : labels.slice(0, -1);
  const label = core[core.length - 1] ?? '';
  if (label.length < 3) return '';
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}
