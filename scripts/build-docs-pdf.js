#!/usr/bin/env node
/**
 * Renders Markdown documents to styled A4 PDFs (P08 visual system).
 *   node scripts/build-docs-pdf.js <out-dir> <file.md>...
 * Requires pandoc and Playwright.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/node22/lib/node_modules/playwright');

const ROOT = path.join(__dirname, '..');
const [outDir, ...files] = process.argv.slice(2);
const TITLES = {
  'HOW-TO': 'How to set up and use',
  'TEST-RESULTS': 'Test results',
  'UPWORK-PORTFOLIO-ENTRY': 'Upwork portfolio entry',
  'MEDIA-LICENSES': 'Media and license record',
  'README-START-HERE': 'Start here',
};

const css = `
@page{size:A4;margin:16mm 15mm 18mm}
body{background:#fff;font-family:Inter,sans-serif;font-size:9.6pt;line-height:1.55;color:#1E293B}
.top{background:#0A1428;color:#fff;border-radius:3mm;padding:7mm 8mm;margin-bottom:6mm;position:relative;overflow:hidden}
.top::after{content:"";position:absolute;right:-30mm;top:-35mm;width:90mm;height:90mm;border-radius:50%;background:radial-gradient(rgba(45,212,191,.35),transparent 65%)}
.top .k{font:500 7.5pt "JetBrains Mono";letter-spacing:.14em;color:#2DD4BF}
.top .t{font:800 21pt "Plus Jakarta Sans";margin-top:2mm}
h1{display:none}
h2{font:800 14pt "Plus Jakarta Sans";margin:7mm 0 2mm;color:#0F172A;border-bottom:1px solid #DCE3EC;padding-bottom:1.5mm}
h3{font:700 11pt "Plus Jakarta Sans";margin:5mm 0 1.5mm}
table{border-collapse:collapse;width:100%;margin:2mm 0 4mm;font-size:8.6pt;page-break-inside:auto}
th{font:500 7pt "JetBrains Mono";letter-spacing:.08em;text-transform:uppercase;color:#64748B;text-align:left;background:#F8FAFC}
td,th{border-bottom:1px solid #E2E8F0;padding:1.6mm 2mm;vertical-align:top}
tr{page-break-inside:avoid}
code{font-family:"JetBrains Mono";font-size:8.2pt;background:#F1F5F9;padding:.3mm 1mm;border-radius:1mm}
pre{background:#0F172A;color:#E2E8F0;padding:3mm 4mm;border-radius:2mm;white-space:pre-wrap;font-size:8pt}
pre code{background:none;color:inherit;padding:0}
img{max-width:100%;border-radius:2mm}
a{color:#0D9488}
hr{border:0;border-top:1px solid #DCE3EC;margin:5mm 0}
`;

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  for (const f of files) {
    const name = path.basename(f, '.md');
    const body = execFileSync('pandoc', [f, '-f', 'gfm', '-t', 'html5'], { encoding: 'utf8' });
    const html = `<!doctype html><html><head><meta charset="utf-8"><base href="file://${path.dirname(path.resolve(f))}/">
      <link rel="stylesheet" href="file://${ROOT}/assets/p08.css"><style>${css}</style></head><body>
      <div class="top"><div class="k">P08 · AI PROJECT MANAGER</div><div class="t">${TITLES[name] || name}</div></div>${body}</body></html>`;
    const tmp = path.join(path.dirname(path.resolve(f)), `.p08-render-${name}.html`);
    fs.writeFileSync(tmp, html);
    const page = await browser.newPage();
    await page.goto('file://' + tmp, { waitUntil: 'networkidle' });
    fs.unlinkSync(tmp);
    await page.evaluate(() => document.fonts.ready);
    const out = path.join(outDir, `P08-${name}.pdf`);
    await page.pdf({
      path: out, format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>',
      footerTemplate: '<div style="width:100%;font:7px monospace;color:#94A3B8;padding:0 15mm;display:flex;justify-content:space-between"><span>P08 · AI Project Manager · Muhammad Rehan Ansar</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
    });
    await page.close();
    console.log('pdf', out);
  }
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
