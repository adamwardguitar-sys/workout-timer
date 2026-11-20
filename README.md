# Workout Timer

A phone-first workout timer you can install to your home screen. Build a library of workouts, then train to them with a countdown and audio cues. Works offline, and on desktop too.

## Modes

- **Interval**: a list of exercises, each timed (default 40s on, 20s off), for N rounds
- **Tabata**: 20s on, 10s off, 8 rounds
- **EMOM**: a new round every minute
- **AMRAP**: one countdown, tap to count rounds
- **Kettlebell Flow**: untimed exercises, tap **Done**, then a timed rest (default 2:00), repeating until you stop
- **Custom**: any mix of timed and tap-to-finish steps

Every workout has a configurable **get ready** countdown (30 seconds by default), your own work and rest steps, and a number of rounds (or "until I stop"). You can also pick the rounds, or Unlimited, on the screen you see before each workout starts. It starts with three workouts in the library: Full Body A and Full Body B (40s on, 20s off through the list) and Kettlebell Rounds (Athenian Complex).

## Tracking

Every workout you do is logged automatically, including ones you end early (anything past 30 seconds). Open the **History** tab to see this week's sessions and time, your day streak, a 4-week activity grid, and every past session with its time, rounds and an optional note. Workout cards show when you last did them and how many times. Backups include your history.

An optional **Wait for a tap between rounds** setting (off by default) pauses at the start of each new round until you tap. You can switch it on in the editor or just for one run on the start screen.

## Install on your phone

**iPhone:** open the site in Safari, then **Share → Add to Home Screen**.
**Android:** open it in Chrome, then the **⋮** menu → **Install app** (or **Add to Home screen**).

It opens full screen and works offline, and updates itself when a new version is published.

## Things to know

- **Keep the screen on.** A web app can't beep once the phone screen locks, so the timer keeps the screen awake during a workout (you can turn that off in Settings). Beeps are generated on the device, and you need to tap **Start** at the beginning of a workout so the phone allows sound.
- **Your workouts are stored on this device.** Use **Settings → Export backup** now and then. **Import backup** adds the workouts from a file without deleting what you have.
- Vibration is not available on iPhone.

## Develop

```bash
npm install
npm run dev      # local dev server
npm test         # unit and component tests
npm run build    # type-check and build to dist/
npm run preview  # serve the build at http://localhost:4173/workout-timer/
```

Stack: React, TypeScript, Vite, `vite-plugin-pwa`, Vitest. The timer engine (`src/engine/runner.ts`) is pure and clock-based, so it stays correct when the page is throttled.

`scripts/shots.cjs` and `scripts/icons.cjs` are dev-only helpers for screenshots and icon generation. They need Playwright (`npm i -D playwright`, then `npx playwright install chromium`) and are not part of the app.

## Deploy

Pushing to `main` builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`). One-time setup: in the repository go to **Settings → Pages** and set **Source** to **GitHub Actions**. The app is then served at `https://<user>.github.io/workout-timer/`.
