// Supplier monitoring self-assessment — page logic.
// Scoring model by John (GTM), ported unchanged from his standalone build;
// rendering rebuilt on the site's design tokens. Content and weights live
// in src/data/supplier-assessment.ts.
//
// Flow: intro → organisation → three question steps → lead form → results.
// The lead form posts to HubSpot's Forms API (same pattern as /book-a-demo)
// before the results show. With no form GUID configured it runs in preview
// mode and sends nothing.

import {
  GAP_TEXT, INDUSTRIES, Q, QUADS, SOURCES, STEPS, TARGET,
  type Industry, type Option, type QuadKey,
} from '../data/supplier-assessment';
import { isFreeEmail } from './free-email';
import { hubspotContext } from './hubspot';

type HSFormsField = { objectTypeId: string; name: string; value: string };

interface State {
  step: number;
  resume: number;
  example: boolean;
  org: { company: string; industry: string; headcount: string; fte: string; suppliers: string; critical: string };
  a: Record<string, string | string[]>;
  cap: string;
  lead: { firstname: string; lastname: string; email: string; title: string; walk: boolean; marketing: boolean };
  sent: boolean;
}

interface Result {
  D: number; P: number;
  D_parts: Record<string, [number, number]>;
  P_parts: Record<string, [number, number]>;
  N: number; C: number; fte: number; cov: number; ind: Industry;
  R: number; Rp: number; Rt: number; band: string; quad: QuadKey; ratio: number;
  inView: number; prioritised: number; outside: number; perFte: number | null;
}

const RES = STEPS.length - 1;
const LEAD = RES - 1;
const NSTEPS = STEPS.length - 2;
// Draft answers survive a reload; contact details are never stored.
const DRAFT_KEY = 'cyd-sca-draft-v1';

const app = document.getElementById('sca-app') as HTMLElement | null;
const portalId = app?.dataset.portalId ?? '';
const formGuid = app?.dataset.formGuid ?? '';
const bookingUrl = app?.dataset.bookingUrl ?? '/book-a-demo';
const linkedinConversion = Number(app?.dataset.linkedinConversion) || 0;
const LIVE = !!(portalId && formGuid);

const blank = (): State => ({
  step: 0, resume: 1, example: false,
  org: { company: '', industry: '', headcount: '', fte: '', suppliers: '', critical: '' },
  a: { providers: [], regs: [] }, cap: '',
  lead: { firstname: '', lastname: '', email: '', title: '', walk: false, marketing: false },
  sent: false,
});

let S: State = blank();
try {
  const saved = JSON.parse(localStorage.getItem(DRAFT_KEY) ?? 'null');
  if (saved && saved.org) {
    S = { ...blank(), ...saved, lead: blank().lead, sent: false };
    if (S.step >= LEAD) S.step = LEAD;
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

const $ = <T extends Element = HTMLElement>(sel: string, el: ParentNode = document): T | null => el.querySelector<T>(sel);
const esc = (s: unknown): string =>
  String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
const num = (v: string): number => { const n = parseFloat(String(v).replace(/,/g, '')); return isFinite(n) ? n : NaN; };
const fmt = (n: number): string => Math.round(n).toLocaleString('en-GB');
const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
const optOf = (qid: string, v: string | string[] | undefined): Option =>
  Q[qid].opts.find((o) => o.v === v) ?? Q[qid].opts[0];
const single = (qid: string): string => (S.a[qid] as string) ?? '';
const multi = (qid: string): string[] => (S.a[qid] as string[]) ?? [];

/* ---------------- scoring (John's model) ---------------- */
function coverageFraction(): number {
  const c = single('coverage');
  if (!c || c === 'none') return 0;
  if (c === 'cap') {
    const n = num(S.cap), N = num(S.org.suppliers);
    return n > 0 && N > 0 ? clamp(n / N, 0, 1) : 0;
  }
  return optOf('coverage', c).f ?? 0;
}

function capacityScore(N: number, fte: number): number {
  if (!(fte > 0)) return 5;
  const r = N / fte;
  return r <= 50 ? 90 : r <= 150 ? 65 : r <= 400 ? 40 : 20;
}

function score(): Result {
  const o = S.org;
  const N = num(o.suppliers), C = Math.min(num(o.critical) || 0, N), fte = num(o.fte);
  const ap = optOf('approach', single('approach')), li = optOf('list', single('list')), th = optOf('threat', single('threat'));
  const cov = coverageFraction();
  const D_parts: Record<string, [number, number]> = {
    approach: [0.15, ap.d ?? 0], list: [0.2, li.d ?? 0], coverage: [0.3, Math.round(cov * 100)],
    nth: [0.25, optOf('nth', single('nth')).d ?? 0], threat: [0.1, th.d ?? 0],
  };
  const P_parts: Record<string, [number, number]> = {
    approach: [0.15, ap.p ?? 0], tier: [0.1, li.tier ?? 0], prioritise: [0.3, optOf('prioritise', single('prioritise')).p ?? 0],
    threat: [0.35, th.p ?? 0], capacity: [0.1, capacityScore(N, fte)],
  };
  const sum = (parts: Record<string, [number, number]>): number =>
    Math.round(Object.values(parts).reduce((t, [w, v]) => t + w * v, 0));
  const D = sum(D_parts), P = sum(P_parts);
  const ind = INDUSTRIES[o.industry] ?? INDUSTRIES.oth;
  const eff = (d: number, p: number): number => (d / 100) * (0.4 + (0.6 * p) / 100);
  const W = 3 * C + (N - C);
  const scale = clamp(0.6 + 0.13 * Math.log10(Math.max(W, 1)), 0.6, 1);
  const risk = (d: number, p: number): number => Math.round(100 * (1 - eff(d, p)) * scale);
  const R = risk(D, P), Rp = risk(ind.D, ind.P), Rt = risk(TARGET.D, TARGET.P);
  const band = R < 35 ? 'Low' : R < 55 ? 'Moderate' : R < 72 ? 'Elevated' : 'High';
  const quad: QuadKey = D >= 50 ? (P >= 50 ? 'pro' : 'over') : P >= 50 ? 'blind' : 're';
  const inView = Math.round((N * D) / 100), prioritised = Math.round((inView * P) / 100);
  return {
    D, P, D_parts, P_parts, N, C, fte, cov, ind, R, Rp, Rt, band, quad,
    ratio: (1 - eff(D, P)) / (1 - eff(ind.D, ind.P)), inView, prioritised, outside: N - inView,
    perFte: fte > 0 ? N / fte : null,
  };
}

const CURRENT: Record<string, (r: Result) => string> = {
  list: () => optOf('list', single('list')).t,
  coverage: (r) => (r.cov === 0 ? 'No provider today' : `${Math.round(r.cov * 100)}% of suppliers monitored`),
  nth: () => optOf('nth', single('nth')).t,
  tier: () => optOf('list', single('list')).t,
  prioritise: () => optOf('prioritise', single('prioritise')).t,
  threat: () => optOf('threat', single('threat')).t,
  capacity: (r) => (r.perFte ? `${fmt(r.perFte)} suppliers per person` : 'No dedicated headcount'),
};

// Top three gaps by weighted shortfall.
function gaps(r: Result): { k: string }[] {
  const all: { k: string; s: number; v: number }[] = [];
  for (const [k, [w, v]] of Object.entries(r.D_parts)) if (k !== 'approach') all.push({ k, s: w * (100 - v), v });
  for (const [k, [w, v]] of Object.entries(r.P_parts)) if (k !== 'approach') all.push({ k, s: w * (100 - v), v });
  all.sort((x, y) => y.s - x.s);
  const out: { k: string }[] = [];
  for (const g of all) {
    if (out.find((o) => o.k === g.k) || (g.k === 'tier' && out.find((o) => o.k === 'list'))) continue;
    if (g.v >= 80) continue;
    out.push(g);
    if (out.length === 3) break;
  }
  return out;
}

/* ---------------- rendering ---------------- */

// The Maturity Grid as a chart: x = prioritisation ability, y = detectability,
// both 0–100 with the quadrant boundaries at 50. Used on the intro (no result)
// and the results page, where it adds your marker, the peer baseline and
// guide lines from your marker to both axes.
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
    const x = clamp(r.P, 0, 100), y = clamp(r.D, 0, 100);
    // Nudge the peer marker clear of yours when the two nearly coincide.
    const near = Math.hypot(r.ind.P - r.P, r.ind.D - r.D) < 6;
    marks += `
      <span class="sca-guide sca-guide-v" style="left:${x}%;top:${100 - y}%"></span>
      <span class="sca-guide sca-guide-h" style="width:${x}%;top:${100 - y}%"></span>
      <span class="sca-mk sca-mk-peer${near ? ' is-nudged' : ''}" style="left:${r.ind.P}%;top:${100 - r.ind.D}%" title="${esc(r.ind.name)} peer baseline"></span>
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

function progressHTML(): string {
  return `<nav class="sca-progress" aria-label="Progress">${STEPS.slice(1)
    .map((s, i) => {
      const n = i + 1;
      return `<span class="${n < S.step ? 'is-done' : n === S.step ? 'is-on' : ''}">${s.name}</span>`;
    })
    .join('')}</nav>`;
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
    extra += `<div class="sca-fields"><div class="sca-field"><label for="sca-cap">How many suppliers does your licence cover?</label><input id="sca-cap" inputmode="numeric" value="${esc(S.cap)}" placeholder="e.g. 50"></div></div>`;
  }
  if (q.sub && val && val !== 'none') {
    const sq = Q[q.sub], sv = multi(q.sub);
    extra += `<div class="sca-q-sub"><p class="sca-q-help">${esc(sq.label)}</p><div class="sca-opts">${sq.opts.map((o) => opt(q.sub!, o, true, sv.includes(o.v))).join('')}</div></div>`;
  }
  return `<fieldset class="sca-q" id="sca-q-${qid}"><legend class="sca-q-label">${esc(q.label)}</legend>${q.help ? `<p class="sca-q-help">${esc(q.help)}</p>` : ''}<div class="sca-opts${q.grid ? ' is-grid4' : ''}">${inputs}</div>${extra}<p class="sca-err" hidden></p></fieldset>`;
}

function navHTML(next = 'Continue', act = 'next'): string {
  return `<div class="sca-nav"><button type="button" class="sca-btn sca-btn-outline" data-act="back">Back</button><button type="button" class="sca-btn sca-btn-primary" data-act="${act}">${next} <span aria-hidden="true">→</span></button></div>`;
}

function introHTML(): string {
  const resuming = S.step === 0 && !!single('approach');
  return `<section class="sca-hero">
      <div class="sca-hero-copy">
        <span class="sca-eyebrow">✳ Supply chain risk assessment</span>
        <h1>Where does your supply chain risk sit on the grid?</h1>
        <p class="sca-lede">Answer seven questions about your supplier base and how you manage it. Cytidel scores your position on the Maturity Grid, scales it by the size of your supplier base and compares it with organisations in your industry.</p>
        <div class="sca-row">
          <button type="button" class="sca-btn sca-btn-primary" data-act="start">${resuming ? 'Continue assessment' : 'Start the assessment'} <span aria-hidden="true">→</span></button>
          <button type="button" class="sca-link" data-act="example">See an example result</button>
        </div>
      </div>
      <dl class="sca-facts">
        <div><dt>48%</dt><dd>of breaches involved a third party, up from 30% the year before (<a href="${SOURCES.v26.url}" target="_blank" rel="noopener">Verizon 2026 DBIR</a>)</dd></div>
        <div><dt>15%</dt><dd>of UK businesses formally review cyber risk from their immediate suppliers (<a href="${SOURCES.csbs26.url}" target="_blank" rel="noopener">UK Government, 2026</a>)</dd></div>
        <div><dt>3 min</dt><dd>to complete, with your report shown at the end</dd></div>
      </dl>
    </section>
    <section class="sca-card">
      <div class="sca-card-head"><h2>The Supply Chain Risk Maturity Grid</h2><p>Where does your supply chain risk sit today, and which quadrant do you need to be in twelve months from now?</p></div>
      <div class="sca-chart-wrap">
        ${chartHTML(null)}
        <div class="sca-axis-notes">
          <p><span class="sca-chip">50 to 70%</span> of findings treated as urgent at low prioritisation ability</p>
          <p><span class="sca-chip is-accent">Around 1%</span> carry real business exposure</p>
        </div>
      </div>
      ${quadCardsHTML()}
    </section>`;
}

function orgHTML(): string {
  const o = S.org;
  const f = (id: keyof State['org'], label: string, hint: string, ph: string, mode = 'numeric'): string =>
    `<div class="sca-field"><label for="sca-${id}">${label}</label><input id="sca-${id}" data-org="${id}" inputmode="${mode}" value="${esc(o[id])}" placeholder="${ph}">${hint ? `<span class="sca-hint">${hint}</span>` : ''}</div>`;
  const st = STEPS[S.step];
  return `<section class="sca-card"><div class="sca-card-head"><span class="sca-eyebrow-plain">Step 1 of ${NSTEPS}</span><h2>${st.title}</h2><p>${st.lede}</p></div>
    <div class="sca-fields">
      ${f('company', 'Company name', '', 'e.g. Northbridge Group', 'text')}
      <div class="sca-field"><label for="sca-industry">Industry</label><select id="sca-industry" required><option value="" disabled ${o.industry ? '' : 'selected'}>Select an industry</option>${Object.entries(INDUSTRIES)
        .map(([k, v]) => `<option value="${k}" ${o.industry === k ? 'selected' : ''}>${v.name}</option>`)
        .join('')}</select></div>
      ${f('headcount', 'Total headcount', 'Employees across the group', 'e.g. 4,500')}
      ${f('fte', 'Headcount focused on supplier risk', 'Full-time equivalent, across security, risk and procurement. Use 0.5 for part of a role.', 'e.g. 1.5', 'decimal')}
      ${f('suppliers', 'Number of third-party suppliers', 'Suppliers with access to your systems, data or operations', 'e.g. 1,200')}
      ${f('critical', 'Of which, business-critical suppliers', 'Suppliers whose failure or compromise would stop operations', 'e.g. 140')}
    </div>
    <p class="sca-err" id="sca-org-err" hidden></p>
    ${navHTML()}</section>`;
}

function leadHTML(): string {
  const l = S.lead;
  return `<section class="sca-card"><div class="sca-card-head"><span class="sca-eyebrow-plain">Step ${NSTEPS} of ${NSTEPS}</span><h2>Where should we send your results?</h2><p>Your full report appears straight after this step.</p></div>
    <div class="sca-fields">
      <div class="sca-field"><label for="sca-firstname">First name</label><input id="sca-firstname" data-lead="firstname" autocomplete="given-name" value="${esc(l.firstname)}"></div>
      <div class="sca-field"><label for="sca-lastname">Last name</label><input id="sca-lastname" data-lead="lastname" autocomplete="family-name" value="${esc(l.lastname)}"></div>
      <div class="sca-field"><label for="sca-email">Work email</label><input id="sca-email" data-lead="email" type="email" autocomplete="email" value="${esc(l.email)}"></div>
      <div class="sca-field"><label for="sca-title">Job title</label><input id="sca-title" data-lead="title" autocomplete="organization-title" value="${esc(l.title)}"></div>
      <div class="sca-field"><label for="sca-lcompany">Company</label><input id="sca-lcompany" data-org="company" autocomplete="organization" value="${esc(S.org.company)}"></div>
    </div>
    <label class="sca-check"><input type="checkbox" id="sca-walk" ${l.walk ? 'checked' : ''}><span>I'd like a Cytidel specialist to walk me through my results.</span></label>
    <label class="sca-check"><input type="checkbox" id="sca-marketing" ${l.marketing ? 'checked' : ''}><span>Keep me updated on supply chain risk research and events from Cytidel. You can opt out at any time.</span></label>
    <p class="sca-privacy">We use these details to show and send your results and, if you ask, to arrange a walkthrough. See our <a href="/privacy">privacy policy</a>.</p>
    ${LIVE ? '' : '<p class="sca-note">Preview build. Details entered here are not sent anywhere until the HubSpot form is configured.</p>'}
    <p class="sca-err" id="sca-lead-err" hidden></p>
    ${navHTML('See my results', 'submit')}</section>`;
}

function resultsHTML(): string {
  const r = score(), qd = QUADS[r.quad], co = esc(S.org.company || 'Your organisation'), g = gaps(r);
  const indName = r.ind.name.toLowerCase();
  const ratioTxt =
    r.ratio >= 1.05
      ? `<strong>${r.ratio.toFixed(1)}x</strong> the modelled exposure of a typical ${indName} organisation with the same supplier base`
      : r.ratio <= 0.95
        ? `<strong>${Math.round((1 - r.ratio) * 100)}% lower</strong> modelled exposure than a typical ${indName} organisation with the same supplier base`
        : `modelled exposure <strong>in line with</strong> a typical ${indName} organisation with the same supplier base`;
  const pct = (n: number): number => (r.N > 0 ? (n / r.N) * 100 : 0);
  const bar = (label: string, val: number, cls: string): string =>
    `<div class="sca-cmp-row"><span class="sca-cmp-l">${label}</span><div class="sca-cmp-track"><i class="${cls}" style="width:${val}%"></i></div><b>${val}</b></div>`;
  const src = SOURCES[r.ind.rateSrc];
  const regs = multi('regs').filter((v) => v !== 'none').map((v) => optOf('regs', v).t);
  const cta = S.lead.walk && S.sent && LIVE
    ? '<p class="sca-done">Walkthrough requested. The Cytidel team will be in touch to arrange a time.</p>'
    : `<a class="sca-btn sca-btn-primary" href="${esc(bookingUrl)}" data-analytics="CTA|Book a Demo|Assessment Results">Book a results walkthrough <span aria-hidden="true">→</span></a>`;

  return `${S.example ? '<p class="sca-example"><span>Example result</span> A sample 4,500-person manufacturer, not your data.</p>' : ''}
  <section class="sca-res-head">
    <span class="sca-eyebrow">${co} · supply chain risk position</span>
    <h1>${co} sits in ${qd.name}</h1>
  </section>

  <section class="sca-card sca-position">
    ${chartHTML(r)}
    <div class="sca-position-side">
      <div class="sca-legend">
        <span><i class="sca-mk-you"></i>You</span>
        <span><i class="sca-mk-peer"></i>${esc(r.ind.name)} peer baseline</span>
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
    <div class="sca-card-head"><h2>Your supplier base, by level of oversight</h2><p>Your scores applied to ${fmt(r.N)} suppliers${r.C ? `, ${fmt(r.C)} of them business-critical` : ''}. Modelled from your answers, not a scan of your suppliers.</p></div>
    <div class="sca-stack" role="img" aria-label="${fmt(r.prioritised)} prioritised, ${fmt(r.inView - r.prioritised)} in view without prioritisation, ${fmt(r.outside)} outside effective view"><div class="is-good" style="width:${pct(r.prioritised)}%"></div><div class="is-mid" style="width:${pct(r.inView - r.prioritised)}%"></div><div class="is-bad" style="width:${pct(r.outside)}%"></div></div>
    <div class="sca-stack-key">
      <div class="is-good"><b>${fmt(r.prioritised)}</b>In view and prioritised by real risk</div>
      <div class="is-mid"><b>${fmt(r.inView - r.prioritised)}</b>In view, without threat-led prioritisation</div>
      <div class="is-bad"><b>${fmt(r.outside)}</b>Outside effective view</div>
    </div>
    <p class="sca-sub">${r.perFte !== null ? `Capacity: ${fmt(r.perFte)} suppliers for each person focused on supply chain risk.` : 'Capacity: no headcount is currently focused on supply chain risk.'}</p>
  </section>

  <section class="sca-card">
    <div class="sca-card-head"><h2>Compared with your industry</h2><p>${co} carries ${ratioTxt}.</p></div>
    <div class="sca-cmp">
      ${bar(co, r.R, 'is-you')}
      ${bar(`${esc(r.ind.name)} baseline`, r.Rp, 'is-peer')}
      ${bar('Cytidel target state', r.Rt, 'is-target')}
    </div>
    <p class="sca-sub">Supply chain risk exposure, 0 to 100. Higher means more unmanaged exposure. Every bar uses your supplier count, with business-critical suppliers weighted three times, so the difference comes from maturity alone. Industry baselines are Cytidel's modelled estimates, not survey results.</p>
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
      <div class="sca-stat"><b>${r.ind.rate}%</b><span>of breaches involved a third party${r.ind.cross ? ' across all sectors' : ` in ${esc(indName)}`}</span><cite><a href="${src.url}" target="_blank" rel="noopener">${src.label}</a></cite></div>
      <div class="sca-stat"><b>$4.91m</b><span>average cost of a breach starting with a third-party or supply chain compromise, taking 267 days to identify and contain</span><cite><a href="${SOURCES.ibm25.url}" target="_blank" rel="noopener">${SOURCES.ibm25.label}</a></cite></div>
      <div class="sca-stat"><b>15%</b><span>of UK businesses formally review cyber risk from immediate suppliers, and 6% their wider supply chain</span><cite><a href="${SOURCES.csbs26.url}" target="_blank" rel="noopener">${SOURCES.csbs26.label}</a></cite></div>
    </div>
  </section>

  <section class="sca-cta">
    <div><h2>Walk through your results with Cytidel</h2><p>Cytidel maps live threat actor activity and real exploitation across your supplier base, so supply chain risk arrives as one prioritisation decision rather than another queue. In 30 minutes we'll take you through your position on the grid and what moving to Risk-Led Action would take.</p></div>
    <div>${cta}</div>
  </section>

  <details class="sca-card sca-method"><summary>How this assessment is calculated</summary>
    <ul>
      <li>Detectability (0 to 100) combines your self-placement (15%), supplier register (20%), monitoring coverage (30%), visibility beyond P1 suppliers (25%) and early warning across the supply chain (10%).</li>
      <li>Prioritisation ability (0 to 100) combines your self-placement (15%), supplier tiering (10%), how you decide which supplier risk to act on (30%), threat actor intelligence and speed to act (35%) and team capacity (10%).</li>
      <li>Grid position uses 50 as the midpoint on each axis.</li>
      <li>Effective oversight equals detectability multiplied by a prioritisation factor (40% credit for visibility alone, rising to 100% with full prioritisation). Supply chain risk exposure is the unmanaged share of your weighted supplier base (business-critical suppliers count three times), scaled for supplier base size.</li>
      <li>Peer baselines are Cytidel modelled positions for a typical organisation of 2,000 or more employees in each industry, informed by the published research below. They are indicative, not survey results.</li>
      <li>Sources: ${Object.values(SOURCES).map((s) => `<a href="${s.url}" target="_blank" rel="noopener">${s.label}</a>`).join('; ')}.</li>
    </ul>
  </details>
  <div class="sca-row"><button type="button" class="sca-btn sca-btn-outline" data-act="edit">Change my answers</button><button type="button" class="sca-btn sca-btn-outline" data-act="restart">Start a new assessment</button></div>`;
}

function render(): void {
  if (!app) return;
  const st = STEPS[S.step];
  if (st.id === 'intro') app.innerHTML = introHTML();
  else if (st.id === 'org') app.innerHTML = progressHTML() + orgHTML();
  else if (st.id === 'lead') app.innerHTML = progressHTML() + leadHTML();
  else if (st.id === 'res') app.innerHTML = resultsHTML();
  else
    app.innerHTML =
      progressHTML() +
      `<section class="sca-card"><div class="sca-card-head"><span class="sca-eyebrow-plain">Step ${S.step} of ${NSTEPS}</span><h2>${st.title}</h2><p>${st.lede}</p></div>${(st.qs ?? []).map(optsHTML).join('')}${navHTML()}</section>`;
  bind();
  save();
}

/* ---------------- interaction ---------------- */
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
    });
  });
  const cap = $<HTMLInputElement>('#sca-cap', app);
  cap?.addEventListener('input', () => { S.cap = cap.value; save(); });
  app.querySelectorAll<HTMLInputElement>('[data-org]').forEach((el) =>
    el.addEventListener('input', () => { S.org[el.dataset.org as keyof State['org']] = el.value; save(); }));
  const ind = $<HTMLSelectElement>('#sca-industry', app);
  ind?.addEventListener('change', () => { S.org.industry = ind.value; save(); });
  app.querySelectorAll<HTMLInputElement>('[data-lead]').forEach((el) =>
    el.addEventListener('input', () => {
      const k = el.dataset.lead as 'firstname' | 'lastname' | 'email' | 'title';
      S.lead[k] = el.value;
    }));
  const walk = $<HTMLInputElement>('#sca-walk', app);
  walk?.addEventListener('change', () => { S.lead.walk = walk.checked; });
  const mkt = $<HTMLInputElement>('#sca-marketing', app);
  mkt?.addEventListener('change', () => { S.lead.marketing = mkt.checked; });
  app.querySelectorAll<HTMLElement>('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.dataset.act!)));
}

function go(step: number): void {
  S.step = step;
  render();
  window.scrollTo({ top: 0 });
  const h = $<HTMLElement>('h1, h2', app!);
  if (h) { h.setAttribute('tabindex', '-1'); h.focus({ preventScroll: true }); }
  const st = STEPS[step];
  if (st.name) track('Step', st.name);
}

function showErr(el: Element | null, msg: string): void {
  if (!el) return;
  el.textContent = msg;
  (el as HTMLElement).hidden = !msg;
}

function mark(id: string, ok: boolean): void {
  $(`#${id}`, app!)?.setAttribute('aria-invalid', ok ? 'false' : 'true');
}

function validateOrg(): boolean {
  const o = S.org, bad: string[] = [];
  const check = (id: string, ok: boolean): void => { mark(`sca-${id}`, ok); if (!ok) bad.push(id); };
  check('company', o.company.trim().length > 0);
  check('industry', !!o.industry);
  check('headcount', num(o.headcount) > 0);
  check('fte', num(o.fte) >= 0);
  check('suppliers', num(o.suppliers) > 0);
  check('critical', num(o.critical) >= 0 && num(o.critical) <= num(o.suppliers));
  const err = $('#sca-org-err', app!);
  if (bad.length) {
    showErr(err, bad.includes('critical') && num(o.critical) > num(o.suppliers)
      ? "Business-critical suppliers can't exceed the total number of suppliers."
      : 'Complete the highlighted fields. Estimates are fine.');
    return false;
  }
  showErr(err, '');
  return true;
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
  const opt = (qid: string): string => optOf(qid, single(qid)).t;
  return [
    'Supply Chain Risk Maturity Grid result',
    `Quadrant: ${QUADS[r.quad].name}`,
    `Detectability: ${r.D}/100 · Prioritisation ability: ${r.P}/100`,
    `Risk exposure: ${r.R}/100 (${r.band}); ${r.ind.name} baseline ${r.Rp}/100; ${r.ratio.toFixed(2)}x the baseline`,
    `Industry: ${r.ind.name} · Headcount: ${S.org.headcount} · Supply chain risk FTE: ${S.org.fte}`,
    `Suppliers: ${S.org.suppliers} (business-critical: ${S.org.critical})`,
    `Oversight: ${fmt(r.prioritised)} prioritised · ${fmt(r.inView - r.prioritised)} in view, not prioritised · ${fmt(r.outside)} outside effective view`,
    `Approach: ${opt('approach')} · Register: ${opt('list')} · Coverage: ${single('coverage') === 'cap' ? `capped at ${S.cap}` : opt('coverage')} (${Math.round(r.cov * 100)}% of suppliers)`,
    `Providers: ${multi('providers').map((v) => optOf('providers', v).t).join(', ') || 'none given'}`,
    `Beyond P1: ${opt('nth')} · Prioritise by: ${opt('prioritise')} · Early warning: ${opt('threat')}`,
    `Regulations: ${multi('regs').map((v) => optOf('regs', v).t).join(', ') || 'none given'}`,
    `Walkthrough requested: ${S.lead.walk ? 'yes' : 'no'} · Marketing updates: ${S.lead.marketing ? 'yes' : 'no'}`,
  ].join('\n');
}

async function sendLead(): Promise<boolean> {
  if (!LIVE) return false;
  const r = score();
  const field = (name: string, value: string): HSFormsField => ({ objectTypeId: '0-1', name, value });
  const fields: HSFormsField[] = [
    field('firstname', S.lead.firstname.trim()),
    field('lastname', S.lead.lastname.trim()),
    field('email', S.lead.email.trim()),
    field('company', S.org.company.trim()),
    field('jobtitle', S.lead.title.trim()),
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
  S.org = { company: 'Example Manufacturing Group', industry: 'mfg', headcount: '4500', fte: '1.5', suppliers: '1200', critical: '140' };
  S.a = { approach: 'over', list: 'flat', coverage: 'cap', providers: ['grc', 'ratings'], nth: 'mapped', prioritise: 'score', threat: 'reports', regs: ['nis2', 'cra'] };
  S.cap = '300';
}

async function act(a: string): Promise<void> {
  if (a === 'start') {
    S.example = false;
    track('Start');
    go(single('approach') && S.step === 0 ? Math.max(1, Math.min(S.resume, LEAD)) : 1);
    return;
  }
  if (a === 'example') { loadExample(); track('Example'); go(RES); return; }
  if (a === 'back') { go(Math.max(0, S.step - 1)); return; }
  if (a === 'next') {
    if (STEPS[S.step].id === 'org' && !validateOrg()) return;
    if (STEPS[S.step].qs && !validateQs()) return;
    S.resume = S.step + 1;
    go(S.step + 1);
    return;
  }
  if (a === 'submit') {
    const l = S.lead, err = $('#sca-lead-err', app!);
    const email = l.email.trim();
    const okEmail = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
    mark('sca-firstname', !!l.firstname.trim());
    mark('sca-lastname', !!l.lastname.trim());
    mark('sca-email', okEmail);
    mark('sca-lcompany', !!S.org.company.trim());
    if (!l.firstname.trim() || !l.lastname.trim() || !okEmail || !S.org.company.trim()) {
      showErr(err, 'Add your name, a valid work email and your company.');
      return;
    }
    if (isFreeEmail(email)) {
      mark('sca-email', false);
      showErr(err, "Please use your work email. We can't send results to personal email addresses.");
      track('Rejected Free Email');
      return;
    }
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
