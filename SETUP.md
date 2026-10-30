# Teacher console setup (Firebase)

You only need to do this once. Use your **work** Google account for every step.

## 1. Create the project
1. Go to **console.firebase.google.com**, click **Create a project**, and name it `mmuusd-xr`.
2. When it offers **Google Analytics**, turn it **off**. Decline any other optional extras, such as Gemini.
3. Click **Create project**.

## 2. Create the database
1. In the left menu, go to **Build → Realtime Database → Create database**.
2. Choose the **United States** location.
3. Choose **Start in locked mode**, then click **Enable**.
4. Open the **Rules** tab. Delete what's there, paste the whole contents of `firebase/database.rules.json`, and click **Publish**.

## 3. Turn on Google sign-in (for the teacher page only)
1. Go to **Build → Authentication → Get started**.
2. Under **Sign-in method**, choose **Google**, switch it **on**, pick your email as the support email, and click **Save**.
3. Under **Settings → Authorized domains**, click **Add domain** and enter `shaunlangevin.github.io`.

## 4. Connect the website to the project
1. Click the gear icon, then **Project settings**.
2. Under **Your apps**, click the **Web** icon (`</>`). Name it `xr-console`, leave Hosting unchecked, and click **Register app**.
3. You'll see a `firebaseConfig` block. Copy these five values into `js/firebase-config.js`, between the quote marks: `apiKey`, `authDomain`, `databaseURL`, `projectId`, `appId`.
   - If `databaseURL` is missing, copy it from the top of the Realtime Database page. It looks like `https://mmuusd-xr-default-rtdb.firebaseio.com`.
4. Upload the changed `js/firebase-config.js` to GitHub.

These values are designed to be public. The database rules are what protect it.

## 5. Network (iboss)
Allow these addresses:
- **Headsets:** `*.firebaseio.com` (this is the only one headsets need).
- **Teacher Chromebook only:** `*.firebaseapp.com`, `identitytoolkit.googleapis.com`, `securetoken.googleapis.com`, `apis.google.com`, `accounts.google.com`.

## 6. Check it
1. Open `https://shaunlangevin.github.io/mmuusd-xr/teacher.html` and sign in. It opens your own headsets (South End for Shaun, North End for Mike), and you can bookmark it.
2. Press **Run safety check**. Every line should show a green ✓.
3. Every headset uses the same normal ArborXR link (with no `?room=`). Nothing needs to change in ArborXR.
4. Put on a headset, pick its number on the start screen (the first time only), then press **Eyes up** on the Chromebook. The headset should show the message within a second or two.

## Rooms
- A headset's number decides which teacher page it follows (`GROUPS` in `js/firebase-config.js`):
  - **South End**, headsets 0–5 → room `south` (Shaun's page opens here)
  - **North End**, headsets 6–11 → room `north` (Mike's page opens here)
- So both ends can run lessons at the same time without affecting each other. The **Headsets** buttons at the top of the teacher page switch between the two ends.
- A headset that hasn't picked a number yet waits in the `mmuusd` room.
- Special case: a link ending in `?room=<code>` makes that headset follow `teacher.html?room=<code>` instead, whatever its number.
- A link ending in `?room=off` ignores the console completely.

## Headset numbers
- Each headset asks "Which headset is this?" once, on its start screen. The number is saved only in that headset's browser and is never sent anywhere. Students can change it later in **Options**, which the classroom lock hides.
- If a headset forgets its number (for example after its browser data is cleared), it just asks again.
- Optional: an ArborXR link ending in `?headset=3` sets the number automatically.
- More headsets or another school: add or edit a group in `GROUPS` in `js/firebase-config.js` (numbers can go up to 19).

## Adding or removing a teacher
The list of teachers lives in two places, and both need the same emails:
- `TEACHERS` in `js/firebase-config.js`
- the `.write` line in `firebase/database.rules.json`. Re-publish it in **Realtime Database → Rules** after editing.

## Turning the console off
Empty `apiKey` in `js/firebase-config.js`. The headsets keep working on their own.
