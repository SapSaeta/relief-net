#!/usr/bin/env node
// Measurement against the manual baseline (Nov 2). Runs coordinator triage N times per provider on the
// synthetic Riverside scenario without saving it (save: false), scores every run with the checks in
// lib/triage-score.ts, and does the same for each manual triage recorded at /baseline. Writes
// docs/evidence/baseline-comparison.md.
//
// Two scores per model run:
//   - model alone: the model's own order and every duplicate group it proposed;
//   - with code rules: the queue after lib/triage-rules.ts (safety tiers, verified merges), duplicates
//     as shown to the coordinator (merged or to confirm).
//
// Usage: npm run dev (local .data/ with the seeded scenario), then
//   node scripts/eval-triage.mjs [runs per provider = 3] [http://localhost:3000]
// Set DEMO_ACCESS_CODE if the server requires one. ≈ $0.025 per run.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';

import { FsStore } from '../lib/store/fs.ts';
import { kendallTau, scoreTriage, topOverlap } from '../lib/triage-score.ts';

const runs = Number(process.argv[2] ?? 3);
const base = process.argv[3] ?? 'http://localhost:3000';
const providers = ['meta', 'baseten'];
const headers = { 'Content-Type': 'application/json', 'x-access-code': process.env.DEMO_ACCESS_CODE ?? '' };
const scenario = JSON.parse(readFileSync('fixtures/riverside-flood.json', 'utf8'));
const store = new FsStore('.data');

// Case id → scenario key: the video case is the walkthrough; messages match by their exact words.
const cases = await store.listDocs('cases');
const keyOf = new Map();
for (const c of cases) {
  if (c.source !== 'message') keyOf.set(c.id, scenario.video.key);
  else {
    const m = scenario.messages.find((x) => x.message === c.transcript.text);
    if (m) keyOf.set(c.id, m.key);
  }
}
const key = (caseId) => keyOf.get(caseId) ?? `unknown:${caseId.slice(0, 8)}`;

function modelAnswers(run) {
  const caseOf = new Map(run.inputs.map((i) => [i.ref, i.caseId]));
  const ranked = [...new Set(run.proposal.queue.map((q) => q.ref))].filter((r) => caseOf.has(r));
  const modelOrder = [...ranked, ...run.inputs.map((i) => i.ref).filter((r) => !ranked.includes(r))].map((r) => key(caseOf.get(r)));
  const proposed = run.proposal.duplicates.map((d) => d.refs.filter((r) => caseOf.has(r)).map((r) => key(caseOf.get(r))));
  const finalOrder = run.queue.flatMap((q) => [q.caseId, ...q.duplicateIds]).map(key);
  const surfaced = run.duplicates.map((d) => d.caseIds.map(key));
  return {
    alone: { order: modelOrder, duplicates: proposed },
    rules: { order: finalOrder, duplicates: surfaced },
    autoMerged: run.duplicates.filter((d) => d.mergedBy === 'rule').length,
  };
}

const rows = [];
for (const provider of providers) {
  for (let i = 0; i < runs; i++) {
    const res = await fetch(`${base}/api/triage`, { method: 'POST', headers, body: JSON.stringify({ provider, save: false }) });
    const run = await res.json();
    if (!res.ok) {
      console.log(`✗ ${provider} #${i + 1}: ${run.error ?? res.status}`);
      rows.push({ who: provider, ok: false, error: run.error ?? String(res.status) });
      continue;
    }
    const a = modelAnswers(run);
    const alone = scoreTriage(a.alone, scenario.expected);
    const rules = scoreTriage(a.rules, scenario.expected);
    rows.push({ who: run.provider, model: run.model, ok: true, alone, rules, order: a.alone.order, ms: run.latencyMs, cost: run.costUsd, autoMerged: a.autoMerged });
    console.log(`${run.provider} #${i + 1}: model ${alone.passed}/${alone.total} · with rules ${rules.passed}/${rules.total} · ${(run.latencyMs / 1000).toFixed(1)} s · $${run.costUsd.toFixed(3)}`);
  }
}

const manual = (await store.listDocs('baselines')).sort((a, b) => a.at.localeCompare(b.at));
const people = manual.map((m) => {
  const answer = { order: m.order.map(key), duplicates: m.duplicates.map((g) => g.map(key)) };
  const score = scoreTriage(answer, scenario.expected);
  console.log(`manual (${m.triager}): ${score.passed}/${score.total} · ${(m.durationMs / 60000).toFixed(1)} min`);
  return { ...m, answer, score };
});

const sec = (ms) => `${(ms / 1000).toFixed(1)} s`;
const min = (ms) => `${(ms / 60000).toFixed(1)} min`;
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const summary = providers.map((p) => {
  const done = rows.filter((r) => r.ok && r.who === p);
  return {
    p,
    model: done[0]?.model ?? '–',
    n: done.length,
    alone: median(done.map((r) => r.alone.passed)),
    rules: median(done.map((r) => r.rules.passed)),
    total: done[0]?.alone.total ?? 0,
    dups: median(done.map((r) => r.alone.duplicatesFound)),
    falseMerges: median(done.map((r) => r.alone.falseMerges)),
    ms: median(done.map((r) => r.ms)),
    cost: median(done.map((r) => r.cost)),
    tau: people.length ? median(done.map((r) => kendallTau(r.order, people.at(-1).answer.order))) : null,
    top5: people.length ? median(done.map((r) => topOverlap(r.order, people.at(-1).answer.order, 5))) : null,
  };
});

const fmt = (x, d = 2) => (x === null ? '–' : Number(x).toFixed(d));
const cell = (s) => String(s).replaceAll('|', '\\|');
const lastPerson = people.at(-1);
const report = `# Triage vs the manual baseline

Run with \`node scripts/eval-triage.mjs ${runs}\` on ${new Date().toISOString()} against the synthetic Riverside scenario (${cases.length} requests: 1 video walkthrough + ${cases.length - 1} typed messages, \`fixtures/riverside-flood.json\`).

Each triage is scored with the same ${summary[0]?.total || 7} checks (\`lib/triage-score.ts\`): both real duplicates grouped, both look-alike traps kept apart, the 112 case first, and the prompt-injection and "no rush" requests in the bottom half.

## Summary (median over runs)

| Who | Checks passed | Duplicates found (of 2) | False merges | Time | Cost | Agreement with the manual order (Kendall τ · top-5 shared) |
|---|---:|---:|---:|---:|---:|---|
${summary.map((s) => `| ${s.p} · \`${s.model}\` (${s.n} runs), model alone | ${fmt(s.alone, 0)}/${s.total} | ${fmt(s.dups, 0)} | ${fmt(s.falseMerges, 0)} | ${s.ms === null ? '–' : sec(s.ms)} | $${fmt(s.cost, 3)} | ${s.tau === null ? '–' : `${fmt(s.tau)} · ${fmt(s.top5, 0)}/5`} |\n| ${s.p}, with code rules | ${fmt(s.rules, 0)}/${s.total} | | | | | |`).join('\n')}
${people.map((m) => `| manual · ${cell(m.triager)} | ${m.score.passed}/${m.score.total} | ${m.score.duplicatesFound} | ${m.score.falseMerges} | ${min(m.durationMs)} | – | reference |`).join('\n')}

${lastPerson ? `Time to a ranked, deduplicated queue: **${min(lastPerson.durationMs)} by hand** vs **${summary.map((s) => `${s.ms === null ? '–' : sec(s.ms)} (${s.p})`).join(', ')}** by the model, which the coordinator then reviews.` : 'No manual triage recorded yet: do one at /baseline, then run this script again.'}

## Model runs

| # | Provider | Model alone | With code rules | Failed checks (model alone) | Latency | Cost |
|---:|---|---:|---:|---|---:|---:|
${rows.map((r, i) => (r.ok ? `| ${i + 1} | ${r.who} | ${r.alone.passed}/${r.alone.total} | ${r.rules.passed}/${r.rules.total} | ${cell(r.alone.checks.filter((c) => !c.pass).map((c) => `${c.name} (${c.detail})`).join('; ') || 'none')} | ${sec(r.ms)} | $${r.cost.toFixed(3)} |` : `| ${i + 1} | ${r.who} | ⚠️ ${cell(r.error)} | | | | |`)).join('\n')}
${people.length ? `
## Manual triage

${people.map((m) => `- **${cell(m.triager)}**, ${m.at.slice(0, 16).replace('T', ' ')} UTC: ${min(m.durationMs)}, ${m.score.passed}/${m.score.total} checks. Failed: ${m.score.checks.filter((c) => !c.pass).map((c) => `${c.name} (${c.detail})`).join('; ') || 'none'}.\n  Order: ${m.answer.order.join(' → ')}`).join('\n')}
` : ''}`;
mkdirSync('docs/evidence', { recursive: true });
writeFileSync('docs/evidence/baseline-comparison.md', report);
console.log('→ docs/evidence/baseline-comparison.md');
