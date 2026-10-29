import { checkName, type Store } from "./types.ts";

// Production store on Redis (Upstash REST, via the Vercel Marketplace). Values are JSON strings:
//   <prefix>doc:<collection>:<id>   string      <prefix>docs:<collection>   set of ids
//   <prefix>log:<name>              list        <prefix>counter:<name>      integer (INCRBY is atomic)

/** The commands this store uses; @upstash/redis satisfies it, and tests use an in-memory fake. */
export type RedisLike = {
  get(key: string): Promise<unknown>;
  set(key: string, value: string): Promise<unknown>;
  sadd(key: string, member: string): Promise<unknown>;
  smembers(key: string): Promise<string[]>;
  mget(...keys: string[]): Promise<unknown[]>;
  rpush(key: string, ...values: string[]): Promise<unknown>;
  lrange(key: string, start: number, stop: number): Promise<unknown[]>;
  incrby(key: string, amount: number): Promise<number>;
};

const parse = <T>(value: unknown): T | null => (value === null || value === undefined ? null : (JSON.parse(String(value)) as T));

export class RedisStore implements Store {
  readonly kind = "redis";
  private readonly redis: RedisLike;
  private readonly prefix: string;

  constructor(redis: RedisLike, prefix = "relief-net:") {
    this.redis = redis;
    this.prefix = prefix;
  }

  private doc = (collection: string, id: string) => `${this.prefix}doc:${checkName(collection)}:${checkName(id)}`;

  async getDoc<T>(collection: string, id: string): Promise<T | null> {
    return parse<T>(await this.redis.get(this.doc(collection, id)));
  }

  async putDoc<T>(collection: string, id: string, value: T): Promise<void> {
    await this.redis.set(this.doc(collection, id), JSON.stringify(value));
    await this.redis.sadd(`${this.prefix}docs:${checkName(collection)}`, id);
  }

  async listDocs<T>(collection: string): Promise<T[]> {
    const ids = await this.redis.smembers(`${this.prefix}docs:${checkName(collection)}`);
    if (!ids.length) return [];
    const values = await this.redis.mget(...ids.map((id) => this.doc(collection, id)));
    return values.map((v) => parse<T>(v)).filter((d): d is NonNullable<typeof d> => d !== null) as T[];
  }

  async append<T>(log: string, entries: T[]): Promise<void> {
    if (!entries.length) return;
    await this.redis.rpush(`${this.prefix}log:${checkName(log)}`, ...entries.map((e) => JSON.stringify(e)));
  }

  async readLog<T>(log: string): Promise<T[]> {
    const values = await this.redis.lrange(`${this.prefix}log:${checkName(log)}`, 0, -1);
    return values.map((v) => parse<T>(v)!);
  }

  async incrBy(counter: string, amount: number): Promise<number> {
    if (!Number.isInteger(amount)) throw new Error("Counters take integers");
    return this.redis.incrby(`${this.prefix}counter:${checkName(counter)}`, amount);
  }

  async getCounter(counter: string): Promise<number> {
    return Number((await this.redis.get(`${this.prefix}counter:${checkName(counter)}`)) ?? 0);
  }
}
