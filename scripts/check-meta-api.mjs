#!/usr/bin/env node
// Checks that your Meta Model API key works from your connection/country.
// Usage:
//   node scripts/check-meta-api.mjs
//   node scripts/check-meta-api.mjs --sam https://public-url/photo.jpg "water damaged wall"
// No dependencies needed (Node 18+). Reads MODEL_API_KEY from the environment or the .env file.
// Never prints the key.

import { readFileSync, existsSync } from 'node:fs';

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
const textModel = process.env.MODEL_TEXT || 'muse-spark-1.3';
const samModel = process.env.MODEL_SEGMENT || 'sam-3.1';

if (!key) {
  console.error('✗ MODEL_API_KEY is missing. Copy .env.example to .env and paste your key (on your machine only).');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' };
let failures = 0;

function explain(status, body) {
  if (status === 401) return 'Invalid or mis-copied key (401 invalid_api_key).';
  if (status === 402 || status === 403) return 'Access or billing denied: check your card/credits at dev.meta.ai (Billing) and, if it persists, ask in #questions on Discord (possible regional restriction).';
  if (status === 404) return 'Model or route not found (404). Check the model name in .env.';
  if (status === 429) return 'Rate limited (429). Wait a few seconds.';
  return `Error ${status}: ${String(body).slice(0, 300)}`;
}

async function step(name, fn) {
  process.stdout.write(`• ${name} … `);
  try {
    const out = await fn();
    console.log(`✓ ${out ?? ''}`);
  } catch (err) {
    failures++;
    console.log(`✗ ${err.message}`);
  }
}

async function http(path, init) {
  const res = await fetch(`${base}${path}`, { ...init, headers: { ...headers, ...(init?.headers || {}) } });
  if (!res.ok) throw new Error(explain(res.status, await res.text()));
  return res;
}

await step('List models available to your account', async () => {
  const res = await http('/models');
  const json = await res.json();
  const ids = (json.data || json.models || []).map((m) => m.id || m.name).filter(Boolean);
  const interesting = ids.filter((id) => /muse|sam/i.test(id));
  return `${ids.length} models. Relevant: ${interesting.join(', ') || '(none detected)'}`;
});

await step(`Text call to ${textModel}`, async () => {
  const res = await http('/responses', {
    method: 'POST',
    body: JSON.stringify({
      model: textModel,
      input: 'Reply with only the word OK.',
      max_output_tokens: 2000, // reasoning uses part of the budget
    }),
  });
  const json = await res.json();
  const text = (json.output || [])
    .filter((o) => o.type === 'message')
    .flatMap((o) => o.content || [])
    .filter((c) => c.type === 'output_text')
    .map((c) => c.text)
    .join('')
    .trim();
  if (!text) throw new Error('Empty response. Raise max_output_tokens or check the model.');
  const u = json.usage || {};
  return `"${text.slice(0, 40)}" (tokens: ${u.input_tokens ?? '?'} in / ${u.output_tokens ?? '?'} out)`;
});

// Optional SAM 3.1 test with a public image
const samIdx = process.argv.indexOf('--sam');
if (samIdx !== -1) {
  const imageUrl = process.argv[samIdx + 1];
  const prompt = process.argv[samIdx + 2] || 'wall';
  await step(`SAM 3.1: segment "${prompt}"`, async () => {
    if (!imageUrl) throw new Error('Pass a public image URL after --sam');
    const res = await http('/responses', {
      method: 'POST',
      headers: { Accept: 'text/event-stream' },
      body: JSON.stringify({
        model: samModel,
        stream: true,
        input: [
          {
            type: 'message',
            role: 'user',
            content: [
              { type: 'input_text', text: prompt },
              { type: 'input_image', image_url: imageUrl },
            ],
          },
        ],
      }),
    });
    const decoder = new TextDecoder();
    let buffer = '';
    let collected = '';
    for await (const chunk of res.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6).trim();
        if (data === '[DONE]') continue;
        try {
          const ev = JSON.parse(data);
          if (ev.type === 'response.output_text.delta' && ev.delta) collected += ev.delta;
        } catch {
          /* partial line */
        }
      }
    }
    if (!collected) throw new Error('SAM returned no data (is the image publicly accessible?).');
    return `${collected.length} output characters (boxes/masks in special text)`;
  });
}

console.log(failures === 0 ? '\nAll good: your Meta account is linked to this project.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);
