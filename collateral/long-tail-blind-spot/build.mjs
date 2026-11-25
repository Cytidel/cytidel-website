// Prints paper.html to dist/cytidel-long-tail-blind-spot.pdf with headless
// Chromium, saves a review image of every page to review/, and fails if any
// page's content runs into its footer (so a copy change can't silently push
// text off the page). `yarn build --publish` also copies the PDF to the
// website's downloads folder.
import { chromium } from 'playwright-core';
import { mkdirSync, copyFileSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'dist', 'cytidel-long-tail-blind-spot.pdf');
mkdirSync(path.join(here, 'dist'), { recursive: true });
mkdirSync(path.join(here, 'review'), { recursive: true });

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 900, height: 1200 }, deviceScaleFactor: 1.5 });
await page.goto(pathToFileURL(path.join(here, 'paper.html')).href, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);

const report = await page.evaluate(() => {
  const fontOk = document.fonts.check('700 16px "Mona Sans"');
  const pages = [...document.querySelectorAll('.page')];
  const problems = [];
  const spare = [];
  pages.forEach((p, i) => {
    if (p.matches('.cover, .back')) { spare.push('-'); return; }
    const foot = p.querySelector('.run-foot');
    const limit = foot.getBoundingClientRect().top - 6;
    const content = [...p.children].filter((el) => !el.matches('.run-head, .run-foot, .back-block'));
    for (const el of content) {
      const b = el.getBoundingClientRect().bottom;
      if (b > limit) problems.push(`page ${i + 1}: <${el.tagName.toLowerCase()} class="${el.className}"> overflows by ${Math.round(b - limit)}px`);
    }
    spare.push(Math.round(limit - content[content.length - 1].getBoundingClientRect().bottom));
  });
  return { fontOk, count: pages.length, problems, spare };
});

const pageEls = await page.$$('.page');
for (const [i, el] of pageEls.entries()) {
  await el.screenshot({ path: path.join(here, 'review', `page-${String(i + 1).padStart(2, '0')}.png`) });
}

await page.pdf({ path: out, format: 'A4', printBackground: true, preferCSSPageSize: true, tagged: true, outline: true });
await browser.close();

console.log(`pages: ${report.count} | Mona Sans loaded: ${report.fontOk}`);
console.log(`spare px per page (covers '-'): ${report.spare.join(', ')}`);
if (!report.fontOk) {
  console.error('Mona Sans did not load (needs network for Google Fonts).');
  process.exitCode = 1;
}
if (report.problems.length) {
  console.error('OVERFLOW:\n  ' + report.problems.join('\n  '));
  process.exitCode = 1;
} else {
  console.log(`PDF written: ${path.relative(process.cwd(), out)}`);
}
if (process.argv.includes('--publish') && !process.exitCode) {
  const dest = path.join(here, '..', '..', 'astro', 'public', 'downloads', 'cytidel-long-tail-blind-spot.pdf');
  copyFileSync(out, dest);
  console.log('Copied to', path.relative(process.cwd(), dest));
}
