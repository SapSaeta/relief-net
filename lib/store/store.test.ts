import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, describe, test } from "node:test";

import { FsStore } from "./fs.ts";
import { RedisStore, type RedisLike } from "./redis.ts";
import type { Store } from "./types.ts";

/** In-memory stand-in for the Redis commands RedisStore uses. */
function fakeRedis(): RedisLike {
  const strings = new Map<string, string>();
  const sets = new Map<string, Set<string>>();
  const lists = new Map<string, string[]>();
  return {
    get: async (k) => strings.get(k) ?? null,
    set: async (k, v) => strings.set(k, v),
    sadd: async (k, m) => sets.set(k, (sets.get(k) ?? new Set()).add(m)),
    smembers: async (k) => [...(sets.get(k) ?? [])],
    mget: async (...ks) => ks.map((k) => strings.get(k) ?? null),
    rpush: async (k, ...vs) => lists.set(k, [...(lists.get(k) ?? []), ...vs]),
    lrange: async (k) => lists.get(k) ?? [],
    incrby: async (k, n) => {
      const value = Number(strings.get(k) ?? 0) + n;
      strings.set(k, String(value));
      return value;
    },
  };
}

const dirs: string[] = [];
after(() => Promise.all(dirs.map((d) => rm(d, { recursive: true, force: true }))));

const implementations: [string, () => Promise<Store>][] = [
  [
    "FsStore",
    async () => {
      const dir = await mkdtemp(join(tmpdir(), "relief-net-store-"));
      dirs.push(dir);
      return new FsStore(dir);
    },
  ],
  ["RedisStore", async () => new RedisStore(fakeRedis())],
];

for (const [name, make] of implementations) {
  describe(name, () => {
    test("stores, reads, overwrites and lists documents", async () => {
      const s = await make();
      assert.equal(await s.getDoc("cases", "a"), null);
      await s.putDoc("cases", "a", { n: 1 });
      await s.putDoc("cases", "b", { n: 2 });
      await s.putDoc("cases", "a", { n: 3 });
      assert.deepEqual(await s.getDoc("cases", "a"), { n: 3 });
      assert.deepEqual((await s.listDocs<{ n: number }>("cases")).map((d) => d.n).sort(), [2, 3]);
      assert.deepEqual(await s.listDocs("empty"), []);
    });

    test("appends to and reads a log in order", async () => {
      const s = await make();
      assert.deepEqual(await s.readLog("usage"), []);
      await s.append("usage", [{ i: 1 }, { i: 2 }]);
      await s.append("usage", []);
      await s.append("usage", [{ i: 3 }]);
      assert.deepEqual(await s.readLog("usage"), [{ i: 1 }, { i: 2 }, { i: 3 }]);
    });

    test("increments counters atomically, including concurrent and negative amounts", async () => {
      const s = await make();
      assert.equal(await s.getCounter("spend"), 0);
      await Promise.all(Array.from({ length: 20 }, () => s.incrBy("spend", 5)));
      assert.equal(await s.incrBy("spend", -30), 70);
      assert.equal(await s.getCounter("spend"), 70);
      await assert.rejects(async () => s.incrBy("spend", 0.5), /integers/);
    });

    test("rejects names that could escape a collection", async () => {
      const s = await make();
      await assert.rejects(async () => s.putDoc("cases", "../secrets", {}), /Invalid store name/);
      await assert.rejects(async () => s.getDoc("../x", "a"), /Invalid store name/);
    });
  });
}
