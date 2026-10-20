/**
 * Automatische Tests der Admin-Sicherheit (Passwort, 2FA/TOTP, Wiederherstellungscodes, Begrenzung, Sitzungen).
 * Laufen ohne Netz und ohne echte Datenbank: Speicher im Arbeitsspeicher, Uhr steuerbar.  →  npm test
 */
import assert from "node:assert/strict";
import { beforeEach, describe, test } from "node:test";

process.env.ADMIN_PASSWORD = "richtig-langes-passwort";
process.env.ADMIN_2FA_KEY = "test-schluessel-test-schluessel-test-schluessel-1234";
process.env.SESSION_SECRET = "test-session-secret-test-session-secret-0000";
delete process.env.ADMIN_REQUIRE_2FA;
delete process.env.VERCEL;

const { memoryBackend, setKvBackend } = await import("../lib/kv");
const { setClock } = await import("../lib/admin-security/clock");
const totpMod = await import("../lib/admin-security/totp");
const cryptoMod = await import("../lib/admin-security/crypto");
const { hitLimit } = await import("../lib/admin-security/rate-limit");
const sessions = await import("../lib/admin-security/sessions");
const twofa = await import("../lib/admin-security/two-factor");
const flow = await import("../lib/admin-security/flow");
const { listSecurityEvents } = await import("../lib/admin-security/audit");
const { clientIp } = await import("../lib/admin-security/request-info");

let t = Date.UTC(2026, 9, 19, 12, 0, 0);
const advance = (sec: number) => {
  t += sec * 1000;
};
const O = { ip: "203.0.113.7", ua: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) Chrome/130.0" };
const PW = "richtig-langes-passwort";

beforeEach(() => {
  t = Date.UTC(2026, 9, 19, 12, 0, 0);
  setClock(() => t);
  setKvBackend(memoryBackend(() => t));
  delete process.env.ADMIN_REQUIRE_2FA;
});

/** 2FA vollständig einrichten und das Geheimnis zurückgeben */
async function enable2fa() {
  const setupSession = await sessions.createSession("full", O);
  const { secret } = await twofa.startSetup(setupSession.session.id, "Dashboard");
  const r = await twofa.confirmSetup(setupSession.session.id, totpMod.totp(secret, t));
  assert.ok(r.ok);
  advance(31); // nächster Zeitschritt, damit der Einrichtungscode nicht erneut benutzt wird
  return { secret, recoveryCodes: (r as { recoveryCodes: string[] }).recoveryCodes };
}

describe("TOTP (RFC 6238)", () => {
  const secret = totpMod.base32Encode(Buffer.from("12345678901234567890"));
  test("Prüfwerte aus RFC 6238 (letzte 6 Ziffern)", () => {
    assert.equal(totpMod.totp(secret, 59_000), "287082");
    assert.equal(totpMod.totp(secret, 1_111_111_109_000), "081804");
    assert.equal(totpMod.totp(secret, 1_234_567_890_000), "005924");
  });
  test("richtiger Code und ±1 Zeitschritt werden akzeptiert", () => {
    const now = 1_700_000_000_000;
    assert.notEqual(totpMod.verifyTotp(secret, totpMod.totp(secret, now), now), null);
    assert.notEqual(totpMod.verifyTotp(secret, totpMod.totp(secret, now - 30_000), now), null);
    assert.notEqual(totpMod.verifyTotp(secret, totpMod.totp(secret, now + 30_000), now), null);
  });
  test("abgelaufener Code (2 Schritte alt), falscher und fehlender Code werden abgelehnt", () => {
    const now = 1_700_000_000_000;
    assert.equal(totpMod.verifyTotp(secret, totpMod.totp(secret, now - 90_000), now), null);
    const right = totpMod.totp(secret, now);
    const wrong = String((Number(right) + 1) % 1_000_000).padStart(6, "0");
    assert.equal(totpMod.verifyTotp(secret, wrong, now), null);
    assert.equal(totpMod.verifyTotp(secret, "", now), null);
    assert.equal(totpMod.verifyTotp(secret, "12ab56", now), null);
  });
  test("Base32 hin und zurück", () => {
    const buf = Buffer.from([0, 1, 2, 250, 255, 7, 99]);
    assert.deepEqual(totpMod.base32Decode(totpMod.base32Encode(buf)), buf);
  });
});

describe("Verschlüsselung des 2FA-Geheimnisses", () => {
  test("hin und zurück, Klartext nicht im Ergebnis", () => {
    const box = cryptoMod.encryptSecret("GEHEIMNIS123");
    assert.ok(!box.includes("GEHEIMNIS123"));
    assert.equal(cryptoMod.decryptSecret(box), "GEHEIMNIS123");
  });
  test("manipulierte Daten oder anderer Schlüssel werden erkannt", () => {
    const box = cryptoMod.encryptSecret("GEHEIMNIS123");
    const parts = box.split(".");
    parts[3] = `${parts[3].slice(0, -2)}AA`;
    assert.throws(() => cryptoMod.decryptSecret(parts.join(".")));
    const key = process.env.ADMIN_2FA_KEY;
    process.env.ADMIN_2FA_KEY = "ein-ganz-anderer-schluessel-mit-genug-zeichen-xx";
    assert.throws(() => cryptoMod.decryptSecret(box));
    process.env.ADMIN_2FA_KEY = key;
  });
});

describe("Anmeldung mit Passwort", () => {
  test("richtiges Passwort ohne 2FA → volle Sitzung", async () => {
    const r = await flow.passwordStep(PW, O);
    assert.ok(r.ok && r.next === "admin");
    const s = await sessions.readSession(r.ok ? r.token : "");
    assert.equal(s?.stage, "full");
  });
  test("falsches Passwort → einheitlicher Fehler, keine Sitzung, protokolliert ohne Passwort", async () => {
    const r = await flow.passwordStep("falsch", O);
    assert.deepEqual(r, { ok: false, error: "invalid" });
    const events = await listSecurityEvents();
    assert.equal(events[0].type, "login_failed");
    assert.ok(!JSON.stringify(events).includes("falsch"));
    assert.equal(events[0].ip, "203.0.113.x");
  });
  test("Begrenzung: nach 10 Versuchen je IP gesperrt – auch mit richtigem Passwort", async () => {
    for (let i = 0; i < 10; i++) await flow.passwordStep("falsch", O);
    const r = await flow.passwordStep(PW, O);
    assert.equal(r.ok, false);
    assert.equal(!r.ok && r.error, "rate_limited");
    // andere IP ist nicht betroffen
    assert.ok((await flow.passwordStep(PW, { ...O, ip: "198.51.100.1" })).ok);
    // nach Ablauf des Zeitfensters wieder möglich
    advance(15 * 60 + 1);
    assert.ok((await flow.passwordStep(PW, O)).ok);
  });
  test("gesamte Begrenzung greift auch bei wechselnden IPs (verteilter Angriff)", async () => {
    for (let i = 0; i < 50; i++) await flow.passwordStep("falsch", { ...O, ip: `10.0.${Math.floor(i / 9)}.${i % 9}` });
    const r = await flow.passwordStep(PW, { ...O, ip: "10.9.9.9" });
    assert.equal(!r.ok && r.error, "rate_limited");
  });
  test("Zähler ist atomar: 30 gleichzeitige Versuche ergeben genau 30", async () => {
    await Promise.all(Array.from({ length: 30 }, () => hitLimit("loginIp", "x")));
    assert.equal((await hitLimit("loginIp", "x")).count, 31);
  });
});

describe("Zwei-Faktor-Anmeldung", () => {
  test("nach dem Passwort nur Zwischenschritt – kein Dashboard-Zugriff", async () => {
    await enable2fa();
    const r = await flow.passwordStep(PW, O);
    assert.ok(r.ok && r.next === "2fa");
    const s = await sessions.readSession(r.ok ? r.token : "");
    assert.equal(s?.stage, "2fa");
    assert.equal(await sessions.listSessions().then((l) => l.some((x) => x.id === s?.id)), false);
  });
  test("falscher, fehlender und abgelaufener Code werden abgelehnt", async () => {
    const { secret } = await enable2fa();
    const p = await flow.passwordStep(PW, O);
    const token = p.ok ? p.token : "";
    assert.deepEqual(await flow.secondFactorStep(token, "000000", "totp", O), { ok: false, error: "invalid" });
    assert.deepEqual(await flow.secondFactorStep(token, "", "totp", O), { ok: false, error: "invalid" });
    const old = totpMod.totp(secret, t - 90_000);
    assert.deepEqual(await flow.secondFactorStep(token, old, "totp", O), { ok: false, error: "invalid" });
  });
  test("richtiger Code → neue Sitzung (neue ID, Zwischen-Sitzung ungültig)", async () => {
    const { secret } = await enable2fa();
    const p = await flow.passwordStep(PW, O);
    const pending = p.ok ? p.token : "";
    const r = await flow.secondFactorStep(pending, totpMod.totp(secret, t), "totp", O);
    assert.ok(r.ok);
    assert.notEqual(r.ok && r.token, pending);
    assert.equal(await sessions.readSession(pending), null);
    assert.equal((await sessions.readSession(r.ok ? r.token : ""))?.stage, "full");
  });
  test("derselbe Code kann nicht zweimal benutzt werden (Wiederverwendung)", async () => {
    const { secret } = await enable2fa();
    const code = totpMod.totp(secret, t);
    const a = await flow.passwordStep(PW, O);
    assert.ok((await flow.secondFactorStep(a.ok ? a.token : "", code, "totp", O)).ok);
    const b = await flow.passwordStep(PW, O);
    assert.deepEqual(await flow.secondFactorStep(b.ok ? b.token : "", code, "totp", O), { ok: false, error: "invalid" });
  });
  test("Begrenzung: nach 5 Fehlversuchen wird der Anmeldevorgang beendet", async () => {
    const { secret } = await enable2fa();
    const p = await flow.passwordStep(PW, O);
    const token = p.ok ? p.token : "";
    for (let i = 0; i < 5; i++) await flow.secondFactorStep(token, "000000", "totp", O);
    const r = await flow.secondFactorStep(token, totpMod.totp(secret, t), "totp", O);
    assert.equal(!r.ok && r.error, "rate_limited");
    assert.equal(await sessions.readSession(token), null);
  });
  test("Zwischenschritt läuft nach 10 Minuten ab", async () => {
    const { secret } = await enable2fa();
    const p = await flow.passwordStep(PW, O);
    advance(10 * 60 + 1);
    const r = await flow.secondFactorStep(p.ok ? p.token : "", totpMod.totp(secret, t), "totp", O);
    assert.deepEqual(r, { ok: false, error: "expired" });
  });
  test("ohne Passwort-Schritt kein zweiter Schritt (Umgehung)", async () => {
    const { secret } = await enable2fa();
    const full = await sessions.createSession("full", O);
    assert.deepEqual(await flow.secondFactorStep(undefined, totpMod.totp(secret, t), "totp", O), { ok: false, error: "expired" });
    assert.deepEqual(await flow.secondFactorStep(full.token, totpMod.totp(secret, t), "totp", O), { ok: false, error: "expired" });
  });
  test("Wiederherstellungscode funktioniert genau einmal", async () => {
    const { recoveryCodes } = await enable2fa();
    assert.equal(recoveryCodes.length, 10);
    const a = await flow.passwordStep(PW, O);
    assert.ok((await flow.secondFactorStep(a.ok ? a.token : "", recoveryCodes[0].toLowerCase(), "recovery", O)).ok);
    const b = await flow.passwordStep(PW, O);
    assert.deepEqual(await flow.secondFactorStep(b.ok ? b.token : "", recoveryCodes[0], "recovery", O), { ok: false, error: "invalid" });
    assert.equal((await twofa.twoFactorStatus()).recoveryLeft, 9);
  });
  test("Wiederherstellungscodes und Geheimnis liegen nicht im Klartext im Speicher", async () => {
    const backend = memoryBackend(() => t);
    setKvBackend(backend);
    const { secret, recoveryCodes } = await enable2fa();
    const stored = JSON.stringify([await backend.get("tt:adm:2fa"), await backend.smembers("tt:adm:2fa:recovery")]);
    assert.ok(!stored.includes(secret));
    for (const c of recoveryCodes) assert.ok(!stored.includes(c) && !stored.includes(c.replace("-", "")));
  });
  test("Einrichtung abschließen beendet alle anderen Sitzungen", async () => {
    const other = await sessions.createSession("full", { ...O, ip: "198.51.100.9" });
    const me = await sessions.createSession("full", O);
    const { secret } = await twofa.startSetup(me.session.id, "Dashboard");
    const r = await flow.finishSetupStep(me.session, totpMod.totp(secret, t), O);
    assert.ok(r.ok);
    assert.equal(await sessions.readSession(other.token), null);
    assert.equal(await sessions.readSession(me.token), null);
    assert.equal((await sessions.readSession(r.ok ? r.token : ""))?.stage, "full");
  });
  test("ADMIN_REQUIRE_2FA: ohne 2FA nach dem Passwort nur die Einrichtung", async () => {
    process.env.ADMIN_REQUIRE_2FA = "1";
    const r = await flow.passwordStep(PW, O);
    assert.ok(r.ok && r.next === "setup");
    assert.equal((await sessions.readSession(r.ok ? r.token : ""))?.stage, "setup");
    const key = process.env.ADMIN_2FA_KEY;
    delete process.env.ADMIN_2FA_KEY;
    assert.deepEqual(await flow.passwordStep(PW, O), { ok: false, error: "setup_unavailable" });
    process.env.ADMIN_2FA_KEY = key;
  });
});

describe("Sitzungen", () => {
  test("Ablauf nach 2 Stunden Inaktivität", async () => {
    const { token } = await sessions.createSession("full", O);
    advance(2 * 3600 + 1);
    assert.equal(await sessions.readSession(token), null);
  });
  test("Aktivität verlängert – aber nie über 12 Stunden", async () => {
    const { token } = await sessions.createSession("full", O);
    for (let h = 0; h < 11; h++) {
      advance(3600);
      const s = await sessions.readSession(token);
      assert.ok(s, `nach ${h + 1} h noch gültig`);
      await sessions.touchSession(s);
    }
    advance(3601);
    assert.equal(await sessions.readSession(token), null);
  });
  test("Abmelden macht das Cookie wertlos", async () => {
    const { token } = await sessions.createSession("full", O);
    await flow.logoutStep(token, O);
    assert.equal(await sessions.readSession(token), null);
  });
  test("einzelne und alle Sitzungen widerrufen", async () => {
    const a = await sessions.createSession("full", O);
    const b = await sessions.createSession("full", O);
    const c = await sessions.createSession("full", O);
    await sessions.revokeSession(a.session.id);
    assert.equal(await sessions.readSession(a.token), null);
    assert.equal(await sessions.revokeAllSessions(c.session.id), 1);
    assert.equal(await sessions.readSession(b.token), null);
    assert.ok(await sessions.readSession(c.token));
    assert.equal((await sessions.listSessions()).length, 1);
  });
  test("Passwortänderung beendet bestehende Sitzungen", async () => {
    const { token } = await sessions.createSession("full", O);
    process.env.ADMIN_PASSWORD = "ein-neues-passwort-123";
    assert.equal(await sessions.readSession(token), null);
    process.env.ADMIN_PASSWORD = PW;
  });
  test("ungültige, erfundene oder fehlende Cookies → nicht angemeldet", async () => {
    assert.equal(await sessions.readSession(undefined), null);
    assert.equal(await sessions.readSession("abc"), null);
    assert.equal(await sessions.readSession("A".repeat(43)), null);
    // altes Cookie-Format (exp.signatur) gilt nicht mehr
    assert.equal(await sessions.readSession(`${Date.now() + 1e6}.c2lnbmF0dXI`), null);
  });
});

describe("Herkunft (IP)", () => {
  test("außerhalb von Vercel wird keinem Header vertraut", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4", "x-real-ip": "1.2.3.4" });
    assert.equal(clientIp(h), "local");
  });
  test("auf Vercel zählt die von Vercel gesetzte x-real-ip, nicht frei gewählte Header", () => {
    process.env.VERCEL = "1";
    assert.equal(clientIp(new Headers({ "x-real-ip": "203.0.113.5", "x-forwarded-for": "6.6.6.6", "x-client-ip": "7.7.7.7" })), "203.0.113.5");
    assert.equal(clientIp(new Headers({ "x-real-ip": "<script>" })), "unknown");
    delete process.env.VERCEL;
  });
});
