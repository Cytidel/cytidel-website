// Supplier monitoring self-assessment (Supply Chain Risk Maturity Grid).
// Content and scoring model by John (GTM), ported from his standalone build.
// The page script lives in src/scripts/supplier-assessment.ts; edit copy,
// weights and sources here without touching the logic.

export type AxisKey = 'D' | 'P';
export type QuadKey = 'over' | 'pro' | 're' | 'blind';

export interface Industry {
  name: string;
  /** Share of breaches involving a third party, % */
  rate: number;
  rateSrc: keyof typeof SOURCES;
  /** Modelled peer baseline: detectability and prioritisation, 0–100 */
  D: number;
  P: number;
  /** True when `rate` is the cross-sector figure, not a sector one */
  cross?: boolean;
}

export interface Option {
  v: string;
  t: string;
  s?: string;
  d?: number;
  p?: number;
  tier?: number;
  f?: number;
}

export interface Question {
  label: string;
  help?: string;
  opts: Option[];
  multi?: boolean;
  grid?: boolean;
  /** Follow-up multi-select shown once an answer other than "none" is picked */
  sub?: string;
}

export interface Step {
  id: 'intro' | 'org' | 'approach' | 'vis' | 'prio' | 'lead' | 'res';
  name?: string;
  title?: string;
  lede?: string;
  qs?: string[];
}

// Primary sources only. Sector rates marked TODO in the open-questions doc
// still need checking against Verizon's sector snapshot PDFs.
export const SOURCES = {
  v26: {
    label: 'Verizon 2026 Data Breach Investigations Report',
    url: 'https://www.verizon.com/about/news/breach-industry-wide-dbir-finds',
  },
  v26fi: {
    label: 'Verizon 2026 DBIR, Financial and Insurance',
    url: 'https://www.verizon.com/business/resources/reports/dbir/',
  },
  v26ret: {
    label: 'Verizon 2026 DBIR, Retail snapshot',
    url: 'https://www.verizon.com/business/resources/reports/2026-dbir-retail-snapshot.pdf',
  },
  v26hc: {
    label: 'Verizon 2026 DBIR, Healthcare snapshot',
    url: 'https://www.verizon.com/business/resources/reports/2026-dbir-healthcare-snapshot.pdf',
  },
  ibm25: {
    label: 'IBM Cost of a Data Breach Report 2025',
    url: 'https://www.ibm.com/reports/data-breach',
  },
  csbs26: {
    label: 'UK Government, Cyber Security Breaches Survey 2025/2026',
    url: 'https://www.gov.uk/government/statistics/cyber-security-breaches-survey-20252026/cyber-security-breaches-survey-20252026',
  },
} as const;

// Peer baselines model a typical organisation of 2,000+ employees in each
// sector. They are Cytidel modelled assumptions (D = detectability,
// P = prioritisation, 0 to 100), informed by the sources above.
export const INDUSTRIES: Record<string, Industry> = {
  fs: { name: 'Financial services', rate: 34, rateSrc: 'v26fi', D: 60, P: 42 },
  ins: { name: 'Insurance', rate: 34, rateSrc: 'v26fi', D: 58, P: 40 },
  mfg: { name: 'Manufacturing', rate: 48, rateSrc: 'v26', D: 46, P: 32, cross: true },
  avi: { name: 'Aviation and transport', rate: 48, rateSrc: 'v26', D: 50, P: 36, cross: true },
  ind: { name: 'Industrial and engineering', rate: 48, rateSrc: 'v26', D: 46, P: 32, cross: true },
  ene: { name: 'Energy and utilities', rate: 48, rateSrc: 'v26', D: 52, P: 38, cross: true },
  ret: { name: 'Retail and consumer goods', rate: 68, rateSrc: 'v26ret', D: 46, P: 34 },
  tech: { name: 'Technology and telecoms', rate: 48, rateSrc: 'v26', D: 56, P: 40, cross: true },
  hc: { name: 'Healthcare and life sciences', rate: 32, rateSrc: 'v26hc', D: 46, P: 32 },
  pub: { name: 'Public sector', rate: 48, rateSrc: 'v26', D: 50, P: 34, cross: true },
  pro: { name: 'Professional services', rate: 48, rateSrc: 'v26', D: 50, P: 36, cross: true },
  oth: { name: 'Other', rate: 48, rateSrc: 'v26', D: 50, P: 36, cross: true },
};

export const TARGET = { D: 85, P: 85 };

export const QUADS: Record<QuadKey, { name: string; short: string; sub: string; desc: string }> = {
  over: {
    name: 'Overwhelmed / Alert Fatigue',
    short: 'Overwhelmed',
    sub: 'High supplier data, low supplier intelligence',
    desc: 'Questionnaires, ratings and alerts arrive across the supplier base, but nothing separates the supplier exposures attackers are working from the rest. Teams chase long lists and the critical issue sits mid-queue.',
  },
  pro: {
    name: 'Proactive / Risk-Led Action',
    short: 'Proactive',
    sub: 'High data, high information, high intelligence',
    desc: 'A full view of the supplier base paired with threat context. Effort concentrates on the suppliers and exposures carrying genuine business risk. This is the Cytidel target state.',
  },
  re: {
    name: 'Reactive / Ad Hoc',
    short: 'Reactive',
    sub: 'Low supplier data, low supplier intelligence',
    desc: 'Supplier breaches are found once they are public, often weeks after they happened. There is no systematic view of the supplier base, so contractual obligations are exposed before anyone can act.',
  },
  blind: {
    name: 'Blind Spots',
    short: 'Blind spots',
    sub: 'Low supplier data, high supplier intelligence',
    desc: 'Strong analysis of a small set of key suppliers, but you rely on suppliers to disclose a breach. Breaches at subsidiaries and fourth parties can go unseen, leaving contractual obligations exposed.',
  },
};

// Question bank. d / p = contribution to Detectability / Prioritisation (0 to 100).
export const Q: Record<string, Question> = {
  approach: {
    label: 'How would you describe your approach to supply chain risk today?',
    help: 'Pick the description closest to how things work in practice, not how the policy reads.',
    grid: true,
    opts: [
      { v: 're', t: 'Reactive / Ad Hoc', s: 'We act when a supplier tells us about an incident or it reaches the news.', d: 20, p: 20 },
      { v: 'over', t: 'Overwhelmed / Alert Fatigue', s: 'We collect plenty of supplier data, but struggle to tell which supplier issues matter.', d: 75, p: 25 },
      { v: 'blind', t: 'Blind Spots', s: 'We assess our key suppliers well, but much of the supplier base sits outside our view.', d: 30, p: 75 },
      { v: 'pro', t: 'Proactive / Risk-Led Action', s: 'We see across the supplier base and act first on the exposures attackers are targeting.', d: 85, p: 85 },
    ],
  },
  list: {
    label: 'Do you have a full list of your core suppliers?',
    help: 'Supplier lists often sit across procurement, IT and supply chain. Choose the answer that reflects one complete view.',
    opts: [
      { v: 'tiered', t: 'Yes, one tiered register', s: 'Complete, held in one place and ranked by criticality and access.', d: 100, tier: 100 },
      { v: 'flat', t: 'Yes, but not tiered', s: 'Complete, though not ranked by criticality or kept fully current.', d: 70, tier: 30 },
      { v: 'partial', t: 'Partly', s: 'Spread across procurement, IT, supply chain and other functions.', d: 35, tier: 20 },
      { v: 'none', t: 'No single list', s: 'We would need to build one from scratch.', d: 5, tier: 0 },
    ],
  },
  coverage: {
    label: 'Are there limits on how many suppliers your current providers cover?',
    help: 'Include GRC and third-party risk platforms, procurement tools, security ratings and threat intelligence services.',
    sub: 'providers',
    opts: [
      { v: 'none', t: 'No provider today', f: 0 },
      { v: 'lt10', t: 'Under 10% of suppliers covered', f: 0.05 },
      { v: '10', t: '10 to 25% covered', f: 0.18 },
      { v: '25', t: '25 to 50% covered', f: 0.38 },
      { v: '50', t: '50 to 75% covered', f: 0.63 },
      { v: '75', t: 'Over 75% covered', f: 0.88 },
      { v: 'cap', t: 'Capped by licence', s: 'A fixed number of suppliers is covered.' },
    ],
  },
  providers: {
    label: 'Optional. Which types of provider do you use today?',
    multi: true,
    opts: [
      { v: 'grc', t: 'GRC or TPRM platform' },
      { v: 'ratings', t: 'Security ratings service' },
      { v: 'ti', t: 'Threat intelligence covering suppliers' },
      { v: 'proc', t: 'Procurement or supplier management tool' },
      { v: 'managed', t: 'Consultancy or managed assessments' },
      { v: 'inhouse', t: 'In-house tooling or spreadsheets' },
    ],
  },
  nth: {
    label: 'How much visibility do you have beyond your direct P1 suppliers?',
    help: 'The fourth parties behind your critical suppliers, such as the platforms and subcontractors they rely on. You may not use a platform directly, but a supplier running part of your operations does.',
    opts: [
      { v: 'none', t: 'None', d: 5 },
      { v: 'some', t: 'Known for a few critical suppliers', d: 35 },
      { v: 'mapped', t: 'Mapped for critical suppliers', d: 65 },
      { v: 'mon', t: 'Mapped and monitored continuously', d: 95 },
    ],
  },
  prioritise: {
    label: "How do you decide which suppliers' risk to act on first?",
    opts: [
      { v: 'equal', t: 'All treated the same', p: 5 },
      { v: 'spend', t: 'By spend or contract value', p: 20 },
      { v: 'score', t: 'By questionnaire score or security rating', p: 40 },
      { v: 'crit', t: 'By business criticality and data access', p: 60 },
      { v: 'exploit', t: 'By active exploitation and threat actor targeting', p: 95 },
    ],
  },
  threat: {
    label: 'Do you have a full picture of threat actor intelligence and early warning on exploited vulnerabilities across your supply chain, with the speed to act on it?',
    help: 'Think about how you would find out that a supplier, or software your suppliers run, is being targeted or exploited.',
    opts: [
      { v: 'news', t: 'No, we hear from the supplier or the news', s: 'Often weeks after the breach.', d: 5, p: 5 },
      { v: 'reports', t: 'Partly, through periodic threat reports', s: 'General threat context, without a supplier view.', d: 30, p: 30 },
      { v: 'critical', t: 'For critical suppliers only', s: 'Alerts arrive, but acting on them takes days.', d: 55, p: 60 },
      { v: 'full', t: 'Yes, across the full supply chain', s: 'Live early warning, acted on within hours.', d: 95, p: 95 },
    ],
  },
  regs: {
    label: 'Which regulations will drive supplier security requirements in the next 12 months?',
    help: 'Select all that apply.',
    multi: true,
    opts: [
      { v: 'dora', t: 'DORA' },
      { v: 'nis2', t: 'NIS2' },
      { v: 'cra', t: 'Cyber Resilience Act' },
      { v: 'csrb', t: 'UK Cyber Security and Resilience Bill' },
      { v: 'opres', t: 'PRA / FCA operational resilience' },
      { v: 'iso', t: 'ISO 27001 supplier controls' },
      { v: 'contract', t: 'Customer or contractual requirements' },
      { v: 'none', t: 'None or not sure' },
    ],
  },
};

export const STEPS: Step[] = [
  { id: 'intro' },
  { id: 'org', name: 'Organisation', title: 'About your organisation', lede: 'These figures set the scale of your supplier base and the team looking after it. Estimates are fine.' },
  { id: 'approach', name: 'Approach', title: 'Your approach to supply chain risk', lede: 'Place yourself on the grid, then tell us how complete your supplier view is.', qs: ['approach', 'list'] },
  { id: 'vis', name: 'Visibility', title: 'Coverage and visibility', lede: 'How much of your supply chain you can see today.', qs: ['coverage', 'nth'] },
  { id: 'prio', name: 'Action', title: 'Prioritisation and early warning', lede: 'How supplier risk turns into action, and what is driving requirements over the next year.', qs: ['prioritise', 'threat', 'regs'] },
  { id: 'lead', name: 'Your details', title: 'Where should we send your results?', lede: 'Your full report appears straight after this step.' },
  { id: 'res', name: 'Results' },
];

// Gap copy. A function receives the scored result for answer-specific text.
export interface GapCopy {
  ax: 'Detectability' | 'Prioritisation';
  h: string;
  p: string | ((r: { cov: number; perFte: number | null }) => string);
}

const fmt = (n: number): string => Math.round(n).toLocaleString('en-GB');

export const GAP_TEXT: Record<string, GapCopy> = {
  list: {
    ax: 'Detectability',
    h: 'Build one tiered register of core suppliers',
    p: 'A single list ranked by criticality and access is the base for every other supplier decision. Without it, coverage and prioritisation both rest on guesswork.',
  },
  coverage: {
    ax: 'Detectability',
    h: 'Close the monitoring coverage gap',
    p: (r) =>
      r.cov === 0
        ? 'No provider currently covers your supplier base, so every supplier sits outside active monitoring. Visibility that scales with the supplier base is the first step out of this position.'
        : `Around ${Math.round((1 - r.cov) * 100)}% of your supplier base sits outside active monitoring. Visibility that scales with the supplier base, rather than a licence-capped subset, is the first step out of this position.`,
  },
  nth: {
    ax: 'Detectability',
    h: 'Map the fourth parties behind P1 suppliers',
    p: "Shared platforms concentrate risk, and a supplier's supplier can be the exposure. The ransomware attack on Collins Aerospace's MUSE check-in platform in September 2025 disrupted Heathrow, Brussels and Berlin through one shared supplier.",
  },
  tier: {
    ax: 'Prioritisation',
    h: 'Tier suppliers by criticality and access',
    p: 'Without tiers, a stationery supplier and a managed service provider with domain admin access compete for the same attention.',
  },
  prioritise: {
    ax: 'Prioritisation',
    h: 'Rank supplier exposure by active exploitation',
    p: 'Spend, questionnaire scores and ratings describe posture, not attacker intent. Ranking by active exploitation and threat actor targeting puts effort on the suppliers attackers are actually working.',
  },
  threat: {
    ax: 'Prioritisation',
    h: 'Get early warning across the whole supply chain',
    p: 'Hearing about a supplier breach from the supplier or the news means acting weeks late, with contractual obligations already exposed. Cytidel combines threat actor intelligence with live exploitation data, and has flagged vulnerabilities later confirmed as exploited 79 days ahead of CISA KEV on average.',
  },
  capacity: {
    ax: 'Prioritisation',
    h: 'Match team capacity to the supplier base',
    p: (r) =>
      r.perFte
        ? `At roughly ${fmt(r.perFte)} suppliers per person focused on supply chain risk, manual review cannot keep pace. Triage has to be automated so people spend time on the exposures that matter.`
        : 'With no one dedicated to supply chain risk, triage has to be automated so the little time available goes to the exposures that matter.',
  },
};
