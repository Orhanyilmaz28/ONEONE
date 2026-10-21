/**
 * Master-Auftrag AP5 / Phase 3F – Verkaufsanalysen: Kennzahlen, Erstattungen, Stornierungen, Pfand, Rabattcodes,
 * Zeitvergleiche, Filter, Exporte, Rechte und Leistung. Rein, ohne Netz, ohne Stripe, ohne Datenbank.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { inflateSync } from "node:zlib";

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL", "STRIPE_SECRET_KEY", "ADMIN_DEMO"]) delete process.env[k];
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "exstase-ap5-"));
process.chdir(dir);
const ROOT = path.join(import.meta.dirname, "..");

const an = await import("../lib/office/analytics");
const svc = await import("../lib/office/analytics-service");
const ex = await import("../lib/office/analytics-export");
const model = await import("../lib/office/model");
const filters = await import("../lib/office/filters");
const roles = await import("../lib/office/roles");
const time = await import("../lib/office/time");
const { buildXlsx } = await import("../lib/office/xlsx");
const { calcDealerOrder } = await import("../lib/dealer-order-calc");
const catalogData = JSON.parse(await fs.readFile(path.join(ROOT, "data", "products.json"), "utf8"));

type Product = import("../lib/types").Product;
type OfficeOrder = import("../lib/office/model").OfficeOrder;

after(() => fs.rm(dir, { recursive: true, force: true }));
const mixProduct: Product = { handle: "mix-test", title: "Mix-Test", descriptionHtml: "", tags: [], collections: ["mixpakete"], images: [], options: [], variants: [{ id: "v-mix", title: "2 Trays", price: 3600, available: true, options: {}, cans: 48 }], createdAt: "2026-01-01", contents: [["classic", 1], ["tropical", 1]] };
const PRODUCTS = new Map<string, Product>([...(catalogData.products as Product[]), mixProduct].map((p) => [p.handle, p]));
const T = (iso: string) => Date.parse(iso);
const NOW = T("2026-10-21T12:00:00Z");

let n = 0;
function b2c(o: { at?: string; paid?: boolean; refunded?: number; status?: "offen" | "storniert"; ref?: string; refId?: string; email?: string; customerId?: string; mix?: string; discount?: number; lines?: { d: string; q: number; t: number }[] } = {}): OfficeOrder {
  n++;
  const lines = o.lines ?? [{ d: "Classic", q: 2, t: 3600 }];
  const goods = lines.reduce((s, l) => s + l.t, 0);
  const deposit = 1200;
  const disc = o.discount ?? 0;
  const total = goods + deposit + 590 - disc;
  const s = {
    id: `cs_test_${String(n).padStart(6, "0")}`,
    created: Math.floor(T(o.at ?? "2026-10-15T10:00:00Z") / 1000),
    amount_total: total,
    amount_subtotal: goods + deposit,
    payment_status: o.paid === false ? "unpaid" : "paid",
    metadata: { items: lines.map((l) => `${l.d === "Mix-Test" ? "mix-test" : l.d.toLowerCase()}:${l.q}`).join(","), ...(o.ref ? { ref: o.ref, refId: o.refId ?? "inf1" } : {}), ...(o.customerId ? { customerId: o.customerId } : {}), ...(o.mix ? { mix: o.mix } : {}) },
    customer_details: { name: "Privat Person", email: o.email ?? `kunde${n}@example.de`, address: { line1: "Geheimweg 1", postal_code: "01067", city: "Dresden", country: "DE" } },
    shipping_cost: { amount_total: 590 },
    total_details: { amount_discount: disc, amount_tax: 0 },
    payment_intent: { latest_charge: { amount_refunded: o.refunded ?? 0, refunded: (o.refunded ?? 0) >= total, payment_method_details: { type: "card" } } },
  } as import("../lib/office/model").StripeSessionLike;
  const sl = [...lines.map((l) => ({ description: l.d, quantity: l.q, amount_total: l.t, amount_subtotal: l.t, amount_discount: 0, price: { unit_amount: Math.round(l.t / l.q) } })), { description: "Einwegpfand", quantity: 48, amount_total: deposit, amount_subtotal: deposit, amount_discount: 0, price: { unit_amount: 25 } }];
  return model.fromStripe(s, sl, { status: o.status ?? "offen" }, PRODUCTS, `EX-${s.id.slice(-6).toUpperCase()}`);
}
function b2b(o: { at?: string; dealerId?: string; id?: string; status?: "bestätigt" | "storniert"; qty?: number } = {}): OfficeOrder {
  n++;
  const d = {
    id: o.id ?? `dd${String(n).padStart(14, "0")}`,
    number: `H-2026-${String(n).padStart(4, "0")}`,
    createdAt: o.at ?? "2026-10-14T09:00:00.000Z",
    dealerId: o.dealerId ?? "d1",
    dealerEmail: "einkauf@kiosk.de",
    tierName: "Standard",
    status: o.status ?? "bestätigt",
    history: [],
    calc: calcDealerOrder([{ handle: "classic", title: "Classic", perTray: 24, can: { s1: 40, pal: 35 }, orderable: true }] as never, { classic: o.qty ?? 3 }, { cost: 1190, freeFrom: 0 }),
    delivery: { company: `Kiosk ${o.dealerId ?? "d1"}`, contact: "Ayşe", street: "Industriestr. 5", zip: "04109", city: "Leipzig" },
  } as import("../lib/dealer-orders").DealerOrder;
  return model.fromDealer(d, { id: d.dealerId, company: `Kiosk ${d.dealerId}`, contact: "Ayşe", email: "einkauf@kiosk.de" } as never, PRODUCTS);
}
const oct = time.monthRange(2026, 10);

describe("AP5: Kennzahlen", () => {
  test("Umsatz brutto/netto/USt, Pfand, Versand, Erstattungen, Stornos, unbezahlt, B2C/B2B", () => {
    const paid = b2c();
    const refunded = b2c({ refunded: 1000 });
    const unpaid = b2c({ paid: false });
    const cancelled = b2c({ status: "storniert" });
    const dealer = b2b();
    const t = an.totals([paid, refunded, unpaid, cancelled, dealer]);
    assert.equal(t.orders, 3);
    assert.equal(t.pending, 1, "unbezahlte Privatbestellung zählt noch nicht");
    assert.equal(t.cancelled, 1);
    assert.equal(t.b2c.gross, paid.gross + refunded.gross - 1000);
    assert.equal(t.b2b.gross, dealer.gross);
    assert.equal(t.gross, t.b2c.gross + t.b2b.gross);
    assert.equal(t.vat, t.gross - t.net);
    assert.equal(t.refunds, 1000);
    assert.equal(t.deposit, 1200 * 2 + Math.round(dealer.deposit * 1.19));
    assert.equal(t.shipping, 590 * 2 + Math.round((dealer.shipping ?? 0) * 1.19));
    assert.equal(t.aov, Math.round(t.gross / 3));
    assert.equal(an.totals([]).aov, null);
  });

  test("gleiche Regeln wie die Büro-Übersicht (computeKpis)", async () => {
    const { computeKpis } = await import("../lib/office/kpis");
    const list = [b2c(), b2c({ refunded: 500 }), b2c({ paid: false }), b2c({ status: "storniert" }), b2b()];
    const k = computeKpis(list, oct, NOW);
    const t = an.totals(list);
    assert.equal(t.gross, k.money.gross);
    assert.equal(t.net, k.money.net);
  });
});

describe("AP5: Zeitvergleiche", () => {
  test("Prozent nur mit Basis; absolute Veränderung immer", () => {
    assert.deepEqual(an.change(150, 100), { now: 150, before: 100, abs: 50, pct: 50 });
    assert.equal(an.change(0, 100).pct, -100);
    assert.equal(an.change(500, 0).pct, null);
    assert.equal(ex.pctText(null), "keine Basis");
    assert.equal(ex.pctText(12.345), "+12,3 %");
  });

  test("Vergleichszeitraum: Vortag, Vorwoche, Vormonat (Jan → Dez), Vorjahr, eigener Zeitraum gleich lang", () => {
    const d = an.previousRange(time.dayRange({ y: 2026, m: 3, d: 30 }), "tag");
    assert.equal(d.from, time.berlinToUtc(2026, 3, 29));
    assert.equal(d.to, time.berlinToUtc(2026, 3, 30));
    const w = an.previousRange(time.weekRange(2026, 1), "kw");
    assert.equal(w.to, time.weekRange(2026, 1).from);
    const m = an.previousRange(time.monthRange(2026, 1), "monat-wahl");
    assert.equal(m.from, time.berlinToUtc(2025, 12, 1));
    const y = an.previousRange(time.yearRange(2026), "jahr");
    assert.equal(y.from, time.berlinToUtc(2025, 1, 1));
    const custom = { from: time.berlinToUtc(2026, 10, 5), to: time.berlinToUtc(2026, 10, 15), label: "x" };
    const c = an.previousRange(custom, "zeitraum");
    assert.equal(c.to, custom.from);
    assert.equal(c.to - c.from, custom.to - custom.from);
  });

  test("Analyse vergleicht nur Bestellungen der beiden Zeiträume", () => {
    const req = svc.parseAnalyticsRequest({ zeitraum: "monat-wahl", monat: "2026-10" }, NOW);
    assert.ok(req.ok);
    const a = svc.analyze([b2c({ at: "2026-10-10T10:00:00Z" }), b2c({ at: "2026-10-11T10:00:00Z" }), b2c({ at: "2026-09-10T10:00:00Z" }), b2c({ at: "2026-08-10T10:00:00Z" })], req.req, PRODUCTS, { now: NOW });
    const orders = a.comparison.rows.find((r) => r.key === "orders");
    assert.deepEqual([orders?.change.now, orders?.change.before, orders?.change.pct], [2, 1, 100]);
    assert.equal(a.timeline.length, 31);
    assert.equal(
      a.timeline.reduce((s, b) => s + b.b2c + b.b2b, 0),
      a.current.gross,
    );
  });

  test("Zeitverlauf: Tage bis 62 Tage, sonst Monate", () => {
    assert.equal(an.timeline([], time.yearRange(2026)).length, 12);
    assert.equal(an.timeline([], time.weekRange(2026, 43)).length, 7);
  });
});

describe("AP5: Produkte, Sorten, Händler, Privatkunden", () => {
  test("Produkte und Gruppen: Mengen, Bestellanzahl, Umsatz, Anteil = 100 %", () => {
    const list = [b2c({ lines: [{ d: "Classic", q: 2, t: 3600 }] }), b2c({ lines: [{ d: "Classic", q: 1, t: 1800 }, { d: "Tropical", q: 1, t: 1800 }] }), b2b({ qty: 4 })];
    const prod = an.productStats(list, PRODUCTS);
    const classic = prod.find((r) => r.key === "classic");
    assert.equal(classic?.orders, 3);
    assert.equal(classic?.packs, 2 + 1 + 4);
    assert.ok(Math.abs(prod.reduce((s, r) => s + r.share, 0) - 100) < 0.001);
    const groups = an.productStats(list, PRODUCTS, "group");
    assert.ok(groups.every((g) => g.title));
    assert.ok(!prod.some((r) => /pfand/i.test(r.title)), "Pfand ist kein Produkt");
  });

  test("Sorten: Mixpaket nur mit Zusammensetzung zum Kaufzeitpunkt", () => {
    const without = b2c({ lines: [{ d: "Mix-Test", q: 1, t: 3600 }] });
    const withSnap = b2c({ lines: [{ d: "Mix-Test", q: 1, t: 3600 }], mix: "mix-test=classic*2" });
    const r1 = an.sortStats([without], PRODUCTS);
    assert.equal(r1.rows.length, 0);
    assert.equal(r1.unknownLines, 1);
    const r2 = an.sortStats([withSnap], PRODUCTS);
    assert.equal(r2.rows[0]?.handle, "classic");
    assert.equal(r2.rows[0]?.units, 48);
    assert.equal(r2.rows[0]?.revenue, 0, "Mix-Umsatz wird nicht auf Sorten verteilt");
  });

  test("Händler: Umsatz, wiederkehrend, letzte Bestellung, ohne aktuelle Bestellung", () => {
    const list = [b2b({ dealerId: "d1" }), b2b({ dealerId: "d1", at: "2026-10-20T09:00:00.000Z" }), b2b({ dealerId: "d2" })];
    const last = new Map([["d1", T("2026-10-20T09:00:00Z")], ["d2", T("2026-10-14T09:00:00Z")], ["d4", T("2026-05-01T09:00:00Z")]]);
    const s = an.dealerStats(list, PRODUCTS, [{ id: "d1", company: "A", status: "freigegeben" }, { id: "d3", company: "Neu GmbH", status: "freigegeben" }, { id: "d4", company: "Alt GmbH", status: "freigegeben" }, { id: "d5", company: "Abgelehnt", status: "abgelehnt" }], last, NOW);
    assert.equal(s.rows[0].id, "d1");
    assert.equal(s.rows[0].orders, 2);
    assert.equal(s.rows[0].recurring, true);
    assert.equal(s.rows[0].lastOrder, T("2026-10-20T09:00:00Z"));
    assert.equal(s.recurring, 1);
    assert.deepEqual(s.quiet.map((q) => q.id).sort(), ["d3", "d4"]);
  });

  test("Privatkunden: Konto vor E-Mail, neu/wiederkehrend gegen Vergleichszeitraum", () => {
    const cur = [b2c({ customerId: "c1", email: "a@x.de" }), b2c({ email: "A@x.de" }), b2c({ email: "b@x.de" }), b2c({ email: "b@x.de" })];
    const prev = [b2c({ email: "b@x.de" })];
    const p = an.privateStats(cur, prev);
    assert.equal(p.customers, 3, "konto:c1, email:a@x.de, email:b@x.de");
    assert.equal(p.returning, 1);
    assert.equal(p.newInPeriod, 2);
    assert.equal(p.repeatInPeriod, 1);
    assert.equal(p.orders, 4);
  });
});

describe("AP5: Rabatte und Influencer", () => {
  test("Codes mit Creator und Provision aus dem Provisionsbuch (einmal je Bestellung, ohne Stornos)", () => {
    const a = b2c({ ref: "ANNA10", refId: "inf1", discount: 360 });
    const b = b2c({ ref: "ANNA10", refId: "inf1", discount: 360 });
    const c = b2c({ discount: 500 });
    const d = b2c({ ref: "ANNA10", status: "storniert", discount: 360 });
    const comm = [
      { orderId: a.key.slice(2), code: "ANNA10", amount: 300, status: "vorgemerkt" },
      { orderId: a.key.slice(2), code: "ANNA10", amount: 300, status: "vorgemerkt" },
      { orderId: b.key.slice(2), code: "ANNA10", amount: 250, status: "storniert" },
    ];
    const r = an.discountStats([a, b, c, d, b2b()], new Map([["inf1", "Anna Creator"]]), comm);
    assert.equal(r.codes.length, 1);
    assert.equal(r.codes[0].uses, 2, "stornierte Bestellung zählt nicht");
    assert.equal(r.codes[0].creator, "Anna Creator");
    assert.equal(r.codes[0].discount, 720);
    assert.equal(r.codes[0].commission, 300, "Provision nicht doppelt, stornierte nicht");
    assert.deepEqual(r.mixOrPromo, { orders: 1, discount: 500 });
  });

  test("Filter Rabattcode und Kanal", () => {
    const list = [b2c({ ref: "ANNA10" }), b2c(), b2b()];
    assert.equal(list.filter((o) => an.matchesCode(o, "anna10")).length, 1);
    assert.equal(list.filter((o) => an.matchesCode(o, "ohne")).length, 2);
    assert.equal(list.filter((o) => an.matchesCode(o, "mit")).length, 1);
    const req = svc.parseAnalyticsRequest({ zeitraum: "monat-wahl", monat: "2026-10", typ: "haendler" }, NOW);
    assert.ok(req.ok);
    const a = svc.analyze(list, req.req, PRODUCTS, { now: NOW });
    assert.equal(a.current.b2c.orders, 0);
    assert.equal(a.current.b2b.orders, 1);
    assert.equal(svc.parseAnalyticsRequest({ code: "<script>" }, NOW).ok && (svc.parseAnalyticsRequest({ code: "<script>" }, NOW) as { req: { code: string } }).req.code, "");
  });
});

describe("AP5: Exporte", () => {
  const req = svc.parseAnalyticsRequest({ zeitraum: "monat-wahl", monat: "2026-10" }, NOW);
  assert.ok(req.ok);
  const list = [b2c({ ref: "ANNA10", discount: 100 }), b2c({ refunded: 500 }), b2b()];
  const a = svc.analyze(list, req.req, PRODUCTS, { now: NOW });
  const COMPANY = { name: "Exstase Großhandel GmbH", brand: "EXSTASE", owner: "GF", street: "Carl-Kühne-Str. 4", city: "47638 Straelen", country: "Deutschland", email: "hello@exstase.com", phone: "0211", vatId: "DE311899184", register: "AG Düsseldorf HRB 90042" };

  test("Excel: alle Blätter, Zahlen wie auf der Seite, keine Privatkunden-Daten", () => {
    const sheets = ex.analyticsSheets(a, { createdBy: "Test", now: NOW });
    assert.deepEqual(
      sheets.map((s) => s.name),
      ["Kennzahlen", "Vergleich", "Verlauf", "Produkte", "Produktgruppen", "Sorten", "Händler", "Privatkunden", "Rabattcodes"],
    );
    const flat = JSON.stringify(sheets);
    for (const s of ["Privat Person", "Geheimweg", "@example.de"]) assert.ok(!flat.includes(s), s);
    const gross = sheets[0].rows.find((r) => !Array.isArray(r) && r.cells[0] === "Umsatz brutto");
    assert.equal(!Array.isArray(gross) && gross?.cells[1], a.current.gross / 100);
    const file = buildXlsx(sheets);
    assert.equal(file.subarray(0, 2).toString(), "PK");
  });

  test("PDF entsteht und enthält die Kennzahlen", () => {
    const pdf = ex.analyticsPdf(a, COMPANY, null, { createdBy: "Test", now: NOW });
    assert.equal(pdf.subarray(0, 5).toString(), "%PDF-");
    const raw = pdf.toString("latin1");
    const streams = [...raw.matchAll(/stream\r?\n([\s\S]*?)endstream/g)].map((m) => {
      try {
        return inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
      } catch {
        return m[1];
      }
    });
    const text = streams.join("");
    assert.ok(text.includes("Verkaufsanalyse"));
    assert.ok(!text.includes("Geheimweg"));
  });

  test("Export-Endpunkt: Recht, gleiche Herkunft, Rate-Limit, unvollständige Daten gesperrt, Protokoll", async () => {
    const src = await fs.readFile(path.join(ROOT, "app/api/admin/buero/analyse/route.ts"), "utf8");
    assert.match(src, /assertOffice\("office\.analytics\.export"\)/);
    assert.match(src, /sameOrigin\(request\)/);
    assert.match(src, /hitLimit\("officeAnalytics"/);
    assert.match(src, /if \(!a\.complete\)/);
    assert.match(src, /logActivity\(/);
    assert.match(src, /no-store/);
  });
});

describe("AP5: Rechte und Leistung", () => {
  test("Ansehen alle Büro-Rollen, Export nur Admin + Büro", () => {
    for (const r of ["admin", "buero", "lesen"] as const) assert.ok(roles.can(r, "office.analytics"));
    assert.ok(roles.can("buero", "office.analytics.export"));
    assert.ok(!roles.can("lesen", "office.analytics.export"));
  });

  test("10 000 Bestellungen: Analyse unter 3 Sekunden", () => {
    const list: OfficeOrder[] = [];
    for (let i = 0; i < 10_000; i++) list.push(i % 5 === 0 ? b2b({ dealerId: `d${i % 40}`, at: new Date(T("2026-01-01T00:00:00Z") + i * 3_000_000).toISOString() }) : b2c({ at: new Date(T("2026-01-01T00:00:00Z") + i * 3_000_000).toISOString(), email: `k${i % 900}@x.de`, ...(i % 7 === 0 ? { ref: "ANNA10" } : {}) }));
    const req = svc.parseAnalyticsRequest({ zeitraum: "jahr-wahl", jahr: "2026" }, NOW);
    assert.ok(req.ok);
    const t = performance.now();
    const a = svc.analyze(list, req.req, PRODUCTS, { now: NOW });
    const ms = performance.now() - t;
    assert.ok(a.orderCount > 9000);
    assert.ok(ms < 3000, `${ms.toFixed(0)} ms`);
    console.log(`# Analyse 10 000 Bestellungen: ${ms.toFixed(0)} ms`);
  });

  test("Filter-Bausteine wiederverwendet (keine zweite Filterlogik)", async () => {
    const src = await fs.readFile(path.join(ROOT, "lib/office/analytics-service.ts"), "utf8");
    assert.match(src, /applyFilters/);
    assert.ok(filters.NO_FILTERS);
  });
});

describe("AP5: unvollständige Zusatzdaten", () => {
  test("Händler-Bestellliste nicht lesbar → Analyse als unvollständig markiert (Export gesperrt)", async () => {
    const parsed = svc.parseAnalyticsRequest({ zeitraum: "monat-wahl", monat: "2026-10" }, NOW);
    assert.ok(parsed.ok);
    const load = (async () => ({ orders: [], complete: true, errors: [], source: "demo" as const })) as never;
    process.env.VERCEL = "1"; // Speicher „nicht erreichbar“
    try {
      const a = await svc.loadAnalytics((parsed as { req: import("../lib/office/analytics-service").AnalyticsRequest }).req, NOW, { products: PRODUCTS, load });
      assert.equal(a.complete, false);
      assert.ok(a.errors.some((e) => e.includes("Händler-Bestellliste")), a.errors.join(" | "));
    } finally {
      delete process.env.VERCEL;
    }
  });
});
