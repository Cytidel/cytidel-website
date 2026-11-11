import { describe, expect, it } from 'vitest';
import { Q } from '../data/supplier-assessment';
import { EXAMPLE, coverageFraction, gaps, score, type Answers } from './supplier-assessment-model';

const best: Answers = { approach: 'pro', list: 'tiered', suppliers: 'r5k', coverage: '75', nth: 'mon', prioritise: 'exploit', threat: 'full', regs: [] };
const worst: Answers = { approach: 're', list: 'none', suppliers: 'r5k', coverage: 'none', nth: 'none', prioritise: 'equal', threat: 'news', regs: [] };

describe('score', () => {
  it('keeps the example in Overwhelmed with the original detectability', () => {
    const r = score(EXAMPLE.a, EXAMPLE.cap);
    // 0.15·75 + 0.2·70 + 0.3·24 + 0.25·65 + 0.1·30 = 51.7
    expect(r.D).toBe(52);
    // (0.15·25 + 0.1·30 + 0.3·40 + 0.35·30) / 0.9 = 32.5
    expect(r.P).toBe(33);
    expect(r.quad).toBe('over');
    expect(r.N).toBe(2500);
  });

  it('no longer scores team capacity', () => {
    const r = score(EXAMPLE.a, EXAMPLE.cap);
    expect(Object.keys(r.P_parts)).toEqual(['approach', 'tier', 'prioritise', 'threat']);
    expect(gaps(r).map((g) => g.k)).not.toContain('capacity');
  });

  it('puts the best answers in Proactive and the worst in Reactive / High', () => {
    const b = score(best, '');
    expect(b.quad).toBe('pro');
    expect(b.D).toBeGreaterThanOrEqual(85);
    expect(b.P).toBeGreaterThanOrEqual(85);
    const w = score(worst, '');
    expect(w.quad).toBe('re');
    expect(w.band).toBe('High');
    expect(w.R).toBeGreaterThan(b.R);
  });

  it('scales exposure down for a small supplier base and caps it for large ones', () => {
    const small = score({ ...worst, suppliers: 'r50' }, '');
    const large = score({ ...worst, suppliers: 'r5k' }, '');
    const larger = score({ ...worst, suppliers: 'r5kp' }, '');
    expect(small.R).toBeLessThan(large.R);
    expect(large.R).toBe(larger.R);
  });

  it('splits the supplier base into prioritised, in view and outside', () => {
    const r = score(EXAMPLE.a, EXAMPLE.cap);
    expect(r.prioritised).toBeLessThanOrEqual(r.inView);
    expect(r.inView + r.outside).toBe(r.N);
  });

  it('returns three gaps, none for areas already strong', () => {
    const g = gaps(score(EXAMPLE.a, EXAMPLE.cap));
    expect(g).toHaveLength(3);
    expect(gaps(score(best, ''))).toHaveLength(0);
  });
});

describe('coverageFraction', () => {
  it('divides a licence cap by the modelled supplier count', () => {
    expect(coverageFraction({ coverage: 'cap', suppliers: 'r1k' }, '100')).toBeCloseTo(0.2);
    expect(coverageFraction({ coverage: 'cap', suppliers: 'r50' }, '100')).toBe(1);
    expect(coverageFraction({ coverage: 'cap', suppliers: 'r1k' }, '')).toBe(0);
  });
  it('is zero with no provider and uses the band midpoint otherwise', () => {
    expect(coverageFraction({ coverage: 'none' }, '')).toBe(0);
    expect(coverageFraction({ coverage: '25' }, '')).toBe(0.38);
  });
});

describe('question bank', () => {
  it('has a supplier count band for every option', () => {
    for (const o of Q.suppliers.opts) expect(o.n).toBeGreaterThan(0);
  });
});
