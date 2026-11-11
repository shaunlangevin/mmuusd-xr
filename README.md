# Automated tests

These checks make sure a change to one exhibit or feature doesn't quietly break another. They run in Node with Playwright and a headset emulator (IWER), so no headset is needed. The website itself never loads anything in this folder.

**Run everything** (about 6 minutes), from the repo folder:

```
node tests/run.mjs
```

**Run part of it:** `node tests/run.mjs static rules` (by file), or `node tests/run.mjs --grep tour` (by test title).

**Needs:** Node 18 or newer, and Playwright with Chromium (`npm i -g playwright`, then `npx playwright install chromium`).

## What's covered

| File | What it checks |
|---|---|
| `static.test.mjs` | Every exhibit's text has English and Spanish, dots have sensible positions, panels aren't too wordy, model files are under GitHub's 25 MB limit, audio files are named right, kits point at real artifacts, both languages have the same interface words, all JavaScript parses, and privacy guards: no trackers, no outside scripts, no camera/microphone/location, headsets never write to the database, and only the documented browser-storage keys. |
| `rules.test.mjs` | The database rules, run offline: only the two verified teachers can write, every console command is accepted, junk, free text, names and out-of-range values are rejected. Also checks that the rules, the headset filter (`classroom.js`) and the console all use the same fields. |
| `viewer.test.mjs` | The Chromebook/iPad page: every exhibit loads, every dot lands on the model and opens in both languages, headset panels fit without shrinking text much, Notice first, keyboard and screen-reader access, the text page, the supports, and switching kits from the console. |
| `headset.test.mjs` | An emulated Quest 3: opening, hiding and moving panels, the guided tour, freezes and per-headset pauses, headset numbers choosing the room, the practice card, supports sent from the console, and passthrough anchors (the stone stays put through a recentre and comes back after the headset sleeps). |
| `teacher.test.mjs` | The teacher page: who can sign in, and exactly what each button sends. |

## What it can't check

Real Quest performance and comfort, audio autoplay rules on the headset, real recentring and sleep, whether the Quest Browser has text-to-speech voices, and the live database rules on Google's servers. Use a real headset (`?debug=1` shows diagnostics) and the teacher page's **Run safety check** for those.

`lib/` holds the test doubles: a fake Firebase database and sign-in, fake speech voices, and the IWER headset emulator (`iwer.min.js`, MIT license, from the `iwer` npm package).
