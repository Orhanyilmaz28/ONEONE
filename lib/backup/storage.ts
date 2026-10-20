import { cleanEnv } from "./redis-rest";
import { promises as fs } from "node:fs";
import path from "node:path";
import { s3Client } from "./s3";

/**
 * Ablageort der Sicherungen – immer AUSSERHALB von Upstash Redis.
 *
 * - "s3":   S3-kompatibler Objektspeicher (empfohlen: Cloudflare R2). Variablen BACKUP_S3_*.
 * - "file": Ordner auf dem eigenen Rechner (BACKUP_LOCAL_DIR) – nur für Entwicklung und Tests.
 *           Auf Vercel gesperrt: das Dateisystem dort ist temporär und wird gelöscht.
 * - "memory": nur für automatische Tests.
 */
export type StoredObject = { key: string; size: number; lastModified: string };

export interface BackupStorage {
  readonly kind: "s3" | "file" | "memory";
  /** Beschreibung ohne Geheimnisse, z. B. „Cloudflare R2 · bucket/prefix“ */
  readonly label: string;
  put(key: string, data: Buffer, contentType?: string): Promise<void>;
  get(key: string): Promise<Buffer | null>;
  del(key: string): Promise<void>;
  list(): Promise<StoredObject[]>;
}

export class StorageNotConfiguredError extends Error {
  override name = "StorageNotConfiguredError";
  constructor(detail = "Kein Speicher für Sicherungen eingerichtet (BACKUP_S3_* fehlt).") {
    super(detail);
  }
}

const safeName = (key: string) => {
  if (!/^[A-Za-z0-9._-]+$/.test(key)) throw new Error("Ungültiger Dateiname");
  return key;
};

export function s3Storage(env = process.env): BackupStorage | null {
  const endpoint = cleanEnv(env.BACKUP_S3_ENDPOINT);
  const bucket = cleanEnv(env.BACKUP_S3_BUCKET);
  const accessKeyId = cleanEnv(env.BACKUP_S3_ACCESS_KEY_ID);
  const secretAccessKey = cleanEnv(env.BACKUP_S3_SECRET_ACCESS_KEY);
  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) return null;
  const prefix = (env.BACKUP_S3_PREFIX ?? "exstase-backups/").replace(/^\/+/, "");
  const client = s3Client({ endpoint, bucket, accessKeyId, secretAccessKey, region: env.BACKUP_S3_REGION || "auto" });
  let host = endpoint;
  try {
    host = new URL(endpoint).hostname;
  } catch {}
  const provider = host.endsWith("r2.cloudflarestorage.com") ? "Cloudflare R2" : host.includes("amazonaws.com") ? "AWS S3" : "S3-Speicher";
  return {
    kind: "s3",
    label: `${provider} · ${bucket}/${prefix}`,
    put: (key, data, type) => client.put(prefix + safeName(key), data, type),
    get: (key) => client.get(prefix + safeName(key)),
    del: (key) => client.del(prefix + safeName(key)),
    async list() {
      return (await client.list(prefix)).filter((o) => o.key.startsWith(prefix) && !o.key.slice(prefix.length).includes("/")).map((o) => ({ ...o, key: o.key.slice(prefix.length) }));
    },
  };
}

export function fileStorage(dir: string): BackupStorage {
  const full = path.resolve(dir);
  return {
    kind: "file",
    label: `Lokaler Ordner · ${full}`,
    async put(key, data) {
      await fs.mkdir(full, { recursive: true });
      const target = path.join(full, safeName(key));
      const tmp = `${target}.${process.pid}.tmp`;
      await fs.writeFile(tmp, data);
      await fs.rename(tmp, target);
    },
    async get(key) {
      return fs.readFile(path.join(full, safeName(key))).catch((e: NodeJS.ErrnoException) => {
        if (e.code === "ENOENT") return null;
        throw e;
      });
    },
    async del(key) {
      await fs.unlink(path.join(full, safeName(key))).catch((e: NodeJS.ErrnoException) => {
        if (e.code !== "ENOENT") throw e;
      });
    },
    async list() {
      let names: string[] = [];
      try {
        names = await fs.readdir(full);
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
        throw e;
      }
      const out: StoredObject[] = [];
      for (const n of names) {
        if (n.endsWith(".tmp")) continue;
        const st = await fs.stat(path.join(full, n));
        if (st.isFile()) out.push({ key: n, size: st.size, lastModified: st.mtime.toISOString() });
      }
      return out;
    },
  };
}

export function memoryStorage(): BackupStorage & { files: Map<string, Buffer> } {
  const files = new Map<string, Buffer>();
  return {
    kind: "memory",
    label: "Arbeitsspeicher (Test)",
    files,
    async put(key, data) {
      files.set(safeName(key), Buffer.from(data));
    },
    async get(key) {
      const f = files.get(safeName(key));
      return f ? Buffer.from(f) : null;
    },
    async del(key) {
      files.delete(safeName(key));
    },
    async list() {
      return [...files].map(([key, b]) => ({ key, size: b.length, lastModified: new Date().toISOString() }));
    },
  };
}

/** Konfigurierter Speicher – oder null (dann sind Sicherungen nicht möglich) */
export function configuredStorage(env = process.env): BackupStorage | null {
  const s3 = s3Storage(env);
  if (s3) return s3;
  if (env.BACKUP_LOCAL_DIR) {
    // Vercel: nur /tmp ist beschreibbar und wird gelöscht → keine alleinige Ablage dort
    if (env.VERCEL) return null;
    return fileStorage(env.BACKUP_LOCAL_DIR);
  }
  return null;
}
