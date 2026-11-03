#!/usr/bin/env node
// Records the author's voice-over one scene at a time, so each take can be redone on its own and every
// clip starts exactly with its scene in edit.mjs (--voice=private/video/voice).
//
// For each scene it shows the narration and the time the scene lasts on screen; Enter starts, Enter stops,
// then keep it, redo it or listen to it. Scenes already recorded are skipped unless --redo=<id>[,<id>].
//
// Usage (in your own terminal, it needs the microphone):
//   node scripts/demo/voice.mjs                list the microphones
//   node scripts/demo/voice.mjs --mic=<n>      record with microphone n
// Writes private/video/voice/<scene>.wav (git-ignored).

import { execFileSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline/promises';

const DIR = 'private/video/voice';
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const mic = arg('mic');
const redo = new Set((arg('redo') ?? '').split(',').filter(Boolean));

if (mic === undefined) {
  const out = spawn('ffmpeg', ['-hide_banner', '-f', 'avfoundation', '-list_devices', 'true', '-i', '']);
  let text = '';
  out.stderr.on('data', (d) => (text += d));
  out.on('close', () => {
    const audio = text.split('audio devices:')[1] ?? '';
    console.log('Microphones:');
    for (const m of audio.matchAll(/\[(\d+)\] (.+)/g)) console.log(`  --mic=${m[1]}  ${m[2]}`);
  });
} else {
  const m = JSON.parse(readFileSync('private/video/markers.json', 'utf8'));
  // Seconds each scene stays on screen in the edited video (same mapping as edit.mjs).
  const cuts = m.cuts.map((c) => ({ ...c, saved: c.end - c.start - 3 }));
  const final = (t) => t - cuts.filter((c) => c.end <= t).reduce((s, c) => s + c.saved, 0);
  const slot = (i) => final(m.scenes[i + 1]?.t ?? m.end) - final(m.scenes[i].t) - 0.4;

  mkdirSync(DIR, { recursive: true });
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  console.log('Speak calmly, about a hand away from the microphone. Ctrl+C to stop at any time.\n');
  for (const [i, s] of m.scenes.entries()) {
    const file = `${DIR}/${s.id}.wav`;
    if (existsSync(file) && !redo.has(s.id)) continue;
    const text = m.scenesText.find((x) => x.id === s.id);
    for (;;) {
      console.log(`\n── ${i + 1}/${m.scenes.length} · ${text.title} · fits in ${slot(i).toFixed(0)} s ──\n\n  ${text.text}\n`);
      await rl.question('Enter to start recording… ');
      const rec = spawn('ffmpeg', ['-v', 'error', '-y', '-f', 'avfoundation', '-i', `:${mic}`, '-ac', '1', '-ar', '48000', file], { stdio: ['pipe', 'ignore', 'inherit'] });
      const started = Date.now();
      await rl.question('● Recording. Enter to stop… ');
      rec.stdin.write('q');
      await new Promise((r) => rec.on('close', r));
      const took = (Date.now() - started) / 1000;
      const long = took > slot(i) ? `  ⚠️ longer than the scene (${slot(i).toFixed(0)} s): it would run into the next one` : '';
      console.log(`  ${took.toFixed(1)} s${long}`);
      let answer = '';
      while (!['k', 'r'].includes(answer)) {
        answer = (await rl.question('  [k]eep · [r]edo · [p]lay ? ')).trim().toLowerCase();
        if (answer === 'p') execFileSync('afplay', [file]);
      }
      if (answer === 'k') break;
    }
  }
  rl.close();
  console.log(`\nDone. Edit with: node scripts/demo/edit.mjs --voice=${DIR} [--face=<intro clip>]`);
}
