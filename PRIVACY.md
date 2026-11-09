# Privacy: MMUUSD Labs

- The labs collect **no student data**.
- Headsets don't sign in, and nothing a student does is sent anywhere or saved.
- This includes predictions, readings, answers and settings. A reload starts fresh.
- There is no analytics and no camera or microphone access.

## The teacher console (optional)
- It's off until `js/firebase-config.js` is filled in (see `firebase/SETUP.md`).
- When it's on, each headset **listens** to a tiny settings record for its room in the labs' own Firebase project (`mmuusd-labs`). It never writes, so the database can't learn anything from a headset.
- The record holds only lab settings: path, variable, sizes, language, supports, freeze or pause, and "start over".
- Headsets are named by the number on their sticker, never by student.
- Only teachers on the list can change the record, after signing in with a verified district Google account.
- The database rules reject anything else, including free text, names, and unknown values. The teacher page's **Run safety check** tests this against the live database.

## What the headset keeps
- The headset's own number (the sticker), saved in its browser as `xr-headset`, the same setting the exhibits use. It is a device number, not a student, and it is never sent anywhere.
- Nothing else is kept.

## Checks
The automated tests (`tests/static.test.mjs`, `tests/rules.test.mjs`, `tests/console.test.mjs` and the headset tests) check all of this. They fail if:
- the headset code ever writes to the database, signs in, or uses other network or storage functions;
- it keeps anything but the headset number;
- the rules, the headset's filter and the teacher page disagree about which fields exist.
