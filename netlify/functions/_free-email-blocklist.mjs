// Free / consumer / disposable email providers rejected at signup.
// ---------------------------------------------------------------------------
// To block a new domain: add one lowercase entry to the array below. No logic
// changes needed. Matching is exact OR subdomain (e.g. "gmail.com" also blocks
// "mail.gmail.com"), so list only the registrable domain.
//
// Keep entries lowercase. Keep the two groups labelled so it stays scannable.

export const FREE_EMAIL_DOMAINS = [
  // --- Consumer mailbox providers ---
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'outlook.com', 'live.com', 'msn.com',
  'aol.com',
  'icloud.com', 'me.com', 'mac.com',
  'proton.me', 'protonmail.com', 'pm.me',
  'gmx.com', 'gmx.net',
  'mail.com', 'zoho.com',

  // --- Known disposable / temporary email services ---
  '10minutemail.com',
  'mailinator.com',
  'tempmail.org',
  'guerrillamail.com',
  'throwaway.email',
  'sharklasers.com',
  'yopmail.com',
  'temp-mail.org',
  'getnada.com',
  'dispostable.com',
  'trashmail.com',
  'maildrop.cc',
  'fakeinbox.com',
  'mintemail.com',
];

// Set for O(1) lookups; the array above stays the human-edited source.
export const FREE_EMAIL_SET = new Set(FREE_EMAIL_DOMAINS);
