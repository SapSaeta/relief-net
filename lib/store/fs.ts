import { appendFile, mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import { checkName, type Store } from "./types.ts";

// Local development store: <dir>/<collection>/<id>.json, <dir>/<log>.jsonl and <dir>/counters.json.
// Counter updates are serialized inside this process, which is all `next dev` needs.

export class FsStore implements Store {
  readonly kind = "fs";
  private readonly dir: string;
  private counterQueue: Promise<unknown> = Promise.resolve();

  constructor(dir: string) {
    this.dir = dir;
  }

  async getDoc<T>(collection: string, id: string): Promise<T | null> {
    const file = join(this.dir, checkName(collection), `${checkName(id)}.json`);
    try {
      return JSON.parse(await readFile(file, "utf8")) as T;
    } catch {
      return null;
    }
  }

  async putDoc<T>(collection: string, id: string, value: T): Promise<void> {
    const dir = join(this.dir, checkName(collection));
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, `${checkName(id)}.json`), JSON.stringify(value));
  }

  async listDocs<T>(collection: string): Promise<T[]> {
    const dir = join(this.dir, checkName(collection));
    let names: string[];
    try {
      names = (await readdir(dir)).filter((n) => n.endsWith(".json"));
    } catch {
      return [];
    }
    const docs = await Promise.all(names.map((n) => this.getDoc<T>(collection, n.slice(0, -".json".length))));
    return docs.filter((d): d is Awaited<T> => d !== null) as T[];
  }

  async append<T>(log: string, entries: T[]): Promise<void> {
    if (!entries.length) return;
    await mkdir(this.dir, { recursive: true });
    await appendFile(join(this.dir, `${checkName(log)}.jsonl`), entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  }

  async readLog<T>(log: string): Promise<T[]> {
    const file = join(this.dir, `${checkName(log)}.jsonl`);
    try {
      const text = await readFile(file, "utf8");
      return text
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line) as T);
    } catch {
      return [];
    }
  }

  private async readCounters(): Promise<Record<string, number>> {
    try {
      return JSON.parse(await readFile(join(this.dir, "counters.json"), "utf8")) as Record<string, number>;
    } catch {
      return {};
    }
  }

  incrBy(counter: string, amount: number): Promise<number> {
    if (!Number.isInteger(amount)) throw new Error("Counters take integers");
    const next = this.counterQueue.then(async () => {
      const counters = await this.readCounters();
      counters[checkName(counter)] = (counters[counter] ?? 0) + amount;
      await mkdir(this.dir, { recursive: true });
      await writeFile(join(this.dir, "counters.json"), JSON.stringify(counters));
      return counters[counter];
    });
    this.counterQueue = next.catch(() => undefined);
    return next;
  }

  async getCounter(counter: string): Promise<number> {
    await this.counterQueue;
    return (await this.readCounters())[checkName(counter)] ?? 0;
  }
}
