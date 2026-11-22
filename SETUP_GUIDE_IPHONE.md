# Aqua Farm on iPhone (no App Store, no Apple fee)

The app opens from a web link in Safari and installs to the Home Screen. Data goes to the same Google Sheet as the Android app, so iPhone and Android users share one farm.

GitHub serves the link for free (GitHub Pages). You do not need any other hosting.

---

## Step 1 — Make sure the Sheet link is in the app
`sheets-config.js` must contain your Apps Script link (see SETUP_GUIDE_APK.md, Steps 1–2). If it is empty the app runs in Demo mode.

## Step 2 — Make the repository public (needed for free Pages)
GitHub's free plan only serves Pages from **public** repositories.
1. In your repository: **Settings → General →** scroll to the bottom **Danger Zone → Change repository visibility → Make public**.
2. This makes the app files and your Apps Script link visible to anyone who finds the repository. Nobody can read farm data without a login, but do not put passwords or private notes in the repository.

## Step 3 — Turn on GitHub Pages
1. **Settings → Pages** (left menu).
2. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab. The workflow **Publish iPhone web app** runs by itself after each upload (about 1 minute). If it has not run, open it and press **Run workflow**.
4. When it shows a green ✔, go back to **Settings → Pages**. Your address is shown at the top, like `https://harish0849t-cmd.github.io/REPOSITORY-NAME/`.

## Step 4 — Install on each iPhone
1. Open the address in **Safari** (it must be Safari, not Chrome).
2. Tap the **Share** button (square with an arrow).
3. Scroll and tap **Add to Home Screen → Add**.
4. Open the **Aqua Farm** icon on the Home Screen. Create an account or sign in. The owner approves new people in **Team & roles**.

Always open it from the Home Screen icon, not from Safari, so the app and its saved login stay together.

## Good to know
- **Offline:** the app opens with no signal and keeps entries until signal returns. Keep the app on the Home Screen and open it online at least once after every update.
- **Updates:** upload changed files to GitHub; Pages republishes in about a minute. Close and reopen the app to receive it.
- **Storage on iPhone:** if an iPhone is unused for several weeks, iOS may clear the app's saved data. Entries waiting to upload would be lost, so connect to the internet regularly.
- **Reports:** *Accounts (Excel)* downloads a file in Safari (check Downloads in the Files app). *Farm report (PDF)* opens the print screen; choose Share → Save to Files. WhatsApp summary opens WhatsApp.
- No push notifications.
