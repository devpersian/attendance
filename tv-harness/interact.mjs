import { chromium } from 'playwright-core';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1000, height: 800 } });
const errors = [];
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', e => errors.push(String(e)));
await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' });
await page.waitForSelector('.react-checkbox-tree');

const stateOf = () => page.evaluate(() => {
  const rows = [...document.querySelectorAll('.rct-text')].map(row => {
    const li = row.closest('.rct-node');
    const label = row.querySelector('.tv-row')?.textContent?.trim().slice(0, 20);
    const glyph = row.querySelector('.rct-checkbox svg path')?.getAttribute('d') ?? null;
    const box = row.querySelector('.rct-checkbox span')?.getBoundingClientRect();
    const input = row.querySelector('input[type="checkbox"]');
    return { label, glyph: glyph ? glyph.slice(0, 6) : null, gw: box ? Math.round(box.width) : -1,
             checked: input?.checked ?? null, indet: input?.indeterminate ?? null };
  });
  return rows;
});

const clickCb = async (labelPart) => {
  // click the checkbox LABEL of the row whose text contains labelPart
  const row = page.locator('.rct-text', { hasText: labelPart }).first();
  await row.locator('label').first().click({ position: { x: 7, y: 13 } });
  await page.waitForTimeout(120);
};

console.log('INITIAL:', JSON.stringify(await stateOf()));

// 1. check مجوز ۲ -> category الف should become half-checked
await clickCb('مجوز ۲');
console.log('AFTER CHECK ۲:', JSON.stringify(await stateOf()));

// 2. uncheck مجوز ۱ -> now only ۲ checked, category still half
await clickCb('مجوز ۱');
console.log('AFTER UNCHECK ۱:', JSON.stringify(await stateOf()));

// 3. uncheck مجوز ۲ -> none checked, category unchecked
await clickCb('مجوز ۲');
console.log('AFTER UNCHECK ۲:', JSON.stringify(await stateOf()));

// 4. click the CATEGORY itself -> all children checked
await clickCb('دسته‌بندی الف');
console.log('AFTER CHECK CAT:', JSON.stringify(await stateOf()));

// 5. click category again -> all cleared (un-checking a fully checked parent)
await clickCb('دسته‌بندی الف');
console.log('AFTER UNCHECK CAT:', JSON.stringify(await stateOf()));

// 6. expand/collapse via [+]/[−] button
const kidsBefore = await page.locator('.rct-text').count();
await page.locator('.rct-node-expanded > .rct-text > .rct-collapse-btn').first().click();
await page.waitForTimeout(120);
const kidsAfter = await page.locator('.rct-text').count();
console.log(`COLLAPSE OK: ${kidsBefore} -> ${kidsAfter}`);
await page.locator('.rct-node-collapsed > .rct-text > .rct-collapse-btn').first().click();
await page.waitForTimeout(120);
console.log('RE-EXPAND OK:', (await page.locator('.rct-text').count()) === kidsBefore);

// 7. connector geometry re-check after interactions
const geo = await page.evaluate(() => {
  const res = [];
  for (const li of document.querySelectorAll('ol ol > .rct-node, ul ul > .rct-node')) {
    const cs = getComputedStyle(li, '::after');
    const list = li.parentElement;
    const gcs = getComputedStyle(list, '::before');
    const lr = list.getBoundingClientRect(), lir = li.getBoundingClientRect();
    const guideX = getComputedStyle(list).direction === 'rtl' ? lr.right - parseFloat(gcs.insetInlineStart || '12') : lr.left + parseFloat(gcs.insetInlineStart || '12');
    const tickRight = getComputedStyle(list).direction === 'rtl' ? lir.right + 12 : lir.left - 12; // tick spans 12px ending at content edge
    res.push({ t: li.querySelector('.tv-row')?.textContent?.trim().slice(0, 10), w: parseFloat(cs.width), top: cs.top, guideW: parseFloat(gcs.width) });
  }
  return res;
});
console.log('GEO:', JSON.stringify(geo));
console.log('ERRORS:', JSON.stringify(errors));
await page.screenshot({ path: '/tmp/tv-final.png', fullPage: true });
await browser.close();
