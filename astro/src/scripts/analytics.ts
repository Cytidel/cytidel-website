// Sitewide event tracking for Matomo.
//
// Two patterns are wired up here:
//
//  1. Declarative click tracking via `data-analytics="Category|Action|Name"`
//     on any element. Uses event delegation on document.body so any future
//     CTA picks up tracking automatically just by adding the attribute.
//
//  2. FAQ accordion opens — any <details class="faq-item"> that toggles open
//     fires an event with the question text as the name. Capture phase
//     is used because the toggle event doesn't bubble in older browsers.
//
// Matomo itself is loaded + consent-gated by Cookiebot in Layout.astro.
// Until consent fires, window._paq isn't initialized — the optional chain
// below makes every push a no-op in that state, no errors.

declare global {
  interface Window {
    _paq?: unknown[][];
  }
}

function track(category: string, action: string, name?: string): void {
  if (!category || !action) return;
  window._paq?.push(['trackEvent', category, action, name]);
}

// 1. Declarative click tracking
document.addEventListener('click', (event) => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  const node = target.closest<HTMLElement>('[data-analytics]');
  if (!node) return;
  const value = node.dataset.analytics;
  if (!value) return;
  const [category, action, name] = value.split('|').map((s) => s.trim());
  track(category, action, name);
});

// 2. FAQ accordion opens
document.addEventListener(
  'toggle',
  (event) => {
    const target = event.target;
    if (!(target instanceof HTMLDetailsElement)) return;
    if (!target.classList.contains('faq-item')) return;
    if (!target.open) return;
    const question = target.querySelector('.faq-q span')?.textContent?.trim();
    track('FAQ', 'Open', question);
  },
  true,
);

export {};
