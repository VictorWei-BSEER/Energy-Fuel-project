import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import vm from 'node:vm';
import { parseHTML } from 'linkedom';
import { scopeResearchCss } from '../scripts/build-workspace.mjs';

const [html, exhibit] = await Promise.all([
  readFile(new URL('../dist/index.html', import.meta.url), 'utf8'),
  readFile(new URL('../dist/research/index.html', import.meta.url), 'utf8'),
]);
let instance = 0;
async function mount(t, hash = '') {
  const { document, window } = parseHTML(html);
  const globals = new Map();
  for (const [key, value] of Object.entries({ window, document, CustomEvent: window.CustomEvent })) {
    globals.set(key, Object.getOwnPropertyDescriptor(globalThis, key));
    Object.defineProperty(globalThis, key, { value, writable: true, configurable: true });
  }
  window.location = { hash };
  window.scrollY = 0;
  const history = [], focused = [], scrolled = [];
  window.history = { scrollRestoration: 'auto', pushState: (_, __, url) => { history.push(url); window.location.hash = url; } };
  window.scrollTo = ({ top }) => { window.scrollY = top; };
  window.HTMLElement.prototype.focus = function () { focused.push(this.id); };
  window.HTMLElement.prototype.scrollIntoView = function () { scrolled.push(this.id); };
  t.after(() => {
    for (const [key, descriptor] of globals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  await import(`../dist/workspace.js?unified-test=${++instance}`);
  const $ = selector => document.querySelector(selector);
  const click = selector => $(selector).dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true }));
  const visible = () => [...document.querySelectorAll('.workspace-panel')].filter(panel => !panel.hidden).map(panel => panel.id);
  return { $, document, window, click, visible, history, focused, scrolled };
}

test('all five product views share one mounted shell and preserve independent form state', async t => {
  const ui = await mount(t);
  const { $, document, window, click, visible } = ui;
  assert.deepEqual([...document.querySelectorAll('[data-workspace]')].map(tab => tab.dataset.workspace),
    ['calculations', 'oil-markets', 'research', 'briefing', 'sources']);
  assert.equal(document.querySelectorAll('.topbar').length, 1);
  assert.equal(document.querySelectorAll('.workspace-navigation').length, 1);
  assert.ok(document.querySelector('main').lastElementChild.classList.contains('site-footer'), 'the shared footer follows every mounted panel');
  assert.equal(document.querySelector('#workspace-research iframe'), null);
  assert.equal(document.querySelector('#workspace-research .masthead'), null);
  const plannerChildren = [...document.querySelector('#planner').children];
  assert.ok(plannerChildren.indexOf(document.querySelector('#rotation')) < plannerChildren.indexOf(document.querySelector('.workspace-grid')), 'route inputs precede the map in reading and keyboard order');
  const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
  assert.equal(new Set(ids).size, ids.length);
  const field = $('#initial-fuel');
  assert.ok(field, 'flight input remains in the shared document');
  field.value = '23.5';
  window.scrollY = 160;
  click('#workspace-tab-research');
  assert.deepEqual(visible(), ['workspace-research']);
  $('#duration').value = '6.5';
  const researchForm = $('#scenario-form');
  window.scrollY = 750;
  click('#workspace-tab-briefing');
  assert.deepEqual(visible(), ['workspace-briefing']);
  click('#workspace-tab-research');
  assert.equal($('#scenario-form'), researchForm);
  assert.equal($('#duration').value, '6.5');
  assert.equal(window.scrollY, 750);
  click('#workspace-tab-calculations');
  assert.equal($('#initial-fuel'), field);
  assert.equal(field.value, '23.5');
  assert.equal(window.scrollY, 160);
});

test('research deep links, internal references and browser history select the right mounted panel', async t => {
  const ui = await mount(t, '#research/essay');
  const { $, document, window, click, visible, scrolled, focused } = ui;
  assert.deepEqual(visible(), ['workspace-research']);
  assert.deepEqual(scrolled, ['essay']);
  assert.equal(document.title, '研究报告 — 燃油图谱');
  click('#workspace-research a[href="#research/methods"]');
  assert.equal(window.location.hash, '#research/methods');
  assert.equal(focused.at(-1), 'methods');
  assert.equal(scrolled.at(-1), 'methods');
  click('#workspace-tab-briefing');
  window.location.hash = '#research/essay';
  window.dispatchEvent(new window.Event('popstate'));
  assert.deepEqual(visible(), ['workspace-research']);
  assert.equal(scrolled.at(-1), 'essay');
  assert.equal($('#workspace-tab-research').getAttribute('aria-selected'), 'true');
  window.location.hash = '#briefing/guide-data-title';
  window.dispatchEvent(new window.Event('popstate'));
  assert.deepEqual(visible(), ['workspace-briefing']);
  assert.equal(scrolled.at(-1), 'guide-data-title');
  assert.equal(document.querySelectorAll('[role="tab"][tabindex="0"]').length, 1);
});

test('keyboard roving navigation covers research and model guide without changing tab semantics', async t => {
  const ui = await mount(t, '#research');
  const key = (id, value) => {
    const event = new ui.window.Event('keydown', { bubbles: true, cancelable: true });
    event.key = value; ui.$(id).dispatchEvent(event);
  };
  key('#workspace-tab-research', 'ArrowRight');
  assert.deepEqual(ui.visible(), ['workspace-briefing']);
  assert.equal(ui.focused.at(-1), 'workspace-tab-briefing');
  key('#workspace-tab-briefing', 'End');
  assert.deepEqual(ui.visible(), ['workspace-sources']);
  key('#workspace-tab-sources', 'Home');
  assert.deepEqual(ui.visible(), ['workspace-calculations']);
});

test('legacy research URLs redirect only hosted entry requests and preserve section hashes', () => {
  const script = exhibit.match(/<!-- WORKSPACE-ENTRY:START -->[\s\S]*?<script>([\s\S]*?)<\/script>/)[1];
  const run = href => {
    const current = new URL(href), redirects = [];
    vm.runInNewContext(script, { URL, URLSearchParams,
      location: { protocol: current.protocol, href, hash: current.hash, search: current.search, replace: value => redirects.push(value) } });
    return redirects;
  };
  assert.deepEqual(run('https://fuel.example/research/#essay'), ['https://fuel.example/index.html#research/essay']);
  assert.deepEqual(run('https://fuel.example/research/'), ['https://fuel.example/index.html#research']);
  assert.deepEqual(run('https://fuel.example/research/?standalone#essay'), []);
  assert.deepEqual(run('file:///tmp/exhibit/index.html#essay'), []);
});

test('embedded research preserves frozen content and rebases local download/figure links', async () => {
  const app = parseHTML(html).document, source = parseHTML(exhibit).document;
  assert.equal(app.querySelector('#research-data').textContent, source.querySelector('#research-data').textContent);
  assert.equal(app.querySelector('#essay-content').textContent, source.querySelector('#essay-content').textContent);
  for (const node of app.querySelectorAll('#workspace-research [href], #workspace-research [src]')) {
    const value = node.getAttribute('href') || node.getAttribute('src');
    if (value.startsWith('#')) assert.ok(value.startsWith('#research/') || /^#(?:calculations|sources)$/.test(value));
    if (value.startsWith('./')) {
      assert.ok(value.startsWith('./research/'));
      await access(new URL(`../dist/${value.slice(2).split(/[?#]/)[0]}`, import.meta.url));
    }
  }
});

test('research CSS isolation scopes resets, media rules and selector lists without a global page rule', () => {
  const css = scopeResearchCss(':root { --ink: blue; } body { margin: 0; } h1, a:not(.quiet, .muted) { color: red; } @media print { @page { margin: 5mm; } p { color: black; } }');
  assert.match(css, /#workspace-research \{ --ink: blue;/);
  assert.match(css, /#workspace-research h1, #workspace-research a:not\(\.quiet, \.muted\)/);
  assert.match(css, /@media print \{\s*#workspace-research p/);
  assert.doesNotMatch(css, /@page|(?:^|})\s*(?:body|h1|p)\s*\{/);
  assert.throws(() => scopeResearchCss('@font-face { font-family: leak; }'), /Unsupported global/);
});
