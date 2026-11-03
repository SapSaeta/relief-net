#!/usr/bin/env node
// Edits the demo recording (record.mjs) into the final video with ffmpeg:
//   - every wait for a model call is sped up to CUT_SECONDS and labelled "sped up" with its real duration;
//   - the narration of each scene starts with the scene (draft voice from tts, or one recorded voice-over file);
//   - also writes a silent version and the narration script with timecodes for recording a real voice.
//
// Usage: node scripts/demo/edit.mjs [--voice=path/to/voice-over.m4a] [--face=path/to/intro-to-camera.mov]
//   --face puts the author's intro to camera first, with a lower third that states the project is personal.
// Reads private/video/{raw.webm,markers.json,audio/*.aiff}; writes private/video/relief-net-demo*.mp4 and timecodes.md.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const DIR = 'private/video';
const CUT_SECONDS = 3;
const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const voice = arg('voice');
const face = arg('face');
const m = JSON.parse(readFileSync(`${DIR}/markers.json`, 'utf8'));
const end = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', `${DIR}/raw.webm`]));

// Keep/speed-up segments over the raw timeline.
const segments = [];
let at = 0;
for (const c of m.cuts) {
  if (c.start > at) segments.push({ start: at, end: c.start, speed: 1 });
  segments.push({ start: c.start, end: c.end, speed: (c.end - c.start) / CUT_SECONDS, label: c.label });
  at = c.end;
}
segments.push({ start: at, end, speed: 1 });

/** Raw time → final time. */
function mapTime(t) {
  let out = 0;
  for (const s of segments) {
    if (t <= s.start) break;
    out += (Math.min(t, s.end) - s.start) / s.speed;
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

const parts = segments.map((s, i) => `[0:v]trim=${s.start.toFixed(3)}:${s.end.toFixed(3)},setpts=(PTS-STARTPTS)/${s.speed.toFixed(4)},fps=30[s${i}]`);
const filters = [...parts, `${segments.map((_, i) => `[s${i}]`).join('')}concat=n=${segments.length}:v=1:a=0[cat]`];
let last = 'cat';
badges.forEach((s, i) => {
  const from = mapTime(s.start);
  filters.push(`[${last}][${i + 1}:v]overlay=x=W-w-24:y=H-h-24:enable='between(t,${from.toFixed(2)},${(from + CUT_SECONDS).toFixed(2)})'[b${i}]`);
  last = `b${i}`;
});
const videoInputs = ['-i', `${DIR}/raw.webm`, ...badges.flatMap((_, i) => ['-i', `${DIR}/badge-${i}.png`])];
const total = mapTime(end);

const encode = ['-map', `[${last}]`, '-c:v', 'libx264', '-crf', '19', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-movflags', '+faststart'];
execFileSync('ffmpeg', ['-v', 'error', '-y', ...videoInputs, '-filter_complex', filters.join(';'), ...encode, '-an', `${DIR}/relief-net-demo-silent.mp4`]);

// Narration: one clip per scene from tts, or a single recorded voice-over from the start.
const clips = voice ? [{ file: voice, at: 0 }] : m.scenes.map((s) => ({ file: `${DIR}/audio/${s.id}.aiff`, at: mapTime(s.t) + 0.4 }));
const audioInputs = clips.flatMap((c) => ['-i', c.file]);
const delays = clips.map((c, i) => `[${i + 1}:a]adelay=${Math.round(c.at * 1000)}:all=1[a${i}]`);
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
  offset = Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', face]));
  const faceFilter = [
    `[0:v]scale=1440:900:force_original_aspect_ratio=increase,crop=1440:900,fps=30,setsar=1[f]`,
    `[f][1:v]overlay=x=48:y=H-h-48:enable='between(t,0.5,${Math.max(1, offset - 0.5).toFixed(2)})'[fv]`,
    `[0:a]aresample=48000,aformat=channel_layouts=stereo[fa]`,
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
