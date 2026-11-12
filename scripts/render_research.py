#!/usr/bin/env python3
"""Render the Fuel Atlas research submission from a single, reviewed JSON source.

Usage:
    python3 scripts/render_research.py
    python3 scripts/render_research.py --report research/report.json --output /tmp/check --no-mirror

The explanatory essay is validated at 800–1,000 words. Word counting excludes
standalone bracketed citation markers, treats hyphenated compounds as one word,
and treats en/em dashes as word breaks. Headings, references and captions are not
part of the reflection count. All publication dates come from the source JSON.

Requires reportlab, python-docx and Pillow. No network access or browser is used.
"""
from __future__ import annotations

import argparse
from datetime import datetime, timezone
from functools import partial
import hashlib
import html
import io
import json
from pathlib import Path
import re
import shutil
import sys
from urllib.parse import urlparse
import zipfile

from PIL import Image as PILImage
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas
from reportlab.platypus import (
    BaseDocTemplate, Flowable, Frame, HRFlowable, Image, KeepTogether,
    NextPageTemplate, PageBreak, PageTemplate, Paragraph, Spacer, Table, TableStyle,
)
from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.oxml import OxmlElement
from docx.oxml.ns import qn
from docx.shared import Inches, Pt, RGBColor
from docx.opc.constants import RELATIONSHIP_TYPE as RT

ROOT = Path(__file__).resolve().parents[1]
INK = colors.HexColor('#20251F')
RED = colors.HexColor('#B33A2D')
MUTED = colors.HexColor('#5F675D')
PAPER = colors.HexColor('#F4F1E8')
LINE = colors.HexColor('#D4D8CE')
PAGE_W, PAGE_H = A4
LEFT = RIGHT = 19 * mm
TOP = 21 * mm
BOTTOM = 19 * mm
WIDTH = PAGE_W - LEFT - RIGHT
FONT = 'ResearchSans'
BOLD = 'ResearchSansBold'
ITALIC = 'ResearchSansItalic'
MONO = 'ResearchMono'
CITATION_RE = re.compile(r'\[([0-9]+(?:\s*[,;]\s*[0-9]+)*)\]')
WORD_RE = re.compile(r"(?u)\b[^\W_]+(?:[.'’/\-][^\W_]+)*\b")


def count_words(paragraphs: str | list[str]) -> int:
    """Count essay prose using the documented publication convention."""
    text = paragraphs if isinstance(paragraphs, str) else '\n'.join(paragraphs)
    text = re.sub(r'\[(?:[0-9]+[a-z]?(?:\s*[,;–\-]\s*[0-9]+[a-z]?)*|S[0-9]+)\]', '', text)
    text = text.replace('—', ' ').replace('–', ' ')
    return len(WORD_RE.findall(text))


def register_fonts() -> None:
    candidates = [
        Path('/usr/share/fonts/truetype/noto'),
        Path('/usr/share/fonts/truetype/dejavu'),
    ]
    for folder in candidates:
        stem = 'NotoSans' if folder.name == 'noto' else 'DejaVuSans'
        regular = folder / f'{stem}-Regular.ttf' if stem == 'NotoSans' else folder / f'{stem}.ttf'
        italic = folder / (f'{stem}-Italic.ttf' if stem == 'NotoSans' else f'{stem}-Oblique.ttf')
        bold = folder / f'{stem}-Bold.ttf'
        if regular.exists() and italic.exists() and bold.exists():
            for name, path in [(FONT, regular), (BOLD, bold), (ITALIC, italic)]:
                pdfmetrics.registerFont(TTFont(name, str(path)))
            pdfmetrics.registerFontFamily(FONT, normal=FONT, bold=BOLD, italic=ITALIC, boldItalic=BOLD)
            break
    else:
        raise RuntimeError('Install Noto Sans or DejaVu Sans to render the publication.')
    mono = Path('/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf')
    pdfmetrics.registerFont(TTFont(MONO, str(mono)))


def publication_styles():
    base = getSampleStyleSheet()
    definitions = {
        'Body': dict(fontName=FONT, fontSize=11, leading=16, textColor=INK,
                     spaceAfter=9.5, allowWidows=0, allowOrphans=0),
        'Section': dict(fontName=BOLD, fontSize=18, leading=22, textColor=INK,
                        spaceBefore=18, spaceAfter=12, keepWithNext=True),
        'Subsection': dict(fontName=BOLD, fontSize=12.5, leading=17, textColor=INK,
                           spaceBefore=12, spaceAfter=6, keepWithNext=True),
        'Small': dict(fontName=FONT, fontSize=8.6, leading=12.3, textColor=MUTED,
                     spaceAfter=7, allowWidows=0, allowOrphans=0),
        'Caption': dict(fontName=FONT, fontSize=8.7, leading=12.5, textColor=MUTED,
                       spaceBefore=6, spaceAfter=14),
        'Reference': dict(fontName=FONT, fontSize=8.6, leading=12, textColor=INK,
                         spaceAfter=6, allowWidows=0, allowOrphans=0,
                         splitLongWords=True, uriWasteReduce=0.1),
        'Cell': dict(fontName=FONT, fontSize=8.3, leading=11.8, textColor=INK,
                    spaceAfter=0, allowWidows=1, allowOrphans=1),
        'CellHead': dict(fontName=BOLD, fontSize=8.2, leading=11.5, textColor=colors.white,
                        spaceAfter=0),
        'CoverEyebrow': dict(fontName=BOLD, fontSize=9, leading=13, textColor=RED,
                            spaceAfter=16, tracking=1.1),
        'CoverTitle': dict(fontName=BOLD, fontSize=31, leading=37, textColor=INK,
                          spaceAfter=17, allowWidows=0, allowOrphans=0),
        'CoverSubtitle': dict(fontName=FONT, fontSize=15, leading=21, textColor=MUTED,
                             spaceAfter=21),
        'CoverMeta': dict(fontName=FONT, fontSize=9.5, leading=15, textColor=MUTED,
                         spaceAfter=7),
        'EssayTitle': dict(fontName=BOLD, fontSize=24, leading=30, textColor=INK,
                          spaceAfter=14),
        'Takeaway': dict(fontName=BOLD, fontSize=11.4, leading=16.5, textColor=INK,
                         spaceAfter=10, allowWidows=0, allowOrphans=0),
        'Equation': dict(fontName=MONO, fontSize=9, leading=14, textColor=INK,
                        spaceBefore=5, spaceAfter=10),
    }
    styles = {key: ParagraphStyle(key, parent=base['Normal'], **definition)
              for key, definition in definitions.items()}
    styles['EssayBody'] = ParagraphStyle('EssayBody', parent=styles['Body'],
                                         leading=15.5, spaceAfter=8)
    styles['RecommendationHeading'] = ParagraphStyle('RecommendationHeading', parent=styles['Subsection'],
                                                      spaceBefore=8, spaceAfter=4)
    styles['RecommendationBody'] = ParagraphStyle('RecommendationBody', parent=styles['Body'], spaceAfter=7)
    styles['RecommendationDetail'] = ParagraphStyle('RecommendationDetail', parent=styles['Small'], spaceAfter=4.5)
    return styles


def text(value) -> str:
    if isinstance(value, list):
        return ', '.join(str(x) for x in value)
    return str(value or '')


def anchor_id(ref_id) -> str:
    return 'ref-' + re.sub(r'[^A-Za-z0-9_-]', '-', text(ref_id))


def safe_url(value: str) -> str:
    parsed = urlparse(value)
    if parsed.scheme not in {'https', 'http'} or not parsed.netloc:
        raise ValueError(f'Expected an HTTP(S) source URL: {value!r}')
    return value


def pdf_text(value: str, reference_ids: set[str] | None = None) -> str:
    escaped = html.escape(text(value), quote=True).replace('\n', '<br/>')
    # Noto Sans installations can omit mathematical operators. Use the bundled
    # equation font explicitly so these remain visible and extractable text.
    escaped = re.sub(r'[−≤≥≠≈×÷]', lambda match: f'<font name="{MONO}">{match.group(0)}</font>', escaped)
    if reference_ids:
        def link(match):
            ids = re.split(r'\s*[,;]\s*', match.group(1))
            if any(ref_id not in reference_ids for ref_id in ids):
                return match.group(0)
            return '[' + ', '.join(f'<link href="#{anchor_id(ref_id)}" color="#B33A2D">{ref_id}</link>' for ref_id in ids) + ']'
        escaped = CITATION_RE.sub(link, escaped)
    return escaped


class StableCanvas(canvas.Canvas):
    def __init__(self, *args, publication_date=None, **kwargs):
        kwargs['invariant'] = 1
        kwargs['pageCompression'] = 1
        kwargs['lang'] = 'en-US'
        super().__init__(*args, **kwargs)
        if publication_date:
            # ReportLab invariant mode otherwise writes 1 January 2000 into
            # metadata. Retain stable output, but identify the source date.
            source = source_datetime(publication_date).astimezone(timezone.utc)
            stamp = self._doc._timeStamp
            stamp.t = source.timestamp()
            stamp.lt = source.timetuple()
            stamp.YMDhms = tuple(stamp.lt)[:6]
            stamp.dhh = stamp.dmm = 0
            stamp.tzname = 'UTC'
            self._doc.signature.update(source.isoformat().encode('ascii'))


class ResearchDocument(BaseDocTemplate):
    def __init__(self, filename, report, *, cover=True):
        super().__init__(str(filename), pagesize=A4, leftMargin=LEFT, rightMargin=RIGHT,
                         topMargin=TOP, bottomMargin=BOTTOM, title=report['title'],
                         author=text(report.get('team', 'Fuel Atlas')),
                         subject='Asian energy security research project',
                         creator='Fuel Atlas reproducible publication renderer')
        self.report = report
        self.bookmark_number = 0
        frame = Frame(LEFT, BOTTOM, WIDTH, PAGE_H-TOP-BOTTOM, leftPadding=0, rightPadding=0,
                      topPadding=0, bottomPadding=0, id='main')
        templates = []
        if cover:
            templates.append(PageTemplate(id='cover', frames=[frame], onPage=self.cover_page))
        templates.append(PageTemplate(id='body', frames=[frame], onPage=self.body_page))
        self.addPageTemplates(templates)

    def cover_page(self, canv, doc):
        canv.saveState()
        canv.setFillColor(PAPER)
        canv.rect(0, 0, PAGE_W, PAGE_H, fill=1, stroke=0)
        canv.setFillColor(RED)
        canv.rect(LEFT, PAGE_H-48*mm, 5*mm, 14*mm, fill=1, stroke=0)
        canv.setFillColor(INK)
        canv.rect(PAGE_W-56*mm, BOTTOM+20*mm, 36*mm, 4*mm, fill=1, stroke=0)
        canv.setStrokeColor(LINE)
        canv.line(LEFT, BOTTOM+12*mm, PAGE_W-RIGHT, BOTTOM+12*mm)
        canv.setFont(FONT, 8)
        canv.setFillColor(MUTED)
        canv.drawString(LEFT, BOTTOM+5*mm, 'FUEL ATLAS  /  INDEPENDENT RESEARCH PROJECT')
        canv.restoreState()

    def body_page(self, canv, doc):
        canv.saveState()
        canv.setFillColor(RED)
        canv.rect(LEFT, PAGE_H-13*mm, 6*mm, 1.1*mm, fill=1, stroke=0)
        canv.setFillColor(MUTED)
        canv.setFont(FONT, 7.5)
        canv.drawString(LEFT+9*mm, PAGE_H-13*mm, 'FUEL ATLAS  /  ASIAN ENERGY SECURITY')
        canv.setStrokeColor(LINE)
        canv.line(LEFT, BOTTOM-6*mm, PAGE_W-RIGHT, BOTTOM-6*mm)
        canv.drawString(LEFT, BOTTOM-11*mm, text(self.report.get('date')))
        canv.drawRightString(PAGE_W-RIGHT, BOTTOM-11*mm, f'{doc.page}')
        canv.restoreState()

    def afterFlowable(self, flowable):
        if isinstance(flowable, Paragraph) and flowable.style.name in {'Section', 'Subsection', 'EssayTitle', 'RecommendationHeading'}:
            self.bookmark_number += 1
            key = f'section-{self.bookmark_number}'
            self.canv.bookmarkPage(key)
            level = 1 if flowable.style.name in {'Subsection', 'RecommendationHeading'} else 0
            self.canv.addOutlineEntry(flowable.getPlainText(), key, level=level, closed=False)


def paragraph(value, styles, reference_ids, style='Body'):
    return Paragraph(pdf_text(value, reference_ids), styles[style])


def section_title(value, styles):
    return Paragraph(html.escape(text(value)), styles['Section'])


def add_paragraphs(story, values, styles, reference_ids):
    for value in values or []:
        if isinstance(value, dict):
            if value.get('type') == 'equation':
                story.append(paragraph(value.get('text', ''), styles, reference_ids, 'Equation'))
            else:
                story.append(paragraph(value.get('text', ''), styles, reference_ids))
        else:
            story.append(paragraph(value, styles, reference_ids))


def resolve_image(path: str, report_path: Path) -> Path:
    raw = Path(path)
    for candidate in [raw, report_path.parent/raw, ROOT/raw]:
        if candidate.is_file():
            return candidate.resolve()
    raise FileNotFoundError(f'Research figure not found: {path}')


def add_figure(story, figure, styles, reference_ids, report_path):
    path = resolve_image(figure['path'], report_path)
    with PILImage.open(path) as img:
        width_px, height_px = img.size
    width = min(WIDTH, 495)
    height = width * height_px / width_px
    max_height = 155 * mm
    if height > max_height:
        width *= max_height / height
        height = max_height
    items = []
    if figure.get('title'):
        items.append(Paragraph(html.escape(figure['title']), styles['Subsection']))
    image = Image(str(path), width=width, height=height)
    image.hAlign = 'LEFT'
    items.append(image)
    items.append(paragraph(figure.get('caption', ''), styles, reference_ids, 'Caption'))
    story.append(KeepTogether(items))


def data_table(spec, styles, reference_ids):
    columns = spec['columns']
    rows = spec['rows']
    count = len(columns)
    if not count:
        raise ValueError('Research table needs at least one column.')
    weights = spec.get('columnWidths')
    if weights:
        widths = [WIDTH * value / sum(weights) for value in weights]
    else:
        widths = [WIDTH/count] * count
    data = [[paragraph(c, styles, reference_ids, 'CellHead') for c in columns]]
    for row in rows:
        if len(row) != count:
            raise ValueError('Research table row does not match its column count.')
        data.append([paragraph(text(v), styles, reference_ids, 'Cell') for v in row])
    table = Table(data, colWidths=widths, repeatRows=1, hAlign='LEFT', splitByRow=1)
    table.setStyle(TableStyle([
        ('BACKGROUND', (0,0), (-1,0), INK),
        ('VALIGN', (0,0), (-1,-1), 'TOP'),
        ('LEFTPADDING', (0,0), (-1,-1), 8), ('RIGHTPADDING', (0,0), (-1,-1), 8),
        ('TOPPADDING', (0,0), (-1,-1), 8), ('BOTTOMPADDING', (0,0), (-1,-1), 8),
        ('ROWBACKGROUNDS', (0,1), (-1,-1), [colors.white, PAPER]),
        ('LINEBELOW', (0,0), (-1,0), 1.2, RED),
        ('LINEBELOW', (0,1), (-1,-1), 0.4, LINE),
    ]))
    return table


def add_reference_list(story, references, styles):
    story.append(section_title('References', styles))
    for ref in references:
        ref_id = text(ref['id'])
        lead = f"[{ref_id}] {text(ref.get('author'))} ({text(ref.get('year'))}). {text(ref.get('title'))}."
        if ref.get('locator'):
            lead += ' ' + text(ref['locator']).rstrip('.') + '.'
        url = safe_url(ref['url'])
        markup = (f'<a name="{anchor_id(ref_id)}"/>' + html.escape(lead) +
                  f'<br/><link href="{html.escape(url, quote=True)}" color="#B33A2D">'
                  f'{html.escape(url)}</link>')
        story.append(KeepTogether([Paragraph(markup, styles['Reference'])]))


def full_pdf(report, report_path, output, styles, word_count):
    refs = {text(x['id']) for x in report['references']}
    story = [Spacer(1, 39*mm),
             Paragraph('FINAL PROJECT  /  DIGITAL RESEARCH AND POLICY ANALYSIS', styles['CoverEyebrow']),
             Paragraph(html.escape(report['title']), styles['CoverTitle']),
             Paragraph(html.escape(report.get('subtitle', '')), styles['CoverSubtitle']),
             HRFlowable(width=WIDTH, thickness=1, color=INK, spaceAfter=17),
             Paragraph(html.escape(text(report.get('team', 'Fuel Atlas'))), styles['CoverMeta']),
             Paragraph(html.escape(text(report['date'])), styles['CoverMeta'])]
    if report.get('scopeNote'):
        story.extend([Spacer(1, 9*mm), paragraph(report['scopeNote'], styles, refs, 'CoverMeta')])
    for link in report.get('links', []):
        story.append(Paragraph(f'<link href="{html.escape(safe_url(link["url"]), quote=True)}" color="#B33A2D">{html.escape(link["label"])}</link>', styles['CoverMeta']))
    story += [NextPageTemplate('body'), PageBreak(), section_title('Executive assessment', styles)]
    add_paragraphs(story, report.get('executiveSummary'), styles, refs)
    for finding in report.get('keyFindings', []):
        story.append(Paragraph(html.escape(finding['title']), styles['Subsection']))
        story.append(paragraph(finding['text'], styles, refs))
    used_figures = set()
    for index, section in enumerate(report.get('sections', [])):
        story.append(section_title(section['title'], styles))
        add_paragraphs(story, section.get('paragraphs'), styles, refs)
        for equation in section.get('equations', []):
            story.append(paragraph(equation, styles, refs, 'Equation'))
        for table_spec in section.get('tables', []):
            if table_spec.get('title'):
                story.append(Paragraph(html.escape(table_spec['title']), styles['Subsection']))
            story.append(data_table(table_spec, styles, refs))
            story.append(paragraph(table_spec.get('caption', ''), styles, refs, 'Caption'))
        for i, figure in enumerate(report.get('figures', [])):
            if figure.get('section') in {index, section['title']}:
                add_figure(story, figure, styles, refs, report_path)
                used_figures.add(i)
    remaining = [f for i,f in enumerate(report.get('figures', [])) if i not in used_figures]
    if remaining or report.get('tables'):
        story.append(section_title('Quantitative exhibits', styles))
        for spec in report.get('tables', []):
            if spec.get('title'):
                story.append(Paragraph(html.escape(spec['title']), styles['Subsection']))
            story.append(data_table(spec, styles, refs))
            story.append(paragraph(spec.get('caption', ''), styles, refs, 'Caption'))
        for figure in remaining:
            add_figure(story, figure, styles, refs, report_path)
    if report.get('recommendations'):
        story.append(section_title('Decision framework and responsibilities', styles))
        for i, rec in enumerate(report['recommendations'], 1):
            story.append(KeepTogether([
                Paragraph(html.escape(f'{i}. {rec["owner"]}'), styles['RecommendationHeading']),
                paragraph(rec['action'], styles, refs, 'RecommendationBody'),
                paragraph('Trigger: ' + rec['trigger'], styles, refs, 'RecommendationDetail'),
                paragraph('Trade-off: ' + rec['tradeoff'], styles, refs, 'RecommendationDetail'),
            ]))
    story += [PageBreak(), section_title(report['reflection'].get('title', 'Analytical reflection'), styles),
              paragraph(f'{word_count} words | Excludes title and references; counting convention in the reproducibility appendix.', styles, refs, 'Small')]
    add_paragraphs(story, report['reflection']['paragraphs'], styles, refs)
    if report.get('technicalAppendix'):
        story += [PageBreak(), section_title('Technical and reproducibility appendix', styles)]
        for item in report['technicalAppendix']:
            story.append(Paragraph(html.escape(item['title']), styles['Subsection']))
            add_paragraphs(story, item.get('paragraphs'), styles, refs)
            for equation in item.get('equations', []):
                story.append(paragraph(equation, styles, refs, 'Equation'))
    story += [paragraph('Reflection word count: citation-only markers are excluded; hyphenated compounds count as one word; en and em dashes separate words. Only reflection paragraph text is counted.', styles, refs, 'Small')]
    story.append(PageBreak())
    add_reference_list(story, report['references'], styles)
    if report.get('reviewSummary'):
        story += [PageBreak(), section_title('Four-round critique and revision record', styles),
                  paragraph('Independent AI-assisted critique and author revisions are recorded below. This is a consulting-style quality process, not a review or endorsement by a consulting firm.', styles, refs, 'Small')]
        for round_ in report['reviewSummary']:
            story.append(KeepTogether([
                Paragraph(html.escape(f'Round {round_["round"]}: {round_["focus"]}'), styles['Subsection']),
                paragraph('Critique: ' + round_['critique'], styles, refs),
                paragraph('Revision: ' + round_['revision'], styles, refs),
                paragraph('Verification: ' + round_['verification'], styles, refs, 'Small'),
            ]))
    if report.get('acknowledgements'):
        story.append(section_title('Research and production note', styles))
        add_paragraphs(story, report['acknowledgements'], styles, refs)
    doc = ResearchDocument(output, report, cover=True)
    doc.build(story, canvasmaker=partial(StableCanvas, publication_date=report['date']))
    return doc.page


def reflection_pdf(report, output, styles, word_count):
    refs = {text(x['id']) for x in report['references']}
    story = [Paragraph('ANALYTICAL REFLECTION', styles['CoverEyebrow']),
             Paragraph(html.escape(report['reflection'].get('title', report['title'])), styles['EssayTitle']),
             paragraph(text(report.get('team', 'Fuel Atlas')) + ' | ' + text(report['date']), styles, refs, 'Small'),
             paragraph(f'{word_count} words, excluding title and references.', styles, refs, 'Small'),
             HRFlowable(width=WIDTH, thickness=1.2, color=RED, spaceAfter=15)]
    for value in report['reflection']['paragraphs']:
        story.append(paragraph(value, styles, refs, 'EssayBody'))
    story.append(PageBreak())
    cited = cited_reference_ids(report['reflection']['paragraphs'])
    relevant = [ref for ref in report['references'] if text(ref['id']) in cited]
    add_reference_list(story, relevant, styles)
    story.append(paragraph('Word count convention: citation-only markers are excluded; hyphenated compounds count as one word; en and em dashes separate words. Only the essay paragraphs are counted.', styles, refs, 'Small'))
    doc = ResearchDocument(output, report, cover=False)
    doc.build(story, canvasmaker=partial(StableCanvas, publication_date=report['date']))
    return doc.page


def source_datetime(raw):
    for fmt in ('%Y-%m-%d', '%d %B %Y', '%B %d, %Y'):
        try:
            return datetime.strptime(raw, fmt).replace(tzinfo=timezone.utc)
        except ValueError:
            continue
    try:
        parsed = datetime.fromisoformat(raw.replace('Z', '+00:00'))
        return parsed if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)
    except ValueError as error:
        raise ValueError('date must be an ISO date or an unambiguous English date') from error


def add_docx_link(paragraph_, label, url):
    relation = paragraph_.part.relate_to(safe_url(url), RT.HYPERLINK, is_external=True)
    hyperlink = OxmlElement('w:hyperlink')
    hyperlink.set(qn('r:id'), relation)
    run = OxmlElement('w:r')
    properties = OxmlElement('w:rPr')
    color = OxmlElement('w:color'); color.set(qn('w:val'), 'B33A2D'); properties.append(color)
    underline = OxmlElement('w:u'); underline.set(qn('w:val'), 'single'); properties.append(underline)
    run.append(properties)
    value = OxmlElement('w:t'); value.text = label; run.append(value)
    hyperlink.append(run); paragraph_._p.append(hyperlink)


def stable_docx_zip(path: Path, date: datetime):
    content = io.BytesIO(path.read_bytes())
    stamp = (max(1980, date.year), date.month, date.day, 0, 0, 0)
    result = io.BytesIO()
    with zipfile.ZipFile(content) as old, zipfile.ZipFile(result, 'w', zipfile.ZIP_DEFLATED) as new:
        for name in sorted(old.namelist()):
            info = zipfile.ZipInfo(name, stamp)
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = 0o600 << 16
            new.writestr(info, old.read(name))
    path.write_bytes(result.getvalue())


def reflection_docx(report, output, word_count):
    doc = Document()
    section = doc.sections[0]
    section.page_width = Inches(8.2677); section.page_height = Inches(11.6929)
    section.top_margin = section.bottom_margin = Inches(0.78)
    section.left_margin = section.right_margin = Inches(0.8)
    normal = doc.styles['Normal']
    normal.font.name = 'Arial'; normal.font.size = Pt(11); normal.font.color.rgb = RGBColor.from_string('20251F')
    normal.paragraph_format.line_spacing = 1.15
    normal.paragraph_format.space_after = Pt(9)
    normal.paragraph_format.widow_control = True
    for name, size in [('Title', 24), ('Heading 1', 18), ('Heading 2', 13)]:
        style = doc.styles[name]
        style.font.name = 'Arial'; style.font.size = Pt(size); style.font.bold = True
        style.font.color.rgb = RGBColor.from_string('20251F')
    header = section.header.paragraphs[0]
    run = header.add_run('FUEL ATLAS / ASIAN ENERGY SECURITY')
    run.font.name = 'Arial'; run.font.size = Pt(8); run.font.color.rgb = RGBColor.from_string('5F675D')
    footer = section.footer.paragraphs[0]
    footer.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    footer.add_run('Page ').font.size = Pt(8)
    field = OxmlElement('w:fldSimple'); field.set(qn('w:instr'), 'PAGE'); footer._p.append(field)
    doc.add_heading(report['reflection'].get('title', report['title']), 0)
    meta = doc.add_paragraph(text(report.get('team', 'Fuel Atlas')) + ' | ' + text(report['date']))
    for run in meta.runs: run.font.size = Pt(9)
    count = doc.add_paragraph(f'{word_count} words, excluding title and references.')
    for run in count.runs: run.font.size = Pt(9); run.italic = True
    for value in report['reflection']['paragraphs']:
        doc.add_paragraph(value)
    doc.add_page_break()
    doc.add_heading('References', level=1)
    cited = cited_reference_ids(report['reflection']['paragraphs'])
    for ref in report['references']:
        if text(ref['id']) not in cited:
            continue
        paragraph_ = doc.add_paragraph()
        paragraph_.paragraph_format.space_after = Pt(8)
        run = paragraph_.add_run(f'[{ref["id"]}] {text(ref.get("author"))} ({text(ref.get("year"))}). {text(ref.get("title"))}.')
        run.font.size = Pt(9)
        if ref.get('locator'):
            paragraph_.add_run(' ' + text(ref['locator']).rstrip('.') + '.').font.size = Pt(9)
        paragraph_.add_run('\n')
        add_docx_link(paragraph_, ref['url'], ref['url'])
    note = doc.add_paragraph('Word count convention: citation-only markers are excluded; hyphenated compounds count as one word; en and em dashes separate words. Only the essay paragraphs are counted.')
    for run in note.runs: run.font.size = Pt(8); run.font.color.rgb = RGBColor.from_string('5F675D')
    date = source_datetime(report['date'])
    doc.core_properties.title = report['reflection'].get('title', report['title'])
    doc.core_properties.subject = 'Analytical reflection for an Asian energy security final project'
    doc.core_properties.author = text(report.get('team', 'Fuel Atlas'))
    doc.core_properties.keywords = 'aviation, energy security, East Asia, fuel tankering'
    doc.core_properties.created = date; doc.core_properties.modified = date
    doc.core_properties.last_modified_by = 'Fuel Atlas publication renderer'
    doc.save(output)
    stable_docx_zip(Path(output), date)


def cited_reference_ids(paragraphs):
    result = set()
    for value in paragraphs:
        for match in CITATION_RE.finditer(text(value)):
            result.update(re.split(r'\s*[,;]\s*', match.group(1)))
    return result


def content_strings(value):
    """Yield narrative strings to validate citations in every report component."""
    if isinstance(value, str):
        yield value
    elif isinstance(value, dict):
        for child in value.values():
            yield from content_strings(child)
    elif isinstance(value, list):
        for child in value:
            yield from content_strings(child)


def validate_report(report, *, allow_draft=False):
    for field in ['title', 'date', 'reflection', 'references']:
        if field not in report:
            raise ValueError(f'Missing required report field: {field}')
    reflection = report['reflection']
    if not isinstance(reflection.get('paragraphs'), list) or not all(isinstance(x, str) for x in reflection['paragraphs']):
        raise ValueError('reflection.paragraphs must be an array of plain-text paragraphs')
    count = count_words(reflection['paragraphs'])
    if not allow_draft and not 800 <= count <= 1000:
        raise ValueError(f'Analytical reflection is {count} words; final output requires 800–1,000.')
    if 'wordCount' in reflection and reflection['wordCount'] != count:
        raise ValueError(f'Reported essay wordCount={reflection["wordCount"]} differs from renderer count={count}.')
    ids = [text(ref['id']) for ref in report['references']]
    if len(set(ids)) != len(ids):
        raise ValueError('Reference IDs must be unique.')
    for ref in report['references']:
        safe_url(ref['url'])
    narrative = {key: value for key, value in report.items() if key not in {'references', 'links'}}
    unknown = cited_reference_ids(content_strings(narrative)) - set(ids)
    if unknown:
        raise ValueError('Report cites missing references: ' + ', '.join(sorted(unknown)))
    source_datetime(report['date'])
    return count


def render(report_path: Path, output: Path, *, mirror: Path | None, allow_draft=False):
    report_bytes = report_path.read_bytes()
    report = json.loads(report_bytes)
    count = validate_report(report, allow_draft=allow_draft)
    register_fonts()
    styles = publication_styles()
    output.mkdir(parents=True, exist_ok=True)
    paths = {name: output/name for name in ['Final_Project.pdf', 'Analytical_Reflection.pdf', 'Analytical_Reflection.docx']}
    full_pages = full_pdf(report, report_path, paths['Final_Project.pdf'], styles, count)
    essay_pages = reflection_pdf(report, paths['Analytical_Reflection.pdf'], styles, count)
    reflection_docx(report, paths['Analytical_Reflection.docx'], count)
    manifest = {
        'title': report['title'], 'publicationDate': report['date'],
        'sourceSha256': hashlib.sha256(report_bytes).hexdigest(),
        'reflectionWords': count, 'wordCountConvention': 'Citation-only markers excluded; hyphenated compounds one word; en/em dashes separate words; only reflection paragraphs counted.',
        'draftValidationBypassed': bool(allow_draft),
        'outputs': [{'name': name, 'bytes': path.stat().st_size,
                     'sha256': hashlib.sha256(path.read_bytes()).hexdigest(),
                     **({'pages': full_pages if name == 'Final_Project.pdf' else essay_pages} if name.endswith('.pdf') else {})}
                    for name, path in paths.items()],
    }
    manifest_path = output/'publication_manifest.json'
    manifest_path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False)+'\n')
    if mirror:
        mirror.mkdir(parents=True, exist_ok=True)
        for path in [*paths.values(), manifest_path]:
            if path.resolve() != (mirror/path.name).resolve():
                shutil.copyfile(path, mirror/path.name)
    return manifest


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--report', type=Path, default=ROOT/'research/report.json')
    parser.add_argument('--output', type=Path, default=ROOT/'artifacts/energy-security-project')
    default_mirror = (ROOT/'dist/research/downloads' if (ROOT/'dist/research').exists()
                      else ROOT/'exhibit/downloads')
    parser.add_argument('--mirror', type=Path, default=default_mirror)
    parser.add_argument('--no-mirror', action='store_true')
    parser.add_argument('--allow-draft', action='store_true', help='Development only: allow an essay outside the assignment word limit.')
    args = parser.parse_args(argv)
    try:
        manifest = render(args.report.resolve(), args.output.resolve(), mirror=None if args.no_mirror else args.mirror.resolve(), allow_draft=args.allow_draft)
    except (ValueError, FileNotFoundError, RuntimeError) as error:
        parser.error(str(error))
    print(json.dumps(manifest, indent=2, ensure_ascii=False))
    return 0


if __name__ == '__main__':
    sys.exit(main())
