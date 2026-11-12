import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { parseHTML } from 'linkedom';
import { transform } from 'esbuild';

const root = fileURLToPath(new URL('../', import.meta.url));
const read = path => readFile(resolve(root, path), 'utf8');

// Scope the standalone exhibit's rules at build time. Splitting selectors only
// outside strings/brackets keeps :is(), :not() and attribute selectors intact.
function splitSelectors(text) {
  const parts = []; let start = 0, depth = 0, quote = '';
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) { parts.push(text.slice(start, i)); start = i + 1; }
  }
  parts.push(text.slice(start));
  return parts.map(part => part.trim()).filter(Boolean);
}

export function scopeResearchCss(css, scope = '#workspace-research') {
  css = css.replace(/\/\*[\s\S]*?\*\//g, '');
  let output = '', cursor = 0;
  while (cursor < css.length) {
    const open = css.indexOf('{', cursor);
    if (open < 0) { if (css.slice(cursor).trim()) throw new Error('Unsupported CSS outside a rule'); break; }
    const selector = css.slice(cursor, open).trim();
    let depth = 1, quote = '', end = open + 1;
    for (; end < css.length && depth; end++) {
      const char = css[end];
      if (quote) { if (char === '\\') end++; else if (char === quote) quote = ''; continue; }
      if (char === '"' || char === "'") quote = char;
      else if (char === '{') depth++;
      else if (char === '}') depth--;
    }
    if (depth) throw new Error('Unclosed research CSS rule');
    const body = css.slice(open + 1, end - 1);
    if (/^@(?:media|supports|container|layer)\b/.test(selector)) {
      output += `${selector} {\n${scopeResearchCss(body, scope)}\n}\n`;
    } else if (/^@page\b/.test(selector)) {
      // Page margins belong to the standalone report, not the entire app.
    } else if (selector.startsWith('@')) {
      throw new Error(`Unsupported global research CSS rule: ${selector}`);
    } else {
      const scoped = splitSelectors(selector).map(part =>
        /^(?:html|body|:root)$/.test(part) ? scope : `${scope} ${part}`);
      output += `${scoped.join(', ')} {${body}}\n`;
    }
    cursor = end;
  }
  return output;
}

function embedResearch(html) {
  const { document } = parseHTML(html);
  const main = document.querySelector('main');
  const navigation = document.querySelector('.section-nav');
  const data = document.querySelector('#research-data');
  if (!main || !navigation || !data) throw new Error('Research exhibit is missing required content');
  const fragment = document.createElement('div');
  fragment.className = 'research-content';
  fragment.innerHTML = navigation.outerHTML + main.innerHTML + data.outerHTML;
  for (const node of fragment.querySelectorAll('[href], [src]')) {
    for (const attribute of ['href', 'src']) {
      const value = node.getAttribute(attribute);
      if (!value) continue;
      if (value.startsWith('#')) node.setAttribute(attribute, `#research/${value.slice(1)}`);
      else if (value.startsWith('./')) node.setAttribute(attribute, `./research/${value.slice(2)}`);
      else if (value.startsWith('../index.html')) node.setAttribute(attribute, value.split('#')[1] ? `#${value.split('#')[1]}` : '#calculations');
    }
  }
  return fragment.outerHTML;
}

export async function composeWorkspace({ check = false } = {}) {
  const [template, research, css, brief, fuelData, sources] = await Promise.all([
    read('src/workspace/index.template.html'), read('dist/research/index.html'),
    read('dist/research/research.css'), read('dist/brief/brief.html'),
    read('dist/data-view/panel.html'), read('dist/data-view/sources.html'),
  ]);
  for (const marker of ['<!-- WORKSPACE:RESEARCH -->', '<!-- WORKSPACE:BRIEF -->', '<!-- WORKSPACE:DATA -->', '<!-- WORKSPACE:SOURCES -->']) {
    if (template.split(marker).length !== 2) throw new Error(`Expected one ${marker} marker`);
  }
  const html = template.replace('<!-- WORKSPACE:RESEARCH -->', embedResearch(research))
    .replace('<!-- WORKSPACE:BRIEF -->', brief.trim())
    .replace('<!-- WORKSPACE:DATA -->', fuelData.trim())
    .replace('<!-- WORKSPACE:SOURCES -->', sources.trim());
  const { document } = parseHTML(html);
  const ids = [...document.querySelectorAll('[id]')].map(node => node.id);
  if (ids.length !== new Set(ids).size) throw new Error('Composed workspace has duplicate IDs');
  const transformed = await transform(scopeResearchCss(css), { loader: 'css', target: ['es2022'] });
  if (transformed.warnings.length) throw new Error(JSON.stringify(transformed.warnings));
  const outputs = new Map([
    ['dist/index.html', html],
    ['dist/research/research-embedded.css', '/* Generated by scripts/build-workspace.mjs. Do not edit. */\n' + transformed.code],
  ]);
  for (const [path, content] of outputs) {
    if (check) {
      if (await read(path) !== content) throw new Error(`${path} is stale; run npm run build:workspace`);
    } else await writeFile(resolve(root, path), content);
  }
  console.log(`Unified workspace ${check ? 'verified' : 'built'}: five mounted panels; research CSS isolated.`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await composeWorkspace({ check: process.argv.includes('--check') });
}
