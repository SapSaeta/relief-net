#!/usr/bin/env node
// Builds a fully synthetic intake video for local testing:
//   Muse Image (muse-image-1.0) -> 4 photos of a flood-damaged home (no people, no text)
//   macOS `say`                 -> synthetic narration
//   ffmpeg (ffmpeg-static)      -> H.264/AAC MP4 with faststart
// Usage: node scripts/make-fixture.mjs [outDir]   (default: private/fixtures, git-ignored)
// Never prints the key.

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import ffmpeg from 'ffmpeg-static';

function loadDotEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    const value = m[2].replace(/^['"]|['"]$/g, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = value;
  }
}

loadDotEnv();

const key = process.env.MODEL_API_KEY;
const base = process.env.MODEL_API_BASE_URL || 'https://api.meta.ai/v1';
const outDir = process.argv[2] || 'private/fixtures';
if (!key) {
  console.error('✗ MODEL_API_KEY is missing (see .env.example).');
  process.exit(1);
}
mkdirSync(outDir, { recursive: true });

const STYLE =
  'Photorealistic smartphone photo, handheld, natural light, no people, no text, no logos, no watermarks.';
const SCENES = [
  'Ground-floor kitchen of a small family home right after a river flood: muddy water line about one meter up the walls, a long diagonal crack in the plaster wall next to the window.',
  'Living room after a flood: thick brown mud on the floor, scattered debris, an overturned wooden chair and soaked cardboard boxes.',
  'Back door area of a flooded house: a broken window with shattered glass on the windowsill, wet debris piled outside.',
  'Bedroom wall after a flood: dark mold patches spreading above the skirting board, peeling wet paint.',
];

const NARRATION =
  'Hi, this is my house after the flood. The water reached about one meter on the ground floor. ' +
  'In the kitchen there is a long crack in the wall next to the window. ' +
  'The living room is full of mud and debris. The back window is broken. ' +
  'And there is mold starting on the bedroom wall. ' +
  'Two adults and one child live here. We need help clearing the mud and drying the walls.';

async function generateImage(prompt, file) {
  const res = await fetch(`${base}/images/generations`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'muse-image-1.0',
      prompt: `${prompt} ${STYLE}`,
      n: 1,
      size: '1280x720',
      output_format: 'jpeg',
      reasoning_strength: 'low',
      // Keep it purely generated: no lookups of real photos.
      tool_enablement: { enable_image_search: false, enable_web_search: false, enable_shell: false },
    }),
  });
  if (!res.ok) throw new Error(`Muse Image ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const json = await res.json();
  writeFileSync(file, Buffer.from(json.data[0].b64_json, 'base64'));
}

console.log(`• Generating ${SCENES.length} synthetic scenes with muse-image-1.0 …`);
const images = SCENES.map((_, i) => join(outDir, `scene-${i + 1}.jpg`));
await Promise.all(SCENES.map((scene, i) => generateImage(scene, images[i])));

console.log('• Synthesizing narration …');
const aiff = join(outDir, 'narration.aiff');
execFileSync('say', ['-v', 'Samantha', '-o', aiff, NARRATION]);

const info = execFileSync('afinfo', [aiff], { encoding: 'utf8' });
const durationSec = Number(/estimated duration: ([\d.]+)/.exec(info)?.[1] ?? 20);
const perScene = Math.max(3, Math.ceil(durationSec / images.length));

console.log(`• Assembling MP4 (${images.length} × ${perScene}s) …`);
const video = join(outDir, 'intake-flood.mp4');
const inputs = images.flatMap((img) => ['-loop', '1', '-t', String(perScene), '-i', img]);
const scale = images.map((_, i) => `[${i}:v]scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[v${i}]`);
const concat = `${images.map((_, i) => `[v${i}]`).join('')}concat=n=${images.length}:v=1:a=0[v]`;
execFileSync(ffmpeg, [
  '-y', '-hide_banner', '-loglevel', 'error',
  ...inputs, '-i', aiff,
  '-filter_complex', [...scale, concat].join(';'),
  '-map', '[v]', '-map', `${images.length}:a`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest',
  '-movflags', '+faststart', video,
]);

console.log(`✓ ${video}`);
