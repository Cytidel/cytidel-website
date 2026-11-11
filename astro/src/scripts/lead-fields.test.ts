import { describe, expect, it } from 'vitest';
import { companyFromEmail, emailDomain, splitName, validateLead } from './lead-fields';

describe('validateLead', () => {
  const good = { name: 'Jane Doe', email: 'jane@northbridge.com', company: 'Northbridge' };
  it('accepts a complete lead', () => expect(validateLead(good)).toBe('ok'));
  it('reports a missing name first', () => expect(validateLead({ ...good, name: '  ' })).toBe('name'));
  it('reports a malformed email', () => {
    expect(validateLead({ ...good, email: '' })).toBe('email');
    expect(validateLead({ ...good, email: 'jane@b' })).toBe('email');
  });
  it('rejects free email providers', () => expect(validateLead({ ...good, email: 'jane@gmail.com' })).toBe('free'));
  it('reports a missing company last', () => expect(validateLead({ ...good, company: '' })).toBe('company'));
});

describe('splitName', () => {
  it('splits a two-word name', () => expect(splitName('Alex Murphy')).toEqual({ firstname: 'Alex', lastname: 'Murphy' }));
  it('keeps a multi-word first name', () => expect(splitName('Mary Anne Smith')).toEqual({ firstname: 'Mary Anne', lastname: 'Smith' }));
  it('treats one word as a first name', () => expect(splitName('  Alex ')).toEqual({ firstname: 'Alex', lastname: '' }));
  it('handles empty input', () => expect(splitName('')).toEqual({ firstname: '', lastname: '' }));
});

describe('emailDomain', () => {
  it('lowercases the part after the last @', () => expect(emailDomain('Jane@NorthBridge.com')).toBe('northbridge.com'));
  it('is empty without an @', () => expect(emailDomain('not-an-email')).toBe(''));
});

describe('companyFromEmail', () => {
  it('title-cases the registrable label', () => expect(companyFromEmail('jane@northbridge.com')).toBe('Northbridge'));
  it('strips two-part public suffixes and subdomains, and splits hyphens', () =>
    expect(companyFromEmail('j@mail.north-bridge.co.uk')).toBe('North Bridge'));
  it('gives nothing for free email providers', () => expect(companyFromEmail('jane@gmail.com')).toBe(''));
  it('gives nothing for very short labels', () => expect(companyFromEmail('x@bt.com')).toBe(''));
  it('gives nothing for malformed input', () => expect(companyFromEmail('not-an-email')).toBe(''));
});
