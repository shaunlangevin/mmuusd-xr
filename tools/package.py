"""Build a site-update zip for Shaun to drag into GitHub (for Claude or a developer).

    python3 tools/package.py <short-label> [--model] [--out DIR]

- Stamps version.json with the date/time (US Eastern) and the label.
- The zip is named mmuusd-labs_YYYY-MM-DD_HHMM_<label>.zip, with one top-level folder of the same name.
- It always includes the code, docs, tests, tools, the Firebase rules and the Firebase bundle. The cannon model (8.6 MB) and three.js go in
  only with --model (they rarely change); the first upload needs them.
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
model = '--model' in args
args = [a for a in args if a != '--model']
if not args:
    sys.exit(__doc__)
label = re.sub(r'[^a-z0-9-]+', '-', args[0].lower()).strip('-')
now = datetime.now(ZoneInfo('America/New_York'))
name = f'mmuusd-labs_{now.strftime("%Y-%m-%d_%H%M")}_{label}'
with open(os.path.join(ROOT, 'version.json'), 'w') as f:
    json.dump({'version': now.strftime('%Y-%m-%d %H:%M'), 'label': label}, f); f.write('\n')

files = ['index.html', 'teacher.html', 'README.md', 'PRIVACY.md', 'version.json']
folders = ['js', 'tests', 'tools', 'firebase', 'vendor/firebase'] + (['vendor', 'labs'] if model else [])
for folder in folders:
    for dp, _, fs in os.walk(os.path.join(ROOT, folder)):
        files += [os.path.relpath(os.path.join(dp, x), ROOT) for x in fs if not x.startswith('.') and '__pycache__' not in dp]
files = sorted(set(f for f in files if os.path.isfile(os.path.join(ROOT, f))))
os.makedirs(out_dir, exist_ok=True)
zpath = os.path.join(out_dir, name + '.zip')
with zipfile.ZipFile(zpath, 'w', zipfile.ZIP_DEFLATED) as z:
    for f in files:
        z.write(os.path.join(ROOT, f), f'{name}/{f}')
print(zpath, f'({len(files)} files, {os.path.getsize(zpath) / 1e6:.1f} MB)')
if len(files) > 100: print('WARNING: more than 100 files; GitHub web upload takes 100 at a time. Split it.')
big = [f for f in files if os.path.getsize(os.path.join(ROOT, f)) > 25 * 1024 * 1024]
if big: print('WARNING: over 25 MB (GitHub web upload limit):', big)
