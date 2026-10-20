/**
 * Schlanker Redis-Zugang über die Upstash-REST-Schnittstelle – nur für Datensicherung und Wiederherstellung.
 *
 * Eigenes Zeitlimit je Anfrage, Wiederholung nur für Lesebefehle (die nichts verändern), klare Fehler.
 * Zugangsdaten werden nie protokolliert. Nur auf dem Server verwenden.
 */
export type Cmd = (string | number)[];

export interface RedisClient {
  /** ein Befehl */
  cmd<T = unknown>(command: Cmd): Promise<T>;
  /** mehrere Befehle in einer Anfrage (nicht atomar); jeder Eintrag liefert Ergebnis oder Fehler */
  pipeline(commands: Cmd[]): Promise<{ result?: unknown; error?: string }[]>;
  /** Kennung des Ziels (nur Host, ohne Token) – für Schutzprüfungen und Protokolle */
  readonly target: string;
}

export class RedisRequestError extends Error {
  override name = "RedisRequestError";
  constructor(
    message: string,
    public readonly timeout = false,
  ) {
    super(message);
  }
}

/** Lesebefehle dürfen bei Netzfehlern wiederholt werden */
const READ_ONLY = new Set(["GET", "MGET", "STRLEN", "GETRANGE", "SCAN", "TYPE", "PTTL", "LRANGE", "LLEN", "SMEMBERS", "SCARD", "HGETALL", "ZRANGE", "DBSIZE", "EXISTS", "PING"]);

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Host einer Adresse (für Vergleiche „ist das dieselbe Datenbank?“) */
export function hostOf(url: string): string {
  try {
    const u = new URL(url);
    return `${u.hostname.toLowerCase()}${u.port ? `:${u.port}` : ""}`;
  } catch {
    return url.trim().toLowerCase();
  }
}

export function restClient(url: string, token: string, opts: { timeoutMs?: number; retries?: number } = {}): RedisClient {
  const base = url.replace(/\/$/, "");
  const timeoutMs = opts.timeoutMs ?? (Number(process.env.BACKUP_REDIS_TIMEOUT_MS) || 15_000);
  const retries = opts.retries ?? 2;

  async function post<T>(path: string, body: unknown, retry: boolean): Promise<T> {
    let lastError: RedisRequestError | null = null;
    for (let attempt = 0; attempt <= (retry ? retries : 0); attempt++) {
      if (attempt) await sleep(200 * 2 ** attempt);
      let res: Response;
      try {
        res = await fetch(`${base}${path}`, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (e) {
        const timeout = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        lastError = new RedisRequestError(timeout ? "Zeitüberschreitung" : "Netzwerkfehler", timeout);
        continue;
      }
      if (res.status >= 500) {
        lastError = new RedisRequestError(`HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new RedisRequestError(`HTTP ${res.status}`);
      try {
        return (await res.json()) as T;
      } catch {
        lastError = new RedisRequestError("ungültige Antwort");
      }
    }
    throw lastError ?? new RedisRequestError("unbekannter Fehler");
  }

  return {
    target: hostOf(base),
    async cmd<T>(command: Cmd): Promise<T> {
      const body = await post<{ result?: T; error?: string }>("", command, READ_ONLY.has(String(command[0]).toUpperCase()));
      if (body.error) throw new RedisRequestError("Redis-Fehler");
      return body.result as T;
    },
    async pipeline(commands: Cmd[]) {
      if (!commands.length) return [];
      const readOnly = commands.every((c) => READ_ONLY.has(String(c[0]).toUpperCase()));
      const out = await post<{ result?: unknown; error?: string }[]>("/pipeline", commands, readOnly);
      if (!Array.isArray(out) || out.length !== commands.length) throw new RedisRequestError("unvollständige Antwort");
      return out;
    },
  };
}

/** Zugang zur produktiven Datenbank des Shops (dieselben Variablen wie lib/store.ts) */
export function productionCredentials(): { url: string; token: string } | null {
  const url = (process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL ?? "").replace(/\/$/, "");
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN ?? "";
  return url && token ? { url, token } : null;
}

/** Zugang zur isolierten Testdatenbank für Wiederherstellungstests */
export function restoreTestCredentials(): { url: string; token: string } | null {
  const url = (process.env.BACKUP_RESTORE_TEST_URL ?? "").replace(/\/$/, "");
  const token = process.env.BACKUP_RESTORE_TEST_TOKEN ?? "";
  return url && token ? { url, token } : null;
}
