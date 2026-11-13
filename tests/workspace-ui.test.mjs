import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseHTML } from 'linkedom';

let mountId = 0;
async function mount(t, hash = '') {
  const html = await readFile(new URL('../dist/network.html', import.meta.url), 'utf8');
  const { document, window } = parseHTML(html);
  const originals = new Map();
  for (const [name, value] of Object.entries({ document, window, CustomEvent: window.CustomEvent })) {
    originals.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
    Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
  }
  let focused = null;
  window.HTMLElement.prototype.focus = function () { focused = this.id; };
  window.location = { hash };
  const history = [];
  window.history = { pushState: (_state, _unused, url) => { history.push(url); window.location.hash = url; } };
  window.scrollTo = () => {};
  t.after(() => {
    for (const [name, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  });
  await import(`../dist/workspace.js?workspace-test=${++mountId}`);
  const $ = selector => document.querySelector(selector);
  const click = selector => $(selector).dispatchEvent(new window.Event('click', { bubbles: true }));
  const key = (name, key) => {
    const event = new window.Event('keydown', { bubbles: true, cancelable: true });
    event.key = key;
    $(`#workspace-tab-${name}`).dispatchEvent(event);
  };
  const visible = () => [...document.querySelectorAll('.workspace-panel')].filter(panel => !panel.hidden).map(panel => panel.id);
  return { $, document, window, history, click, key, visible, focused: () => focused };
}

test('top workspaces preserve calculation inputs and independent result views', async t => {
  const ui = await mount(t);
  const { $, document, click, visible } = ui;
  assert.deepEqual(visible(), ['workspace-calculations']);
  assert.equal(document.querySelector('.rail'), null);
  const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
  assert.equal(new Set(ids).size, ids.length, 'merged workspaces have unique control IDs');
  $('#horizon').value = '7';
  $('#price-curve').value = '800, 810, 820, 830, 840, 850, 860';
  $('#tab-inventory').setAttribute('aria-selected', 'true');
  $('#view-inventory').hidden = false;
  $('#view-movements').hidden = true;
  click('#workspace-tab-oil-markets');
  assert.deepEqual(visible(), ['workspace-oil-markets']);
  assert.equal($('#public-market').closest('.workspace-panel').id, 'workspace-oil-markets');
  click('#workspace-tab-sources');
  assert.deepEqual(visible(), ['workspace-sources']);
  for (const selector of ['#observed-source-cards', '#observations', '#observed-atlas-map', '#source-cards']) {
    assert.equal($(selector).closest('.workspace-panel').id, 'workspace-sources');
  }
  click('#workspace-tab-calculations');
  assert.equal($('#horizon').value, '7');
  assert.equal($('#price-curve').value, '800, 810, 820, 830, 840, 850, 860');
  assert.equal($('#view-inventory').hidden, false, 'result selection survives workspace changes');
  assert.equal($('#view-movements').hidden, true);
  assert.equal($('#view-jet').hidden, false, 'observation views remain independent');
  assert.deepEqual(ui.history, ['#oil-markets', '#sources', '#calculations']);
  click('[data-open-workspace="sources"]');
  assert.deepEqual(visible(), ['workspace-sources']);
  assert.equal(ui.focused(), 'workspace-tab-sources');
});

test('workspace deep links, browser history and keyboard navigation select accessible tabs', async t => {
  const ui = await mount(t, '#sources');
  const { $, document, window, key, visible } = ui;
  assert.deepEqual(visible(), ['workspace-sources']);
  key('sources', 'ArrowRight');
  assert.deepEqual(visible(), ['workspace-oil-markets']);
  assert.equal(ui.focused(), 'workspace-tab-oil-markets');
  key('oil-markets', 'End');
  assert.deepEqual(visible(), ['workspace-sources']);
  key('sources', 'Home');
  key('oil-markets', 'ArrowRight');
  assert.deepEqual(visible(), ['workspace-calculations']);
  const tabbable = [...document.querySelectorAll('[data-workspace]')].filter(tab => tab.getAttribute('tabindex') === '0');
  assert.equal(tabbable.length, 1);
  assert.equal(tabbable[0].getAttribute('aria-selected'), 'true');
  window.location.hash = '#sources';
  window.dispatchEvent(new window.Event('popstate'));
  assert.deepEqual(visible(), ['workspace-sources']);
  assert.equal($('#workspace-tab-sources').getAttribute('aria-selected'), 'true');
  const legacy = await readFile(new URL('../dist/planner.html', import.meta.url), 'utf8');
  assert.match(legacy, /url=\.\/index\.html#model/);
});
