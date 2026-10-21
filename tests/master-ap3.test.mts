/**
 * Master-Auftrag AP3 / Phase 3D – Büroautomatisierung: Zeitpläne (Europe/Berlin, Zeitumstellung), fällige Termine,
 * keine Doppelläufe, Fehler und Wiederholung, E-Mail nur mit Freigabe, Hinweise ohne Kundendaten, Rechte und
 * keine Änderung an Bestelldaten. Läuft ohne Netz, ohne Stripe, ohne echte Datenbank (Redis-Ersatz im Speicher).
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, beforeEach, describe, test } from "node:test";

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL", "STRIPE_SECRET_KEY", "ADMIN_DEMO", "ADMIN_REQUIRE_2FA", "OFFICE_REPORT_EMAILS", "CRON_SECRET"]) delete process.env[k];
const dir = await fs.mkdtemp(path.join(os.tmpdir(), "exstase-ap3-"));
process.chdir(dir);
const ROOT = path.join(import.meta.dirname, "..");

const auto = await import("../lib/office/automation");
const svc = await import("../lib/office/automation-service");
const model = await import("../lib/office/model");
const roles = await import("../lib/office/roles");
const time = await import("../lib/office/time");
const { cronAuthorized } = await import("../lib/backup/cron");
const { memoryBackend, setKvBackend } = await import("../lib/kv");
const store = await import("../lib/store");
const { calcDealerOrder } = await import("../lib/dealer-order-calc");
const catalogData = JSON.parse(await fs.readFile(path.join(ROOT, "data", "products.json"), "utf8"));

type Product = import("../lib/types").Product;
type OfficeOrder = import("../lib/office/model").OfficeOrder;
type DealerOrder = import("../lib/dealer-orders").DealerOrder;
type ReportSchedule = import("../lib/office/automation").ReportSchedule;
type LoadResult = import("../lib/office/source").LoadResult;

after(() => fs.rm(dir, { recursive: true, force: true }));

const PRODUCTS = new Map<string, Product>((catalogData.products as Product[]).map((p) => [p.handle, p]));
const T = (iso: string) => Date.parse(iso);

/* ───────────── Testdaten ───────────── */

const NAME = "Jürgen Müßig";
const STREET = "Lieferweg 2";
const EMAIL = "jm@example.de";
function b2c(id: string, createdIso: string, paid = true): OfficeOrder {
  const s = {
    id,
    created: Math.floor(T(createdIso) / 1000),
    amount_total: 3600 + 1200 + 590,
    amount_subtotal: 3600 + 1200,
    payment_status: paid ? "paid" : "unpaid",
    metadata: { items: "classic:2" },
    customer_details: { name: NAME, email: EMAIL, address: { line1: "Hauptstraße 1", postal_code: "01067", city: "Dresden", country: "DE" } },
    collected_information: { shipping_details: { name: NAME, address: { line1: STREET, postal_code: "01069", city: "Dresden", country: "DE" } } },
    shipping_cost: { amount_total: 590 },
    total_details: { amount_discount: 0, amount_tax: 0 },
    payment_intent: { latest_charge: { amount_refunded: 0, refunded: false, payment_method_details: { type: "card" } } },
  } as import("../lib/office/model").StripeSessionLike;
  const lines = [
    { description: "Classic", quantity: 2, amount_total: 3600, amount_subtotal: 3600, amount_discount: 0, price: { unit_amount: 1800 } },
    { description: "Einwegpfand", quantity: 48, amount_total: 1200, amount_subtotal: 1200, amount_discount: 0, price: { unit_amount: 25 } },
  ];
  return model.fromStripe(s, lines, { status: "offen" }, PRODUCTS, `EX-${id.slice(-6).toUpperCase()}`);
}
const rows = [
  { handle: "classic", title: "Classic", perTray: 24, can: { s1: 40, pal: 35 } as Record<string, number>, orderable: true },
  { handle: "tropical", title: "Tropical", perTray: 24, can: { s1: 40, pal: 35 } as Record<string, number>, orderable: true },
];
function b2b(createdIso: string): OfficeOrder {
  const o: DealerOrder = {
    id: "a1b2c3d4e5f60718",
    number: "H-2026-0007",
    createdAt: createdIso,
    dealerId: "d1",
    dealerEmail: "einkauf@kiosk.de",
    tierName: "Standard",
    status: "bestätigt",
    history: [{ status: "eingegangen", at: createdIso }],
    calc: calcDealerOrder(rows as never, { classic: 3, tropical: 2 }, { cost: 1190, freeFrom: 0 }),
    delivery: { company: "Kiosk Ölmühle GmbH", contact: "Ayşe Yılmaz", street: "Industriestr. 5", zip: "04109", city: "Leipzig" },
  };
  return model.fromDealer(o, { id: "d1", company: "Kiosk Ölmühle GmbH", contact: "Ayşe Yılmaz", email: "einkauf@kiosk.de", street: "Rechnungsweg 1", zip: "04103", city: "Leipzig" } as never, PRODUCTS);
}

function schedule(over: Partial<ReportSchedule> = {}): ReportSchedule {
  return { id: "sched_daily1", name: "Tagesbericht Büro", active: true, frequency: "taeglich", time: "05:00", weekday: 1, monthDay: 1, type: "kennzahlen", scope: "abgeschlossen", channel: "alle", recipients: ["buero@exstase.com"], updatedAt: "2026-10-01T00:00:00.000Z", updatedBy: "Administrator", ...over };
}

const ORDERS = [b2c("cs_test_A00001", "2026-10-19T08:00:00Z"), b2c("cs_test_A00002", "2026-10-19T15:00:00Z", false), b2b("2026-10-19T10:00:00.000Z")];
const okLoad = (orders = ORDERS) => async (): Promise<LoadResult> => ({ orders, complete: true, errors: [], source: "stripe" });

async function setConfig(schedules: ReportSchedule[], extra: Partial<import("../lib/office/automation").AutomationConfig> = {}) {
  await svc.saveConfig((c) => ({ ...c, schedules, ...extra }));
}

beforeEach(async () => {
  setKvBackend(memoryBackend(() => Date.now()));
  await fs.rm(path.join(dir, ".data"), { recursive: true, force: true }).catch(() => {});
  delete process.env.OFFICE_REPORT_EMAILS;
});

/* ───────────── Konfiguration ───────────── */

describe("AP3: Konfiguration", () => {
  test("Standard: kein Bericht aktiv, keine Zusammenfassung, kaputte Werte → Standard", () => {
    assert.equal(auto.DEFAULT_CONFIG.schedules.length, 0);
    assert.equal(auto.DEFAULT_CONFIG.digest, false);
    const c = auto.normalizeConfig({ schedules: [{ id: "x", name: "?", frequency: "stündlich" }], digest: "ja", notify: { bericht: "nein" } });
    assert.equal(c.schedules.length, 0);
    assert.equal(c.digest, false);
    assert.equal(c.notify.bericht, true);
    assert.deepEqual(auto.normalizeConfig(null), { ...auto.DEFAULT_CONFIG });
  });

  test("Formularprüfung: Uhrzeit, Monatstag 1–28, Empfänger, standardmäßig inaktiv", () => {
    const base = { name: "Bericht", frequency: "taeglich", time: "05:00", weekday: "1", monthDay: "1", type: "tagesbericht" };
    const ok = auto.validateSchedule(base);
    assert.ok(ok.ok && ok.schedule.active === false && ok.schedule.scope === "abgeschlossen" && ok.schedule.channel === "alle");
    assert.equal(auto.validateSchedule({ ...base, time: "25:00" }).ok, false);
    assert.equal(auto.validateSchedule({ ...base, monthDay: "31" }).ok, false);
    assert.equal(auto.validateSchedule({ ...base, frequency: "stündlich" }).ok, false);
    assert.equal(auto.validateSchedule({ ...base, recipients: "kein-mail, a@b.de" }).ok, false);
    assert.equal(auto.validateSchedule({ ...base, recipients: "a@b.de,b@b.de,c@b.de,d@b.de,e@b.de,f@b.de" }).ok, false);
    const n = auto.validateSchedule({ ...base, name: "<script>x</script> Bericht", recipients: "A@B.de; a@b.de" });
    assert.ok(n.ok && !n.schedule.name.includes("<") && n.schedule.recipients.length === 1);
  });
});

/* ───────────── Zeitplan ───────────── */

describe("AP3: Zeitplan in deutscher Zeit", () => {
  const daily = schedule();
  test("Sommer- und Winterzeit: 05:00 Uhr Berlin = 03:00 bzw. 04:00 UTC", () => {
    assert.equal(auto.occurrenceAt({ y: 2026, m: 7, d: 1 }, "05:00"), T("2026-07-01T03:00:00Z"));
    assert.equal(auto.occurrenceAt({ y: 2026, m: 12, d: 1 }, "05:00"), T("2026-12-01T04:00:00Z"));
  });

  test("Umstellungstage (29.03. und 25.10.2026): Termin und Vortages-Zeitraum stimmen", () => {
    assert.equal(auto.occurrenceAt({ y: 2026, m: 3, d: 29 }, "05:00"), T("2026-03-29T03:00:00Z"));
    assert.equal(auto.occurrenceAt({ y: 2026, m: 10, d: 25 }, "05:00"), T("2026-10-25T04:00:00Z"));
    // Am 26.10. berichtet der Tagesbericht über den 25.10. – dieser Tag hat 25 Stunden
    const occ = auto.latestOccurrence(daily, T("2026-10-26T05:00:00Z"));
    assert.deepEqual(occ.day, { y: 2026, m: 10, d: 26 });
    const r = auto.reportRange(daily, occ.day, occ.at);
    assert.equal(r.from, T("2026-10-24T22:00:00Z"));
    assert.equal(r.to, T("2026-10-25T23:00:00Z"));
    assert.equal((r.to - r.from) / 3_600_000, 25);
    // 30.03. berichtet über den 29.03. (23 Stunden)
    const o2 = auto.latestOccurrence(daily, T("2026-03-30T04:00:00Z"));
    const r2 = auto.reportRange(daily, o2.day, o2.at);
    assert.equal((r2.to - r2.from) / 3_600_000, 23);
    // nicht existierende Uhrzeit 02:30 am 29.03. ergibt trotzdem genau einen gültigen Zeitpunkt
    assert.ok(Number.isFinite(auto.occurrenceAt({ y: 2026, m: 3, d: 29 }, "02:30")));
  });

  test("vor der Uhrzeit gilt noch der gestrige Termin; nächster Termin für die Anzeige", () => {
    const occ = auto.latestOccurrence(daily, T("2026-10-20T02:00:00Z")); // 04:00 Berlin
    assert.deepEqual(occ.day, { y: 2026, m: 10, d: 19 });
    assert.equal(auto.nextOccurrence(daily, T("2026-10-20T02:00:00Z")), T("2026-10-20T03:00:00Z"));
  });

  test("wöchentlich (Montag) und monatlich (1.): Vorwoche und Vormonat, auch über den Jahreswechsel", () => {
    const weekly = schedule({ frequency: "woechentlich", weekday: 1 });
    const occ = auto.latestOccurrence(weekly, T("2026-10-21T10:00:00Z")); // Mittwoch
    assert.deepEqual(occ.day, { y: 2026, m: 10, d: 19 });
    const r = auto.reportRange(weekly, occ.day, occ.at);
    assert.equal(r.from, time.berlinToUtc(2026, 10, 12));
    assert.equal(r.to, time.berlinToUtc(2026, 10, 19));
    const monthly = schedule({ frequency: "monatlich", monthDay: 1 });
    const m = auto.latestOccurrence(monthly, T("2027-01-01T06:00:00Z"));
    assert.deepEqual(m.day, { y: 2027, m: 1, d: 1 });
    const mr = auto.reportRange(monthly, m.day, m.at);
    assert.equal(mr.from, time.berlinToUtc(2026, 12, 1));
    assert.equal(mr.to, time.berlinToUtc(2027, 1, 1));
    const laufend = auto.reportRange({ frequency: "monatlich", scope: "laufend" }, { y: 2026, m: 10, d: 20 }, T("2026-10-20T03:00:00Z"));
    assert.equal(laufend.from, time.berlinToUtc(2026, 10, 1));
    assert.equal(laufend.to, T("2026-10-20T03:00:00Z"));
  });

  test("fällig: nur aktiv, höchstens 36 Stunden verspätet, nie vor der letzten Änderung, nicht doppelt", () => {
    const now = T("2026-10-20T04:00:00Z");
    assert.equal(auto.dueSchedules([schedule({ active: false })], new Set(), now).length, 0);
    const due = auto.dueSchedules([schedule()], new Set(), now);
    assert.equal(due.length, 1);
    assert.equal(due[0].key, "sched_daily1:2026-10-20");
    assert.equal(auto.dueSchedules([schedule()], new Set([due[0].key]), now).length, 0);
    // eben erst eingeschaltet → kein alter Termin wird nachgeholt
    assert.equal(auto.dueSchedules([schedule({ updatedAt: "2026-10-20T03:30:00.000Z" })], new Set(), now).length, 0);
    // monatlicher Termin vor 10 Tagen → zu alt
    assert.equal(auto.dueSchedules([schedule({ frequency: "monatlich", monthDay: 10 })], new Set(), now).length, 0);
  });
});

/* ───────────── Ausführung ───────────── */

describe("AP3: Ausführung (Cron)", () => {
  const NOW = T("2026-10-20T04:00:00Z");

  test("ein Termin läuft genau einmal – auch bei doppeltem oder parallelem Aufruf", async () => {
    await setConfig([schedule()]);
    const deps = { now: NOW, products: PRODUCTS, load: okLoad() };
    const [a, b] = await Promise.all([svc.runScheduled(deps), svc.runScheduled(deps)]);
    assert.equal(a.ran + b.ran, 1);
    assert.equal(a.skipped + b.skipped, 1);
    const again = await svc.runScheduled(deps);
    assert.equal(again.ran, 0);
    const list = await svc.listReports(NOW);
    assert.equal(list.length, 1);
    const e = list[0];
    assert.equal(e.status, "ok");
    assert.equal(e.trigger, "zeitplan");
    assert.equal(e.range.label.includes("19.10.2026"), true);
    assert.equal(e.summary?.orders, 3);
    assert.equal(e.summary?.privat, 2);
    assert.equal(e.summary?.haendler, 1);
    assert.match(e.id, /^B-[A-Z0-9]+-[0-9A-F]{8}$/);
    assert.ok(await svc.findReport(e.id, NOW));
    const state = await svc.getState();
    assert.equal(state?.trigger, "zeitplan");
  });

  test("unvollständige Daten: Fehler wird vermerkt und höchstens 3-mal wiederholt", async () => {
    await setConfig([schedule()]);
    let calls = 0;
    const load = async (): Promise<LoadResult> => {
      calls++;
      return { orders: [], complete: false, errors: ["Stripe nicht erreichbar"], source: "stripe" };
    };
    for (let i = 0; i < 5; i++) await svc.runScheduled({ now: NOW + i * 60_000, products: PRODUCTS, load });
    assert.equal(calls, 3);
    const list = await svc.listReports(NOW);
    assert.equal(list.length, 3);
    assert.ok(list.every((e) => e.status === "unvollstaendig" && e.mail === "aus"));
  });

  test("Fehler, dann Erfolg: der zweite Lauf holt den Bericht nach", async () => {
    await setConfig([schedule()]);
    let first = true;
    const load = async (): Promise<LoadResult> => {
      if (first) {
        first = false;
        throw new Error("boom");
      }
      return okLoad()();
    };
    const r1 = await svc.runScheduled({ now: NOW, products: PRODUCTS, load });
    assert.equal(r1.failed, 1);
    const r2 = await svc.runScheduled({ now: NOW + 60_000, products: PRODUCTS, load });
    assert.equal(r2.ran, 1);
    const r3 = await svc.runScheduled({ now: NOW + 120_000, products: PRODUCTS, load });
    assert.equal(r3.ran + r3.failed, 0);
  });

  test("E-Mail nur mit Freigabe OFFICE_REPORT_EMAILS=1 – und dann ohne Kundendaten", async () => {
    await setConfig([schedule()]);
    const sent: { subject: string; text: string; html?: string }[] = [];
    const send = (async (m: { subject: string; text: string; html?: string }) => {
      sent.push(m);
      return { ok: true as const, id: "x" };
    }) as never;
    await svc.runScheduled({ now: NOW, products: PRODUCTS, load: okLoad(), send });
    assert.equal(sent.length, 0);
    assert.equal((await svc.listReports(NOW))[0].mail, "aus");

    process.env.OFFICE_REPORT_EMAILS = "1";
    const r = await svc.runManual(schedule(), auto.reportRange(schedule(), { y: 2026, m: 10, d: 20 }, NOW), "Administrator", { now: NOW, products: PRODUCTS, load: okLoad(), send });
    assert.equal(r.mail, "versendet");
    assert.equal(sent.length, 1);
    for (const s of [NAME, STREET, EMAIL, "Ayşe", "Industriestr", "einkauf@kiosk.de"]) assert.ok(!sent[0].text.includes(s) && !(sent[0].html ?? "").includes(s), `E-Mail enthält ${s}`);
    assert.match(sent[0].text, /Neue Bestellungen: 3/);
    assert.match(sent[0].text, /keine Lagerbestände/);
  });

  test("Zusammenfassung: schlägt der E-Mail-Versand fehl, werden die Hinweise nicht als gemeldet markiert", async () => {
    process.env.OFFICE_REPORT_EMAILS = "1";
    const n = () => auto.notifications(ORDERS, { ...auto.DEFAULT_CONFIG, digest: true }, NOW - 86_400_000, PRODUCTS);
    assert.ok(n().length > 0, "Testdaten erzeugen Hinweise");
    await setConfig([], { digest: true, digestRecipients: ["buero@example.invalid"] });
    const fail = (async () => ({ ok: false as const, error: "Testfehler" })) as never;
    const r = await svc.runScheduled({ now: NOW, products: PRODUCTS, load: okLoad(), send: fail });
    assert.equal(r.digest?.mail, "fehler");
    assert.equal((await svc.filterUnsent(n())).length, n().length, "nach Fehler wieder meldbar");
    // erfolgreicher Versand → markiert
    setKvBackend(memoryBackend(() => Date.now()));
    const ok = (async () => ({ ok: true as const, id: "x" })) as never;
    const r2 = await svc.runScheduled({ now: NOW, products: PRODUCTS, load: okLoad(), send: ok });
    assert.equal(r2.digest?.mail, "versendet");
    assert.equal((await svc.filterUnsent(n())).length, 0);
  });

  test("Berichte verändern keine Bestelldaten und speichern keine Kundendaten in der Historie", async () => {
    await setConfig([schedule({ type: "tagesbericht" })], { digest: true });
    const before = JSON.stringify(ORDERS);
    await svc.runScheduled({ now: NOW, products: PRODUCTS, load: okLoad() });
    assert.equal(JSON.stringify(ORDERS), before);
    const hist = JSON.stringify(await svc.listReports(NOW));
    for (const s of [NAME, STREET, EMAIL, "Ayşe", "Industriestr"]) assert.ok(!hist.includes(s), `Historie enthält ${s}`);
    const entries = await svc.listReports(NOW);
    assert.ok(entries.some((e) => e.kind === "zusammenfassung"));
    const rep = entries.find((e) => e.kind === "bericht");
    assert.ok((rep?.pdfBytes ?? 0) > 1000, "PDF wurde zur Prüfung erzeugt");
    // keine Bürostatus-/Lieferschein-Schlüssel angelegt
    assert.equal(await store.getJSON("tt:office-wf:" + ORDERS[0].key, null), null);
  });
});

/* ───────────── Hinweise ───────────── */

describe("AP3: Benachrichtigungen und Erinnerungen", () => {
  const cfg = auto.DEFAULT_CONFIG;
  test("Erinnerung „länger offen“ erst nach der eingestellten Zeit, nie mit Name oder Adresse", () => {
    const o = ORDERS[0];
    assert.equal(auto.reminders([o], cfg, o.createdAt + 23 * 3_600_000).filter((r) => r.kind === "offen").length, 0);
    const r = auto.reminders([o], cfg, o.createdAt + 25 * 3_600_000).filter((x) => x.kind === "offen");
    assert.equal(r.length, 1);
    assert.equal(r[0].order, o.number);
    const off = { ...cfg, reminders: { ...cfg.reminders, offen: { enabled: false, hours: 24 } } };
    assert.equal(auto.reminders([o], off, o.createdAt + 25 * 3_600_000).filter((x) => x.kind === "offen").length, 0);
  });

  test("Benachrichtigungen: neue Privat-/Händlerbestellung, offene Zahlung – ohne Kundendaten", () => {
    const n = auto.notifications(ORDERS, cfg, T("2026-10-19T00:00:00Z"), PRODUCTS);
    const kinds = n.map((x) => x.kind);
    assert.ok(kinds.includes("neue_bestellung"));
    assert.ok(kinds.includes("neue_haendlerbestellung"));
    assert.ok(kinds.includes("zahlung_offen"));
    const all = JSON.stringify([...n, ...auto.reminders(ORDERS, cfg, T("2026-10-22T00:00:00Z"))]);
    for (const s of [NAME, STREET, EMAIL, "Ayşe", "Industriestr", "Kiosk"]) assert.ok(!all.includes(s), `Hinweis enthält ${s}`);
    const d = auto.digestText(n, "https://example.invalid/admin/buero");
    assert.ok(!d.text.includes(NAME));
  });

  test("jeder Hinweis wird in der Zusammenfassung nur einmal gemeldet", async () => {
    const n = auto.notifications(ORDERS, cfg, T("2026-10-19T00:00:00Z"), PRODUCTS);
    const first = await svc.filterUnsent(n);
    const second = await svc.filterUnsent(n);
    assert.equal(first.length, n.length);
    assert.equal(second.length, 0);
  });
});

/* ───────────── Rechte und Cron-Schutz ───────────── */

describe("AP3: Rechte und Schutz", () => {
  test("Einstellen nur Administrator, manuell erstellen Admin + Büro, Lesezugriff nur ansehen", () => {
    assert.equal(roles.can("admin", "office.automation"), true);
    assert.equal(roles.can("buero", "office.automation"), false);
    assert.equal(roles.can("lesen", "office.automation"), false);
    assert.equal(roles.can("buero", "office.reports"), true);
    assert.equal(roles.can("lesen", "office.reports"), false);
    assert.equal(roles.can("lesen", "office.view"), true);
  });

  test("Cron-Endpunkt nur mit CRON_SECRET (mind. 16 Zeichen)", () => {
    assert.equal(cronAuthorized(null, {}), false);
    assert.equal(cronAuthorized("Bearer kurz", { CRON_SECRET: "kurz" }), false);
    assert.equal(cronAuthorized("Bearer falsch-falsch-falsch", { CRON_SECRET: "richtig-richtig-1234" }), false);
    assert.equal(cronAuthorized("Bearer richtig-richtig-1234", { CRON_SECRET: "richtig-richtig-1234" }), true);
  });

  test("vercel.json: Büro-Cron täglich (Hobby-Tarif) neben der Sicherung", async () => {
    const v = JSON.parse(await fs.readFile(path.join(ROOT, "vercel.json"), "utf8"));
    const office = v.crons.find((c: { path: string }) => c.path === "/api/cron/office");
    assert.equal(office?.schedule, "0 4 * * *");
    assert.ok(v.crons.some((c: { path: string }) => c.path === "/api/cron/backup"));
  });
});
