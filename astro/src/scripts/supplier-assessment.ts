// Supplier monitoring self-assessment — page logic.
// Scoring lives in supplier-assessment-model.ts (pure, unit-tested); content,
// weights and steps in src/data/supplier-assessment.ts. This file renders the
// screens and talks to HubSpot and Matomo.
//
// Flow: landing page → one question per screen → details gate → results.
// Every screen after the landing page sits under a navy band (progress or
// the results headline) in the landing style from src/styles/landing.css. The gate posts to HubSpot's Forms API (same pattern
// as /book-a-demo) before the results show. With no form GUID configured it
// runs in preview mode and sends nothing.

import { GAP_TEXT, Q, QUADS, SOURCES, STEPS, TARGET, type Option, type QuadKey } from '../data/supplier-assessment';
import { hubspotContext } from './hubspot';
import { companyFromEmail, splitName, validateLead, type LeadProblem } from './lead-fields';
import {
  EXAMPLE, gaps, multi, num, optOf, score, single, supplierCount,
  type Answers, type Result,
} from './supplier-assessment-model';

type HSFormsField = { objectTypeId: string; name: string; value: string };

interface State {
  step: number;
  /** Where "Continue" takes a returning visitor */
  resume: number;
  /** Furthest screen reached, so visited screens can be jumped to */
  furthest: number;
  example: boolean;
  a: Answers;
  cap: string;
  lead: { name: string; email: string; company: string; marketing: boolean };
  sent: boolean;
}

const RES = STEPS.length - 1;
const GATE = STEPS.findIndex((s) => s.id === 'lead');
// Screens that ask a question, for "Question 3 of 8" and the progress bar
const QUESTION_STEPS = STEPS.flatMap((s, i) => (s.qs ? [i] : []));
const FIRST_Q = QUESTION_STEPS[0];
// Single-choice questions that move on by themselves when an answer is
// clicked. Coverage stays manual: it can open a licence-cap field.
const AUTO_ADVANCE = new Set(['approach', 'list', 'suppliers', 'nth', 'prioritise', 'threat']);
// Draft answers survive a reload; contact details are never stored.
// v3: no organisation screen. Older drafts are dropped.
const DRAFT_KEY = 'cyd-sca-draft-v3';
const OLD_DRAFT_KEYS = ['cyd-sca-draft-v2'];

const app = document.getElementById('sca-app') as HTMLElement | null;
const portalId = app?.dataset.portalId ?? '';
const formGuid = app?.dataset.formGuid ?? '';
const bookingUrl = app?.dataset.bookingUrl ?? '/book-a-demo';
const linkedinConversion = Number(app?.dataset.linkedinConversion) || 0;
const LIVE = !!(portalId && formGuid);

const blank = (): State => ({
  step: 0, resume: 1, furthest: 0, example: false,
  a: { providers: [], regs: [] }, cap: '',
  lead: { name: '', email: '', company: '', marketing: false },
  sent: false,
});

let S: State = blank();
try {
  for (const k of OLD_DRAFT_KEYS) localStorage.removeItem(k);
  const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
  if (saved && saved.a) {
    S = { ...blank(), ...saved, lead: blank().lead, sent: false };
    if (S.step >= GATE) S.step = GATE;
  }
} catch { /* storage unavailable — start fresh */ }

const save = (): void => {
  if (S.example) return;
  try {
    const { lead: _lead, sent: _sent, ...rest } = S;
    localStorage.setItem(DRAFT_KEY, JSON.stringify(rest));
  } catch { /* ignore */ }
};

const track = (action: string, name?: string): void => {
  (window as unknown as { _paq?: unknown[][] })._paq?.push(['trackEvent', 'Assessment', action, name ?? 'Supplier Monitoring']);
};
// Start is counted once per page load, however often someone goes back and forward.
let started = false;

const $ = <T extends Element = HTMLElement>(sel: string, el: ParentNode = document): T | null => el.querySelector<T>(sel);
const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const fmt = (n: number): string => Math.round(n).toLocaleString('en-GB');
const sVal = (qid: string): string => single(S.a, qid);
const mVal = (qid: string): string[] => multi(S.a, qid);

const CURRENT: Record<string, (r: Result) => string> = {
  list: () => optOf('list', sVal('list')).t,
  coverage: (r) => (r.cov === 0 ? 'No provider today' : `${Math.round(r.cov * 100)}% of suppliers monitored`),
  nth: () => optOf('nth', sVal('nth')).t,
  tier: () => optOf('list', sVal('list')).t,
  prioritise: () => optOf('prioritise', sVal('prioritise')).t,
  threat: () => optOf('threat', sVal('threat')).t,
};

const ICON = {
  clock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
  grid: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M12 4v16M4 12h16"/><circle cx="16" cy="8" r="1.6" fill="currentColor" stroke="none"/></svg>',
  lock: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
  eye: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6z"/><circle cx="12" cy="12" r="3"/></svg>',
  layers: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4l9 5-9 5-9-5 9-5z"/><path d="M3 14l9 5 9-5"/></svg>',
  target: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/></svg>',
  bolt: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M13 3L5 14h6l-1 7 8-11h-6l1-7z"/></svg>',
  tick: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
};

/* ---------------- rendering ---------------- */

// The Maturity Grid as a chart: x = prioritisation ability, y = detectability,
// both 0–100 with the quadrant boundaries at 50. Used on the landing page
// (no result, and the example in the preview card) and the results page,
// where it adds your marker, the baseline and guide lines to both axes.
function chartHTML(r: Result | null): string {
  const region = (k: QuadKey): string =>
    `<div class="sca-chart-q sca-chart-${k}${k === 'pro' ? ' is-target' : ''}${r && r.quad === k ? ' is-here' : ''}"><span>${QUADS[k].short}</span></div>`;
  // Axis ticks; a fixed tick hides when your value would sit on top of it.
  const ticks = (axis: 'x' | 'y', you?: number): string =>
    [0, 50, 100]
      .filter((t) => you === undefined || Math.abs(t - you) >= 8)
      .map((t) => `<span class="sca-tick sca-tick-${axis}" style="${axis === 'x' ? `left:${t}%` : `top:${100 - t}%`}">${t}</span>`)
      .join('') +
    (you === undefined ? '' : `<span class="sca-tick sca-tick-${axis} is-you" style="${axis === 'x' ? `left:${you}%` : `top:${100 - you}%`}">${you}</span>`);
  let marks = `<span class="sca-mk sca-mk-target" style="left:${TARGET.P}%;top:${100 - TARGET.D}%"><b>Target</b></span>`;
  if (r) {
    const x = Math.max(0, Math.min(100, r.P)), y = Math.max(0, Math.min(100, r.D));
    // Nudge the baseline marker clear of yours when the two nearly coincide.
    const near = Math.hypot(r.ind.P - r.P, r.ind.D - r.D) < 6;
    marks += `
      <span class="sca-guide sca-guide-v" style="left:${x}%;top:${100 - y}%"></span>
      <span class="sca-guide sca-guide-h" style="width:${x}%;top:${100 - y}%"></span>
      <span class="sca-mk sca-mk-peer${near ? ' is-nudged' : ''}" style="left:${r.ind.P}%;top:${100 - r.ind.D}%" title="Typical organisation baseline"></span>
      <span class="sca-mk sca-mk-you" style="left:${x}%;top:${100 - y}%"><b>You</b></span>`;
  }
  return `<figure class="sca-chart" aria-label="${r ? `Your position: detectability ${r.D}, prioritisation ability ${r.P}, in ${QUADS[r.quad].name}` : 'The Supply Chain Risk Maturity Grid'}">
    <div class="sca-chart-yl" aria-hidden="true">Detectability</div>
    <div class="sca-chart-plot">
      <div class="sca-chart-area">
        ${region('over')}${region('pro')}${region('re')}${region('blind')}
        <span class="sca-mid sca-mid-v"></span><span class="sca-mid sca-mid-h"></span>
        ${marks}
        <div class="sca-ticks-y" aria-hidden="true">${ticks('y', r?.D)}</div>
        <div class="sca-ticks-x" aria-hidden="true">${ticks('x', r?.P)}</div>
      </div>
    </div>
    <div class="sca-chart-xl" aria-hidden="true">Prioritisation ability</div>
  </figure>`;
}

// The four quadrant explanations as cards, laid out in the same 2×2 as the chart.
function quadCardsHTML(here?: QuadKey): string {
  const card = (k: QuadKey): string => {
    const d = QUADS[k];
    return `<div class="sca-quad sca-quad-${k}${k === 'pro' ? ' is-target' : ''}${here === k ? ' is-here' : ''}">
      ${k === 'pro' ? '<span class="sca-tag">Target</span>' : ''}${here === k ? '<span class="sca-tag is-here">You are here</span>' : ''}
      <h3>${d.name}</h3><p class="sca-quad-sub">${d.sub}</p><p>${d.desc}</p></div>`;
  };
  return `<div class="sca-quads">${card('over')}${card('pro')}${card('re')}${card('blind')}</div>`;
}

// One segment per screen (each question, your details). Screens already reached are buttons, so people can go
// straight back to an answer; screens not yet reached can't be skipped to.
function progressHTML(): string {
  const st = STEPS[S.step];
  const label = st.id === 'lead'
    ? 'Last step: your details'
    : `Question ${QUESTION_STEPS.indexOf(S.step) + 1} of ${QUESTION_STEPS.length}`;
  const segs = STEPS.slice(FIRST_Q, GATE + 1)
    .map((step, idx) => {
      const i = idx + FIRST_Q;
      const name = esc(step.name ?? '');
      if (i === S.step) return `<span class="sca-seg is-current" aria-current="step" title="${name}"><span class="sr-only">${name}, current</span></span>`;
      if (i <= S.furthest) return `<button type="button" class="sca-seg is-done" data-jump="${i}" title="${name}"><span class="sr-only">Go to ${name}</span></button>`;
      return `<span class="sca-seg" aria-hidden="true"></span>`;
    })
    .join('');
  return `<nav class="sca-progress" aria-label="Assessment progress"><div class="sca-segs">${segs}</div><span class="sca-progress-label">${label}</span></nav>`;
}

function optsHTML(qid: string): string {
  const q = Q[qid], isMulti = !!q.multi, val = S.a[qid];
  const opt = (id: string, o: Option, m: boolean, on: boolean): string =>
    `<label class="sca-opt${on ? ' is-sel' : ''}"><input type="${m ? 'checkbox' : 'radio'}" name="${id}" value="${o.v}" ${on ? 'checked' : ''}><span><b>${esc(o.t)}</b>${o.s ? `<small>${esc(o.s)}</small>` : ''}</span></label>`;
  const inputs = q.opts
    .map((o) => opt(qid, o, isMulti, isMulti ? ((val as string[]) ?? []).includes(o.v) : val === o.v))
    .join('');
  let extra = '';
  if (qid === 'coverage' && val === 'cap') {
    const N = supplierCount(S.a);
    extra += `<div class="sca-fields"><div class="sca-field"><label for="sca-cap">How many suppliers does your licence cover?</label><input id="sca-cap" inputmode="numeric" value="${esc(S.cap)}" placeholder="e.g. 50">${N ? `<span class="sca-hint">Out of roughly ${fmt(N)} suppliers</span>` : ''}</div></div>`;
  }
  if (q.sub && val && val !== 'none') {
    const sq = Q[q.sub], sv = mVal(q.sub);
    extra += `<div class="sca-q-sub"><p class="sca-q-help">${esc(sq.label)}</p><div class="sca-opts">${sq.opts.map((o) => opt(q.sub!, o, true, sv.includes(o.v))).join('')}</div></div>`;
  }
  // The divider between questions sits on the wrapper, not the fieldset:
  // browsers cut a fieldset's top border around its legend.
  return `<div class="sca-q" id="sca-q-${qid}"><fieldset class="sca-q-set"><legend class="sca-q-label"><h2>${esc(q.label)}</h2></legend>${q.help ? `<p class="sca-q-help">${esc(q.help)}</p>` : ''}<div class="sca-opts">${inputs}</div>${extra}<p class="sca-err" hidden></p></fieldset></div>`;
}

function navHTML(next = 'Continue', act = 'next'): string {
  return `<div class="sca-nav"><button type="button" class="sca-btn sca-btn-outline" data-act="back">Back</button><button type="button" class="sca-btn sca-btn-primary" data-act="${act}">${next} <span aria-hidden="true">→</span></button></div>`;
}

// Landing page, following the marketing mockup: navy hero with one big
// call to action and the example result card, what the assessment covers,
// then the Maturity Grid explained with a second call to action.
function introHTML(): string {
  const resuming = !!sVal('approach') && S.resume > 1;
  const startLabel = resuming ? 'Continue the self-assessment' : 'Start the self-assessment';
  const ex = score(EXAMPLE.a, EXAMPLE.cap);
  const feature = (icon: string, h: string, p: string): string =>
    `<div class="lp-feature"><span class="lp-tile">${icon}</span><div><h3>${h}</h3><p>${p}</p></div></div>`;
  return `<section class="sca-hero lp-dark">
    <div class="sca-inner sca-hero-inner">
      <div class="sca-hero-copy">
        <span class="lp-eyebrow">Supplier risk self-assessment</span>
        <h1 class="lp-h1">How mature is your <em>supplier risk</em> approach?</h1>
        <p class="lp-sub">Eight quick questions. See where your supplier risk sits on the Maturity Grid, where to focus first and how you compare with a typical organisation.</p>
        <ul class="lp-trust">
          <li>${ICON.clock}<span><b>About 2 minutes</b>to complete</span></li>
          <li>${ICON.grid}<span><b>Instant results</b>on screen</span></li>
          <li>${ICON.lock}<span><b>No sensitive</b>data required</span></li>
        </ul>
        <div class="sca-hero-cta">
          <button type="button" class="lp-btn-xl" data-act="start">${startLabel} <span class="arrow" aria-hidden="true">→</span></button>
          <button type="button" class="sca-link sca-link-dark" data-act="example">See an example result</button>
        </div>
      </div>
      <aside class="sca-preview lp-island" aria-label="Example result">
        <div class="sca-preview-head"><span class="sca-preview-brand">Cytidel</span><span class="sca-preview-tag">Example result</span></div>
        <p class="sca-preview-title">Your supplier risk position</p>
        ${chartHTML(ex)}
        <ul class="sca-preview-list">
          <li>${ICON.tick}Your position on the Maturity Grid</li>
          <li>${ICON.tick}Where to focus first</li>
          <li>${ICON.tick}How you compare with a typical organisation</li>
        </ul>
      </aside>
    </div>
  </section>
  <section class="lp-light sca-covers-sec">
    <div class="sca-inner sca-covers">
      <div class="sca-covers-head"><h2 class="lp-h2">What does the assessment cover?</h2><p class="lp-lead">Eight questions across the four things that decide how much supplier risk you can see, and how fast you can act on it.</p></div>
      <div class="lp-features">
        ${feature(ICON.eye, 'Visibility', 'Whether you hold one list of your suppliers, and how far you see beyond the direct ones.')}
        ${feature(ICON.layers, 'Coverage', 'How much of the supplier base your current providers actually monitor.')}
        ${feature(ICON.target, 'Prioritisation', 'How you decide which supplier risk to act on first.')}
        ${feature(ICON.bolt, 'Early warning', 'Whether you would hear that a supplier is being targeted before it reaches the news.')}
      </div>
    </div>
  </section>
  <section class="sca-section sca-section-last">
    <div class="sca-inner">
      <div class="sca-card">
        <div class="sca-card-head"><h2>The Supply Chain Risk Maturity Grid</h2><p>Where does your supply chain risk sit today, and which quadrant do you need to be in twelve months from now?</p></div>
        <div class="sca-chart-wrap">${chartHTML(null)}</div>
        ${quadCardsHTML()}
        <div class="sca-row">
          <button type="button" class="sca-btn sca-btn-primary" data-act="start">${startLabel} <span aria-hidden="true">→</span></button>
          <button type="button" class="sca-link" data-act="example">See an example result</button>
        </div>
      </div>
    </div>
  </section>`;
}

// The details gate. Three fields, in the same order as the site's other
// forms; company is prefilled from the email domain when it is left empty.
function gateHTML(): string {
  const l = S.lead, st = STEPS[S.step];
  return `<section class="sca-card"><div class="sca-card-head"><h2>${st.title}</h2><p>${st.lede}</p></div>
    <div class="sca-fields sca-fields-gate">
      <div class="sca-field"><label for="sca-name">Name</label><input id="sca-name" data-lead="name" autocomplete="name" value="${esc(l.name)}"></div>
      <div class="sca-field"><label for="sca-email">Work email</label><input id="sca-email" data-lead="email" type="email" inputmode="email" autocomplete="email" value="${esc(l.email)}"></div>
      <div class="sca-field"><label for="sca-company">Company</label><input id="sca-company" data-lead="company" autocomplete="organization" value="${esc(l.company)}"></div>
    </div>
    <label class="sca-check"><input type="checkbox" id="sca-marketing" ${l.marketing ? 'checked' : ''}><span>Keep me updated on supply chain risk research and events from Cytidel. You can opt out at any time.</span></label>
    <p class="sca-privacy">We use these details to show your results and to follow up if you ask us to. See our <a href="/privacy">privacy policy</a>.</p>
    ${LIVE ? '' : '<p class="sca-note">Preview build. Details entered here are not sent anywhere until the HubSpot form is configured.</p>'}
    <p class="sca-err" id="sca-lead-err" hidden></p>
    ${navHTML('See my results', 'submit')}</section>`;
}

// Results headline, shown in the navy band above the report.
function resultsHeadHTML(): string {
  const r = score(S.a, S.cap), co = esc(S.lead.company.trim() || 'Your organisation');
  return `${S.example ? '<p class="sca-example"><span>Example result</span> A sample manufacturer with 1,000 to 5,000 suppliers, not your data.</p>' : ''}
    <span class="lp-eyebrow">${co} · supply chain risk position</span>
    <h1 class="lp-h1 sca-res-h1">${co} sits in <em>${QUADS[r.quad].name}</em></h1>`;
}

function resultsHTML(): string {
  const r = score(S.a, S.cap), qd = QUADS[r.quad], co = esc(S.lead.company.trim() || 'Your organisation'), g = gaps(r);
  const ratioTxt =
    r.ratio >= 1.05
      ? `<strong>${r.ratio.toFixed(1)}x</strong> the modelled exposure of a typical organisation with the same supplier base`
      : r.ratio <= 0.95
        ? `<strong>${Math.round((1 - r.ratio) * 100)}% lower</strong> modelled exposure than a typical organisation with the same supplier base`
        : `modelled exposure <strong>in line with</strong> a typical organisation with the same supplier base`;
  const pct = (n: number): number => (r.N > 0 ? (n / r.N) * 100 : 0);
  const bar = (label: string, val: number, cls: string): string =>
    `<div class="sca-cmp-row"><span class="sca-cmp-l">${label}</span><div class="sca-cmp-track"><i class="${cls}" style="width:${val}%"></i></div><b>${val}</b></div>`;
  const src = SOURCES[r.ind.rateSrc];
  const regs = mVal('regs').filter((v) => v !== 'none').map((v) => optOf('regs', v).t);
  const band = optOf('suppliers', sVal('suppliers')).t.toLowerCase();

  return `<section class="sca-card sca-position">
    ${chartHTML(r)}
    <div class="sca-position-side">
      <div class="sca-legend">
        <span><i class="sca-mk-you"></i>You</span>
        <span><i class="sca-mk-peer"></i>Typical organisation baseline</span>
        <span><i class="sca-mk-target"></i>Cytidel target state</span>
      </div>
      <div class="sca-scores">
        <div class="sca-score"><span>Detectability</span><b>${r.D}<small> / 100</small></b><div class="sca-meter"><i style="width:${r.D}%"></i></div></div>
        <div class="sca-score"><span>Prioritisation ability</span><b>${r.P}<small> / 100</small></b><div class="sca-meter"><i style="width:${r.P}%"></i></div></div>
        <div class="sca-score"><span>Supply chain risk exposure</span><b>${r.R}<small> / 100</small></b><span class="sca-band sca-band-${r.band.toLowerCase()}">${r.band}</span></div>
      </div>
    </div>
    <div class="sca-position-cards">${quadCardsHTML(r.quad)}</div>
  </section>

  <section class="sca-card">
    <div class="sca-card-head"><h2>Your supplier base, by level of oversight</h2><p>Your scores applied to a supplier base of ${esc(band)}, modelled as ${fmt(r.N)} suppliers. Modelled from your answers, not a scan of your suppliers.</p></div>
    <div class="sca-stack-bar" role="img" aria-label="${fmt(r.prioritised)} prioritised, ${fmt(r.inView - r.prioritised)} in view without prioritisation, ${fmt(r.outside)} outside effective view"><div class="is-good" style="width:${pct(r.prioritised)}%"></div><div class="is-mid" style="width:${pct(r.inView - r.prioritised)}%"></div><div class="is-bad" style="width:${pct(r.outside)}%"></div></div>
    <div class="sca-stack-key">
      <div class="is-good"><b>${fmt(r.prioritised)}</b>In view and prioritised by real risk</div>
      <div class="is-mid"><b>${fmt(r.inView - r.prioritised)}</b>In view, without threat-led prioritisation</div>
      <div class="is-bad"><b>${fmt(r.outside)}</b>Outside effective view</div>
    </div>
  </section>

  <section class="sca-card">
    <div class="sca-card-head"><h2>Compared with a typical organisation</h2><p>${co} carries ${ratioTxt}.</p></div>
    <div class="sca-cmp">
      ${bar(co, r.R, 'is-you')}
      ${bar('Typical organisation', r.Rp, 'is-peer')}
      ${bar('Cytidel target state', r.Rt, 'is-target')}
    </div>
    <p class="sca-sub">Supply chain risk exposure, 0 to 100. Higher means more unmanaged exposure. Every bar uses your supplier count, so the difference comes from maturity alone. The baseline is Cytidel's modelled estimate for a typical mid-to-large organisation, not a survey result.</p>
  </section>

  <section class="sca-card">
    <div class="sca-card-head"><h2>Where to focus first</h2></div>
    <div class="sca-gaps">${g
      .map((x, i) => {
        const t = GAP_TEXT[x.k];
        const p = typeof t.p === 'function' ? t.p(r) : t.p;
        return `<article class="sca-gap"><span class="sca-gap-no">0${i + 1}</span><span class="sca-gap-ax">${t.ax}</span><h3>${t.h}</h3><p>${p}</p><p class="sca-gap-now"><span>Today</span>${esc(CURRENT[x.k](r))}</p></article>`;
      })
      .join('')}</div>
    ${regs.length ? `<p class="sca-sub">With ${regs.join(', ').replace(/, ([^,]*)$/, ' and $1')} driving supplier requirements over the next 12 months, the gaps above carry regulatory and contractual weight as well as operational risk.</p>` : ''}
  </section>

  <section class="sca-card">
    <div class="sca-card-head"><h2>The wider picture</h2></div>
    <div class="sca-stats">
      <div class="sca-stat"><b>${r.ind.rate}%</b><span>of breaches involved a third party across all sectors</span><cite><a href="${src.url}" target="_blank" rel="noopener">${src.label}</a></cite></div>
      <div class="sca-stat"><b>$4.91m</b><span>average cost of a breach starting with a third-party or supply chain compromise, taking 267 days to identify and contain</span><cite><a href="${SOURCES.ibm25.url}" target="_blank" rel="noopener">${SOURCES.ibm25.label}</a></cite></div>
      <div class="sca-stat"><b>15%</b><span>of UK businesses formally review cyber risk from immediate suppliers, and 6% their wider supply chain</span><cite><a href="${SOURCES.csbs26.url}" target="_blank" rel="noopener">${SOURCES.csbs26.label}</a></cite></div>
    </div>
  </section>

  <section class="sca-cta lp-dark">
    <div><h2>Walk through your results with Cytidel</h2><p>Cytidel maps live threat actor activity and real exploitation across your supplier base, so supply chain risk arrives as one prioritisation decision rather than another queue. In 30 minutes we'll take you through your position on the grid and what moving to Risk-Led Action would take.</p></div>
    <div><a class="lp-btn-xl" href="${esc(bookingUrl)}" data-analytics="CTA|Book a Demo|Assessment Results">Book a results walkthrough <span class="arrow" aria-hidden="true">→</span></a></div>
  </section>

  <details class="sca-card sca-method"><summary>How this assessment is calculated</summary>
    <ul>
      <li>Detectability (0 to 100) combines your self-placement (15%), supplier register (20%), monitoring coverage (30%), visibility beyond P1 suppliers (25%) and early warning across the supply chain (10%).</li>
      <li>Prioritisation ability (0 to 100) combines your self-placement (17%), supplier tiering (11%), how you decide which supplier risk to act on (33%) and threat actor intelligence and speed to act (39%).</li>
      <li>Grid position uses 50 as the midpoint on each axis.</li>
      <li>Effective oversight equals detectability multiplied by a prioritisation factor (40% credit for visibility alone, rising to 100% with full prioritisation). Supply chain risk exposure is the unmanaged share of your supplier base, scaled for its size using the midpoint of the band you chose.</li>
      <li>The baseline is Cytidel's modelled position for a typical organisation of 2,000 or more employees, informed by the published research below. It is indicative, not a survey result.</li>
      <li>Sources: ${Object.values(SOURCES).map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`).join('; ')}.</li>
    </ul>
  </details>
  <div class="sca-row"><button type="button" class="sca-btn sca-btn-outline" data-act="edit">Change my answers</button><button type="button" class="sca-btn sca-btn-outline" data-act="restart">Start a new assessment</button></div>`;
}

const bandHTML = (inner: string): string =>
  `<section class="sca-topband lp-dark"><div class="sca-inner sca-topband-inner">${inner}</div></section>`;

function render(): void {
  if (!app) return;
  const st = STEPS[S.step];
  if (st.id === 'intro') {
    app.innerHTML = introHTML();
  } else if (st.id === 'res') {
    app.innerHTML = bandHTML(resultsHeadHTML()) + `<div class="sca-inner sca-stack sca-lift">${resultsHTML()}</div>`;
  } else {
    const card = st.id === 'lead'
      ? gateHTML()
      : `<section class="sca-card sca-qcard">${(st.qs ?? []).map(optsHTML).join('')}${navHTML()}</section>`;
    app.innerHTML =
      bandHTML(`<span class="lp-eyebrow">Supplier risk self-assessment</span>${progressHTML()}`) +
      `<div class="sca-inner sca-stack sca-lift">${card}</div>`;
  }
  bind();
  save();
}

/* ---------------- interaction ---------------- */
// Was the last interaction a click/tap (auto-advance) or the keyboard (not)?
let pointerPick = false;
app?.addEventListener('pointerdown', () => { pointerPick = true; }, true);
app?.addEventListener('keydown', () => { pointerPick = false; }, true);

function bind(): void {
  if (!app) return;
  app.querySelectorAll<HTMLInputElement>('input[type=radio], input[type=checkbox]').forEach((inp) => {
    if (!Q[inp.name]) return;
    inp.addEventListener('change', () => {
      const q = Q[inp.name];
      if (q.multi) {
        let arr = Array.from(app.querySelectorAll<HTMLInputElement>(`input[name="${inp.name}"]:checked`)).map((x) => x.value);
        if (inp.value === 'none' && inp.checked) arr = ['none'];
        else arr = arr.filter((v) => v !== 'none' || arr.length === 1);
        S.a[inp.name] = arr;
      } else S.a[inp.name] = inp.value;
      const y = window.scrollY;
      render();
      window.scrollTo(0, y);
      // Move on after a click on a single-choice answer. Not on keyboard
      // selection: arrow keys change a radio as you move through the list.
      if (!q.multi && AUTO_ADVANCE.has(inp.name) && pointerPick) {
        const step = S.step;
        window.setTimeout(() => { if (S.step === step) void act('next'); }, 350);
      }
    });
  });
  const cap = $<HTMLInputElement>('#sca-cap', app);
  cap?.addEventListener('input', () => { S.cap = cap.value; save(); });
  app.querySelectorAll<HTMLInputElement>('[data-lead]').forEach((el) => {
    const k = el.dataset.lead as 'name' | 'email' | 'company';
    el.addEventListener('input', () => { S.lead[k] = el.value; });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); void act('submit'); } });
    if (k === 'email') {
      // Guess the company from the work email's domain, unless one is typed.
      el.addEventListener('change', () => {
        if (S.lead.company.trim()) return;
        const guess = companyFromEmail(el.value);
        if (!guess) return;
        S.lead.company = guess;
        const c = $<HTMLInputElement>('#sca-company', app);
        if (c) c.value = guess;
      });
    }
  });
  const mkt = $<HTMLInputElement>('#sca-marketing', app);
  mkt?.addEventListener('change', () => { S.lead.marketing = mkt.checked; });
  app.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act!)));
  app.querySelectorAll<HTMLElement>('[data-jump]').forEach((b) => b.addEventListener('click', () => jump(Number(b.dataset.jump))));
}

function go(step: number): void {
  S.step = step;
  if (step <= GATE) S.furthest = Math.max(S.furthest, step);
  render();
  window.scrollTo({ top: 0 });
  const h = $<HTMLElement>('h1, h2', app!);
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  const st = STEPS[step];
  if (st.name) track('Step', st.name);
  if (step === GATE) track('Gate shown');
}

function showErr(el: Element | null, msg: string): void {
  if (!el) return;
  el.textContent = msg;
  (el as HTMLElement).hidden = !msg;
}

function mark(id: string, ok: boolean): void {
  $(`#${id}`, app!)?.setAttribute('aria-invalid', ok ? 'false' : 'true');
}

function validateQs(): boolean {
  let ok = true, first: HTMLElement | null = null;
  for (const qid of STEPS[S.step].qs ?? []) {
    const box = $<HTMLElement>(`#sca-q-${qid}`, app!);
    if (!box) continue;
    const v = S.a[qid];
    let msg = '';
    if (Q[qid].multi ? !(v && v.length) : !v) msg = 'Choose an answer to continue.';
    else if (qid === 'coverage' && v === 'cap' && !(num(S.cap) > 0)) msg = 'Enter the number of suppliers your licence covers.';
    showErr($('.sca-err', box), msg);
    if (msg) { ok = false; first = first ?? box; }
  }
  first?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  return ok;
}

// Plain-text summary for the contact's "message" property, so the result
// lands in HubSpot without any custom properties set up.
function summary(r: Result): string {
  const opt = (qid: string): string => optOf(qid, sVal(qid)).t;
  return [
    'Supply Chain Risk Maturity Grid result',
    `Quadrant: ${QUADS[r.quad].name}`,
    `Detectability: ${r.D}/100 · Prioritisation ability: ${r.P}/100`,
    `Risk exposure: ${r.R}/100 (${r.band}); typical organisation baseline ${r.Rp}/100; ${r.ratio.toFixed(2)}x the baseline`,
    `Suppliers: ${opt('suppliers')} (modelled as ${fmt(r.N)})`,
    `Oversight: ${fmt(r.prioritised)} prioritised · ${fmt(r.inView - r.prioritised)} in view, not prioritised · ${fmt(r.outside)} outside effective view`,
    `Approach: ${opt('approach')} · Register: ${opt('list')} · Coverage: ${sVal('coverage') === 'cap' ? `capped at ${S.cap}` : opt('coverage')} (${Math.round(r.cov * 100)}% of suppliers)`,
    `Providers: ${mVal('providers').map((v) => optOf('providers', v).t).join(', ') || 'none given'}`,
    `Beyond P1: ${opt('nth')} · Prioritise by: ${opt('prioritise')} · Early warning: ${opt('threat')}`,
    `Regulations: ${mVal('regs').map((v) => optOf('regs', v).t).join(', ') || 'none given'}`,
    `Marketing updates: ${S.lead.marketing ? 'yes' : 'no'}`,
  ].join('\n');
}

async function sendLead(): Promise<boolean> {
  if (!LIVE) return false;
  const r = score(S.a, S.cap);
  const { firstname, lastname } = splitName(S.lead.name);
  const field = (name: string, value: string): HSFormsField => ({ objectTypeId: '0-1', name, value });
  const fields: HSFormsField[] = [
    field('firstname', firstname),
    ...(lastname ? [field('lastname', lastname)] : []),
    field('email', S.lead.email.trim()),
    field('company', S.lead.company.trim()),
    field('message', summary(r)),
  ];
  try {
    const res = await fetch(`https://api.hsforms.com/submissions/v3/integration/submit/${portalId}/${formGuid}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fields, context: hubspotContext() }),
    });
    if (!res.ok) throw new Error(`HubSpot Forms API returned ${res.status}`);
    return true;
  } catch (err) {
    console.error('Assessment submit failed:', err);
    track('Error');
    return false;
  }
}

function loadExample(): void {
  S = blank();
  S.example = true;
  S.a = { ...EXAMPLE.a };
  S.cap = EXAMPLE.cap;
  S.lead.company = EXAMPLE.company;
}

// Jump from the progress bar. Going forward checks the current screen first,
// like Continue, so no answer is skipped.
function jump(target: number): void {
  if (!(target >= FIRST_Q && target <= S.furthest) || target === S.step) return;
  if (target > S.step && STEPS[S.step].qs && !validateQs()) return;
  go(target);
}

const GATE_MESSAGES: Record<Exclude<LeadProblem, 'ok'>, { field: string; msg: string }> = {
  name: { field: 'sca-name', msg: 'Add your name.' },
  email: { field: 'sca-email', msg: 'Enter a valid work email.' },
  free: { field: 'sca-email', msg: "Please use your work email. We can't show results for personal email addresses." },
  company: { field: 'sca-company', msg: 'Add your company name.' },
};

async function act(a: string): Promise<void> {
  if (a === 'start') {
    if (STEPS[S.step].qs && !validateQs()) return;
    S.example = false;
    if (!started) { started = true; track('Start'); }
    go(Math.min(Math.max(S.resume, FIRST_Q), GATE));
    return;
  }
  if (a === 'example') { loadExample(); track('Example'); go(RES); return; }
  if (a === 'back') { go(Math.max(0, S.step - 1)); return; }
  if (a === 'next') {
    if (STEPS[S.step].qs && !validateQs()) return;
    S.resume = S.step + 1;
    go(S.step + 1);
    return;
  }
  if (a === 'submit') {
    const err = $('#sca-lead-err', app!);
    const problem = validateLead(S.lead);
    for (const id of ['sca-name', 'sca-email', 'sca-company']) mark(id, true);
    if (problem !== 'ok') {
      const { field, msg } = GATE_MESSAGES[problem];
      mark(field, false);
      showErr(err, msg);
      $<HTMLInputElement>(`#${field}`, app!)?.focus();
      if (problem === 'free') track('Rejected Free Email');
      return;
    }
    showErr(err, '');
    track('Gate submitted');
    const btn = $<HTMLButtonElement>('[data-act="submit"]', app!);
    if (btn) { btn.disabled = true; btn.textContent = 'Preparing your results…'; }
    S.sent = await sendLead();
    if (S.sent) {
      track('Submit');
      // LinkedIn lead conversion. lintrk only exists once the visitor has
      // accepted Marketing cookies, so this is a no-op otherwise.
      if (linkedinConversion) {
        (window as unknown as { lintrk?: (a: string, b: object) => void }).lintrk?.('track', { conversion_id: linkedinConversion });
      }
    }
    go(RES);
    return;
  }
  if (a === 'edit') { if (S.example) S = blank(); go(1); return; }
  if (a === 'restart') {
    S = blank();
    try { localStorage.removeItem(DRAFT_KEY); } catch { /* ignore */ }
    go(0);
  }
}

// /supplier-monitoring-assessment#example opens the example result directly,
// for sharing a preview of the report.
if (window.location.hash === '#example') { loadExample(); S.step = RES; }
render();
