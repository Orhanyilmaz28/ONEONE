/**
 * Phase 2A – lokaler Datei-Speicher (.data/store.json, für Entwicklung) unter gleichzeitigen Zugriffen und bei Fehlern.
 * Läuft immer – in einem eigenen, leeren Temp-Verzeichnis, ohne Redis.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, test } from "node:test";

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL"]) delete process.env[k];
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "exstase-store-"));
process.chdir(dir);
const FILE = path.join(dir, ".data", "store.json");

const store = await import("../lib/store");
const { KEYS, updateJSON, setJSON, getJSON, getJSONStrict, strictReads } = store;
const commissions = await import("../lib/commissions");
const dealerOrders = await import("../lib/dealer-orders");

const readFile = async () => JSON.parse(await fs.readFile(FILE, "utf8")) as Record<string, unknown>;

after(() => fs.rm(dir, { recursive: true, force: true }));

describe("Datei-Speicher (lokal)", () => {
  beforeEach(async () => {
    await fs.rm(path.join(dir, ".data"), { recursive: true, force: true });
  });

  test("Art des Speichers ist „file“", () => {
    assert.equal(store.storeKind(), "file");
  });

  test("100 gleichzeitige Änderungen am selben Datensatz – keine geht verloren", async () => {
    await Promise.all(Array.from({ length: 100 }, () => updateJSON<{ n: number }>("tt:test:counter", { n: 0 }, (c) => ({ n: c.n + 1 }))));
    assert.deepEqual((await readFile())["tt:test:counter"], { n: 100 });
  });

  test("Gleichzeitige Änderungen an verschiedenen Schlüsseln und Datensätzen derselben Datei", async () => {
    await Promise.all([
      ...Array.from({ length: 50 }, (_, i) => updateJSON<Record<string, number>>("tt:test:a", {}, (all) => ({ ...all, [`r${i}`]: i }))),
      ...Array.from({ length: 50 }, (_, i) => updateJSON<Record<string, number>>("tt:test:b", {}, (all) => ({ ...all, [`r${i}`]: i }))),
      setJSON("tt:test:c", { fest: true }),
      store.claimOnce("datei-test"),
    ]);
    const all = await readFile();
    assert.equal(Object.keys(all["tt:test:a"] as object).length, 50);
    assert.equal(Object.keys(all["tt:test:b"] as object).length, 50);
    assert.deepEqual(all["tt:test:c"], { fest: true });
    assert.ok((all["tt:once"] as Record<string, number>)["datei-test"] > Date.now());
  });

  test("Beschädigte Datei → StoreDataError, die Datei wird nicht überschrieben", async () => {
    await fs.mkdir(path.dirname(FILE), { recursive: true });
    await fs.writeFile(FILE, '{"tt:test:x": {"a": 1');
    await assert.rejects(updateJSON("tt:test:x", {}, () => ({ b: 2 })), (e: unknown) => e instanceof store.StoreDataError);
    await assert.rejects(setJSON("tt:test:y", 1), (e: unknown) => e instanceof store.StoreDataError);
    await assert.rejects(getJSONStrict("tt:test:x", {}), (e: unknown) => e instanceof store.StoreDataError);
    await assert.rejects(strictReads(() => getJSON("tt:test:x", {})), (e: unknown) => e instanceof store.StoreDataError);
    assert.deepEqual(await getJSON("tt:test:x", { fallback: true }), { fallback: true });
    assert.equal(await fs.readFile(FILE, "utf8"), '{"tt:test:x": {"a": 1');
  });

  test("Fehler in der Änderung schreibt nichts; keine halbe Datei, keine Zwischendateien", async () => {
    await setJSON("tt:test:x", { a: 1 });
    await assert.rejects(
      updateJSON("tt:test:x", {}, () => {
        throw new Error("Abbruch");
      }),
      /Abbruch/,
    );
    assert.deepEqual((await readFile())["tt:test:x"], { a: 1 });
    assert.deepEqual((await fs.readdir(path.dirname(FILE))).filter((f) => f.endsWith(".tmp")), []);
  });

  test("Doppelte Provisionsereignisse → genau eine Provision", async () => {
    const s = { id: "cs_test_file_ffffff", created: Math.floor(Date.UTC(2026, 8, 10) / 1000), payment_status: "paid", metadata: { refId: "0123456789abcdef", goodsNet: "5000", commissionPct: "10" } } as never;
    const results = await Promise.all(Array.from({ length: 20 }, () => commissions.recordCommission(s)));
    assert.equal(results.filter(Boolean).length, 1);
    assert.equal(((await getJSON<unknown[]>(KEYS.commissions, [])) ?? []).length, 1);
  });

  test("Parallele Händlerbestellungen → eindeutige, fortlaufende Nummern", async () => {
    const orders = await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        dealerOrders.createDealerOrder({ dealerId: `d${i}`, dealerEmail: "t@example.invalid", tierName: "Standard", calc: {}, delivery: {} } as never),
      ),
    );
    const year = new Date().getFullYear();
    assert.deepEqual(orders.map((o) => o.number).sort(), Array.from({ length: 20 }, (_, i) => `H-${year}-${String(i + 1).padStart(4, "0")}`));
  });

  test("Bestellnummer: höchste vergebene + 1 (auch wenn ältere Bestellungen fehlen)", async () => {
    const year = new Date().getFullYear();
    await setJSON(KEYS.dealerOrders, [{ id: "x", number: `H-${year}-0007`, createdAt: "2020-01-01T00:00:00.000Z", dealerId: "alt", status: "eingegangen", history: [] }]);
    const o = await dealerOrders.createDealerOrder({ dealerId: "neu", dealerEmail: "t@example.invalid", tierName: "Standard", calc: {}, delivery: {} } as never);
    assert.equal(o.number, `H-${year}-0008`);
  });
});
