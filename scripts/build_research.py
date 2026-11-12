#!/usr/bin/env python3
"""Build offline research content and figures; --package seals the final ZIP.

Run model.py, this script, render_research.py, then this script --package.
Core research uses no network. Publication source of truth: research/report.json.
"""
from pathlib import Path
import argparse
import hashlib
import html
import json
import re
import shutil
import zipfile

ROOT = Path(__file__).resolve().parents[1]
RESEARCH = ROOT/'research'
EXHIBIT = ROOT/'dist/research' if (ROOT/'dist/research').is_dir() else ROOT/'exhibit'
ARTIFACTS = ROOT/'artifacts/energy-security-project'


def figures():
    import numpy as np
    import matplotlib
    matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    matplotlib.rcParams.update({'font.family':'DejaVu Sans','font.size':10,
        'axes.spines.top':False,'axes.spines.right':False,'axes.labelcolor':'#20251f',
        'text.color':'#20251f','xtick.color':'#5e665a','ytick.color':'#5e665a',
        'axes.edgecolor':'#c7c9ba','figure.facecolor':'white','savefig.facecolor':'white',
        'svg.hashsalt':'fuel-atlas-research-2026'})
    folder = RESEARCH/'figures'; folder.mkdir(exist_ok=True)
    def save(fig, name):
        for extension in ('png','svg'):
            metadata = {'Date':None} if extension == 'svg' else {'Software':'Fuel Atlas research'}
            fig.savefig(folder/f'{name}.{extension}',dpi=180,bbox_inches='tight',metadata=metadata)
        plt.close(fig)
    t = np.linspace(0,9,181)
    central = (1/(1-.035*t)-1)*100
    fig, ax = plt.subplots(figsize=(8.3,4.5),layout='constrained')
    ax.fill_between(t,(1/(1-.025*t)-1)*100,(1/(1-.045*t)-1)*100,
                    color='#e7e9de',label='Linear: k = 2.5–4.5%/h')
    ax.plot(t,central,color='#bd3c29',lw=2.3,label='Linear: k = 3.5%/h')
    ax.plot(t,(np.exp(.035*t)-1)*100,color='#59634c',lw=1.8,ls='--',label='Exponential: k = 3.5%/h')
    ax.plot(t,central*1.316,color='#20251f',lw=1.5,ls=':',label='Linear + illustrative carbon value')
    ax.scatter([4],[16.2790697674],color='#bd3c29',s=35,zorder=5)
    ax.annotate('4 h: 16.3%',(4,16.279),(4.35,10.5),fontsize=10,
                arrowprops={'arrowstyle':'-','color':'#bd3c29'})
    ax.set(xlabel='Assumed airborne duration (hours)',ylabel='Break-even destination premium (%)',xlim=(0,9),ylim=(0,75))
    ax.grid(axis='y',color='#e4e5df',lw=.6); ax.set_axisbelow(True)
    ax.legend(loc='upper left',frameon=False,fontsize=8.5)
    save(fig,'time-threshold')

    r=json.loads((RESEARCH/'results.json').read_text())
    rows=[row for row in r['routeCases'] if row['model']=='linear' and row['carbonUsdPerTCo2']==0]
    fig,ax=plt.subplots(figsize=(8.3,3.8),layout='constrained')
    for i,row in enumerate(rows):
        interval=next(x for x in r['routeRanges'] if x['routeId']==row['routeId'])['linear']
        y=2-i
        lo,hi=interval['premiumPctMin'],interval['premiumPctMax']
        ax.plot([lo,hi],[y,y],color='#59634c',lw=3,solid_capstyle='butt')
        ax.scatter([lo,hi],[y,y],marker='|',s=110,color='#59634c')
        ax.scatter([row['breakEvenPremiumPct']],[y],s=75,color='#bd3c29',zorder=5)
        ax.text(row['breakEvenPremiumPct'],y+.19,f"{row['breakEvenPremiumPct']:.1f}% central",ha='center',fontsize=10)
        ax.text(hi+1.4,y,f'{lo:.1f}–{hi:.1f}%',va='center',fontsize=9,color='#5e665a')
    ax.set_yticks([2,1,0],[row['routeId'].replace('-','–') for row in rows])
    ax.set(xlabel='Break-even destination premium (%)',xlim=(0,73),ylim=(-.5,2.55))
    ax.grid(axis='x',color='#e4e5df',lw=.6); ax.set_axisbelow(True)
    ax.spines['left'].set_visible(False); ax.tick_params(axis='y',length=0,pad=14)
    save(fig,'route-threshold')

    fig,ax=plt.subplots(figsize=(8.3,3.8),layout='constrained')
    for y,q,b,label,co2 in [(1,1,1/.86-1,'1 t NET delivered',3.16*(1/.86-1)),
                           (0,.86,.14,'1 t GROSS loaded',.14*3.16)]:
        ax.barh(y,q,height=.38,color='#59634c',label='Useful delivered fuel' if y else None)
        ax.barh(y,b,left=q,height=.38,color='#bd3c29',label='Additional burn' if y else None)
        ax.text(q/2,y,f'{q:.3f} t useful',ha='center',va='center',color='white',fontsize=11)
        ax.text(q+b/2,y,f'{b:.3f}',ha='center',va='center',color='white',fontsize=8.5)
        ax.text(0,y+.29,f'{label}: {q+b:.3f} t uplift; {co2:.3f} t additional CO₂',fontsize=10)
    ax.set(xlabel='Extra origin fuel (tonnes)',xlim=(0,1.3),ylim=(-.55,1.65),yticks=[])
    ax.spines['left'].set_visible(False)
    ax.legend(loc='lower left',bbox_to_anchor=(0,-.34),ncol=2,frameon=False,fontsize=9)
    save(fig,'fuel-balance')


def substitute_marker(content,name,replacement):
    pattern=rf'(<!-- {name}_START -->).*?(<!-- {name}_END -->)'
    out,n=re.subn(pattern,lambda m:m[1]+replacement+m[2],content,flags=re.S)
    if n!=1: raise ValueError(f'Expected one {name} marker, got {n}')
    return out


def linked_text(value):
    value=html.escape(value)
    def link(match):
        ids=[x.strip() for x in match[1].split(',')]
        return '['+', '.join(f'<a href="#ref-{i}" aria-label="Reference {i}">{i}</a>' for i in ids)+']'
    return re.sub(r'\[(\d+(?:,\s*\d+)*)\]',link,value)


def content():
    report=json.loads((RESEARCH/'report.json').read_text())
    inp=json.loads((RESEARCH/'inputs.json').read_text())
    result=json.loads((RESEARCH/'results.json').read_text())
    page=(EXHIBIT/'index.html').read_text()
    data=json.dumps({'inputs':inp,'results':result},ensure_ascii=False,separators=(',',':')).replace('<','\\u003c')
    page,n=re.subn(r'(<script type="application/json" id="research-data">).*?(</script>)',lambda m:m[1]+data+m[2],page,flags=re.S)
    assert n==1
    essay=''.join('<p>'+linked_text(x)+'</p>' for x in report['reflection']['paragraphs'])
    page=substitute_marker(page,'ESSAY',essay)
    page=re.sub(r'(<p class="essay-meta" id="essay-word-count">).*?(</p>)',
                lambda m:m[1]+f"{report['reflection']['wordCount']} words · Excludes title and references"+m[2],page)
    refs='<ol>'+''.join(f'<li id="ref-{x["id"]}"><strong>{html.escape(x["author"])} ({html.escape(x["year"])}).</strong> '
        f'<a href="{html.escape(x["url"],quote=True)}">{html.escape(x["title"])}</a>. '
        f'{html.escape(x.get("locator","").rstrip("."))}.</li>' for x in report['references'])+'</ol>'
    page=substitute_marker(page,'REFERENCES',refs)
    policy=''.join('<p class="policy-statement">'+linked_text(x)+'</p>' for x in report['sections'][5]['paragraphs'][1:4])
    page=substitute_marker(page,'POLICY',policy)
    links=[('submission-package.zip','Complete offline submission package','ZIP'),
           ('Final_Project.pdf','Full report, analysis and review record','PDF'),
           ('Analytical_Reflection.pdf',f'{report["reflection"]["wordCount"]}-word analytical reflection','PDF'),
           ('Analytical_Reflection.docx','Editable analytical reflection','DOCX'),
           ('results.csv','Central cases: 36 rows','CSV'),('sensitivity.csv','Sensitivity cases: 486 rows','CSV'),
           ('inputs.json','Classified model inputs','JSON'),('results.json','Full computed results','JSON')]
    rendered_links=[]
    for i,(file,label,kind) in enumerate(links):
        primary=' class="download-primary"' if i==0 else ''
        rendered_links.append(f'<a href="./downloads/{file}"{primary}>{label} <span>{kind} ↓</span></a>')
    page=substitute_marker(page,'DOWNLOADS',''.join(rendered_links))
    (EXHIBIT/'index.html').write_text(page)
    downloads=EXHIBIT/'downloads'; downloads.mkdir(exist_ok=True)
    for name in ('results.csv','sensitivity.csv','inputs.json','results.json'):
        shutil.copyfile(RESEARCH/name,downloads/name)
    target=EXHIBIT/'figures'; target.mkdir(exist_ok=True)
    for source in (RESEARCH/'figures').glob('*'):
        if source.is_file(): shutil.copyfile(source,target/source.name)


def package(output=ARTIFACTS):
    output.mkdir(parents=True,exist_ok=True)
    required=['Final_Project.pdf','Analytical_Reflection.pdf','Analytical_Reflection.docx']
    for name in required:
        if not (EXHIBIT/'downloads'/name).is_file(): raise ValueError(f'Render missing {name} before packaging')
    entries={}
    for source in EXHIBIT.rglob('*'):
        if source.is_file() and source.suffix!='.zip':
            entries['exhibit/'+source.relative_to(EXHIBIT).as_posix()]=source.read_bytes()
    # The downloaded package must not link to an absent copy of itself or the
    # separate online planning app. Its core exhibit needs no external files.
    offline=entries['exhibit/index.html'].decode()
    offline=re.sub(r'<!-- WORKSPACE-ENTRY:START -->.*?<!-- WORKSPACE-ENTRY:END -->', '', offline, flags=re.S)
    offline=re.sub(r'href="\.\./index\.html(?:#[^"]*)?"',
                   'href="../START-HERE.txt"', offline)
    offline=offline.replace('href="./downloads/submission-package.zip"',
                            'href="../START-HERE.txt"')
    offline=offline.replace('Complete offline submission package <span>ZIP ↓</span>',
                            'Offline package instructions <span>TXT ↗</span>')
    entries['exhibit/index.html']=offline.encode()
    for source in RESEARCH.rglob('*'):
        if source.is_file() and '__pycache__' not in source.parts and source.suffix!='.pyc':
            entries['research/'+source.relative_to(RESEARCH).as_posix()]=source.read_bytes()
    for name in ('build_research.py','render_research.py','check_research_package.py'):
        entries['scripts/'+name]=(ROOT/'scripts'/name).read_bytes()
    entries['tests/test_research_model.py']=(ROOT/'tests/test_research_model.py').read_bytes()
    instructions=(
        'FUEL ATLAS — SUBMISSION PACKAGE\n12 November 2026\n\n'
        'START: open exhibit/index.html in a modern browser. No server or network is needed for the interactive model.\n'
        'READ: exhibit/downloads/Final_Project.pdf contains the report, reflection, references and four review rounds.\n'
        'SUBMIT: the interactive exhibit plus Analytical_Reflection.pdf (or DOCX) is the creative-format project.\n'
        'The global flight workspace is separate from this research exhibit. Use the full repository or the hosted main model (network/access required): https://fuel-atlas-east-asia.victorskwei.chatgpt.site/#calculations\n'
        'The full report and reproducibility files are supporting material. The hosted site may require existing access; this ZIP provides an offline alternative.\n\n'
        'REPRODUCE: python3 research/model.py --check\n'
        'TEST: python3 -m unittest discover -s tests -p "test_research_model.py"\n'
        'AUDIT: python3 research/reviews/independent_numerical_check.py\n'
        'VERIFY EXTRACTED FILES: python3 scripts/check_research_package.py\n\n'
        'FULL REBUILD, from the extracted package root (Python 3.11+):\n'
        'python3 -m pip install -r research/publication-requirements.txt\n'
        'python3 scripts/build_research.py\n'
        'python3 scripts/render_research.py\n'
        'python3 scripts/build_research.py --package\n'
        'python3 scripts/check_research_package.py --package artifacts/energy-security-project/submission-package.zip\n'
        'Install Noto Sans or DejaVu Sans, and DejaVu Sans Mono, as system fonts. On Debian/Ubuntu these are provided by fonts-dejavu-core.\n'
        'A clean installation needs network access to install dependencies; the numerical model and included exhibit need none.\n'
        'The scripts automatically use exhibit/ in this ZIP or dist/research/ in the repository. Rebuilt outputs go to artifacts/energy-security-project/.\n\n'
        'BOUNDARY: conditional research scenarios; airport transaction prices and inventories are unknown. Not aircraft dispatch advice.\n'
        'AI-assisted research, drafting, coding and critique are disclosed in the report.\n')
    entries['START-HERE.txt']=instructions.encode()
    checksum={name:hashlib.sha256(value).hexdigest() for name,value in sorted(entries.items())}
    entries['SHA256SUMS.json']=(json.dumps(checksum,indent=2)+'\n').encode()
    target=output/'submission-package.zip'
    with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as archive:
        for name,value in sorted(entries.items()):
            info=zipfile.ZipInfo(name,(2026,11,12,0,0,0)); info.compress_type=zipfile.ZIP_DEFLATED
            info.external_attr=0o644<<16; archive.writestr(info,value)
    shutil.copyfile(target,EXHIBIT/'downloads'/target.name)
    print(f'Packaged {len(entries)} files; {target.stat().st_size:,} bytes: {target}')


if __name__=='__main__':
    parser=argparse.ArgumentParser(); parser.add_argument('--package',action='store_true')
    parser.add_argument('--output',type=Path,default=ARTIFACTS)
    args=parser.parse_args()
    if args.package: package(args.output)
    else:
        figures(); content(); print('Built scientific figures and self-contained research exhibit.')
