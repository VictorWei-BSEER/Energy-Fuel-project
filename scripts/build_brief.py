#!/usr/bin/env python3
"""Build the bilingual model guide and its portable print views.

python3 scripts/build_brief.py
python3 scripts/build_brief.py --check
python3 scripts/build_brief.py --pdf --chromium /absolute/path/to/chromium

HTML and Markdown generation uses stdlib only. Optional PDFs use the project's
Playwright dependency and an installed Chromium binary. Rendering loads only
an owned loopback preview. No browser or package is installed by this script.
"""
from __future__ import annotations
import argparse
from functools import partial
import hashlib
import html
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import re
import shutil
import subprocess
import threading

ROOT = Path(__file__).resolve().parents[1]
BRIEF = ROOT / 'dist/brief'
ORIGIN = 'https://fuel-atlas-east-asia.victorskwei.chatgpt.site/'
LEGACY = ('Fuel_Atlas_Decision_Brief.pdf', 'Fuel_Atlas_Decision_Brief.md')

def messages():
    raw = (ROOT / 'dist/locales/guide.js').read_text()
    return json.loads(raw.split('export const guideMessages = ', 1)[1].rsplit(';', 1)[0])

def localize(fragment, language):
    catalog = messages()
    pattern = r'(<([a-z0-9]+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([^<]*)(</\2>)'
    def replace(match):
        if match.group(3) not in catalog:
            raise ValueError(f'Missing guide message {match.group(3)}')
        return match.group(1) + html.escape(catalog[match.group(3)][language]) + match.group(5)
    rendered = re.sub(pattern, replace, fragment)
    rendered = rendered.replace('aria-label="Model guide downloads"',
                                'aria-label="使用说明下载"' if language == 'zh' else 'aria-label="Model guide downloads"')
    rendered = re.sub(r'href="#(model|calculations|research|sources|data(?:/data-source-plan)?)"',
                      lambda m: f'href="{ORIGIN}#{m.group(1)}"', rendered)
    rendered = rendered.replace('href="./brief/', 'href="./')
    if language == 'zh':
        rendered = rendered.replace('href="./print.html"', 'href="./print-zh.html"')
    return rendered

def outputs():
    fragment = (BRIEF / 'brief.html').read_text()
    css = (BRIEF / 'brief.css').read_text()
    print_css = '''
@page { size: A4; margin: 15mm 16mm 16mm; }
body { margin: 0; background: white; color: #142b46; font-family: Arial,"Noto Sans CJK SC",sans-serif; }
.print-page { max-width: 1120px; padding: 28px; margin: 0 auto; }
.print-language { max-width: 1120px; margin: 20px auto 0; padding: 0 28px; font: 14px/1.5 Arial,sans-serif; }
.print-language a { color: #0057b8; margin-right: 20px; }
@media print {
  .print-language { display: none; }
  .print-page { max-width: none; padding: 0; }
  .project-brief-content { font-size: 9.5pt; line-height: 1.5; }
  .project-brief-content h1 { font-size: 23pt; letter-spacing: -.5px; }
  .project-brief-content h2 { font-size: 14pt; }
  .project-brief-content .brief-heading { display: block; padding: 0 0 14px; }
  .project-brief-content .brief-deck { font-size: 11pt; margin-top: 10px; }
  .project-brief-content .brief-eyebrow { font-size: 8pt; }
  .project-brief-content .guide-scenario { padding: 11px 15px; margin: 16px 0; break-inside: avoid; }
  .project-brief-content .guide-scenario h2 { font-size: 11pt; }
  .project-brief-content .guide-steps { margin-bottom: 16px; }
  .project-brief-content .guide-steps > li { padding: 12px 0; grid-template-columns: 25px minmax(0,1fr); gap: 12px; break-inside: avoid; }
  .project-brief-content .guide-steps h2 { font-size: 12pt; margin-bottom: 7px; }
  .project-brief-content .guide-step-number { width: 23px; height: 23px; font-size: 10pt; }
  .project-brief-content .brief-value { padding: 12px 16px; margin: 0 0 16px; break-inside: avoid; }
  .project-brief-content .brief-value h2 { margin-bottom: 8px; }
  .project-brief-content .brief-section { padding: 16px 0; }
  .project-brief-content section[aria-labelledby="guide-data-title"] { break-before: page; }
  .project-brief-content .brief-section > h2 { margin-bottom: 12px; break-after: avoid; }
  .project-brief-content table { font-size: 8.5pt; line-height: 1.45; }
  .project-brief-content caption, .project-brief-content thead th { font-size: 8pt; }
  .project-brief-content th, .project-brief-content td { padding: 8px 10px; }
  .project-brief-content tbody th { width: 23%; min-width: 100px; }
  .project-brief-content caption { padding: 7px 10px; }
  .project-brief-content tr { break-inside: avoid; }
  .project-brief-content .brief-footer { padding: 12px 0 0; font-size: 8pt; }
}
'''
    built = {}
    for language in ('en', 'zh'):
        title = 'Fuel Atlas — Method' if language == 'en' else '燃油图谱计算方法'
        page = '<!doctype html>\n<html lang="' + ('zh-Hans' if language == 'zh' else 'en') + '"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#ffffff"><title>' + title + '</title><style>\n' + css + print_css + '\n</style></head><body><nav class="print-language" aria-label="Language"><a href="./print.html" lang="en">English</a><a href="./print-zh.html" lang="zh-Hans">中文</a></nav><main class="print-page">' + localize(fragment, language) + '</main></body></html>\n'
        built[BRIEF / ('print.html' if language == 'en' else 'print-zh.html')] = page.encode()
    built[BRIEF / 'downloads/Fuel_Atlas_Model_Guide.md'] = (ROOT / 'docs/decision-brief.md').read_bytes()
    sources = ['dist/brief/brief.html', 'dist/brief/brief.css', 'dist/locales/guide.js', 'docs/decision-brief.md', 'scripts/build_brief.py']
    manifest = {
        'publicationDate': '2026-11-13', 'timezone': 'UTC+8',
        'languages': ['en', 'zh-Hans'], 'type': 'model_guide',
        'sourceFiles': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in sources},
        'printViews': ['print.html', 'print-zh.html'],
        'pdfFiles': ['Fuel_Atlas_Model_Guide_EN.pdf', 'Fuel_Atlas_Model_Guide_ZH.pdf'],
        'pdfNote': 'PDFs render the corresponding print views. Source hashes identify the content.'
    }
    built[BRIEF / 'downloads/brief-source-manifest.json'] = (json.dumps(manifest, indent=2) + '\n').encode()
    return built

def render_pdfs(executable):
    renderer = '''
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({executablePath:process.argv[1], headless:true, args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    await page.route(/^https?:/, route => new URL(route.request().url()).origin === new URL(process.argv[2]).origin ? route.continue() : route.abort());
    for (const [view, filename] of [['print.html','Fuel_Atlas_Model_Guide_EN.pdf'],['print-zh.html','Fuel_Atlas_Model_Guide_ZH.pdf']]) {
      await page.goto(new URL(view,process.argv[2]).href,{waitUntil:'load'});
      await page.pdf({path:require('path').join(process.argv[3],filename),format:'A4',printBackground:true,preferCSSPageSize:true,tagged:true});
    }
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exit(1); });
'''
    server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(BRIEF)))
    threading.Thread(target=server.serve_forever, daemon=True).start()
    try:
        url = f'http://127.0.0.1:{server.server_port}/'
        subprocess.run(['node', '-e', renderer, executable, url, str(BRIEF / 'downloads')],
                       cwd=ROOT, check=True, timeout=60)
    finally:
        server.shutdown(); server.server_close()
    for language in ('EN', 'ZH'):
        target = BRIEF / f'downloads/Fuel_Atlas_Model_Guide_{language}.pdf'
        if not target.is_file() or not target.read_bytes().startswith(b'%PDF-'):
            raise SystemExit(f'Missing PDF output {target}')
        print(f'Rendered {target.relative_to(ROOT)}')

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--pdf', action='store_true')
    parser.add_argument('--chromium', help='Path to an installed Chromium binary')
    args = parser.parse_args()
    for path, data in outputs().items():
        if args.check:
            if not path.is_file() or path.read_bytes() != data:
                raise SystemExit(f'Outdated generated guide asset: {path.relative_to(ROOT)}')
        else:
            path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
    for name in LEGACY:
        old = BRIEF / 'downloads' / name
        if args.check and old.exists():
            raise SystemExit(f'Legacy brief remains: {old.relative_to(ROOT)}')
        if not args.check: old.unlink(missing_ok=True)
    if args.pdf:
        executable = args.chromium or shutil.which('chromium') or shutil.which('google-chrome')
        if not executable: raise SystemExit('Pass --chromium with an installed browser path.')
        render_pdfs(executable)
    print('Model guide assets match.' if args.check else 'Built bilingual model guide assets.')

if __name__ == '__main__':
    main()
