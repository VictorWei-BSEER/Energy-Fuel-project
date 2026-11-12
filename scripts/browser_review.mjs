#!/usr/bin/env node
/** Real Chromium acceptance review. Requires Playwright and Python3; starts an owned static server by default.
 * Run: node scripts/browser_review.mjs http://127.0.0.1:4187 /tmp/fuel-atlas-review
 * No supplier data is sent; quote files below are synthetic validation fixtures.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let ownedServer = null;
const startServer = () => new Promise((resolve, reject) => {
  ownedServer = spawn(process.env.PYTHON || 'python3', ['-u', '-m', 'http.server', '0', '--bind', '127.0.0.1', '--directory', path.join(projectRoot, 'dist')], { stdio: ['ignore', 'pipe', 'pipe'] });
  ownedServer.stderr.resume(); // Drain request logs so a long review cannot block the server pipe.
  const timeout = setTimeout(() => reject(new Error('Static QA server did not start within 10 seconds')), 10000);
  ownedServer.once('error', error => { clearTimeout(timeout); reject(error); });
  ownedServer.once('exit', code => { clearTimeout(timeout); reject(new Error(`Static QA server exited: ${code}`)); });
  ownedServer.stdout.on('data', chunk => { const match = String(chunk).match(/port (\d+)/); if (match) { clearTimeout(timeout); resolve(`http://127.0.0.1:${match[1]}`); } });
});
process.on('exit', () => ownedServer?.kill());
const base = (process.argv[2] || process.env.FUEL_BASE_URL || await startServer()).replace(/\/$/, '');
const output = path.resolve(process.argv[3] || process.env.FUEL_BROWSER_OUTPUT || path.join(projectRoot, 'artifacts/browser-review'));
await fs.mkdir(output, { recursive: true });
const checks = [], errors = [], localFailures = [], externalFailures = [], accessibility = [], cancelledRequests = [];
const fixtureNames = ['airports', 'brent', 'catalog', 'fx', 'jodi', 'market'];
const feedFixtures = new Map(await Promise.all(fixtureNames.map(async name => [name, await fs.readFile(path.join(projectRoot, 'dist/data', `${name}.json`))])));
const fixtureManifest = Object.fromEntries([...feedFixtures].map(([name, data]) => [name, createHash('sha256').update(data).digest('hex')]));
const fixtureRequests = [], simulatedVendorFailures = [];
const executablePath = process.env.FUEL_BROWSER_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const panelNames = ['calculations', 'oil-markets', 'research', 'briefing', 'sources'];
const record = (name, details = {}) => checks.push({ name, pass: true, ...details });
const makePage = async (options = {}) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ...options });
  // Freeze only the repository's public-feed responses; production fetching is unchanged.
  await page.route(/^https:\/\/raw\.githubusercontent\.com\/VictorWei-BSEER\/Energy-Fuel-project\/(?:main|data)\/dist\/data\/(airports|brent|catalog|fx|jodi|market)\.json(?:\?.*)?$/, async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop().replace('.json', '');
    fixtureRequests.push({ url: route.request().url(), fixture: name });
    await route.fulfill({ status: 200, contentType: 'application/json', body: feedFixtures.get(name) });
  });
  await page.route('https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js', async route => {
    simulatedVendorFailures.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  page.on('pageerror', error => errors.push({ url: page.url(), message: error.message }));
  page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(base)) localFailures.push({ url: response.url(), status: response.status() }); });
  page.on('requestfailed', request => { const item = { url: request.url(), error: request.failure()?.errorText }; if (item.error === 'net::ERR_ABORTED') cancelledRequests.push(item); else (request.url().startsWith(base) ? localFailures : externalFailures).push(item); });
  return page;
};
const load = async (page, route = '/') => {
  await page.goto(base + route, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelectorAll('#leg-rows tr').length === 4);
};
const tab = async (page, name) => {
  await page.locator(`#workspace-tab-${name}`).click();
  await page.waitForFunction(value => document.querySelector(`#workspace-${value}`)?.hidden === false, name);
};
const pauseAt = async (page, value) => page.locator('#motion-progress').evaluate((input, progress) => {
  input.value = String(progress); input.dispatchEvent(new Event('input', { bubbles: true }));
}, value);
try {
  const page = await makePage();
  await load(page);
  assert.deepEqual(await page.locator('.workspace-tabs [role="tab"]').evaluateAll(items => items.map(item => item.dataset.workspace)), panelNames);
  const duplicateIds = await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(item => item.id); return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]; });
  assert.deepEqual(duplicateIds, []);
  record('Five mounted sections have unique document IDs and consistent tab order');

  const initialProgress = Number(await page.locator('#motion-progress').inputValue());
  await page.waitForTimeout(500);
  const advancingProgress = Number(await page.locator('#motion-progress').inputValue());
  assert.ok(advancingProgress > initialProgress, 'The normal-motion rotation should autoplay');
  await tab(page, 'research');
  const hiddenProgress = await page.locator('#motion-progress').inputValue();
  await page.waitForTimeout(300);
  assert.equal(await page.locator('#motion-progress').inputValue(), hiddenProgress);
  await tab(page, 'calculations');
  await page.waitForTimeout(300);
  assert.ok(Number(await page.locator('#motion-progress').inputValue()) > Number(hiddenProgress));
  await pauseAt(page, 35);
  await page.waitForTimeout(200);
  assert.equal(await page.locator('#motion-progress').inputValue(), '35');
  record('Real animation advances, pauses in the hidden workspace, resumes on return and obeys manual pause');

  // Real edit/recompute, then pause a solved rotation. Research must preserve this state.
  await page.locator('[data-leg="0"][data-key="priceUsdPerT"]').fill('975');
  await page.locator('#calculate').click();
  assert.equal(await page.locator('#model-error').isVisible(), false);
  await pauseAt(page, 42.3);
  const before = await page.evaluate(() => ({ price: document.querySelector('[data-leg="0"][data-key="priceUsdPerT"]').value, progress: document.querySelector('#motion-progress').value, cost: document.querySelector('#optimized-cost').textContent, header: document.querySelector('.topbar').getBoundingClientRect().height, nav: document.querySelector('.workspace-navigation').getBoundingClientRect().height }));
  await tab(page, 'research');
  await page.locator('#duration').evaluate(input => { input.value = '5'; input.dispatchEvent(new Event('input', { bubbles: true })); });
  assert.equal((await page.locator('#premium-value').textContent()).trim(), '21.2');
  await tab(page, 'calculations');
  await page.waitForTimeout(200);
  const after = await page.evaluate(() => ({ price: document.querySelector('[data-leg="0"][data-key="priceUsdPerT"]').value, progress: document.querySelector('#motion-progress').value, cost: document.querySelector('#optimized-cost').textContent, header: document.querySelector('.topbar').getBoundingClientRect().height, nav: document.querySelector('.workspace-navigation').getBoundingClientRect().height }));
  assert.deepEqual(after, before);
  await tab(page, 'research');
  assert.equal(await page.locator('#duration').inputValue(), '5');
  record('Model edits, solved cost, paused progress and research controls survive cross-tab navigation', { retainedProgress: before.progress, retainedPrice: before.price });

  // Keyboard tablist follows its visual order and exposes exactly one visible panel.
  await page.locator('#workspace-tab-calculations').focus();
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'workspace-tab-oil-markets');
  await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'workspace-tab-research');
  await page.keyboard.press('End');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'workspace-tab-sources');
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'workspace-tab-calculations');
  record('Keyboard ArrowRight, Home and End follow the shared tablist');

  const layouts = [];
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    for (const name of panelNames) {
      await tab(page, name);
      await page.waitForTimeout(100);
      const layout = await page.evaluate(() => ({ width: innerWidth, scrollWidth: document.documentElement.scrollWidth, visiblePanels: [...document.querySelectorAll('.workspace-panel')].filter(item => !item.hidden).map(item => item.id), navHeight: document.querySelector('.workspace-navigation').getBoundingClientRect().height, headerHeight: document.querySelector('.topbar').getBoundingClientRect().height, heading: document.querySelector('.workspace-panel:not([hidden]) h1')?.textContent.trim() }));
      assert.ok(layout.scrollWidth <= width + 1, `${name} overflows at ${width}: ${layout.scrollWidth}`);
      assert.deepEqual(layout.visiblePanels, [`workspace-${name}`]);
      layouts.push({ panel: name, ...layout });
      if ([390, 1440].includes(width)) await page.screenshot({ path: path.join(output, `final-${name}-${width}.png`) });
    }
  }
  await tab(page, 'oil-markets');
  await page.waitForFunction(() => document.querySelector('#public-market-chart').dataset.loadStage === 'error');
  assert.equal((await page.locator('#live-status').textContent()).trim(), 'DISPLAY UNCONFIRMED');
  assert.equal(await page.locator('#public-market-retry').isEnabled(), true);
  assert.ok(fixtureRequests.length > 0, 'Public-feed snapshot fixtures should be exercised');
  record('All five sections fit 320, 390, 768 and 1440 px without document overflow', { layouts, simulatedVendorFailureFallback: 'DISPLAY UNCONFIRMED; retry enabled' });

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  for (const name of panelNames) {
    await tab(page, name);
    const audit = await page.evaluate(async () => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
    accessibility.push({ panel: name, violations: audit.violations.map(item => ({ id: item.id, impact: item.impact, help: item.help, nodes: item.nodes.map(node => ({ target: node.target, summary: node.failureSummary })) })), incomplete: audit.incomplete.map(item => ({ id: item.id, targets: item.nodes.map(node => node.target) })) });
  }
  assert.equal(accessibility.reduce((count, audit) => count + audit.violations.length, 0), 0, 'Automated accessibility checks found violations; see browser-review.json');
  record('All five tabs pass automated WCAG 2/2.1 A/AA checks; incomplete/manual checks are recorded separately');

  // A browser history cycle must select the correct panel, not reload the model.
  await page.setViewportSize({ width: 1440, height: 1000 });
  await tab(page, 'calculations');
  await tab(page, 'research');
  await tab(page, 'briefing');
  await page.goBack({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('#workspace-research').hidden);
  await page.goForward({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => !document.querySelector('#workspace-briefing').hidden);
  record('Browser Back and Forward restore the selected workspace');

  const legacy = await makePage({ reducedMotion: 'reduce' });
  await load(legacy, '/research/#essay');
  await legacy.waitForFunction(() => location.hash === '#research/essay' && !document.querySelector('#workspace-research').hidden);
  assert.ok(await legacy.locator('#essay').isVisible());
  assert.ok(await legacy.locator('#essay').evaluate(element => Math.abs(element.getBoundingClientRect().top) < 230));
  record('Legacy /research/#essay reaches the mounted research section');
  await legacy.close();

  const quotePage = await makePage({ reducedMotion: 'reduce' });
  await load(quotePage);
  await quotePage.locator('[data-import]').first().click();
  const planDate = await quotePage.locator('#flight-date').inputValue();
  const fixture = ['airport,supplier,price_usd_per_t,valid_from,valid_until,delivery_basis,fees_included,source', ...[['SIN',950],['DXB',850],['LHR',1200],['JFK',1050]].map(([airport, price]) => `${airport},Browser QA synthetic fixture,${price},${planDate},${planDate},into-plane,true,https://example.com/synthetic-qa-fixture`)].join('\n');
  await quotePage.locator('#quote-file').setInputFiles({ name: 'synthetic-quotes.csv', mimeType: 'text/csv', buffer: Buffer.from(fixture) });
  await quotePage.waitForFunction(() => document.querySelector('#quote-count').textContent === '4');
  await quotePage.locator('#use-quotes').click();
  await quotePage.locator('#calculate').click();
  assert.equal(await quotePage.locator('#model-error').isVisible(), false);
  const downloadPromise = quotePage.waitForEvent('download');
  await quotePage.locator('#download-plan').click();
  const download = await downloadPromise;
  const exported = JSON.parse(await fs.readFile(await download.path(), 'utf8'));
  assert.equal(exported.priceMode, 'quotes'); assert.equal(exported.quotes.length, 4); assert.equal(exported.result.feasible, true);
  record('CSV quote import, calculation and JSON export retain user-supplied provenance', { fixture: 'Synthetic QA records, not market data', quoteCount: exported.quotes.length });
  await quotePage.locator('#mode-demo').click();
  await quotePage.locator('[data-leg="0"][data-key="from"]').focus();
  await quotePage.locator('[data-leg="0"][data-key="from"]').selectOption('AKL');
  assert.equal(await quotePage.evaluate(() => document.activeElement.dataset.key), 'from');
  assert.equal(await quotePage.evaluate(() => document.activeElement.dataset.leg), '0');
  assert.equal(await quotePage.locator('[data-leg="0"][data-key="priceUsdPerT"]').inputValue(), '');
  await quotePage.locator('#calculate').click();
  assert.equal(await quotePage.locator('#model-error').isVisible(), true);
  assert.equal(await quotePage.locator('#download-plan').isDisabled(), true);
  record('An unpriced airport remains blank and cannot produce an executable-looking result');
  await quotePage.close();
  await page.close();
  assert.deepEqual(errors, [], 'Uncaught browser JavaScript errors');
  assert.deepEqual(localFailures, [], 'Local runtime assets failed');
  record('No uncaught JavaScript errors or failed local runtime assets');
} catch (error) {
  checks.push({ name: 'Acceptance run', pass: false, error: error.stack || String(error) });
  console.error(error);
  process.exitCode = 1;
} finally {
  await browser.close();
  ownedServer?.kill();
  const report = { checkedAt: new Date().toISOString(), base, browser: 'System Chromium through Playwright', checks, errors, localFailures, externalFailures, cancelledRequests, accessibility, networkMode: { mode: 'controlled-public-feed-snapshots-and-vendor-failure', fixtureSha256: fixtureManifest, fixtureRequests, simulatedVendorFailures, note: 'CI injects the checked-in public snapshots and deliberately blocks the chart provider script. This is not a live-service verification.' }, limits: ['Local static application; production authentication and vendor service availability are outside this run.', 'Keyboard checks are targeted; no screen-reader or full WCAG conformance certification.'] };
  await fs.writeFile(path.join(output, 'browser-review.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify({ passed: checks.filter(item => item.pass).length, failed: checks.filter(item => !item.pass).length, errors: errors.length, localFailures: localFailures.length, report: path.join(output, 'browser-review.json') }));
}
