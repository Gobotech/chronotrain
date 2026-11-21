# ChronoTrain

**Retro Fitness / 1986** — a neon 80s interval timer for Tabata, HIIT and series workouts.

## Features

- Configurable number of rounds.
- Configurable work, rest and pre-start times.
- Visual + audible cues at the beginning of WORK, REST and GET READY phases.
- 5-second countdown cue with **GET READY!** or **FINAL EFFORT**.
- Pause, resume, skip and stop controls.
- Screen Wake Lock while a workout is active (where supported).
- Installable PWA with offline cache.
- Designed for iPhone/mobile first.
- No backend and no personal data collection.

## Publish with GitHub Pages

1. Create a **public GitHub repository**, e.g. `chronotrain`.
2. Upload all files from this folder to the repository root.
3. In GitHub go to **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Select `main` and `/ (root)`, then save.
6. Open the GitHub Pages URL in Safari on your iPhone.
7. Tap **Share → Add to Home Screen → Add**.

GitHub Pages serves the site over HTTPS, which is required for the Screen Wake Lock API.

## Important limitation: locked iPhone / background

ChronoTrain uses the Screen Wake Lock API to prevent the screen from locking while the workout is open and active. A PWA cannot reliably keep JavaScript timers and local audio cues executing after iOS suspends it in the background or when the phone is locked.

The timer is based on absolute elapsed time, so if the PWA is suspended it will catch up correctly when it becomes active again. However, sound/visual phase alerts **cannot be guaranteed while the device is locked**.

If guaranteed locked-screen alerts are mandatory, ChronoTrain needs a native iOS version (Swift/SwiftUI) using iOS background/audio or notification capabilities and distribution via Xcode/TestFlight/App Store rather than GitHub Pages alone.

## Files

- `index.html` — app structure.
- `styles.css` — Neon Athletic 80s UI.
- `app.js` — timer, audio cues, Wake Lock and controls.
- `manifest.webmanifest` — PWA installation metadata.
- `sw.js` — offline cache/service worker.
- `icons/` — app icons.
