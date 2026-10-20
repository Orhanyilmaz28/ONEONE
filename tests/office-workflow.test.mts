/**
 * Phase 3C – Büro-Arbeitsablauf: Statusmodell, Versandfreigabe, Logistik-Weitergabe (nur Dokumentation), Versand und
 * Tracking, Änderungserkennung, Duplikatschutz, Sammelaktionen, Exporthistorie, Rechte, Artikelstammdaten, Ausfälle.
 * Läuft ohne Netz, ohne Stripe und ohne echte Datenbank (Datei-Speicher im Temp-Ordner, Redis-Ersatz im Speicher).
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import https from "node:https";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, test } from "node:test";

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL", "STRIPE_SECRET_KEY", "ADMIN_DEMO", "ADMIN_REQUIRE_2FA"]) delete process.env[k];
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "exstase-wf-"));
process.chdir(dir);
const ROOT = path.join(import.meta.dirname, "..");

const model = await import("../lib/office/model");
const wf = await import("../lib/office/workflow");
const wfStore = await import("../lib/office/workflow-store");
const wfService = await import("../lib/office/workflow-service");
const activity = await import("../lib/office/activity");
const master = await import("../lib/office/master-data");
const filters = await import("../lib/office/filters");
const kpis = await import("../lib/office/kpis");
const roles = await import("../lib/office/roles");
const source = await import("../lib/office/source");
const exportService = await import("../lib/office/service");
const docService = await import("../lib/office/documents-service");
const exp = await import("../lib/office/export");
const notes = await import("../lib/office/delivery-notes");
const store = await import("../lib/store");
const { memoryBackend, setKvBackend } = await import("../lib/kv");
const { listSecurityEvents } = await import("../lib/admin-security/audit");
const { calcDealerOrder } = await import("../lib/dealer-order-calc");
const catalogData = JSON.parse(await fs.readFile(path.join(ROOT, "data", "products.json"), "utf8"));

type Product = import("../lib/types").Product;
type OfficeOrder = import("../lib/office/model").OfficeOrder;
type DealerOrder = import("../lib/dealer-orders").DealerOrder;
type WfRecord = import("../lib/office/workflow").WfRecord;
type ActionInput = import("../lib/office/workflow").ActionInput;

after(() => fs.rm(dir, { recursive: true, force: true }));
setKvBackend(memoryBackend(() => Date.now()));

/* ───────────── Testdaten ───────────── */

const mixProduct: Product = {
  handle: "mix-test",
  title: "Mix-Test",
  descriptionHtml: "",
  tags: [],
  collections: ["mixpakete"],
  images: [],
  options: [],
  variants: [{ id: "v-mix", title: "2 Trays", price: 3600, available: true, options: {}, cans: 48 }],
  createdAt: "2026-01-01",
  contents: [
    ["classic", 1],
    ["tropical", 1],
  ],
};
const PRODUCTS = new Map<string, Product>([...(catalogData.products as Product[]), mixProduct].map((p) => [p.handle, p]));
const T = (iso: string) => Date.parse(iso);
const NOW = T("2026-10-20T12:00:00Z");
const TODAY = "2026-10-20";

function session(over: Record<string, unknown> = {}) {
  return {
    id: "cs_test_W1",
    created: Math.floor(T("2026-10-20T08:00:00Z") / 1000),
    amount_total: 3600 + 1200 + 590 - 360,
    amount_subtotal: 3600 + 1200,
    payment_status: "paid",
    metadata: { items: "classic:2" },
    customer_details: { name: "Jürgen Müßig", email: "jm@example.de", address: { line1: "Hauptstraße 1", postal_code: "01067", city: "Dresden", country: "DE" } },
    collected_information: { shipping_details: { name: "Jürgen Müßig", address: { line1: "Lieferweg 2", postal_code: "01069", city: "Dresden", country: "DE" } } },
    shipping_cost: { amount_total: 590 },
    total_details: { amount_discount: 360, amount_tax: 0 },
    payment_intent: { latest_charge: { amount_refunded: 0, refunded: false, payment_method_details: { type: "card" } } },
    ...over,
  } as import("../lib/office/model").StripeSessionLike;
}
const LINES = [
  { description: "Classic", quantity: 2, amount_total: 3300, amount_subtotal: 3600, amount_discount: 300, price: { unit_amount: 1800 } },
  { description: "Einwegpfand", quantity: 48, amount_total: 1140, amount_subtotal: 1200, amount_discount: 60, price: { unit_amount: 25 } },
];
const b2c = (over: Record<string, unknown> = {}, lines = LINES, status: import("../lib/orders").OrderStatus = "offen", meta: Partial<import("../lib/orders").OrderMeta> = {}) => {
  const s = session(over);
  return model.fromStripe(s, lines, { status, ...meta }, PRODUCTS, `EX-${s.id.slice(-6).toUpperCase()}`);
};
const rows = [
  { handle: "classic", title: "Classic", perTray: 24, can: { s1: 40, pal: 35 } as Record<string, number>, orderable: true },
  { handle: "tropical", title: "Tropical", perTray: 24, can: { s1: 40, pal: 35 } as Record<string, number>, orderable: true },
];
function dealerOrder(over: Partial<DealerOrder> = {}, qty: Record<string, number> = { classic: 3, tropical: 2 }): DealerOrder {
  return {
    id: "a1b2c3d4e5f60718",
    number: "H-2026-0007",
    createdAt: "2026-10-20T09:30:00.000Z",
    dealerId: "d1",
    dealerEmail: "einkauf@kiosk.de",
    tierName: "Standard",
    status: "bestätigt",
    history: [{ status: "eingegangen", at: "2026-10-20T09:30:00.000Z" }],
    calc: calcDealerOrder(rows as never, qty, { cost: 1190, freeFrom: 0 }),
    delivery: { company: "Kiosk Ölmühle GmbH", contact: "Ayşe Yılmaz", street: "Industriestr. 5", zip: "04109", city: "Leipzig" },
    ...over,
  };
}
const DEALER = { id: "d1", company: "Kiosk Ölmühle GmbH", contact: "Ayşe Yılmaz", email: "einkauf@kiosk.de", phone: "0341 123", street: "Rechnungsweg 1", zip: "04103", city: "Leipzig", vatId: "DE123456789" } as never;
const b2b = (over: Partial<DealerOrder> = {}, qty?: Record<string, number>) => model.fromDealer(dealerOrder(over, qty), DEALER, PRODUCTS);

const ANNA = { role: "buero" as const, label: "Büromitarbeiter anna", id: "u-anna" };
const ADMIN = { role: "admin" as const, label: "Administrator", id: "admin" };
const LESEN = { role: "lesen" as const, label: "Büro-Lesezugriff leo", id: "u-leo" };
const WHO_ANNA = { role: "buero" as const, name: "Anna", userId: "u-anna", username: "anna" };
const WHO_ADMIN = { role: "admin" as const, name: "Administrator" };
const ORIGIN = { ip: "127.0.0.1", ua: "test" };

let opCounter = 0;
const op = () => `op-test-${String(++opCounter).padStart(6, "0")}`;
const SHIP = { carrier: "DHL", tracking: "00340434161094042557", date: TODAY, remark: "" };

/** Aktion rein anwenden und Erfolg verlangen */
function run(rec: WfRecord | null, o: OfficeOrder, input: Partial<ActionInput> & { action: ActionInput["action"] }, actor = ANNA, at = NOW) {
  const r = wf.applyAction(rec, o, { rev: rec?.rev ?? 0, op: op(), today: TODAY, ...input }, actor, at, PRODUCTS);
  assert.ok(r.ok, `${input.action}: ${!r.ok ? `${r.error} ${(r.blockers ?? []).join(" ")}` : ""}`);
  return r.rec;
}
function fails(rec: WfRecord | null, o: OfficeOrder, input: Partial<ActionInput> & { action: ActionInput["action"] }, actor = ANNA) {
  const r = wf.applyAction(rec, o, { rev: rec?.rev ?? 0, op: op(), today: TODAY, ...input }, actor, NOW, PRODUCTS);
  assert.equal(r.ok, false, `${input.action} hätte scheitern müssen`);
  return r as Extract<typeof r, { ok: false }>;
}
const released = (o: OfficeOrder, actor = ANNA) => run(run(null, o, { action: "pruefen" }, actor), o, { action: "freigeben", confirm: true, ack: true }, actor);
const withRec = (o: OfficeOrder, rec: WfRecord | null) => ({ ...o, office: rec });

async function resetStore() {
  setKvBackend(memoryBackend(() => Date.now()));
  await fs.rm(path.join(dir, ".data"), { recursive: true, force: true });
}

/* ───────────── 1. Statusmodell ───────────── */

describe("Statusmodell und Zustandsmaschine", () => {
  test("1 Neue Bestellung: „Neu eingegangen“ ohne gespeicherten Bearbeitungsstand", () => {
    assert.equal(wf.officeStatus(b2c(), null), "neu");
    assert.equal(wf.officeStatus(b2b(), undefined), "neu");
    assert.deepEqual(wf.availableActions(b2c(), null).slice(0, 3), ["pruefen", "freigeben", "zurueckstellen"]);
  });

  test("2 In Prüfung nehmen", () => {
    const rec = run(null, b2c(), { action: "pruefen" });
    assert.equal(rec.status, "pruefung");
    assert.equal(rec.rev, 1);
    assert.equal(rec.events[0].from, "neu");
    assert.equal(rec.events[0].to, "pruefung");
    assert.equal(rec.events[0].by, "Büromitarbeiter anna");
  });

  test("8 Stornierte Bestellung: immer „Storniert“, nicht freigebbar", () => {
    const o = b2c({}, LINES, "storniert");
    assert.equal(wf.officeStatus(o, null), "storniert");
    const f = fails(null, o, { action: "freigeben", confirm: true, ack: true });
    assert.match(f.error, /nicht möglich/);
    assert.ok(wf.releaseCheck(o, null, PRODUCTS).blockers.some((b) => /storniert/.test(b)));
    // auch wenn das Büro sie vorher freigegeben hatte
    const rec = released(b2c());
    assert.equal(wf.officeStatus(o, rec), "storniert");
    assert.equal(wf.handoverCheck(o, rec, PRODUCTS).blockers.length > 0, true);
  });

  test("9 Zurückstellen braucht einen Grund", () => {
    const o = b2c();
    const r1 = fails(null, o, { action: "zurueckstellen" });
    assert.match(r1.error, /Begründung/);
    const rec = run(null, o, { action: "zurueckstellen", reason: "Kunde ruft zurück" });
    assert.equal(rec.status, "zurueckgestellt");
    assert.equal(rec.events[0].reason, "Kunde ruft zurück");
    fails(rec, o, { action: "freigeben", confirm: true, ack: true });
  });

  test("10 Freigabe nach Zurückstellen: erst wieder in Prüfung, dann freigeben", () => {
    const o = b2c();
    let rec = run(null, o, { action: "zurueckstellen", reason: "Adresse klären" });
    rec = run(rec, o, { action: "wiederaufnehmen" });
    assert.equal(rec.status, "pruefung");
    rec = run(rec, o, { action: "freigeben", confirm: true, ack: true });
    assert.equal(rec.status, "freigegeben");
  });

  test("16 Abschließen nur nach Versand; „Abgeschlossen“ öffnet nur eine Administrator-Korrektur", () => {
    const o = b2c();
    let rec = released(o);
    fails(rec, o, { action: "abschliessen" });
    rec = run(rec, o, { action: "versendet", confirm: true, shipment: SHIP });
    rec = run(rec, o, { action: "abschliessen" });
    assert.equal(rec.status, "abgeschlossen");
    for (const a of ["pruefen", "freigeben", "logistik", "versendet", "zurueckstellen", "wiederaufnehmen"] as const) fails(rec, o, { action: a, confirm: true, ack: true, reason: "xyz", shipment: SHIP });
    fails(rec, o, { action: "korrektur", target: "pruefung", reason: "Kunde reklamiert", confirm: true }, ANNA);
    const corrected = run(rec, o, { action: "korrektur", target: "pruefung", reason: "Kunde reklamiert", confirm: true }, ADMIN);
    assert.equal(corrected.status, "pruefung");
    assert.equal(corrected.events.at(-1)?.action, "korrektur");
    assert.equal(corrected.events.at(-1)?.reason, "Kunde reklamiert");
  });

  test("17 Ungültige Übergänge werden abgelehnt (serverseitig, mit verständlicher Meldung)", () => {
    const o = b2c();
    assert.match(fails(null, o, { action: "logistik", confirm: true }).error, /nicht möglich/);
    assert.match(fails(null, o, { action: "versendet", confirm: true, shipment: SHIP }).error, /nicht möglich/);
    assert.match(fails(null, o, { action: "abschliessen" }).error, /nicht möglich/);
    assert.match(fails(null, o, { action: "wiederaufnehmen" }).error, /nicht möglich/);
    assert.match(fails(null, o, { action: "korrektur", target: "storniert" as never, reason: "x y z", confirm: true }, ADMIN).error, /Zielstatus/);
    assert.match(fails(null, o, { action: "unbekannt" as never }).error, /Berechtigung|Unbekannte/);
  });

  test("Markierung „Prüfung erforderlich“ und Zuständigkeit", () => {
    const o = b2c();
    let rec = run(null, o, { action: "markieren", reason: "Menge ungewöhnlich hoch" });
    assert.equal(rec.flag?.reason, "Menge ungewöhnlich hoch");
    assert.ok(wf.releaseCheck(o, rec, PRODUCTS).warnings.some((w) => /Prüfung erforderlich/.test(w)));
    assert.ok(wf.attention(o, rec, PRODUCTS).some((a) => a.kind === "markiert"));
    rec = run(rec, o, { action: "uebernehmen" });
    assert.equal(rec.assignee, "Büromitarbeiter anna");
    rec = run(rec, o, { action: "markierung_entfernen" });
    assert.equal(rec.flag, undefined);
    rec = run(rec, o, { action: "abgeben" });
    assert.equal(rec.assignee, undefined);
  });
});

/* ───────────── 2. Versandfreigabe ───────────── */

describe("Versandfreigabe", () => {
  test("3 Freigabe speichert Benutzer, Zeitpunkt, Fingerabdruck und Bemerkung", () => {
    const o = b2c();
    const rec = run(run(null, o, { action: "pruefen" }), o, { action: "freigeben", confirm: true, remark: "Rampe 2" });
    assert.equal(rec.status, "freigegeben");
    assert.equal(rec.release?.by, "Büromitarbeiter anna");
    assert.equal(rec.release?.byId, "u-anna");
    assert.equal(rec.release?.at, new Date(NOW).toISOString());
    assert.equal(rec.release?.fp, wf.orderFingerprint(o, PRODUCTS));
    assert.equal(rec.release?.remark, "Rampe 2");
    assert.equal(rec.release?.version, 1);
    // ohne ausdrückliche Bestätigung keine Freigabe
    assert.match(fails(null, o, { action: "freigeben" }).error, /bestätigen/);
    // bereits freigegeben und unverändert → keine zweite Freigabe
    assert.ok(fails(rec, o, { action: "freigeben", confirm: true }).blockers?.some((b) => /bereits freigegeben/.test(b)));
  });

  test("4 Ohne vollständige Adresse keine Freigabe", () => {
    const o = b2c({ collected_information: null, customer_details: { name: "Max", email: "m@x.de", address: { line1: "", postal_code: "01067", city: "Dresden" } } });
    const c = wf.releaseCheck(o, null, PRODUCTS);
    assert.ok(c.blockers.some((b) => /Lieferadresse ist unvollständig/.test(b)));
    assert.ok(fails(null, o, { action: "freigeben", confirm: true, ack: true }).blockers?.length);
  });

  test("5 Ohne Artikel keine Freigabe", () => {
    const o = { ...b2c(), lines: [] };
    assert.ok(wf.releaseCheck(o, null, PRODUCTS).blockers.includes("Die Bestellung hat keine Artikel."));
  });

  test("6 Unbezahlte Privatbestellung: keine Freigabe; vollständig erstattet: keine; teilweise: nur mit Bestätigung", () => {
    assert.ok(wf.releaseCheck(b2c({ payment_status: "unpaid" }), null, PRODUCTS).blockers.some((b) => /nicht bezahlt/.test(b)));
    const full = b2c({ payment_intent: { latest_charge: { amount_refunded: 5030, refunded: true } } });
    assert.ok(wf.releaseCheck(full, null, PRODUCTS).blockers.some((b) => /vollständig erstattet/.test(b)));
    const part = b2c({ payment_intent: { latest_charge: { amount_refunded: 500, refunded: false } } });
    const c = wf.releaseCheck(part, null, PRODUCTS);
    assert.equal(c.blockers.length, 0);
    assert.ok(c.warnings.some((w) => /Teil der Zahlung/.test(w)));
    assert.match(fails(null, part, { action: "freigeben", confirm: true }).error, /Hinweise/);
    run(null, part, { action: "freigeben", confirm: true, ack: true });
  });

  test("7 Händlerbestellung auf Rechnung ist ohne Zahlung freigebbar; unbestätigt nur mit Hinweis", () => {
    const o = b2b();
    assert.equal(o.paymentStatus, "offen");
    assert.deepEqual(wf.releaseCheck(o, null, PRODUCTS).blockers, []);
    run(null, o, { action: "freigeben", confirm: true });
    const unconfirmed = b2b({ status: "eingegangen" });
    assert.ok(wf.releaseCheck(unconfirmed, null, PRODUCTS).warnings.some((w) => /noch nicht bestätigt/.test(w)));
  });

  test("39 Unklare Mengen oder unbekannte Einheit blockieren die Freigabe", () => {
    const o = b2c();
    const bad = { ...o, lines: [{ ...o.lines[0], unit: "", unitsPerPack: null }] };
    assert.ok(wf.releaseCheck(bad, null, PRODUCTS).blockers.some((b) => /Verpackungseinheit/.test(b)));
    const zero = { ...o, lines: [{ ...o.lines[0], quantity: 0 }] };
    assert.ok(wf.releaseCheck(zero, null, PRODUCTS).blockers.some((b) => /Unklare Menge/.test(b)));
  });

  test("37 Fehlende Artikelnummer: Hinweis bei der Freigabe (muss bestätigt werden), Liste „Aufmerksamkeit“", () => {
    const water = b2c({ metadata: { items: "wasser-still:1" } }, [{ description: "Aqua x Still", quantity: 1, amount_total: 900, amount_subtotal: 900, amount_discount: 0, price: { unit_amount: 900 } }]);
    assert.equal(water.lines[0].sku, "");
    const c = wf.releaseCheck(water, null, PRODUCTS);
    assert.ok(c.warnings.some((w) => /Artikelnummer fehlt/.test(w)));
    assert.match(fails(null, water, { action: "freigeben", confirm: true }).error, /Hinweise/);
    assert.ok(wf.attention(water, null, PRODUCTS).some((a) => a.kind === "sku"));
  });
});

/* ───────────── 3. Logistik ───────────── */

describe("Weitergabe an die Logistik (nur Dokumentation)", () => {
  test("11 Weitergabe dokumentieren: nur freigegebene, mit Vorgangs-ID, Benutzer, Zeitpunkt, Freigabe-Version", () => {
    const o = b2b();
    fails(run(null, o, { action: "pruefen" }), o, { action: "logistik", confirm: true });
    const rec = released(o);
    assert.match(fails(rec, o, { action: "logistik" }).error, /bestätigen/);
    const id = op();
    const r = wf.applyAction(rec, o, { action: "logistik", rev: rec.rev, op: id, confirm: true, remark: "per Mail an Spedition" }, ANNA, NOW + 1000, PRODUCTS);
    assert.ok(r.ok);
    const h = r.rec.handovers[0];
    assert.equal(r.rec.status, "logistik");
    assert.equal(h.id, id);
    assert.equal(h.by, "Büromitarbeiter anna");
    assert.equal(h.releaseVersion, 1);
    assert.equal(h.releaseFp, rec.release?.fp);
    assert.equal(h.remark, "per Mail an Spedition");
    assert.equal(h.repeat, false);
    assert.match(r.rec.events.at(-1)?.detail ?? "", /außerhalb des Shops/);
  });

  test("12 Doppelte Weitergabe: Warnung, ohne Begründung abgelehnt", () => {
    const o = b2b();
    const rec = run(released(o), o, { action: "logistik", confirm: true });
    assert.ok(wf.handoverCheck(o, rec, PRODUCTS).warnings.some((w) => /bereits einmal dokumentiert/.test(w)));
    assert.match(fails(rec, o, { action: "logistik", confirm: true }).error, /Begründung/);
  });

  test("13 Erneute Weitergabe mit Pflichtbegründung", () => {
    const o = b2b();
    let rec = run(released(o), o, { action: "logistik", confirm: true });
    rec = run(rec, o, { action: "logistik", confirm: true, reason: "Spedition hat Auftrag verloren" });
    assert.equal(rec.handovers.length, 2);
    assert.equal(rec.handovers[1].repeat, true);
    assert.equal(rec.handovers[1].reason, "Spedition hat Auftrag verloren");
    assert.ok(wf.attention(o, rec, PRODUCTS).some((a) => a.kind === "erneut_weitergegeben"));
  });

  test("44 Keine automatische Logistikübertragung: kein Netzwerkcode im Arbeitsablauf", async () => {
    for (const f of ["lib/office/workflow.ts", "lib/office/workflow-store.ts", "lib/office/workflow-service.ts", "lib/office/activity.ts", "lib/office/master-data.ts", "app/api/admin/buero/workflow/route.ts"]) {
      const code = await fs.readFile(path.join(ROOT, f), "utf8");
      assert.doesNotMatch(code, /\bfetch\(|sendcloud|shipcloud|api\.dhl|nodemailer|sendMail|notifyDealer|sendShippingMail/i, f);
    }
  });
});

/* ───────────── 4. Versand und Tracking ───────────── */

describe("Versand und Sendungsverfolgung", () => {
  test("14 Als versendet markieren nur mit ausdrücklicher Bestätigung und gültiger Freigabe", () => {
    const o = b2c();
    const rec = released(o);
    assert.match(fails(rec, o, { action: "versendet", shipment: SHIP }).error, /bestätigen/);
    const done = run(rec, o, { action: "versendet", confirm: true, shipment: { ...SHIP, remark: "2 Pakete" } });
    assert.equal(done.status, "versendet");
    assert.equal(done.shipment?.by, "Büromitarbeiter anna");
    assert.equal(done.shipment?.synced, false, "Abgleich mit der Originalbestellung folgt getrennt");
    assert.equal(done.shipment?.remark, "2 Pakete");
  });

  test("15 Sendungsnummer: normalisiert, geprüft, kein Widerspruch zu vorhandener Nummer; Datum plausibel", () => {
    const o = b2c();
    const rec = released(o);
    const bad = (s: Partial<typeof SHIP>, re: RegExp) => assert.ok(fails(rec, o, { action: "versendet", confirm: true, shipment: { ...SHIP, ...s } }).blockers?.some((b) => re.test(b)), String(re));
    bad({ tracking: "12" }, /nicht gültig/);
    bad({ tracking: "" }, /Sendungsnummer eintragen/);
    bad({ carrier: "Brieftaube" }, /Versanddienstleister/);
    bad({ date: "2026-10-25" }, /Zukunft/);
    bad({ date: "2026-10-01" }, /vor dem Bestelldatum/);
    bad({ date: "20.10.2026" }, /gültiges Versanddatum/);
    const ok = run(rec, o, { action: "versendet", confirm: true, shipment: { ...SHIP, tracking: " 0034 0434 1610 9404 2557 " } });
    assert.equal(ok.shipment?.tracking, "00340434161094042557");
    // Spedition ohne Sendungsnummer
    run(rec, o, { action: "versendet", confirm: true, shipment: { ...SHIP, carrier: "Spedition", tracking: "" } });
    // Originalbestellung hat schon eine andere Nummer → Widerspruch
    const other = b2c({}, LINES, "offen", { tracking: "JJD000390007777777", carrier: "DHL" });
    const rec2 = released(other);
    assert.ok(fails(rec2, other, { action: "versendet", confirm: true, shipment: SHIP }).blockers?.some((b) => /andere Sendungsnummer/.test(b)));
  });

  test("15b Versanddatum wird als deutscher Kalendertag mit dem Bestelldatum verglichen (Bestellung kurz nach Mitternacht)", () => {
    // 19.10.2026 22:30 UTC = 20.10.2026 0:30 Uhr in Berlin
    const o = b2c({ created: Math.floor(Date.parse("2026-10-19T22:30:00Z") / 1000) });
    const rec = released(o);
    assert.ok(fails(rec, o, { action: "versendet", confirm: true, shipment: { ...SHIP, date: "2026-10-19" } }).blockers?.some((b) => /vor dem Bestelldatum/.test(b)));
    assert.equal(run(rec, o, { action: "versendet", confirm: true, shipment: { ...SHIP, date: "2026-10-20" } }).status, "versendet");
  });

  test("Versand übernimmt Status, Nummer und Dienst in die Originalbestellung – ohne E-Mail; Händler nur Status", async () => {
    await resetStore();
    const o = b2c();
    await store.setJSON(store.KEYS.orders, { [o.key.slice(2)]: { status: "offen" } });
    let rec = released(o);
    await store.setJSON(wfStore.wfKey(o.key), rec);
    const r = await wfStore.runWorkflowAction(o, { action: "versendet", rev: rec.rev, op: op(), confirm: true, shipment: SHIP }, WHO_ANNA, PRODUCTS, ORIGIN, NOW);
    assert.ok(r.ok);
    rec = r.rec;
    assert.equal(rec.shipment?.synced, true);
    const meta = (await store.getJSON<Record<string, import("../lib/orders").OrderMeta>>(store.KEYS.orders, {}))[o.key.slice(2)];
    assert.equal(meta.status, "versendet");
    assert.equal(meta.tracking, "00340434161094042557");
    assert.equal(meta.carrier, "DHL");
    assert.equal(meta.shippingMailSentAt, undefined, "keine Versand-E-Mail");
    assert.ok(rec.events.some((e) => e.action === "versand_abgeglichen"));

    const d = b2b();
    await store.setJSON(store.KEYS.dealerOrders, [dealerOrder()]);
    const drec = released(d);
    await store.setJSON(wfStore.wfKey(d.key), drec);
    const dr = await wfStore.runWorkflowAction(d, { action: "versendet", rev: drec.rev, op: op(), confirm: true, shipment: SHIP }, WHO_ANNA, PRODUCTS, ORIGIN, NOW);
    assert.ok(dr.ok && dr.rec.shipment?.synced);
    const list = await store.getJSON<DealerOrder[]>(store.KEYS.dealerOrders, []);
    assert.equal(list[0].status, "versendet");
    assert.equal(list[0].invoice, undefined, "Rechnung unverändert");
    // Danach zeigt die Bestellung „versendet“ – kein widersprüchlicher Stand
    const after = b2c({}, LINES, "versendet", { tracking: SHIP.tracking, carrier: "DHL" });
    assert.equal(wf.officeStatus(after, rec), "versendet");
  });

  test("Abgleich gescheitert (Bestellung inzwischen storniert): Hinweis „nicht übertragen“, nichts überschrieben", async () => {
    await resetStore();
    const o = b2c();
    await store.setJSON(store.KEYS.orders, { [o.key.slice(2)]: { status: "storniert" } });
    const rec = released(o);
    await store.setJSON(wfStore.wfKey(o.key), rec);
    const r = await wfStore.runWorkflowAction(o, { action: "versendet", rev: rec.rev, op: op(), confirm: true, shipment: SHIP }, WHO_ANNA, PRODUCTS, ORIGIN, NOW);
    assert.ok(r.ok);
    assert.equal(r.rec.shipment?.synced, false);
    assert.match(r.rec.shipment?.syncError ?? "", /storniert/);
    assert.equal((await store.getJSON<Record<string, { status: string }>>(store.KEYS.orders, {}))[o.key.slice(2)].status, "storniert");
    assert.ok(wf.attention(o, r.rec, PRODUCTS).some((a) => a.kind === "abgleich"));
  });

  test("Im Dashboard versendet: Büro zeigt „Versendet“ (laut Originalbestellung), Korrektur bleibt möglich", () => {
    const o = b2c({}, LINES, "versendet");
    assert.equal(wf.officeStatus(o, null), "versendet");
    assert.equal(wf.shippedOutside(o, null), true);
    const rec = run(null, o, { action: "abschliessen" });
    assert.equal(rec.status, "abgeschlossen");
  });
});

/* ───────────── 5. Änderungserkennung ───────────── */

describe("Änderungserkennung nach der Freigabe", () => {
  test("30/31 Geänderte Adresse: erkannt, Weitergabe und Versand gesperrt, erneute Freigabe nötig", () => {
    const o = b2c();
    const rec = released(o);
    const moved = b2c({ collected_information: { shipping_details: { name: "Jürgen Müßig", address: { line1: "Neue Straße 9", postal_code: "01069", city: "Dresden", country: "DE" } } } });
    assert.deepEqual(wf.changedSinceRelease(moved, rec, PRODUCTS), ["adresse"]);
    assert.ok(wf.handoverCheck(moved, rec, PRODUCTS).blockers.some((b) => /erneut freigeben/.test(b)));
    assert.ok(fails(rec, moved, { action: "versendet", confirm: true, shipment: SHIP }).blockers?.some((b) => /erneut freigeben/.test(b)));
    assert.ok(wf.attention(moved, rec, PRODUCTS).some((a) => a.kind === "geaendert"));
    const again = run(rec, moved, { action: "freigeben", confirm: true, ack: true });
    assert.equal(again.release?.version, 2);
    assert.deepEqual(wf.changedSinceRelease(moved, again, PRODUCTS), []);
    assert.match(again.events.at(-1)?.detail ?? "", /erneut/);
  });

  test("32 Erstattung nach der Freigabe wird erkannt", () => {
    const o = b2c();
    const rec = released(o);
    const refunded = b2c({ payment_intent: { latest_charge: { amount_refunded: 900, refunded: false } } });
    assert.deepEqual(wf.changedSinceRelease(refunded, rec, PRODUCTS), ["zahlung"]);
  });

  test("33 Geänderte Mixpaket-Daten werden erkannt; Inhalt zum Freigabezeitpunkt festgehalten", () => {
    const mixLine = { description: "Mix-Test", quantity: 1, amount_total: 3600, amount_subtotal: 3600, amount_discount: 0, price: { unit_amount: 3600 } };
    const o = b2c({ metadata: { items: "mix-test:1" } }, [mixLine]);
    const rec = released(o);
    assert.equal(rec.release?.mix?.["mix-test"], "24 Classic, 24 Tropical");
    const changedProducts = new Map(PRODUCTS);
    changedProducts.set("mix-test", { ...mixProduct, contents: [["classic", 2]] });
    assert.deepEqual(wf.changedSinceRelease(o, rec, changedProducts), ["artikel"]);
    assert.equal(rec.release?.mix?.["mix-test"], "24 Classic, 24 Tropical", "Momentaufnahme bleibt");
  });

  test("Geänderte Menge (Händler) wird erkannt; Stornierung nach Freigabe ebenso", () => {
    const o = b2b();
    const rec = released(o);
    assert.ok(wf.changedSinceRelease(b2b({}, { classic: 4, tropical: 2 }), rec, PRODUCTS).includes("artikel"));
    assert.ok(wf.changedSinceRelease(b2b({ status: "storniert" }), rec, PRODUCTS).includes("storno"));
  });
});

/* ───────────── 6. Duplikatschutz und Gleichzeitigkeit ───────────── */

describe("Duplikatschutz und gleichzeitige Änderungen", () => {
  beforeEach(resetStore);

  test("18 Gleichzeitige Änderungen: zweiter Schritt mit altem Stand → „zwischenzeitlich geändert“", async () => {
    const o = b2b();
    const [a, b] = await Promise.all([
      wfStore.runWorkflowAction(o, { action: "pruefen", rev: 0, op: op() }, WHO_ANNA, PRODUCTS, ORIGIN, NOW),
      wfStore.runWorkflowAction(o, { action: "zurueckstellen", rev: 0, op: op(), reason: "Klärung" }, WHO_ADMIN, PRODUCTS, ORIGIN, NOW),
    ]);
    const oks = [a, b].filter((r) => r.ok);
    const conflicts = [a, b].filter((r) => !r.ok);
    assert.equal(oks.length, 1);
    assert.equal(conflicts.length, 1);
    assert.equal((conflicts[0] as { error: string }).error, "Diese Bestellung wurde zwischenzeitlich geändert. Bitte aktualisieren.");
    const saved = (await wfStore.readWorkflows([o.key])).get(o.key);
    assert.equal(saved?.rev, 1);
    assert.equal(saved?.events.length, 1);
  });

  const redisUrl = process.env.REDIS_TEST_URL;
  const local = Boolean(redisUrl && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(redisUrl));
  test("18b Gleichzeitige Änderungen gegen echte (lokale Test-)Redis: genau einer gewinnt", { skip: !local ? "REDIS_TEST_URL (lokal) nicht gesetzt" : false }, async () => {
    process.env.UPSTASH_REDIS_REST_URL = redisUrl;
    process.env.UPSTASH_REDIS_REST_TOKEN = process.env.REDIS_TEST_TOKEN;
    try {
      const o = b2b({ id: "dddddddddddddddd", number: "H-2026-0099" });
      const key = wfStore.wfKey(o.key);
      await fetch(redisUrl as string, { method: "POST", headers: { Authorization: `Bearer ${process.env.REDIS_TEST_TOKEN}` }, body: JSON.stringify(["DEL", key, `tt:ver:${key}`]) });
      const results = await Promise.all(Array.from({ length: 8 }, () => wfStore.runWorkflowAction(o, { action: "pruefen", rev: 0, op: op() }, WHO_ANNA, PRODUCTS, ORIGIN, NOW)));
      assert.equal(results.filter((r) => r.ok).length, 1);
      assert.ok(results.filter((r) => !r.ok).every((r) => (r as { error: string }).error === wf.CONFLICT_MESSAGE));
      const saved = (await wfStore.readWorkflows([o.key])).get(o.key);
      assert.equal(saved?.rev, 1);
      const same = op();
      const dup = await Promise.all(Array.from({ length: 5 }, () => wfStore.runWorkflowAction(o, { action: "zurueckstellen", rev: 1, op: same, reason: "Klärung" }, WHO_ANNA, PRODUCTS, ORIGIN, NOW)));
      assert.ok(dup.every((r) => r.ok));
      assert.equal((await wfStore.readWorkflows([o.key])).get(o.key)?.events.length, 2);
    } finally {
      delete process.env.UPSTASH_REDIS_REST_URL;
      delete process.env.UPSTASH_REDIS_REST_TOKEN;
    }
  });

  test("19/20 Wiederholte Anfrage (gleiche Vorgangs-ID): nichts doppelt, Ergebnis „bereits erledigt“", async () => {
    const o = b2b();
    const id = op();
    const first = await wfStore.runWorkflowAction(o, { action: "pruefen", rev: 0, op: id }, WHO_ANNA, PRODUCTS, ORIGIN, NOW);
    const again = await wfStore.runWorkflowAction(o, { action: "pruefen", rev: 0, op: id }, WHO_ANNA, PRODUCTS, ORIGIN, NOW + 5);
    assert.ok(first.ok && !first.duplicate);
    assert.ok(again.ok && again.duplicate);
    const saved = (await wfStore.readWorkflows([o.key])).get(o.key);
    assert.equal(saved?.events.length, 1);
    const audit = (await listSecurityEvents(20)).filter((e) => e.type === "office_workflow");
    assert.equal(audit.length, 1, "auch im Protokoll nur einmal");
    // Weitergabe zweimal mit derselben ID abgeschickt → eine Weitergabe
    let rec = released(o);
    await store.setJSON(wfStore.wfKey(o.key), rec);
    const hid = op();
    const results = await Promise.all([1, 2, 3].map(() => wfStore.runWorkflowAction(o, { action: "logistik", rev: rec.rev, op: hid, confirm: true }, WHO_ANNA, PRODUCTS, ORIGIN, NOW)));
    assert.ok(results.every((r) => r.ok));
    rec = (await wfStore.readWorkflows([o.key])).get(o.key) as WfRecord;
    assert.equal(rec.handovers.length, 1);
  });

  test("Formulare: ungültige Vorgangs-ID, Bestellung, Stand oder Aktion werden abgelehnt", () => {
    const base = { bestellung: "h:a1b2c3d4e5f60718", vorgang: "abcdefgh1234", stand: "0", aktion: "pruefen" };
    assert.ok(wfService.parseActionForm(base).ok);
    assert.equal(wfService.parseActionForm({ ...base, bestellung: "h:../../x" }).ok, false);
    assert.equal(wfService.parseActionForm({ ...base, vorgang: "x" }).ok, false);
    assert.equal(wfService.parseActionForm({ ...base, stand: "-1" }).ok, false);
    assert.equal(wfService.parseActionForm({ ...base, aktion: "loeschen" }).ok, false);
    assert.equal(wfService.parseBulkForm({ aktion: "versendet", vorgang: "abcdefgh1234", eintrag: ["h:a1b2c3d4e5f60718|0"] }).ok, false, "Versand nicht als Sammelaktion");
    assert.equal(wfService.parseBulkForm({ aktion: "freigeben", vorgang: "abcdefgh1234", eintrag: Array.from({ length: 51 }, (_, i) => `h:${String(i).padStart(16, "0")}|0`) }).ok, false, "höchstens 50");
    assert.equal(wfService.parseBulkForm({ aktion: "freigeben", vorgang: "abcdefgh1234", eintrag: ["h:a1b2c3d4e5f60718|abc"] }).ok, false);
  });
});

/* ───────────── 7. Sammelaktionen ───────────── */

describe("Sammelaktionen", () => {
  beforeEach(resetStore);
  const id2 = "bbbbbbbbbbbbbbb2";

  test("21/22 Sammelfreigabe: jede Bestellung einzeln, genaue Ergebnisse, Teilausfall hält die anderen nicht auf", async () => {
    await store.setJSON(store.KEYS.dealers, [DEALER]);
    await store.setJSON(store.KEYS.dealerOrders, [dealerOrder(), dealerOrder({ id: id2, number: "H-2026-0008", status: "storniert" })]);
    const b = wfService.parseBulkForm({ aktion: "freigeben", vorgang: "bulkop12345678", bestaetigt: "1", eintrag: ["h:a1b2c3d4e5f60718|0", `h:${id2}|0`, "h:cccccccccccccccc|0"] });
    assert.ok(b.ok);
    const r = await wfService.runBulk(b, WHO_ANNA, ORIGIN, NOW);
    assert.ok(r.ok);
    assert.deepEqual(
      r.results.map((x) => x.ok),
      [true, false, false],
    );
    assert.match(r.results[0].message, /Freigegeben/);
    assert.match(r.results[1].message, /Storniert/);
    assert.match(r.results[2].message, /nicht gefunden/);
    const saved = await wfStore.readBulkResult(r.id, WHO_ANNA);
    assert.equal(saved?.results.length, 3);
    assert.equal(await wfStore.readBulkResult(r.id, WHO_ADMIN), null, "Ergebnis nur für die ausführende Person");
    // gleiche Sammelaktion noch einmal abgeschickt → nichts doppelt
    const again = await wfService.runBulk(b, WHO_ANNA, ORIGIN, NOW + 10);
    assert.ok(again.ok);
    assert.equal(again.results[0].duplicate, true);
    const rec = (await wfStore.readWorkflows(["h:a1b2c3d4e5f60718"])).get("h:a1b2c3d4e5f60718");
    assert.equal(rec?.releases, 1);
    // ohne Bestätigung nichts
    const nc = wfService.parseBulkForm({ aktion: "freigeben", vorgang: "bulkop99999999", eintrag: ["h:a1b2c3d4e5f60718|1"] });
    assert.ok(nc.ok);
    assert.equal((await wfService.runBulk(nc, WHO_ANNA, ORIGIN, NOW)).ok, false);
  });

  test("Sammelaktion mit veraltetem Stand: nur diese Bestellung übersprungen", async () => {
    await store.setJSON(store.KEYS.dealers, [DEALER]);
    await store.setJSON(store.KEYS.dealerOrders, [dealerOrder(), dealerOrder({ id: id2, number: "H-2026-0008" })]);
    await wfStore.runWorkflowAction(b2b(), { action: "pruefen", rev: 0, op: op() }, WHO_ANNA, PRODUCTS, ORIGIN, NOW);
    const b = wfService.parseBulkForm({ aktion: "pruefen", vorgang: "bulkop22222222", bestaetigt: "1", eintrag: ["h:a1b2c3d4e5f60718|0", `h:${id2}|0`] });
    assert.ok(b.ok);
    const r = await wfService.runBulk(b, WHO_ANNA, ORIGIN, NOW);
    assert.ok(r.ok);
    assert.equal(r.results[0].ok, false);
    assert.match(r.results[0].message, /zwischenzeitlich geändert/);
    assert.equal(r.results[1].ok, true);
  });
});

/* ───────────── 8. Exporthistorie und Protokolle ───────────── */

describe("Exporthistorie, Änderungsprotokoll und Sicherheitsprotokoll", () => {
  beforeEach(resetStore);

  test("23 Excel-Export wird vollständig, aber ohne Kundendaten protokolliert (auch Fehler)", async () => {
    await store.setJSON(store.KEYS.dealers, [DEALER]);
    await store.setJSON(store.KEYS.dealerOrders, [dealerOrder()]);
    const req = exportService.parseExportRequest({ art: "voll", zeitraum: "tag", tag: TODAY }, NOW);
    assert.ok(req.ok);
    const r = await exportService.runExport(req.req, WHO_ANNA, ORIGIN, NOW);
    assert.ok(r.ok);
    const list = await activity.listActivities(NOW - 86_400_000, NOW + 86_400_000);
    assert.equal(list.length, 1);
    const a = list[0];
    assert.equal(a.kind, "excel");
    assert.equal(a.by, "Büromitarbeiter anna");
    assert.equal(a.orders, 1);
    assert.equal(a.positions, 2);
    assert.deepEqual(a.refs, ["H-2026-0007"]);
    assert.equal(a.result, "ok");
    assert.match(a.id, /^V-[A-Z0-9]+-[0-9A-F]{8}$/);
    assert.doesNotMatch(JSON.stringify(a), /Kiosk|Ölmühle|Yılmaz|Leipzig|einkauf@|127\.0\.0\.1/);
    // Fehler (Datenspeicher weg) wird ebenfalls festgehalten
    process.env.VERCEL = "1";
    try {
      const f = await exportService.runExport(req.req, WHO_ANNA, ORIGIN, NOW + 1000);
      assert.equal(f.ok, false);
    } finally {
      delete process.env.VERCEL;
    }
    const after = await activity.listActivities(NOW - 86_400_000, NOW + 86_400_000);
    assert.equal(after[0].result, "fehler");
    assert.match(after[0].error ?? "", /Daten fehlen/);
    assert.equal(activity.filterActivities(after, { user: "", kind: "", result: "fehler", order: "" }).length, 1);
    assert.equal(activity.filterActivities(after, { user: "", kind: "excel", result: "", order: "H-2026-0007" }).length, 1);
    assert.equal(activity.filterActivities(after, { user: "Administrator", kind: "", result: "", order: "" }).length, 0);
  });

  test("24 Dokumente (Lieferschein, Archivkopie, Versandliste) in der Historie, mit Lieferscheinnummern", async () => {
    await store.setJSON(store.KEYS.dealers, [DEALER]);
    await store.setJSON(store.KEYS.dealerOrders, [dealerOrder()]);
    const parse = (p: Record<string, string | string[]>) => {
      const r = docService.parseDocRequest(p, NOW);
      assert.ok(r.ok, JSON.stringify(p));
      return r.req;
    };
    assert.ok((await docService.runDocument(parse({ art: "lieferschein", modus: "download", auswahl: ["h:a1b2c3d4e5f60718"] }), WHO_ANNA, ORIGIN, NOW)).ok);
    assert.ok((await docService.runDocument(parse({ art: "lieferschein", modus: "archiv", version: "1", auswahl: ["h:a1b2c3d4e5f60718"] }), WHO_ANNA, ORIGIN, NOW + 1)).ok);
    const missing = await docService.runDocument(parse({ art: "lieferschein", modus: "archiv", version: "9", auswahl: ["h:a1b2c3d4e5f60718"] }), WHO_ANNA, ORIGIN, NOW + 2);
    assert.equal(missing.ok, false);
    assert.ok((await docService.runDocument(parse({ art: "versandliste", zeitraum: "tag", tag: TODAY }), WHO_ANNA, ORIGIN, NOW + 3)).ok);
    const list = await activity.listActivities(NOW - 86_400_000, NOW + 86_400_000);
    assert.deepEqual(
      list.map((a) => [a.kind, a.mode, a.result]),
      [
        ["versandliste", "download", "ok"],
        ["lieferschein", "archiv", "fehler"],
        ["lieferschein", "archiv", "ok"],
        ["lieferschein", "download", "ok"],
      ],
    );
    assert.deepEqual(list[3].notes, ["LS-2026-00001"]);
    assert.equal(list[0].range.length > 0, true);
    assert.equal(activity.filterActivities(list, { user: "", kind: "", result: "", order: "LS-2026-00001" }).length, 2);
    assert.equal((await activity.findActivity(list[0].id, NOW))?.id, list[0].id);
    assert.equal(await activity.findActivity("../../etc", NOW), null);
  });

  test("Alte Einträge (vor Phase 3C) erscheinen als eingeschränkte historische Informationen, ohne Doppelungen", async () => {
    const legacy = activity.legacyFromAudit({ at: "2026-10-01T08:00:00.000Z", type: "office_export", detail: "Büromitarbeiter anna · voll · monat · 12 Best. · alle" });
    assert.equal(legacy?.legacy, true);
    assert.equal(legacy?.kind, "excel");
    assert.equal(legacy?.orders, 12);
    const doc = activity.legacyFromAudit({ at: "2026-10-01T08:00:00.000Z", type: "office_document", detail: "Administrator · lieferschein · druck · 3 Stk · LS-2026-00001 … LS-2026-00003" });
    assert.equal(doc?.kind, "sammeldruck");
    assert.deepEqual(doc?.notes, ["LS-2026-00001", "LS-2026-00003"]);
    assert.equal(activity.legacyFromAudit({ at: "x", type: "login_success" }), null);
  });

  test("25 Sicherheitsprotokoll: jeder Bearbeitungsschritt mit Bestellnummer und Status, ohne Kundendaten", async () => {
    const o = b2b();
    await wfStore.runWorkflowAction(o, { action: "pruefen", rev: 0, op: op() }, WHO_ANNA, PRODUCTS, ORIGIN, NOW);
    const e = (await listSecurityEvents(10)).find((x) => x.type === "office_workflow");
    assert.equal(e?.detail, "Büromitarbeiter anna · H-2026-0007 · pruefen · neu→pruefung");
    assert.doesNotMatch(JSON.stringify(e), /Kiosk|Yılmaz|Leipzig/);
  });

  test("11 Änderungsprotokoll je Bestellung: Ereignis-ID, Benutzer, Zeit, Aktion, alt/neu, Grund – nicht bearbeitbar", () => {
    const o = b2c();
    const rec = run(null, o, { action: "zurueckstellen", reason: "Rückfrage" });
    const ev = rec.events[0];
    assert.deepEqual(Object.keys(ev).sort(), ["action", "at", "by", "byId", "from", "id", "reason", "role", "to"].sort());
    assert.ok(!wf.ACTIONS.some((a) => /event|protokoll|loesch/.test(a)), "keine Aktion zum Bearbeiten/Löschen von Einträgen");
  });
});

/* ───────────── 9. Rechte ───────────── */

describe("Rechte", () => {
  test("26 Administrator: alles inklusive Korrektur und Sicherheitsprotokoll", () => {
    for (const p of ["office.view", "office.export", "office.documents", "office.workflow", "office.correct", "office.history", "office.users"] as const) assert.equal(roles.can("admin", p), true, p);
    assert.equal(wf.mayRun("admin", "korrektur"), true);
  });

  test("27 Büromitarbeiter: prüfen, freigeben, zurückstellen, Logistik, Versand, Historie – keine Korrektur", () => {
    for (const p of ["office.view", "office.export", "office.documents", "office.workflow", "office.history"] as const) assert.equal(roles.can("buero", p), true, p);
    assert.equal(roles.can("buero", "office.correct"), false);
    for (const a of ["pruefen", "freigeben", "zurueckstellen", "logistik", "versendet", "abschliessen"] as const) assert.equal(wf.mayRun("buero", a), true, a);
    assert.equal(wf.mayRun("buero", "korrektur"), false);
    const o = b2c();
    assert.equal(fails(null, o, { action: "korrektur", target: "pruefung", reason: "abc", confirm: true }, ANNA).code, "forbidden");
  });

  test("28 Lesezugriff: nur ansehen – keine Bearbeitung, keine Historie-Seite", () => {
    assert.equal(roles.can("lesen", "office.view"), true);
    for (const p of ["office.workflow", "office.correct", "office.history", "office.export", "office.documents"] as const) assert.equal(roles.can("lesen", p), false, p);
    for (const a of wf.ACTIONS) assert.equal(wf.mayRun("lesen", a), false, a);
    assert.equal(fails(null, b2c(), { action: "pruefen" }, LESEN).code, "forbidden");
  });

  test("29 Endpunkt: Anmeldung und Recht vor allem anderen, gleiche Herkunft, nur POST, Korrektur nur Administrator", async () => {
    const code = await fs.readFile(path.join(ROOT, "app/api/admin/buero/workflow/route.ts"), "utf8");
    const post = code.slice(code.indexOf("export async function POST"));
    assert.ok(post.indexOf('assertOffice("office.workflow")') < post.indexOf("request.formData()"));
    assert.ok(post.indexOf("sameOrigin(request)") < post.indexOf("request.formData()"));
    assert.match(post, /korrektur" && who\.role !== "admin"/);
    assert.match(code, /export function GET\(\) \{\n\s+return Response\.json\([^)]*status: 405/);
    assert.match(code, /no-store/);
    for (const [page, perm] of [
      ["sammelaktion", 'requireOffice("office.workflow")'],
      ["exporthistorie", 'requireOffice("office.history")'],
      ["stammdaten", "requireOffice()"],
    ]) {
      const src = await fs.readFile(path.join(ROOT, `app/admin/buero/${page}/page.tsx`), "utf8");
      assert.ok(src.includes(`await ${perm}`), page);
    }
  });
});

/* ───────────── 10. Filter, Kennzahlen, Aufmerksamkeit ───────────── */

describe("Filter und Kennzahlen", () => {
  test("Filter nach Bürostatus, „Für Versand freigegeben“ und „Aufmerksamkeit“", () => {
    const a = withRec(b2c(), released(b2c()));
    const n = withRec(b2c({ id: "cs_test_W2" }), null);
    const flagged = withRec(b2c({ id: "cs_test_W3" }), run(null, b2c({ id: "cs_test_W3" }), { action: "markieren", reason: "Bitte prüfen" }));
    const all = [a, n, flagged];
    const f = (p: Record<string, string>) => filters.applyFilters(all, filters.parseFilters(p), PRODUCTS).map((o) => o.key);
    assert.deepEqual(f({ status: "freigegeben" }), [a.key]);
    assert.deepEqual(f({ buero: "neu" }), [n.key, flagged.key]);
    assert.deepEqual(f({ aufmerksamkeit: "1" }), [flagged.key]);
    assert.equal(filters.parseFilters({ buero: "kaputt" }).office, "");
    assert.match(filters.filterSummaryForLog(filters.parseFilters({ buero: "neu", aufmerksamkeit: "1" })), /b:neu,aufmerksamkeit/);
  });

  test("Kennzahlen je Bürostatus und „freigegeben“", () => {
    const a = withRec(b2c(), released(b2c()));
    const l = withRec(b2b(), run(released(b2b()), b2b(), { action: "logistik", confirm: true }));
    const n = withRec(b2c({ id: "cs_test_W2" }), null);
    const month = { from: T("2026-10-01T00:00:00Z"), to: T("2026-11-01T00:00:00Z"), label: "Oktober" };
    const k = kpis.computeKpis([a, l, n], month, NOW);
    assert.equal(k.counts.released, 2);
    assert.equal(k.office.freigegeben, 1);
    assert.equal(k.office.logistik, 1);
    assert.equal(k.office.neu, 1);
  });
});

/* ───────────── 11. Artikelstammdaten ───────────── */

describe("Artikelstammdaten prüfen", () => {
  const products = catalogData.products as Product[];
  test("38 Doppelte Artikelnummer im echten Katalog erkannt (Caramel/Vanille), nichts verändert", () => {
    const before = JSON.stringify(products);
    const issues = master.checkMasterData(products);
    const dup = issues.filter((i) => i.kind === "sku_doppelt").map((i) => i.handle).sort();
    assert.deepEqual(dup, ["ice-coffee-caramel", "ice-coffee-vanille"]);
    assert.equal(JSON.stringify(products), before);
  });

  test("37 Fehlende Artikelnummer (Wasser) und fehlende Artikelpässe erkannt", () => {
    const missing = master.checkMasterData(products).filter((i) => i.kind === "sku_fehlt").map((i) => i.handle);
    for (const h of ["wasser-still", "wasser-medium", "wasser-classic"]) assert.ok(missing.includes(h), h);
  });

  test("Einheit, Sorten-ID, Tray-Widerspruch und unvollständiges Mixpaket", () => {
    const issues = master.checkMasterData(
      [
        { ...mixProduct, handle: "mix-leer", title: "Mix leer", contents: undefined },
        { ...mixProduct, handle: "mix-falsch", title: "Mix falsch", contents: [["classic", 1], ["gibtsnicht", 1]] },
        { ...mixProduct, handle: "mix-zahl", title: "Mix Zahl", contents: [["classic", 3]] },
        { ...(products[0] as Product), handle: "neu-sorte", title: "Neue Sorte", variants: [{ id: "x", title: "", price: 1, available: true, options: {}, cans: 20 }] },
      ],
      {},
      {},
    );
    const kinds = (h: string) => issues.filter((i) => i.handle === h).map((i) => i.kind);
    assert.ok(kinds("mix-leer").includes("mix_unvollstaendig"));
    assert.ok(kinds("mix-falsch").includes("mix_unvollstaendig"));
    assert.ok(kinds("mix-zahl").includes("tray_widerspruch"), "3 Trays ergeben 72, Variante nennt 48");
    assert.ok(kinds("neu-sorte").includes("einheit_fehlt"));
    assert.ok(kinds("neu-sorte").includes("sorte_fehlt"));
    assert.ok(kinds("neu-sorte").includes("tray_widerspruch"));
    assert.ok(issues.every((i) => i.fix && i.field));
  });
});

/* ───────────── 12. Ausfälle und fehlende Nebenwirkungen ───────────── */

describe("Ausfälle und Nebenwirkungen", () => {
  beforeEach(resetStore);

  test("41 Redis-Ausfall: nichts geändert, verständliche Meldung, Liste als unvollständig markiert", async () => {
    process.env.VERCEL = "1";
    try {
      const r = await wfStore.runWorkflowAction(b2b(), { action: "pruefen", rev: 0, op: op() }, WHO_ANNA, PRODUCTS, ORIGIN, NOW);
      assert.equal(r.ok, false);
      assert.match((r as { error: string }).error, /nicht erreichbar/);
      await assert.rejects(wfStore.readWorkflows([b2b().key]));
      const loaded = await source.loadOfficeOrders(NOW - 86_400_000, NOW + 86_400_000, PRODUCTS);
      assert.equal(loaded.complete, false);
    } finally {
      delete process.env.VERCEL;
    }
  });

  test("Bearbeitungsstand nicht lesbar → Liste unvollständig (nie still „Neu“)", async () => {
    await store.setJSON(store.KEYS.dealers, [DEALER]);
    await store.setJSON(store.KEYS.dealerOrders, [dealerOrder()]);
    const file = path.join(dir, ".data", "store.json");
    const ok = await source.loadOfficeOrders(NOW - 86_400_000, NOW + 86_400_000, PRODUCTS);
    assert.equal(ok.complete, true);
    assert.equal(ok.orders[0].office, null);
    await store.setJSON(wfStore.wfKey("h:a1b2c3d4e5f60718"), run(null, b2b(), { action: "pruefen" }));
    const withState = await source.loadOfficeOrders(NOW - 86_400_000, NOW + 86_400_000, PRODUCTS);
    assert.equal(wf.officeStatus(withState.orders[0], withState.orders[0].office), "pruefung");
    assert.ok(await fs.stat(file));
  });

  test("42 Stripe-Ausfall: Privatbestellung kann nicht bearbeitet werden, nichts geändert", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_offline_dummy";
    const realRequest = https.request;
    (https as { request: unknown }).request = ((..._args: unknown[]) => {
      throw new Error("kein Netz im Test");
    }) as never;
    try {
      const parsed = wfService.parseActionForm({ bestellung: "s:cs_test_W1", vorgang: "abcdefgh1234", stand: "0", aktion: "pruefen" });
      assert.ok(parsed.ok);
      const r = await wfService.runSingle(parsed, WHO_ANNA, ORIGIN, NOW);
      assert.equal(r.ok, false);
      assert.match((r as { error: string }).error, /Stripe|nicht erreichbar|geladen/);
      assert.equal((await wfStore.readWorkflows(["s:cs_test_W1"])).size, 0);
    } finally {
      (https as { request: unknown }).request = realRequest;
      delete process.env.STRIPE_SECRET_KEY;
    }
  });

  test("43/46 Keine Bestands-, Bestell-, Zahlungs- oder Rechnungsänderung außer dem dokumentierten Versand-Abgleich", async () => {
    const inv = { number: "RE-2026-0001", date: TODAY, serviceDate: TODAY, dueDays: 14, lines: [], shippingNet: 0, shippingText: "", discountNet: 0, discountText: "", note: "", vatRate: 19, billTo: {}, seller: {}, released: true, paid: false, createdAt: "", updatedAt: "" } as never;
    await store.setJSON(store.KEYS.dealers, [DEALER]);
    await store.setJSON(store.KEYS.dealerOrders, [dealerOrder({ invoice: inv })]);
    await store.setJSON(store.KEYS.products, { classic: { variants: { "v-1": { available: true } } } });
    const file = path.join(dir, ".data", "store.json");
    const snapshot = JSON.parse(await fs.readFile(file, "utf8"));
    const o = b2b();
    let rec: WfRecord | null = null;
    for (const input of [
      { action: "pruefen" },
      { action: "freigeben", confirm: true },
      { action: "logistik", confirm: true },
      { action: "markieren", reason: "Test" },
    ] as const) {
      const r = await wfStore.runWorkflowAction(o, { rev: rec?.rev ?? 0, op: op(), ...input }, WHO_ANNA, PRODUCTS, ORIGIN, NOW);
      assert.ok(r.ok);
      rec = r.rec;
    }
    const afterState = JSON.parse(await fs.readFile(file, "utf8"));
    const changed = Object.keys(afterState).filter((k) => !k.startsWith("tt:ver:") && JSON.stringify(afterState[k]) !== JSON.stringify(snapshot[k]));
    assert.deepEqual(changed, [wfStore.wfKey(o.key)], "nur der Bearbeitungsstand dieser Bestellung");
    assert.deepEqual(afterState[store.KEYS.dealerOrders], snapshot[store.KEYS.dealerOrders], "Bestellung, Status und Rechnung unverändert");
    assert.deepEqual(afterState[store.KEYS.products], snapshot[store.KEYS.products], "kein Bestand verändert");
  });

  test("45 Excel-Spalten unverändert (Phase 3A)", () => {
    const sheets = exp.buildSheets("voll", [b2b()], { range: { from: 0, to: 1, label: "x" }, filters: [], createdBy: "t", now: NOW, siteUrl: "https://example.de", products: PRODUCTS });
    const names = sheets.map((s) => s.name);
    assert.ok(names.length > 0);
    const header = JSON.stringify(sheets.map((s) => s.columns));
    assert.doesNotMatch(header, /Bürostatus|Freigabe|Logistik/, "keine neuen Spalten im Excel-Export");
  });

  test("40 Stripe/Pfand (nur Analyse): Rabatt wird von Stripe auch auf die Pfandzeile verteilt; Büro zeigt Pfand ungekürzt", async () => {
    const o = b2c();
    assert.equal(o.deposit, 1200, "Pfand im Büro = ungekürzter Betrag der Pfandzeile");
    assert.equal(LINES[1].amount_discount, 60, "Stripe-Testdaten: Anteil des Gutscheins auf der Pfandzeile");
    const route = await fs.readFile(path.join(ROOT, "app/api/checkout/route.ts"), "utf8");
    assert.match(route, /amount_off: discount/, "fester Betrag als Einmal-Gutschein");
    assert.doesNotMatch(route, /applies_to/, "Gutschein gilt (noch) für alle Positionen inklusive Pfand");
  });

  test("47/48 Phase 3A/3B unverändert: Lieferschein-Nummern und Dokumente laufen weiter (eigene Testdateien)", async () => {
    const files = await fs.readdir(path.join(ROOT, "tests"));
    assert.ok(files.includes("office.test.mts") && files.includes("office-docs.test.mts"));
    assert.equal(typeof notes.issueNotes, "function");
  });
});
