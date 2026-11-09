# Tests

Run `node tests/run.mjs` from the repo folder. It needs Node 18+ and Playwright with Chromium.

| File | What it checks |
|---|---|
| `physics.test.mjs` | the model's numbers; each variable's effect; equal momentum; trial spread; challenge targets |
| `static.test.mjs` | English and Spanish match; no network or storage code; file sizes; credit |
| `preview.test.mjs` | the whole flow on the screen preview; every panel fits in both languages; link settings |
| `headset.test.mjs` | an emulated Quest 3 (IWER): desk placement, pulling the lanyard, pointing to predict, half and life size, Options, Exit |

The emulator can't check performance, comfort, sound, or how text reads on a real headset.
