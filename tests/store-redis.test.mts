/**
 * Phase 2A – Datenspeicher unter gleichzeitigen Zugriffen und bei Ausfällen (echter Redis über die Upstash-REST-Schnittstelle).
 *
 * Läuft nur mit einer ISOLIERTEN Testdatenbank auf diesem Rechner:
 *   redis-server --port 6390 --save "" --appendonly no --daemonize yes
 *   node tests/helpers/upstash-bridge.mjs 8791 6390
 *   REDIS_TEST_URL=http://127.0.0.1:8791 REDIS_TEST_TOKEN=testtoken npm test
 * Der Test schreibt in echte Schlüssel des Shops (tt:commissions, tt:dealer-orders …) und verweigert deshalb
 * jede Adresse außer localhost – die Produktivdatenbank kann damit nicht angesprochen werden.
 */
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { beforeEach, describe, test } from "node:test";

const url = process.env.REDIS_TEST_URL;
const token = process.env.REDIS_TEST_TOKEN;
const local = !!url && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(url);
const skip = !url || !token ? "REDIS_TEST_URL/REDIS_TEST_TOKEN nicht gesetzt" : !local ? "Nur gegen eine lokale Testdatenbank erlaubt" : false;

if (!skip) {
  process.env.UPSTASH_REDIS_REST_URL = url;
  process.env.UPSTASH_REDIS_REST_TOKEN = token;
  process.env.STORE_TIMEOUT_MS = "1500";
  delete process.env.KV_REST_API_URL;
  delete process.env.KV_REST_API_TOKEN;
}

const store = await import("../lib/store");
const { KEYS, updateJSON, setJSON, getJSON, getJSONStrict, strictReads } = store;
const commissions = await import("../lib/commissions");
const dealerOrders = await import("../lib/dealer-orders");
const influencers = await import("../lib/influencers");

/* ───────── Hilfen ───────── */

const realFetch = globalThis.fetch;
/** Redis-Befehl direkt (an der Shop-Logik vorbei) – für Vorbereitung und Prüfung */
async function raw<T = unknown>(...cmd: (string | number)[]): Promise<T> {
  const res = await realFetch(url as string, { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: JSON.stringify(cmd) });
  const body = (await res.json()) as { result?: T; error?: string };
  if (body.error) throw new Error(body.error);
  return body.result as T;
}
const ver = (key: string) => raw<string | null>("GET", `tt:ver:${key}`);
const val = async <T,>(key: string) => {
  const v = await raw<string | null>("GET", key);
  return v === null ? null : (JSON.parse(v) as T);
};
const TEST_KEYS = [
  KEYS.commissions,
  KEYS.influencerStatements,
  KEYS.influencers,
  KEYS.dealerOrders,
  KEYS.siteLock,
  "tt:test:counter",
  "tt:test:records",
  "tt:test:mp-counter",
  "tt:test:mp-records",
  "tt:test:x",
];
async function reset() {
  await raw("DEL", ...TEST_KEYS, ...TEST_KEYS.map((k) => `tt:ver:${k}`));
  const once = await raw<string[]>("KEYS", "tt:once:*");
  if (once.length) await raw("DEL", ...once);
}

/** Redis-Aufrufe des Shops abfangen (Fehler einspielen); liefert eine Funktion zum Zurücksetzen */
type Cmd = (string | number)[];
function intercept(handler: (cmd: Cmd, pass: () => Promise<Response>, init: RequestInit) => Promise<Response>) {
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const cmd = JSON.parse(String(init?.body ?? "[]")) as Cmd;
    return handler(cmd, () => realFetch(input, init), init ?? {});
  }) as typeof fetch;
  return () => {
    globalThis.fetch = realFetch;
  };
}
const isCas = (cmd: Cmd, key: string) => cmd[0] === "EVAL" && cmd[3] === key;

const SEPT = Math.floor(Date.UTC(2026, 8, 10) / 1000);
const session = (id: string, refId: string, goodsNet = 10000) =>
  ({ id, created: SEPT, payment_status: "paid", payment_intent: `pi_${id}`, metadata: { refId, goodsNet: String(goodsNet), commissionPct: "10", ref: "TEST" } }) as never;

async function newInfluencer(name: string) {
  const { influencer } = await influencers.addInfluencer({
    name,
    alias: name,
    email: `${name.toLowerCase()}@example.invalid`,
    phone: "",
    platform: "Instagram",
    channelUrl: "https://example.invalid",
    followers: "1k",
    message: "",
    wishCode: name.toUpperCase(),
    street: "Teststr. 1",
    zip: "12345",
    city: "Teststadt",
    smallBusiness: true,
    taxNo: "",
    vatId: "",
  } as never);
  return influencer.id;
}

/* ───────── Tests ───────── */

describe("Datenspeicher mit echtem Redis (isolierte Testdatenbank)", { skip }, () => {
  beforeEach(reset);

  test("100 gleichzeitige Änderungen am selben Datensatz – keine geht verloren", async () => {
    await Promise.all(Array.from({ length: 100 }, () => updateJSON<{ n: number }>("tt:test:counter", { n: 0 }, (c) => ({ n: c.n + 1 }))));
    assert.deepEqual(await val("tt:test:counter"), { n: 100 });
    assert.equal(await ver("tt:test:counter"), "100");
  });

  test("100 gleichzeitige Änderungen an unterschiedlichen Datensätzen im selben JSON-Block", async () => {
    await setJSON("tt:test:records", { bestand: "bleibt" });
    await Promise.all(Array.from({ length: 100 }, (_, i) => updateJSON<Record<string, unknown>>("tt:test:records", {}, (all) => ({ ...all, [`r${i}`]: i }))));
    const after = (await val<Record<string, unknown>>("tt:test:records")) ?? {};
    assert.equal(Object.keys(after).length, 101);
    assert.equal(after.bestand, "bleibt");
    for (let i = 0; i < 100; i++) assert.equal(after[`r${i}`], i);
  });

  test("Mehrere Server-Prozesse gleichzeitig (4 × 25 Änderungen, Provisionen, Bestellnummern)", async () => {
    const inf = await newInfluencer("Multi");
    const run = (w: number) =>
      new Promise<number>((resolve, reject) => {
        const p = spawn(process.execPath, ["--import", "tsx", "tests/helpers/store-worker.mts", String(w), "25"], {
          env: { ...process.env, MP_INFLUENCER: inf },
          stdio: ["ignore", "inherit", "inherit"],
        });
        p.on("error", reject);
        p.on("exit", (code) => resolve(code ?? 1));
      });
    const codes = await Promise.all([1, 2, 3, 4].map(run));
    assert.deepEqual(codes, [0, 0, 0, 0]);
    assert.deepEqual(await val("tt:test:mp-counter"), { n: 100 });
    assert.equal(Object.keys((await val<Record<string, number>>("tt:test:mp-records")) ?? {}).length, 100);
    // dieselben 5 Provisionsereignisse aus 4 Prozessen → genau 5 Provisionen
    const list = (await val<{ orderId: string }[]>(KEYS.commissions)) ?? [];
    assert.equal(list.length, 5);
    assert.equal(new Set(list.map((c) => c.orderId)).size, 5);
    // 12 Händlerbestellungen aus 4 Prozessen → 12 verschiedene, lückenlose Nummern
    const orders = (await val<{ number: string }[]>(KEYS.dealerOrders)) ?? [];
    const year = new Date().getFullYear();
    assert.deepEqual(orders.map((o) => o.number).sort(), Array.from({ length: 12 }, (_, i) => `H-${year}-${String(i + 1).padStart(4, "0")}`));
  });

  test("Fremder Schreibzugriff zwischen Lesen und Speichern → neuer Versuch, beide Änderungen bleiben erhalten", async () => {
    await setJSON("tt:test:records", { a: 1 });
    let injected = false;
    let casCalls = 0;
    const restore = intercept(async (cmd, pass) => {
      if (isCas(cmd, "tt:test:records")) {
        casCalls++;
        if (!injected) {
          injected = true;
          // eine andere Instanz speichert genau jetzt (mit Versionserhöhung wie setJSON/updateJSON)
          await raw("EVAL", "redis.call('SET', KEYS[1], ARGV[1]) return redis.call('INCR', KEYS[2])", 2, "tt:test:records", "tt:ver:tt:test:records", JSON.stringify({ a: 1, fremd: true }));
        }
      }
      return pass();
    });
    try {
      await updateJSON<Record<string, unknown>>("tt:test:records", {}, (all) => ({ ...all, meins: true }));
    } finally {
      restore();
    }
    assert.equal(casCalls, 2, "der erste Speicherversuch muss abgelehnt worden sein");
    assert.deepEqual(await val("tt:test:records"), { a: 1, fremd: true, meins: true });
  });

  test("Dauerhafter Konflikt → WriteConflictError nach begrenzten Versuchen, nichts überschrieben", async () => {
    await setJSON("tt:test:x", { v: "original" });
    let casCalls = 0;
    const restore = intercept(async (cmd, pass) => {
      if (isCas(cmd, "tt:test:x")) {
        casCalls++;
        await raw("INCR", "tt:ver:tt:test:x"); // bei jedem Versuch kommt jemand zuvor
      }
      return pass();
    });
    try {
      await assert.rejects(
        updateJSON<{ v: string }>("tt:test:x", { v: "" }, () => ({ v: "neu" })),
        (e: unknown) => e instanceof store.WriteConflictError,
      );
    } finally {
      restore();
    }
    assert.equal(casCalls, 12);
    assert.deepEqual(await val("tt:test:x"), { v: "original" });
  });

  test("Bestandsdaten ohne Versionsschlüssel werden unverändert übernommen und korrekt fortgeschrieben", async () => {
    const legacy = JSON.stringify([{ orderId: "cs_alt_000001", amount: 500, status: "vorgemerkt" }]);
    await raw("SET", KEYS.commissions, legacy);
    assert.equal(await ver(KEYS.commissions), null);
    assert.equal(await getJSON(KEYS.commissions, []).then((l) => (l as unknown[]).length), 1);
    await updateJSON<unknown[]>(KEYS.commissions, [], (l) => [...l, { orderId: "cs_neu_000002" }]);
    const after = (await val<{ orderId: string }[]>(KEYS.commissions)) ?? [];
    assert.deepEqual(after.map((c) => c.orderId), ["cs_alt_000001", "cs_neu_000002"]);
    assert.equal(await ver(KEYS.commissions), "1");
    // unverändertes Ergebnis → kein Schreibvorgang, Version bleibt
    await updateJSON<unknown[]>(KEYS.commissions, [], (l) => l);
    assert.equal(await ver(KEYS.commissions), "1");
  });

  test("Redis-Ausfall beim Lesen: Fehler statt Standardwert, nichts überschrieben", async () => {
    await setJSON("tt:test:x", { wichtig: true });
    const restore = intercept(async () => {
      throw new TypeError("fetch failed");
    });
    try {
      await assert.rejects(updateJSON("tt:test:x", {}, () => ({})), (e: unknown) => e instanceof store.StoreUnreachableError);
      await assert.rejects(getJSONStrict("tt:test:x", {}), (e: unknown) => e instanceof store.StoreUnreachableError);
      await assert.rejects(strictReads(() => getJSON("tt:test:x", {})), (e: unknown) => e instanceof store.StoreUnreachableError);
      assert.deepEqual(await getJSON("tt:test:x", { fallback: true }), { fallback: true }, "Anzeige darf weiterlaufen");
    } finally {
      restore();
    }
    assert.deepEqual(await val("tt:test:x"), { wichtig: true });
  });

  test("Redis-Ausfall beim Speichern (nach dem Lesen): Fehler, Wert und Version unverändert", async () => {
    await setJSON("tt:test:x", { stand: 1 });
    const restore = intercept(async (cmd, pass) => {
      if (isCas(cmd, "tt:test:x")) return new Response("Service Unavailable", { status: 503 });
      return pass();
    });
    try {
      await assert.rejects(updateJSON("tt:test:x", {}, () => ({ stand: 2 })), (e: unknown) => e instanceof store.StoreUnreachableError);
    } finally {
      restore();
    }
    assert.deepEqual(await val("tt:test:x"), { stand: 1 });
    assert.equal(await ver("tt:test:x"), "1");
  });

  test("Fehlerantwort von Redis und ungültige Antwort → StoreUnreachableError", async () => {
    let mode = 0;
    const restore = intercept(async () =>
      mode === 0 ? Response.json({ error: "ERR something" }) : new Response("<html>kein JSON</html>", { status: 200 }),
    );
    try {
      await assert.rejects(getJSONStrict("tt:test:x", {}), (e: unknown) => e instanceof store.StoreUnreachableError);
      mode = 1;
      await assert.rejects(getJSONStrict("tt:test:x", {}), (e: unknown) => e instanceof store.StoreUnreachableError);
    } finally {
      restore();
    }
  });

  test("Zeitüberschreitung → StoreTimeoutError (kein endloses Warten)", async () => {
    const restore = intercept(
      (_cmd, _pass, init) =>
        new Promise<Response>((_, reject) => {
          // hängende Verbindung nachstellen (der Timer hält den Prozess am Leben wie ein offener Socket)
          const hang = setTimeout(() => reject(new Error("nie beantwortet")), 10_000);
          init.signal?.addEventListener("abort", () => {
            clearTimeout(hang);
            reject(init.signal?.reason);
          });
        }),
    );
    const started = Date.now();
    try {
      await assert.rejects(updateJSON("tt:test:x", {}, () => ({ a: 1 })), (e: unknown) => e instanceof store.StoreTimeoutError);
    } finally {
      restore();
    }
    assert.ok(Date.now() - started < 4000);
    assert.equal(await raw("GET", "tt:test:x"), null);
  });

  test("Beschädigte Daten → StoreDataError, der Inhalt wird nie überschrieben", async () => {
    await raw("SET", KEYS.commissions, '[{"orderId": kaputt');
    await assert.rejects(commissions.recordCommission(session("cs_test_kaputt1", "0123456789abcdef")), (e: unknown) => e instanceof store.StoreDataError);
    await assert.rejects(getJSONStrict(KEYS.commissions, []), (e: unknown) => e instanceof store.StoreDataError);
    assert.equal(await raw("GET", KEYS.commissions), '[{"orderId": kaputt');
  });

  test("Abgebrochene Operation (Fehler mitten in der Änderung) schreibt nichts", async () => {
    await setJSON("tt:test:x", { a: 1 });
    await assert.rejects(
      updateJSON<{ a: number }>("tt:test:x", { a: 0 }, () => {
        throw new Error("Abbruch");
      }),
      /Abbruch/,
    );
    assert.deepEqual(await val("tt:test:x"), { a: 1 });
    assert.equal(await ver("tt:test:x"), "1");
  });

  test("Parallele Händlerbestellungen und Rechnungen → keine doppelten Nummern", async () => {
    const year = new Date().getFullYear();
    const orders = await Promise.all(
      Array.from({ length: 30 }, (_, i) =>
        dealerOrders.createDealerOrder({ dealerId: `d${i}`, dealerEmail: "t@example.invalid", tierName: "Standard", calc: {}, delivery: {} } as never),
      ),
    );
    assert.equal(new Set(orders.map((o) => o.number)).size, 30);
    assert.equal(orders.map((o) => o.number).sort().at(-1), `H-${year}-0030`);

    const date = `${year}-10-01`;
    const draft = (n: number) =>
      ({ date, serviceDate: date, dueDays: 14, lines: [{ text: `Pos ${n}`, qty: 1, unit: "Tray", price: 100 + n, deposit: 0 }], shippingNet: 0, shippingText: "", discountNet: 0, discountText: "", note: "", vatRate: 19, billTo: {}, seller: {} }) as never;
    const saved = await Promise.all(orders.map((o, i) => dealerOrders.saveInvoice(o.id, draft(i), {})));
    const numbers = saved.map((r) => r?.order.invoice?.number);
    assert.equal(new Set(numbers).size, 30, "jede Rechnung hat eine eigene Nummer");
    assert.deepEqual([...numbers].sort(), Array.from({ length: 30 }, (_, i) => `RE-${year}-${String(i + 1).padStart(4, "0")}`));
    // gleichzeitige Freigabe + inhaltliche Änderung derselben Rechnung → genau eine Korrekturnummer
    await dealerOrders.saveInvoice(orders[0].id, draft(0), { release: true });
    const corrections = await Promise.all([dealerOrders.saveInvoice(orders[0].id, draft(100), {}), dealerOrders.saveInvoice(orders[0].id, draft(100), {})]);
    const final = (await dealerOrders.getDealerOrder(orders[0].id))?.invoice;
    assert.equal(final?.number, `RE-${year}-0031`);
    assert.equal(final?.replaced?.length, 1);
    assert.ok(corrections.every(Boolean));
  });

  test("Doppelte Provisionsereignisse (20× gleichzeitig dieselbe Bestellung) → genau eine Provision", async () => {
    const inf = await newInfluencer("Doppelt");
    const results = await Promise.all(Array.from({ length: 20 }, () => commissions.recordCommission(session("cs_test_dup_aaaaaa", inf))));
    assert.equal(results.filter(Boolean).length, 1, "nur ein Aufruf meldet eine neue Buchung");
    // dazu 10 verschiedene Bestellungen, jede doppelt gemeldet
    await Promise.all(Array.from({ length: 20 }, (_, i) => commissions.recordCommission(session(`cs_test_multi_${String(i % 10).padStart(6, "0")}`, inf))));
    const list = (await val<{ orderId: string; amount: number }[]>(KEYS.commissions)) ?? [];
    assert.equal(list.length, 11);
    assert.equal(new Set(list.map((c) => c.orderId)).size, 11);
    assert.ok(list.every((c) => c.amount === 1000));
  });

  test("Wiederholter Webhook nach Speicher-Ausfall: zuerst Fehler (Stripe wiederholt), danach genau eine Provision", async () => {
    const inf = await newInfluencer("Retry");
    const restore = intercept(async (cmd, pass) => (isCas(cmd, KEYS.commissions) ? new Response("down", { status: 503 }) : pass()));
    try {
      await assert.rejects(commissions.recordCommission(session("cs_test_retry_bbbbbb", inf)), (e: unknown) => e instanceof store.StoreUnreachableError);
    } finally {
      restore();
    }
    assert.equal(((await val<unknown[]>(KEYS.commissions)) ?? []).length, 0);
    // Stripe schickt das Ereignis erneut – mehrfach und gleichzeitig
    await Promise.all(Array.from({ length: 5 }, () => commissions.recordCommission(session("cs_test_retry_bbbbbb", inf))));
    assert.equal(((await val<unknown[]>(KEYS.commissions)) ?? []).length, 1);
  });

  test("Gutschrift-Doppelklick: genau eine Gutschrift, der zweite Aufruf findet nichts Offenes mehr", async () => {
    const inf = await newInfluencer("Klick");
    await commissions.recordCommission(session("cs_test_gs_cccccc", inf));
    const results = await Promise.allSettled([commissions.createStatement(inf, "2026-09"), commissions.createStatement(inf, "2026-09")]);
    const ok = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    assert.equal(ok.length, 1);
    assert.equal(failed.length, 1);
    assert.ok(failed[0].reason instanceof commissions.StatementError);
    const statements = (await val<{ number: string }[]>(KEYS.influencerStatements)) ?? [];
    assert.equal(statements.length, 1);
  });

  test("Gutschriftnummern parallel für mehrere Influencer → eindeutig und lückenlos", async () => {
    const ids = await Promise.all(["Ana", "Ben", "Cem", "Dan", "Eva"].map(newInfluencer));
    await Promise.all(ids.map((id, i) => commissions.recordCommission(session(`cs_test_gsn_${String(i).padStart(6, "0")}`, id))));
    const statements = await Promise.all(ids.map((id) => commissions.createStatement(id, "2026-09")));
    const year = new Date().getFullYear();
    assert.deepEqual(statements.map((s) => s.number).sort(), [1, 2, 3, 4, 5].map((n) => `GS-${year}-000${n}`));
    const list = (await val<{ statementId?: string }[]>(KEYS.commissions)) ?? [];
    assert.ok(list.every((c) => statements.some((s) => s.id === c.statementId)), "jede Provision gehört zu ihrer Gutschrift");
  });

  test("Gutschrift: Ausfall beim Speichern → Provisionen werden wieder freigegeben und sind später abrechenbar", async () => {
    const inf = await newInfluencer("Ausfall");
    await commissions.recordCommission(session("cs_test_gsf_dddddd", inf));
    const restore = intercept(async (cmd, pass) => (isCas(cmd, KEYS.influencerStatements) ? new Response("down", { status: 503 }) : pass()));
    try {
      await assert.rejects(commissions.createStatement(inf, "2026-09"), (e: unknown) => e instanceof store.StoreUnreachableError);
    } finally {
      restore();
    }
    const list = (await val<{ statementId?: string }[]>(KEYS.commissions)) ?? [];
    assert.equal(list[0].statementId, undefined, "Zuordnung wurde zurückgenommen");
    assert.equal(((await val<unknown[]>(KEYS.influencerStatements)) ?? []).length, 0);
    const s = await commissions.createStatement(inf, "2026-09");
    assert.equal(s.lines.length, 1);
  });

  test("Gutschrift: Zeitüberschreitung, obwohl gespeichert → keine Freigabe der Provisionen (keine Doppelabrechnung)", async () => {
    const inf = await newInfluencer("Timeout");
    await commissions.recordCommission(session("cs_test_gst_eeeeee", inf));
    const restore = intercept(async (cmd, pass) => {
      if (isCas(cmd, KEYS.influencerStatements)) {
        await pass(); // Redis hat gespeichert …
        throw new DOMException("timeout", "TimeoutError"); // … aber die Antwort kommt nicht mehr an
      }
      return pass();
    });
    let s;
    try {
      s = await commissions.createStatement(inf, "2026-09");
    } finally {
      restore();
    }
    assert.ok(s.number.startsWith("GS-"));
    const list = (await val<{ statementId?: string }[]>(KEYS.commissions)) ?? [];
    assert.equal(list[0].statementId, s.id);
    assert.equal(((await val<unknown[]>(KEYS.influencerStatements)) ?? []).length, 1);
    await assert.rejects(commissions.createStatement(inf, "2026-09"), (e: unknown) => e instanceof commissions.StatementError);
  });

  test("Storno, Wiederherstellung und Gutschrift gleichzeitig → widerspruchsfreier Endstand", async () => {
    const inf = await newInfluencer("Storno");
    await Promise.all(Array.from({ length: 6 }, (_, i) => commissions.recordCommission(session(`cs_test_sto_${String(i).padStart(6, "0")}`, inf))));
    await Promise.allSettled([
      commissions.cancelCommission({ orderId: "cs_test_sto_000000" }),
      commissions.cancelCommission({ paymentIntent: "pi_cs_test_sto_000001" }),
      commissions.createStatement(inf, "2026-09"),
      commissions.cancelCommission({ orderId: "cs_test_sto_000002" }),
    ]);
    const list = (await val<{ orderId: string; status: string; statementId?: string; reversedIn?: string }[]>(KEYS.commissions)) ?? [];
    const statements = (await val<{ id: string; lines: { orderNumber: string; amount: number }[]; net: number }[]>(KEYS.influencerStatements)) ?? [];
    assert.equal(list.length, 6);
    // Jede Position der Gutschrift entspricht genau einer zugeordneten Provision – nichts doppelt, nichts verloren
    for (const s of statements) {
      const assigned = list.filter((c) => c.statementId === s.id);
      assert.equal(s.lines.length, assigned.length);
      assert.equal(s.net, s.lines.reduce((n, l) => n + l.amount, 0));
    }
    // stornierte Provisionen, die schon abgerechnet sind, werden beim nächsten Mal abgezogen (nicht vergessen)
    const reversalsOpen = list.filter((c) => c.status === "storniert" && c.statementId && !c.reversedIn).length;
    const unbilledActive = list.filter((c) => c.status === "vorgemerkt" && !c.statementId).length;
    if (reversalsOpen || unbilledActive) {
      const next = await commissions.createStatement(inf, "2026-09");
      assert.equal(next.lines.filter((l) => l.amount < 0).length, reversalsOpen);
    }
  });
});
