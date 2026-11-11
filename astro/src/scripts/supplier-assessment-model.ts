// Supplier monitoring self-assessment — the scoring model, kept free of the
// DOM so it can be unit-tested (supplier-assessment-model.test.ts).
//
// Scoring model by John (GTM), ported from his standalone build. Two inputs
// from the original organisation screen are no longer asked (team capacity
// and business-critical supplier count); see the notes on score() for how
// the weights adapt. Content and weights live in src/data/supplier-assessment.ts.

import { INDUSTRIES, Q, TARGET, type Industry, type Option, type QuadKey } from '../data/supplier-assessment';

/** Answers keyed by question id: a value for single-choice, an array for multi-select. */
export type Answers = Record<string, string | string[] | undefined>;

export interface Result {
  D: number;
  P: number;
  D_parts: Record<string, [number, number]>;
  P_parts: Record<string, [number, number]>;
  /** Modelled supplier count, from the band chosen */
  N: number;
  /** Share of suppliers covered by current providers, 0–1 */
  cov: number;
  ind: Industry;
  R: number;
  Rp: number;
  Rt: number;
  band: string;
  quad: QuadKey;
  ratio: number;
  inView: number;
  prioritised: number;
  outside: number;
}

export const num = (v: string): number => {
  const n = parseFloat(String(v ?? '').replace(/,/g, ''));
  return isFinite(n) ? n : NaN;
};
export const clamp = (x: number, a: number, b: number): number => Math.max(a, Math.min(b, x));
export const optOf = (qid: string, v: string | string[] | undefined): Option =>
  Q[qid].opts.find((o) => o.v === v) ?? Q[qid].opts[0];
export const single = (a: Answers, qid: string): string => (typeof a[qid] === 'string' ? (a[qid] as string) : '');
export const multi = (a: Answers, qid: string): string[] => (Array.isArray(a[qid]) ? (a[qid] as string[]) : []);

/** Representative supplier count for the band chosen (0 until answered). */
export function supplierCount(a: Answers): number {
  const v = single(a, 'suppliers');
  return v ? (optOf('suppliers', v).n ?? 0) : 0;
}

export function coverageFraction(a: Answers, cap: string): number {
  const c = single(a, 'coverage');
  if (!c || c === 'none') return 0;
  if (c === 'cap') {
    const n = num(cap), N = supplierCount(a);
    return n > 0 && N > 0 ? clamp(n / N, 0, 1) : 0;
  }
  return optOf('coverage', c).f ?? 0;
}

// Weighted mean of (weight, value) parts, normalised by the weight sum.
// Detectability weights sum to 1. Prioritisation weights sum to 0.9 since
// team capacity (0.1) is no longer asked; dividing by the sum keeps John's
// relative weights without rewriting them.
const weightedMean = (parts: Record<string, [number, number]>): number => {
  const rows = Object.values(parts);
  const tw = rows.reduce((t, [w]) => t + w, 0);
  return Math.round(rows.reduce((t, [w, v]) => t + w * v, 0) / tw);
};

export function score(a: Answers, cap: string): Result {
  const N = supplierCount(a);
  const ap = optOf('approach', single(a, 'approach'));
  const li = optOf('list', single(a, 'list'));
  const th = optOf('threat', single(a, 'threat'));
  const cov = coverageFraction(a, cap);
  const D_parts: Record<string, [number, number]> = {
    approach: [0.15, ap.d ?? 0],
    list: [0.2, li.d ?? 0],
    coverage: [0.3, Math.round(cov * 100)],
    nth: [0.25, optOf('nth', single(a, 'nth')).d ?? 0],
    threat: [0.1, th.d ?? 0],
  };
  const P_parts: Record<string, [number, number]> = {
    approach: [0.15, ap.p ?? 0],
    tier: [0.1, li.tier ?? 0],
    prioritise: [0.3, optOf('prioritise', single(a, 'prioritise')).p ?? 0],
    threat: [0.35, th.p ?? 0],
  };
  const D = weightedMean(D_parts), P = weightedMean(P_parts);
  // Industry is no longer asked, so every result compares with the
  // cross-sector baseline. The INDUSTRIES table stays for a later picker.
  const ind = INDUSTRIES.oth;
  const eff = (d: number, p: number): number => (d / 100) * (0.4 + (0.6 * p) / 100);
  // Exposure scales with the size of the supplier base (log scale, 0.6–1).
  // Business-critical suppliers used to count three times; that input is
  // no longer asked, so the modelled count stands on its own.
  const scale = clamp(0.6 + 0.13 * Math.log10(Math.max(N, 1)), 0.6, 1);
  const risk = (d: number, p: number): number => Math.round(100 * (1 - eff(d, p)) * scale);
  const R = risk(D, P), Rp = risk(ind.D, ind.P), Rt = risk(TARGET.D, TARGET.P);
  const band = R < 35 ? 'Low' : R < 55 ? 'Moderate' : R < 72 ? 'Elevated' : 'High';
  const quad: QuadKey = D >= 50 ? (P >= 50 ? 'pro' : 'over') : P >= 50 ? 'blind' : 're';
  const inView = Math.round((N * D) / 100), prioritised = Math.round((inView * P) / 100);
  return {
    D, P, D_parts, P_parts, N, cov, ind, R, Rp, Rt, band, quad,
    ratio: (1 - eff(D, P)) / (1 - eff(ind.D, ind.P)),
    inView, prioritised, outside: N - inView,
  };
}

// Top three gaps by weighted shortfall. Self-placement is excluded (it is a
// description, not a gap) and tiering folds into the register gap.
export function gaps(r: Result): { k: string }[] {
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

/** The sample result shown on the landing page and at #example. */
export const EXAMPLE: { a: Answers; cap: string; company: string } = {
  a: {
    approach: 'over', list: 'flat', suppliers: 'r5k', coverage: 'cap', providers: ['grc', 'ratings'],
    nth: 'mapped', prioritise: 'score', threat: 'reports', regs: ['nis2', 'cra'],
  },
  cap: '600',
  company: 'Example Manufacturing Group',
};
