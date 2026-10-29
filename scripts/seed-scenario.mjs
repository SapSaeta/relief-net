#!/usr/bin/env node
// Seeds the synthetic Riverside flood scenario (fixtures/riverside-flood.json) into a running
// dev server: each message goes through POST /api/intake/message, so it is drafted and verified
// like any real request (≈ $0.02 each on the Meta API).
// Usage: npm run dev, then  node scripts/seed-scenario.mjs [http://localhost:3000]
// Set DEMO_ACCESS_CODE in the environment if the server requires one.

import { readFileSync } from 'node:fs';

const base = process.argv[2] ?? 'http://localhost:3000';
const { messages } = JSON.parse(readFileSync('fixtures/riverside-flood.json', 'utf8'));
const headers = { 'Content-Type': 'application/json', 'x-access-code': process.env.DEMO_ACCESS_CODE ?? '' };

const CONCURRENCY = 4;
let next = 0;
let total = 0;
const results = [];

async function worker() {
  while (next < messages.length) {
    const m = messages[next++];
    const started = Date.now();
    const res = await fetch(`${base}/api/intake/message`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ message: m.message, location: m.location, receivedAt: m.receivedAt }),
    });
    const json = await res.json();
    if (!res.ok || !json.request) {
      console.log(`✗ ${m.key}: ${json.error ?? json.requestError ?? res.status}`);
      continue;
    }
    total += json.costUsd;
    const { verified, total: cited } = json.request.verification;
    const flags = json.request.safety_flags.map((f) => f.flag).join(',');
    console.log(
      `✓ ${m.key.padEnd(20)} ${json.request.priority.padEnd(8)} ${verified}/${cited} verified ${((Date.now() - started) / 1000).toFixed(1)} s${flags ? ` · ${flags}` : ''}`,
    );
    results.push({ key: m.key, caseId: json.id });
  }
}

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
console.log(`${results.length}/${messages.length} seeded · $${total.toFixed(3)}`);
