import { chromium } from 'playwright-core';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForSelector('.react-checkbox-tree');

const data = await page.evaluate(() => {
  const out = [];
  const rows = [...document.querySelectorAll('.rct-text')];
  for (const row of rows) {
    const li = row.closest('.rct-node');
    const label = row.querySelector('.tv-row')?.textContent?.trim().slice(0, 24);
    const exp = row.querySelector('.rct-collapse');
    const cb = row.querySelector('.rct-checkbox');
    const guide = (() => {
      // the nested list whose ::before draws the vertical guide for this row
      const parentList = li?.parentElement; // ol/ul
      if (!parentList || !parentList.matches('ol,ul')) return null;
      if (parentList.parentElement?.classList.contains('react-checkbox-tree')) return null; // root list, no guide
      const cs = getComputedStyle(parentList, '::before');
      const pr = parentList.getBoundingClientRect();
      return { left: Math.round(pr.left), w: parseFloat(cs.width), inlineStart: cs.insetInlineStart || cs.left, bg: cs.backgroundColor };
    })();
    const tick = (() => {
      if (!li) return null;
      const cs = getComputedStyle(li, '::after');
      if (cs.content === 'none' || !cs.width || parseFloat(cs.width) === 0) return null;
      return { w: parseFloat(cs.width), top: cs.top, bg: cs.backgroundColor };
    })();
    const r = (el) => el ? el.getBoundingClientRect() : null;
    out.push({
      label,
      rowRight: Math.round(r(row)?.right ?? 0),
      expX: Math.round((r(exp)?.left ?? 0)), expW: Math.round(r(exp)?.width ?? -1),
      expBoxX: Math.round((r(exp)?.left ?? 0) + ((r(exp)?.width ?? 0) - 16) / 2),
      cbX: Math.round(r(cb)?.left ?? -1), cbW: Math.round(r(cb)?.width ?? -1),
      guide, tick,
      expanded: li?.classList.contains('rct-node-expanded'),
    });
  }
  return out;
});
console.log(JSON.stringify(data, null, 1));
console.log('ERRORS:', JSON.stringify(errors));
await page.screenshot({ path: '/tmp/tv-initial.png', fullPage: true });
await browser.close();
