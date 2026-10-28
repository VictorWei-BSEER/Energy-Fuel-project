import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

// Exercise the default observed-data monitor without loading the scenario engine.
// The DOM shim checks data/interaction behavior, not browser rendering.
let mountId = 0;
const clone = value => structuredClone(value);
async function until(predicate, message = 'observed interface settles') {
  for (let turn = 0; turn < 40; turn++) {
    if (predicate()) return;
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.ok(predicate(), message);
}
async function mount(t, { mode = 'unavailable', noData = false, prepareRemote = () => {} } = {}) {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const catalog = JSON.parse(await readFile(new URL('../dist/data/catalog.json', import.meta.url), 'utf8'));
  const fixture = new Map([['data/catalog.json', catalog]]);
  for (const feed of catalog.feeds) if (feed.path) fixture.set(feed.path, JSON.parse(await readFile(new URL(`../dist/${feed.path}`, import.meta.url), 'utf8')));
  const { document, window } = parseHTML(html);
  const requests = [], intervals = [], downloads = [], blobs = new Map(), scrolls = [];
  const remote = { mode, fixture: new Map([...fixture].map(([path, data]) => [path, clone(data)])) };
  prepareRemote(remote.fixture);
  const originals = new Map();
  const setGlobal = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
  Object.defineProperty(window.HTMLSelectElement.prototype, 'value', {
    configurable: true,
    get() { return this.querySelector('option[selected]')?.value ?? this.querySelector('option')?.value ?? ''; },
    set(value) { for (const option of this.querySelectorAll('option')) option.toggleAttribute('selected', option.value === String(value)); },
  });
  window.HTMLElement.prototype.scrollIntoView = function () { scrolls.push(this.id); };
  const originalCreate = URL.createObjectURL, originalRevoke = URL.revokeObjectURL;
  const originalClick = window.HTMLAnchorElement.prototype.click, originalNow = Date.now;
  URL.createObjectURL = blob => { const url = `blob:observed-${blobs.size}`; blobs.set(url, blob); return url; };
  URL.revokeObjectURL = () => {};
  window.HTMLAnchorElement.prototype.click = function () {
    if (this.download) downloads.push({ filename: this.download, blob: blobs.get(this.href) });
    else originalClick.call(this);
  };
  const dates = [...fixture.values()].map(data => data.latest?.date).filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date || ''));
  Date.now = () => Math.max(...dates.map(date => Date.parse(date))) + 3 * 86400000;
  setGlobal('window', window); setGlobal('document', document);
  setGlobal('Option', function Option(label, value) { const option = document.createElement('option'); option.textContent = label; option.value = value; return option; });
  setGlobal('CSS', { escape: value => String(value).replace(/[^a-zA-Z0-9_-]/g, c => `\\${c}`) });
  setGlobal('matchMedia', () => ({ matches: true }));
  setGlobal('setInterval', (callback, delay) => { intervals.push({ callback, delay }); return intervals.length; });
  setGlobal('fetch', async (raw, options) => {
    const url = String(raw); requests.push({ url, options });
    assert.equal(options?.cache, 'no-store');
    assert.ok(options.signal instanceof AbortSignal);
    const isRemote = url.startsWith('https:');
    const path = isRemote ? url.split('/dist/')[1] : url.replace(/^\.\//, '');
    if (isRemote && remote.mode === 'timeout') { const error = new Error('Simulated source timeout'); error.name = 'AbortError'; throw error; }
    if (noData || isRemote && (remote.mode === 'unavailable' || remote.mode === 'feature' && url.includes('/main/'))) return { ok: false, status: 404 };
    const data = (isRemote ? remote.fixture : fixture).get(path);
    return data === undefined ? { ok: false, status: 404 } : { ok: true, status: 200, headers: new Headers({ 'content-type': 'application/json' }), text: async () => JSON.stringify(data) };
  });
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
    URL.createObjectURL = originalCreate; URL.revokeObjectURL = originalRevoke;
    window.HTMLAnchorElement.prototype.click = originalClick; Date.now = originalNow;
  });
  await import(`../dist/observed-app.js?dom-observed=${++mountId}`);
  const $ = selector => document.querySelector(selector);
  await until(() => !$('#refresh-data').disabled && !/^Checking/.test($('#refresh-status').textContent));
  const emit = (selector, type) => {
    const target = $(selector), event = new window.Event(type, { bubbles: true, cancelable: true });
    const result = target.dispatchEvent(event); event.target = target; return result;
  };
  const click = selector => emit(selector, 'click');
  const select = (selector, value) => { $(selector).value = value; emit(selector, 'change'); };
  const refresh = async () => { click('#refresh-data'); await until(() => !$('#refresh-data').disabled); };
  const exportJSON = async () => { const before = downloads.length; click('#export-json'); assert.equal(downloads.length, before + 1); return JSON.parse(await downloads.at(-1).blob.text()); };
  return { $, html, document, window, fixture, remote, requests, intervals, downloads, scrolls, click, select, refresh, exportJSON };
}

test('default monitor displays published observations without model assumptions', async t => {
  const ui = await mount(t);
  const { $, html, document, fixture, remote, requests, intervals, downloads, click, select, refresh, exportJSON } = ui;
  const jet = fixture.get('data/market.json'), brent = fixture.get('data/brent.json'), fx = fixture.get('data/fx.json');

  await t.test('published prices retain their original units and observation dates', async () => {
    assert.match(html, /src="\.\/observed-app\.js"/);
    assert.doesNotMatch(html, /src="\.\/(?:planner|planner-app|app)\.js"/);
    assert.equal($('#jet-value').textContent, `$${jet.latest.value.toFixed(3)}`);
    assert.equal($('#brent-value').textContent, `$${brent.latest.value.toFixed(2)}`);
    assert.equal($('#fx-value').textContent, fx.latest.rates.USD.toFixed(4));
    assert.ok($('#jet-date').textContent.includes(jet.latest.date));
    assert.match($('#jet-rows').textContent, /USD\/US gallon/);
    assert.match($('#brent-rows').textContent, /USD\/barrel/);
    assert.doesNotMatch($('#jet-rows').textContent, /tonne|USD\/t/);
    assert.ok($('#source-cards').textContent.includes(jet.fetchedAt));
    assert.ok($('#source-cards').textContent.includes(jet.latest.date));
    assert.match($('#source-cards').textContent, /Cadence:.*daily/);
    const exported = await exportJSON();
    const rawJet = exported.snapshots.find(r => r.sourceId === 'eia-usgc-jet-fuel-daily').snapshot;
    assert.deepEqual(rawJet.observations, jet.observations);
    assert.equal(Object.hasOwn(rawJet, 'conversion'), false, 'default export excludes modeled density conversion');
    assert.equal(Object.hasOwn(exported, 'baseInputs'), false);
    assert.equal(Object.hasOwn(exported, 'result'), false);
  });

  await t.test('airport markers describe sourced locations and never inherit benchmark prices', () => {
    const airports = fixture.get('data/airports.json').airports;
    assert.equal(document.querySelectorAll('#airport-nodes [data-airport]').length, airports.length);
    assert.equal(document.querySelectorAll('#atlas-map .route-line, #atlas-map .route-flow').length, 0);
    assert.equal($('#model-form'), null);
    assert.equal($('#total-cost'), null);
    assert.equal($('#optimize-button'), null);
    assert.equal($('#benchmark'), null);
    select('#airport-select', 'HKG');
    const hkg = airports.find(a => a.iata === 'HKG');
    assert.ok($('#airport-name').textContent.includes(hkg.name));
    assert.match($('#airport-coordinates').textContent, /22\.31184/);
    assert.match(document.querySelector('.airport-facts').textContent, /No verified quote/);
    assert.match(document.querySelector('.airport-facts').textContent, /No verified observation/);
    assert.doesNotMatch($('#atlas-map').textContent, /\$|\bt CAPACITY\b|\bt DEMAND\b/);
    click('#airport-nodes [data-airport="SIN"]');
    assert.match($('#map-status').textContent, /SIN.*no price or stock observation/);
    assert.equal(document.querySelector('a[href="./planner.html"]').textContent.includes('assumptions required'), true);
  });

  await t.test('airport quotes remain disconnected and published cadence stays distinct from the public chart', () => {
    assert.match($('#airport-api-status').textContent, /未连接/);
    assert.equal($('#live-provider').textContent, 'TradingView / OANDA CFDs');
    assert.equal($('#live-asof').textContent, '请查看图表内时间');
    assert.match(document.querySelector('.observed-disclosure').textContent, /not real-time airport quotes/);
    assert.match($('#ticker-values').textContent, /DAILY · REPORTING LAG/);
    assert.match($('#ticker-values').textContent, /MONTHLY/);
    assert.match($('#last-check').textContent, /Page checked:/);
    assert.equal(intervals.length, 1);
    assert.equal(intervals[0].delay, 60000);
  });

  await t.test('monthly JODI keeps reported zero, missing coverage and assessment code distinct', async () => {
    const jodi = fixture.get('data/jodi.json');
    assert.ok(jodi?.observations.length, 'verified JODI fixture exists');
    click('#tab-jodi');
    assert.equal($('#view-jodi').hidden, false);
    assert.match($('#jodi-rows').textContent, /KTONS/);
    assert.doesNotMatch($('#source-cards').textContent, /INVALID OBSERVATION DATE/);
    select('#jodi-country', 'HK');
    assert.match($('#jodi-rows').textContent, /unassessed/);
    click('#export-csv');
    const csv = await downloads.at(-1).blob.text();
    assert.match(csv, /"assessment_code"/);
    assert.match(csv, /"JETKERO"/);
    assert.match(csv, /"KTONS","3"/);
    const latestPeriod = $('#jodi-period').value;
    const zero = jodi.observations.find(row => row.value === 0);
    assert.ok(zero, 'fixture contains a source-reported zero');
    select('#jodi-period', zero.date);
    select('#jodi-country', zero.country);
    const zeroRow = [...document.querySelectorAll('#jodi-rows tr')].find(row => row.textContent.includes(zero.flow));
    assert.equal(zeroRow.querySelectorAll('td')[3].textContent, '0', 'reported zero remains a number');
    assert.equal($('#export-csv').disabled, false);
    select('#jodi-period', latestPeriod);
    const missing = ['CN', 'SG', 'TW'].find(country => !jodi.observations.some(r => r.date === $('#jodi-period').value && r.country === country));
    if (missing) {
      select('#jodi-country', missing);
      assert.match($('#jodi-rows').textContent, /Missing is not zero/);
      assert.equal($('#export-csv').disabled, true);
    }
    select('#jodi-country', 'all');
    click('#tab-jet');
  });

  await t.test('checking cached data never advances prices or their source timestamps', async () => {
    const originalPrice = $('#jet-value').textContent;
    const before = await exportJSON();
    const requestCount = requests.length;
    intervals[0].callback();
    await until(() => !$('#refresh-data').disabled);
    assert.ok(requests.length > requestCount);
    assert.equal($('#jet-value').textContent, originalPrice);
    assert.match($('#refresh-status').textContent, /Observation and collection dates have not been replaced by page time/);
    const after = await exportJSON();
    assert.deepEqual(after.snapshots, before.snapshots);
    assert.match($('#airport-api-status').textContent, /未连接/);
    const hiddenRequests = requests.length;
    Object.defineProperty(document, 'hidden', { configurable: true, value: true });
    intervals[0].callback();
    assert.equal(requests.length, hiddenRequests, 'hidden page does not poll');
    Object.defineProperty(document, 'hidden', { configurable: true, value: false });
  });

  await t.test('remote refresh uses main then feature and preserves collection-failure labels', async () => {
    remote.mode = 'feature';
    const catalog = remote.fixture.get('data/catalog.json');
    const feed = catalog.feeds.find(f => f.id === 'eia-usgc-jet-fuel-daily');
    feed.lastAttemptStatus = 'failed'; feed.error = 'Source timeout; previous observation retained';
    const start = requests.length;
    await refresh();
    const catalogRequests = requests.slice(start).filter(r => r.url.endsWith('/data/catalog.json'));
    assert.equal(catalogRequests.length, 2);
    assert.match(catalogRequests[0].url, /\/main\/dist\//);
    assert.match(catalogRequests[1].url, /\/codex\/complete-energy-model\/dist\//);
    assert.match($('#refresh-status').textContent, /retain cache/);
    assert.match($('#refresh-status').textContent, /main:.*HTTP 404/, 'feature fallback explains why the primary source was unavailable');
    assert.match($('#source-cards').textContent, /CACHED · COLLECTION FAILED/);
    assert.equal($('#jet-value').textContent, `$${jet.latest.value.toFixed(3)}`);
    assert.ok($('#source-cards').textContent.includes(jet.fetchedAt));
  });

  await t.test('timeouts and missing remote feeds recover to a complete bundled dataset', async () => {
    remote.mode = 'timeout';
    await refresh();
    assert.match($('#refresh-status').textContent, /bundled data retained/);
    assert.equal($('#refresh-data').disabled, false);
    remote.mode = 'feature';
    const removed = remote.fixture.get('data/fx.json');
    remote.fixture.delete('data/fx.json');
    await refresh();
    assert.match($('#refresh-status').textContent, /bundled data retained/);
    assert.ok([...document.querySelectorAll('.feed-meta')].every(el => el.textContent.includes('Bundled fallback')));
    remote.fixture.set('data/fx.json', removed);
    assert.match($('#airport-api-status').textContent, /未连接/);
  });

  await t.test('exports and navigation remain observation-only', async () => {
    click('#tab-airports'); click('#export-csv');
    const csv = await downloads.at(-1).blob.text();
    assert.match(csv, /"NO_VERIFIED_QUOTE"/);
    assert.doesNotMatch(csv, /allocation|savings|demand_t|procurement/i);
    click('#nav-data'); click('#nav-sources');
    assert.deepEqual(ui.scrolls, ['observations', 'data-sources']);
  });
});

test('unavailable observations remain missing, with no substituted benchmark or model output', async t => {
  const ui = await mount(t, { noData: true });
  assert.equal(ui.$('#jet-value').textContent, 'Unavailable');
  assert.equal(ui.$('#brent-value').textContent, 'Unavailable');
  assert.equal(ui.$('#fx-value').textContent, 'Unavailable');
  assert.equal(ui.$('#jodi-value').textContent, 'Unavailable');
  assert.equal(ui.document.querySelectorAll('#airport-nodes [data-airport]').length, 0);
  assert.match(ui.$('#refresh-status').textContent, /No verified source values/);
  assert.match(ui.$('#source-cards').textContent, /No invented prices/);
  assert.equal(ui.$('#export-csv').disabled, true);
  assert.equal(ui.$('#export-json').disabled, true);
  assert.match(ui.$('#airport-api-status').textContent, /未连接/);
  assert.equal(ui.$('#refresh-data').disabled, false);
});

test('public chart activity stays separate from airport observations and raw source exports', async t => {
  const ui = await mount(t);
  const { $, document, window, click, downloads, requests, exportJSON } = ui;
  const before = await exportJSON();
  click('#export-csv');
  const csvBefore = await downloads.at(-1).blob.text();
  const prices = ['jet', 'brent', 'fx'].map(key => $(`#${key}-value`).textContent);
  const sourceRequestCount = requests.length;
  const originalObserver = Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver');
  const originalTimeout = globalThis.setTimeout, originalClearTimeout = globalThis.clearTimeout;
  const timers = new Map(); let timerId = 0;
  globalThis.MutationObserver = window.MutationObserver;
  globalThis.setTimeout = (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; };
  globalThis.clearTimeout = id => timers.delete(id);
  t.after(() => {
    if (originalObserver) Object.defineProperty(globalThis, 'MutationObserver', originalObserver);
    else delete globalThis.MutationObserver;
    globalThis.setTimeout = originalTimeout; globalThis.clearTimeout = originalClearTimeout;
  });
  await import(`../dist/public-market.js?observed-export-isolation=${mountId}`);
  click('#public-brent');
  const frame = document.createElement('iframe');
  Object.defineProperty(frame, 'contentDocument', { get() { throw new Error('Host must not extract third-party quote values'); } });
  Object.defineProperty(frame, 'contentWindow', { get() { throw new Error('Host must not inspect third-party quote timestamps'); } });
  $('#public-market-chart .tradingview-widget-container__widget').append(frame);
  await new Promise(resolve => setImmediate(resolve));
  frame.dispatchEvent(new window.Event('load'));
  assert.equal($('#live-status').textContent, 'MARKET VIEW LOADED');
  assert.equal(requests.length, sourceRequestCount, 'chart selection never requests data through the snapshot collector');
  assert.deepEqual(['jet', 'brent', 'fx'].map(key => $(`#${key}-value`).textContent), prices);
  assert.match(document.querySelector('.airport-facts').textContent, /No verified quote/);
  assert.equal($('#optimize-button'), null);
  assert.equal($('#model-form'), null);
  const after = await exportJSON();
  assert.deepEqual(after.snapshots, before.snapshots);
  assert.deepEqual(after.catalog, before.catalog);
  assert.doesNotMatch(JSON.stringify(after), /OANDA:|WTICOUSD|BCOUSD|TradingView/);
  assert.equal(Object.hasOwn(after, 'baseInputs'), false);
  assert.equal(Object.hasOwn(after, 'result'), false);
  click('#export-csv');
  assert.equal(await downloads.at(-1).blob.text(), csvBefore);
  assert.equal($('#live-asof').textContent, '请查看图表内时间');
});

test('a transient main-source failure cannot roll current observations back or erase them', async t => {
  const advance = (date, ms) => new Date(Date.parse(date) + ms).toISOString();
  const ui = await mount(t, {
    mode: 'main',
    prepareRemote(snapshots) {
      const jet = snapshots.get('data/market.json');
      const date = advance(jet.latest.date, 86400000).slice(0, 10);
      const fetchedAt = advance(jet.fetchedAt, 3600000);
      jet.latest = { ...jet.latest, date, value: 7.123 };
      jet.observedAt = date;
      jet.fetchedAt = fetchedAt;
      jet.observations.push({ date, value: 7.123 });
      const catalog = snapshots.get('data/catalog.json');
      const feed = catalog.feeds.find(row => row.id === jet.source.id);
      Object.assign(feed, { observationDate: date, fetchedAt });
      catalog.generatedAt = fetchedAt;
    },
  });
  const { $, remote, requests, fixture, refresh, exportJSON } = ui;
  assert.equal($('#jet-value').textContent, '$7.123');
  assert.match($('#refresh-status').textContent, /Remote main snapshots/);
  assert.equal(requests.filter(row => row.url.endsWith('/data/catalog.json')).length, 1);
  const current = await exportJSON();
  const currentJet = current.snapshots.find(row => row.sourceId === 'eia-usgc-jet-fuel-daily').snapshot;
  const currentSnapshots = new Map([...remote.fixture].map(([path, data]) => [path, clone(data)]));
  remote.mode = 'feature';
  const candidate = () => new Map([...currentSnapshots].map(([path, data]) => [path, clone(data)]));
  const cases = [
    ['older observation even when its retrieval timestamp is newer', snapshots => {
      const old = clone(fixture.get('data/market.json'));
      old.fetchedAt = advance(currentJet.fetchedAt, 3600000);
      snapshots.set('data/market.json', old);
      const feed = snapshots.get('data/catalog.json').feeds.find(row => row.id === old.source.id);
      Object.assign(feed, { observationDate: old.latest.date, fetchedAt: old.fetchedAt });
    }],
    ['same observation with an older retrieval timestamp', snapshots => {
      const jet = snapshots.get('data/market.json');
      jet.fetchedAt = fixture.get('data/market.json').fetchedAt;
      snapshots.get('data/catalog.json').feeds.find(row => row.id === jet.source.id).fetchedAt = jet.fetchedAt;
    }],
    ['previously available source omitted from the catalog', snapshots => {
      const catalog = snapshots.get('data/catalog.json');
      catalog.feeds = catalog.feeds.filter(row => row.id !== 'ecb-reference-fx');
    }],
    ['previously available source changed to unavailable', snapshots => {
      const feed = snapshots.get('data/catalog.json').feeds.find(row => row.id === 'ecb-reference-fx');
      Object.assign(feed, { status: 'unavailable', path: null, fetchedAt: null, observationDate: null });
    }],
    ['empty catalog', snapshots => { snapshots.get('data/catalog.json').feeds = []; }],
    ['malformed catalog', snapshots => { snapshots.get('data/catalog.json').feeds = {}; }],
    ['payload from a different source', snapshots => { snapshots.get('data/market.json').source.id = 'eia-brent-daily'; }],
    ['payload with an incompatible unit', snapshots => { snapshots.get('data/market.json').source.unit = 'USD/tonne'; }],
    ['null observation row', snapshots => { snapshots.get('data/market.json').observations.push(null); }],
    ['malformed FX rates', snapshots => { snapshots.get('data/fx.json').latest.rates.USD = '1.2'; }],
    ['unrecognized monthly country code', snapshots => { snapshots.get('data/jodi.json').observations[0].country = 'ZZ'; }],
  ];
  for (const [name, corrupt] of cases) await t.test(name, async () => {
    remote.fixture = candidate();
    corrupt(remote.fixture);
    const beforeRequests = requests.length;
    await refresh();
    const catalogs = requests.slice(beforeRequests).filter(row => row.url.endsWith('/data/catalog.json'));
    assert.equal(catalogs.length, 3, 'main failure, invalid data branch and older bundled snapshot all checked');
    assert.equal($('#jet-value').textContent, '$7.123');
    assert.ok($('#jet-date').textContent.includes(currentJet.latest.date));
    assert.ok($('#source-cards').textContent.includes(currentJet.fetchedAt));
    assert.equal($('#refresh-status').classList.contains('error'), true);
    assert.match($('#refresh-status').textContent, /failed/i);
    assert.match($('#refresh-status').textContent, /retained/i);
    assert.match($('#refresh-status').textContent, /main:.*data branch:.*bundled:/);
    assert.equal($('#refresh-data').disabled, false);
    const retained = await exportJSON();
    assert.deepEqual(retained.snapshots, current.snapshots, 'all source observations and collection timestamps stay unchanged');
    assert.deepEqual(retained.catalog, current.catalog, 'failed candidate cannot partially mutate source metadata');
  });
  await t.test('a same-date source revision with a newer collection timestamp is accepted', async () => {
    remote.fixture = candidate();
    const jet = remote.fixture.get('data/market.json');
    jet.latest.value = 7.234;
    jet.observations.find(row => row.date === jet.latest.date).value = 7.234;
    jet.fetchedAt = advance(currentJet.fetchedAt, 3600000);
    const catalog = remote.fixture.get('data/catalog.json');
    catalog.generatedAt = jet.fetchedAt;
    catalog.feeds.find(row => row.id === jet.source.id).fetchedAt = jet.fetchedAt;
    await refresh();
    assert.equal($('#jet-value').textContent, '$7.234');
    assert.equal($('#refresh-status').classList.contains('error'), false);
    assert.match($('#refresh-status').textContent, /Remote data-branch snapshots/);
    assert.match($('#refresh-status').textContent, /main:.*HTTP 404/);
    const revised = (await exportJSON()).snapshots.find(row => row.sourceId === jet.source.id).snapshot;
    assert.equal(revised.latest.date, currentJet.latest.date);
    assert.equal(revised.fetchedAt, jet.fetchedAt);
    assert.equal(revised.latest.value, 7.234);
  });
});
