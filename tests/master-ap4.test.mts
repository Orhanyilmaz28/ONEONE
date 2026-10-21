/**
 * Master-Auftrag AP4 / Phase 3E – Kundenservice: Fallnummern (atomar, eindeutig), Status, Zuordnung, Rechte,
 * gleichzeitige Bearbeitung, Reklamationen, Retouren, Rückerstattungsanfragen, Vorlagen, Kundenverknüpfung.
 * Läuft ohne Netz, ohne Stripe, ohne echte Datenbank (Datei-Speicher im Temp-Ordner).
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, test } from "node:test";

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL", "STRIPE_SECRET_KEY", "ADMIN_DEMO"]) delete process.env[k];
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "exstase-ap4-"));
process.chdir(dir);
const ROOT = path.join(import.meta.dirname, "..");

const tk = await import("../lib/office/tickets");
const svc = await import("../lib/office/tickets-service");
const model = await import("../lib/office/model");
const roles = await import("../lib/office/roles");
const store = await import("../lib/store");
const { calcDealerOrder } = await import("../lib/dealer-order-calc");
const catalogData = JSON.parse(await fs.readFile(path.join(ROOT, "data", "products.json"), "utf8"));

type Product = import("../lib/types").Product;
type OfficeOrder = import("../lib/office/model").OfficeOrder;
type Ticket = import("../lib/office/tickets").Ticket;

after(() => fs.rm(dir, { recursive: true, force: true }));
const PRODUCTS = new Map<string, Product>((catalogData.products as Product[]).map((p) => [p.handle, p]));
const NOW = Date.parse("2026-10-21T10:00:00Z");
const ANNA = { role: "buero" as const, label: "Büromitarbeiter anna", id: "u-anna" };
const BEN = { role: "buero" as const, label: "Büromitarbeiter ben", id: "u-ben" };

function b2c(id = "cs_test_T00001", refunded = 0): OfficeOrder {
  const s = {
    id,
    created: Math.floor(Date.parse("2026-10-19T08:00:00Z") / 1000),
    amount_total: 3600 + 1200 + 590,
    amount_subtotal: 4800,
    payment_status: "paid",
    metadata: { items: "classic:2" },
    customer_details: { name: "Jürgen Müßig", email: "JM@Example.de", address: { line1: "Hauptstraße 1", postal_code: "01067", city: "Dresden", country: "DE" } },
    shipping_cost: { amount_total: 590 },
    total_details: { amount_discount: 0, amount_tax: 0 },
    payment_intent: { latest_charge: { amount_refunded: refunded, refunded: refunded > 0, payment_method_details: { type: "card" } } },
  } as import("../lib/office/model").StripeSessionLike;
  const lines = [
    { description: "Classic", quantity: 2, amount_total: 3600, amount_subtotal: 3600, amount_discount: 0, price: { unit_amount: 1800 } },
    { description: "Einwegpfand", quantity: 48, amount_total: 1200, amount_subtotal: 1200, amount_discount: 0, price: { unit_amount: 25 } },
  ];
  return model.fromStripe(s, lines, { status: "offen" }, PRODUCTS, `EX-${id.slice(-6).toUpperCase()}`);
}
const DEALER_ORDER = {
  id: "a1b2c3d4e5f60718",
  number: "H-2026-0007",
  createdAt: "2026-10-20T09:30:00.000Z",
  dealerId: "d1",
  dealerEmail: "einkauf@kiosk.de",
  tierName: "Standard",
  status: "bestätigt",
  history: [],
  calc: calcDealerOrder([{ handle: "classic", title: "Classic", perTray: 24, can: { s1: 40, pal: 35 }, orderable: true }] as never, { classic: 3 }, { cost: 1190, freeFrom: 0 }),
  delivery: { company: "Kiosk Ölmühle GmbH", contact: "Ayşe Yılmaz", street: "Industriestr. 5", zip: "04109", city: "Leipzig" },
} as import("../lib/dealer-orders").DealerOrder;
const b2b = () => model.fromDealer(DEALER_ORDER, { id: "d1", company: "Kiosk Ölmühle GmbH", contact: "Ayşe Yılmaz", email: "einkauf@kiosk.de" } as never, PRODUCTS);

function draft(input: Partial<import("../lib/office/tickets").CreateInput>, order: OfficeOrder | null = b2c(), link: import("../lib/office/tickets").CreateContext["link"] = null) {
  const v = tk.validateCreate({ kind: "anfrage", subject: "Frage zur Lieferung", description: "", ...input }, { order, link });
  assert.ok(v.ok, v.ok ? "" : v.errors.join(" "));
  return v.draft;
}
const make = (input: Partial<import("../lib/office/tickets").CreateInput> = {}, order: OfficeOrder | null = b2c()) => tk.newTicket("KS-2026-00001", draft(input, order), ANNA, NOW);
function act(t: Ticket, a: import("../lib/office/tickets").TicketAction, actor = ANNA) {
  const r = tk.applyTicketAction(t, a, t.rev, actor, NOW + 60_000);
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.ticket;
}

beforeEach(async () => {
  await fs.rm(path.join(dir, ".data"), { recursive: true, force: true }).catch(() => {});
});

describe("AP4: Anlegen und Prüfen", () => {
  test("Nummernformat KS-JJJJ-NNNNN", () => {
    assert.equal(tk.formatTicketNumber(2026, 7), "KS-2026-00007");
    assert.ok(tk.isTicketNumber("KS-2026-00007"));
    assert.ok(!tk.isTicketNumber("KS-2026-7"));
    assert.ok(!tk.isTicketNumber("../KS-2026-00007"));
  });

  test("Kunde kommt aus der Bestellung (B2C/B2B), E-Mail klein, Verknüpfung mit vorhandenem Konto", () => {
    const d = draft({}, b2c(), { kind: "konto", id: "c-1" });
    assert.deepEqual(d.customer, { kind: "konto", id: "c-1", name: "Jürgen Müßig", email: "jm@example.de" });
    assert.equal(d.channel, "privat");
    assert.equal(d.order?.number, "EX-T00001");
    const h = draft({}, b2b(), { kind: "haendler", id: "d1" });
    assert.equal(h.customer.name, "Kiosk Ölmühle GmbH");
    assert.equal(h.channel, "haendler");
    const free = tk.validateCreate({ kind: "anfrage", subject: "Allgemeine Frage", description: "", customerName: "", orderText: "" }, { order: null });
    assert.equal(free.ok, false, "ohne Bestellung braucht es einen Namen");
  });

  test("Reklamation braucht eine Reklamationsart", () => {
    assert.equal(tk.validateCreate({ kind: "reklamation", subject: "Dose kaputt", description: "" }, { order: b2c() }).ok, false);
    const d = draft({ kind: "reklamation", complaintType: "beschaedigt" });
    assert.equal(d.complaint?.type, "beschaedigt");
    for (const t of tk.COMPLAINT_TYPES) assert.ok(tk.COMPLAINT_LABEL[t]);
    assert.equal(tk.COMPLAINT_TYPES.length, 7);
  });

  test("Retoure: Menge höchstens wie bestellt, Grund Pflicht, keine Lagerbuchung (nur Dokumentation)", () => {
    assert.equal(tk.validateCreate({ kind: "retoure", subject: "Rücksendung", description: "", returnQty: { 0: 3 }, returnReason: "zu viel" }, { order: b2c() }).ok, false);
    assert.equal(tk.validateCreate({ kind: "retoure", subject: "Rücksendung", description: "", returnQty: { 0: 1 } }, { order: b2c() }).ok, false);
    const d = draft({ kind: "retoure", returnQty: { 0: 1, 1: 0 }, returnReason: "falsche Sorte bestellt" });
    assert.deepEqual(d.retour?.lines, [{ title: "Classic", handle: "classic", quantity: 1 }]);
    assert.equal(d.retour?.status, "angefragt");
    assert.equal(d.retour?.decision, "offen");
  });

  test("Rückerstattung: Betrag in Euro, nie mehr als noch nicht erstattet", () => {
    assert.equal(tk.parseEuro("12,50"), 1250);
    assert.equal(tk.parseEuro("12.5"), 1250);
    assert.equal(tk.parseEuro("1e3"), null);
    assert.equal(tk.parseEuro("-5"), null);
    const o = b2c("cs_test_T00002", 5000);
    assert.equal(tk.validateCreate({ kind: "erstattung", subject: "Erstattung", description: "", refundAmount: "4,00", refundReason: "Dose fehlte" }, { order: o }).ok, false);
    const d = draft({ kind: "erstattung", refundAmount: "3,90", refundReason: "Dose fehlte" }, o);
    assert.equal(d.refund?.requested, 390);
    assert.equal(d.refund?.refundedAtCreation, 5000);
    assert.equal(d.refund?.status, "offen");
  });

  test("Eingaben werden gesäubert (keine spitzen Klammern / Steuerzeichen)", () => {
    const d = draft({ subject: "<b>Hallo</b>\u0007 Welt", description: "Zeile1\n\n\n\nZeile2<script>" });
    assert.ok(!d.subject.includes("<") && !d.subject.includes("\u0007"));
    assert.ok(!d.description.includes("<") && !/\n{3}/.test(d.description));
  });
});

describe("AP4: Bearbeiten", () => {
  test("Zuweisen, Priorität, Status, Notiz – alles im Verlauf; Notiz setzt „Neu“ auf „In Bearbeitung“", () => {
    let t = make();
    t = act(t, { action: "zuweisen", assignee: { id: "u-ben", label: "Ben" } });
    t = act(t, { action: "prioritaet", priority: "hoch" });
    assert.equal(t.status, "neu");
    t = act(t, { action: "notiz", text: "Kunde angerufen" });
    assert.equal(t.status, "in_bearbeitung");
    t = act(t, { action: "status", status: "wartet_kunde" });
    assert.equal(t.assignee?.label, "Ben");
    assert.equal(t.priority, "hoch");
    assert.equal(t.notes.length, 1);
    assert.deepEqual(
      t.events.map((e) => e.action),
      ["angelegt", "zugewiesen", "Priorität", "Notiz", "Status"],
    );
    assert.equal(t.rev, 5);
  });

  test("Gleichzeitige Bearbeitung: alter Stand wird abgelehnt", () => {
    const t = make();
    const a = tk.applyTicketAction(t, { action: "prioritaet", priority: "hoch" }, t.rev, ANNA, NOW);
    assert.ok(a.ok);
    const b = tk.applyTicketAction(a.ok ? a.ticket : t, { action: "prioritaet", priority: "niedrig" }, t.rev, BEN, NOW);
    assert.equal(b.ok, false);
    assert.equal(!b.ok && b.code, "conflict");
  });

  test("Schließen/Wiedereröffnen: geschlossen nur Notiz oder Wiedereröffnung (mit Grund)", () => {
    let t = act(make(), { action: "schliessen", resolution: "erledigt" });
    assert.equal(t.status, "geschlossen");
    const blocked = tk.applyTicketAction(t, { action: "prioritaet", priority: "hoch" }, t.rev, ANNA, NOW);
    assert.equal(!blocked.ok && blocked.code, "closed");
    t = act(t, { action: "notiz", text: "Nachtrag" });
    assert.equal(t.status, "geschlossen");
    assert.equal(tk.applyTicketAction(t, { action: "wiedereroeffnen", reason: "" }, t.rev, ANNA, NOW).ok, false);
    t = act(t, { action: "wiedereroeffnen", reason: "Kunde meldet sich erneut" });
    assert.equal(t.status, "in_bearbeitung");
    assert.equal(tk.applyTicketAction(t, { action: "status", status: "geschlossen" }, t.rev, ANNA, NOW).ok, false, "Schließen nur über die eigene Aktion");
  });

  test("Retoure und Erstattung müssen vor dem Abschluss entschieden sein – ohne Stripe", () => {
    let r = make({ kind: "retoure", returnQty: { 0: 2 }, returnReason: "beschädigt" });
    assert.equal(tk.applyTicketAction(r, { action: "schliessen" }, r.rev, ANNA, NOW).ok, false);
    r = act(r, { action: "retoure", status: "eingegangen", decision: "ersatz", info: "DHL 0034…" });
    assert.equal(r.retour?.decision, "ersatz");
    r = act(r, { action: "schliessen" });
    assert.equal(r.status, "geschlossen");

    let e = make({ kind: "erstattung", refundAmount: "5", refundReason: "Kulanz" });
    assert.equal(tk.applyTicketAction(e, { action: "status", status: "geloest" }, e.rev, ANNA, NOW).ok, false);
    e = act(e, { action: "erstattung", status: "manuell_erstattet" });
    e = act(e, { action: "status", status: "geloest" });
    assert.equal(e.status, "geloest");
    assert.ok(!JSON.stringify(e).includes("stripe_refund"));
  });

  test("Aktion passt nicht zur Fallart → abgelehnt", () => {
    const t = make();
    assert.equal(tk.applyTicketAction(t, { action: "retoure", status: "eingegangen", decision: "ersatz", info: "" }, t.rev, ANNA, NOW).ok, false);
    assert.equal(tk.applyTicketAction(t, { action: "erstattung", status: "genehmigt" }, t.rev, ANNA, NOW).ok, false);
    assert.equal(tk.applyTicketAction(t, { action: "status", status: "erfunden" }, t.rev, ANNA, NOW).ok, false);
  });
});

describe("AP4: Übersicht, Historie, Vorlagen", () => {
  test("Bereiche, Filter und Sortierung", () => {
    const a = { ...make({ kind: "reklamation", complaintType: "fehlend" }), number: "KS-2026-00001" };
    const b = { ...make({ kind: "retoure", returnQty: { 0: 1 }, returnReason: "x y z" }), number: "KS-2026-00002", priority: "dringend" as const };
    const c = { ...act(make(), { action: "schliessen" }), number: "KS-2026-00003" };
    const counts = tk.sectionCounts([a, b, c]);
    assert.equal(counts.alle, 3);
    assert.equal(counts.neu, 2);
    assert.equal(counts.reklamation, 1);
    assert.equal(counts.retoure, 1);
    assert.equal(counts.abgeschlossen, 1);
    assert.deepEqual(
      tk.sortTickets([c, a, b]).map((t) => t.number),
      ["KS-2026-00002", "KS-2026-00001", "KS-2026-00003"],
    );
    const f = { section: "alle" as const, q: "müßig", status: "", priority: "", mine: "", channel: "" };
    assert.equal([a, b, c].filter((t) => tk.matchesTicket(t, f)).length, 3);
    assert.equal([a, b, c].filter((t) => tk.matchesTicket(t, { ...f, q: "KS-2026-00002" })).length, 1);
  });

  test("Kundenhistorie über Konto-ID bzw. E-Mail", () => {
    const a = { ...tk.newTicket("KS-2026-00001", draft({}, b2c(), { kind: "konto", id: "c-1" }), ANNA, NOW) };
    const b = { ...tk.newTicket("KS-2026-00002", draft({}, b2c("cs_test_T00009"), { kind: "konto", id: "c-1" }), ANNA, NOW) };
    const c = { ...tk.newTicket("KS-2026-00003", draft({}, b2b(), { kind: "haendler", id: "d1" }), ANNA, NOW) };
    assert.ok(tk.sameCustomer(a, b));
    assert.ok(!tk.sameCustomer(a, c));
    assert.ok(!tk.sameCustomer(a, a));
  });

  test("Vorlagen: Fallnummer und Bestellung drin, keine internen Notizen, kein Versand", () => {
    const t = act(make({ kind: "reklamation", complaintType: "beschaedigt" }), { action: "notiz", text: "GEHEIM intern" });
    for (const k of tk.TEMPLATES) {
      const r = tk.renderTemplate(k.key, t, "Anna");
      assert.ok(r.text.includes(t.number));
      assert.ok(r.text.includes("EX-T00001"));
      assert.ok(!r.text.includes("GEHEIM"));
    }
    assert.equal(tk.TEMPLATES.length, 5);
  });
});

describe("AP4: Speicher", () => {
  test("20 gleichzeitige Fälle → 20 eindeutige, lückenlose Nummern; Liste vollständig", async () => {
    const list = await Promise.all(Array.from({ length: 20 }, () => svc.createTicket(draft({}), ANNA, NOW)));
    const nums = list.map((t) => t.number).sort();
    assert.equal(new Set(nums).size, 20);
    assert.equal(nums[0], "KS-2026-00001");
    assert.equal(nums[19], "KS-2026-00020");
    assert.equal((await svc.listTickets()).length, 20);
    // neues Jahr beginnt wieder bei 1
    const next = await svc.createTicket(draft({}), ANNA, Date.parse("2027-01-01T08:00:00Z"));
    assert.equal(next.number, "KS-2027-00001");
  });

  test("Fall nicht speicherbar → Nummer wird wieder freigegeben (kein Verzeichniseintrag ohne Fall)", async () => {
    // Speicherplatz für KS-2026-00001 ist (künstlich) belegt → Speichern des Falls schlägt fehl
    await store.setJSON(svc.ticketKey("KS-2026-00001"), { number: "fremd" });
    await assert.rejects(() => svc.createTicket(draft({}), ANNA, NOW));
    const idx = await store.getJSON<{ seq: Record<string, number>; list: string[] }>(store.KEYS.officeTickets, { seq: {}, list: [] });
    assert.deepEqual(idx.list, []);
    assert.equal(idx.seq["2026"] ?? 0, 0, "Zähler zurückgesetzt – nächste Nummer ohne Lücke");
  });

  test("Bearbeiten mit altem Stand → Konflikt, nichts überschrieben", async () => {
    const t = await svc.createTicket(draft({}), ANNA, NOW);
    const a = await svc.updateTicket(t.number, { action: "prioritaet", priority: "hoch" }, t.rev, ANNA, NOW);
    assert.ok(a.ok);
    const b = await svc.updateTicket(t.number, { action: "prioritaet", priority: "niedrig" }, t.rev, BEN, NOW);
    assert.equal(!b.ok && b.code, "conflict");
    assert.equal((await svc.getTicket(t.number))?.priority, "hoch");
    assert.equal((await svc.updateTicket("KS-2026-99999", { action: "notiz", text: "x" }, 1, ANNA)).ok, false);
    assert.equal(await svc.getTicket("../../etc"), null);
  });

  test("Kundenverknüpfung liest nur – kein neues Konto, Bestellungen unverändert", async () => {
    await store.setJSON(store.KEYS.customers, { "c-1": { id: "c-1", email: "jm@example.de", name: "Jürgen", passwordHash: "x", createdAt: "", updatedAt: "", sessionVersion: 1 } });
    await store.setJSON(store.KEYS.dealerOrders, [DEALER_ORDER]);
    const before = JSON.stringify([await store.getJSON(store.KEYS.customers, {}), await store.getJSON(store.KEYS.dealerOrders, [])]);
    assert.deepEqual(await svc.customerLink(b2c()), { kind: "konto", id: "c-1" });
    assert.deepEqual(await svc.customerLink(b2b()), { kind: "haendler", id: "d1" });
    assert.equal(await svc.customerLink(b2c("cs_test_X", 0)).then((l) => l?.id), "c-1");
    await svc.createTicket(draft({}, b2c(), await svc.customerLink(b2c())), ANNA, NOW);
    const afterState = JSON.stringify([await store.getJSON(store.KEYS.customers, {}), await store.getJSON(store.KEYS.dealerOrders, [])]);
    assert.equal(afterState, before);
  });
});

describe("AP4/AP3: Datensicherung", () => {
  test("Kundenfälle, Berichtshistorie und Automatisierungs-Einstellungen werden gesichert, Laufsperren nicht", async () => {
    const { classifyKey } = await import("../lib/backup/keys");
    for (const k of ["tt:office-tickets", "tt:office-ticket:KS-2026-00001", "tt:office-reports:2026-10", "tt:office-auto:config", "tt:ver:tt:office-ticket:KS-2026-00001"]) assert.equal(classifyKey(k).include, true, k);
    for (const k of ["tt:office-auto:run:x:2026-10-20", "tt:office-auto:try:x", "tt:office-auto:sent:neu:s:1", "tt:office-auto:state"]) assert.equal(classifyKey(k).include, false, k);
  });
});

describe("AP4: Rechte", () => {
  test("Bearbeiten: Admin + Büro · Ansehen: alle Büro-Rollen", () => {
    assert.ok(roles.can("admin", "office.service"));
    assert.ok(roles.can("buero", "office.service"));
    assert.ok(!roles.can("lesen", "office.service"));
    for (const r of ["admin", "buero", "lesen"] as const) assert.ok(roles.can(r, "office.service.view"));
    assert.ok(!roles.can(null, "office.service.view"));
  });

  test("Server-Aktionen prüfen das Recht office.service, Seiten office.service(.view)", async () => {
    const actions = await fs.readFile(path.join(ROOT, "app/admin/buero/kundenservice/actions.ts"), "utf8");
    assert.match(actions, /assertOffice\("office\.service"\)/);
    assert.match(actions, /hitLimit\("officeService"/);
    assert.ok(!/sendMail|refunds\.create|stripe/i.test(actions.replace(/Stripe-Erstattung/g, "")), "keine E-Mail, keine Stripe-Erstattung");
    const list = await fs.readFile(path.join(ROOT, "app/admin/buero/kundenservice/page.tsx"), "utf8");
    assert.match(list, /requireOffice\("office\.service\.view"\)/);
    const neu = await fs.readFile(path.join(ROOT, "app/admin/buero/kundenservice/neu/page.tsx"), "utf8");
    assert.match(neu, /requireOffice\("office\.service"\)/);
    const detail = await fs.readFile(path.join(ROOT, "app/admin/buero/kundenservice/[nummer]/page.tsx"), "utf8");
    assert.match(detail, /requireOffice\("office\.service\.view"\)/);
  });
});
