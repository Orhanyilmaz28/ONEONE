import { promises as fs } from "node:fs";
import path from "node:path";
import { KEYS, type StoreKind, getJSON, setJSON, storeInternals, storeKind } from "./store";

/**
 * Speicherbelegung messen (Dashboard → Speicher). Upstash nennt das Tarif-Limit nicht über die Redis-Verbindung –
 * deshalb messen wir die Datenmenge selbst (Wert- plus Schlüssellänge je Eintrag) und vergleichen mit dem gewählten Limit.
 */
export type StorageUsage = {
  kind: StoreKind;
  usedBytes: number;
  keys: number;
  categories: { label: string; bytes: number; count: number }[];
  largest: { key: string; label: string; bytes: number }[];
  measuredAt: string;
};

export const DEFAULT_LIMIT_MB = 256;
export const LIMIT_PRESETS = [
  { mb: 256, label: "Free – 256 MB" },
  { mb: 1024, label: "1 GB" },
  { mb: 5 * 1024, label: "5 GB" },
  { mb: 10 * 1024, label: "10 GB" },
  { mb: 100 * 1024, label: "Pay as you go – 100 GB" },
];

const KEY_LABELS: Record<string, string> = {
  [KEYS.orders]: "Shop-Bestellungen & Versand",
  [KEYS.dealerOrders]: "Händler-Bestellungen & Rechnungen",
  [KEYS.dealers]: "Händler & Konten",
  [KEYS.customers]: "Händler & Konten",
  [KEYS.dealerMessages]: "Nachrichten an Händler",
  [KEYS.reviews]: "Bewertungen & Newsletter",
  [KEYS.newsletter]: "Bewertungen & Newsletter",
};

/** Kategorie eines Schlüssels (für die Aufteilung) */
export function categoryOf(key: string): string {
  if (key.startsWith("tt:media:proof-")) return "Gewerbenachweise";
  if (key.startsWith("tt:media:pass-")) return "Artikelpässe (Uploads)";
  if (key.startsWith("tt:media:")) return "Produktbilder & Medien";
  if (key.startsWith("tt:once")) return "Sperren & Einmal-Marker";
  if (KEY_LABELS[key]) return KEY_LABELS[key];
  if (key.startsWith("tt:")) return "Produkte & Einstellungen";
  return "Sonstiges";
}

async function redisCall<T>(url: string, token: string, body: unknown, pipeline = false): Promise<T> {
  const res = await fetch(pipeline ? `${url}/pipeline` : url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`Redis ${res.status}`);
  return (await res.json()) as T;
}

async function measureRedis(): Promise<Map<string, number>> {
  const { redisUrl: url, redisToken: token } = storeInternals();
  const keys: string[] = [];
  let cursor = "0";
  for (let round = 0; round < 50; round++) {
    const { result } = await redisCall<{ result: [string, string[]] }>(url, token, ["SCAN", cursor, "COUNT", "1000"]);
    keys.push(...result[1]);
    cursor = String(result[0]);
    if (cursor === "0") break;
  }
  const sizes = new Map<string, number>();
  const unique = [...new Set(keys)];
  for (let i = 0; i < unique.length; i += 500) {
    const chunk = unique.slice(i, i + 500);
    const res = await redisCall<{ result?: number; error?: string }[]>(url, token, chunk.map((k) => ["STRLEN", k]), true);
    chunk.forEach((k, j) => sizes.set(k, (typeof res[j]?.result === "number" ? (res[j].result as number) : 0) + Buffer.byteLength(k)));
  }
  return sizes;
}

async function measureFile(): Promise<Map<string, number>> {
  const { file, mediaDir } = storeInternals();
  const sizes = new Map<string, number>();
  try {
    const all = JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
    for (const [k, v] of Object.entries(all)) sizes.set(k, Buffer.byteLength(JSON.stringify(v)) + Buffer.byteLength(k));
  } catch {}
  try {
    for (const name of await fs.readdir(mediaDir)) {
      const st = await fs.stat(path.join(mediaDir, name));
      // online liegen Binärdaten als Base64 (≈ 4/3 der Dateigröße) – so vergleichbar
      sizes.set(`tt:media:${name}`, Math.ceil((st.size * 4) / 3) + 10 + name.length);
    }
  } catch {}
  return sizes;
}

/** Neu messen und das Ergebnis für die Übersicht speichern */
export async function measureStorage(): Promise<StorageUsage> {
  const kind = storeKind();
  const sizes = kind === "redis" ? await measureRedis() : kind === "file" ? await measureFile() : new Map<string, number>();
  const cats = new Map<string, { bytes: number; count: number }>();
  let used = 0;
  for (const [k, b] of sizes) {
    used += b;
    const c = categoryOf(k);
    const cur = cats.get(c) ?? { bytes: 0, count: 0 };
    cats.set(c, { bytes: cur.bytes + b, count: cur.count + 1 });
  }
  const usage: StorageUsage = {
    kind,
    usedBytes: used,
    keys: sizes.size,
    categories: [...cats].map(([label, v]) => ({ label, ...v })).sort((a, b) => b.bytes - a.bytes),
    largest: [...sizes]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([key, bytes]) => ({ key, label: categoryOf(key), bytes })),
    measuredAt: new Date().toISOString(),
  };
  if (kind !== "none") await setJSON(KEYS.storageUsage, usage).catch(() => undefined);
  return usage;
}

export const getLastUsage = () => getJSON<StorageUsage | null>(KEYS.storageUsage, null);

export async function getLimitMb(): Promise<number> {
  const v = await getJSON<number | null>(KEYS.storageLimit, null);
  return typeof v === "number" && v > 0 ? v : DEFAULT_LIMIT_MB;
}

export const formatBytes = (b: number) =>
  b <= 0 ? "0 KB" : b >= 1024 ** 3 ? `${(b / 1024 ** 3).toLocaleString("de-DE", { maximumFractionDigits: 2 })} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toLocaleString("de-DE", { maximumFractionDigits: 1 })} MB` : `${Math.max(1, Math.round(b / 1024)).toLocaleString("de-DE")} KB`;
