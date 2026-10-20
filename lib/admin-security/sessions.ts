import { createHmac, randomBytes } from "node:crypto";
import { kv } from "../kv";
import { now } from "./clock";
import { sha256 } from "./crypto";

/**
 * Serverseitige Admin-Sitzungen in Redis. Das Cookie enthält nur eine zufällige ID (256 Bit);
 * gespeichert wird ausschließlich ihr Hash. Abmelden/Widerrufen löscht den Eintrag – das Cookie ist danach wertlos.
 *
 * Stufen: "2fa" = Passwort ok, zweiter Faktor fehlt · "setup" = Passwort ok, 2FA-Einrichtung erzwungen · "full" = angemeldet.
 * Nur "full" öffnet das Dashboard.
 */
export type SessionStage = "2fa" | "setup" | "full";

export type AdminSession = {
  /** Hash der Sitzungs-ID (nie die ID selbst) */
  id: string;
  stage: SessionStage;
  createdAt: number;
  lastSeen: number;
  /** absolutes Ende */
  expiresAt: number;
  ip: string;
  ua: string;
  /** Fingerabdruck des Passworts – ändert sich das Passwort, enden alle Sitzungen */
  pw?: string;
  /** Anmeldeweg, z. B. "Passwort + TOTP" */
  method?: string;
  /** Nur bei Büro-Zugängen: ID der Person und Version ihres Zugangs (ändert sich die Version, endet die Sitzung) */
  userId?: string;
  uv?: number;
};

/** Volle Sitzung: höchstens 12 Stunden, nach 2 Stunden Inaktivität beendet */
export const SESSION_ABSOLUTE = 12 * 60 * 60;
export const SESSION_IDLE = 2 * 60 * 60;
/** Zwischenschritt (zweiter Faktor / Einrichtung): 10 Minuten */
export const PENDING_TTL = 10 * 60;

const key = (hash: string) => `tt:adm:s:${hash}`;
const INDEX = "tt:adm:sessions";
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export const hashToken = (token: string) => sha256(`tt-admin-session:${token}`);

/** Passwort-Fingerabdruck nur mit eigenem Schlüssel (SESSION_SECRET/ADMIN_SECRET) – sonst wird keiner gespeichert */
export function passwordFingerprint(): string | undefined {
  const secret = process.env.SESSION_SECRET || process.env.ADMIN_SECRET;
  if (!secret || secret.length < 32) return undefined;
  return createHmac("sha256", secret).update(`admin-password:${process.env.ADMIN_PASSWORD ?? ""}`).digest("hex").slice(0, 32);
}

function ttlFor(s: AdminSession, t: number) {
  if (s.stage !== "full") return Math.max(1, Math.ceil((s.expiresAt - t) / 1000));
  return Math.max(1, Math.ceil(Math.min(s.expiresAt - t, SESSION_IDLE * 1000) / 1000));
}

export async function createSession(stage: SessionStage, info: { ip: string; ua: string; method?: string; userId?: string; uv?: number }) {
  const token = randomBytes(32).toString("base64url");
  const t = now();
  const session: AdminSession = {
    id: hashToken(token),
    stage,
    createdAt: t,
    lastSeen: t,
    expiresAt: t + (stage === "full" ? SESSION_ABSOLUTE : PENDING_TTL) * 1000,
    ip: info.ip,
    ua: info.ua,
    // Büro-Zugänge hängen nicht am Administrator-Passwort, sondern an der Version ihres eigenen Zugangs
    pw: info.userId ? undefined : passwordFingerprint(),
    method: info.method,
    ...(info.userId ? { userId: info.userId, uv: info.uv } : {}),
  };
  await kv().set(key(session.id), JSON.stringify(session), { ex: ttlFor(session, t) });
  if (stage === "full") await kv().sadd(INDEX, session.id);
  return { token, session };
}

/** Sitzung zu einem Cookie-Wert – prüft Format, Ablauf, Inaktivität und Passwort-Fingerabdruck */
export async function readSession(token: string | undefined): Promise<AdminSession | null> {
  if (!token || !TOKEN_RE.test(token)) return null;
  const id = hashToken(token);
  const raw = await kv().get(key(id));
  if (!raw) return null;
  let s: AdminSession;
  try {
    s = JSON.parse(raw) as AdminSession;
  } catch {
    return null;
  }
  const t = now();
  const idleOver = s.stage === "full" && t - s.lastSeen > SESSION_IDLE * 1000;
  const pwChanged = !s.userId && (s.pw ?? undefined) !== passwordFingerprint();
  if (s.id !== id || t >= s.expiresAt || idleOver || pwChanged) {
    await revokeSession(id);
    return null;
  }
  return s;
}

/** Aktivität vermerken (höchstens einmal pro Minute schreiben) – verlängert den Inaktivitäts-Ablauf */
export async function touchSession(s: AdminSession) {
  const t = now();
  if (t - s.lastSeen < 60_000) return;
  const next = { ...s, lastSeen: t };
  await kv().set(key(s.id), JSON.stringify(next), { ex: ttlFor(next, t) });
}

/** Für den Zwischenschritt: Daten aktualisieren, Ablauf bleibt */
export async function saveSession(s: AdminSession) {
  await kv().set(key(s.id), JSON.stringify(s), { ex: ttlFor(s, now()) });
}

export async function revokeSession(id: string) {
  await kv().del(key(id));
  await kv().srem(INDEX, id);
}

/** Alle vollen Sitzungen beenden (optional außer einer) – liefert die Anzahl */
export async function revokeAllSessions(exceptId?: string) {
  const ids = (await kv().smembers(INDEX)).filter((id) => id !== exceptId);
  for (const id of ids) await revokeSession(id);
  return ids.length;
}

/** Aktive volle Sitzungen (abgelaufene werden dabei aufgeräumt) */
export async function listSessions(): Promise<AdminSession[]> {
  const ids = await kv().smembers(INDEX);
  if (!ids.length) return [];
  const raws = await kv().mget(...ids.map(key));
  const t = now();
  const out: AdminSession[] = [];
  for (const [i, raw] of raws.entries()) {
    const s = raw ? (JSON.parse(raw) as AdminSession) : null;
    if (!s || t >= s.expiresAt || t - s.lastSeen > SESSION_IDLE * 1000 || (!s.userId && (s.pw ?? undefined) !== passwordFingerprint())) await revokeSession(ids[i]);
    else out.push(s);
  }
  return out.sort((a, b) => b.lastSeen - a.lastSeen);
}
