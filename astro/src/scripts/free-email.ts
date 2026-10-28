// Free / disposable email domains we reject on lead forms. HubSpot's hosted-form
// "Block free email providers" setting only fires via their JS embed —
// it doesn't apply to Forms API submissions, so we enforce it
// client-side. List covers the long tail of common providers + a
// few common throwaway services; not exhaustive but catches the
// ~95% case. Shared by /book-a-demo and /supplier-monitoring-assessment.
const FREE_EMAIL_DOMAINS = new Set([
  'gmail.com', 'googlemail.com',
  'yahoo.com', 'yahoo.co.uk', 'yahoo.fr', 'yahoo.es', 'yahoo.de', 'yahoo.it', 'yahoo.ca', 'ymail.com', 'rocketmail.com',
  'hotmail.com', 'hotmail.co.uk', 'hotmail.fr', 'hotmail.es', 'hotmail.de', 'hotmail.it',
  'outlook.com', 'outlook.fr', 'outlook.de', 'outlook.es', 'outlook.it', 'live.com', 'live.co.uk', 'live.fr', 'live.de', 'msn.com',
  'aol.com', 'aim.com',
  'icloud.com', 'me.com', 'mac.com',
  'protonmail.com', 'proton.me', 'pm.me',
  'gmx.com', 'gmx.net', 'gmx.de',
  'yandex.com', 'yandex.ru', 'ya.ru',
  'mail.com', 'mail.ru',
  'zoho.com', 'fastmail.com', 'inbox.com',
  // Common disposable / throwaway services
  'mailinator.com', 'tempmail.com', 'temp-mail.org', 'guerrillamail.com', 'guerrillamail.info',
  '10minutemail.com', 'throwawaymail.com', 'yopmail.com', 'maildrop.cc', 'trashmail.com',
  'sharklasers.com', 'getnada.com',
]);

export function isFreeEmail(email: string): boolean {
  const at = email.lastIndexOf('@');
  if (at < 0) return false;
  return FREE_EMAIL_DOMAINS.has(email.slice(at + 1).toLowerCase());
}
