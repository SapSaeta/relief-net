#!/usr/bin/env node
// Edits the demo recording (record.mjs) into the final video with ffmpeg:
//   - every wait for a model call is sped up to CUT_SECONDS and labelled "sped up" with its real duration;
//   - the narration of each scene starts with the scene (draft voice from tts, or one recorded voice-over file);
//   - also writes a silent version and the narration script with timecodes for recording a real voice.
//
// Usage: node scripts/demo/edit.mjs [--voice=voice-over.m4a | --voice=private/video/voice] [--face=intro-to-camera.mov]
//   --voice with a folder (voice.mjs) places <scene>.wav at the start of each scene, the draft voice fills any gap;
//     the key press that stopped each take is cut off, levels are evened out, and still frames at the end of a
//     scene are dropped down to the length of its recorded voice, so the video follows the author's pace;
//   --face puts the author's intro to camera first (trailing silence trimmed), with a lower third that states the
//     project is personal.
// Reads private/video/{raw.webm,markers.json,audio/*.aiff}; writes private/video/relief-net-demo*.mp4 and timecodes.md.

import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';

import { CARDS, cardHtml } from './card.mjs';

const DIR = 'private/video';
const CUT_SECONDS = 3;
const LEVEL = 'loudnorm=I=-16:TP=-1.5:LRA=11,aresample=48000';
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const voice = arg('voice');
const face = arg('face');
const m = JSON.parse(readFileSync(`${DIR}/markers.json`, 'utf8'));
const duration = (file) => Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]));
const end = duration(`${DIR}/raw.webm`);

/** Peak level (dB) of every window of `ms` milliseconds. */
function peaks(file, ms) {
  const af = `aresample=48000,asetnsamples=${48 * ms},astats=metadata=1:reset=1,ametadata=print:key=lavfi.astats.Overall.Peak_level`;
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', file, '-af', af, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  return [...log.matchAll(/Peak_level=(\S+)/g)].map((x) => (Number.isFinite(Number(x[1])) ? Number(x[1]) : -99));
}

/** Seconds of a take to keep: the take was stopped with Enter, so a key click (a quiet gap, then a sudden peak) ends it. */
function beforeKeyPress(file) {
  const p = peaks(file, 10);
  let click = p.length;
  for (let i = Math.max(1, p.length - 60); i < p.length; i++) if (p[i - 1] <= -24 && Math.max(...p.slice(i, i + 4)) >= -16) click = i;
  return Math.max(0, click - 2) / 100;
}

// Per-scene recordings: how long each one is once the key press is cut off.
const perScene = voice && statSync(voice).isDirectory();
const takes = new Map();
if (perScene)
  for (const s of m.scenes) {
    const file = `${voice}/${s.id}.wav`;
    if (existsSync(file)) takes.set(s.id, { file, keep: beforeKeyPress(file) });
    else console.log(`  ${s.id}: no recording yet, draft voice`);
  }

// Still frames at the end of each scene (record.mjs holds every scene for the draft narration + 1 s).
const stills = [];
if (takes.size) {
  const log = spawnSync('ffmpeg', ['-hide_banner', '-i', `${DIR}/raw.webm`, '-vf', 'freezedetect=n=0.003:d=0.3', '-map', '0:v', '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  for (const x of log.matchAll(/freeze_start: ([\d.]+)[\s\S]*?freeze_end: ([\d.]+)/g)) stills.push([Number(x[1]), Number(x[2])]);
}

// Raw timeline: model waits sped up, and still scene endings beyond the recorded voice dropped.
const special = m.cuts.map((c) => ({ start: c.start, end: c.end, speed: (c.end - c.start) / CUT_SECONDS, label: c.label }));
m.scenes.forEach((s, i) => {
  const take = takes.get(s.id);
  if (!take) return;
  const sceneEnd = m.scenes[i + 1]?.t ?? m.end;
  const cuts = m.cuts.filter((c) => c.start >= s.t && c.end <= sceneEnd);
  const still = stills.find(([a, b]) => a < sceneEnd - 0.05 && b >= sceneEnd - 0.2);
  if (!still) return;
  const from = Math.max(still[0], s.t, ...cuts.map((c) => c.end));
  const shown = sceneEnd - s.t - cuts.reduce((sum, c) => sum + (c.end - c.start - CUT_SECONDS), 0);
  const drop = Math.min(sceneEnd - from - 0.3, shown - (0.4 + take.keep + 0.9));
  if (drop > 0.2) special.push({ start: sceneEnd - drop, end: sceneEnd, skip: true });
});
special.sort((a, b) => a.start - b.start);
const segments = [];
let at = 0;
for (const x of special) {
  if (x.start > at) segments.push({ start: at, end: x.start, speed: 1 });
  segments.push(x);
  at = x.end;
}
segments.push({ start: at, end, speed: 1 });
const shownSegments = segments.filter((s) => !s.skip);

/** Raw time → final time. */
function mapTime(t) {
  let out = 0;
  for (const s of segments) {
    if (t <= s.start) break;
    if (!s.skip) out += (Math.min(t, s.end) - s.start) / s.speed;
  }
  return out;
}

// "Sped up" badges, rendered by Chrome as transparent PNGs.
const chrome = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const badges = segments.filter((s) => s.label);
badges.forEach((s, i) => {
  const html = `<html style="background:transparent"><body style="margin:0;background:transparent;font-family:-apple-system,Helvetica,sans-serif">
    <div style="display:inline-block;margin:8px;padding:12px 22px;border-radius:999px;background:rgba(0,0,0,.82);color:#fff;font-size:26px;font-weight:600;border:1px solid rgba(255,255,255,.3)">
    ⏩ Sped up · ${s.label} took ${Math.round(s.end - s.start)} s</div></body></html>`;
  writeFileSync(`${DIR}/badge-${i}.html`, html);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', '--window-size=640,90', `--screenshot=${DIR}/badge-${i}.png`, `file://${process.cwd()}/${DIR}/badge-${i}.html`], { stdio: 'ignore' });
});

const parts = shownSegments.map((s, i) => `[0:v]trim=${s.start.toFixed(3)}:${s.end.toFixed(3)},setpts=(PTS-STARTPTS)/${s.speed.toFixed(4)},fps=30[s${i}]`);
const filters = [...parts, `${shownSegments.map((_, i) => `[s${i}]`).join('')}concat=n=${shownSegments.length}:v=1:a=0[cat]`];
let last = 'cat';
badges.forEach((s, i) => {
  const from = mapTime(s.start);
  filters.push(`[${last}][${i + 1}:v]overlay=x=W-w-24:y=H-h-24:enable='between(t,${from.toFixed(2)},${(from + CUT_SECONDS).toFixed(2)})'[b${i}]`);
  last = `b${i}`;
});
// The opening card is drawn again at full size over its scene (it was recorded at half scale).
writeFileSync(`${DIR}/card-intro.html`, cardHtml(...CARDS.intro));
execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--window-size=1440,900', `--screenshot=${DIR}/card-intro.png`, `file://${process.cwd()}/${DIR}/card-intro.html`], { stdio: 'ignore' });
filters.push(`[${last}][${badges.length + 1}:v]overlay=0:0:enable='lt(t,${mapTime(m.scenes[1].t).toFixed(2)})'[card]`);
last = 'card';
const videoInputs = ['-i', `${DIR}/raw.webm`, ...badges.flatMap((_, i) => ['-i', `${DIR}/badge-${i}.png`]), '-i', `${DIR}/card-intro.png`];
const total = mapTime(end);

const encode = ['-map', `[${last}]`, '-c:v', 'libx264', '-crf', '19', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
execFileSync('ffmpeg', ['-v', 'error', '-y', ...videoInputs, '-filter_complex', filters.join(';'), ...encode, '-an', `${DIR}/relief-net-demo-silent.mp4`]);

// Narration: one clip per scene (recorded with voice.mjs, else the tts draft), or a single voice-over from the start.
const clips =
  voice && !perScene
    ? [{ file: voice, at: 0 }]
    : m.scenes.map((s, i) => {
        const take = takes.get(s.id);
        const clip = take ?? { file: `${DIR}/audio/${s.id}.aiff` };
        const at = mapTime(s.t) + 0.4;
        const room = (m.scenes[i + 1] ? mapTime(m.scenes[i + 1].t) : total) - at;
        const length = take?.keep ?? duration(clip.file);
        if (length > room) console.log(`  ⚠️ ${s.id}: ${length.toFixed(1)} s of voice for ${room.toFixed(1)} s of scene`);
        return { ...clip, at };
      });
const audioInputs = clips.flatMap((c) => ['-i', c.file]);
const delays = clips.map((c, i) => {
  const trim = c.keep ? `atrim=0:${c.keep.toFixed(2)},afade=t=out:st=${Math.max(0, c.keep - 0.04).toFixed(2)}:d=0.04,${LEVEL},` : '';
  return `[${i + 1}:a]${trim}adelay=${Math.round(c.at * 1000)}:all=1[a${i}]`;
});
const mix = `${clips.map((_, i) => `[a${i}]`).join('')}amix=inputs=${clips.length}:normalize=0,apad,atrim=0:${total.toFixed(2)}[aout]`;
execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', `${DIR}/relief-net-demo-silent.mp4`, ...audioInputs, '-filter_complex', [...delays, mix].join(';'), '-map', '0:v', '-map', '[aout]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', `${DIR}/relief-net-demo.mp4`]);

// Intro to camera: same frame size, a lower third, then the screen recording.
let offset = 0;
if (face) {
  const lower = `<html style="background:transparent"><body style="margin:0;background:transparent;font-family:-apple-system,Helvetica,sans-serif">
    <div style="display:inline-block;margin:8px;padding:16px 26px;border-radius:14px;background:rgba(0,0,0,.78);color:#fff;border:1px solid rgba(255,255,255,.25)">
    <div style="font-size:34px;font-weight:600">Javier · built relief-net solo for the Indie track</div>
    <div style="font-size:24px;color:#cfcfcf;margin-top:6px">Personal project, not affiliated with the UME or any employer</div></div></body></html>`;
  writeFileSync(`${DIR}/lower-third.html`, lower);
  execFileSync(chrome, ['--headless=new', '--disable-gpu', '--hide-scrollbars', '--default-background-color=00000000', '--window-size=1000,140', `--screenshot=${DIR}/lower-third.png`, `file://${process.cwd()}/${DIR}/lower-third.html`], { stdio: 'ignore' });
  // Keep the clip up to half a second after the last words.
  const spoken = peaks(face, 100).findLastIndex((x) => x > -20);
  offset = Math.min(duration(face), (spoken + 1) / 10 + 0.5);
  const faceFilter = [
    `[0:v]trim=0:${offset.toFixed(2)},setpts=PTS-STARTPTS,scale=1440:900:force_original_aspect_ratio=increase,crop=1440:900,fps=30,setsar=1[f]`,
    `[f][1:v]overlay=x=48:y=H-h-48:enable='between(t,0.5,${Math.max(1, offset - 0.5).toFixed(2)})'[fv]`,
    `[0:a]atrim=0:${offset.toFixed(2)},asetpts=PTS-STARTPTS,afade=t=out:st=${(offset - 0.3).toFixed(2)}:d=0.3,${LEVEL},aformat=channel_layouts=stereo[fa]`,
    `[2:v]fps=30,setsar=1[mv]`,
    `[2:a]aresample=48000,aformat=channel_layouts=stereo[ma]`,
    `[fv][fa][mv][ma]concat=n=2:v=1:a=1[v][a]`,
  ].join(';');
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', face, '-i', `${DIR}/lower-third.png`, '-i', `${DIR}/relief-net-demo.mp4`, '-filter_complex', faceFilter, '-map', '[v]', '-map', '[a]', '-c:v', 'libx264', '-crf', '19', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', `${DIR}/relief-net-demo-final.mp4`]);
}

const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
const script = m.scenes.map((s, i) => {
  const text = m.scenesText.find((x) => x.id === s.id);
  const next = m.scenes[i + 1] ? mapTime(m.scenes[i + 1].t) : total;
  return `**${mmss(offset + mapTime(s.t))}–${mmss(offset + next)} · ${text.title}**\n\n${text.text}\n`;
});
const intro = face ? `**0:00–${mmss(offset)} · Intro to camera**\n\n(your own words)\n\n` : '';
writeFileSync(`${DIR}/timecodes.md`, `# relief-net demo · narration (${mmss(offset + total)})\n\n${intro}${script.join('\n')}`);
console.log(`→ ${DIR}/relief-net-demo.mp4 (${mmss(total)}), relief-net-demo-silent.mp4, timecodes.md${face ? `, relief-net-demo-final.mp4 (${mmss(offset + total)})` : ''}`);
