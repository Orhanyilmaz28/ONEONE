/**
 * Kleiner Redis-Nachbau im Arbeitsspeicher (nur die Befehle, die Datensicherung und Wiederherstellung brauchen).
 * Für Unit-Tests ohne echte Datenbank. `hooks.before` erlaubt, Fehler oder gleichzeitige Änderungen einzuspielen.
 */
import type { Cmd, RedisClient } from "../../lib/backup/redis-rest";

type Val = { t: "string"; v: string } | { t: "list"; v: string[] } | { t: "set"; v: Set<string> } | { t: "hash"; v: Map<string, string> } | { t: "zset"; v: Map<string, number> };
type Item = Val & { exp?: number };

export type FakeRedis = RedisClient & {
  data: Map<string, Item>;
  calls: Cmd[];
  hooks: { before?: (cmd: Cmd) => void | Promise<void> };
  /** Wert direkt setzen (am Client vorbei) */
  put(key: string, value: string): void;
};

export function fakeRedis(target = "fake.local"): FakeRedis {
  const data = new Map<string, Item>();
  const calls: Cmd[] = [];
  const hooks: FakeRedis["hooks"] = {};
  const live = (k: string) => {
    const e = data.get(k);
    if (e?.exp !== undefined && e.exp <= Date.now()) {
      data.delete(k);
      return undefined;
    }
    return e;
  };
  const str = (k: string) => {
    const e = live(k);
    if (!e) return null;
    if (e.t !== "string") throw new Error("WRONGTYPE");
    return e.v;
  };
  function exec(c: Cmd): unknown {
    const [name, ...a] = c.map(String);
    switch (name.toUpperCase()) {
      case "PING":
        return "PONG";
      case "SCAN": {
        const all = [...data.keys()].filter((k) => live(k));
        const start = Number(a[0]);
        const count = 3; // kleine Seiten, damit mehrere Runden getestet werden
        const page = all.slice(start, start + count);
        const next = start + count >= all.length ? "0" : String(start + count);
        return [next, page];
      }
      case "TYPE":
        return live(a[0])?.t ?? "none";
      case "GET":
        return str(a[0]);
      case "MGET":
        return a.map((k) => {
          const e = live(k);
          return e?.t === "string" ? e.v : null;
        });
      case "STRLEN":
        return Buffer.byteLength(str(a[0]) ?? "");
      case "PTTL": {
        const e = live(a[0]);
        if (!e) return -2;
        return e.exp === undefined ? -1 : e.exp - Date.now();
      }
      case "SET": {
        const [k, v, ...opt] = a;
        const up = opt.map((o) => o.toUpperCase());
        if (up.includes("NX") && live(k)) return null;
        let exp: number | undefined;
        const ex = up.indexOf("EX");
        const px = up.indexOf("PX");
        if (ex >= 0) exp = Date.now() + Number(opt[ex + 1]) * 1000;
        if (px >= 0) exp = Date.now() + Number(opt[px + 1]);
        data.set(k, { t: "string", v, exp });
        return "OK";
      }
      case "INCR": {
        const n = Number(str(a[0]) ?? "0") + 1;
        data.set(a[0], { t: "string", v: String(n) });
        return n;
      }
      case "DEL": {
        let n = 0;
        for (const k of a) if (live(k) && data.delete(k)) n++;
        return n;
      }
      case "DBSIZE":
        return [...data.keys()].filter((k) => live(k)).length;
      case "FLUSHDB":
        data.clear();
        return "OK";
      case "EXPIRE":
      case "PEXPIRE": {
        const e = live(a[0]);
        if (!e) return 0;
        e.exp = Date.now() + Number(a[1]) * (name.toUpperCase() === "EXPIRE" ? 1000 : 1);
        return 1;
      }
      case "LPUSH":
      case "RPUSH": {
        const e = live(a[0]);
        const list = e?.t === "list" ? e.v : [];
        for (const x of a.slice(1)) name.toUpperCase() === "LPUSH" ? list.unshift(x) : list.push(x);
        data.set(a[0], { t: "list", v: list, exp: e?.exp });
        return list.length;
      }
      case "LTRIM": {
        const e = live(a[0]);
        if (e?.t === "list") e.v = e.v.slice(Number(a[1]), Number(a[2]) < 0 ? undefined : Number(a[2]) + 1);
        return "OK";
      }
      case "LRANGE": {
        const e = live(a[0]);
        return e?.t === "list" ? e.v.slice(Number(a[1]), Number(a[2]) < 0 ? undefined : Number(a[2]) + 1) : [];
      }
      case "SADD": {
        const e = live(a[0]);
        const s = e?.t === "set" ? e.v : new Set<string>();
        let n = 0;
        for (const x of a.slice(1)) if (!s.has(x)) (s.add(x), n++);
        data.set(a[0], { t: "set", v: s, exp: e?.exp });
        return n;
      }
      case "SMEMBERS": {
        const e = live(a[0]);
        return e?.t === "set" ? [...e.v] : [];
      }
      case "HSET":
      case "HINCRBY": {
        const e = live(a[0]);
        const h = e?.t === "hash" ? e.v : new Map<string, string>();
        if (name.toUpperCase() === "HINCRBY") h.set(a[1], String(Number(h.get(a[1]) ?? "0") + Number(a[2])));
        else for (let i = 1; i + 1 < a.length; i += 2) h.set(a[i], a[i + 1]);
        data.set(a[0], { t: "hash", v: h, exp: e?.exp });
        return 1;
      }
      case "HGETALL": {
        const e = live(a[0]);
        return e?.t === "hash" ? [...e.v].flat() : [];
      }
      case "ZADD": {
        const e = live(a[0]);
        const z = e?.t === "zset" ? e.v : new Map<string, number>();
        for (let i = 1; i + 1 < a.length; i += 2) z.set(a[i + 1], Number(a[i]));
        data.set(a[0], { t: "zset", v: z, exp: e?.exp });
        return 1;
      }
      case "ZRANGE": {
        const e = live(a[0]);
        if (e?.t !== "zset") return [];
        return [...e.v].sort((x, y) => x[1] - y[1] || (x[0] < y[0] ? -1 : 1)).flatMap(([m, s]) => [m, String(s)]);
      }
      case "EVAL": {
        // nur die Skripte der Datensicherung: Sperre freigeben (vergleichen und löschen)
        const script = a[0];
        if (script.includes("DEL") && script.includes("GET")) {
          const k = a[2];
          if (str(k) === a[3]) return exec(["DEL", k]);
          return 0;
        }
        throw new Error("unbekanntes Skript");
      }
      default:
        throw new Error(`Befehl nicht nachgebaut: ${name}`);
    }
  }
  const client: FakeRedis = {
    target,
    data,
    calls,
    hooks,
    put(key, value) {
      data.set(key, { t: "string", v: value });
    },
    async cmd<T>(command: Cmd): Promise<T> {
      calls.push(command);
      await hooks.before?.(command);
      return exec(command) as T;
    },
    async pipeline(commands: Cmd[]) {
      const out: { result?: unknown; error?: string }[] = [];
      for (const c of commands) {
        calls.push(c);
        await hooks.before?.(c);
        try {
          out.push({ result: exec(c) });
        } catch (e) {
          out.push({ error: (e as Error).message });
        }
      }
      return out;
    },
  };
  return client;
}
