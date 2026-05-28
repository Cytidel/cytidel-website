// Shared FAQ data — rendered on /faq (full list) and the homepage FAQ section.
// Also used to emit FAQPage JSON-LD on both pages for Google rich results.
//
// Single source of truth: edit here, both surfaces stay in sync.

export interface FAQ {
  question: string;
  answer: string;
}

export const faqs: FAQ[] = [
  {
    question: 'We already have Tenable / Qualys. Why do we need Cytidel?',
    answer:
      "Tenable and Qualys tell you what's vulnerable inside your environment. Cytidel tells you what's being exploited outside it — across thousands of sources including attacker forums, exploit repositories, social media, and threat actor campaigns. Your scanner shows you the backlog, once it has the signature. We tell you when a new zero-day drops, when exploit code appears in the wild, and when a vulnerability in your stack comes under active exploitation — often before your scanner can even see it. We work alongside the stack you already have, not instead of it.",
  },
  {
    question: "How does Cytidel's risk rating compare to Tenable VPR or Qualys TruRisk?",
    answer:
      "Tenable VPR and Qualys TruRisk prioritise within your scanned environment. Cytidel's risk rating tells you what attackers are doing with vulnerabilities right now — informed by exploitation evidence, proof-of-concept availability, threat actor activity, and live signals. Different purposes, and they work well together.",
  },
  {
    question: 'What data do we need to share?',
    answer:
      'None. Cytidel does not require access to your internal environment. Our intelligence engine is built on external data sources. Integration with your scanner or ticketing system is available when you are ready — but it is not a prerequisite.',
  },
  {
    question: 'How quickly can we get started?',
    answer:
      'Most teams are operational within 24 hours. Account creation takes minutes. We recommend starting with a demo so we can configure onboarding around your environment — the technology stack you care about and the suppliers you need to monitor.',
  },
  {
    question: 'We do not have the resource for another tool.',
    answer:
      "Cytidel doesn't add to the manual intelligence workload — it replaces it. Teams report saving 20+ hours per analyst per week on manual research and report production. The capacity comes back to your team for incident response, threat hunting, and the work that needs a human.",
  },
  {
    question: 'How is pricing structured?',
    answer:
      "Pricing is based on organisation size, not seat count. Every plan includes unlimited access for your security team. We will walk you through pricing on a call — bring your environment and the suppliers you need to monitor, and we'll show you what it looks like for you.",
  },
  {
    question: 'How do you track threat actors?',
    answer:
      "Cytidel's threat actor intelligence maps every known adversary to the CVEs in their arsenal, with full TTP context, alias tracking, and campaign history. When a threat actor starts targeting software you depend on, you know — with the evidence and the context to act. The full module is called Villain Vault, and the best way to see it work is in a demo.",
  },
  {
    question: 'Are you ISO 27001 certified?',
    answer:
      "Yes. Cytidel is ISO 27001:2022 certified. We've also designed the platform to support customers going through their own ISO 27001 assessments — automating intelligence gathering and mapping scans against current threat activity.",
  },
  {
    question: "We are an MSSP. Can we use Cytidel's intelligence?",
    answer:
      'Yes. Our OEM programme is live and already integrated with a partner product in market. We also have an MSSP programme available. Reach out to our partnerships team directly — these are strategic conversations that deserve a dedicated discussion.',
  },
];
