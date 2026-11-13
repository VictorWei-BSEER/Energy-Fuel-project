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
const fixtureRequests = [], forbiddenMarketRequests = [];
const executablePath = process.env.FUEL_BROWSER_PATH || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
const browser = await chromium.launch({ executablePath, headless: true, args: ['--no-sandbox'] });
const panelNames = ['calculations', 'oil-markets', 'research', 'briefing'];
const record = (name, details = {}) => checks.push({ name, pass: true, ...details });
const makePage = async (options = {}) => {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 }, ...options });
  // Freeze only the repository's public-feed responses; production fetching is unchanged.
  await page.route(/^https:\/\/raw\.githubusercontent\.com\/VictorWei-BSEER\/Energy-Fuel-project\/(?:main|data)\/dist\/data\/(airports|brent|catalog|fx|jodi|market)\.json(?:\?.*)?$/, async route => {
    const name = new URL(route.request().url()).pathname.split('/').pop().replace('.json', '');
    fixtureRequests.push({ url: route.request().url(), fixture: name });
    await route.fulfill({ status: 200, contentType: 'application/json', body: feedFixtures.get(name) });
  });
  await page.route(/^https?:\/\/[^/]*(?:tradingview\.com|oanda\.com)\//, async route => {
    forbiddenMarketRequests.push(route.request().url());
    await route.abort('blockedbyclient');
  });
  page.on('pageerror', error => errors.push({ url: page.url(), message: error.message }));
  page.on('response', response => { if (response.status() >= 400 && response.url().startsWith(base)) localFailures.push({ url: response.url(), status: response.status() }); });
  page.on('requestfailed', request => { const item = { url: request.url(), error: request.failure()?.errorText }; if (item.error === 'net::ERR_ABORTED') cancelledRequests.push(item); else (request.url().startsWith(base) ? localFailures : externalFailures).push(item); });
  return page;
};
const translationReview = [];
const load = async (page, route = '/') => {
  await page.goto(base + route, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.querySelector('#language-zh') && document.querySelectorAll('#leg-rows select').length >= 2);
};
const tab = async (page, name) => {
  await page.locator(`#workspace-tab-${name}`).click();
  await page.waitForFunction(value => document.querySelector(`#workspace-${value}`)?.hidden === false, name);
};
const language = async (page, value) => {
  await page.locator(`#language-${value}`).click();
  await page.waitForFunction(expected => document.documentElement.lang === expected, value === 'zh' ? 'zh-CN' : 'en');
  await page.waitForTimeout(100);
};
const pauseAt = async (page, value) => page.locator('#motion-progress').evaluate((input, progress) => {
  input.value = String(progress); input.dispatchEvent(new Event('input', { bubbles: true }));
}, value);
const routeCodes = page => page.locator('#leg-rows').evaluate(rows => {
  const legs = [...rows.querySelectorAll('tr')];
  return [legs[0]?.querySelector('[data-key="from"]')?.value || '', ...legs.map(row => row.querySelector('[data-key="to"]').value)];
});
const field = (page, leg, key) => page.locator(`[data-leg="${leg}"][data-key="${key}"]`);
const chooseRoute = async (page, codes) => {
  await tab(page, 'calculations');
  await page.locator('#reset-plan').click();
  await field(page, 0, 'from').selectOption(codes[0]);
  await field(page, 0, 'to').selectOption(codes[1]);
  for (let i = 2; i < codes.length; i++) {
    await page.locator('#add-leg').click();
    await field(page, i - 1, 'to').selectOption(codes[i]);
  }
  assert.deepEqual(await routeCodes(page), codes);
};
const downloadText = async (page, selector) => {
  const event = page.waitForEvent('download');
  await page.locator(selector).click();
  return fs.readFile(await (await event).path(), 'utf8');
};
const snapshot = page => page.evaluate(() => ({
  fields: [...document.querySelectorAll('#leg-rows input,#leg-rows select,#performance-rows input,#chain-inputs input,#chain-inputs select')].map(el => [el.dataset.leg, el.dataset.key, el.value]),
  date: document.querySelector('#flight-date').value,
  progress: document.querySelector('#motion-progress').value,
  quoteCount: document.querySelector('#quote-count').textContent,
  quoteMode: document.querySelector('#mode-quotes').getAttribute('aria-pressed'),
  chainCosts: [...document.querySelectorAll('[data-chain-cost]')].map(el=>[el.dataset.chainCost,el.querySelector('strong').textContent.replace(/[^\d.\-]/g,'')]),
  result: ['savings','baseline-cost','optimized-cost'].map(id => document.getElementById(id).textContent.replace(/[^\d.\-]/g,'')),
}));
const translationCandidates = async (page, locale) => page.evaluate(locale => {
  const panel = document.querySelector('.workspace-panel:not([hidden])');
  const candidates = [];
  const walker = document.createTreeWalker(panel, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement, text = node.textContent.trim().replace(/\s+/g,' ');
    if (!parent || !text || parent.closest('script,style,option,[data-language],.references-section li,cite,a[href^="http"],[data-user-content]')) continue;
    if (!parent.getClientRects().length) continue;
    let visible = true;
    for (let el = parent; el && el !== panel.parentElement; el = el.parentElement) {
      const css = getComputedStyle(el); if (el.hidden || css.display === 'none' || css.visibility === 'hidden') { visible = false; break; }
    }
    if (!visible) continue;
    const englishWords = text.match(/[A-Za-z]+(?:[-'][A-Za-z]+)*/g) || [];
    const untranslated = locale === 'en' ? /\p{Script=Han}/u.test(text) : englishWords.length >= 8;
    if (untranslated && !/^燃油图谱$/.test(text)) candidates.push({ text: text.slice(0,350), element: parent.tagName, id: parent.id, className: parent.getAttribute('class') });
  }
  return candidates;
}, locale);
const reviewGlobalMap = async page => {
  await tab(page, 'calculations');
  await page.locator('#scenario-preset').selectOption('global');
  await page.locator('#load-example').click();
  assert.deepEqual(await routeCodes(page), ['SIN','DXB','LHR','JFK','LAX']);
  await page.locator('#calculate').click();
  assert.equal(await page.locator('#model-error').isVisible(), false);
  await pauseAt(page, 55);
  assert.equal(await page.locator('#animated-plane').count(), 1);
  await page.setViewportSize({width:1440,height:1000});
  for (const locale of ['zh','en']) {
    await language(page, locale);
    await page.locator('.map-card').scrollIntoViewIfNeeded();
    await page.waitForTimeout(150);
    const clipped = await page.evaluate(() => {
      const card = document.querySelector('.map-card').getBoundingClientRect();
      return [...document.querySelectorAll('#motion-leg-buttons button,.motion-controls button,.map-support > *')].flatMap(item => {
        const box = item.getBoundingClientRect();
        return box.left < card.left || box.right > card.right ? [{element:item.id || item.className,left:box.left,right:box.right,cardLeft:card.left,cardRight:card.right}] : [];
      });
    });
    assert.deepEqual(clipped, [], 'Global-route controls must stay inside the map card');
    await page.screenshot({path:path.join(output,`global-map-${locale}-1440.png`)});
    await page.locator('.map-bottom').screenshot({path:path.join(output,`global-map-footer-${locale}.png`)});
  }
  // Exercise the rightmost playback control as well as recording its painted text.
  await page.locator('#play-route').click();
  assert.ok(Number(await page.locator('#motion-progress').inputValue()) < 55);
  await pauseAt(page,55);
  await language(page,'zh');
  await page.locator('#reset-plan').click();
  record('Explicit global example calculates four legs with visible, operable map controls', {visualEvidence:'global-map-*-1440.png and global-map-footer-*.png; manually inspect for paint clipping'});
};
const COST_COMPONENTS = ['procurementUsd','freightUsd','handlingUsd','basisAdjustmentUsd','holdingUsd','intoPlaneUsd','taxAdjustmentUsd','deliveredQuoteUsd'];
const approximately = (actual, expected, description, tolerance = 1e-5) => assert.ok(Number.isFinite(actual) && Number.isFinite(expected) && Math.abs(actual-expected) <= tolerance, `${description}: ${actual} versus ${expected}`);
function validateConnectedExport(exported) {
  assert.ok(exported.schemaVersion >= 3);
  const {input,result} = exported, network=input.supplyChain, chain=result.supplyChain;
  assert.equal(result.feasible,true); assert.ok(network && chain);
  assert.equal(chain.stages,input.legs.length);
  assert.equal(chain.mode,network.mode);
  for (const key of COST_COMPONENTS) assert.ok(Number.isFinite(chain.costBreakdown[key]), `Missing finite cost component ${key}`);
  approximately(COST_COMPONENTS.reduce((sum,key)=>sum+chain.costBreakdown[key],0),result.totalCostUsd,'Component cost total');
  approximately(chain.costBreakdown.totalUsd,result.totalCostUsd,'Reported chain total');
  approximately(result.legs.reduce((sum,leg)=>sum+leg.costUsd,0),result.totalCostUsd,'Allocated leg costs');
  assert.equal(chain.airportInventory.length,network.airports.length*input.legs.length);
  for (const airport of network.airports) {
    const rows=chain.airportInventory.filter(row=>row.airport===airport.code).sort((a,b)=>a.stage-b.stage);
    approximately(rows[0].openingT,airport.initialInventoryT,'Initial airport stock');
    approximately(rows.at(-1).closingT,airport.terminalInventoryT,'Final airport stock');
    for (const [index,row] of rows.entries()) {
      assert.equal(row.stage,index+1);
      approximately(row.openingT+row.arrivalsT-row.upliftT,row.closingT,'Airport mass balance');
      approximately(chain.shipments.filter(shipment=>shipment.airport===row.airport&&shipment.arrivalStage===row.stage).reduce((sum,shipment)=>sum+shipment.quantityT,0),row.arrivalsT,'Shipments reaching airport stock');
      approximately(input.legs[index].from===airport.code?result.legs[index].upliftT:0,row.upliftT,'Airport withdrawal equals aircraft uplift');
      if(index) approximately(row.openingT,rows[index-1].closingT,'Shared stock between departures');
    }
  }
  for (const supplier of network.suppliers) {
    const shipments=chain.shipments.filter(shipment=>shipment.supplierId===supplier.id);
    const quantity=shipments.reduce((sum,shipment)=>sum+shipment.quantityT,0);
    approximately(chain.suppliers.find(item=>item.id===supplier.id).purchasedT,quantity,'Supplier purchases feed its shipments');
    assert.ok(quantity<=supplier.totalCapacityT+1e-5,'Supplier horizon capacity is shared');
    for(let index=0;index<input.legs.length;index++) {
      const capacity=Array.isArray(supplier.capacityT)?supplier.capacityT[index]:supplier.capacityT;
      assert.ok(shipments.filter(shipment=>shipment.departureStage===index+1).reduce((sum,shipment)=>sum+shipment.quantityT,0)<=capacity+1e-5,'Supplier stage capacity is shared');
    }
  }
  let onboard=input.initialFuelT;
  for(const leg of result.legs) {
    approximately(onboard+leg.upliftT,leg.departureFuelT,'Aircraft departure balance');
    approximately(leg.departureFuelT-leg.burnT,leg.landingFuelT,'Aircraft landing balance');
    onboard=leg.landingFuelT;
  }
  approximately(onboard,result.finalFuelT,'Aircraft final fuel');
  return chain;
}
const chainField = (page,group,id,key) => page.locator(`[data-chain-group="${group}"][data-chain-id="${id}"][data-chain-key="${key}"]`);
const setChainField = async (page,group,id,key,value) => {
  const control=chainField(page,group,id,key);
  if(!await control.evaluate(el=>el.closest('details').open)) {
    const editor={suppliers:'supplier',routes:'route',airports:'stock',deliveredOffers:'offer'}[group];
    await page.locator(`#chain-${editor}-editor > summary`).click();
  }
  await control.fill(String(value)); await control.press('Tab');
};
const solveAndExport = async page => {
  await page.locator('#calculate').click();
  assert.equal(await page.locator('#model-error').isVisible(),false);
  assert.equal(await page.locator('#chain-results').isVisible(),true);
  const exported=JSON.parse(await downloadText(page,'#download-plan'));
  const chain=validateConnectedExport(exported);
  assert.equal(await page.locator('#chain-flow-rows tr').count(),chain.shipments.length);
  assert.equal(await page.locator('#chain-inventory-rows tr').count(),chain.airportInventory.length);
  if(chain.shipments.length) {
    const cells=await page.locator('#chain-flow-rows tr').first().locator('td').allTextContents();
    assert.equal(Number(cells[2]),chain.shipments[0].departureStage);
    assert.equal(Number(cells[3]),chain.shipments[0].arrivalStage);
  }
  approximately(Number((await page.locator('[data-chain-cost="totalCost"] strong').textContent()).replace(/[^0-9.-]/g,'')),exported.result.totalCostUsd,'Visible cost agrees with export',.011);
  return exported;
};
const reviewIntegratedModel = async () => {
  const page=await makePage({reducedMotion:'reduce'}); await load(page);
  await chooseRoute(page,['SIN','HKG','NRT']);
  const original=await solveAndExport(page);
  const hkgRoute=original.input.supplyChain.routes.find(route=>route.airport==='HKG');
  assert.ok(hkgRoute,'Generated route must include a supply path to HKG');
  await setChainField(page,'suppliers',hkgRoute.supplierId,'priceUsdPerT',500);
  assert.deepEqual(await page.evaluate(()=>[document.activeElement.dataset.chainId,document.activeElement.dataset.chainKey]),[hkgRoute.supplierId,'capacityT'],'Committing a supply field must let Tab move to the next field');
  assert.equal(await page.locator('#download-plan').isDisabled(),true);
  assert.equal(await page.locator('#chain-results').isVisible(),false);
  const normal=await solveAndExport(page);
  assert.ok(normal.result.legs[1].upliftT>1,'Cheaper HKG supply should serve the second leg');
  assert.ok(normal.result.totalCostUsd<original.result.totalCostUsd,'Upstream purchase price must affect the joint cost');
  const routeCapacity=normal.input.supplyChain.routes.find(route=>route.id===hkgRoute.id).capacityT;
  await setChainField(page,'routes',hkgRoute.id,'capacityT',0);
  assert.equal(await page.locator('#download-plan').isDisabled(),true);
  assert.equal(await page.locator('#chain-results').isVisible(),false);
  const outage=await solveAndExport(page);
  approximately(outage.result.legs[1].upliftT,0,'Outage blocks HKG uplift');
  assert.ok(outage.result.legs[0].upliftT>normal.result.legs[0].upliftT+1,'Origin uplift must cover the unavailable downstream fuel');
  assert.equal(outage.result.baseline.feasible,false);
  assert.equal(outage.result.savingsUsd,null); assert.equal(outage.result.savingsPercent,null);
  assert.ok(!outage.result.supplyChain.shipments.some(shipment=>shipment.airport==='HKG'&&shipment.quantityT>1e-5));
  await fs.writeFile(path.join(output,'joint-normal-plan.json'),JSON.stringify(normal,null,2)+'\n');
  await fs.writeFile(path.join(output,'joint-outage-plan.json'),JSON.stringify(outage,null,2)+'\n');
  for(const locale of ['zh','en']) {
    await language(page,locale);
    await page.locator('#chain-results').scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,`joint-outage-${locale}-1440.png`)});
  }
  await language(page,'zh');
  await setChainField(page,'routes',hkgRoute.id,'capacityT',Array.isArray(routeCapacity)?Math.max(...routeCapacity):routeCapacity);
  const restored=await solveAndExport(page);
  approximately(restored.result.totalCostUsd,normal.result.totalCostUsd,'Restoring supply restores the cost');
  const reference=Number(await field(page,0,'priceUsdPerT').inputValue());
  await field(page,0,'priceUsdPerT').fill(String(reference+25));
  const manual=await solveAndExport(page);
  assert.ok(manual.result.totalCostUsd>restored.result.totalCostUsd+1,'Manual delivered reference must change the modeled cost');
  const before=restored.input.supplyChain.routes.find(route=>route.airport==='SIN').basisAdjustmentUsdPerT;
  const after=manual.input.supplyChain.routes.find(route=>route.airport==='SIN').basisAdjustmentUsdPerT;
  approximately(after-before,25,'Manual price contributes one explicit basis adjustment',.011);
  const supplierCap=manual.input.supplyChain.suppliers.find(supplier=>supplier.id===hkgRoute.supplierId).capacityT;
  await setChainField(page,'suppliers',hkgRoute.supplierId,'capacityT','');
  assert.equal(await page.locator('#download-plan').isDisabled(),true);
  await field(page,0,'from').selectOption('');
  await field(page,0,'from').selectOption('SIN');
  assert.equal(await chainField(page,'suppliers',hkgRoute.supplierId,'capacityT').inputValue(),'','Invalid pending supply input must survive temporary route incompleteness');
  await language(page,'en');
  assert.equal(await chainField(page,'suppliers',hkgRoute.supplierId,'capacityT').inputValue(),'');
  await page.locator('#calculate').click();
  assert.equal(await page.locator('#model-error').isVisible(),true);
  assert.equal(await page.locator('#chain-results').isVisible(),false);
  assert.equal(await page.locator('#download-plan').isDisabled(),true);
  await setChainField(page,'suppliers',hkgRoute.supplierId,'capacityT',Array.isArray(supplierCap)?Math.max(...supplierCap):supplierCap);
  await solveAndExport(page);
  await page.close();
  record('A single connected solve conserves fuel and costs; upstream supply changes aircraft uplift and manual references affect its objective',{normal:{totalCostUsd:normal.result.totalCostUsd,upliftT:normal.result.legs.map(leg=>leg.upliftT)},outage:{totalCostUsd:outage.result.totalCostUsd,upliftT:outage.result.legs.map(leg=>leg.upliftT),baselineFeasible:outage.result.baseline.feasible}});
};
const reviewCase = process.env.FUEL_BROWSER_CASE || 'full';
assert.ok(['full','global-map','integrated'].includes(reviewCase), 'Unknown FUEL_BROWSER_CASE');
try {
  if (reviewCase === 'integrated') {
    await reviewIntegratedModel();
    assert.deepEqual(errors, []); assert.deepEqual(localFailures, []); assert.deepEqual(forbiddenMarketRequests, []);
  } else if (reviewCase === 'global-map') {
    const page = await makePage(); await load(page); await reviewGlobalMap(page); await page.close();
    assert.deepEqual(errors, []); assert.deepEqual(localFailures, []); assert.deepEqual(forbiddenMarketRequests, []);
  } else {
  const page = await makePage();
  await load(page);
  assert.equal(await page.locator('html').getAttribute('lang'), 'zh-CN');
  assert.equal(await page.locator('#language-zh').getAttribute('aria-pressed'), 'true');
  assert.deepEqual(await page.locator('.workspace-tabs [role="tab"]').evaluateAll(items => items.map(item => item.dataset.workspace)), panelNames);
  const duplicateIds = await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(item => item.id); return [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))]; });
  assert.deepEqual(duplicateIds, []);
  assert.deepEqual(await routeCodes(page), ['', '']);
  assert.equal(await page.locator('#animated-plane').count(), 0);
  assert.equal(await page.locator('#download-plan').isDisabled(), true);
  assert.equal(await page.locator('#chain-results').isVisible(), false);
  assert.equal(await page.locator('#chain-inputs').isVisible(), false);
  assert.ok(!/[0-9]/.test(await page.locator('#savings').textContent()));
  record('First visit is Chinese, with one empty leg and no invented result or aircraft playback');
  for (const locale of ['zh', 'en']) {
    await language(page, locale);
    for (const width of [390, 1440]) {
      await page.setViewportSize({width, height:width < 600 ? 844 : 1000});
      await page.screenshot({path:path.join(output,`empty-${locale}-${width}.png`)});
    }
  }
  await language(page, 'zh');

  await page.locator('#scenario-preset').selectOption('eastasia');
  assert.deepEqual(await routeCodes(page), ['', '']);
  await page.locator('#load-example').click();
  assert.deepEqual(await routeCodes(page), ['PVG','ICN','HND','PVG']);
  assert.equal(await page.locator('#download-plan').isDisabled(), true);
  assert.equal(await page.locator('#animated-plane').count(), 0);
  await page.locator('#scenario-preset').selectOption('global');
  assert.deepEqual(await routeCodes(page), ['PVG','ICN','HND','PVG']);
  await page.locator('#reset-plan').click();
  assert.deepEqual(await routeCodes(page), ['', '']);
  record('Examples require an explicit load action and never calculate automatically; reset returns to blank');
  await reviewGlobalMap(page);
  await reviewIntegratedModel();

  assert.equal(await field(page,0,'from').locator('option').evaluateAll(items => items.filter(item => item.value).length), 67);
  await chooseRoute(page, ['SIN','HKG']);
  await page.locator('#calculate').click();
  assert.equal(await page.locator('#model-error').isVisible(), false);
  const oneLeg = JSON.parse(await downloadText(page, '#download-plan'));
  assert.equal(oneLeg.result.feasible, true);
  assert.ok(Math.abs(oneLeg.result.savingsUsd) < .01, 'A single leg must not invent a tankering saving');
  record('Any of 67 airports can be chosen; a one-leg route calculates fuel without false tankering savings');

  await page.locator('#add-leg').click();
  await field(page,1,'to').selectOption('NRT');
  const oldBurn = await field(page,0,'baseBurnT').inputValue();
  await field(page,0,'to').selectOption('ICN');
  assert.deepEqual(await routeCodes(page), ['SIN','ICN','NRT']);
  assert.equal(await field(page,1,'from').inputValue(), 'ICN');
  assert.notEqual(await field(page,0,'baseBurnT').inputValue(), oldBurn);
  await field(page,0,'to').selectOption('HKG');
  await page.locator('#add-leg').click();
  await field(page,2,'to').selectOption('ICN');
  await page.locator('[data-move-stop="1"][data-direction="up"]').click();
  assert.deepEqual(await routeCodes(page), ['SIN','NRT','HKG','ICN']);
  await page.locator('[data-remove="2"]').click();
  assert.deepEqual(await routeCodes(page), ['SIN','NRT','HKG']);
  for(let i=0;i<3;i++) await page.locator('#add-leg').click();
  assert.equal(await page.locator('#leg-rows tr').count(), 5);
  assert.equal(await page.locator('#add-leg').isDisabled(), true);
  await chooseRoute(page, ['SIN','HKG','NRT']);
  record('Airport changes regenerate affected parameters; add, move and remove keep 1–5 continuous legs');

  const firstPrice = Number(await field(page,0,'priceUsdPerT').inputValue());
  await tab(page, 'oil-markets');
  await page.waitForFunction(() => document.querySelectorAll('#data-airport-rows tr').length === 67);
  assert.equal(await page.locator('#data-airport-rows [data-airport-detail]').count(), 67);
  await page.locator('#data-airport-search').fill('SIN');
  await page.locator('[data-airport-detail="SIN"]').click();
  assert.ok((await page.locator('#data-airport-detail').textContent()).includes('SIN'));
  assert.ok(await page.locator('#data-airport-detail dt').count() >= 5);
  await page.locator('#data-airport-search').fill('');
  const originalBase = Number(await page.locator('#data-base').inputValue());
  await page.locator('#data-base').fill(String(originalBase+25));
  await page.locator('#data-assumption-form button[type="submit"]').click();
  const dataset = JSON.parse(await downloadText(page, '#data-export-json'));
  assert.equal(dataset.records.length, 67);
  assert.equal(dataset.classification, 'synthetic_scenario');
  assert.ok(dataset.assumptions && dataset.aircraftProfiles && dataset.assumptionCatalog?.length);
  assert.equal(new Set(dataset.records.map(item => item.code)).size, 67);
  for(const item of dataset.records) {
    assert.ok(Number.isFinite(item.priceUsdPerT) && item.priceUsdPerT > 0);
    assert.ok(item.components.length >= 5 && item.provenance.geography.sourceUrl);
    assert.ok(Math.abs(item.components.reduce((sum,part)=>sum+part.value,0)-item.priceUsdPerT) < 1e-7);
  }
  const csv = await downloadText(page, '#data-export-csv');
  assert.equal(csv.trim().split(/\r?\n/).length, 68);
  await tab(page,'calculations');
  assert.ok(Math.abs(Number(await field(page,0,'priceUsdPerT').inputValue())-firstPrice-25) < .011);
  assert.equal(await page.locator('#download-plan').isDisabled(), true);
  await tab(page,'oil-markets'); await page.locator('#data-reset').click();
  assert.equal(await page.locator('#data-region-rows tr').count(), 9);
  const regionName = await page.locator('#data-region-rows input').evaluateAll(inputs => inputs.map(input=>input.name));
  assert.ok(regionName.length >= 18, 'Each regional price profile needs editable basis and service inputs');
  // Use the region that actually contains HKG, rather than relying on a display label.
  const hkg = dataset.records.find(record=>record.code==='HKG');
  const regionInput = page.locator(`#data-region-rows input[name="${hkg.regionId}.basisUsdPerT"]`);
  const regionalBefore = Number(await regionInput.inputValue());
  await tab(page,'calculations');
  const hkgBefore = Number(await field(page,1,'priceUsdPerT').inputValue());
  const sinBefore = Number(await field(page,0,'priceUsdPerT').inputValue());
  await tab(page,'oil-markets');
  await page.locator('details').filter({has:page.locator('#data-region-form')}).locator('summary').click();
  await regionInput.fill(String(regionalBefore+5));
  await page.locator('#data-region-form button[type="submit"]').click();
  await tab(page,'calculations');
  assert.ok(Math.abs(Number(await field(page,1,'priceUsdPerT').inputValue())-hkgBefore-5)<.011);
  assert.equal(Number(await field(page,0,'priceUsdPerT').inputValue()),sinBefore);
  await field(page,0,'priceUsdPerT').fill('975');
  await tab(page,'oil-markets');
  await page.locator('#data-base').fill(String(originalBase+10));
  await page.locator('#data-assumption-form button[type="submit"]').click();
  await tab(page,'calculations');
  assert.equal(await field(page,0,'priceUsdPerT').inputValue(),'975', 'Changing assumptions must preserve a manual price');
  await tab(page,'oil-markets'); await page.locator('#data-reset').click();
  await tab(page,'oil-markets');
  assert.ok(await page.locator('.data-source-table tbody tr').count() >= 5);
  record('Fuel data exposes 67 complete component sums, sources and exports; changed assumptions update the entered route');

  await tab(page,'calculations');
  await field(page,0,'priceUsdPerT').fill('975');
  await page.locator('#calculate').click();
  assert.equal(await page.locator('#model-error').isVisible(), false);
  const initialProgress = Number(await page.locator('#motion-progress').inputValue());
  await page.waitForTimeout(500);
  assert.ok(Number(await page.locator('#motion-progress').inputValue()) > initialProgress);
  await tab(page,'research');
  const hiddenProgress = await page.locator('#motion-progress').inputValue();
  await page.waitForTimeout(250); assert.equal(await page.locator('#motion-progress').inputValue(), hiddenProgress);
  await tab(page,'calculations'); await page.waitForTimeout(250);
  assert.ok(Number(await page.locator('#motion-progress').inputValue()) > Number(hiddenProgress));
  await pauseAt(page,42.3);
  const beforeLocale = await snapshot(page);
  await language(page,'en'); assert.deepEqual(await snapshot(page), beforeLocale);
  await language(page,'zh'); assert.deepEqual(await snapshot(page), beforeLocale);
  await tab(page,'research');
  await page.locator('#duration').evaluate(input => { input.value='5'; input.dispatchEvent(new Event('input',{bubbles:true})); });
  assert.equal((await page.locator('#premium-value').textContent()).trim(),'21.2');
  await tab(page,'calculations'); assert.deepEqual(await snapshot(page), beforeLocale);
  record('Animation, edited values and paused progress survive tab and locale changes; research controls also retain state');

  await page.locator('#workspace-tab-calculations').focus(); await page.keyboard.press('ArrowRight');
  assert.equal(await page.evaluate(()=>document.activeElement.id),'workspace-tab-oil-markets');
  await page.keyboard.press('End'); assert.equal(await page.evaluate(()=>document.activeElement.id),'workspace-tab-briefing');
  await page.keyboard.press('Home'); assert.equal(await page.evaluate(()=>document.activeElement.id),'workspace-tab-calculations');
  record('Keyboard navigation follows the shared four-tab order');

  for (const id of ['chain-supplier-editor','chain-route-editor','chain-stock-editor']) {
    if (!await page.locator(`#${id}`).evaluate(el=>el.open)) await page.locator(`#${id} > summary`).click();
  }
  const stockResult=page.locator('#chain-results details').filter({has:page.locator('#chain-inventory-rows')});
  if (!await stockResult.evaluate(el=>el.open)) await stockResult.locator('summary').click();
  const layouts=[];
  await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
  for(const locale of ['zh','en']) {
    await language(page,locale);
    for(const width of [320,390,768,1440]) {
      await page.setViewportSize({width,height:width<600?844:1000});
      for(const name of panelNames) {
        await tab(page,name); await page.waitForTimeout(80);
        const layout=await page.evaluate(()=>({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,visiblePanels:[...document.querySelectorAll('.workspace-panel')].filter(item=>!item.hidden).map(item=>item.id)}));
        assert.ok(layout.scrollWidth<=width+1,`${locale}/${name} overflows at ${width}: ${layout.scrollWidth}`);
        assert.deepEqual(layout.visiblePanels,[`workspace-${name}`]);
        layouts.push({locale,panel:name,...layout});
        if([390,1440].includes(width)) await page.screenshot({path:path.join(output,`final-${locale}-${name}-${width}.png`)});
      }
    }
    for(const name of panelNames) {
      await tab(page,name);
      const candidates=await translationCandidates(page,locale);
      translationReview.push({locale,panel:name,candidates});
      const visibleText=await page.locator(`#workspace-${name}`).innerText();
      assert.ok(!/\b(?:IIASA|TradingView|OANDA|CFDs?)\b/i.test(visibleText),`Removed promotional/widget content remains in ${name}`);
      const audit=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
      accessibility.push({locale,panel:name,violations:audit.violations.map(item=>({id:item.id,impact:item.impact,help:item.help,nodes:item.nodes.map(node=>({target:node.target,summary:node.failureSummary}))})),incomplete:audit.incomplete.map(item=>({id:item.id,targets:item.nodes.map(node=>node.target)}))});
    }
  }
  assert.equal(translationReview.reduce((sum,item)=>sum+item.candidates.length,0),0,'Untranslated visible interface text; see translationReview in browser-review.json');
  record('Both locales render all four sections coherently at 320, 390, 768 and 1440px without document overflow',{layouts});
  assert.equal(accessibility.reduce((sum,item)=>sum+item.violations.length,0),0,'Automated accessibility violations; see browser-review.json');
  record('Both-language WCAG 2/2.1 A/AA scans report zero violations; manual candidates remain recorded');

  await tab(page,'calculations'); await tab(page,'research'); await tab(page,'briefing');
  await page.goBack(); await page.waitForFunction(()=>!document.querySelector('#workspace-research').hidden);
  await page.goForward(); await page.waitForFunction(()=>!document.querySelector('#workspace-briefing').hidden);
  await language(page,'en'); await page.reload({waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.documentElement.lang==='en');
  assert.equal(await page.evaluate(()=>localStorage.getItem('fuel-atlas-language')),'en');
  record('Browser history restores the workspace and language selection persists on reload');

  const legacy=await makePage({reducedMotion:'reduce'});
  await load(legacy,'/research/#essay');
  await legacy.waitForFunction(()=>location.hash==='#research/essay'&&!document.querySelector('#workspace-research').hidden);
  assert.ok(await legacy.locator('#essay').isVisible()); await legacy.close();
  for (const entry of [
    {path:'/network.html',hash:'#model',panel:'calculations'},
    {path:'/planner.html#sources',hash:'#data/data-source-plan',panel:'oil-markets'},
    {path:'/#sources',hash:'#sources',panel:'oil-markets'},
    {path:'/#fuel-data',hash:'#fuel-data',panel:'oil-markets'},
    {path:'/#briefing',hash:'#briefing',panel:'briefing'},
  ]) {
    const redirected=await makePage({reducedMotion:'reduce'});
    await load(redirected,entry.path);
    await redirected.waitForFunction(expected=>location.hash===expected.hash&&!document.querySelector(`#workspace-${expected.panel}`).hidden,entry);
    assert.equal(await redirected.locator('.workspace-tabs [role="tab"]').count(),4);
    assert.equal(await redirected.locator('a[href$="network.html"],a[href$="planner.html"]').count(),0);
    await redirected.close();
  }
  record('Research, old supply-chain entry points and source aliases resolve to the same four-tab workspace');

  const quotePage=await makePage({reducedMotion:'reduce'}); await load(quotePage);
  await chooseRoute(quotePage,['SIN','HKG','NRT']);
  const planDate=await quotePage.locator('#flight-date').inputValue();
  const csvFor=origins=>['airport,supplier,price_usd_per_t,valid_from,valid_until,delivery_basis,fees_included,source',...origins.map((airport,i)=>`${airport},Browser QA synthetic quotation,${900+i*150},${planDate},${planDate},into-plane,true,https://example.com/synthetic-qa-fixture`)].join('\n');
  const importQuotes=async origins=>{
    await quotePage.locator('[data-import]').first().click();
    await quotePage.locator('#quote-file').setInputFiles({name:'synthetic-quotes.csv',mimeType:'text/csv',buffer:Buffer.from(csvFor(origins))});
    await quotePage.waitForFunction(count=>document.querySelector('#quote-count').textContent===String(count),origins.length);
    const chineseFeedback=await quotePage.locator('#import-feedback').innerText();
    assert.ok(chineseFeedback.includes(`已导入 ${origins.length} 条报价`));
    // A modal import uses its own close action; preserve the status, then switch globally.
    await quotePage.locator('#use-quotes').click();
    await language(quotePage,'en');
    assert.ok((await quotePage.locator('#import-feedback').textContent()).includes(`Imported ${origins.length} quotations`));
    await language(quotePage,'zh');
    assert.ok((await quotePage.locator('#import-feedback').textContent()).includes(`已导入 ${origins.length} 条报价`));
  };
  await importQuotes(['SIN']); await quotePage.locator('#calculate').click();
  assert.equal(await quotePage.locator('#model-error').isVisible(),true);
  assert.equal(await field(quotePage,1,'priceUsdPerT').inputValue(),'');
  assert.equal(await quotePage.locator('#download-plan').isDisabled(),true);
  await importQuotes(['SIN','HKG']); await quotePage.locator('#calculate').click();
  assert.equal(await quotePage.locator('#model-error').isVisible(),false);
  const quotedBefore=await snapshot(quotePage);
  await language(quotePage,'en'); assert.deepEqual(await snapshot(quotePage),quotedBefore);
  await language(quotePage,'zh'); assert.deepEqual(await snapshot(quotePage),quotedBefore);
  for(const name of panelNames) await tab(quotePage,name);
  await tab(quotePage,'calculations'); assert.deepEqual(await snapshot(quotePage),quotedBefore,'Quotation mode, inputs and results must survive all four tabs');
  const exported=JSON.parse(await downloadText(quotePage,'#download-plan'));
  assert.equal(exported.priceMode,'quotes'); assert.equal(exported.quotes.length,2); assert.equal(exported.result.feasible,true);
  const quotedChain=validateConnectedExport(exported);
  assert.equal(quotedChain.mode,'delivered');
  assert.equal(exported.input.supplyChain.suppliers.length,0);
  assert.equal(exported.input.supplyChain.routes.length,0);
  assert.equal(exported.input.supplyChain.deliveredOffers.length,2);
  for(const key of COST_COMPONENTS.filter(key=>key!=='deliveredQuoteUsd')) approximately(quotedChain.costBreakdown[key],0,'No added upstream cost in quote mode');
  approximately(quotedChain.costBreakdown.deliveredQuoteUsd,exported.result.totalCostUsd,'All-in quotation cost charged once');
  approximately(exported.result.legs.reduce((sum,leg,index)=>sum+leg.upliftT*exported.input.legs[index].priceUsdPerT,0),exported.result.totalCostUsd,'Delivered quotation accounting');
  assert.equal(await quotePage.locator('#chain-flow-rows tr').count(),quotedChain.shipments.length);
  record('Missing imported quotes block calculation despite full illustrative coverage; valid quotes and provenance survive locale changes');
  await quotePage.close(); await page.close();
  assert.deepEqual(forbiddenMarketRequests,[],'The main app requested a removed trading/CFD provider');
  assert.deepEqual(errors,[],'Uncaught browser JavaScript errors');
  assert.deepEqual(localFailures,[],'Failed local runtime assets');
  record('No removed provider requests, uncaught JavaScript errors or failed local assets');
  }
} catch(error) {
  checks.push({name:'Acceptance run',pass:false,error:error.stack||String(error)});
  console.error(error); process.exitCode=1;
} finally {
  await browser.close(); ownedServer?.kill();
  const report={checkedAt:new Date().toISOString(),reviewCase,base,browser:'Chromium through Playwright',checks,errors,localFailures,externalFailures,cancelledRequests,accessibility,translationReview,networkMode:{mode:'controlled-public-feed-snapshots-no-trading-widgets',fixtureSha256:fixtureManifest,fixtureRequests,forbiddenMarketRequests,note:'Repository public-feed requests, if made, use checked-in snapshots. TradingView/OANDA requests are blocked and treated as failures. Application production fetching is unchanged.'},limits:['Local static application; production authentication and live supplier/service availability are outside this run.','Translation heuristics complement a human wording review; original source titles, proper names, units, codes and English download artifacts are allowed.','Targeted keyboard/automated checks are not a screen-reader or complete accessibility certification.']};
  await fs.writeFile(path.join(output,'browser-review.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({passed:checks.filter(item=>item.pass).length,failed:checks.filter(item=>!item.pass).length,errors:errors.length,localFailures:localFailures.length,report:path.join(output,'browser-review.json')}));
}
