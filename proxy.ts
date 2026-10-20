import { type NextRequest, NextResponse } from "next/server";
import { readSession } from "./lib/admin-security/sessions";
import { ADMIN_COOKIE } from "./lib/admin-token";
import { SITE_COOKIE, createLockResolver, getSiteLockStrict, validSiteToken } from "./lib/site-lock";

/**
 * Passwortschutz für den Shop (an/aus im Dashboard → Einstellungen).
 * Läuft vor jeder Seite. Ist der Schutz an und fehlt das Cookie, geht es zur Seite /zugang.
 */

// Einstellung kurz zwischenspeichern, damit nicht jede Anfrage den Datenspeicher fragt.
// Bei einer Störung gilt der letzte bekannte Stand – sonst „nicht verfügbar“ (Fail-Closed, siehe lib/site-lock.ts).
const lockResolver = createLockResolver(getSiteLockStrict, {
  onError: () => console.error("[proxy] Passwortschutz konnte nicht gelesen werden – letzter bekannter Stand bzw. geschlossen"),
});

/** Voll angemeldete Admins sehen den Shop auch bei Passwortschutz (Sitzung serverseitig geprüft) */
async function adminSession(token: string | undefined) {
  if (!token) return false;
  try {
    return (await readSession(token))?.stage === "full";
  } catch {
    return false;
  }
}

/** Diese Bereiche bleiben immer erreichbar */
function isOpenPath(pathname: string) {
  return (
    pathname === "/zugang" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname === "/api/stripe/webhook" ||
    // geschützt durch CRON_SECRET (eigene Prüfung in der Route)
    pathname.startsWith("/api/cron/") ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/media/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isOpenPath(pathname)) return NextResponse.next();

  const lock = await lockResolver.resolve();
  if (lock !== "unavailable" && !lock.enabled) return NextResponse.next();

  if (await adminSession(request.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();
  if (lock !== "unavailable" && validSiteToken(request.cookies.get(SITE_COOKIE)?.value, lock)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
    if (lock === "unavailable") return NextResponse.json({ error: "Der Shop ist gerade kurz nicht erreichbar." }, { status: 503, headers: { "Retry-After": "60" } });
    return NextResponse.json({ error: "Der Shop ist gerade passwortgeschützt." }, { status: 401 });
  }
  const url = request.nextUrl.clone();
  url.pathname = "/zugang";
  url.search = pathname === "/" && !search ? "" : `?weiter=${encodeURIComponent(pathname + search)}`;
  const res = NextResponse.redirect(url, 307);
  res.headers.set("X-Robots-Tag", "noindex, nofollow");
  res.headers.set("Cache-Control", "no-store");
  return res;
}

export const config = {
  // Nicht für Dateien (Bilder, Videos, Schriften, JS/CSS) – nur für Seiten und Schnittstellen
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon\\.png|icons/|opengraph-image|.*\\.(?:png|jpe?g|webp|avif|gif|svg|ico|mp4|webm|woff2?|txt|xml|js|css|map)$).*)"],
};
