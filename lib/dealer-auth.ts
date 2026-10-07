import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type Dealer, getDealer } from "./dealer-store";

/**
 * Anmeldung für freigegebene Händler: signiertes, httpOnly-Cookie (14 Tage).
 * Inhalt: Händler-ID, Sitzungsversion und Ablaufzeit – die Version im Datensatz entscheidet, ob es noch gilt
 * (wird bei Sperre oder neuem Passwort erhöht).
 */
const COOKIE = "tt_haendler";
const DAYS = 14;

function secret() {
  return process.env.SESSION_SECRET || createHash("sha256").update(`tt-haendler:${process.env.ADMIN_PASSWORD ?? ""}`).digest("hex");
}
const sign = (payload: string) => createHmac("sha256", secret()).update(`haendler.${payload}`).digest("base64url");
const safeEqual = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export async function getCurrentDealer(): Promise<Dealer | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 4) return null;
  const [id, version, exp, sig] = parts;
  if (!/^[0-9a-f]{16}$/.test(id) || Number(exp) < Date.now() || !safeEqual(sig, sign(`${id}.${version}.${exp}`))) return null;
  const dealer = await getDealer(id);
  if (!dealer || dealer.status !== "freigegeben" || !dealer.passwordHash || String(dealer.sessionVersion ?? 0) !== version) return null;
  return dealer;
}

/** Für Seiten im Händlerbereich: nicht angemeldet → zur Anmeldung */
export async function requireDealer(): Promise<Dealer> {
  const dealer = await getCurrentDealer();
  if (!dealer) redirect("/haendler/login");
  return dealer;
}

export async function startDealerSession(dealer: Pick<Dealer, "id" | "sessionVersion">) {
  const exp = Date.now() + DAYS * 86_400_000;
  const payload = `${dealer.id}.${dealer.sessionVersion ?? 0}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DAYS * 86_400,
  });
}

export async function endDealerSession() {
  (await cookies()).delete(COOKIE);
}
