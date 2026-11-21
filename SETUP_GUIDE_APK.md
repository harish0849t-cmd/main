# Aqua Farm — Android APK with Google Sheets (no hosting, no cost)

What you end up with: an **`.apk` file** you install on Android phones. Data is kept in **your own Google Sheet**. Nothing is hosted by you.

| Piece | What it is | Cost |
|---|---|---|
| The APK | Built for you by GitHub from this folder | ₹0 |
| The database | A Google Sheet + a small Google script (Apps Script) | ₹0 |

Allow about **45 minutes** the first time.

---

## Step 1 — Create the Google Sheet and its script (15 min)

Use the Google account that will always be available (e.g. the owner's).

1. Open **https://sheets.new** → a blank spreadsheet. Name it **Aqua Farm Data**.
2. Menu **Extensions → Apps Script**. A code editor opens.
3. Delete everything in the editor. Open **`apps-script/Code.gs`** from this folder, copy **all** of it, paste it in. Click the 💾 Save icon.
4. Click **Deploy → New deployment**.
   - Click the ⚙ gear next to "Select type" → **Web app**.
   - **Execute as:** *Me*.
   - **Who has access:** *Anyone*.
   - Click **Deploy**. Google asks you to **Authorize access** → choose your account → *Advanced* → *Go to … (unsafe)* → **Allow**. (This is your own script; the warning is normal.)
5. Copy the **Web app URL** (starts with `https://script.google.com/macros/s/…/exec`).

> "Anyone" only lets people *reach* the script. Every request still needs a login, and passwords are stored scrambled (hashed). Partner money data is only sent to partner accounts.

**If you change Code.gs later:** Deploy → **Manage deployments** → ✏ edit → Version: *New version* → Deploy. (The URL stays the same.)

---

## Step 2 — Put your Sheet link into the app (2 min)

1. Open **`sheets-config.js`** in Notepad.
2. Paste the URL between the quotes:
   ```js
   export const sheetsConfig = {
     url: 'https://script.google.com/macros/s/AKfycb.../exec',
   };
   ```
3. Save.

*(Leave it empty to try the app in Demo mode on one phone.)*

---

## Step 3 — Get your APK built free by GitHub (15 min)

1. Create a free account at **https://github.com** and click **New repository**. Name it `aqua-farm`. Choose **Private**. Create.
2. Click **uploading an existing file**. Drag in **everything in this folder** (all files, the `apps-script` folder and the hidden `.github` folder). If the hidden folder will not drag, use *Add file → Create new file*, type the name `.github/workflows/build-apk.yml` and paste the contents of that file. Click **Commit changes**.
3. Click the **Actions** tab. A run called **Build Android APK** starts (about 5–8 minutes). If nothing starts: select it on the left and press **Run workflow**.
4. When it shows a green ✔, open the run and scroll to **Artifacts** → download **aquafarm-apk** (a zip). Unzip it: **`app-debug.apk`** is your app.

To release an update: change files in the repository (or upload new ones) and the APK is rebuilt automatically.

---

## Step 4 — Install on each Android phone

1. Send `app-debug.apk` to the phone (WhatsApp, Google Drive, USB).
2. Tap it. If Android asks, allow **Install unknown apps** for that app (WhatsApp / Files).
3. Open **Aqua Farm**.

---

## Step 5 — First sign-in and team

1. **You (owner) open the app first** and tap **New here? Create account**. **The first account ever created becomes the Partner (owner).** Do this before sharing the APK.
2. Each other partner and employee installs the app and creates an account. They see **Waiting for approval**.
3. You: round letter (top right) → **Team & roles** → choose each person's role (Partner / Manager / Employee).
4. Add partners, tanks (Quick setup), and feed items as in the old guide.

**Forgot password:** open the Google Sheet → tab **users** → delete that person's row → they create the account again, and you set their role again.

---

## What is different from the Firebase version (please read)

- **Not instant:** phones refresh about every **15 seconds** (and straight after you save). Your own entries appear immediately on your phone.
- **Offline:** entries made with no signal are saved on the phone and sent when signal returns. Do not clear the app's data or uninstall while entries are waiting.
- **Two people changing the same record at the same time:** the last one saved wins (stock and feed totals are added safely, so those never get lost).
- **Reading the data in the Sheet:** each tab has the columns `id | data | updated`. `data` holds the record as text (JSON). It is for backup and checking, not for editing by hand. For normal reports use **Partners → Accounts (Excel)**.
- **Reports:** the *Farm report* is shared as an `.html` page (open it in Chrome, then ⋮ → Share/Print → Save as PDF). *Accounts (Excel)* and *WhatsApp summary* open the Android share sheet.
- **Limits:** Google gives a free account roughly 90 minutes/day of script time. The app only asks for full data when something changed, so a small farm stays far below this.
- **Android only.** iPhones cannot install an APK.
- This is a **debug-signed APK**: it installs fine for your own team, but it cannot be uploaded to the Play Store as is.
- Security is weaker than Firebase rules: roles are enforced by the script, and anyone with edit access to the Sheet can read everything. **Keep the Sheet's sharing private**.

## Two-phone trial (do this before relying on it)

1. Phone A (owner) and Phone B (another person) install the APK.
2. B creates an account; A approves B as *Employee*.
3. B logs a feeding. Within ~15 seconds A sees stock and "Today's feeding" change.
4. B turns on airplane mode, logs another feeding, turns it off: it should appear on A.
5. Confirm B cannot see **Partners** or **Employees**.
6. Open the Sheet: tabs appear and fill with rows.

If something fails, note the exact message and which step.

## Files

| File | Purpose |
|---|---|
| `apps-script/Code.gs` | The backend: logins, roles, saving/loading to the Sheet |
| `sheets-config.js` | Your script link (Step 2) |
| `db.js` | App side of the sync (queue, offline, polling) |
| `package.json`, `capacitor.config.json` | Describe the Android wrapper |
| `.github/workflows/build-apk.yml` | Builds the APK on GitHub |
| everything else | The app screens, unchanged |
