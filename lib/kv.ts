import { storeInternals, storeKind } from "./store";

/**
 * Kleine Schlüssel-Wert-Schicht für sicherheitsrelevante Daten (Admin-Sitzungen, Zähler, 2FA).
 * Online: Upstash Redis (REST) mit atomaren Befehlen – funktioniert auch bei mehreren Vercel-Instanzen gleichzeitig.
 * Lokal (ohne Redis): gleiche Befehle im Arbeitsspeicher des Servers (nur für Entwicklung und Tests).
 * Nur auf dem Server verwenden.
 */
export interface KvBackend {
  get(key: string): Promise<string | null>;
  /** Setzen mit Ablauf in Sekunden; `nx` = nur wenn noch nicht vorhanden. Liefert false, wenn `nx` griff. */
  set(key: string, value: string, opts?: { ex?: number; nx?: boolean }): Promise<boolean>;
  del(...keys: string[]): Promise<number>;
  /** Atomar hochzählen; beim ersten Zählen läuft der Schlüssel nach `ttl` Sekunden ab. Liefert Stand und Restlaufzeit. */
  incrWindow(key: string, ttl: number): Promise<{ count: number; ttl: number }>;
  /** Atomar um 1 herunterzählen (nie unter 0), Restlaufzeit bleibt – z. B. erfolgreiche Anmeldung zurückgeben */
  decrFloor(key: string): Promise<number>;
  /** Atomar: Wert nur setzen, wenn er größer ist als der gespeicherte (für TOTP-Wiederverwendungsschutz) */
  setIfGreater(key: string, value: number): Promise<boolean>;
  sadd(key: string, ...members: string[]): Promise<number>;
  /** Liefert 1, wenn das Element vorhanden war und entfernt wurde – atomar, daher für Einmal-Codes geeignet */
  srem(key: string, ...members: string[]): Promise<number>;
  smembers(key: string): Promise<string[]>;
  scard(key: string): Promise<number>;
  mget(...keys: string[]): Promise<(string | null)[]>;
  /** Vorne anfügen und Liste auf `max` Einträge kürzen */
  lpushTrim(key: string, value: string, max: number): Promise<void>;
  lrange(key: string, start: number, stop: number): Promise<string[]>;
}

export class KvUnavailableError extends Error {
  constructor() {
    super("Kein Datenspeicher verbunden – die Anmeldung ist deshalb gesperrt.");
  }
}

/* ───────────── Upstash Redis (REST) ───────────── */

function redisBackend(url: string, token: string): KvBackend {
  async function call<T>(command: (string | number)[]): Promise<T> {
    const res = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(command),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    const body = (await res.json()) as { result?: T; error?: string };
    if (body.error) throw new Error("Redis-Fehler");
    return body.result as T;
  }
  return {
    get: (key) => call<string | null>(["GET", key]),
    async set(key, value, opts) {
      const cmd: (string | number)[] = ["SET", key, value];
      if (opts?.ex) cmd.push("EX", Math.max(1, Math.ceil(opts.ex)));
      if (opts?.nx) cmd.push("NX");
      return (await call<string | null>(cmd)) === "OK";
    },
    del: (...keys) => (keys.length ? call<number>(["DEL", ...keys]) : Promise.resolve(0)),
    async incrWindow(key, ttl) {
      // Ein Skript = ein atomarer Schritt: hochzählen und beim ersten Mal die Laufzeit setzen
      const [count, rest] = await call<[number, number]>([
        "EVAL",
        "local c = redis.call('INCR', KEYS[1]) if c == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end local t = redis.call('TTL', KEYS[1]) if t < 0 then redis.call('EXPIRE', KEYS[1], ARGV[1]) t = tonumber(ARGV[1]) end return {c, t}",
        1,
        key,
        Math.max(1, Math.ceil(ttl)),
      ]);
      return { count: Number(count), ttl: Number(rest) };
    },
    async decrFloor(key) {
      const r = await call<number>([
        "EVAL",
        "local v = tonumber(redis.call('GET', KEYS[1]) or '0') if v > 0 then return redis.call('DECR', KEYS[1]) end return 0",
        1,
        key,
      ]);
      return Number(r);
    },
    async setIfGreater(key, value) {
      const r = await call<number>([
        "EVAL",
        "local v = tonumber(redis.call('GET', KEYS[1]) or '-1') if tonumber(ARGV[1]) > v then redis.call('SET', KEYS[1], ARGV[1]) return 1 end return 0",
        1,
        key,
        value,
      ]);
      return Number(r) === 1;
    },
    sadd: (key, ...m) => call<number>(["SADD", key, ...m]),
    srem: (key, ...m) => call<number>(["SREM", key, ...m]),
    smembers: (key) => call<string[]>(["SMEMBERS", key]),
    scard: (key) => call<number>(["SCARD", key]),
    mget: (...keys) => (keys.length ? call<(string | null)[]>(["MGET", ...keys]) : Promise.resolve([])),
    async lpushTrim(key, value, max) {
      await call(["LPUSH", key, value]);
      await call(["LTRIM", key, 0, max - 1]);
    },
    lrange: (key, start, stop) => call<string[]>(["LRANGE", key, start, stop]),
  };
}

/* ───────────── Arbeitsspeicher (lokal & Tests) ───────────── */

type Entry = { value: string | Set<string> | string[]; exp?: number };

export function memoryBackend(now: () => number = Date.now): KvBackend {
  const data = new Map<string, Entry>();
  const live = (key: string) => {
    const e = data.get(key);
    if (e?.exp !== undefined && e.exp <= now()) {
      data.delete(key);
      return undefined;
    }
    return e;
  };
  const str = (key: string) => {
    const e = live(key);
    return typeof e?.value === "string" ? e.value : null;
  };
  const set = (key: string) => {
    const e = live(key);
    if (e?.value instanceof Set) return e.value;
    const s = new Set<string>();
    data.set(key, { value: s });
    return s;
  };
  return {
    get: async (key) => str(key),
    async set(key, value, opts) {
      if (opts?.nx && live(key)) return false;
      data.set(key, { value, exp: opts?.ex ? now() + Math.ceil(opts.ex) * 1000 : undefined });
      return true;
    },
    async del(...keys) {
      let n = 0;
      for (const k of keys) if (live(k) && data.delete(k)) n++;
      return n;
    },
    async incrWindow(key, ttl) {
      const e = live(key);
      const count = (typeof e?.value === "string" ? Number(e.value) : 0) + 1;
      const exp = e?.exp ?? now() + Math.ceil(ttl) * 1000;
      data.set(key, { value: String(count), exp });
      return { count, ttl: Math.ceil((exp - now()) / 1000) };
    },
    async decrFloor(key) {
      const e = live(key);
      const cur = typeof e?.value === "string" ? Number(e.value) : 0;
      if (!e || cur <= 0) return 0;
      data.set(key, { value: String(cur - 1), exp: e.exp });
      return cur - 1;
    },
    async setIfGreater(key, value) {
      const cur = Number(str(key) ?? "-1");
      if (value > cur) {
        data.set(key, { value: String(value) });
        return true;
      }
      return false;
    },
    async sadd(key, ...m) {
      const s = set(key);
      let n = 0;
      for (const x of m) if (!s.has(x)) (s.add(x), n++);
      return n;
    },
    async srem(key, ...m) {
      const e = live(key);
      if (!(e?.value instanceof Set)) return 0;
      let n = 0;
      for (const x of m) if (e.value.delete(x)) n++;
      return n;
    },
    smembers: async (key) => {
      const e = live(key);
      return e?.value instanceof Set ? [...e.value] : [];
    },
    scard: async (key) => {
      const e = live(key);
      return e?.value instanceof Set ? e.value.size : 0;
    },
    mget: async (...keys) => keys.map((k) => str(k)),
    async lpushTrim(key, value, max) {
      const e = live(key);
      const list = Array.isArray(e?.value) ? e.value : [];
      list.unshift(value);
      data.set(key, { value: list.slice(0, max) });
    },
    lrange: async (key, start, stop) => {
      const e = live(key);
      const list = Array.isArray(e?.value) ? e.value : [];
      return list.slice(start, stop < 0 ? undefined : stop + 1);
    },
  };
}

/* ───────────── Auswahl ───────────── */

const globalKv = globalThis as unknown as { __ttKv?: KvBackend; __ttKvOverride?: KvBackend };

/** Für Tests: eigenes Backend einsetzen (z. B. memoryBackend mit Testuhr) */
export function setKvBackend(backend: KvBackend | undefined) {
  globalKv.__ttKvOverride = backend;
}

export function kv(): KvBackend {
  if (globalKv.__ttKvOverride) return globalKv.__ttKvOverride;
  const kind = storeKind();
  if (kind === "redis") {
    const { redisUrl, redisToken } = storeInternals();
    return redisBackend(redisUrl, redisToken);
  }
  if (kind === "file") {
    // Lokal: ein Speicher pro Serverprozess (bleibt auch bei Hot-Reload erhalten)
    globalKv.__ttKv ??= memoryBackend();
    return globalKv.__ttKv;
  }
  throw new KvUnavailableError();
}
