/**
 * Phase 2B – Datensicherung, Verschlüsselung, Wiederherstellung, Überwachung (ohne echte Datenbank).
 * Redis wird im Arbeitsspeicher nachgebaut (tests/helpers/fake-redis.mts), Sicherungen landen im Arbeitsspeicher.
 */
import assert from "node:assert/strict";
import http from "node:http";
import { beforeEach, describe, test } from "node:test";

process.env.BACKUP_ENCRYPTION_KEY = "test-backup-key-0123456789-abcdefghijklmnop";
delete process.env.BACKUP_ENCRYPTION_KEY_PREVIOUS;
delete process.env.UPSTASH_REDIS_REST_URL;
delete process.env.UPSTASH_REDIS_REST_TOKEN;
delete process.env.KV_REST_API_URL;
delete process.env.KV_REST_API_TOKEN;
delete process.env.BACKUP_CRON_ENABLED;
delete process.env.ALERT_EMAILS_ENABLED;
process.env.MONITOR_PERSIST = "0";

const { fakeRedis } = await import("./helpers/fake-redis.mts");
const crypto = await import("../lib/backup/crypto");
const format = await import("../lib/backup/format");
const service = await import("../lib/backup/service");
const restore = await import("../lib/backup/restore");
const { memoryStorage } = await import("../lib/backup/storage");
const { memoryOps, resetMemoryOps } = await import("../lib/backup/ops");
const { decideRetention, isoWeek } = await import("../lib/backup/retention");
const { classifyKey } = await import("../lib/backup/keys");
const { signV4, s3Client } = await import("../lib/backup/s3");
const { cronAuthorized, handleCron } = await import("../lib/backup/cron");
const { createLockResolver, parseSiteLock } = await import("../lib/site-lock");
const signal = await import("../lib/monitoring/signal");
const alerts = await import("../lib/monitoring/alerts");
const { KEYS } = await import("../lib/store");

type Fake = ReturnType<typeof fakeRedis>;

/** Shop-ähnlicher Datenbestand inkl. temporärer und sicherheitskritischer Schlüssel */
function seed(r: Fake) {
  const json = (k: string, v: unknown, ver: number) => {
    r.put(k, JSON.stringify(v));
    r.put(`tt:ver:${k}`, String(ver));
  };
  json(KEYS.orders, { "o-1": { status: "versandt", kunde: "Jürgen Müller" } }, 4);
  json(KEYS.dealers, [{ id: "d1", firma: "Kiosk Öztürk", nachweis: "proof-abc" }], 2);
  json(KEYS.dealerOrders, { seq: 7, orders: [{ nr: "H-0007" }] }, 9);
  json(KEYS.commissions, { "cs_1": { cent: 120 } }, 3);
  json(KEYS.newsletter, [{ email: "a@example.invalid", consentAt: "2026-10-01T10:00:00Z" }], 1);
  json(KEYS.settings, { shopName: "EXSTASE" }, 5);
  r.put(KEYS.reviews, JSON.stringify([{ stars: 5 }])); // ohne Versionszähler (vor Phase 2A gespeichert)
  r.put("tt:media:img-1", Buffer.from("bild-1").toString("base64"));
  r.put("tt:media:proof-abc", Buffer.from("gewerbenachweis").toString("base64"));
  r.data.set("tt:once:order-mail:customer:o-1", { t: "string", v: "1", exp: Date.now() + 3600_000 });
  r.data.set("tt:adm:audit", { t: "list", v: ['{"type":"login_success"}', '{"type":"logout"}'] });
  r.data.set("tt:unbekannt:hash", { t: "hash", v: new Map([["a", "1"]]) });
  // darf NICHT gesichert werden:
  r.put("tt:adm:s:abc123", JSON.stringify({ stage: "full" }));
  r.data.set("tt:adm:sessions", { t: "set", v: new Set(["abc123"]) });
  r.put("tt:adm:rl:loginIp:xyz", "3");
  r.put("tt:adm:2fa", JSON.stringify({ secret: "v1.x.y.z" }));
  r.data.set("tt:adm:2fa:recovery", { t: "set", v: new Set(["h1", "h2"]) });
  r.put("tt:backup:lock", "fremd-alt");
  r.data.delete("tt:backup:lock");
  r.put("tt:monitor:events", "x");
}

function deps(r: Fake | null, storage = memoryStorage()) {
  return { source: r ? ({ kind: "redis", redis: r } as const) : null, storage, ops: memoryOps(), alerts: null };
}

async function payloadOf(storage: ReturnType<typeof memoryStorage>, id: string) {
  const file = await storage.get(service.dataName(id));
  assert.ok(file);
  return format.parsePayload(crypto.decryptBackup(file).plain);
}

beforeEach(() => {
  resetMemoryOps();
  process.env.BACKUP_ENCRYPTION_KEY = "test-backup-key-0123456789-abcdefghijklmnop";
  delete process.env.BACKUP_ENCRYPTION_KEY_PREVIOUS;
  delete process.env.BACKUP_RESTORE_TEST_KEEP;
});

describe("Datenanalyse: welche Schlüssel werden gesichert?", () => {
  test("Geschäftsdaten, Medien, Versionszähler rein – Sitzungen, Rate-Limits, 2FA raus", () => {
    for (const k of [KEYS.orders, KEYS.customers, KEYS.influencers, KEYS.commissions, "tt:ver:tt:orders", "tt:media:x", "tt:media:proof-1", "tt:once:a", "tt:adm:audit", "tt:neu"]) assert.equal(classifyKey(k).include, true, k);
    for (const k of ["tt:adm:s:1", "tt:adm:sessions", "tt:adm:rl:x:y", "tt:adm:2fa", "tt:adm:2fa:last", "tt:adm:2fa:recovery", "tt:adm:2fa:setup:1", "tt:backup:lock", "tt:monitor:events", "tt:restore-test:marker", "tt:test:x", "tt:ver:tt:test:x"]) assert.equal(classifyKey(k).include, false, k);
  });
});

describe("Sicherung erstellen", () => {
  test("vollständiger Export: alle Daten, Typen und Laufzeiten; Ausschlüsse dokumentiert", async () => {
    const r = fakeRedis();
    seed(r);
    const d = deps(r);
    const res = await service.runBackup(d, "manual");
    assert.ok(res.ok, res.ok ? "" : res.error);
    const p = await payloadOf(d.storage, res.meta.id);
    const keys = p.entries.map((e) => e.k);
    for (const k of [KEYS.orders, `tt:ver:${KEYS.orders}`, KEYS.dealers, KEYS.dealerOrders, KEYS.commissions, KEYS.newsletter, KEYS.settings, KEYS.reviews, "tt:media:img-1", "tt:media:proof-abc", "tt:once:order-mail:customer:o-1", "tt:adm:audit", "tt:unbekannt:hash"]) assert.ok(keys.includes(k), `fehlt: ${k}`);
    for (const k of ["tt:adm:s:abc123", "tt:adm:sessions", "tt:adm:rl:loginIp:xyz", "tt:adm:2fa", "tt:adm:2fa:recovery", "tt:monitor:events"]) assert.ok(!keys.includes(k), `darf nicht drin sein: ${k}`);
    assert.equal(p.entries.find((e) => e.k === KEYS.orders)?.v, JSON.stringify({ "o-1": { status: "versandt", kunde: "Jürgen Müller" } }));
    assert.equal(p.entries.find((e) => e.k === `tt:ver:${KEYS.dealerOrders}`)?.v, "9");
    assert.equal(p.entries.find((e) => e.k === KEYS.reviews)?.t, "string");
    assert.equal(keys.includes(`tt:ver:${KEYS.reviews}`), false);
    assert.deepEqual(p.entries.find((e) => e.k === "tt:adm:audit")?.v, ['{"type":"login_success"}', '{"type":"logout"}']);
    assert.ok((p.entries.find((e) => e.k === "tt:once:order-mail:customer:o-1")?.ttl ?? 0) > 3_000_000);
    assert.ok(p.excluded.some((e) => e.category === "Admin-Sitzungen" && e.count === 2));
    assert.ok(p.excluded.some((e) => e.category.startsWith("2FA")));
    assert.equal(res.meta.entries, p.manifest.count);
    assert.equal(res.meta.status, "complete");
  });

  test("Datei enthält keine Klartextdaten", async () => {
    const r = fakeRedis();
    seed(r);
    const d = deps(r);
    const res = await service.runBackup(d, "manual");
    assert.ok(res.ok);
    const file = (await d.storage.get(service.dataName(res.meta.id))) as Buffer;
    for (const s of ["Jürgen", "Müller", "a@example.invalid", "Öztürk", "tt:orders", "gewerbenachweis"]) assert.equal(file.includes(Buffer.from(s)), false, s);
    const meta = (await d.storage.get(service.metaName(res.meta.id))) as Buffer;
    assert.equal(meta.includes(Buffer.from("example.invalid")), false);
  });

  test("beschädigter Datensatz verhindert die Sicherung nicht – wird unverändert gesichert und gemeldet", async () => {
    const r = fakeRedis();
    seed(r);
    r.put(KEYS.customers, "{kaputt");
    const d = deps(r);
    const res = await service.runBackup(d, "manual");
    assert.ok(res.ok);
    assert.equal((await payloadOf(d.storage, res.meta.id)).entries.find((e) => e.k === KEYS.customers)?.v, "{kaputt");
    assert.match(res.meta.warnings?.[0] ?? "", /tt:customers/);
    assert.ok(signal.recentIncidents().some((i) => i.type === "data_corrupt"));
  });

  test("Sicherung ohne Geschäftsdaten → deutliche Warnung + Störungsmeldung, kein Lebenszeichen", async () => {
    const r = fakeRedis();
    r.put("tt:media:img-1", Buffer.from("bild").toString("base64"));
    const d = deps(r);
    let pinged = 0;
    const realFetch = globalThis.fetch;
    process.env.BACKUP_HEARTBEAT_URL = "https://hc.example.invalid/ping/abc";
    globalThis.fetch = (async () => {
      pinged++;
      return new Response("ok");
    }) as typeof fetch;
    try {
      const empty = await service.runBackup(d, "manual");
      assert.ok(empty.ok);
      assert.equal(empty.meta.businessKeys, 0);
      assert.match(empty.meta.warnings?.[0] ?? "", /KEINE Geschäftsdaten/);
      assert.ok(signal.recentIncidents().some((i) => i.type === "backup_failed" && /ohne Geschäftsdaten/.test(i.detail ?? "")));
      assert.equal(pinged, 0, "leere Sicherung sendet kein Lebenszeichen");
      assert.equal((await d.ops.getState()).lastSuccessAt, undefined, "leere Sicherung zählt nicht als Erfolg");
      seed(r);
      const full = await service.runBackup(d, "manual");
      assert.ok(full.ok);
      assert.ok((full.meta.businessKeys ?? 0) >= 6);
      assert.equal(full.meta.warnings, undefined);
      assert.equal(pinged, 1, "erfolgreiche Sicherung sendet ein Lebenszeichen");
    } finally {
      globalThis.fetch = realFetch;
      delete process.env.BACKUP_HEARTBEAT_URL;
    }
  });

  test("Lebenszeichen: nur https, Fehler werden geschluckt", async () => {
    assert.equal(await service.pingHeartbeat(undefined), false);
    assert.equal(await service.pingHeartbeat("http://unsicher.example.invalid"), false);
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    try {
      assert.equal(await service.pingHeartbeat("https://hc.example.invalid/x"), false);
    } finally {
      globalThis.fetch = realFetch;
    }
  });

  test("ohne Backup-Schlüssel: keine Sicherung, Fehler protokolliert", async () => {
    delete process.env.BACKUP_ENCRYPTION_KEY;
    const r = fakeRedis();
    seed(r);
    const d = deps(r);
    const res = await service.runBackup(d, "manual");
    assert.equal(res.ok, false);
    assert.equal(d.storage.files.size, 0);
    assert.equal((await d.ops.readLog(5))[0].ok, false);
  });
});

describe("Verschlüsselung", () => {
  const meta = { id: "2026-10-19T03-00-00Z-abcdef", createdAt: "2026-10-19T03:00:00.000Z" };
  test("Ver- und Entschlüsseln; jede Datei mit eigenem Salz und eigener Nonce", () => {
    const a = crypto.encryptBackup(Buffer.from("geheim"), meta);
    const b = crypto.encryptBackup(Buffer.from("geheim"), meta);
    assert.notDeepEqual(a, b);
    assert.notEqual(crypto.readHeader(a).header.iv, crypto.readHeader(b).header.iv);
    assert.notEqual(crypto.readHeader(a).header.salt, crypto.readHeader(b).header.salt);
    assert.equal(crypto.decryptBackup(a).plain.toString(), "geheim");
  });
  test("falscher Schlüssel → Fehler; alter Schlüssel als _PREVIOUS lesbar", () => {
    const file = crypto.encryptBackup(Buffer.from("daten"), meta);
    const old = process.env.BACKUP_ENCRYPTION_KEY as string;
    process.env.BACKUP_ENCRYPTION_KEY = "ein-ganz-anderer-schluessel-0000000000000000";
    assert.throws(() => crypto.decryptBackup(file), crypto.BackupDecryptError);
    process.env.BACKUP_ENCRYPTION_KEY_PREVIOUS = old;
    assert.equal(crypto.decryptBackup(file).plain.toString(), "daten");
  });
  test("zu kurzer Schlüssel wird abgelehnt", () => {
    process.env.BACKUP_ENCRYPTION_KEY = "zu-kurz";
    assert.equal(crypto.backupKeyConfigured(), false);
    assert.throws(() => crypto.encryptBackup(Buffer.from("x"), meta), crypto.BackupKeyMissingError);
  });
  test("manipulierte Daten, manipulierter Kopf, abgeschnittene Datei → Fehler", () => {
    const file = crypto.encryptBackup(Buffer.from("x".repeat(1000)), meta);
    const body = Buffer.from(file);
    body[body.length - 30] ^= 1;
    assert.throws(() => crypto.decryptBackup(body), crypto.BackupDecryptError);
    const head = Buffer.from(file.toString("latin1").replace("2026-10-19T03:00:00.000Z", "2026-10-19T04:00:00.000Z"), "latin1");
    assert.throws(() => crypto.decryptBackup(head), crypto.BackupDecryptError);
    assert.throws(() => crypto.decryptBackup(file.subarray(0, file.length - 5)), crypto.BackupDecryptError);
    assert.throws(() => crypto.decryptBackup(Buffer.from("kein backup")), crypto.BackupDecryptError);
  });
});

describe("Integritätsprüfung", () => {
  test("unveränderte Sicherung besteht; manipulierte Datei fällt durch", async () => {
    const r = fakeRedis();
    seed(r);
    const d = deps(r);
    const res = await service.runBackup(d, "manual");
    assert.ok(res.ok);
    assert.equal((await service.verifyBackup(d.storage, res.meta.id)).ok, true);
    const f = d.storage.files.get(service.dataName(res.meta.id)) as Buffer;
    f[f.length - 20] ^= 0xff;
    const bad = await service.verifyBackup(d.storage, res.meta.id);
    assert.equal(bad.ok, false);
    assert.equal(bad.steps.at(-1)?.label, "Prüfsumme der Datei");
  });
  test("korrekt verschlüsselt, aber Inhalt verändert (Eintrag entfernt) → Manifest-Fehler", async () => {
    const r = fakeRedis();
    seed(r);
    const d = deps(r);
    const res = await service.runBackup(d, "manual");
    assert.ok(res.ok);
    const p = await payloadOf(d.storage, res.meta.id);
    p.entries.pop();
    assert.throws(() => format.validatePayload(p), format.BackupFormatError);
    const q = await payloadOf(d.storage, res.meta.id);
    const e = q.entries.find((x) => x.t === "string");
    assert.ok(e);
    e.v = "verändert";
    assert.throws(() => format.validatePayload(q), /Prüfsumme/);
  });
  test("unvollständige Sicherungen gelten nie als vollständig", async () => {
    const s = memoryStorage();
    await s.put("2026-10-18T03-00-00Z-aaaaaa.exb", Buffer.from("halb"));
    await s.put("2026-10-17T03-00-00Z-bbbbbb.meta.json", Buffer.from("{kaputt"));
    const list = await service.listBackups(s);
    assert.deepEqual(list.map((b) => b.status).sort(), ["damaged", "incomplete"]);
    assert.equal((await service.verifyBackup(s, "2026-10-18T03-00-00Z-aaaaaa")).ok, false);
  });
});

describe("Konsistenz bei laufenden Änderungen", () => {
  test("Änderung während der Sicherung → betroffene Werte neu gelesen, Schnappschuss stimmt mit Versionszählern überein", async () => {
    const r = fakeRedis();
    seed(r);
    let changed = 0;
    r.hooks.before = (cmd) => {
      // nach dem ersten Lesen der Werte: zwei gleichzeitige Änderungen (wie updateJSON: Wert + Version)
      if (cmd[0] === "MGET" && String(cmd[1]).startsWith("tt:ver:") && changed < 2) {
        changed++;
        const cur = JSON.parse(r.data.get(KEYS.dealerOrders)?.v as string);
        r.put(KEYS.dealerOrders, JSON.stringify({ ...cur, seq: cur.seq + 1 }));
        r.put(`tt:ver:${KEYS.dealerOrders}`, String(Number((r.data.get(`tt:ver:${KEYS.dealerOrders}`) as { v: string }).v) + 1));
      }
    };
    const d = deps(r);
    const res = await service.runBackup(d, "manual");
    assert.ok(res.ok, res.ok ? "" : res.error);
    const p = await payloadOf(d.storage, res.meta.id);
    assert.ok(p.consistency.rounds >= 3, `Runden: ${p.consistency.rounds}`);
    const v = JSON.parse(p.entries.find((e) => e.k === KEYS.dealerOrders)?.v as string);
    assert.equal(v.seq, 9);
    assert.equal(p.entries.find((e) => e.k === `tt:ver:${KEYS.dealerOrders}`)?.v, "11");
  });
  test("ständige Änderungen → Sicherung schlägt fehl und wird NICHT als erfolgreich abgelegt", async () => {
    const r = fakeRedis();
    seed(r);
    r.hooks.before = (cmd) => {
      if (cmd[0] === "MGET" && String(cmd[1]).startsWith("tt:ver:")) r.put(`tt:ver:${KEYS.orders}`, String(Math.random()));
    };
    const d = deps(r);
    const res = await service.runBackup(d, "cron");
    assert.equal(res.ok, false);
    assert.match(res.ok ? "" : res.error, /konsistenter Stand/);
    assert.equal(d.storage.files.size, 0);
    assert.equal((await d.ops.getState()).lastSuccessAt, undefined);
  });
  test("während der Sicherung hochgeladenes Bild kommt mit", async () => {
    const r = fakeRedis();
    seed(r);
    let added = false;
    r.hooks.before = (cmd) => {
      if (!added && cmd[0] === "MGET" && String(cmd[1]).startsWith("tt:ver:")) {
        added = true;
        r.put("tt:media:neu-waehrend-backup", "AAAA");
      }
    };
    const d = deps(r);
    const res = await service.runBackup(d, "manual");
    assert.ok(res.ok);
    assert.ok((await payloadOf(d.storage, res.meta.id)).entries.some((e) => e.k === "tt:media:neu-waehrend-backup"));
  });
});

describe("Ausfälle und Abbrüche", () => {
  test("Datenbank nicht erreichbar → fehlgeschlagen, nichts abgelegt, Störung gemeldet", async () => {
    const r = fakeRedis();
    seed(r);
    r.hooks.before = (cmd) => {
      if (cmd[0] === "STRLEN") throw Object.assign(new Error("Zeitüberschreitung"), { name: "RedisRequestError" });
    };
    const d = deps(r);
    const before = signal.recentIncidents().length;
    const res = await service.runBackup(d, "cron");
    assert.equal(res.ok, false);
    assert.equal(d.storage.files.size, 0);
    assert.ok(signal.recentIncidents().length > before);
    assert.equal(signal.recentIncidents()[0].type, "backup_failed");
    const st = await d.ops.getState();
    assert.ok(st.lastFailureAt && st.lastFailureMessage);
  });
  test("Abbruch beim Hochladen der Beschreibung → halbe Datei wird entfernt", async () => {
    const r = fakeRedis();
    seed(r);
    const s = memoryStorage();
    const put = s.put.bind(s);
    s.put = async (key, data) => {
      if (key.endsWith(".meta.json")) throw Object.assign(new Error("Hochladen fehlgeschlagen (HTTP 500)"), { name: "S3Error" });
      return put(key, data);
    };
    const d = deps(r, s);
    const res = await service.runBackup(d, "manual");
    assert.equal(res.ok, false);
    assert.equal(s.files.size, 0);
  });
  test("Zeitlimit überschritten → abgebrochen", async () => {
    process.env.BACKUP_MAX_SECONDS = "0.001";
    const r = fakeRedis();
    seed(r);
    r.hooks.before = () => new Promise((ok) => setTimeout(ok, 2));
    const d = deps(r);
    const res = await service.runBackup(d, "manual");
    delete process.env.BACKUP_MAX_SECONDS;
    assert.equal(res.ok, false);
    assert.match(res.ok ? "" : res.error, /Zeitlimit/);
  });
  test("gleichzeitige Sicherungen: nur eine läuft, die andere wird übersprungen", async () => {
    const r = fakeRedis();
    seed(r);
    r.hooks.before = () => new Promise((ok) => setTimeout(ok, 1));
    const d = deps(r);
    const [a, b] = await Promise.all([service.runBackup(d, "cron"), service.runBackup(d, "manual")]);
    assert.equal([a, b].filter((x) => x.ok).length, 1);
    assert.equal([a, b].filter((x) => !x.ok && x.busy).length, 1);
    assert.equal(await d.ops.lockOwner(), null, "Sperre wieder frei");
  });
});

describe("Wiederherstellung", () => {
  test("in eine leere Testdatenbank: Daten, Typen, Versionszähler und Laufzeiten stimmen", async () => {
    process.env.BACKUP_RESTORE_TEST_KEEP = "1";
    const prod = fakeRedis("prod.local");
    seed(prod);
    const d = deps(prod);
    const res = await service.runBackup(d, "manual");
    assert.ok(res.ok);
    const target = fakeRedis("test.local");
    const rep = await restore.restoreToTest(d, res.meta.id, { target });
    assert.ok(rep.ok, JSON.stringify(rep.steps));
    assert.deepEqual(
      rep.steps.map((s) => s.label),
      ["Sicherung auswählen", "Prüfsumme der Datei", "Entschlüsseln (AES-256-GCM)", "Datenstruktur prüfen", "Testdatenbank prüfen", "Daten einspielen", "Wiederhergestellte Daten prüfen"],
    );
    assert.equal(target.data.get(KEYS.orders)?.v, prod.data.get(KEYS.orders)?.v);
    assert.equal(target.data.get(`tt:ver:${KEYS.dealerOrders}`)?.v, "9");
    assert.deepEqual(target.data.get("tt:adm:audit")?.v, prod.data.get("tt:adm:audit")?.v);
    assert.ok((target.data.get("tt:once:order-mail:customer:o-1")?.exp ?? 0) > Date.now());
    // Sitzungen und 2FA werden nicht reaktiviert
    for (const k of ["tt:adm:s:abc123", "tt:adm:sessions", "tt:adm:2fa", "tt:adm:2fa:recovery", "tt:adm:rl:loginIp:xyz"]) assert.equal(target.data.has(k), false, k);
    // Produktion unverändert
    assert.equal(prod.calls.some((c) => ["SET", "DEL", "FLUSHDB", "RPUSH", "SADD"].includes(String(c[0]))), false);
    assert.equal((await d.ops.getState()).lastRestoreTestOk, true);
  });
  test("Testdatenbank wird danach wieder geleert (nur Marker bleibt)", async () => {
    const prod = fakeRedis();
    seed(prod);
    const d = deps(prod);
    const res = await service.runBackup(d, "manual");
    assert.ok(res.ok);
    const target = fakeRedis("test.local");
    const rep = await restore.restoreToTest(d, res.meta.id, { target });
    assert.ok(rep.ok && rep.cleaned);
    assert.deepEqual([...target.data.keys()], ["tt:restore-test:marker"]);
  });
  test("Schutz: nicht leere, unmarkierte Datenbank wird nie beschrieben", async () => {
    const prod = fakeRedis();
    seed(prod);
    const d = deps(prod);
    const res = await service.runBackup(d, "manual");
    assert.ok(res.ok);
    const other = fakeRedis("other.local");
    other.put("tt:orders", "echte-daten");
    const rep = await restore.restoreToTest(d, res.meta.id, { target: other });
    assert.equal(rep.ok, false);
    assert.equal(other.data.get("tt:orders")?.v, "echte-daten");
    assert.equal(other.data.size, 1);
  });
  test("Schutz: Ziel mit Adresse oder Token der Produktion wird verweigert", () => {
    const prod = { url: "https://eu1-shop.upstash.io", token: "prod-token" };
    assert.throws(() => restore.assertNotProduction({ url: "https://EU1-shop.upstash.io/", token: "anders" }, prod), restore.RestoreGuardError);
    assert.throws(() => restore.assertNotProduction({ url: "https://test.upstash.io", token: "prod-token" }, prod), restore.RestoreGuardError);
    assert.throws(() => restore.assertNotProduction({ url: "", token: "" }, prod), restore.RestoreGuardError);
    assert.doesNotThrow(() => restore.assertNotProduction({ url: "https://test.upstash.io", token: "test-token" }, prod));
  });
  test("Schutz: Produktionsadresse als Testziel → nichts geschrieben", async () => {
    process.env.UPSTASH_REDIS_REST_URL = "https://prod.local";
    process.env.UPSTASH_REDIS_REST_TOKEN = "prod-token";
    try {
      const prod = fakeRedis("prod.local");
      seed(prod);
      const d = deps(prod);
      const res = await service.runBackup(d, "manual");
      assert.ok(res.ok);
      const before = prod.calls.length;
      const rep = await restore.restoreToTest(d, res.meta.id, { target: prod });
      assert.equal(rep.ok, false);
      assert.match(rep.steps.at(-1)?.detail ?? "", /Produktivdatenbank/);
      assert.equal(prod.calls.slice(before).some((c) => ["SET", "DEL", "FLUSHDB"].includes(String(c[0]))), false);
    } finally {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  });
  test("Wiederherstellung in die Produktion ist gesperrt", async () => {
    await assert.rejects(restore.restoreToProduction("2026-10-19T03-00-00Z-abcdef", "PRODUKTIV WIEDERHERSTELLEN"), restore.ProductionRestoreLockedError);
  });
  test("manipulierte Sicherung wird nicht eingespielt", async () => {
    const prod = fakeRedis();
    seed(prod);
    const d = deps(prod);
    const res = await service.runBackup(d, "manual");
    assert.ok(res.ok);
    const f = d.storage.files.get(service.dataName(res.meta.id)) as Buffer;
    f[60] ^= 1;
    const target = fakeRedis("test.local");
    const rep = await restore.restoreToTest(d, res.meta.id, { target });
    assert.equal(rep.ok, false);
    assert.equal(target.data.size, 0);
  });
});

describe("Aufbewahrung", () => {
  const DAY = 86_400_000;
  const now = Date.parse("2026-10-19T12:00:00Z");
  const items = Array.from({ length: 120 }, (_, i) => ({ id: `b${i}`, createdAt: new Date(now - i * DAY).toISOString() }));
  test("30 Tage täglich, danach eine je Woche für 12 Wochen, älteres wird gelöscht", () => {
    const r = decideRetention(items, now, { dailyDays: 30, weeklyWeeks: 12 });
    for (let i = 0; i <= 30; i++) assert.ok(r.keep.has(`b${i}`), `Tag ${i}`);
    const olderKept = [...r.keep].map((id) => Number(id.slice(1))).filter((i) => i > 30);
    assert.ok(olderKept.length >= 6 && olderKept.length <= 8, `Wochen: ${olderKept}`);
    assert.ok(olderKept.every((i) => i <= 84));
    assert.ok(r.remove.includes("b119"));
    const weeks = olderKept.map((i) => isoWeek(new Date(now - i * DAY)));
    assert.equal(new Set(weeks).size, weeks.length);
  });
  test("die neueste Sicherung bleibt immer, auch wenn sie uralt ist", () => {
    const r = decideRetention([{ id: "alt", createdAt: "2020-01-01T00:00:00Z" }], now, { dailyDays: 30, weeklyWeeks: 12 });
    assert.deepEqual(r.remove, []);
  });
  test("die letzte Sicherung MIT Geschäftsdaten bleibt, auch wenn danach wochenlang nur leere Sicherungen kamen", () => {
    const list = [
      { id: "echt", createdAt: new Date(now - 100 * DAY).toISOString() },
      ...Array.from({ length: 60 }, (_, i) => ({ id: `leer${i}`, createdAt: new Date(now - i * DAY).toISOString(), hasData: false })),
    ];
    const r = decideRetention(list, now, { dailyDays: 30, weeklyWeeks: 12 });
    assert.ok(r.keep.has("echt"));
    assert.ok(r.keep.has("leer0"));
  });
  test("Aufräumen löscht abgelaufene Sicherungen und alte Reste, nie ohne vollständige Sicherung", async () => {
    const s = memoryStorage();
    await s.put("2025-01-01T03-00-00Z-aaaaaa.exb", Buffer.from("rest"));
    assert.deepEqual(await service.applyRetention({ storage: s }), []);
    const r = fakeRedis();
    seed(r);
    const res = await service.runBackup(deps(r, s), "manual");
    assert.ok(res.ok);
    assert.ok(res.removed.includes("2025-01-01T03-00-00Z-aaaaaa"));
    assert.equal(await s.get("2025-01-01T03-00-00Z-aaaaaa.exb"), null);
  });
});

describe("Täglicher Auftrag (Cron)", () => {
  test("nur mit gültigem CRON_SECRET", () => {
    assert.equal(cronAuthorized("Bearer x", { CRON_SECRET: "" }), false);
    assert.equal(cronAuthorized("Bearer kurz", { CRON_SECRET: "kurz" }), false);
    assert.equal(cronAuthorized(null, { CRON_SECRET: "a".repeat(32) }), false);
    assert.equal(cronAuthorized(`Bearer ${"b".repeat(32)}`, { CRON_SECRET: "a".repeat(32) }), false);
    assert.equal(cronAuthorized(`Bearer ${"a".repeat(32)}`, { CRON_SECRET: "a".repeat(32) }), true);
  });
  test("ohne Freigabe (BACKUP_CRON_ENABLED) passiert nichts", async () => {
    process.env.CRON_SECRET = "c".repeat(32);
    let called = false;
    const r = await handleCron(`Bearer ${"c".repeat(32)}`, () => {
      called = true;
      return deps(fakeRedis());
    });
    assert.equal(r.status, 200);
    assert.ok(r.body.skipped);
    assert.equal(called, false);
    assert.equal((await handleCron("Bearer falsch", () => deps(null))).status, 401);
  });
  test("mit Freigabe: Sicherung + Überwachung", async () => {
    process.env.CRON_SECRET = "c".repeat(32);
    process.env.BACKUP_CRON_ENABLED = "1";
    try {
      const r = fakeRedis();
      seed(r);
      const res = await handleCron(`Bearer ${"c".repeat(32)}`, () => deps(r));
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.ok, true);
    } finally {
      delete process.env.BACKUP_CRON_ENABLED;
    }
  });
  test("überfällige Sicherung wird erkannt", async () => {
    process.env.BACKUP_CRON_ENABLED = "1";
    try {
      const d = deps(fakeRedis());
      await d.ops.patchState({ lastSuccessAt: new Date(Date.now() - 30 * 3600_000).toISOString() });
      assert.equal((await service.checkHealth(d)).overdue, true);
      await d.ops.patchState({ lastSuccessAt: new Date().toISOString() });
      assert.equal((await service.checkHealth(d)).overdue, false);
      assert.ok(service.nextScheduled(Date.parse("2026-10-19T12:00:00Z"))?.startsWith("2026-10-20T03:00"));
    } finally {
      delete process.env.BACKUP_CRON_ENABLED;
    }
  });
});

describe("Passwortschutz bei Redis-Ausfall (Fail-Closed)", () => {
  const locked = parseSiteLock({ enabled: true, hash: "scrypt$a$b" });
  const open = parseSiteLock({ enabled: false });
  const down = () => Promise.reject(new Error("Redis nicht erreichbar"));
  test("geschützter Shop bleibt bei Ausfall geschützt (letzter bekannter Stand, egal wie alt)", async () => {
    let t = 0;
    let fail = false;
    const res = createLockResolver(() => (fail ? down() : Promise.resolve(locked)), { cacheMs: 10, now: () => t, publicFallback: () => false });
    assert.deepEqual(await res.resolve(), locked);
    fail = true;
    t = 10_000_000;
    assert.deepEqual(await res.resolve(), locked);
  });
  test("öffentlicher Shop bleibt bei Ausfall öffentlich", async () => {
    let fail = false;
    let t = 0;
    const res = createLockResolver(() => (fail ? down() : Promise.resolve(open)), { cacheMs: 10, now: () => t });
    assert.equal(((await res.resolve()) as { enabled: boolean }).enabled, false);
    fail = true;
    t = 1000;
    assert.equal(((await res.resolve()) as { enabled: boolean }).enabled, false);
  });
  test("ohne bekannten Stand: geschlossen – außer der Shop ist bewusst öffentlich (SHOP_PUBLIC=1)", async () => {
    assert.equal(await createLockResolver(down, { publicFallback: () => false }).resolve(), "unavailable");
    assert.deepEqual(await createLockResolver(down, { publicFallback: () => true }).resolve(), { enabled: false });
  });
  test("„an“ ohne gültiges Passwort bleibt „an“ (nie stillschweigend offen)", () => {
    assert.equal(parseSiteLock({ enabled: true }).enabled, true);
    assert.equal(parseSiteLock({ enabled: true, hash: "kaputt" }).hash, undefined);
    assert.equal(parseSiteLock(null).enabled, false);
  });
});

describe("Überwachung", () => {
  test("Meldungen enthalten keine Geheimnisse", () => {
    assert.equal(signal.scrub("Bearer abc.def token=xyz https://eu1.upstash.io/x"), "Bearer *** token=*** [Adresse]");
    signal.reportIncident("redis_timeout", "GET token=geheim");
    assert.equal(signal.recentIncidents()[0].detail, "GET token=***");
  });
  test("Warnungen werden vorbereitet, aber ohne Freigabe nicht verschickt; gleiche Warnung nur einmal", async () => {
    const r = fakeRedis();
    let sent = 0;
    const send = async () => {
      sent++;
      return true;
    };
    const a = await alerts.raiseAlert(r, "backup_failed", "Test", send);
    assert.ok(a && !a.sent);
    assert.match(a.note, /nicht freigeschaltet/);
    assert.equal(await alerts.raiseAlert(r, "backup_failed", "Test", send), null);
    assert.equal(sent, 0);
    assert.equal((await alerts.listAlerts(r)).length, 1);
  });
});

describe("Eingetragene Zugangsdaten", () => {
  test("mitkopierte Anführungszeichen und Leerzeichen werden entfernt", async () => {
    const { cleanEnv, restoreTestCredentials } = await import("../lib/backup/redis-rest");
    assert.equal(cleanEnv(' "https://x.upstash.io" '), "https://x.upstash.io");
    assert.equal(cleanEnv("'abc'"), "abc");
    assert.equal(cleanEnv('a"b'), 'a"b');
    assert.equal(cleanEnv(undefined), "");
    process.env.BACKUP_RESTORE_TEST_URL = '"https://ziel.upstash.io/"';
    process.env.BACKUP_RESTORE_TEST_TOKEN = '"tok"\n';
    try {
      assert.deepEqual(restoreTestCredentials(), { url: "https://ziel.upstash.io", token: "tok" });
    } finally {
      delete process.env.BACKUP_RESTORE_TEST_URL;
      delete process.env.BACKUP_RESTORE_TEST_TOKEN;
    }
  });
});

describe("S3-kompatibler Speicher (z. B. Cloudflare R2)", () => {
  test("Signatur V4 entspricht dem offiziellen AWS-Beispiel", () => {
    const h = signV4({
      method: "GET",
      url: new URL("https://examplebucket.s3.amazonaws.com/test.txt"),
      headers: { host: "examplebucket.s3.amazonaws.com", range: "bytes=0-9" },
      payloadHash: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      accessKeyId: "AKIAIOSFODNN7EXAMPLE",
      secretAccessKey: "wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY",
      region: "us-east-1",
      date: new Date("2013-05-24T00:00:00Z"),
    });
    assert.match(h.authorization, /Signature=f0e8bdb87c964420e857bd35b5d6ed310bd44f0170aba48dd91039c6036bdb41$/);
  });
  test("Hochladen, Auflisten, Herunterladen, Löschen gegen einen lokalen Test-Server (Signatur geprüft)", async () => {
    const objects = new Map<string, Buffer>();
    const cfg = { endpoint: "", region: "auto", bucket: "sicherung", accessKeyId: "id", secretAccessKey: "geheim" };
    const server = http.createServer(async (req, res) => {
      const chunks: Buffer[] = [];
      for await (const c of req) chunks.push(c as Buffer);
      const body = Buffer.concat(chunks);
      const url = new URL(req.url as string, `http://${req.headers.host}`);
      const expected = signV4({
        method: req.method as string,
        url,
        headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => ["host", "content-type", "content-length"].includes(k) && (req.headers.authorization ?? "").includes(k)) as [string, string][]),
        payloadHash: req.headers["x-amz-content-sha256"] as string,
        accessKeyId: "id",
        secretAccessKey: "geheim",
        region: "auto",
        date: new Date(String(req.headers["x-amz-date"]).replace(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/, "$1-$2-$3T$4:$5:$6Z")),
      });
      if (expected.authorization !== req.headers.authorization) {
        res.writeHead(403);
        return res.end("<Error><Code>SignatureDoesNotMatch</Code><Message>x</Message></Error>");
      }
      const key = decodeURIComponent(url.pathname.replace("/sicherung/", ""));
      if (req.method === "PUT") objects.set(key, body);
      if (req.method === "DELETE") objects.delete(key);
      if (req.method === "GET" && url.pathname === "/sicherung") {
        const prefix = url.searchParams.get("prefix") ?? "";
        const xml = `<ListBucketResult>${[...objects].filter(([k]) => k.startsWith(prefix)).map(([k, v]) => `<Contents><Key>${k}</Key><Size>${v.length}</Size><LastModified>2026-10-19T00:00:00Z</LastModified></Contents>`).join("")}<IsTruncated>false</IsTruncated></ListBucketResult>`;
        res.writeHead(200);
        return res.end(xml);
      }
      if (req.method === "GET") {
        const o = objects.get(key);
        res.writeHead(o ? 200 : 404);
        return res.end(o);
      }
      res.writeHead(200);
      res.end();
    });
    await new Promise<void>((ok) => server.listen(0, "127.0.0.1", ok));
    try {
      cfg.endpoint = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
      const c = s3Client(cfg);
      await c.put("exstase-backups/a b.exb", Buffer.from("inhalt"));
      assert.deepEqual((await c.list("exstase-backups/")).map((o) => [o.key, o.size]), [["exstase-backups/a b.exb", 6]]);
      assert.equal((await c.get("exstase-backups/a b.exb"))?.toString(), "inhalt");
      assert.equal(await c.get("exstase-backups/fehlt"), null);
      await c.del("exstase-backups/a b.exb");
      assert.deepEqual(await c.list("exstase-backups/"), []);
      const wrong = s3Client({ ...cfg, secretAccessKey: "falsch" });
      await assert.rejects(wrong.put("x", Buffer.from("y")), /HTTP 403 – SignatureDoesNotMatch: Geheimer Schlüssel passt nicht/);
      // Endpoint mit angehängtem Bucket-Namen (wie in Cloudflare angezeigt) funktioniert trotzdem
      const withBucket = s3Client({ ...cfg, endpoint: `${cfg.endpoint}/sicherung/` });
      await withBucket.put("exstase-backups/b.exb", Buffer.from("zwei"));
      assert.deepEqual((await withBucket.list("exstase-backups/")).map((o) => o.key), ["exstase-backups/b.exb"]);
    } finally {
      server.close();
    }
  });
});

describe("Administratorberechtigung", () => {
  test("Backup-Aktionen ohne Anmeldung werden abgelehnt", async () => {
    const actions = await import("../app/admin/(panel)/datensicherung/actions");
    await assert.rejects(actions.startBackupAction(undefined));
    const form = new FormData();
    form.set("id", "2026-10-19T03-00-00Z-abcdef");
    form.set("password", "egal");
    await assert.rejects(actions.verifyBackupAction(undefined, form));
    await assert.rejects(actions.restoreTestAction(undefined, form));
  });
});
