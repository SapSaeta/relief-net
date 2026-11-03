#!/usr/bin/env node
// Draft narration for the demo with macOS `say`, one clip per scene (scripts/demo/scenes.json), and the
// duration of each clip, which record.mjs uses to hold each scene. 150 words per minute, close to a person
// reading aloud, so a recorded voice-over fits the same scenes.
// Usage: node scripts/demo/tts.mjs   → private/video/audio/<scene>.aiff + durations.json

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

const OUT = 'private/video/audio';
const scenes = JSON.parse(readFileSync('scripts/demo/scenes.json', 'utf8'));
mkdirSync(OUT, { recursive: true });
const durations = {};
for (const s of scenes) {
  const file = `${OUT}/${s.id}.aiff`;
  execFileSync('say', ['-v', 'Samantha', '-r', '150', '-o', file, s.text]);
  durations[s.id] = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]));
  console.log(`${s.id.padEnd(11)} ${durations[s.id].toFixed(1)} s`);
}
writeFileSync(`${OUT}/durations.json`, JSON.stringify(durations, null, 1));
console.log(`total ${Object.values(durations).reduce((a, b) => a + b, 0).toFixed(1)} s`);
