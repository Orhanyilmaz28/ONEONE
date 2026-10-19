/**
 * Herkunft einer Anfrage für Begrenzung und Protokoll.
 * Auf Vercel setzt die Plattform x-real-ip / x-vercel-forwarded-for selbst und überschreibt Werte, die ein Client mitschickt –
 * frei erfundene Header können die IP-Begrenzung deshalb nicht umgehen. Außerhalb von Vercel wird keinem Header vertraut.
 */
export function clientIp(h: Headers): string {
  if (!process.env.VERCEL) return "local";
  const v = h.get("x-real-ip") ?? h.get("x-vercel-forwarded-for")?.split(",")[0];
  const ip = v?.trim() ?? "";
  return /^[0-9a-fA-F:.]{3,45}$/.test(ip) ? ip : "unknown";
}

export function userAgent(h: Headers) {
  return (h.get("user-agent") ?? "").replace(/[^\x20-\x7E]/g, "").slice(0, 160);
}

/** IP fürs Protokoll gekürzt (IPv4: letzter Block, IPv6: hintere Hälfte entfernt) */
export function maskIp(ip: string) {
  if (/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return ip.replace(/\.\d+$/, ".x");
  if (ip.includes(":")) return `${ip.split(":").slice(0, 3).join(":")}:…`;
  return ip;
}

/** Kurzer, lesbarer Gerätename aus dem User-Agent */
export function deviceLabel(ua: string) {
  const browser = /Edg\//.test(ua) ? "Edge" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Browser";
  const os = /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Windows/.test(ua) ? "Windows" : /Mac OS X/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  return os ? `${browser} · ${os}` : browser;
}
