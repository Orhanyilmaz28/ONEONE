/**
 * Integrationstest gegen einen echten Redis (über die Upstash-REST-Schnittstelle).
 * Läuft nur, wenn REDIS_TEST_URL und REDIS_TEST_TOKEN gesetzt sind – NIE gegen die Produktivdatenbank richten
 * (der Test löscht seine eigenen Schlüssel mit Präfix „tt:test:“ und legt Admin-Testdaten an).
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

const url = process.env.REDIS_TEST_URL;
const token = process.env.REDIS_TEST_TOKEN;
const skip = !url || !token ? "REDIS_TEST_URL/REDIS_TEST_TOKEN nicht gesetzt" : false;

if (!skip) {
  process.env.UPSTASH_REDIS_REST_URL = url;
  process.env.UPSTASH_REDIS_REST_TOKEN = token;
  process.env.ADMIN_PASSWORD = "richtig-langes-passwort";
  process.env.ADMIN_2FA_KEY = "test-schluessel-test-schluessel-test-schluessel-1234";
  process.env.SESSION_SECRET = "test-session-secret-test-session-secret-0000";
}

const { kv } = await import("../lib/kv");
const k = (s: string) => `tt:test:${s}`;

describe("echter Redis", { skip }, () => {
  test("Zähler mit Ablauf ist atomar (50 gleichzeitige Aufrufe)", async () => {
    await kv().del(k("rl"));
    const results = await Promise.all(Array.from({ length: 50 }, () => kv().incrWindow(k("rl"), 60)));
    assert.deepEqual(
      results.map((r) => r.count).sort((a, b) => a - b),
      Array.from({ length: 50 }, (_, i) => i + 1),
    );
    const ttl = (await kv().incrWindow(k("rl"), 60)).ttl;
    assert.ok(ttl > 0 && ttl <= 60, `TTL ${ttl}`);
  });
  test("Ablauf in Redis: Zähler beginnt nach dem Zeitfenster neu", async () => {
    await kv().del(k("rl2"));
    await kv().incrWindow(k("rl2"), 1);
    await kv().incrWindow(k("rl2"), 1);
    await new Promise((r) => setTimeout(r, 1300));
    assert.equal((await kv().incrWindow(k("rl2"), 1)).count, 1);
  });
  test("setIfGreater verhindert Wiederverwendung (auch gleichzeitig)", async () => {
    await kv().del(k("last"));
    assert.equal(await kv().setIfGreater(k("last"), 100), true);
    const same = await Promise.all(Array.from({ length: 10 }, () => kv().setIfGreater(k("last"), 101)));
    assert.equal(same.filter(Boolean).length, 1);
    assert.equal(await kv().setIfGreater(k("last"), 99), false);
  });
  test("SREM ist einmalig – parallel eingelöster Code klappt genau einmal", async () => {
    await kv().del(k("codes"));
    await kv().sadd(k("codes"), "a", "b");
    const r = await Promise.all(Array.from({ length: 10 }, () => kv().srem(k("codes"), "a")));
    assert.equal(r.reduce((n, x) => n + x, 0), 1);
    assert.deepEqual(await kv().smembers(k("codes")), ["b"]);
  });
  test("SET mit EX/NX, MGET, Liste mit Kürzung", async () => {
    await kv().del(k("x"), k("y"), k("list"));
    assert.equal(await kv().set(k("x"), "1", { ex: 30, nx: true }), true);
    assert.equal(await kv().set(k("x"), "2", { nx: true }), false);
    assert.deepEqual(await kv().mget(k("x"), k("y")), ["1", null]);
    for (let i = 0; i < 7; i++) await kv().lpushTrim(k("list"), String(i), 5);
    assert.deepEqual(await kv().lrange(k("list"), 0, -1), ["6", "5", "4", "3", "2"]);
    await kv().del(k("x"), k("list"), k("codes"), k("last"), k("rl"), k("rl2"));
  });
  test("kompletter Ablauf: Passwort → 2FA einrichten → Anmeldung mit TOTP → Abmelden", async () => {
    const sessions = await import("../lib/admin-security/sessions");
    const twofa = await import("../lib/admin-security/two-factor");
    const flow = await import("../lib/admin-security/flow");
    const { totp } = await import("../lib/admin-security/totp");
    const O = { ip: "local", ua: "integration-test" };
    await kv().del("tt:adm:2fa", "tt:adm:2fa:last", "tt:adm:2fa:recovery", "tt:adm:sessions");
    // Zähler früherer Testläufe entfernen – sonst greift (richtigerweise) die Login-Sperre nach mehreren Läufen
    const call = (cmd: string[]) =>
      fetch(url as string, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) }).then((r) => r.json() as Promise<{ result: string[] }>);
    const counters = (await call(["KEYS", "tt:adm:rl:*"])).result;
    if (counters.length) await kv().del(...counters);
    const first = await flow.passwordStep("richtig-langes-passwort", O);
    assert.ok(first.ok && first.next === "admin");
    const me = await sessions.readSession(first.ok ? first.token : "");
    assert.ok(me);
    const { secret } = await twofa.startSetup(me.id, "Dashboard");
    const done = await flow.finishSetupStep(me, totp(secret, Date.now()), O);
    assert.ok(done.ok);
    await new Promise((r) => setTimeout(r, 30_500 - (Date.now() % 30_000)));
    const p = await flow.passwordStep("richtig-langes-passwort", O);
    assert.ok(p.ok && p.next === "2fa");
    const full = await flow.secondFactorStep(p.ok ? p.token : "", totp(secret, Date.now()), "totp", O);
    assert.ok(full.ok);
    await flow.logoutStep(full.ok ? full.token : "", O);
    assert.equal(await sessions.readSession(full.ok ? full.token : ""), null);
    await twofa.disableTwoFactor();
  });
});
