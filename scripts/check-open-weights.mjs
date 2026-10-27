#!/usr/bin/env node
// Checks Muse Spark Open on Baseten for what the coordinator side needs: Responses API,
// tool calling and strict JSON schema. Writes the results to docs/evidence/open-weights-check.md
// so the claim in the README is reproducible. Synthetic inputs only. Never prints the key.
// Usage: node scripts/check-open-weights.mjs

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import OpenAI from 'openai';

function loadDotEnv(path = '.env') {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    if (process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
}

loadDotEnv();

const baseURL = process.env.OPEN_WEIGHTS_BASE_URL || 'https://inference.baseten.co/v1';
const model = process.env.OPEN_WEIGHTS_MODEL || 'meta-models/muse-spark-open-1026';
if (!process.env.OPEN_WEIGHTS_API_KEY) {
  console.error('✗ OPEN_WEIGHTS_API_KEY is missing in .env.');
  process.exit(1);
}
const client = new OpenAI({ apiKey: process.env.OPEN_WEIGHTS_API_KEY, baseURL });

const checks = [
  {
    name: 'Responses API',
    run: () => client.responses.create({ model, input: 'Reply with only the word OK.', max_output_tokens: 1000 }),
    pass: (r) => /ok/i.test(r.output_text),
    show: (r) => r.output_text.trim(),
  },
  {
    name: 'Tool calling',
    run: () =>
      client.responses.create({
        model,
        max_output_tokens: 2000,
        input: 'A household in Riverside needs 3 volunteers for mud removal tomorrow. Find available volunteers.',
        tools: [
          {
            type: 'function',
            name: 'find_volunteers',
            description: 'Find available volunteers by skill, area and date.',
            strict: true,
            parameters: {
              type: 'object',
              properties: {
                skill: { type: 'string', enum: ['mud_removal', 'drying', 'debris_removal', 'transport'] },
                area: { type: 'string' },
                count: { type: 'integer' },
              },
              required: ['skill', 'area', 'count'],
              additionalProperties: false,
            },
          },
        ],
      }),
    pass: (r) => r.output.some((o) => o.type === 'function_call' && o.name === 'find_volunteers'),
    show: (r) => {
      const call = r.output.find((o) => o.type === 'function_call');
      return call ? `${call.name}(${call.arguments})` : 'no function call';
    },
  },
  {
    name: 'Strict JSON schema',
    run: () =>
      client.responses.create({
        model,
        max_output_tokens: 2000,
        input: 'Two requests: "Mud in the kitchen, 2 adults" and "Kitchen full of mud, two adults living here". Same household?',
        text: {
          format: {
            type: 'json_schema',
            name: 'dedupe',
            strict: true,
            schema: {
              type: 'object',
              properties: { duplicate: { type: 'boolean' }, reason: { type: 'string' } },
              required: ['duplicate', 'reason'],
              additionalProperties: false,
            },
          },
        },
      }),
    pass: (r) => typeof JSON.parse(r.output_text).duplicate === 'boolean',
    show: (r) => r.output_text.trim(),
  },
];

const rows = [];
for (const check of checks) {
  const started = Date.now();
  try {
    const response = await check.run();
    const ok = check.pass(response);
    rows.push({ name: check.name, ok, ms: Date.now() - started, out: check.show(response), usage: response.usage });
  } catch (error) {
    rows.push({ name: check.name, ok: false, ms: Date.now() - started, out: `${error.status ?? ''} ${error.message}`.trim() });
  }
  const r = rows.at(-1);
  console.log(`${r.ok ? '✓' : '✗'} ${r.name} (${r.ms} ms): ${r.out}`);
}

const cell = (s) => String(s).replaceAll('|', '\\|').replaceAll('\n', ' ');
const report = `# Open weights check

Muse Spark Open on Baseten (\`${model}\`), run with \`node scripts/check-open-weights.mjs\` on ${new Date().toISOString()}.

| Check | Result | Latency | Tokens in / out | Output |
|---|---|---:|---:|---|
${rows.map((r) => `| ${r.name} | ${r.ok ? '✅' : '❌'} | ${r.ms} ms | ${r.usage ? `${r.usage.input_tokens} / ${r.usage.output_tokens}` : '–'} | \`${cell(r.out)}\` |`).join('\n')}
`;
mkdirSync('docs/evidence', { recursive: true });
writeFileSync('docs/evidence/open-weights-check.md', report);
console.log('→ docs/evidence/open-weights-check.md');
process.exit(rows.every((r) => r.ok) ? 0 : 1);
