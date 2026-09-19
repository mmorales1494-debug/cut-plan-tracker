# Ledge

A personal-use PWA for tracking nutrition, lifting, running, and climbing training in one place. No backend — everything lives in the browser's `localStorage` (data) and `IndexedDB` (photos).

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

## StrongLifts 5x5

The Workouts tab can run StrongLifts 5x5 as the actual program rather than just a routine
named after it. **Workouts -> Workout routines -> Set up StrongLifts 5x5 (A/B)** adds it and
makes it active (your other routines stay saved, they just stop coming up on lifting days).

There are **two** workouts, trained **three times a week**, alternating — A/B/A one week,
B/A/B the next, with a rest day between each. Three sessions, not three workouts:

| | Workout A | Workout B |
|---|---|---|
| | Squat 5x5 | Squat 5x5 |
| | Bench Press 5x5 | Overhead Press 5x5 |
| | Barbell Row 5x5 | Deadlift 1x5 |

What the app does for you once it's running:

- **Prescribes the weight.** Every session opens with the work sets already laid out at the
  weight you're due for — the only thing to enter is the reps you actually got.
- **Adds weight when you earn it.** Hit every rep and the next session goes up 5 lb (2.5 kg);
  deadlift goes up 10 lb (5 kg). Miss a rep and the weight repeats.
- **Deloads automatically.** Three sessions stalled at the same weight and it cuts 10%,
  rounded down to something the plates can actually make, so you climb back through it.
- **Times the rest.** 90 seconds after a clean set, 3 minutes when you come up a rep short,
  5 minutes after a real miss.
- **Warms you up.** Two empty-bar sets then 5/3/2 ramping to the working weight, shown but
  not logged — only work sets count toward progression.

Progression is re-derived from your logged sets every time, not stored as a counter, so
fixing a mistyped session (or restoring a backup) recomputes the right next weight instead
of drifting. Set the weight by hand any time and the app stops second-guessing that lift
until you start logging reps again.

Sets, reps and the jump per session are editable per lift in **Workout routines**, and any
extra exercise you add to an A or B day is treated as a normal accessory, outside the
program.

## Tests

The program logic has a small dependency-free test suite. With Node installed:

```
node tests/run.js
```

## Updating later

Any time you want to change the meal defaults, exercises, or targets, edit `data.js` and push again — GitHub Pages redeploys automatically within a minute or two of a push to `main`.

## Data & backup

- All logs are stored locally on your phone only (`localStorage` + `IndexedDB`) — nothing is sent anywhere.
- Use **Progress → Export JSON** periodically to download a backup file, in case you ever reset Safari or switch phones. **Import JSON** on the same tab restores it.
