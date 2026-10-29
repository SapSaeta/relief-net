// Persistence interface for everything relief-net keeps between requests: cases, triage runs and
// merge decisions (documents), the usage ledger (append-only log) and the spend counters.
// Two implementations: the filesystem for local development (.data/) and Redis in production.

export interface Store {
  readonly kind: "fs" | "redis";
  getDoc<T>(collection: string, id: string): Promise<T | null>;
  putDoc<T>(collection: string, id: string, value: T): Promise<void>;
  /** Every document in a collection, in no particular order. */
  listDocs<T>(collection: string): Promise<T[]>;
  append<T>(log: string, entries: T[]): Promise<void>;
  readLog<T>(log: string): Promise<T[]>;
  /** Atomically adds an integer (may be negative) and returns the new value. */
  incrBy(counter: string, amount: number): Promise<number>;
  getCounter(counter: string): Promise<number>;
}

const NAME = /^[a-z0-9][a-z0-9-]{0,63}$/i;

/** Collection, document, log and counter names become file names or keys: no paths, no separators. */
export function checkName(name: string): string {
  if (!NAME.test(name)) throw new Error(`Invalid store name: ${name}`);
  return name;
}
