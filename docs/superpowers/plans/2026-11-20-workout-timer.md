# Workout Timer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a phone-first, installable workout timer web app with a saved workout library, a get-ready countdown, curated work/rest steps, six modes and audio cues.

**Architecture:** One pure, clock-based runner engine plays a sequence of segments (`prep`, `work`, `rest`) generated from a workout. Every mode (Interval, Tabata, EMOM, AMRAP, Flow, Custom) is a template that produces a `Workout`, and the engine knows nothing about modes. React screens sit on top of the engine, a `localStorage` store and a Web Audio sound module.

**Tech Stack:** React, TypeScript, Vite, `vite-plugin-pwa`, Vitest + Testing Library, `@dnd-kit/sortable`, plain CSS custom properties, GitHub Pages (GitHub Actions).

**Spec:** `docs/superpowers/specs/2026-11-20-workout-timer-design.md`

## Global Constraints

- Served from `/workout-timer/` (Vite `base: '/workout-timer/'`).
- Works offline and installs to the home screen (PWA).
- Phone-first single column; desktop is a centred column, or library left and editor/runner right when wide.
- Accent turquoise/spearmint about `#2EE6C5`; white text; dark graphite granite/chrome background; large tabular numerals for the clock.
- No accounts, history, cloud sync or spoken cues in v1.
- Time comes from the clock (`Date.now()` passed into the engine), never from counting ticks.
- Beeps on the last 3 seconds of timed steps; distinct tones for work start, rest start and finish.
- Audio is generated with Web Audio (no sound files) and unlocked on the Start tap.
- Keep the screen awake while a workout runs (Screen Wake Lock).
- Tabata is locked at 20s work / 10s rest / 8 rounds.
- Seed workouts: Full Body A, Full Body B, Kettlebell Rounds (Athenian Complex), all Flow mode, `prepSeconds` 10, `restBetweenRounds` 120, `rounds` null.
- Commit messages end with the Co-Authored-By and Claude-Session trailers from this session's attribution reminder.

## Review Focus

1. Returning after the screen locked or the tab was throttled: the timer jumps to the correct segment and does not replay missed beeps (Task 3).
2. Pausing, then resuming much later: no time passes while paused (Task 3).
3. A timed step with 0 seconds, a workout with no steps, or a negative number: Start is blocked and the engine never loops forever (Tasks 2, 3).
4. Corrupt or missing `localStorage`, or a bad or foreign import file: the app loads and the existing library is never overwritten by a failed import (Task 5).
5. Accidental reload mid-workout: the run is not lost and a Resume option appears (Task 8).

---

## File Structure

```
index.html, package.json, tsconfig.json, vite.config.ts
public/icon.svg                      app icon (PNG sizes generated in Task 10)
src/main.tsx, src/App.tsx            entry and screen switching (route state, no router lib)
src/styles/theme.css                 design tokens, granite background, layout
src/model/types.ts                   Mode, Step, Workout, Segment
src/model/templates.ts               templateFor(mode)
src/model/segments.ts                segmentsForRound, validateWorkout
src/engine/runner.ts                 pure state machine
src/audio/cues.ts, sound.ts          cueFor() mapping and Web Audio player
src/store/seed.ts, library.ts, settings.ts
src/hooks/useWakeLock.ts, useLibrary.ts
src/screens/Library.tsx, Editor.tsx, Runner.tsx, Settings.tsx
.github/workflows/deploy.yml, README.md
```

Tests sit next to the file they cover (`*.test.ts[x]`).

---

### Task 1: Scaffold, theme and app shell

**Files:**
- Create: `package.json`, `tsconfig.json`, `vite.config.ts`, `index.html`, `public/icon.svg`, `src/main.tsx`, `src/App.tsx`, `src/styles/theme.css`, `src/setupTests.ts`
- Test: `src/App.test.tsx`

**Interfaces:**
- Produces: `type Route = { name: 'library' } | { name: 'editor'; id: string } | { name: 'run'; id: string } | { name: 'settings' }`; `App` holds `route` state and passes `navigate(route: Route)` to screens (screens are stubs here).

- [ ] **Step 1:** Scaffold a Vite React + TS project in the repo root (keep `docs/`), add Vitest with jsdom and Testing Library (`setupTests.ts` imports `@testing-library/jest-dom`), `vite-plugin-pwa` (manifest: name "Workout Timer", `display: standalone`, `theme_color` and `background_color` from the tokens, `start_url` and `scope` `/workout-timer/`), `base: '/workout-timer/'`.
- [ ] **Step 2: Write the failing test** `App.test.tsx::shows library by default`: render `<App />`, assert `getByRole('heading', { name: 'Library' })` is present.
- [ ] **Step 3: Run** `npx vitest run src/App.test.tsx`. Expected: FAIL.
- [ ] **Step 4: Implement** `App` and `theme.css` tokens (`--bg`, `--panel`, `--accent: #2EE6C5`, `--text: #fff`, `--rest`, radii, `font-variant-numeric: tabular-nums` helper class `.num`). Body background is a layered graphite gradient, textured later in Task 10.
- [ ] **Step 5: Run** `npx vitest run` and `npm run build`. Expected: tests PASS and the build succeeds.
- [ ] **Step 6: Commit** `feat: scaffold PWA app shell and theme`.

### Task 2: Workout model, mode templates, segment generation

**Files:**
- Create: `src/model/types.ts`, `src/model/templates.ts`, `src/model/segments.ts`
- Test: `src/model/templates.test.ts`, `src/model/segments.test.ts`

**Interfaces:**
- Produces (`types.ts`):
  ```ts
  export type Mode = 'interval'|'tabata'|'emom'|'amrap'|'flow'|'custom';
  export interface Step { id:string; label:string; kind:'timed'|'tap'; role:'work'|'rest'; seconds?:number; reps?:number; counter?:boolean }
  export interface Workout { id:string; name:string; mode:Mode; prepSeconds:number; steps:Step[]; rounds:number|null; advance:'step'|'round'; restBetweenRounds:number }
  export interface SegmentItem { label:string; reps?:number }
  export interface Segment { id:string; role:'prep'|'work'|'rest'; label:string; seconds:number|null; round:number; items?:SegmentItem[]; itemIndex?:number; counter?:boolean }
  ```
- Produces: `templateFor(mode: Mode): Workout` (fresh ids each call). `segmentsForRound(w: Workout, round: number): Segment[]` (`round` is 1-based; round 0 means the prep segment only, empty array if `prepSeconds` is 0). `validateWorkout(w: Workout): string[]` (empty means valid).

- [ ] **Step 1: Write failing tests.**
  - `templateFor('tabata')` → one work step 20s, one rest step 10s, `rounds` 8, `restBetweenRounds` 0.
  - `templateFor('emom')` → one timed 60s work step, `rounds` 10.
  - `templateFor('amrap')` → one timed work step with `counter: true`, `rounds` 1.
  - `templateFor('flow')` → `advance: 'round'`, `rounds: null`, `restBetweenRounds: 120`, tap steps only.
  - `segmentsForRound` on an interval workout (work 40, rest 20, rounds 3): round 3 omits the trailing rest step, round 1 keeps it.
  - Flow with `advance: 'round'` and 3 tap steps → one `seconds: null` segment whose `items` has 3 entries, followed by a 120s rest segment; with `rounds: null` the rest segment is always present; with `rounds: 2` the round-2 call has no rest segment.
  - Flow with `advance: 'step'` → 3 tap segments, each with the full `items` list and `itemIndex` 0, 1, 2.
  - `segmentsForRound(w, 0)` returns a single prep segment when `prepSeconds` is 10, and `[]` when it is 0.
  - `validateWorkout`: no steps → error; a timed step with `seconds` 0 → error; negative `prepSeconds` → error; `rounds` of 0 → error; a valid template → `[]`. (Review Focus 3)
- [ ] **Step 2: Run** `npx vitest run src/model`. Expected: FAIL.
- [ ] **Step 3: Implement** the three files. Merge rule: when `advance === 'round'`, all `tap` work steps in a round collapse into one segment at the position of the first one. A rest step of `kind: 'tap'` stays its own segment. A trailing rest segment is omitted on the final round (the `restBetweenRounds` rest also).
- [ ] **Step 4: Run** `npx vitest run src/model`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: workout model, mode templates and segment generation`.

### Task 3: Runner engine

**Files:**
- Create: `src/engine/runner.ts`
- Test: `src/engine/runner.test.ts`

**Interfaces:**
- Consumes: `Workout`, `Segment`, `segmentsForRound`, `validateWorkout`.
- Produces:
  ```ts
  export interface RunState { workout:Workout; segments:Segment[]; index:number; segmentStart:number; pausedAt:number|null; lastCountdown:number|null; laps:number; finished:boolean; beepSeconds:number } // plain JSON, so it can be saved for resume
  export type RunEvent = { type:'segment-start'; segment:Segment } | { type:'countdown'; secondsLeft:number } | { type:'finish' }
  export function startRun(w:Workout, now:number, beepSeconds?:number): RunState   // throws if validateWorkout(w) is non-empty; beepSeconds defaults to 3
  export function update(s:RunState, now:number): { state:RunState; events:RunEvent[] }
  export function remainingMs(s:RunState, now:number): number | null   // null for a tap segment
  export function pause(s:RunState, now:number): RunState
  export function resume(s:RunState, now:number): RunState
  export function done(s:RunState, now:number): { state:RunState; events:RunEvent[] }   // tap segment advances; a counter segment increments laps instead
  export function skip(s:RunState, now:number): { state:RunState; events:RunEvent[] }
  export function back(s:RunState, now:number): RunState                  // restarts the current segment, or goes to the previous one if less than 2s in
  export function adjustSeconds(s:RunState, deltaSeconds:number): RunState   // shifts the current timed segment's end, clamped to a minimum of 1s remaining
  ```

- [ ] **Step 1: Write failing tests** (use fixed `now` values; no real timers).
  - Prep 10s then work: `update` at `+9.9s` stays in prep; at `+10s` the index moves to work and emits `segment-start` for it.
  - Countdown emits `secondsLeft` 3, 2, 1 once each, in order, never twice, with `beepSeconds` 3.
  - A work segment of 40s followed by a 20s rest and a 20s work: `update` at `+45s` lands in the rest segment with 15s remaining.
  - **Throttle catch-up (Review Focus 1):** one `update` call at `+75s` on a 10s-prep / 40s-work / 20s-rest / 40s-work workout lands in the second work segment, and emits exactly one `segment-start` (for the current segment) and no countdown events for segments fully in the past.
  - **Pause (Review Focus 2):** `pause` at `+5s`, `resume` at `+3605s` → `remainingMs` is identical to before the pause, and `update` while paused changes nothing and emits no events.
  - Flow: a tap segment never advances in `update`; `done` moves to the rest, then the rest ends on the clock into round 2's tap segment (rounds `null` appends the next round lazily, forever).
  - AMRAP: `done` on the counter segment increments `laps` and keeps the index; at the end of the countdown `finish` is emitted.
  - A finite workout ends: `update` past the last segment sets `finished: true` and emits a single `finish` event, and a later `update` emits nothing.
  - `skip` and `back` behave as specified, and `adjustSeconds(-1000)` clamps to leave 1s remaining.
  - `startRun` throws for a workout with a 0-second timed step (Review Focus 3).
  - Zero-length defensive case: even if a segment with `seconds: 0` is injected into `segments`, a single `update` terminates (no infinite loop).
- [ ] **Step 2: Run** `npx vitest run src/engine`. Expected: FAIL.
- [ ] **Step 3: Implement** `runner.ts` as pure functions over `RunState`. Time in the current segment is `now - segmentStart`; pausing records `pausedAt`, resuming shifts `segmentStart` forward by the paused duration. When the end of a segment is crossed, advance in a loop (carrying the overshoot into the next `segmentStart`), generating the next round with `segmentsForRound` when the list runs out and the workout has more rounds (or `rounds` is `null`). Only the current segment's `segment-start` and countdown are emitted after a catch-up.
- [ ] **Step 4: Run** `npx vitest run src/engine`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: pure clock-based runner engine`.

### Task 4: Audio cues and sound player

**Files:**
- Create: `src/audio/cues.ts`, `src/audio/sound.ts`
- Test: `src/audio/cues.test.ts`, `src/audio/sound.test.ts`

**Interfaces:**
- Consumes: `RunEvent`.
- Produces: `type Cue = 'beep'|'work'|'rest'|'finish'`; `cueFor(e: RunEvent): Cue | null` (countdown → `beep`; `segment-start` work → `work`; rest → `rest`; prep → `null`; finish → `finish`). `createSound(opts?: { ctxFactory?: () => AudioContext }): { unlock(): Promise<void>; play(cue: Cue): void; setVolume(v: number): void; setEnabled(on: boolean): void; setVibrate(on: boolean): void }`.

- [ ] **Step 1: Write failing tests.** `cueFor` mapping for each event type. `createSound` with a fake `AudioContext` (injected via `ctxFactory`): `unlock()` calls `resume()`; `play('beep')` creates one oscillator and starts it; `play` is a no-op when disabled or before `unlock()`; `setVolume(0.5)` sets the master gain to 0.5; when vibrate is on and `navigator.vibrate` exists, `play('work')` calls it, and nothing throws if it does not exist.
- [ ] **Step 2: Run** `npx vitest run src/audio`. Expected: FAIL.
- [ ] **Step 3: Implement** both files. Short 880Hz beep (about 120ms); work = a longer rising tone; rest = a lower double tone; finish = a three-note sequence. The exact frequencies are a builder choice.
- [ ] **Step 4: Run** `npx vitest run src/audio`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: audio cues and Web Audio player`.

### Task 5: Library storage, seeds, settings, backup

**Files:**
- Create: `src/store/seed.ts`, `src/store/library.ts`, `src/store/settings.ts`, `src/hooks/useLibrary.ts`
- Test: `src/store/library.test.ts`, `src/store/settings.test.ts`

**Interfaces:**
- Consumes: `Workout`, `validateWorkout`.
- Produces: `seedWorkouts(): Workout[]` (the three workouts from the spec, fresh ids). `loadLibrary(storage?: Storage): Workout[]` (key `workout-timer:library:v1`; seeds on first launch; on corrupt JSON copies the raw string to `workout-timer:library:corrupt` and returns the seeds). `saveLibrary(ws: Workout[], storage?: Storage): void`. `exportLibrary(ws: Workout[]): string` (JSON with `{ app:'workout-timer', version:1, workouts }`). `parseImport(json: string): { ok:true; workouts:Workout[] } | { ok:false; error:string }`. `mergeImport(existing: Workout[], incoming: Workout[]): Workout[]` (appends, giving fresh ids on collision, never removes). `type Settings = { sound:boolean; volume:number; beepSeconds:number; keepAwake:boolean; vibrate:boolean }`, defaults `{ true, 0.8, 3, true, true }`; `loadSettings(storage?)`, `saveSettings(s, storage?)`. `useLibrary(): { workouts:Workout[]; save(w:Workout):void; remove(id:string):void; duplicate(id:string):void; move(from:number, to:number):void; importMerge(incoming:Workout[]):void }`.

- [ ] **Step 1: Write failing tests** using an in-memory `Storage` fake.
  - First launch returns the 3 seeds with the right names, steps (the Athenian Complex has 9 steps with reps 5,5,5,5,5,5,5,5,10) and Flow settings; a second load returns what was saved.
  - **Review Focus 4:** corrupt JSON → returns seeds, keeps the raw copy under the corrupt key, does not throw; a wrong-shape array (missing `steps`) → treated as corrupt; `parseImport` rejects non-JSON, a wrong `app` field, and workouts failing `validateWorkout`, and an invalid import leaves `existing` unchanged.
  - Round trip: `parseImport(exportLibrary(ws))` equals `ws`. `mergeImport` keeps all existing workouts and re-ids a colliding id.
  - Settings: missing or corrupt values fall back to defaults; unknown keys are ignored.
- [ ] **Step 2: Run** `npx vitest run src/store`. Expected: FAIL.
- [ ] **Step 3: Implement** the files. `duplicate` names the copy `"<name> copy"`; an empty name saves as `Untitled`.
- [ ] **Step 4: Run** `npx vitest run src/store`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: library storage, seeds, settings and backup`.

### Task 6: Library screen

**Files:**
- Create: `src/screens/Library.tsx`
- Modify: `src/App.tsx` (render `Library`)
- Test: `src/screens/Library.test.tsx`

**Interfaces:**
- Consumes: `useLibrary`, `templateFor`, `Route` / `navigate`.
- Produces: `Library({ navigate }: { navigate:(r:Route)=>void })`.

- [ ] **Step 1: Write failing tests** (Testing Library, in-memory storage).
  - The three seed names are listed under the heading "Library".
  - "New workout" opens a mode picker listing Interval, Tabata, EMOM, AMRAP, Kettlebell Flow, Custom; choosing one saves a template workout and navigates to its editor.
  - "Duplicate" adds "Full Body A copy"; "Delete" asks for confirmation, then removes it; cancelling keeps it.
  - "Start" navigates to `{ name:'run', id }`; the card's title navigates to the editor.
  - A workout failing validation shows a disabled Start.
- [ ] **Step 2: Run** `npx vitest run src/screens/Library.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the screen: workout cards with mode badge and a summary line (steps, rounds or "until I stop", rest), drag-to-reorder through `@dnd-kit/sortable` calling `move`, and a header link to Settings.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: library screen`.

### Task 7: Editor screen

**Files:**
- Create: `src/screens/Editor.tsx`
- Modify: `src/App.tsx`
- Test: `src/screens/Editor.test.tsx`

**Interfaces:**
- Consumes: `useLibrary`, `validateWorkout`.
- Produces: `Editor({ id, navigate }: { id:string; navigate:(r:Route)=>void })`. Changes auto-save to the library on each edit.

- [ ] **Step 1: Write failing tests.**
  - Editing the name, get-ready seconds, rest between rounds and rounds ("Until I stop" toggle sets `rounds` to `null`) updates the saved workout.
  - "Add step" appends a step; removing deletes it; changing a step's kind to Tap hides its seconds field and shows reps.
  - Steps can be reordered (use the keyboard sensor in the test).
  - Switching the advance setting (Tap per exercise / Tap once per round) updates `advance`.
  - With validation errors (a timed step at 0 seconds, no steps) the errors are listed and the Start button is disabled; fixing them enables it.
  - An emptied name is saved as `Untitled` on leaving the screen.
- [ ] **Step 2: Run** `npx vitest run src/screens/Editor.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the screen using `@dnd-kit/sortable`. Use time inputs as minutes and seconds (not one big seconds number). Long step names wrap rather than overflow.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: workout editor`.

### Task 8: Runner screen, wake lock and resume

**Files:**
- Create: `src/screens/Runner.tsx`, `src/hooks/useWakeLock.ts`
- Modify: `src/App.tsx`, `src/screens/Library.tsx` (Resume banner)
- Test: `src/screens/Runner.test.tsx`

**Interfaces:**
- Consumes: runner engine, `createSound`, `cueFor`, `loadSettings`.
- Produces: `Runner({ id, navigate })`; `useWakeLock(active: boolean): void` (requests the sentinel when `active`, releases on cleanup, re-requests on `visibilitychange` back to visible, and does nothing where unsupported). The active `RunState` is saved to `workout-timer:active-run` on every change and cleared on finish or quit.

- [ ] **Step 1: Write failing tests** (Vitest fake timers, fake sound injected).
  - Pressing Start unlocks sound, shows the prep countdown, then the work segment with its label, round counter and "next" line.
  - A tap segment shows a Done button and the exercise list (with reps); pressing Done goes to the rest screen with a large countdown and ±15s buttons that call `adjustSeconds`.
  - Pause shows Resume; the display does not advance while paused.
  - The finish screen appears when the workout ends; AMRAP shows laps and a "+1 round" button.
  - Cues from `update` events reach `sound.play` (`beep`, `work`, `rest`, `finish`).
  - **Review Focus 5:** with a saved `active-run` in storage, the Library shows "Resume workout"; choosing it opens the Runner at the saved state (the clock having moved on), and Quit clears it.
  - `useWakeLock(true)` requests a sentinel and releases it on unmount; with `navigator.wakeLock` missing nothing throws.
- [ ] **Step 2: Run** `npx vitest run src/screens/Runner.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the screen. Drive `update` from a 250ms interval plus `visibilitychange`, passing `Date.now()`. Rest and work are visibly different in colour. Show the round number as "Round N" (or "Round N of M"). Controls: pause/resume, skip, back, quit (with confirmation).
- [ ] **Step 4: Run** the test file and `npx vitest run`. Expected: PASS.
- [ ] **Step 5: Commit** `feat: runner screen with wake lock and resume`.

### Task 9: Settings screen and backup

**Files:**
- Create: `src/screens/Settings.tsx`
- Modify: `src/App.tsx`
- Test: `src/screens/Settings.test.tsx`

**Interfaces:**
- Consumes: `loadSettings`, `saveSettings`, `exportLibrary`, `parseImport`, `useLibrary().importMerge`.
- Produces: `Settings({ navigate })`.

- [ ] **Step 1: Write failing tests.** Toggling sound, vibrate and keep-awake and changing the volume and beep seconds (1–5) persist via `saveSettings`. "Export" triggers a download of the JSON from `exportLibrary`. Importing a valid file adds its workouts and shows a count; importing an invalid file shows the error message and leaves the library unchanged.
- [ ] **Step 2: Run** `npx vitest run src/screens/Settings.test.tsx`. Expected: FAIL.
- [ ] **Step 3: Implement** the screen. The Runner reads settings at the start of each run.
- [ ] **Step 4: Run** the test file. Expected: PASS.
- [ ] **Step 5: Commit** `feat: settings and backup`.

### Task 10: Look and feel, desktop layout and PWA icons

**Files:**
- Modify: `src/styles/theme.css` and the screen components for class names
- Create: `public/icon-192.png`, `public/icon-512.png`, `scripts/shots.mjs` (Playwright screenshots, not shipped)
- Modify: `vite.config.ts` (manifest icons)

- [ ] **Step 1:** Apply the look from the spec: granite/brushed-chrome background (layered gradients plus an inline SVG noise texture), metallic panel edges, accent glow on the primary button and active step, huge tabular clock numerals, high-contrast white text, distinct work and rest colour treatments, 44px or larger touch targets.
- [ ] **Step 2:** Add the wide layout: at about 900px and above, show the library on the left and the editor/runner on the right; below that, the single column.
- [ ] **Step 3:** Generate 192 and 512 PNG icons from `public/icon.svg` with Playwright, and register them in the manifest.
- [ ] **Step 4: Verify visually:** with `npm run build && npm run preview`, run `node scripts/shots.mjs` to screenshot Library, Editor, Runner (work, rest, flow) at 390×844 and 1280×800. Look at each image and fix contrast, overflow and tap-target problems. Check that no horizontal scrolling exists at 390px with long exercise names.
- [ ] **Step 5: Run** `npx vitest run` and `npm run build`. Expected: PASS and a clean build.
- [ ] **Step 6: Commit** `feat: granite and spearmint theme, desktop layout, icons`.

### Task 11: Deployment and README

**Files:**
- Create: `.github/workflows/deploy.yml`, `README.md`

- [ ] **Step 1:** Add a workflow that on push to `main` installs, runs `npx vitest run`, builds, and deploys `dist` with the standard GitHub Pages actions (`upload-pages-artifact`, `deploy-pages`).
- [ ] **Step 2:** Write the README: what it is, how to install it on a phone (Add to Home Screen), how to run locally (`npm install`, `npm run dev`), how to back up workouts, and the screen-lock limitation.
- [ ] **Step 3: Verify:** `npm run build && npm run preview` serves under `/workout-timer/` and the app loads with the three seed workouts (check with a Playwright load and one screenshot).
- [ ] **Step 4: Commit** `chore: GitHub Pages deployment and README`.

---

## Self-Review

- **Spec coverage:** library (6), get-ready (2, 3, 8), curated steps (7), modes (2), audio (4), phone/desktop (10), look (10), backup (5, 9), seeds (5), wake lock and resume (8), hosting (11). No gaps found.
- **Type consistency:** `Workout`, `Step`, `Segment`, `RunState`, `RunEvent`, `Cue`, `Route` and `Settings` are defined once and used with the same names in later tasks.
- **Open for the owner:** Pages must be enabled for the repo (Settings, Pages, Source: GitHub Actions), and the workflow deploys from `main`, so the branch needs merging first.
