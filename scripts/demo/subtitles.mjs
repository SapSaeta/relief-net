#!/usr/bin/env node
// Subtitles for the final demo video: transcribes its sound track with Muse Voice Transcribe (turn-level
// timestamps). Narrated scenes use the exact script (scenes.json, as listed in timecodes.md) timed by the turns
// heard in them; the intro to camera uses the transcript, with product names spelled right. Each part is split
// into short cues of up to two lines, timed by their share of the text.
//
// Usage: node --env-file=.env scripts/demo/subtitles.mjs [private/video/relief-net-demo-final.mp4]
// Writes <video>.srt next to the video (≈ $0.01 of transcription).

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';

const video = process.argv[2] ?? 'private/video/relief-net-demo-final.mp4';
const wav = video.replace(/\.\w+$/, '.16k.wav');
const LINE = 42;
const SPELLING = [[/relief ?net/gi, 'relief-net'], [/indy ?track|indie ?track/gi, 'Indie track'], [/\bU\.?M\.?E\b/g, 'UME']];

execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', video, '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav]);

const form = new FormData();
const request = { model: process.env.MODEL_VOICE ?? 'muse-voice-transcribe-1.0', audioEncoding: 'WAV', mode: 'ENDPOINTING', languageBias: ['English'] };
form.append('request', new Blob([JSON.stringify(request)], { type: 'application/json' }));
form.append('audio', new Blob([readFileSync(wav)], { type: 'audio/wav' }), 'audio.wav');
const base = process.env.MODEL_API_BASE_URL ?? 'https://api.meta.ai/v1';
const res = await fetch(`${base}/asr/transcribe`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.MODEL_API_KEY}`, Accept: 'application/json' }, body: form });
if (!res.ok) throw new Error(`Transcription failed: ${res.status} ${await res.text()}`);
const { turns } = await res.json();

/** Words → cues of at most two lines of LINE characters, ending at a sentence or clause when possible. */
function chunks(text) {
  const words = text.trim().split(/\s+/);
  const out = [];
  let cur = [];
  for (const w of words) {
    const next = [...cur, w].join(' ');
    if (next.length > 2 * LINE - 6 && cur.length) {
      out.push(cur.join(' '));
      cur = [w];
    } else cur.push(w);
    if (/[.!?]$/.test(w) && cur.join(' ').length > LINE / 2) {
      out.push(cur.join(' '));
      cur = [];
    }
  }
  if (cur.length) out.push(cur.join(' '));
  // A one-word tail reads badly: share the last two cues out evenly instead.
  if (out.length > 1 && out.at(-1).length < 20 && !/[.!?]$/.test(out.at(-2))) {
    const both = `${out.at(-2)} ${out.pop()}`.split(' ');
    let half = 0;
    while (both.slice(0, half + 1).join(' ').length < (both.join(' ').length) / 2) half++;
    out[out.length - 1] = both.slice(0, half).join(' ');
    out.push(both.slice(half).join(' '));
  }
  return out;
}

/** Breaks a cue into two balanced lines. */
function lines(cue) {
  if (cue.length <= LINE) return cue;
  const words = cue.split(' ');
  let best = 1;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' ').length;
    if (Math.abs(cue.length / 2 - a) < Math.abs(cue.length / 2 - words.slice(0, best).join(' ').length)) best = i;
  }
  return `${words.slice(0, best).join(' ')}\n${words.slice(best).join(' ')}`;
}

const stamp = (ms) => {
  const t = Math.max(0, Math.round(ms));
  const p = (n, w = 2) => String(n).padStart(w, '0');
  return `${p(Math.floor(t / 3_600_000))}:${p(Math.floor(t / 60_000) % 60)}:${p(Math.floor(t / 1000) % 60)},${p(t % 1000, 3)}`;
};

// Scene windows and script from timecodes.md (written by edit.mjs for this cut).
const sec = (mmss) => mmss.split(':').reduce((a, b) => a * 60 + Number(b), 0) * 1000;
const scenes = [...readFileSync('private/video/timecodes.md', 'utf8').matchAll(/\*\*(\d+:\d+)–(\d+:\d+) · (.+?)\*\*\n\n(.+)/g)].map((x) => ({
  start: sec(x[1]),
  end: sec(x[2]) + 999,
  text: x[4].startsWith('(') ? null : x[4],
  turns: [],
}));
for (const t of turns) scenes.find((s) => (t.startMs + t.endMs) / 2 <= s.end)?.turns.push(t);

const cues = [];
function place(text, start, end) {
  const parts = chunks(text);
  const total = parts.reduce((s, x) => s + x.length, 0);
  let at = start;
  for (const part of parts) {
    const next = at + ((end - start) * part.length) / total;
    cues.push({ start: at, end: next, text: lines(part) });
    at = next;
  }
}
for (const s of scenes) {
  if (!s.turns.length) continue;
  if (s.text) place(s.text, s.turns[0].startMs, s.turns.at(-1).endMs);
  else for (const t of s.turns) place(SPELLING.reduce((x, [re, to]) => x.replace(re, to), t.transcript), t.startMs, t.endMs);
}
const srt = cues.map((c, i) => `${i + 1}\n${stamp(c.start)} --> ${stamp(c.end)}\n${c.text}\n`).join('\n');
const out = video.replace(/\.\w+$/, '.srt');
writeFileSync(out, srt);
execFileSync('rm', [wav]);
console.log(`→ ${out}: ${cues.length} cues from ${turns.length} turns`);
