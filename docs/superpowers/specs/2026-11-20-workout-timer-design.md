# Workout Timer: Design

Status: draft for approval. Date: 2026-11-20.

## Intent and the why

A personal workout timer that lives on the owner's phone (home-screen app) and also works on desktop.
They create workouts, save them to a library, and run them with a timer and audio cues.

They currently use the *Interval Timer* app and want to build on it. What it gets wrong for them:

1. Only one workout can be active, with no saved list.
2. No "get ready" countdown before the workout starts.
3. They can't curate their own work and rest periods.
4. Kettlebell flows need an untimed exercise followed by a timed rest (e.g. 2 minutes), and Interval Timer doesn't model that well.

## Goals

- **Library of saved workouts:** unlimited, named, editable, duplicable, reorderable.
- **Get-ready countdown:** configurable per workout.
- **Curated sequence:** per-step control of work and rest.
- **Popular modes** as starting points: Interval/HIIT, Tabata, EMOM, AMRAP, Kettlebell Flow, Custom.
- **Audio cues:** countdown beeps and distinct start/rest/finish tones.
- **Phone-first and desktop-friendly:** one codebase, installable, works offline.
- **Look:** modern and slick. Dark chrome/granite background, turquoise/spearmint accents, white text that pops.

## Revision 2 (2026-11-20): workout tracker

Owner asked for a professional, simple timer *and tracker*, leaving the product decisions to the builder.

- **Sessions are logged automatically** (workout, start time, active seconds excluding pauses, rounds done, AMRAP laps, completed or ended early, optional note). Ending a workout before 30 seconds is treated as an accidental start and not logged. A run that finishes while the app is closed is logged when the app next opens.
- **History tab:** this-week sessions and time, day streak (grace for "not yet today"), a 4-week Monday-first activity grid, and the session list grouped by day with notes and delete.
- **Finish summary** with time, rounds and a note; **workout cards** show last done and session count.
- **Navigation:** bottom tab bar (Workouts, History, Settings) on the main screens; hidden while editing or running.
- **Backups** (version 2) include history; version 1 backups still import.
- **Wait for a tap between rounds:** opt-in per workout or per run, off by default; adds a tap-to-continue gate at the start of each round after the first.

## Non-goals (v1)

- Accounts, cloud sync, sharing between users.
- Charts beyond the activity grid; per-exercise weight and rep logging (possible later).
- Spoken exercise names (a possible later addition).
- Reliable audio with the screen locked or while another app is in the foreground (see Constraints).

## Anti-goals

- Becoming a clone of Interval Timer's UI: it should feel newer and more polished.
- Any friction during a workout: few taps, big targets, readable from a metre away.
- Losing saved workouts silently.

## Constraints

- Platform: a web app installed to the home screen (PWA). A web page cannot keep playing beeps once the phone screen locks.
  Mitigation: keep the screen awake while a workout runs (Screen Wake Lock), compute time from the clock rather than counting ticks, and unlock audio on the first tap of Start (required on iOS).
  If this proves to be a problem in daily use, native (Expo) is the fallback, and the workout model carries over.
- Data lives on the device. Provide JSON export/import as a backup.
- Hosting: free static hosting (GitHub Pages), served from `/workout-timer/`.

## Approaches considered

- **A. Plain HTML/JS, no build step:** simplest, but gets messy as editor, library and modes grow.
- **B. React + Vite PWA (chosen):** tidy structure, installable, offline, free hosting, easy to extend.
- **C. Native app (Expo):** the only way to beep reliably with the screen locked, but needs an Apple developer account, store/TestFlight installs and has a weak desktop story.

The owner chose B.

## The model: one engine, many modes

A **step** is one thing you do:

- `label`: e.g. "Squats"
- `kind`: `timed` (counts down `seconds`) or `tap` (no clock, ends when you tap Done)
- `role`: `work` or `rest`
- `reps`: optional, shown as e.g. "5 Rows"

A **workout** is:

- `id`, `name`, `mode`
- `prepSeconds`: the get-ready countdown
- `steps[]`: one *round*
- `rounds`: a number, or `null` meaning keep going until I stop
- `advance`: `step` (tap per movement) or `round` (one tap at the end of the round), used for tap steps
- `restBetweenRounds`: seconds, optional

Every mode compiles down to the same sequence of segments (`prep`, `work`, `rest`) that a single runner plays:

| Mode | How it maps |
|------|-------------|
| Interval/HIIT | timed work + timed rest, repeated for N rounds |
| Tabata | locked to 20s on / 10s off / 8 rounds (editable after copying to Custom) |
| EMOM | a fixed-length slot (default 60s) every round, with a cue at each slot start |
| AMRAP | one long countdown, with a tap to count completed rounds |
| Kettlebell Flow | tap steps (rep targets allowed), one tap per round by default, then a timed rest, repeating until you stop |
| Custom | any mix of timed/tap work and rest steps |

The runner is a pure, clock-based state machine so it can be unit tested without a UI.

## Screens

1. **Library:** the saved workouts, with New (choose a mode first), Duplicate, Delete, drag to reorder, tap to open, Start.
2. **Editor:** name, mode, get-ready time, rounds (a number or "until I stop"), rest between rounds, and the step list (drag to reorder, add and remove, edit label/time/reps/kind).
3. **Runner (full screen):** big current step name, a huge countdown or "Done" button, the round counter, and the next step greyed below.
   Controls: pause/resume, skip forward/back, quit.
   Rest screens have a different colour treatment, and ±15s to adjust the rest.
4. **Settings:** sound on/off and volume, beep threshold (default last 3 seconds), keep screen awake, backup export/import.

Layout: single column on phone. On desktop it is a centred column, or library on the left and editor/runner on the right if there is room.

## Audio

- Beeps on the last 3 seconds of every timed step.
- A distinct tone at the start of work, the start of rest, and workout complete.
- Audio is generated with Web Audio (no sound files to load), unlocked on the Start tap.
- Vibration where the platform supports it (not iOS).

## Look and feel

- Background: dark graphite with a subtle granite/brushed-chrome texture.
- Surfaces: slightly lighter panels with thin metallic highlights on their edges.
- Accent: turquoise/spearmint (about `#2EE6C5`), used for the primary action, active step and progress.
- Text: white, with large tabular numerals for the clock.
- Rest and work states are visibly different at a glance.
- Large touch targets.

## Seed library (starting workouts)

*Revised 2026-11-20 after first use: Full Body A and B are 40s-on / 20s-off exercise lists, not tap-through flows.*

**Full Body A** and **Full Body B** are Interval workouts: a 10s get-ready, then each exercise for 40s with a shared 20s rest between exercises, through the list once (`rounds` 1, `restBetweenSteps` 20; editable in the app).

- Full Body A: Flat Bench, Reverse Lunge, Deep Press-Ups, Chin Ups, Oblique Dips, B Stance RDL, KB Shoulder Press, Goblet Squat, Bicep Curls, Calf Raises.
- Full Body B: Offset Squats, Deep Handle Push, 1 Arm Rows, Reverse Lunges, Thrusters, Single RDL, KB Shoulder Press, High Pulls, Horn Curls, Weighted Crunches.

**Kettlebell Rounds (Athenian Complex)** is a Flow workout: 5 Rows, 5 Squats, 5 Cleans, 5 Swings, 5 High Pulls, 5 Snatches, 5 Thrusters, 5 Push Presses, 10 Press Ups. Tap once per round, 2:00 rest, repeat until stopped, 10s get-ready.

The model gained an optional `restBetweenSteps` (shared rest after each exercise). The Interval template is now a 3-exercise list (40s on, 20s rest, 3 rounds). Saved copies of the original tap-through Full Body A/B are converted automatically if untouched.

## Tech choices (my calls)

React + TypeScript + Vite, `vite-plugin-pwa` for installability and offline, Vitest for the engine, `dnd-kit` for drag reorder, plain CSS with custom properties for theming (no heavy UI kit), `localStorage` for the library (small data), and deployment to GitHub Pages via GitHub Actions.

## Left to the builder

Exact sounds and frequencies, icon set, animation details, empty states, app icon and manifest, and the precise desktop layout breakpoint.

## Calls I made, to check

- The 3 seed workouts all use Flow mode with a 2:00 rest, since your screenshots showed no timing.
- The third screenshot showed the same list as Full Body B (with a green scribble), so I used the Athenian Complex for Kettlebell Rounds.
- "10" in your screenshots is treated as the exercise count, not a rep target.
- Tabata is locked at 20/10 × 8.
- v1 has no history, accounts or spoken cues.
