import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

// The third-party chart is not executed. These tests cover the host's official
// widget configuration and lifecycle, not actual provider availability or prices.
let mountId = 0;
const officialScript = 'https://s3.tradingview.com/external-embedding/embed-widget-advanced-chart.js';
const flush = () => new Promise(resolve => setImmediate(resolve));
async function mount(t) {
  const html = await readFile(new URL('../dist/index.html', import.meta.url), 'utf8');
  const { document, window } = parseHTML(html);
  const originals = new Map(), timers = new Map();
  let timerId = 0, quoteRequests = 0;
  const setGlobal = (name, value) => {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  };
  setGlobal('window', window); setGlobal('document', document);
  setGlobal('MutationObserver', window.MutationObserver);
  setGlobal('setTimeout', (callback, delay) => { const id = ++timerId; timers.set(id, { callback, delay }); return id; });
  setGlobal('clearTimeout', id => timers.delete(id));
  setGlobal('fetch', () => { quoteRequests++; throw new Error('Display widget must not fetch or scrape quote data'); });
  setGlobal('WebSocket', class { constructor() { quoteRequests++; throw new Error('No direct market-data connection is configured'); } });
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  await import(`../dist/public-market.js?dom-market=${++mountId}`);
  await flush();
  const $ = selector => document.querySelector(selector);
  const emit = (target, type, key) => {
    if (typeof target === 'string') target = $(target);
    const event = new window.Event(type, { bubbles: true, cancelable: true });
    if (key) Object.defineProperty(event, 'key', { value: key });
    target.dispatchEvent(event);
  };
  const script = () => $('#public-market-chart script');
  const config = () => JSON.parse(script().textContent);
  const addFrame = async () => {
    const frame = document.createElement('iframe');
    frame.src = 'https://www.tradingview-widget.com/embed-widget/advanced-chart/';
    for (const name of ['contentDocument', 'contentWindow']) Object.defineProperty(frame, name, {
      configurable: true, get() { throw new Error('Host must not inspect cross-origin chart contents'); },
    });
    $('#public-market-chart .tradingview-widget-container__widget').append(frame);
    await flush();
    return frame;
  };
  const expire = () => {
    const pending = [...timers].find(([, timer]) => timer.delay === 15000);
    assert.ok(pending, 'chart has a bounded loading timeout');
    timers.delete(pending[0]); pending[1].callback();
  };
  const assertNoQuoteClaim = () => {
    assert.doesNotMatch($('#live-status').textContent, /CONNECTED|REAL.?TIME|LIVE QUOTE/i);
    assert.equal($('#live-asof').textContent, '请查看图表内时间');
    assert.doesNotMatch($('#live-asof').textContent, /\d{4}-\d\d-\d\d|\d\d:\d\d/);
    assert.match($('#airport-api-status').textContent, /未连接/);
    assert.equal(quoteRequests, 0);
  };
  return { $, html, document, timers, emit, script, config, addFrame, expire, assertNoQuoteClaim };
}

test('public oil charts use the official widget without claiming independently verified quotes', async t => {
  const ui = await mount(t);
  const { $, html, document, timers, emit, script, config, addFrame, expire, assertNoQuoteClaim } = ui;

  await t.test('default WTI chart config identifies the CFD source and candle interval', () => {
    assert.match(html, /src="\.\/public-market\.js"/);
    assert.equal(script().src, officialScript);
    assert.equal(script().type, 'text/javascript');
    assert.equal(script().async, true);
    assert.deepEqual(config(), {
      autosize: true, symbol: 'OANDA:WTICOUSD', interval: '15', timezone: 'Asia/Shanghai',
      theme: 'light', style: '1', locale: 'zh_CN', allow_symbol_change: false,
      calendar: false, hide_side_toolbar: false, support_host: 'https://www.tradingview.com',
    });
    assert.equal($('#public-wti').getAttribute('aria-selected'), 'true');
    assert.equal($('#public-brent').getAttribute('aria-selected'), 'false');
    assert.equal($('#public-market-chart').getAttribute('aria-busy'), 'true');
    assert.equal($('#public-market-chart').dataset.loadStage, 'loading-script');
    assert.equal($('#live-status').textContent, 'LOADING CHART');
    assert.equal($('#public-market-retry').disabled, true);
    assert.equal(timers.size, 1);
    assert.match($('#public-market-description').textContent, /WTI.*CFD.*OANDA/);
    assert.match(document.querySelector('.public-market-instrument').textContent, /非交易所期货.*非航空燃油报价/);
    assert.match(document.querySelector('.public-market-disclosure').textContent, /15 分钟是 K 线周期，不是数据延迟/);
    assert.match(document.querySelector('.public-market-disclosure').textContent, /报价时间.*D 延迟标志.*休市/);
    assert.match(document.querySelector('.public-market-heading').textContent, /无需在本站创建账户/);
    assert.equal(document.querySelector('#public-market input'), null, 'public viewing does not request credentials');
    assertNoQuoteClaim();
  });

  await t.test('script and iframe events describe display progress only', async () => {
    emit(script(), 'load');
    assert.equal($('#live-status').textContent, 'LOADING MARKET VIEW');
    assert.equal($('#public-market-chart').dataset.loadStage, 'script-loaded');
    assert.equal($('#public-market-chart').getAttribute('aria-busy'), 'true');
    assertNoQuoteClaim();
    const frame = await addFrame();
    assert.equal($('#live-status').textContent, 'LOADING MARKET VIEW');
    assert.equal($('#public-market-chart').dataset.loadStage, 'frame-added');
    assert.match(frame.title, /TradingView.*WTI.*CFD/);
    assert.equal($('#public-market-retry').disabled, true);
    emit(frame, 'load');
    assert.equal($('#live-status').textContent, 'MARKET VIEW LOADED');
    assert.equal($('#public-market-chart').dataset.loadStage, 'frame-loaded');
    assert.match($('#public-market-message').textContent, /报价.*时间.*延迟.*休市/);
    assert.equal($('#public-market-chart').getAttribute('aria-busy'), 'false');
    assert.equal($('#public-market-retry').disabled, false);
    assert.equal(timers.size, 0);
    assertNoQuoteClaim();
  });

  await t.test('switching selects the precise Brent CFD and removes the prior chart', async () => {
    const oldScript = script(), oldFrame = $('#public-market-chart iframe');
    emit('#public-brent', 'click');
    await flush();
    assert.equal(config().symbol, 'OANDA:BCOUSD');
    assert.equal($('#public-market-symbol').textContent, 'OANDA:BCOUSD');
    assert.equal($('#public-wti').getAttribute('aria-selected'), 'false');
    assert.equal($('#public-brent').getAttribute('aria-selected'), 'true');
    assert.equal($('#public-market-chart').getAttribute('aria-labelledby'), 'public-brent');
    assert.equal(document.querySelectorAll('#public-market-chart script').length, 1);
    assert.equal(document.querySelectorAll('#public-market-chart iframe').length, 0);
    assert.equal(oldScript.isConnected, false);
    assert.equal(oldFrame.isConnected, false);
    const status = $('#live-status').textContent;
    emit(oldScript, 'error'); emit(oldFrame, 'load');
    assert.equal($('#live-status').textContent, status, 'events from the removed WTI chart are ignored');
    const activeScript = script();
    emit('#public-brent', 'click');
    assert.equal(script(), activeScript, 'reselecting the current instrument does not reload its script');
    assertNoQuoteClaim();
  });

  await t.test('script failure, timeout and frame failure retain honest fallback links and permit retry', async () => {
    emit(script(), 'error');
    assert.equal($('#live-status').textContent, 'DISPLAY UNCONFIRMED');
    assert.equal($('#public-market-chart').dataset.loadStage, 'error');
    assert.equal($('#public-market-retry').disabled, false);
    assert.equal(timers.size, 0);
    const first = script();
    emit('#public-market-retry', 'click');
    assert.notEqual(script(), first);
    assert.equal(config().symbol, 'OANDA:BCOUSD');
    assert.equal(document.querySelectorAll('#public-market-chart script').length, 1);
    assert.equal(timers.size, 1);
    expire();
    assert.equal($('#live-status').textContent, 'DISPLAY UNCONFIRMED');
    assert.equal($('#public-market-chart').dataset.loadStage, 'timeout');
    assert.match($('#public-market-message').textContent, /15 秒/);
    assert.equal($('#public-market-retry').disabled, false);
    emit(script(), 'load');
    assert.equal($('#live-status').textContent, 'DISPLAY UNCONFIRMED', 'late load cannot erase a timeout');
    emit('#public-market-retry', 'click');
    const frame = await addFrame();
    emit(frame, 'error');
    assert.equal($('#live-status').textContent, 'DISPLAY UNCONFIRMED');
    assert.equal($('#public-market-chart').dataset.loadStage, 'error');
    assert.equal($('#public-market-chart').getAttribute('aria-busy'), 'false');
    assert.equal($('#public-market-retry').disabled, false);
    assert.equal(timers.size, 0);
    const links = [...document.querySelectorAll('.public-market-fallback a')];
    assert.deepEqual(links.map(link => link.href), [
      'https://www.tradingview.com/symbols/WTICOUSD/?exchange=OANDA',
      'https://www.tradingview.com/symbols/BCOUSD/?exchange=OANDA',
    ]);
    for (const link of links) { assert.equal(link.target, '_blank'); assert.match(link.rel, /noopener/); }
    assert.ok(document.querySelector('.tradingview-widget-copyright a[href="https://www.tradingview.com/"]'));
    assertNoQuoteClaim();
  });

  await t.test('rapid switches and keyboard selection cannot revive stale chart callbacks', async () => {
    emit('#public-wti', 'click');
    const staleTimer = [...timers.values()][0].callback, staleScript = script();
    emit('#public-brent', 'click');
    const status = $('#live-status').textContent;
    staleTimer(); emit(staleScript, 'error');
    assert.equal($('#live-status').textContent, status);
    assert.equal(config().symbol, 'OANDA:BCOUSD');
    assert.equal(timers.size, 1);
    emit('#public-brent', 'keydown', 'Home');
    assert.equal(config().symbol, 'OANDA:WTICOUSD');
    emit('#public-wti', 'keydown', 'End');
    assert.equal(config().symbol, 'OANDA:BCOUSD');
    emit('#public-brent', 'keydown', 'ArrowLeft');
    assert.equal(config().symbol, 'OANDA:WTICOUSD');
    assert.equal(document.querySelectorAll('#public-market-chart script').length, 1);
    const frame = await addFrame(); emit(frame, 'load');
    assert.equal(timers.size, 0);
    assertNoQuoteClaim();
  });
});
