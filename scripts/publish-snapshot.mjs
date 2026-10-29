#!/usr/bin/env node
// Publishes the local synthetic scenario (.data/: cases, latest triage, merge decisions, usage log and
// spend counter) to the production Redis store, so judges see a pre-seeded, read-only dashboard.
// Uses the same store implementations as the app (lib/store), so keys always match.
//
// Usage (credentials from `vercel env pull .env.production.local`, never printed):
//   node --env-file=.env.production.local scripts/publish-snapshot.mjs            # dry run: shows what would be copied
//   node --env-file=.env.production.local scripts/publish-snapshot.mjs --write    # copies into an empty store
//   node --env-file=.env.production.local scripts/publish-snapshot.mjs --write --replace   # also when it is not empty

import { Redis } from '@upstash/redis';

import { FsStore } from '../lib/store/fs.ts';
import { RedisStore } from '../lib/store/redis.ts';

const write = process.argv.includes('--write');
const replace = process.argv.includes('--replace');
const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
if (!url || !token) {
  console.error('✗ No Redis credentials (KV_REST_API_URL / KV_REST_API_TOKEN). Run `vercel env pull .env.production.local` first.');
  process.exit(1);
}

const local = new FsStore('.data');
const remote = new RedisStore(new Redis({ url, token, automaticDeserialization: false }));
const SPENT = 'spend-spent-micro-usd';

const cases = await local.listDocs('cases');
const triage = await local.getDoc('triage', 'latest');
const decisions = await local.getDoc('triage', 'decisions');
const usage = await local.readLog('usage');
const spent = await local.getCounter(SPENT);

console.log(`local:  ${cases.length} cases · triage ${triage ? 'yes' : 'no'} · ${decisions?.decisions?.length ?? 0} merge decisions · ${usage.length} usage entries · $${(spent / 1e6).toFixed(3)} spent`);
const existing = await remote.listDocs('cases');
console.log(`remote: ${existing.length} cases`);

if (!write) {
  console.log('Dry run. Add --write to copy.');
  process.exit(0);
}
if (existing.length && !replace) {
  console.error('✗ The production store already has cases. Add --replace to overwrite documents with the same ids.');
  process.exit(1);
}

for (const c of cases) await remote.putDoc('cases', c.id, c);
if (triage) await remote.putDoc('triage', 'latest', triage);
if (decisions) await remote.putDoc('triage', 'decisions', decisions);
if (!(await remote.readLog('usage')).length) {
  await remote.append('usage', usage);
  await remote.incrBy(SPENT, spent - (await remote.getCounter(SPENT)));
} else {
  console.log('Usage log already present in production: left as is.');
}
console.log(`✓ published ${cases.length} cases${triage ? ', triage' : ''}${decisions ? ', merge decisions' : ''}`);
