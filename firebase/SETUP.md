# Teacher console setup (Firebase): Labs

This is a **second** Firebase project, just for the labs. It's separate from the exhibits' `mmuusd-xr` project, so the two consoles never affect each other.

You only need to do this once. Use your **work** Google account for every step. It takes about 15 minutes.

Before you start, check with your administrator. This project follows the same terms as the exhibits project: no student data, and headsets never sign in or send anything.

## 1. Create the project
1. Go to **console.firebase.google.com**, click **Create a project**, and name it `mmuusd-labs`.
2. When it offers **Google Analytics**, turn it **off**. Decline any other optional extras, such as Gemini.
3. Click **Create project**.

## 2. Create the database
1. In the left menu, go to **Build → Realtime Database → Create database**.
2. Choose the **United States** location.
3. Choose **Start in locked mode**, then click **Enable**.
4. Open the **Rules** tab. Delete what's there, paste the whole contents of `firebase/database.rules.json` (from *this* repository, not the exhibits), and click **Publish**.

## 3. Turn on Google sign-in (for the teacher page only)
1. Go to **Build → Authentication → Get started**.
2. Under **Sign-in method**, choose **Google**, switch it **on**, pick your email as the support email, and click **Save**.
3. Under **Settings → Authorized domains**, click **Add domain** and enter `shaunlangevin.github.io`.

## 4. Connect the website to the project
1. Click the gear icon, then **Project settings**.
2. Under **Your apps**, click the **Web** icon (`</>`). Name it `labs-console`, leave Hosting unchecked, and click **Register app**.
3. You'll see a `firebaseConfig` block. Copy these five values into `js/firebase-config.js`, between the quote marks: `apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`.
   - If `databaseURL` is missing, copy it from the top of the Realtime Database page. It looks like `https://mmuusd-labs-default-rtdb.firebaseio.com`.
4. Upload the changed `js/firebase-config.js` to GitHub.

These values are designed to be public. The database rules are what protect it.

## 5. Network (iboss)
Nothing new if the exhibits console already works: the same addresses cover both projects.
- **Headsets:** `*.firebaseio.com`
- **Teacher Chromebook only:** `*.firebaseapp.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, `apis.google.com`, `accounts.google.com`

## 6. Check it
1. Open `https://shaunlangevin.github.io/mmuusd-labs/teacher.html` and sign in. It opens your own headsets (South End for Shaun, North End for Mike), so you can bookmark it.
2. Press **Run safety check** (bottom of the page). Every line should show a green ✓.
3. Put on a headset and open the lab with its normal ArborXR link (no `?room=`). Headsets already numbered in the exhibits use the same number here. Otherwise, pick its number once on the lab's start page.
4. Press **Eyes up** on the Chromebook. The headset should show the message within a second or two. Press **Resume**.

## What the console can do
- **Everyone:**
  - Eyes up, Wait, Time to finish, Take off headset, and Resume.
  - **Start over on every headset** (two taps), for the next class or pair.
- **The lab:**
  - Guided or Full investigation.
  - Start at Plan (day 2).
  - Which variable.
  - Which sizes students can pick.
  - Language.
  - Changing the path, start or variable starts every headset over.
- **Supports for every headset:** Bigger text, Calm mode, Show numbers, Fire button.
- **One headset (by its sticker number):**
  - Pause it.
  - Give it supports: bigger text, calm, numbers, Fire button, Spanish.

Each setting has a **Default**, which is what the ArborXR link says (normally: guided path, cannon weight, all three sizes, English).

## Rooms
- A headset's number decides which teacher page it follows (`GROUPS` in `js/firebase-config.js`):
  - **South End**, headsets 0–5 → room `south` (Shaun's page opens here)
  - **North End**, headsets 6–11 → room `north` (Mike's page opens here)
- A headset with no number yet waits in the `mmuusd` room.
- A link ending in `?room=<code>` makes that headset follow `teacher.html?room=<code>` instead, and `?room=off` ignores the console.
- Optional: an ArborXR link ending in `?headset=3` sets the number automatically.

## Adding or removing a teacher
The list of teachers lives in two places, and both need the same emails:
- `TEACHERS` in `js/firebase-config.js`
- the `.write` line in `firebase/database.rules.json`. Re-publish it in **Realtime Database → Rules** after editing.

## Turning the console off
Empty `apiKey` in `js/firebase-config.js`. The headsets keep working on their own, exactly as before.
