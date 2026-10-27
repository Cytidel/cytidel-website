// Shared HubSpot Forms API helpers for the site's native forms.

/** The `context` object for a Forms API submission. Includes the visitor's
 *  hubspotutk cookie when the HubSpot tracking code has set one (only after
 *  Marketing consent), which ties the new contact to their page views and
 *  original source. pageUri keeps any utm_* parameters from the ad. */
export function hubspotContext(): { pageUri: string; pageName: string; hutk?: string } {
  const hutk = document.cookie.match(/(?:^|;\s*)hubspotutk=([^;]+)/)?.[1];
  return {
    pageUri: window.location.href,
    pageName: document.title,
    ...(hutk ? { hutk: decodeURIComponent(hutk) } : {}),
  };
}
