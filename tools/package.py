"""Build a site-update zip for Shaun to drag into GitHub (for Claude or a developer).

    python3 tools/package.py <short-label> [extra paths ...] [--out DIR]

- Stamps version.json with the date/time (US Eastern) and the label. ?debug=1 shows it as "site: …".
- The zip is named mmuusd-xr_YYYY-MM-DD_HHMM_<label>.zip, with one top-level folder of the same name.
- It always includes the code, the docs, the tests, the tools and each exhibit's text files
  (exhibit.json, *.md, index.json). Models and audio go in only when you list them as extra paths,
  for example exhibits/hammurabi/audio or exhibits/rosetta-stone/model.glb.
- GitHub's web upload takes at most 100 files at a time, so the script warns if the zip has more.
"""
import json, os, re, sys, zipfile
from datetime import datetime
from zoneinfo import ZoneInfo

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
args = sys.argv[1:]
out_dir = '/mnt/user-data/outputs'
if '--out' in args:
    i = args.index('--out'); out_dir = args[i + 1]; del args[i:i + 2]
if not args:
    sys.exit(__doc__)
label = re.sub(r'[^a-z0-9-]+', '-', args[0].lower()).strip('-')
extras = args[1:]

now = datetime.now(ZoneInfo('America/New_York'))
stamp = now.strftime('%Y-%m-%d_%H%M')
name = f'mmuusd-xr_{stamp}_{label}'
with open(os.path.join(ROOT, 'version.json'), 'w') as f:
    json.dump({'version': now.strftime('%Y-%m-%d %H:%M'), 'label': label}, f)
    f.write('\n')

files = ['index.html', 'teacher.html', 'README.md', 'RECORDING-SCRIPT.md', 'version.json']
for folder in ['js', 'firebase', 'vendor', 'fonts', 'tests', 'tools']:
    for dp, _, fs in os.walk(os.path.join(ROOT, folder)):
        files += [os.path.relpath(os.path.join(dp, x), ROOT) for x in fs if not x.startswith('.') and '__pycache__' not in dp]
files.append('exhibits/index.json')
for ex in sorted(os.listdir(os.path.join(ROOT, 'exhibits'))):
    d = os.path.join(ROOT, 'exhibits', ex)
    if os.path.isdir(d):
        files += [f'exhibits/{ex}/{x}' for x in sorted(os.listdir(d)) if x == 'exhibit.json' or x.endswith('.md')]
for e in extras:
    p = os.path.join(ROOT, e)
    if os.path.isdir(p):
        for dp, _, fs in os.walk(p):
            files += [os.path.relpath(os.path.join(dp, x), ROOT) for x in fs if not x.startswith('.')]
    elif os.path.isfile(p):
        files.append(e)
    else:
        sys.exit(f'not found: {e}')
files = sorted(set(f for f in files if os.path.isfile(os.path.join(ROOT, f))))

os.makedirs(out_dir, exist_ok=True)
zpath = os.path.join(out_dir, name + '.zip')
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(os.path.join(ROOT, f), f'{name}/{f}')
big = [f for f in files if os.path.getsize(os.path.join(ROOT, f)) > 25 * 1024 * 1024]
print(zpath, f'({len(files)} files, {os.path.getsize(zpath) / 1e6:.1f} MB)')
if len(files) > 100: print('WARNING: more than 100 files; GitHub web upload takes 100 at a time. Split it.')
if big: print('WARNING: over 25 MB (GitHub web upload limit):', big)
