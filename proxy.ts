import { type NextRequest, NextResponse } from "next/server";
import { ADMIN_COOKIE, verifyAdminToken } from "./lib/admin-token";
import { SITE_COOKIE, type SiteLock, getSiteLock, validSiteToken } from "./lib/site-lock";

/**
 * Passwortschutz für den Shop (an/aus im Dashboard → Einstellungen).
 * Läuft vor jeder Seite. Ist der Schutz an und fehlt das Cookie, geht es zur Seite /zugang.
 */

// Einstellung kurz zwischenspeichern, damit nicht jede Anfrage den Datenspeicher fragt
let cache: { lock: SiteLock; at: number } | null = null;
const CACHE_MS = 10_000;

async function lockState(): Promise<SiteLock> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.lock;
  try {
    const lock = await getSiteLock();
    cache = { lock, at: Date.now() };
    return lock;
  } catch {
    // Speicher nicht erreichbar: letzten bekannten Stand behalten, sonst offen lassen
    return cache?.lock ?? { enabled: false };
  }
}

/** Diese Bereiche bleiben immer erreichbar */
function isOpenPath(pathname: string) {
  return (
    pathname === "/zugang" ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/api/admin") ||
    pathname === "/api/stripe/webhook" ||
    pathname === "/robots.txt" ||
    pathname === "/manifest.webmanifest" ||
    pathname.startsWith("/media/")
  );
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (isOpenPath(pathname)) return NextResponse.next();

  const lock = await lockState();
  if (!lock.enabled) return NextResponse.next();

  if (verifyAdminToken(request.cookies.get(ADMIN_COOKIE)?.value)) return NextResponse.next();
  if (validSiteToken(request.cookies.get(SITE_COOKIE)?.value, lock)) return NextResponse.next();

  if (pathname.startsWith("/api/")) {
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
