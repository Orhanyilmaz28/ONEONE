import type { RedisClient } from "./redis-rest";

/**
 * Betriebsdaten der Datensicherung (Sperre gegen parallele Läufe, Status, Protokoll) – im produktiven Redis unter tt:backup:*.
 * Diese Schlüssel werden selbst nie gesichert.
 */
export type BackupLogEntry = {
  at: string;
  action: "backup" | "verify" | "restore_test" | "retention" | "health";
  ok: boolean;
  trigger?: "cron" | "manual" | "cli";
  id?: string;
  durationMs?: number;
  /** verständliche Meldung, nie mit Geheimnissen */
  message: string;
};

export type BackupState = {
  lastSuccessAt?: string;
  lastSuccessId?: string;
  lastAttemptAt?: string;
  lastFailureAt?: string;
  lastFailureMessage?: string;
  lastRestoreTestAt?: string;
  lastRestoreTestOk?: boolean;
};

export interface OpsStore {
  acquireLock(owner: string, ttlSeconds: number): Promise<boolean>;
  releaseLock(owner: string): Promise<void>;
  lockOwner(): Promise<string | null>;
  log(entry: BackupLogEntry): Promise<void>;
  readLog(limit: number): Promise<BackupLogEntry[]>;
  getState(): Promise<BackupState>;
  patchState(patch: Partial<BackupState>): Promise<void>;
}

export const LOCK_KEY = "tt:backup:lock";
const LOG_KEY = "tt:backup:log";
const STATE_KEY = "tt:backup:state";
const MAX_LOG = 300;

const RELEASE = "if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0";

export function redisOps(redis: RedisClient): OpsStore {
  return {
    async acquireLock(owner, ttl) {
      return (await redis.cmd<string | null>(["SET", LOCK_KEY, owner, "NX", "EX", ttl])) === "OK";
    },
    async releaseLock(owner) {
      await redis.cmd(["EVAL", RELEASE, 1, LOCK_KEY, owner]);
    },
    lockOwner: () => redis.cmd<string | null>(["GET", LOCK_KEY]),
    async log(entry) {
      await redis.pipeline([
        ["LPUSH", LOG_KEY, JSON.stringify(entry)],
        ["LTRIM", LOG_KEY, 0, MAX_LOG - 1],
      ]);
    },
    async readLog(limit) {
      const raw = (await redis.cmd<string[]>(["LRANGE", LOG_KEY, 0, limit - 1])) ?? [];
      return raw.flatMap((r) => {
        try {
          return [JSON.parse(r) as BackupLogEntry];
        } catch {
          return [];
        }
      });
    },
    async getState() {
      const raw = await redis.cmd<string | null>(["GET", STATE_KEY]);
      try {
        return raw ? (JSON.parse(raw) as BackupState) : {};
      } catch {
        return {};
      }
    },
    async patchState(patch) {
      // Status ist nur eine Anzeige (die Sicherungen selbst liegen im externen Speicher) – einfaches Zusammenführen genügt
      const cur = await this.getState();
      await redis.cmd(["SET", STATE_KEY, JSON.stringify({ ...cur, ...patch })]);
    },
  };
}

/** Für lokale Entwicklung ohne Redis und für Tests */
export function memoryOps(): OpsStore {
  const g = globalThis as unknown as { __ttBackupOps?: { lock: { owner: string; until: number } | null; log: BackupLogEntry[]; state: BackupState } };
  const s = (g.__ttBackupOps ??= { lock: null, log: [], state: {} });
  return {
    async acquireLock(owner, ttl) {
      if (s.lock && s.lock.until > Date.now()) return false;
      s.lock = { owner, until: Date.now() + ttl * 1000 };
      return true;
    },
    async releaseLock(owner) {
      if (s.lock?.owner === owner) s.lock = null;
    },
    lockOwner: async () => (s.lock && s.lock.until > Date.now() ? s.lock.owner : null),
    async log(entry) {
      s.log.unshift(entry);
      s.log.length = Math.min(s.log.length, MAX_LOG);
    },
    readLog: async (limit) => s.log.slice(0, limit),
    getState: async () => ({ ...s.state }),
    async patchState(patch) {
      s.state = { ...s.state, ...patch };
    },
  };
}

export function resetMemoryOps() {
  (globalThis as unknown as { __ttBackupOps?: unknown }).__ttBackupOps = undefined;
}
