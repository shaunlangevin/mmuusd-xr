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
1. Open `https://shaunlangevin.github.io/mmuusd-xr/teacher.html` and sign in.
2. Pick a room code (for example `5a`) and press **Run safety check**. Every line should show a green ✓.
3. Copy the **Headset link** (it ends in `?room=5a`) into ArborXR as a WebXR Link. You can add other settings too, for example `?room=5a&detective=on`.
4. Put on a headset with that link, then press **Eyes up** on the Chromebook. The headset should show the message within a second or two.

## Adding or removing a teacher
The list of teachers lives in two places, and both need the same emails:
- `TEACHERS` in `js/firebase-config.js`
- the `.write` line in `firebase/database.rules.json`. Re-publish it in **Realtime Database → Rules** after editing.

## Turning the console off
Empty `apiKey` in `js/firebase-config.js`. The headsets keep working on their own.
