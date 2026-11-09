# MMUUSD Labs

Interactive physics labs for the district's Quest 3 headsets (WebXR, passthrough). They're separate from the artifact exhibits (`mmuusd-xr`), so a lab update can never break an exhibit in use.

- **Site:** `https://shaunlangevin.github.io/mmuusd-labs/`
- **Lab 1: Cannon Recoil Lab.** Grade 6, Forces and Motion, Bend 1 (MS-PS2-2; Newton's 3rd law from MS-PS2-1).

## What students do

There are two paths. The teacher chooses, through the link or the teacher console.

**Guided (the default):** one sentence and one big button at a time, about 8 minutes, so students can work without constant help.

1. **Try it.** Pull the lanyard to fire once.
2. **Which push was bigger?** Guess, then watch slow motion. It stops on the two push arrows so students can compare them, and then gives the answer (Newton's 3rd law).
3. **Compare two settings.** A light cannon, then a heavy one (or another variable with `lock`). For each:
   - place a prediction flag
   - fire
   - **Record your results** (read the ruler, write it on the sheet, then press "I recorded it")
   - the crew rolls the cannon back to 0
4. **Explain.** Look at the two labelled flags, then tell a partner in one sentence which rolled back farther and why, and write it down.

**Full investigation (`path=full`):**

1. Try it.
2. Which push was bigger?
3. **Plan:** choose one variable. The panel lists what stays the same and gives sentence frames.
4. **Test:**
   - For each level: a prediction flag, then 3 trials.
   - After each shot, a **Record your results** step; "I recorded it" rolls the cannon back.
   - There's also a table, slow motion and arrows.
   - Partners swap roles after each row.
5. **Explain.**
6. **Challenge:** land the cannon on a target line.

**Slow motion** runs on one clock, so the ball and the cannon start moving at the same instant. The first 1/70 s is slowed about 160 times, then the roll plays 4 times slower than real life. With arrows on, it pauses on the two pushes, and the arrows fade slowly instead of vanishing. In a live shot with arrows on, they stay up for about 2 seconds.

**Options → Start over (next pair)** clears everything for the next students; it takes two taps, so it can't happen by accident.

**In the headset**

- **Firing:** students pull the lanyard handle. They can grab it with the controller's grip button, pinch it or pull the trigger at the handle, point at it from a distance, or grab it with a closed hand when hand tracking is on. A firm 12 cm tug fires; the handle lights up when a hand is close enough to grab it. The handle only appears when a shot is allowed.
- **Start line:** after "I recorded it", and before every shot, the cannon rolls back to the start line (0 cm), the way a crew pushed it back after recoil.
- **The ball:** it hits the sandbags, falls, bounces and rolls to a stop.
- **Powder:** cloth cartridge bags of 0.4 kg each, as in the Civil War, with a powder keg beside them. Three bags (1.2 kg) is about a real 12-pounder's full charge.
- **The panel:** it floats like a whiteboard above the lab, or beside it on the right when that would be too high, so it never covers the cannon. Its bottom edge stays put when its content changes.
- **Moving things by hand:**
  - **The lab:** a round knob with four arrows sits at the front left of the lab (on the desk at desk size, at waist height for half and life size). Grab it (grip, trigger, pinch or a closed hand, or point at it and pull the trigger) and slide the lab. It keeps facing the student, and it's pinned again where it's let go. At desk size it can also be lifted, to sit on a real desk.
  - **The panel:** a dotted bar under the panel moves it the same way. It then stays in that spot, beside the lab, until the lab is moved or placed again.
  - **Options → Place it again** still starts placement over (pointing at the floor).
- **Staying in place:** the lab is pinned to the real room with a WebXR anchor, and a copy is saved on the headset. If the headset loses the anchor (for example after it is taken off to write), the lab comes back to the same spot. The copy's reference code is kept only in memory.

## Teacher console (optional)

`teacher.html` lets a signed-in teacher change the lab on every headset in their group from a Chromebook, during class:

- **Everyone:** Eyes up, Wait, Time to finish, Take off headset, Resume, and Start over on every headset.
- **The lab:** path (guided or full), start at Plan, variable, sizes, language.
- **Supports:** for every headset, or for one headset by its sticker number. Pause one headset.

It uses its own Firebase project (`mmuusd-labs`), separate from the exhibits'. Headsets only listen and never send anything. It's off until `js/firebase-config.js` is filled in. Setup: `firebase/SETUP.md`.

A console setting wins over the link while it's set; **Default** on the console goes back to what the link says. Headsets follow their group by the number on their sticker (the same number as in the exhibits).

## Link settings (ArborXR WebXR link)

| Setting | Example | What it does |
|---|---|---|
| `path` | `path=full` | the full investigation (planning, 3 trials per level, table, challenge); without it, the guided path |
| `lang` | `lang=es` | Spanish |
| `sizes` | `sizes=desk,half` | which sizes students may pick (desk 1:7, half 1:2, life 1:1) |
| `size` | `size=half` | the starting size |
| `lock` | `lock=powder` | the variable the class tests (guided: the variable compared; the default is the cannon's weight) |
| `text` | `text=big` | Bigger text |
| `calm` | `calm=on` | Calm mode: a soft pop, no smoke |
| `number` | `number=on` | Show number: the reading appears in the magnifier and table |
| `fire` | `fire=button` | no lanyard; Fire button only |
| `start` | `start=plan` | with `path=full`: skip "Try it" and the 3rd-law question (for day 2) |
| `headset` | `headset=3` | this headset's sticker number (for the teacher console; normally picked once on the start page) |
| `room` | `room=g6-lab` | follow `teacher.html?room=g6-lab` instead of the group; `room=off` ignores the console |
| `debug` | `debug=1` | console logging |

## Files

```
index.html          start page (language, size, supports) and the preview
js/app.js           the lab: sessions, placement, input, the student flow, slow motion
js/physics.js       the physics model (see the comments at the top)
js/scene.js         the cannon, ruler, sandbags, flags, arrows and lanyard, in real-life metres
js/ui3d.js          the headset panels, the magnifier, the ruler texture
js/i18n.js          every word, in English and Spanish
js/audio.js         the boom (made in code, no sound file)
js/classroom.js     the headset side of the teacher console (read-only)
js/headset.js       this headset's sticker number (shared with the exhibits)
js/firebase-config.js  the console's Firebase project, teachers and headset groups
js/teacher.js       the teacher console (teacher.html)
teacher.html        the teacher console page
firebase/           database rules and SETUP.md
labs/cannon/cannon.glb   the cannon model (prepared for the Quest)
vendor/             three.js r170 and the Firebase bundle (no CDNs)
tests/              node tests/run.mjs (needs Playwright with Chromium)
tools/package.py    builds an update zip
```

## Credits

- **Cannon model:** "Civil War Cannon" (https://sketchfab.com/3d-models/civil-war-cannon-77642765da02400cbc8db58b5532ff9e) by Zack_Hawley (https://sketchfab.com/Zack_Hawley), licensed under CC BY 4.0 (http://creativecommons.org/licenses/by/4.0/).
  - Changes: simplified (about 858k to 127k triangles), small parts given plain colours, textures resized to 512, and the wheels set up to turn.
- **three.js:** MIT licence (`vendor/THREE-LICENSE.txt`).
- **Firebase JS SDK** (teacher console only): Apache 2.0 licence (`vendor/firebase/LICENSE.txt`).

## Privacy

Nothing a student does is sent or saved. There are no student accounts and no analytics. With the teacher console on, headsets only listen for their room's settings, and the headset keeps only its own sticker number. See `PRIVACY.md`.
