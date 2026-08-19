import { createClient } from 'redis';

type NativeRedisClient = ReturnType<typeof createClient>;

type RedisGlobal = typeof globalThis & {
  __sahamlensNativeRedis?: NativeRedisClient;
  __sahamlensNativeRedisUrl?: string;
  __sahamlensNativeRedisConnect?: Promise<NativeRedisClient>;
  __sahamlensNativeRedisLastErrorAt?: number;
};

type SetOptions = {
  ex?: number;
  px?: number;
  nx?: boolean;
};

type ScanOptions = {
  match?: string;
  count?: number;
};

const g = globalThis as RedisGlobal;

function encode(value: unknown): string {
  const encoded = JSON.stringify(value);
  return encoded === undefined ? 'null' : encoded;
}

function decode<T>(value: string | null): T | null {
  if (value === null) return null;

  try {
    return JSON.parse(value) as T;
  } catch {
    return value as T;
  }
}

async function nativeClient(url: string): Promise<NativeRedisClient> {
  if (!g.__sahamlensNativeRedis || g.__sahamlensNativeRedisUrl !== url) {
    const client = createClient({
      url,
      socket: {
        connectTimeout: 2_000,
        reconnectStrategy: (retries) =>
          Math.min(100 * 2 ** Math.min(retries, 5), 3_000),
      },
    });

    client.on('error', (error: unknown) => {
      const now = Date.now();

      if (
        !g.__sahamlensNativeRedisLastErrorAt ||
        now - g.__sahamlensNativeRedisLastErrorAt > 30_000
      ) {
        const message =
          error instanceof Error ? error.message : String(error);

        console.warn(`[redis-local] ${message}`);
        g.__sahamlensNativeRedisLastErrorAt = now;
      }
    });

    g.__sahamlensNativeRedis = client as unknown as NativeRedisClient;
    g.__sahamlensNativeRedisUrl = url;
    g.__sahamlensNativeRedisConnect = undefined;
  }

  const client = g.__sahamlensNativeRedis;

  if (!client) {
    throw new Error("Redis client gagal dibuat");
  }

  if (g.__sahamlensNativeRedisConnect) {
    return g.__sahamlensNativeRedisConnect;
  }

  if (!client.isOpen) {
    g.__sahamlensNativeRedisConnect = client
      .connect()
      .then(() => client)
      .finally(() => {
        g.__sahamlensNativeRedisConnect = undefined;
      });

    return g.__sahamlensNativeRedisConnect;
  }

  return client;
}

/**
 * Compatibility layer untuk menggantikan @upstash/redis.
 * API sengaja menggunakan nama method lowercase agar modul lama
 * hanya membutuhkan perubahan import dan konfigurasi URL.
 */
export class Redis {
  private readonly url: string;

  constructor(config: { url?: string; token?: string } = {}) {
    const url = config.url ?? process.env.REDIS_URL;

    if (!url) {
      throw new Error('REDIS_URL belum dikonfigurasi');
    }

    this.url = url;
  }

  private client(): Promise<NativeRedisClient> {
    return nativeClient(this.url);
  }

  async ping(): Promise<string> {
    return (await this.client()).ping();
  }

  async get<T = unknown>(key: string): Promise<T | null> {
    return decode<T>(await (await this.client()).get(key));
  }

  async set(
    key: string,
    value: unknown,
    options: SetOptions = {},
  ): Promise<string | null> {
    const redisOptions: { EX?: number; PX?: number; NX?: boolean } = {};

    if (options.ex !== undefined) {
      redisOptions.EX = Math.max(1, Math.floor(options.ex));
    }

    if (options.px !== undefined) {
      redisOptions.PX = Math.max(1, Math.floor(options.px));
    }

    if (options.nx) {
      redisOptions.NX = true;
    }

    return (await this.client()).set(key, encode(value), redisOptions);
  }

  async del(...items: Array<string | string[]>): Promise<number> {
    const keys = items.flat();
    if (keys.length === 0) return 0;
    return (await this.client()).del(keys);
  }

  /**
   * Hapus lock hanya kalau nilainya masih milik caller. Ini harus atomik: pola
   * GET lalu DEL terpisah bisa menghapus lock request baru bila lock lama kedaluwarsa
   * tepat di antara dua command.
   */
  async compareAndDelete(key: string, expectedValue: unknown): Promise<boolean> {
    const script = `
      if redis.call('GET', KEYS[1]) == ARGV[1] then
        return redis.call('DEL', KEYS[1])
      end
      return 0
    `;
    const result = await (await this.client()).eval(script, {
      keys: [key],
      arguments: [encode(expectedValue)],
    });
    return Number(result) === 1;
  }

  async incr(key: string): Promise<number> {
    return (await this.client()).incr(key);
  }

  async incrby(key: string, amount: number): Promise<number> {
    return (await this.client()).incrBy(key, amount);
  }

  async expire(key: string, seconds: number): Promise<number> {
    const result = await (await this.client()).expire(
      key,
      Math.max(1, Math.floor(seconds)),
    );

    return result ? 1 : 0;
  }

  async ttl(key: string): Promise<number> {
    return (await this.client()).ttl(key);
  }

  async mget<T = unknown[]>(
    ...items: Array<string | string[]>
  ): Promise<T> {
    const keys = items.flat();
    const values = await (await this.client()).mGet(keys);

    return values.map((value) => decode(value)) as unknown as T;
  }

  async sadd(key: string, ...members: Array<string | string[]>): Promise<number> {
    return (await this.client()).sAdd(key, members.flat());
  }

  async smembers(key: string): Promise<string[]> {
    return (await this.client()).sMembers(key);
  }

  async scan(
    cursor: number | string,
    options: ScanOptions = {},
  ): Promise<[number, string[]]> {
    const command = ['SCAN', String(cursor)];

    if (options.match) {
      command.push('MATCH', options.match);
    }

    if (options.count !== undefined) {
      command.push('COUNT', String(options.count));
    }

    const reply = (await (
      await this.client()
    ).sendCommand(command)) as unknown as [string, string[]];

    return [Number(reply[0]), reply[1]];
  }
}
