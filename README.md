# WebXR Exhibits (MMUUSD)

These are life-size 3D artifacts that students can explore on Quest 3 headsets, either in passthrough (the artifact appears in the real classroom) or in a VR gallery. They also work on a Chromebook. The first exhibit is **The Code of Hammurabi**, built for the Grade 5 Ancient Cultures unit (Bend 1: Mesopotamia and the Fertile Crescent).

Students don't sign in, and the app doesn't save or send any student data.

---

## Updating your GitHub copy

1. On your repo page, click **Add file → Upload files**.
2. Drag in **everything inside this folder**, and click **Commit changes**.
3. If GitHub asks about replacing files, that's expected.

A few old files (`js/main.js`, `js/config.js`, `js/content.js`, `js/panels.js`, `models/`) are no longer used. They're harmless, and you can delete them on GitHub whenever you like.

## Links for ArborXR

Add each version you want as its own **WebXR Link** in ArborXR. The settings go at the end of your normal address.

| ArborXR title (suggestion) | Link ending | What it does |
|---|---|---|
| Hammurabi | `/hammurabi-xr/` | All 9 dots visible, with a progress tracker |
| Hammurabi – Detective | `/hammurabi-xr/?detective=on` | Dots start hidden. Students follow clues and point at the right spot to uncover each one |
| Hammurabi – Quick Look | `/hammurabi-xr/?progress=off` | No tracker, just explore |
| Hammurabi – Seated | `/hammurabi-xr/?mode=seated` | The stone appears in front of a seated student. They turn it instead of walking. |
| Hammurabi – Español | `/hammurabi-xr/?lang=es` | Starts in Spanish |
| (any of the above) + lock | add `&lock=1` (or `?lock=1`) | Hides Options, Move and Exit so students can't change things |

You can combine settings, for example `…/hammurabi-xr/?mode=seated&hunt=off&lock=1`.

All settings:

- `lang=en|es`
- `progress=on|off` (the older `hunt=` still works)
- `detective=on|off` (`clues=` also works)
- `mode=walk|seated`
- `size=life|table`
- `lock=1`
- `exhibit=<folder name>`

## iPad and iPhone

Safari on iPad doesn't support the WebXR standard the Quest uses, so on an iPad the page works like this:

1. It shows the touch-screen 3D view with all the dots, panels, hunt and Spanish.
2. A **See it in your room** button opens a copy of the stone (`model.usdz`) in Apple's AR Quick Look. Students point at the floor and walk around the life-size stone.

Inside Apple's viewer, there are no dots or panels. It's just the stone.

To make the `.usdz` for a new exhibit, ask Claude to convert the exhibit's `model.glb`, then add `"usdz": "model.usdz"` to its `exhibit.json`.

## What students can do

- **Dots:** select the 9 numbered dots on the stone. Dots 6–8 are on the back, so walking around pays off.
- **Reading panel:** each dot opens a short reading with a "Think about it" question. In the headset it opens off to the side of the dot, so the stone stays in view. Students can grab the bar above it to move it (later panels open where they put it), or press **Hide** to shrink it to a small tab while the narration keeps playing. Panels with laws show them in plain words first. The original 1915 wording is under **Tell me more**.
- **Extras:**
  - Dot 3 shows three real cuneiform signs.
  - Dot 5 shows a then-and-now map.
  - Dot 9 shows a height comparison next to the stone.
- **Track my progress:** opened dots turn green, an "Explored: 3 of 9" tracker sits above the toolbar, and exploring all 9 shows a final big question.
- **Detective mode:** the dots start hidden. A clue card above the tracker shows one clue at a time, such as "Near the bottom of the front, find the smooth spot where writing was rubbed away." When a student points near the right spot, the dot pops up, and selecting it opens its panel and moves on to the next clue. A **Hint** button uncovers the current dot for students who are stuck. On a Chromebook or iPad, students hover or tap near the spot. Clue wording lives in `exhibit.json` (`"clue"`), and `"clueRadius"` (in metres, default 0.2) sets how close the student has to point.
- **Listen:** this button appears on any panel that has an audio clip (see below).
- **Saved spot (passthrough):** the stone is pinned to the real room, so it stays put even if the headset recentres (for example after being taken off and put back on). In walking mode each headset also remembers where the stone was placed, separately for life size and table size, and puts it back there next time. **Move** places it somewhere new and remembers the new spot. If the saved spot can't be found within a few seconds (a different room, or the headset's room setup was reset), the student just places it as usual.
- **Toolbar:** Turn ‹ / Turn ›, Move, Options, Exit. The right thumbstick also turns the stone, and the toolbar follows the student if they walk away.
- **Options in the headset:** language, track my progress, Detective mode, walking or sitting, life size or table size.

## Teacher console (optional)

`teacher.html` lets approved staff (Shaun and Mike) control every headset in a room from a Chromebook:

- freeze screens with preset messages, or pause one headset by its number
- run a **guided tour**: Start, ◀ Previous, Next ▶ or pick a step, play the narration on every headset, End tour
- send everyone to a dot
- switch language, Detective mode, progress, seated/walking, size, the classroom lock, and whether students can move reading panels

Every headset uses the same normal link. Each headset asks for its number once (the sticker on it) and keeps it in its own browser. The number decides which teacher page it follows: **South End 0–5** (Shaun) and **North End 6–11** (Mike), so both ends can run at the same time. Bookmark `teacher.html`. It opens to your own headsets and has buttons to switch ends. Headsets only **read** settings and never send anything back.

- Setup: `firebase/SETUP.md`
- Privacy and safety summary (for administrators or the SDPC file): `firebase/PRIVACY.md`

Until `js/firebase-config.js` is filled in, the console is simply off and everything else works as before.

## Adding the audio

Record from **RECORDING-SCRIPT.md** and name the files exactly as listed. Put them in:

- `exhibits/hammurabi/audio/en/` → `01.mp3` … `09.mp3`, `finish.mp3`
- `exhibits/hammurabi/audio/es/` → the same names

Upload them to the same folders on GitHub. The **Listen** button appears by itself for every clip that exists.

## Changing the words

All the text, in English and Spanish, is in `exhibits/hammurabi/exhibit.json`. You can edit it in GitHub's file editor (pencil icon). It's picky about quotes and commas, so change only the words between the quote marks.

Each dot also has:

- `h`: its height on the stone, from 0 (bottom) to 1 (top)
- `angle`: where it sits around the stone, where 0 is the front (the relief side), 90 is the right side, 180 is the back, and −90 is the left side

## Adding another artifact later

1. Make a new folder in `exhibits/`, for example `exhibits/ziggurat/`, with a `model.glb` and an `exhibit.json` copied from Hammurabi's and edited.
2. Add it to `exhibits/index.json`.
3. Link to it with `?exhibit=ziggurat`. When there's more than one exhibit, the start screen also shows a picker.

You can also give an exhibit a 360° background for the VR gallery by putting an equirectangular image in its folder and adding `"backdrop": "yourimage.jpg"` to its `exhibit.json`.

## Credits and licenses

- **3D model:** "Stela of Hammurabi (replica)" by Peter Der Manuelian, Harvard Museum of the Ancient Near East (object 1901.10.1), licensed **CC BY-NC-SA 4.0**. The sign, floor and base were removed, the bottom was capped, and the side textures were resized for headsets. Under that license, this adapted model (`exhibits/hammurabi/model.glb`) is shared under the same CC BY-NC-SA 4.0 terms, for non-commercial use, with credit.
- **Law quotations:** L. W. King's 1915 English translation (public domain).
- **Facts:** the Louvre's page on the Code of Hammurabi and the Wikipedia article "Code of Hammurabi". The unit alignment comes from the MMUUSD Grade 5 Ancient Cultures planning guide.
- **Code libraries:** three.js (MIT license, in `vendor/`) and the Noto Sans Cuneiform font (SIL Open Font License, in `fonts/`).
