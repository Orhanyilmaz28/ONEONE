import { type AdminSession, revokeSession, touchSession } from "../admin-security/sessions";
import type { Principal } from "./roles";
import { getUser } from "./users";

/**
 * Sitzung → angemeldete Person (ohne Next-Abhängigkeiten, dadurch testbar).
 * Büro-Zugänge werden bei jeder Anfrage gegen den gespeicherten Zugang geprüft: gesperrt, gelöscht oder
 * geändert (neue Version) → Sitzung wird beendet. Ist der Speicher nicht erreichbar → niemand angemeldet.
 */
export async function resolvePrincipal(s: AdminSession | null): Promise<Principal | null> {
  if (s?.stage !== "full") return null;
  if (!s.userId) {
    await touchSession(s).catch(() => undefined);
    return { role: "admin", name: "Administrator" };
  }
  const user = await getUser(s.userId).catch(() => undefined);
  if (user === undefined) return null;
  if (!user || !user.active || user.version !== s.uv) {
    await revokeSession(s.id).catch(() => undefined);
    return null;
  }
  await touchSession(s).catch(() => undefined);
  return { role: user.role, name: user.name, userId: user.id, username: user.username };
}
