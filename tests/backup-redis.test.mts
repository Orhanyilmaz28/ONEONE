/**
 * Phase 2B – Datensicherung und Wiederherstellung mit ECHTEM Redis (zwei isolierte Testdatenbanken auf diesem Rechner).
 *
 *   redis-server --port 6392 --save "" --appendonly no --daemonize yes      # „Shop“ (Quelle)
 *   redis-server --port 6393 --save "" --appendonly no --daemonize yes      # Testdatenbank (Ziel)
 *   node tests/helpers/upstash-bridge.mjs 8793 6392 &
 *   node tests/helpers/upstash-bridge.mjs 8794 6393 &
 *   BACKUP_TEST_SOURCE_URL=http://127.0.0.1:8793 BACKUP_TEST_TARGET_URL=http://127.0.0.1:8794 npm test
 *
 * Beide Adressen müssen localhost sein – die Quelle wird zu Beginn geleert. Eine echte Datenbank kann so nie getroffen werden.
 */
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, test } from "node:test";

const SRC = process.env.BACKUP_TEST_SOURCE_URL;
const DST = process.env.BACKUP_TEST_TARGET_URL;
const TOKEN = "testtoken";
const isLocal = (u?: string) => !!u && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(u);
const skip = !SRC || !DST ? "BACKUP_TEST_SOURCE_URL/BACKUP_TEST_TARGET_URL nicht gesetzt" : !isLocal(SRC) || !isLocal(DST) || SRC === DST ? "Nur zwei verschiedene lokale Testdatenbanken erlaubt" : false;

if (!skip) {
  process.env.UPSTASH_REDIS_REST_URL = SRC;
  process.env.UPSTASH_REDIS_REST_TOKEN = TOKEN;
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
  process.env.BACKUP_ENCRYPTION_KEY = "integration-backup-key-0123456789abcdefghij";
  process.env.BACKUP_LOCAL_DIR = mkdtempSync(path.join(tmpdir(), "exstase-backup-"));
  process.env.BACKUP_RESTORE_TEST_URL = DST;
  process.env.BACKUP_RESTORE_TEST_TOKEN = "testtoken-ziel"; // anderer Token als die Quelle (Bridge prüft nur „testtoken“ → siehe unten)
  process.env.MONITOR_PERSIST = "0";
  process.env.ADMIN_PASSWORD = "richtig-langes-passwort";
  process.env.SESSION_SECRET = "test-session-secret-test-session-secret-0000";
}

const { restClient } = await import("../lib/backup/redis-rest");
const service = await import("../lib/backup/service");
const restore = await import("../lib/backup/restore");
const { decryptBackup } = await import("../lib/backup/crypto");
const { parsePayload } = await import("../lib/backup/format");
const store = await import("../lib/store");
const { KEYS, updateJSON, putBinary, claimOnce } = store;

const src = restClient(SRC ?? "http://127.0.0.1:1", TOKEN, { retries: 0 });
const dst = restClient(DST ?? "http://127.0.0.1:1", TOKEN, { retries: 0 });
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("Datensicherung mit echtem Redis (isolierte Testdatenbanken)", { skip }, () => {
  test("Sicherung während gleichzeitiger Schreibzugriffe ist ein konsistenter Schnappschuss", async () => {
    await src.cmd(["FLUSHDB"]);
    // Shop-Daten über die echten Funktionen des Shops anlegen
    await updateJSON(KEYS.orders, {} as Record<string, unknown>, () => ({ "o-1": { kunde: "Jürgen Müller", summe: 1800 } }));
    await updateJSON(KEYS.newsletter, [] as unknown[], () => [{ email: "a@example.invalid", consentAt: "2026-10-01T10:00:00Z" }]);
    await putBinary("img-integration", Buffer.from("bilddaten"));
    await claimOnce("order-mail:customer:o-1", 3600);
    const { createSession } = await import("../lib/admin-security/sessions");
    await createSession("full", { ip: "127.0.0.1", ua: "test" });

    // drei „Server“ ändern laufend zwei Datensätze nacheinander: erst A, dann B
    const A = KEYS.dealerOrders;
    const B = KEYS.commissions;
    let stop = false;
    const writer = async () => {
      while (!stop) {
        await updateJSON<{ n: number }>(A, { n: 0 }, (c) => ({ n: c.n + 1 }));
        await updateJSON<{ n: number }>(B, { n: 0 }, (c) => ({ n: c.n + 1 }));
        await sleep(15);
      }
    };
    const writers = [writer(), writer(), writer()];
    await sleep(100);
    const deps = service.defaultDeps();
    const res = await service.runBackup(deps, "cli");
    stop = true;
    await Promise.all(writers);
    assert.ok(res.ok, res.ok ? "" : res.error);

    const file = await deps.storage?.get(service.dataName(res.meta.id));
    assert.ok(file);
    const p = parsePayload(decryptBackup(file).plain);
    const get = (k: string) => p.entries.find((e) => e.k === k)?.v as string;
    const a = JSON.parse(get(A)).n as number;
    const b = JSON.parse(get(B)).n as number;
    // Wert passt exakt zum Versionszähler (Phase 2A: jede Änderung erhöht beide gemeinsam)
    assert.equal(String(a), get(`tt:ver:${A}`));
    assert.equal(String(b), get(`tt:ver:${B}`));
    // Werte stammen aus demselben Augenblick: B hinkt höchstens um die Zahl gleichzeitiger Schreiber hinterher
    assert.ok(a - b >= 0 && a - b <= 3, `A=${a} B=${b}`);
    assert.ok(p.entries.some((e) => e.k === "tt:media:img-integration"));
    assert.ok(p.entries.some((e) => e.k.startsWith("tt:once:") && (e.ttl ?? 0) > 0));
    assert.equal(p.entries.some((e) => e.k.startsWith("tt:adm:s:") || e.k === "tt:adm:sessions"), false);
    // Betriebsdaten der Sicherung bleiben in der Quelle, kommen aber nie in die Sicherung
    assert.equal(p.entries.some((e) => e.k.startsWith("tt:backup:")), false);
    assert.equal(await src.cmd(["GET", "tt:backup:lock"]), null, "Sperre freigegeben");
  });

  test("Wiederherstellung in eine leere Testdatenbank: alles identisch, Quelle unverändert", async () => {
    await dst.cmd(["FLUSHDB"]);
    const deps = service.defaultDeps();
    const list = await service.listBackups(deps.storage as never);
    const id = list[0].id;
    const businessBefore = await src.cmd(["MGET", KEYS.orders, KEYS.dealerOrders, KEYS.commissions]);
    process.env.BACKUP_RESTORE_TEST_KEEP = "1";
    const rep = await restore.restoreToTest(deps, id, { target: dst, targetCreds: { url: DST as string, token: "testtoken-ziel" } });
    delete process.env.BACKUP_RESTORE_TEST_KEEP;
    assert.ok(rep.ok, JSON.stringify(rep.steps));
    const p = parsePayload(decryptBackup((await deps.storage?.get(service.dataName(id))) as Buffer).plain);
    for (const e of p.entries.filter((x) => x.t === "string")) assert.equal(await dst.cmd(["GET", e.k]), e.v, e.k);
    assert.ok(Number(await dst.cmd(["PTTL", p.entries.find((e) => e.k.startsWith("tt:once:"))?.k as string])) > 0);
    assert.equal((await dst.cmd<string[]>(["KEYS", "tt:adm:*"])).length, 0, "keine Sitzungen/2FA in der Testdatenbank");
    assert.deepEqual(await src.cmd(["MGET", KEYS.orders, KEYS.dealerOrders, KEYS.commissions]), businessBefore, "Quelle unverändert");
    // Danach (Standard) wieder leeren
    const rep2 = await restore.restoreToTest(deps, id, { target: dst, targetCreds: { url: DST as string, token: "testtoken-ziel" } });
    assert.ok(rep2.ok && rep2.cleaned);
    assert.deepEqual(await dst.cmd(["KEYS", "*"]), ["tt:restore-test:marker"]);
  });

  test("Testziel = Quelle wird verweigert, Quelle bleibt unberührt", async () => {
    const deps = service.defaultDeps();
    const id = (await service.listBackups(deps.storage as never))[0].id;
    // Daten der Quelle (ohne die Protokolle von Sicherung/Überwachung, die bewusst dort landen)
    const snapshot = async () => {
      const keys = (await src.cmd<string[]>(["KEYS", "*"])).filter((k) => !k.startsWith("tt:backup:") && !k.startsWith("tt:monitor:")).sort();
      return { keys, values: await src.pipeline(keys.map((k) => ["DUMP", k])) };
    };
    const before = await snapshot();
    const rep = await restore.restoreToTest(deps, id, { targetCreds: { url: SRC as string, token: "anderer" } });
    assert.equal(rep.ok, false);
    assert.match(rep.steps.at(-1)?.detail ?? "", /Produktivdatenbank/);
    assert.deepEqual(await snapshot(), before);
  });

  test("Datenbank nicht erreichbar → Sicherung fehlgeschlagen, nichts als erfolgreich abgelegt", async () => {
    const deps = service.defaultDeps();
    const countBefore = (await service.listBackups(deps.storage as never)).length;
    const dead = restClient("http://127.0.0.1:9", TOKEN, { retries: 0, timeoutMs: 500 });
    const res = await service.runBackup({ ...deps, source: { kind: "redis", redis: dead }, ops: (await import("../lib/backup/ops")).memoryOps() }, "cli");
    assert.equal(res.ok, false);
    assert.equal((await service.listBackups(deps.storage as never)).length, countBefore);
  });

  test("Datenspeicher des Shops meldet Ausfälle an die Überwachung", async () => {
    const signal = await import("../lib/monitoring/signal");
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async () => {
      throw new TypeError("fetch failed");
    }) as typeof fetch;
    try {
      await assert.rejects(store.getJSONStrict(KEYS.orders, {}));
    } finally {
      globalThis.fetch = realFetch;
    }
    assert.equal(signal.recentIncidents()[0].type, "redis_unreachable");
  });
});
