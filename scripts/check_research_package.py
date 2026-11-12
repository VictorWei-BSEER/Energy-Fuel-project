#!/usr/bin/env python3
"""Check the final research exhibit or its sealed ZIP using only the stdlib.

    python3 scripts/check_research_package.py
    python3 scripts/check_research_package.py --package artifacts/energy-security-project/submission-package.zip

The ZIP is inspected in memory, never extracted or executed. Static runtime
checks cover resource references and ordinary JavaScript network primitives;
they are not a browser test. PDFs receive signature, EOF, size and SHA checks;
their prose/layout is not parsed. DOCX and HTML essay text are checked directly.
"""
from __future__ import annotations

import argparse
from collections import Counter
import csv
import hashlib
from html.parser import HTMLParser
import io
import json
from pathlib import Path, PurePosixPath
import posixpath
import re
import sys
from urllib.parse import unquote, urlsplit
import xml.etree.ElementTree as ET
import zipfile

ROOT = Path(__file__).resolve().parents[1]
DOCUMENTS = ('Final_Project.pdf', 'Analytical_Reflection.pdf', 'Analytical_Reflection.docx')
FROZEN = ('research/inputs.json', 'research/model.py', 'research/results.json',
          'research/results.csv', 'research/sensitivity.csv', 'tests/test_research_model.py',
          'research/reviews/airport-source-snapshot.json')
VOID_TAGS = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link',
             'meta', 'param', 'source', 'track', 'wbr'}


class CheckError(Exception):
    pass


def require(condition, message):
    if not condition:
        raise CheckError(message)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def words(text):
    text = re.sub(r'\[(?:[0-9]+[a-z]?(?:\s*[,;–\-]\s*[0-9]+[a-z]?)*|S[0-9]+)\]', '', text)
    return len(re.findall(r"(?u)\b[^\W_]+(?:[.'’/\-][^\W_]+)*\b", text.replace('—', ' ').replace('–', ' ')))


def normalize(text):
    return ' '.join(text.split())


class Store:
    def __init__(self, root=None, entries=None):
        self.root, self.entries = root, entries
        self.exhibit = ('dist/research' if entries is None and (root / 'dist/research').is_dir()
                        else 'exhibit')

    def exists(self, name):
        return name in self.entries if self.entries is not None else (self.root / name).is_file()

    def read(self, name):
        require(self.exists(name), f'Missing required file: {name}')
        return self.entries[name] if self.entries is not None else (self.root / name).read_bytes()

    def text(self, name):
        return self.read(name).decode('utf-8')

    def json(self, name):
        return json.loads(self.read(name))

    def files(self, prefix):
        if self.entries is not None:
            return sorted(n for n in self.entries if n.startswith(prefix + '/'))
        return sorted(p.relative_to(self.root).as_posix() for p in (self.root / prefix).rglob('*') if p.is_file())


class Page(HTMLParser):
    def __init__(self, text):
        super().__init__(convert_charrefs=True)
        self.ids, self.duplicates = set(), set()
        self.workspace_routes = {}
        self.references, self.inline_scripts, self.inline_styles = [], [], []
        self.stack, self.text_by_id, self.script_type = [], {}, []
        self.module_scripts = 0
        self.has_base = False
        self.feed(text)

    def handle_starttag(self, tag, attributes):
        attrs = dict(attributes)
        identifier = attrs.get('id') or (attrs.get('name') if tag == 'a' else None)
        if identifier:
            if identifier in self.ids:
                self.duplicates.add(identifier)
            self.ids.add(identifier)
            self.text_by_id.setdefault(identifier, [])
        if tag == 'button' and attrs.get('role') == 'tab' and attrs.get('data-workspace'):
            self.workspace_routes[attrs['data-workspace']] = attrs.get('aria-controls')
        if tag == 'base':
            self.has_base = True
        if tag == 'script' and attrs.get('type', '').lower() == 'module':
            self.module_scripts += 1
        for attr in ('href', 'src', 'poster', 'data', 'action', 'xlink:href'):
            if attr in attrs:
                runtime = not (tag in ('a', 'area') and attr in ('href', 'xlink:href'))
                self.references.append((attrs[attr], runtime, f'<{tag} {attr}>'))
        if 'srcset' in attrs:
            for candidate in attrs['srcset'].split(','):
                if candidate.strip():
                    self.references.append((candidate.strip().split()[0], True, f'<{tag} srcset>'))
        if 'style' in attrs:
            self.inline_styles.append(attrs['style'])
        self.inline_scripts.extend(value for key, value in attrs.items() if key.startswith('on') and value)
        if tag not in VOID_TAGS:
            self.stack.append((tag, identifier, attrs.get('type', '').lower()))

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID_TAGS:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == tag:
                del self.stack[i:]
                return

    def handle_data(self, value):
        for _, identifier, _ in self.stack:
            if identifier:
                self.text_by_id[identifier].append(value)
        if self.stack:
            tag, _, kind = self.stack[-1]
            if tag == 'script' and kind != 'application/json':
                self.inline_scripts.append(value)
            elif tag == 'style':
                self.inline_styles.append(value)

    def element_text(self, identifier):
        require(identifier in self.text_by_id, f'HTML element #{identifier} is missing')
        return ''.join(self.text_by_id[identifier])


class Verifier:
    def __init__(self, store):
        self.store = store
        self.counts = Counter()
        self.pages = {}

    def page(self, name):
        if name not in self.pages:
            self.pages[name] = Page(self.store.text(name))
        return self.pages[name]

    def reference(self, source, value, runtime, context):
        value = value.strip()
        url = urlsplit(value)
        external = bool(url.scheme or url.netloc)
        if external:
            require(url.scheme != 'javascript', f'{source}: executable URL in {context}')
            if runtime:
                require(url.scheme == 'data', f'{source}: external runtime resource {value!r} in {context}')
            else:
                require(url.scheme in ('http', 'https', 'mailto', 'tel') or bool(url.netloc),
                        f'{source}: unsupported external link {value!r}')
                self.counts['external_reference_links'] += 1
            return
        decoded = unquote(url.path)
        require(not decoded.startswith('/') and '\\' not in decoded,
                f'{source}: nonportable absolute/backslash link {value!r}')
        target = posixpath.normpath(posixpath.join(posixpath.dirname(source), decoded)) if decoded else source
        require(target != '..' and not target.startswith('../'), f'{source}: link escapes package: {value!r}')
        require(self.store.exists(target), f'{source}: broken {context} {value!r}; resolved to {target}')
        if self.store.entries is not None:
            require(not target.lower().endswith('.zip'), f'{source}: offline ZIP contains a ZIP download/self-link: {value!r}')
        if url.fragment and target.lower().endswith(('.html', '.htm')):
            fragment = unquote(url.fragment)
            destination = self.page(target)
            # The main application uses workspace.js hash routes, whose tab
            # controls must point to an existing mounted panel.
            route_panel = destination.workspace_routes.get(fragment)
            valid_route = route_panel == f'workspace-{fragment}' and route_panel in destination.ids
            require(fragment in destination.ids or valid_route,
                    f'{source}: missing fragment #{fragment} in {target}')
            self.counts['local_fragments'] += 1
        self.counts['local_references'] += 1

    def css(self, source, text):
        # CSS comments do not load resources.
        text = re.sub(r'/\*.*?\*/', '', text, flags=re.S)
        for value in re.findall(r'url\(\s*[\'"]?([^\)\'"\s]+)', text, re.I):
            self.reference(source, value, True, 'CSS url()')
        for value in re.findall(r'@import\s+[\'"]([^\'"]+)', text, re.I):
            self.reference(source, value, True, 'CSS @import')

    def javascript(self, source, text):
        # An offline file:// exhibit must not depend on runtime requests/modules.
        pattern = (r'\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|importScripts)\s*\('
                   r'|\bimport(?:\s*\(|\s+[\w{*])|\bnavigator\s*\.\s*sendBeacon\s*\(')
        found = re.search(pattern, text)
        require(not found, f'{source}: runtime network/module primitive {found.group(0)!r}' if found else '')

    def html(self):
        pages = [p for p in self.store.files(self.store.exhibit) if p.endswith(('.html', '.htm'))]
        require(pages, 'No research exhibit HTML was found')
        for name in pages:
            page = self.page(name)
            require(not page.duplicates, f'{name}: duplicate HTML IDs: {sorted(page.duplicates)}')
            require(not page.has_base, f'{name}: <base> prevents predictable offline link resolution')
            require(not page.module_scripts, f'{name}: module scripts are not portable to file://')
            for value, runtime, context in page.references:
                self.reference(name, value, runtime, context)
            for source in page.inline_scripts:
                self.javascript(name, source)
            for source in page.inline_styles:
                self.css(name, source)
        for name in self.store.files(self.store.exhibit):
            if name.endswith('.css'):
                self.css(name, self.store.text(name))
            elif name.endswith('.js'):
                self.javascript(name, self.store.text(name))
        self.counts['html_pages'] = len(pages)

    def numerical(self):
        manifest = self.store.json('research/versions/round-2-revised-manifest.json')['files']
        for name in FROZEN:
            require(name in manifest, f'Frozen manifest does not identify {name}')
            require(sha(self.store.read(name)) == manifest[name], f'Frozen numerical/source file changed: {name}')
        inputs = self.store.json('research/inputs.json')
        result = self.store.json('research/results.json')
        require(result['meta']['inputsSha256'] == sha(self.store.read('research/inputs.json')),
                'Results identify a different input snapshot')
        require(inputs['airportSnapshot']['snapshotSha256'] == sha(self.store.read('research/reviews/airport-source-snapshot.json')),
                'Airport source archive does not match frozen provenance')
        for name, expected in (('results.csv', 36), ('sensitivity.csv', 486)):
            rows = list(csv.DictReader(io.StringIO(self.store.text('research/' + name))))
            require(len(rows) == expected, f'{name}: expected {expected} cases, found {len(rows)}')
            require(len({row['id'] for row in rows}) == expected, f'{name}: duplicate case IDs')
            require(all('localAdditionalBurnT' in row and 'localAdditionalCo2T' in row for row in rows),
                    f'{name}: missing separate local-interruption burn/CO2 columns')
            self.counts[name + '_cases'] = expected
        require(len(result['durationCases']) == 18 and len(result['routeCases']) == 18,
                'Results JSON must contain 18 duration cases and 18 route cases')
        require(result['sensitivitySummary']['caseCount'] == 486, 'JSON sensitivity count differs from CSV')
        for name in ('inputs.json', 'results.json', 'results.csv', 'sensitivity.csv'):
            require(self.store.read('research/' + name) == self.store.read(self.store.exhibit + '/downloads/' + name),
                    f'Download mirror is stale: {name}')
        embedded = json.loads(self.page(self.store.exhibit + '/index.html').element_text('research-data'))
        require(embedded == {'inputs': inputs, 'results': result}, 'Embedded HTML model data differs from frozen inputs/results')
        self.counts['frozen_files'] = len(FROZEN)

    def publication(self):
        report_bytes = self.store.read('research/report.json')
        report = json.loads(report_bytes)
        paragraphs = report['reflection']['paragraphs']
        count = words('\n'.join(paragraphs))
        require(800 <= count <= 1000, f'Reflection contains {count} words; assignment requires 800–1,000')
        require(report['reflection']['wordCount'] == count,
                f'Reported reflection word count {report["reflection"]["wordCount"]} differs from actual {count}')
        downloads = self.store.exhibit + '/downloads/'
        manifest = self.store.json(downloads + 'publication_manifest.json')
        require(manifest['sourceSha256'] == sha(report_bytes), 'Publication manifest is stale relative to research/report.json; rerender documents')
        require(manifest['reflectionWords'] == count, 'Publication word count differs from source reflection')
        require(manifest['draftValidationBypassed'] is False, 'Publication was rendered with draft validation bypassed')
        outputs = {item['name']: item for item in manifest['outputs']}
        require(set(outputs) == set(DOCUMENTS), 'Publication manifest must identify both PDFs and the reflection DOCX')
        for name in DOCUMENTS:
            data = self.store.read(downloads + name)
            require(len(data) == outputs[name]['bytes'] and sha(data) == outputs[name]['sha256'],
                    f'Publication bytes/hash mismatch: {name}')
            if name.endswith('.pdf'):
                require(data.startswith(b'%PDF-') and b'%%EOF' in data[-1024:], f'Incomplete or invalid PDF: {name}')
                require(outputs[name].get('pages', 0) > 0, f'PDF page count missing: {name}')
            mirror = 'artifacts/energy-security-project/' + name
            if self.store.entries is None and self.store.exists(mirror):
                require(data == self.store.read(mirror), f'Rendered document and download mirror differ: {name}')
        with zipfile.ZipFile(io.BytesIO(self.store.read(downloads + 'Analytical_Reflection.docx'))) as doc:
            require(doc.testzip() is None, 'DOCX has a corrupt ZIP member')
            xml = ET.fromstring(doc.read('word/document.xml'))
        ns = {'w': 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'}
        doc_paragraphs = [''.join(node.text or '' for node in p.findall('.//w:t', ns))
                          for p in xml.findall('.//w:body/w:p', ns)]
        sequence = [normalize(p) for p in paragraphs]
        actual = [normalize(p) for p in doc_paragraphs]
        start = next((i for i in range(len(actual)) if actual[i:i + len(sequence)] == sequence), None)
        require(start is not None, 'DOCX reflection paragraphs do not match the report in order')
        require(words('\n'.join(doc_paragraphs[start:start + len(sequence)])) == count,
                'DOCX reflection word count differs from report')
        page = self.page(self.store.exhibit + '/index.html')
        require(normalize(page.element_text('essay-content')) == normalize(''.join(paragraphs)),
                'HTML essay prose differs from report.json')
        require(str(count) + ' words' in page.element_text('essay-word-count'), 'HTML essay word-count label is stale')
        self.counts['reflection_words'] = count
        self.counts['publication_documents'] = len(DOCUMENTS)


def load_zip(path):
    with zipfile.ZipFile(path) as archive:
        infos = archive.infolist()
        names = [i.filename for i in infos if not i.is_dir()]
        require(len(names) == len(set(names)), 'ZIP contains duplicate file names')
        for info in infos:
            name = info.filename
            require(not name.startswith('/') and '\\' not in name and '..' not in PurePosixPath(name).parts,
                    f'ZIP contains a nonportable/unsafe entry: {name}')
            require((info.external_attr >> 16) & 0o170000 != 0o120000, f'ZIP contains a symbolic link: {name}')
        corrupt = archive.testzip()
        require(corrupt is None, f'ZIP CRC failed for {corrupt}')
        entries = {name: archive.read(name) for name in names}
    require('SHA256SUMS.json' in entries, 'ZIP lacks SHA256SUMS.json')
    checksums = json.loads(entries['SHA256SUMS.json'])
    expected = set(entries) - {'SHA256SUMS.json'}
    require(set(checksums) == expected,
            f'ZIP checksum coverage differs: missing={sorted(expected - set(checksums))}, extra={sorted(set(checksums) - expected)}')
    for name, expected_hash in checksums.items():
        require(sha(entries[name]) == expected_hash, f'ZIP SHA256 mismatch: {name}')
    require(not any(name.lower().endswith('.zip') for name in names), 'Submission ZIP contains a nested ZIP/self-copy')
    require('START-HERE.txt' in entries, 'ZIP lacks START-HERE.txt instructions')
    return Store(entries=entries), len(expected)


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, help='Inspect this submission ZIP instead of the working tree')
    args = parser.parse_args(argv)
    errors = []
    try:
        if args.package:
            store, count = load_zip(args.package)
        else:
            store, count = Store(root=ROOT), 0
        verifier = Verifier(store)
        if count:
            verifier.counts['zip_files_with_verified_sha256'] = count
        for label, check in (('HTML/runtime assets', verifier.html), ('Frozen numerical artifacts', verifier.numerical),
                             ('Publication and essay mirrors', verifier.publication)):
            try:
                check()
            except (CheckError, OSError, ValueError, KeyError, TypeError, ET.ParseError, zipfile.BadZipFile) as error:
                errors.append(f'{label}: {error}')
    except (CheckError, OSError, ValueError, KeyError, zipfile.BadZipFile) as error:
        errors.append(f'Package loading/checksums: {error}')
    if errors:
        for error in errors:
            print('FAIL: ' + error, file=sys.stderr)
        return 1
    print('PASS: research package static integrity checks')
    print(json.dumps(dict(verifier.counts), indent=2, sort_keys=True))
    print('Scope: static asset/link checks; DOCX/HTML essay equality; PDF signatures and publication hashes. Browser behavior and PDF visual layout require separate review.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
