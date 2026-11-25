// Generates assets/cover-network.svg: your organisation (neon), the monitored
// strategic tier wired to it, and the long tail fading out to the right with
// a few live exposures (red). Seeded, so every build draws the same picture.
import { writeFileSync } from 'node:fs';

let seed = 20261125;
const rand = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const W = 2100, H = 1500;
const org = { x: 330, y: 700 };
const out = [];
out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}">`);
out.push(`<defs>
  <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#80FC13" stop-opacity="0.45"/><stop offset="1" stop-color="#80FC13" stop-opacity="0"/></radialGradient>
  <radialGradient id="redglow" cx="0.5" cy="0.5" r="0.5"><stop offset="0" stop-color="#ff5a45" stop-opacity="0.45"/><stop offset="1" stop-color="#ff5a45" stop-opacity="0"/></radialGradient>
</defs>`);

// Monitored strategic tier: ~40 suppliers close to the organisation, wired in.
const monitored = [];
for (let i = 0; i < 40; i++) {
  const a = (rand() - 0.5) * 1.5, r = 120 + rand() * 520;
  monitored.push({ x: org.x + Math.cos(a) * r, y: org.y + Math.sin(a) * r * 0.85, s: 7 + rand() * 6 });
}
for (const m of monitored) out.push(`<line x1="${org.x}" y1="${org.y}" x2="${m.x.toFixed(1)}" y2="${m.y.toFixed(1)}" stroke="#80FC13" stroke-opacity="0.22" stroke-width="1.6"/>`);

// The long tail: many more suppliers, sparser and fainter towards the edge.
const tail = [];
for (let i = 0; i < 520; i++) {
  const t = Math.pow(rand(), 0.75);
  const x = 760 + t * (W - 740);
  const spread = 320 + t * 520;
  const y = org.y + (rand() - 0.5) * 2 * spread * (0.6 + rand() * 0.4);
  if (y < 30 || y > H - 60) continue;
  tail.push({ x, y, s: 3 + rand() * 5.5, o: 0.75 - t * 0.5 });
}
for (const p of tail) out.push(`<circle cx="${p.x.toFixed(1)}" cy="${p.y.toFixed(1)}" r="${p.s.toFixed(1)}" fill="#a9b6bc" fill-opacity="${p.o.toFixed(2)}"/>`);
for (const m of monitored) out.push(`<circle cx="${m.x.toFixed(1)}" cy="${m.y.toFixed(1)}" r="${m.s.toFixed(1)}" fill="#80FC13" fill-opacity="0.85"/>`);

// Live exposures nobody is watching, out in the tail.
const reds = [[1180, 470], [1460, 930], [1640, 380], [1880, 720], [1320, 1120], [2000, 1060]];
for (const [x, y] of reds) out.push(`<circle cx="${x}" cy="${y}" r="46" fill="url(#redglow)"/><circle cx="${x}" cy="${y}" r="13" fill="#ff5a45"/>`);

// The organisation.
out.push(`<circle cx="${org.x}" cy="${org.y}" r="150" fill="url(#glow)"/><circle cx="${org.x}" cy="${org.y}" r="62" fill="#80FC13" fill-opacity="0.18"/><circle cx="${org.x}" cy="${org.y}" r="40" fill="#80FC13"/>`);
out.push(`<text x="${org.x}" y="${org.y + 112}" fill="#f4f7f6" font-family="Mona Sans, sans-serif" font-size="30" font-weight="700" letter-spacing="3" text-anchor="middle">YOUR ORGANISATION</text>`);
out.push(`<text x="${W - 70}" y="${H - 40}" fill="#a9b6bc" font-family="Mona Sans, sans-serif" font-size="28" font-style="italic" text-anchor="end">the long tail: hundreds to thousands of suppliers</text>`);
out.push('</svg>');
writeFileSync(new URL('./assets/cover-network.svg', import.meta.url), out.join('\n'));
console.log('cover-network.svg written,', monitored.length, 'monitored,', tail.length, 'tail');
