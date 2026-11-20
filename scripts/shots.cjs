// Dev-only: screenshots of the built app for visual review. Usage: node scripts/shots.cjs <outDir>
const { chromium } = require('playwright');
const { mkdirSync } = require('node:fs');

const out = process.argv[2] ?? 'shots';
mkdirSync(out, { recursive: true });
const BASE = 'http://localhost:4173/workout-timer/';

const step = (id, label, kind, role, extra = {}) => ({ id, label, kind, role, ...extra });
const library = [
  {
    id: 'int', name: 'Monday Legs', mode: 'interval', prepSeconds: 0, rounds: 3, advance: 'step', restBetweenRounds: 0,
    steps: [step('a', 'Squats', 'timed', 'work', { seconds: 40 }), step('b', 'Rest', 'timed', 'rest', { seconds: 20 })],
  },
  {
    id: 'ath', name: 'Kettlebell Rounds (Athenian Complex)', mode: 'flow', prepSeconds: 10, rounds: null, advance: 'round', restBetweenRounds: 120,
    steps: [['Rows', 5], ['Squats', 5], ['Cleans', 5], ['Swings', 5], ['High Pulls', 5], ['Snatches', 5], ['Thrusters', 5], ['Push Presses', 5], ['Press Ups', 10]]
      .map(([l, r], i) => step(`s${i}`, l, 'tap', 'work', { reps: r })),
  },
  {
    id: 'fb', name: 'Full Body A', mode: 'flow', prepSeconds: 10, rounds: null, advance: 'round', restBetweenRounds: 120,
    steps: ['Flat Bench', 'Reverse Lunge', 'Deep Press-Ups', 'Chin Ups', 'Oblique Dips'].map((l, i) => step(`f${i}`, l, 'tap', 'work')),
  },
];

(async () => {
const browser = await chromium.launch();
async function shoot(name, viewport, fn) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.addInitScript((lib) => localStorage.setItem('workout-timer:library:v1', JSON.stringify(lib)), library);
  await page.goto(BASE);
  await fn(page);
  await page.screenshot({ path: `${out}/${name}.png` });
  await ctx.close();
}

for (const [tag, vp] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1280, height: 800 }]]) {
  await shoot(`${tag}-library`, vp, async () => {});
  await shoot(`${tag}-editor`, vp, async (p) => { await p.getByRole('button', { name: 'Kettlebell Rounds (Athenian Complex)', exact: true }).click(); });
  await shoot(`${tag}-run-start`, vp, async (p) => { await p.getByRole('button', { name: 'Start Kettlebell Rounds (Athenian Complex)', exact: true }).click(); });
  await shoot(`${tag}-run-flow`, vp, async (p) => {
    await p.getByRole('button', { name: 'Start Kettlebell Rounds (Athenian Complex)', exact: true }).click();
    await p.getByRole('button', { name: 'Start', exact: true }).click();
    await p.waitForTimeout(10500);
  });
  await shoot(`${tag}-run-work`, vp, async (p) => {
    await p.getByRole('button', { name: 'Start Monday Legs', exact: true }).click();
    await p.getByRole('button', { name: 'Start', exact: true }).click();
    await p.waitForTimeout(1200);
  });
  await shoot(`${tag}-run-rest`, vp, async (p) => {
    await p.getByRole('button', { name: 'Start Kettlebell Rounds (Athenian Complex)', exact: true }).click();
    await p.getByRole('button', { name: 'Start', exact: true }).click();
    await p.waitForTimeout(10500);
    await p.getByRole('button', { name: 'Done', exact: true }).click();
    await p.waitForTimeout(500);
  });
}
await shoot('phone-settings', { width: 390, height: 844 }, async (p) => { await p.getByRole('button', { name: 'Settings', exact: true }).click(); });
await browser.close();

})().catch((e) => { console.error(e); process.exit(1); });
