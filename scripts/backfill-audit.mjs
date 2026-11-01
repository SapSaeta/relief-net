#!/usr/bin/env node
// One-off (Nov 1): the audit log started on Nov 1, after the synthetic scenario had been taken in,
// triaged, merged and matched. This rebuilds those earlier actions from the stored records, with their
// original times, marked backfilled: true. It only writes to an empty log, so it never reorders or
// edits real entries; run it once, before the first real action.
//
// Usage:
//   node scripts/backfill-audit.mjs                     # local .data/ (dry run)
//   node --env-file=<KV file> scripts/backfill-audit.mjs --redis   # production (dry run)
// Add --write to append.

import { Redis } from '@upstash/redis';

import { FsStore } from '../lib/store/fs.ts';
import { RedisStore } from '../lib/store/redis.ts';

const write = process.argv.includes('--write');
const useRedis = process.argv.includes('--redis');
const store = useRedis
  ? new RedisStore(new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, automaticDeserialization: false, enableAutoPipelining: false }))
  : new FsStore('.data');

const TIERS = ['call 112', 'critical', 'high', 'medium', 'low'];
const entries = [];
const add = (at, e) => entries.push({ at, ...e, backfilled: true });

for (const c of await store.listDocs('cases')) {
  const r = c.request;
  add(c.createdAt, {
    actor: 'public',
    action: 'intake.received',
    summary: `${c.source === 'message' ? 'Typed message' : 'Video walkthrough'} from ${c.location ?? 'unknown location'}: ${
      r ? `drafted as ${r.priority}, ${r.verification.verified}/${r.verification.total} evidence verified` : 'drafting failed'
    }`,
    caseIds: [c.id],
  });
}
const triage = await store.getDoc('triage', 'latest');
if (triage) {
  add(triage.at, {
    actor: 'model',
    action: 'triage.run',
    summary: `Ranked ${triage.queue.length} requests and proposed ${triage.duplicates.length} duplicate groups in ${(triage.latencyMs / 1000).toFixed(1)} s`,
    runId: triage.id,
    model: `${triage.provider} · ${triage.model}`,
  });
  for (const q of triage.queue.filter((x) => x.raisedByRule)) {
    add(triage.at, { actor: 'rule', action: 'queue.raised', summary: `Raised to #${q.rank} by safety tier (${TIERS[q.tier]}); the model ranked it #${q.modelRank}`, caseIds: [q.caseId], runId: triage.id });
  }
}
for (const d of (await store.getDoc('triage', 'decisions'))?.decisions ?? []) {
  const group = triage?.duplicates.find((g) => g.key === d.key);
  add(d.at, {
    actor: 'coordinator',
    action: d.action === 'confirm' ? 'merge.confirm' : 'merge.undo',
    summary: d.action === 'confirm' ? `Confirmed duplicate: ${group?.reason ?? d.key}` : 'Undid a merge: both requests are back in the queue',
    caseIds: d.key.split('+'),
    runId: triage?.id,
  });
}
const matching = await store.getDoc('matching', 'latest');
if (matching) {
  const rejected = matching.steps.filter((s) => !s.ok).length;
  add(matching.at, {
    actor: 'model',
    action: 'matching.run',
    summary: `Proposed ${matching.assignments.length} assignments and flagged ${matching.flags.length} requests in ${matching.rounds} rounds`,
    runId: matching.id,
    model: `${matching.provider} · ${matching.model}`,
  });
  if (rejected) add(matching.at, { actor: 'rule', action: 'matching.rejected', summary: `Code rejected ${rejected} tool calls; the model had to fix or flag them`, runId: matching.id });
}

entries.sort((a, b) => a.at.localeCompare(b.at));
const existing = await store.readLog('audit');
console.log(`${entries.length} entries rebuilt (${entries[0]?.at ?? '–'} … ${entries.at(-1)?.at ?? '–'}) · ${existing.length} already in the log`);
if (existing.length) {
  console.error('✗ The audit log is not empty: backfill only runs once, before any real entry.');
  process.exit(1);
}
if (!write) {
  console.log('Dry run. Add --write to append.');
  process.exit(0);
}
await store.append('audit', entries);
console.log(`✓ appended ${entries.length} backfilled entries (${useRedis ? 'Redis' : '.data'})`);
