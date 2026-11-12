#!/usr/bin/env python3
"""Build a portable project-brief print view and downloadable evidence notes.

python3 scripts/build_brief.py
python3 scripts/build_brief.py --check
python3 scripts/build_brief.py --pdf --chromium /absolute/path/to/chromium

Only stdlib is needed for the HTML/Markdown build. Optional PDF rendering uses
the project's Playwright dependency and an already-installed Chromium binary;
it installs nothing and loads only the local print view. The print HTML contains
its CSS and uses local system fonts.
"""
from __future__ import annotations
import argparse
import hashlib
import html
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from html.parser import HTMLParser
from functools import partial
import json
from pathlib import Path
import re
import shutil
import subprocess
import threading

ROOT = Path(__file__).resolve().parents[1]
BRIEF = ROOT / 'dist/brief'
ORIGIN = 'https://fuel-atlas-east-asia.victorskwei.chatgpt.site/'

class Sources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.links = []
    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        link = values.get('href', '')
        if tag == 'a' and link.startswith('https://') and link not in self.links:
            self.links.append(link)

def outputs():
    fragment = (BRIEF / 'brief.html').read_text()
    css = (BRIEF / 'brief.css').read_text()
    sources = Sources(); sources.feed(fragment)
    # The embedded app owns these hashes. The print view links to that app,
    # never to nonexistent sections within this standalone document.
    fragment = re.sub(r'href="#(calculations|research|sources)"',
                      lambda m: f'href="{ORIGIN}#{m.group(1)}"', fragment)
    fragment = fragment.replace('href="./brief/', 'href="./').replace('<br>', ' ')
    source_notes = '<aside class="print-source-notes"><h2>Source links</h2><ol>' + ''.join(
        f'<li><a href="{html.escape(url, quote=True)}">{html.escape(url)}</a></li>' for url in sources.links
    ) + '</ol><p>Source pages checked 13 November 2026. Product descriptions are vendor statements. No affiliation or endorsement is implied.</p></aside>'
    print_css = '''
@page { size: A4; margin: 16mm 16mm 17mm; }
body { margin: 0; background: white; color: #142b46; font-family: Arial, sans-serif; }
.print-page { max-width: 1120px; padding: 28px; margin: 0 auto; }
.print-source-notes { border-top: 1px solid #d9e2ec; padding-top: 15px; font: 12px/1.5 Arial,sans-serif; color: #536b84; }
.print-source-notes h2 { font-size: 16px; color: #142b46; margin: 0 0 8px; }
.print-source-notes ol { padding-left: 18px; margin: 0 0 8px; }
.print-source-notes a { color: #0057b8; overflow-wrap: anywhere; }
@media print {
  .print-page { max-width: none; padding: 0; }
  .project-brief-content { font-size: 9.2pt; line-height: 1.5; }
  .project-brief-content h1 { font-size: 23pt; letter-spacing: -.7px; }
  .project-brief-content h2 { font-size: 14pt; }
  .project-brief-content h3 { font-size: 11pt; }
  .project-brief-content .brief-deck { font-size: 11pt; margin-top: 8px; }
  .project-brief-content .brief-heading { display: block; padding: 0 0 14px; }
  .project-brief-content .brief-status { margin-top: 12px; padding: 0 0 0 10px; }
  .project-brief-content .brief-status span, .project-brief-content .brief-status strong, .project-brief-content .brief-status small { display: inline; font-size: 9pt; margin-right: 8px; }
  .project-brief-content .brief-status br { display: none; }
  .project-brief-content .brief-thesis { padding: 16px 0; }
  .project-brief-content .brief-thesis h2 { margin-bottom: 8px; }
  .project-brief-content .brief-section { padding: 17px 0; }
  .project-brief-content .brief-section-heading { margin-bottom: 11px; }
  .project-brief-content .brief-callout { padding: 10px 13px; }
  .project-brief-content .brief-columns { display: block; }
  .project-brief-content .brief-columns > div { break-inside: avoid; }
  .project-brief-content .brief-columns > div + div { margin-top: 13px; }
  .project-brief-content section[aria-labelledby="brief-research-title"] { break-before: page; }
  .project-brief-content .brief-value { padding: 14px 17px; margin-bottom: 17px; break-inside: avoid; }
  .project-brief-content .brief-equation { font-size: 11pt; }
  .project-brief-content .brief-value h2 { margin-bottom: 8px; }
  .project-brief-content table { font-size: 9pt; }
  .project-brief-content caption, .project-brief-content thead th, .project-brief-content .brief-note { font-size: 8pt; }
  .project-brief-content th, .project-brief-content td { padding: 8px 10px; }
  .project-brief-content caption { padding: 7px 10px; }
  .project-brief-content .brief-pilot-grid { display: block; margin-top: 13px; }
  .project-brief-content .brief-pilot-grid article { margin-bottom: 12px; padding: 10px 13px; break-inside: avoid; }
  .project-brief-content .brief-pilot-grid p { font-size: 9pt; }
  .project-brief-content .brief-day { font-size: 8pt !important; margin-bottom: 5px; }
  .project-brief-content p + p { margin-top: 8px; }
  .project-brief-content .brief-next { display: block; padding: 12px; margin-top: 15px; break-inside: avoid; }
  .project-brief-content .brief-next strong { margin-right: 8px; }
  .project-brief-content .brief-footer { padding: 12px 0; font-size: 8pt; }
  .project-brief-content .brief-eyebrow { font-size: 8pt; margin-bottom: 7px; }
  .print-source-notes { font-size: 8pt; padding-top: 10px; break-inside: avoid; }
  .print-source-notes h2 { font-size: 11pt; }
}
'''
    page = '<!doctype html>\n<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#ffffff"><title>Fuel Atlas — Project decision brief</title><style>\n' + css + print_css + '\n</style></head><body><main class="print-page">' + fragment + source_notes + '</main></body></html>\n'
    notes = (ROOT / 'docs/decision-brief.md').read_bytes()
    manifest = {
        'publicationDate': '2026-11-13',
        'timezone': 'UTC+8',
        'classification': 'research_prototype_and_proposed_validation',
        'sourceFiles': {name: hashlib.sha256((ROOT / name).read_bytes()).hexdigest() for name in
                        ['dist/brief/brief.html', 'dist/brief/brief.css', 'docs/decision-brief.md', 'scripts/build_brief.py']},
        'externalSources': sources.links,
        'pdfNote': 'PDF is a rendering of print.html. Metadata may differ between Chromium versions; the reviewed source and its hashes define content provenance.'
    }
    return {BRIEF / 'print.html': page.encode(),
            BRIEF / 'downloads/Fuel_Atlas_Decision_Brief.md': notes,
            BRIEF / 'downloads/brief-source-manifest.json': (json.dumps(manifest, indent=2) + '\n').encode()}

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--pdf', action='store_true')
    parser.add_argument('--chromium', help='Path to an installed Chromium/Chrome binary')
    args = parser.parse_args()
    for path, data in outputs().items():
        if args.check:
            if not path.exists() or path.read_bytes() != data:
                raise SystemExit(f'Outdated or missing generated brief asset: {path.relative_to(ROOT)}')
        else:
            path.parent.mkdir(parents=True, exist_ok=True); path.write_bytes(data)
    if args.pdf:
        executable = args.chromium or shutil.which('chromium') or shutil.which('google-chrome')
        if not executable:
            raise SystemExit('PDF requires an installed Chromium binary; pass --chromium. No browser was installed.')
        target = BRIEF / 'downloads/Fuel_Atlas_Decision_Brief.pdf'
        renderer = '''
const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launch({executablePath:process.argv[1], headless:true, args:['--no-sandbox']});
  try {
    const page = await browser.newPage();
    await page.route(/^https?:/, route => new URL(route.request().url()).origin === new URL(process.argv[2]).origin ? route.continue() : route.abort());
    await page.goto(process.argv[2], {waitUntil:'load'});
    await page.pdf({path:process.argv[3], format:'A4', printBackground:true, preferCSSPageSize:true});
  } finally { await browser.close(); }
})().catch(error => { console.error(error.message); process.exit(1); });
'''
        # Use an owned loopback preview. Managed Chromium may deliberately
        # disable file://; local HTTP is the supported application preview.
        server = ThreadingHTTPServer(('127.0.0.1', 0), partial(SimpleHTTPRequestHandler, directory=str(BRIEF)))
        serving = threading.Thread(target=server.serve_forever, daemon=True)
        serving.start()
        try:
            url = f'http://127.0.0.1:{server.server_port}/print.html'
            subprocess.run(['node', '-e', renderer, executable, url, str(target)],
                           cwd=ROOT, check=True, timeout=60)
        finally:
            server.shutdown()
            server.server_close()
        if not target.is_file() or not target.read_bytes().startswith(b'%PDF-'):
            raise SystemExit('Chromium did not produce a valid PDF header.')
        print(f'Rendered {target.relative_to(ROOT)}')
    print('Brief source and generated assets match.' if args.check else 'Built standalone brief print view, Markdown and source manifest.')

if __name__ == '__main__':
    main()
