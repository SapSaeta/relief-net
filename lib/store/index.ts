import "server-only";

import { join } from "node:path";

import { Redis } from "@upstash/redis";

import { FsStore } from "./fs.ts";
import { RedisStore, type RedisLike } from "./redis.ts";
import type { Store } from "./types.ts";

export type { Store } from "./types.ts";

// Picks the store from the environment: Redis when Upstash credentials are present (the Vercel
// Marketplace integration sets KV_REST_API_*; a direct Upstash database sets UPSTASH_REDIS_REST_*),
// otherwise the filesystem under .data/. STORE=fs forces the filesystem.

let instance: Store | undefined;

function redisCredentials(): { url: string; token: string } | null {
  const url = process.env.KV_REST_API_URL ?? process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.KV_REST_API_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? { url, token } : null;
}

export function store(): Store {
  if (instance) return instance;
  const redis = process.env.STORE === "fs" ? null : redisCredentials();
  if (redis) {
    const client = new Redis({ ...redis, automaticDeserialization: false });
    instance = new RedisStore(client as unknown as RedisLike);
  } else {
    if (process.env.VERCEL) console.warn("store: no Redis credentials on Vercel; the filesystem there is not persistent");
    instance = new FsStore(join(process.cwd(), ".data"));
  }
  return instance;
}
