#!/usr/bin/env node
// Records the 3-minute demo: drives the app in Chrome (playwright-core, channel "chrome") through the whole
// flow on the synthetic Riverside scenario and saves a screen recording plus scene/cut markers for edit.mjs.
//
// Each scene lasts at least as long as its narration (private/video/audio/durations.json, from tts.mjs).
// Waits for model calls are marked as cuts; edit.mjs speeds them up and labels them as sped up.
//
// Usage (local production build, local .data, a throwaway code that never appears on screen):
//   DEMO_ACCESS_CODE=<code> node scripts/demo/record.mjs [http://localhost:3004]
// Writes private/video/raw.webm and private/video/markers.json (git-ignored).

import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

import { chromium } from 'playwright-core';

import { CARDS, cardHtml } from './card.mjs';

const BASE = process.argv[2] ?? 'http://localhost:3004';
const OUT = 'private/video';
const VIDEO_FIXTURE = 'private/fixtures/intake-flood.mp4';
const CODE = process.env.DEMO_ACCESS_CODE ?? '';
const durations = JSON.parse(readFileSync(`${OUT}/audio/durations.json`, 'utf8'));
const scenes = JSON.parse(readFileSync('scripts/demo/scenes.json', 'utf8'));
const SIZE = { width: 1440, height: 900 };

mkdirSync(`${OUT}/raw`, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: SIZE, colorScheme: 'dark', recordVideo: { dir: `${OUT}/raw`, size: SIZE } });

// The demo code goes straight into the tab's session storage; a visible cursor follows the mouse.
await context.addInitScript((code) => {
  try {
    if (code) sessionStorage.setItem('relief-net-access-code', code);
  } catch {}
  addEventListener('DOMContentLoaded', () => {
    const dot = document.createElement('div');
    dot.style.cssText =
      'position:fixed;z-index:99999;width:22px;height:22px;margin:-11px 0 0 -11px;border-radius:50%;pointer-events:none;' +
      'background:rgba(255,255,255,.35);border:2px solid #fff;box-shadow:0 0 0 2px rgba(0,0,0,.4);transition:transform .15s;left:-50px;top:-50px';
    document.body.appendChild(dot);
    addEventListener('mousemove', (e) => {
      dot.style.left = `${e.clientX}px`;
      dot.style.top = `${e.clientY}px`;
    });
    addEventListener('mousedown', () => (dot.style.transform = 'scale(.6)'));
    addEventListener('mouseup', () => (dot.style.transform = 'scale(1)'));
  });
}, CODE);

const page = await context.newPage();
const t0 = Date.now();
const now = () => (Date.now() - t0) / 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const markers = { scenes: [], cuts: [] };
let cutInScene = 0;

async function scene(id, run) {
  const start = now();
  cutInScene = 0;
  markers.scenes.push({ id, t: start });
  console.log(`▶ ${id}`);
  await run();
  const visible = now() - start - cutInScene;
  await sleep(Math.max(0, (durations[id] + 1.0 - visible) * 1000));
}

/** A wait for a model call: kept in the recording, sped up and labelled in the edit. */
async function cut(label, wait) {
  const start = now();
  await wait();
  const end = now();
  markers.cuts.push({ label, start, end });
  cutInScene += end - start;
  console.log(`  ⏩ ${label}: ${(end - start).toFixed(1)} s`);
}

async function pointAt(locator) {
  await locator.scrollIntoViewIfNeeded();
  const box = await locator.boundingBox();
  if (box) await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2, { steps: 25 });
  await sleep(300);
}

async function click(locator) {
  await pointAt(locator);
  await locator.click();
}

async function scrollTo(locator, block = 'start') {
  await locator.evaluate((el, b) => el.scrollIntoView({ behavior: 'smooth', block: b }), block);
  await sleep(1200);
}

async function scrollBy(y, ms = 1500) {
  await page.evaluate((dy) => window.scrollBy({ top: dy, behavior: 'smooth' }), y);
  await sleep(ms);
}

async function card(id) {
  await page.setContent(cardHtml(...CARDS[id]));
}

const go = async (path) => {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await sleep(600);
};
/** A take with a failed model call is useless: stop early instead of recording the rest. */
async function expectOk(res) {
  if (!res.ok()) throw new Error(`Bad take: ${res.url()} → ${res.status()} ${await res.text()}`);
}
const waitFor = (path) => page.waitForResponse((r) => r.url().includes(path) && r.request().method() === 'POST', { timeout: 300_000 });

let caseUrl = '';

await scene('intro', async () => {
  await card('intro');
});

await scene('home', async () => {
  await go('/');
  await page.mouse.move(700, 300, { steps: 10 });
  await sleep(1500);
  await scrollBy(420, 2500);
});

await scene('intake', async () => {
  await go('/intake');
  await pointAt(page.getByText('Record or choose a video'));
  await page.setInputFiles('input[name=video]', VIDEO_FIXTURE);
  await sleep(800);
  const address = page.locator('input[name=location]');
  await click(address);
  await address.pressSequentially('4 Mill Lane, Riverside', { delay: 55 });
  await click(page.getByRole('button', { name: 'Send video for analysis' }));
  await scrollBy(260, 1200);
  await sleep(1500);
  await cut('video analysis', () => page.getByRole('link', { name: 'Open your case' }).waitFor({ timeout: 300_000 }));
  if (!(await page.getByText("Your help request is in the coordinator's queue").count())) throw new Error('Bad take: the help request was not drafted');
  await sleep(1500);
});

await scene('case', async () => {
  await click(page.getByRole('link', { name: 'Open your case' }));
  await page.waitForURL(/\/cases\//);
  caseUrl = page.url();
  await page.waitForLoadState('networkidle');
  await sleep(1500);
  await scrollBy(450, 2500);
  await scrollBy(450, 2500);
  await scrollTo(page.locator('figure').first());
  await sleep(1500);
});

await scene('triage', async () => {
  await go('/coordinator');
  await sleep(1500);
  await page.locator('#top select').selectOption('baseten');
  await click(page.getByRole('button', { name: 'Run triage' }));
  await cut('triage', async () => {
    await expectOk(await waitFor('/api/triage'));
    await page.waitForLoadState('networkidle');
    await sleep(1500);
  });
  await scrollTo(page.locator('li[id^="case-"]').first(), 'center');
  await sleep(1500);
});

await scene('duplicates', async () => {
  const confirm = page.getByRole('button', { name: 'Confirm merge' }).first();
  if (await confirm.count()) {
    await scrollTo(page.locator('#duplicates'), 'center');
    await click(confirm);
    await waitFor('/api/triage/merge');
    await page.waitForLoadState('networkidle');
    await sleep(1500);
  }
  const merged = page.getByText(/^Merged (automatically|by the coordinator)/).first();
  if (await merged.count()) await scrollTo(merged, 'center');
});

await scene('matching', async () => {
  await scrollTo(page.locator('#matching'));
  await page.locator('#matching select').selectOption('meta');
  await click(page.getByRole('button', { name: 'Match volunteers' }));
  await cut('matching agent', async () => {
    await expectOk(await waitFor('/api/match'));
    await page.waitForLoadState('networkidle');
    await sleep(1500);
  });
  await scrollTo(page.locator('#matching'));
  await click(page.getByText('Agent trace: every tool call and what code answered'));
  await sleep(1500);
  await scrollBy(300, 2000);
});

await scene('approve', async () => {
  const approve = page.getByRole('button', { name: 'Approve & dispatch' }).first();
  await scrollTo(approve, 'center');
  await click(approve);
  await waitFor('/api/match/decide');
  await page.waitForLoadState('networkidle');
  await sleep(1200);
});

await scene('report', async () => {
  await go('/');
  const href = await page.getByRole('link', { name: 'Sample report →' }).getAttribute('href');
  await go(href);
  await sleep(1200);
  await scrollBy(500, 2200);
  await scrollBy(500, 2200);
});

await scene('audit', async () => {
  await go('/audit');
  await page.mouse.move(600, 380, { steps: 15 });
});

await scene('measured', async () => {
  await go('/');
  await scrollTo(page.getByText('Measured on the scenario'), 'center');
  await pointAt(page.getByText('7/7', { exact: true }));
});

await scene('outro', async () => {
  await card('outro');
});

markers.end = now();
markers.caseUrl = caseUrl.replace(BASE, '');
markers.scenesText = scenes;
const video = page.video();
await context.close();
await browser.close();
renameSync(await video.path(), `${OUT}/raw.webm`);
writeFileSync(`${OUT}/markers.json`, JSON.stringify(markers, null, 1));
console.log(`→ ${OUT}/raw.webm (${markers.end.toFixed(1)} s), ${OUT}/markers.json`);
