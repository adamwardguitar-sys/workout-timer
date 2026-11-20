# Workout Timer

A phone-first workout timer you can install to your home screen. Build a library of workouts, then train to them with a countdown and audio cues. Works offline, and on desktop too.

## Modes

- **Interval**: work and rest, repeated for N rounds
- **Tabata**: 20s on, 10s off, 8 rounds
- **EMOM**: a new round every minute
- **AMRAP**: one countdown, tap to count rounds
- **Kettlebell Flow**: untimed exercises, tap **Done**, then a timed rest (default 2:00), repeating until you stop
- **Custom**: any mix of timed and tap-to-finish steps

Every workout has a configurable **get ready** countdown, your own work and rest steps, and an optional number of rounds (or "until I stop"). It starts with three workouts in the library: Full Body A, Full Body B and Kettlebell Rounds (Athenian Complex).

## Install on your phone

Open the site in Safari (iPhone) or Chrome (Android), then **Share → Add to Home Screen**. It opens full screen and works offline.

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

`scripts/shots.cjs` and `scripts/icons.cjs` are dev-only helpers (Playwright) for screenshots and icon generation.

## Deploy

Pushing to `main` builds and publishes to GitHub Pages (`.github/workflows/deploy.yml`). One-time setup: in the repository go to **Settings → Pages** and set **Source** to **GitHub Actions**. The app is then served at `https://<user>.github.io/workout-timer/`.
