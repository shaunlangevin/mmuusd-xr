# Classroom Controls: privacy and safety summary

**What it is:** A teacher page (`teacher.html`) that lets approved staff change settings on the class's Quest headsets during a lesson. For example: switch to Spanish, open dot 5 for everyone, or show "Eyes up." It uses Google Firebase Realtime Database on a district-owned Google account.

## What is stored
- **One small record per room code**, holding only the current settings, for example:
  - `lang: "es"`, `detective: true`, `lock: true`
  - `dot: 5` plus the time it was sent
  - `freeze: "eyes"` plus the time it was sent
- Each button press overwrites the record. No history, logs, or lists of devices or students are kept.

## What is NOT collected
- **No student names, accounts, sign-ins, IDs, answers, progress, audio, video, photos, camera or location data.**
- **Headsets never write to the database.** They only read their room's settings. They don't sign in and aren't given any identifier.
- **No Google Analytics, crash reporting, advertising or tracking code.** Only Firebase's database module (plus sign-in on the teacher page) is included, and it's hosted on our own GitHub site.

## Who can change anything
- **Only two verified district accounts can send commands:** `shaun.langevin@mmuusd.org` and `mike.weber@mmuusd.org`. Google enforces this on its servers (Realtime Database security rules).
- **Anyone else**, including a student who finds the link, can only read the current settings for that one room code. They can't change them, list other rooms or read anything else.

## What can be sent
- **Fixed menu only:**
  - language, progress tracking, Detective mode, walking or seated, size, classroom lock
  - "go to dot 1–20"
  - four preset freeze messages: Eyes up, Wait for instructions, Take off headset, Time to finish
- **No free text.** The database rules reject anything else, and the headsets also ignore any value not on their own allowed list.
- **It can't** open websites, start the camera or microphone, or see what students see.

## Fail-safe
- If Firebase is unreachable or turned off, headsets work normally on their own.
- Freeze messages expire automatically after 2 hours. "Go to dot" commands are ignored after 10 minutes.

## Technical notes for IT
- **Network address:** like any website, Google's servers see each headset's network (IP) address when it connects. That's ordinary traffic from a district device with no student login.
- **On the headset itself, the Firebase library keeps two small non-personal items in browser storage:** a connection note (which server address or connection type worked last), and a usage note with the library version and the date. Google may receive that usage note with requests. Neither contains anything about the student.
- **Live check:** a "Run safety check" button on the teacher page tests the rules against the live database. It confirms that a signed-out connection can't write, that the whole database can't be read or listed, and that free text, unknown values and custom messages are rejected.
