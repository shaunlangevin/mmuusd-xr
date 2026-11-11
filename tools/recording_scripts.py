"""Rebuild an exhibit's two recording scripts from its exhibit.json, so the scripts always match the panels.

    python3 tools/recording_scripts.py <exhibit-id>

Writes exhibits/<id>/RECORDING-SCRIPT.md (one reading clip per dot, plus finish)
and exhibits/<id>/EXTRA-RECORDING-SCRIPT.md ("Look closely" prompts and "Tell me more").
Run it again whenever the words on a panel change, and re-record the clips whose text changed.
"""
import json, os, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if len(sys.argv) != 2:
    sys.exit(__doc__)
ex_id = sys.argv[1]
d_path = os.path.join(ROOT, 'exhibits', ex_id)
ex = json.load(open(os.path.join(d_path, 'exhibit.json'), encoding='utf-8'))
dots, title = ex['dots'], ex['title']['en']
n = len(dots)
nn = lambda i: f'{i + 1:02d}'
L = {
    'en': {'head': 'English', 'plain': 'In plain words', 'think': 'Think about it', 'look': 'Look closely.',
           'starters': 'Talk about it with the people near you. You can start with: I notice… I think it might be… because…',
           'orig': lambda src: f'Here are the original words, from {src}, translated into English:'},
    'es': {'head': 'Español (have a Spanish speaker check the translation first)', 'plain': 'En palabras sencillas', 'think': 'Piensa', 'look': 'Mira con atención.',
           'starters': 'Hablen de esto con las personas que están cerca. Pueden empezar con: Yo noto… Creo que podría ser… porque…',
           'orig': lambda src: f'Estas son las palabras originales, de {src}, traducidas al español de una traducción en inglés:'},
}
def end(s):   # a heading read aloud ends with one full stop (no "?.")
    s = s.strip(); return s if s[-1:] in '.?!' else s + '.'
def quote(paras):
    return '\n>\n'.join('> ' + p for p in paras if p) + '\n'

# ── readings ──
out = [f'# Recording script: {title}', '',
       'One MP3 per dot, per language. Read the text under each heading exactly as written, at a calm pace. Each clip is about 30–45 seconds.', '',
       '**Where the files go:**', '',
       f'- English: `exhibits/{ex_id}/audio/en/01.mp3` … `{nn(n - 1)}.mp3`, plus `finish.mp3`',
       f'- Spanish: `exhibits/{ex_id}/audio/es/01.mp3` … `{nn(n - 1)}.mp3`, plus `finish.mp3`', '',
       'A **Listen** button appears automatically for any clip that exists, so you can add them a few at a time. If you change the words on a panel later, re-record that clip so the audio still matches.', '',
       'The *Look closely* prompts, the *Tell me more* text and any original quotes are not in these clips, to keep each one short (they are in `EXTRA-RECORDING-SCRIPT.md`). Words in [brackets] are pronunciation help: say the word, not the brackets.', '']
for lang in ('en', 'es'):
    t = L[lang]; out += [f'## {t["head"]}', '']
    for i, d in enumerate(dots):
        paras = [end(d['title'][lang]), d['text'][lang]]
        if d.get('facts'): paras.append(' '.join(f'{f["k"][lang]} {end(f["v"][lang])}' for f in d['facts']))
        if d.get('law'): paras.append(f'{t["plain"]}: {d["law"]["plain"][lang]}')
        paras.append(f'{t["think"]}: {d["think"][lang]}')
        out += [f'### `{nn(i)}.mp3` — {d["title"][lang]}', '', quote(paras)]
    f = ex['finish']
    out += [f'### `finish.mp3` — {f["title"][lang]}', '', quote([end(f['title'][lang]), f['text'][lang], f['think'][lang]])]
open(os.path.join(d_path, 'RECORDING-SCRIPT.md'), 'w', encoding='utf-8').write('\n'.join(out).rstrip() + '\n')

# ── prompts and Tell me more ──
more = [(i, d) for i, d in enumerate(dots) if d.get('more') or (d.get('law') or {}).get('original')]
out = [f'# Extra recordings: {title}', '',
       'Two kinds of short clips that go with the reading clips. Use the **same voice and settings** as the readings so it all sounds like one narrator. Send the MP3s to Claude, who will match the volume, name them and place them.', '',
       '## Part 1: "Look closely" prompts', '',
       'These play **before** the reading, when a student opens a dot and sees the *Look closely* prompt. They add a **Listen** button to the prompt. Each is about 10–15 seconds. Leave a short pause after the question.', '',
       f'Files: `exhibits/{ex_id}/audio/en/01-notice.mp3` … `{nn(n - 1)}-notice.mp3`, and the same names in `audio/es/`.', '',
       'Every prompt ends with the same sentence starters. Read them each time, or record them once and Claude will add them to each clip.', '']
for lang in ('en', 'es'):
    t = L[lang]; out += [f'### {"English" if lang == "en" else "Español"}', '']
    for i, d in enumerate(dots):
        out += [f'#### `{nn(i)}-notice.mp3` (dot {i + 1}: {d["title"][lang]})', '', quote([t['look'], d['notice'][lang], t['starters']])]
out += ['## Part 2: "Tell me more"', '',
        f'These play when a student opens **Tell me more** and presses **Listen to more**. Only {len(more)} dots have a Tell me more section. Each clip reads the extra fact, then the original words (if the dot has them), and runs about 15–30 seconds.', '',
        f'Files: `exhibits/{ex_id}/audio/en/NN-more.mp3` (the dot numbers below), and the same names in `audio/es/`.', '']
if any((d.get('law') or {}).get('original') for _, d in more):
    out += ['Read the original words a little more slowly; they\'re old-fashioned on purpose. The Spanish original words are a new Spanish translation of the English translation. Please have your Spanish speaker check them.', '']
for lang in ('en', 'es'):
    t = L[lang]; out += [f'### {"English" if lang == "en" else "Español"}', '']
    for i, d in more:
        paras = [d['more'][lang]] if d.get('more') else []
        o = (d.get('law') or {}).get('original')
        if o: paras += [t['orig'](d['law']['source'][lang]), o[lang] if isinstance(o, dict) else o]
        out += [f'#### `{nn(i)}-more.mp3` (dot {i + 1}: {d["title"][lang]})', '', quote(paras)]
open(os.path.join(d_path, 'EXTRA-RECORDING-SCRIPT.md'), 'w', encoding='utf-8').write('\n'.join(out).rstrip() + '\n')
print(f'wrote {ex_id}: {n} readings + finish, {n} prompts, {len(more)} Tell me more')
