import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { type Influencer, getInfluencer } from "./influencers";

/**
 * Anmeldung für freigegebene Influencer: signiertes, httpOnly-Cookie (30 Tage) mit ID, Sitzungsversion und Ablaufzeit.
 * Die Version im Datensatz entscheidet, ob es noch gilt (wird bei Sperre oder neuem Passwort erhöht).
 */
const COOKIE = "tt_influencer";
const DAYS = 30;

function secret() {
  return process.env.SESSION_SECRET || createHash("sha256").update(`tt-influencer:${process.env.ADMIN_PASSWORD ?? ""}`).digest("hex");
}
const sign = (payload: string) => createHmac("sha256", secret()).update(`influencer.${payload}`).digest("base64url");
const safeEqual = (a: string, b: string) => timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());

export async function getCurrentInfluencer(): Promise<Influencer | null> {
  const value = (await cookies()).get(COOKIE)?.value;
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const [id, version, exp, sig] = parts;
  if (!/^[0-9a-f]{16}$/.test(id) || Number(exp) < Date.now() || !safeEqual(sig, sign(`${id}.${version}.${exp}`))) return null;
  const inf = await getInfluencer(id);
  if (!inf || inf.status !== "freigegeben" || !inf.passwordHash || String(inf.sessionVersion ?? 0) !== version) return null;
  return inf;
}

export async function requireInfluencer(): Promise<Influencer> {
  const inf = await getCurrentInfluencer();
  if (!inf) redirect("/influencer/login");
  return inf;
}

export async function startInfluencerSession(inf: Pick<Influencer, "id" | "sessionVersion">) {
  const exp = Date.now() + DAYS * 86_400_000;
  const payload = `${inf.id}.${inf.sessionVersion ?? 0}.${exp}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: DAYS * 86_400,
  });
}

export async function endInfluencerSession() {
  (await cookies()).delete(COOKIE);
}
