#!/usr/bin/env node
// One-off migration (Nov 1): moves key-frame images out of each case document into the
// case-frames collection, the layout lib/cases.ts writes now. Case listings were reading every
// image (about 2 MB per video case), and past 10 MB Upstash rejects the request.
// Idempotent: cases already split are skipped. The image document is written before the case.
//
// Usage:
//   node scripts/split-frame-images.mjs                                              # local .data/
//   node --env-file=<file with KV_REST_API_URL/TOKEN> scripts/split-frame-images.mjs --redis   # production
// Add --write to change anything; without it, it only reports.

import { Redis } from '@upstash/redis';

import { FsStore } from '../lib/store/fs.ts';
import { RedisStore } from '../lib/store/redis.ts';

const write = process.argv.includes('--write');
const useRedis = process.argv.includes('--redis');
let store;
if (useRedis) {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) {
    console.error('✗ No Redis credentials (KV_REST_API_URL / KV_REST_API_TOKEN).');
    process.exit(1);
  }
  // No auto-pipelining: each case is read in its own request, so none goes over the size cap.
  store = new RedisStore(new Redis({ url, token, automaticDeserialization: false, enableAutoPipelining: false }));
} else {
  store = new FsStore('.data');
}

const ids = useRedis
  ? await new Redis({ url: process.env.KV_REST_API_URL, token: process.env.KV_REST_API_TOKEN, enableAutoPipelining: false }).smembers('relief-net:docs:cases')
  : (await store.listDocs('cases')).map((c) => c.id);

let moved = 0;
for (const id of ids) {
  const intake = await store.getDoc('cases', id);
  if (!intake || intake.framesStoredApart || !intake.frames?.some((f) => f.image)) continue;
  const bytes = JSON.stringify(intake).length;
  console.log(`${write ? 'split' : 'would split'} ${id.slice(0, 8)} · ${intake.frames.length} frames · ${(bytes / 1e6).toFixed(2)} MB`);
  if (write) {
    await store.putDoc('case-frames', id, { images: intake.frames.map((f) => f.image) });
    await store.putDoc('cases', id, { ...intake, frames: intake.frames.map((f) => ({ ...f, image: '' })), framesStoredApart: true });
  }
  moved++;
}
console.log(`${ids.length} cases · ${moved} ${write ? 'split' : 'to split'} (${useRedis ? 'Redis' : '.data'})${write ? '' : '. Add --write to apply.'}`);
