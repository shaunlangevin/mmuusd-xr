# Classroom Controls: privacy and safety summary

**What it is:** A teacher page (`teacher.html`) that lets approved staff change settings on the class's Quest headsets during a lesson. For example: switch to Spanish, open dot 5 for everyone, lead a guided tour of the dots, pause one headset, or show "Eyes up." It uses Google Firebase Realtime Database on a district-owned Google account.

## What is stored
- **One small record per room code**, holding only the current settings, for example:
  - `lang: "es"`, `detective: true`, `lock: true`
  - `dot: 5` plus the time it was sent
  - `freeze: "eyes"` plus the time it was sent
  - `tour: true`, `tourDot: 3` (guided tour step), `narrate: 3` (play that dot's recording), `moveWindows: false`
  - `paused: { h3: <time> }`, meaning headset **number 3** (the sticker on the device) is paused. These are device numbers, not students.
- Each button press overwrites the record. No history, logs, or lists of devices or students are kept.

## What is NOT collected
- **No student names, accounts, sign-ins, IDs, answers, progress, audio, video, photos, camera or location data.**
- **Headsets never write to the database.** They only read their room's settings. They don't sign in and aren't given any identifier.
- **Headset numbers stay on the headset.** Each headset saves its own number (0–5, matching its sticker) in its browser so it knows when a pause is meant for it. That number is never sent anywhere. The teacher page can't see which headsets are connected or what they are looking at.
- **No record of where students look or what they open.** Where a student moves a reading panel is remembered only in that headset's memory until the page is closed.
- **No Google Analytics, crash reporting, advertising or tracking code.** Only Firebase's database module (plus sign-in on the teacher page) is included, and it's hosted on our own GitHub site.

## Who can change anything
- **Only two verified district accounts can send commands:** `shaun.langevin@mmuusd.org` and `mike.weber@mmuusd.org`. Google enforces this on its servers (Realtime Database security rules).
- **Anyone else**, including a student who finds the link, can only read the current settings for that one room code. They can't change them, list other rooms or read anything else.

## What can be sent
- **Fixed menu only:**
  - language, progress tracking, Detective mode, walking or seated, size, classroom lock
  - "go to dot 1–20", guided tour step 1–20, "play narration" for dot 1–20
  - pause or unpause headset 0–9
  - whether students can move reading panels
  - four preset freeze messages: Eyes up, Wait for instructions, Take off headset, Time to finish
- **No free text.** The database rules reject anything else, and the headsets also ignore any value not on their own allowed list.
- **It can't** open websites, start the camera or microphone, or see what students see.

## Fail-safe
- If Firebase is unreachable or turned off, headsets work normally on their own.
- Freezes and per-headset pauses expire automatically after 2 hours. "Go to dot" commands are ignored after 10 minutes, tour steps after 3 hours, and "play narration" after 20 seconds.

## Technical notes for IT
- **Default room:** every copy of the exhibit page listens to the default room (`mmuusd`) unless its link ends in `?room=off`, so the read-only connection described here also happens on Chromebooks and iPads that open the page.
- **Network address:** like any website, Google's servers see each headset's network (IP) address when it connects. That's ordinary traffic from a district device with no student login.
- **On the headset itself, the Firebase library keeps two small non-personal items in browser storage:** a connection note (which server address or connection type worked last), and a usage note with the library version and the date. Google may receive that usage note with requests. Neither contains anything about the student.
- **The page's own browser storage:** one item, `xr-headset`, holding the headset's number (for example `3`). Nothing else is stored by the exhibit itself.
- **Live check:** a "Run safety check" button on the teacher page tests the rules against the live database. It confirms that a signed-out connection can't write or pause headsets, that the whole database can't be read or listed, and that free text, unknown values, custom messages, out-of-range steps and anything other than a headset number in a pause are rejected.
