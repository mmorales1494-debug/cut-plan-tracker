# Cut Plan Tracker

A personal-use PWA for logging meals, water, workouts, weight, and check-ins against a fixed cut plan. No backend — everything lives in the browser's `localStorage` (data) and `IndexedDB` (photos).

## Deploying to GitHub Pages

1. **Create an empty GitHub repo**
   - Go to github.com → click **+** (top right) → **New repository**.
   - Name it anything generic (e.g. `cut-plan-tracker`). Keep it **Public** (Pages needs that on a free plan) — the app itself has no personal info in it either way.
   - Do **not** initialize with a README/gitignore — leave it empty.
   - Copy the repo URL it shows you (looks like `https://github.com/<you>/cut-plan-tracker.git`).

2. **Push the code** — send me that URL and I'll run:
   ```
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin <your-repo-url>
   git push -u origin main
   ```

3. **Enable GitHub Pages**
   - In the repo, go to **Settings → Pages**.
   - Under "Build and deployment", set **Source: Deploy from a branch**.
   - Branch: `main`, folder: `/ (root)`. Save.
   - Wait ~1 minute; GitHub will show the live URL: `https://<you>.github.io/cut-plan-tracker/`.

4. **Install on iPhone**
   - Open that URL in **Safari** on your iPhone (must be Safari, not Chrome, for "Add to Home Screen" to create a standalone app).
   - Tap the **Share** icon → **Add to Home Screen** → Add.
   - Open it from the home screen icon going forward — it'll run full-screen and keep working offline after the first load.

## Updating later

Any time you want to change the meal defaults, exercises, or targets, edit `data.js` and push again — GitHub Pages redeploys automatically within a minute or two of a push to `main`.

## Data & backup

- All logs are stored locally on your phone only (`localStorage` + `IndexedDB`) — nothing is sent anywhere.
- Use **Progress → Export JSON** periodically to download a backup file, in case you ever reset Safari or switch phones. **Import JSON** on the same tab restores it.
