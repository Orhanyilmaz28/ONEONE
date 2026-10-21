/**
 * Leistungsmessung der Büroverwaltung mit erfundenen Testbestellungen (keine echten Daten, kein Netz, keine Datenbank).
 * Aufruf: npx tsx scripts/perf-office.mts [Anzahl …]   (Standard: 500 2000 10000)
 * Misst: Kennzahlen, Filter, Artikel-Sammelliste, Excel-Export (Bestellungen + Positionen), PDF Tagesbericht,
 * PDF Versandliste, PDF Sammelliste, Bürobericht-Zusammenfassung, Erinnerungen/Benachrichtigungen.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_CONFIG, notifications, reminders, summarize } from "../lib/office/automation";
import { collectListPdf, dailyReportPdf, shippingListPdf } from "../lib/office/documents";
import { buildSheets } from "../lib/office/export";
import { buildXlsx } from "../lib/office/xlsx";
import { NO_FILTERS, applyFilters } from "../lib/office/filters";
import { computeKpis } from "../lib/office/kpis";
import { type OfficeOrder, fromStripe } from "../lib/office/model";
import { yearRange } from "../lib/office/time";
import type { Product } from "../lib/types";

const ROOT = path.join(import.meta.dirname, "..");
const catalog = JSON.parse(await fs.readFile(path.join(ROOT, "data", "products.json"), "utf8"));
const PRODUCTS = new Map<string, Product>((catalog.products as Product[]).map((p) => [p.handle, p]));
const handles = [...PRODUCTS.values()].filter((p) => !p.collections.includes("mixpakete")).map((p) => p.handle).slice(0, 20);
const COMPANY = { name: "Testfirma GmbH", street: "Teststr. 1", city: "12345 Teststadt", country: "Deutschland", email: "test@example.invalid", phone: "0000 0000", vatId: "DE000000000", register: "Amtsgericht Test, HRB 1", owner: "Test" };

function fakeOrders(n: number, year: number): OfficeOrder[] {
  const from = Date.UTC(year, 0, 1);
  const span = 365 * 86_400_000;
  const out: OfficeOrder[] = [];
  for (let i = 0; i < n; i++) {
    const h = handles[i % handles.length];
    const qty = 1 + (i % 4);
    const created = from + Math.floor((i / n) * span);
    const s = {
      id: `cs_test_${String(i).padStart(10, "0")}`,
      created: Math.floor(created / 1000),
      amount_total: qty * 1800 + qty * 600 + 590,
      amount_subtotal: qty * 2400,
      payment_status: i % 9 === 0 ? "unpaid" : "paid",
      metadata: { items: `${h}:${qty}` },
      customer_details: { name: `Test Person ${i}`, email: `t${i}@example.invalid`, address: { line1: `Testweg ${i}`, postal_code: "12345", city: "Teststadt", country: "DE" } },
      shipping_cost: { amount_total: 590 },
      total_details: { amount_discount: 0, amount_tax: 0 },
      payment_intent: { latest_charge: { amount_refunded: 0, refunded: false, payment_method_details: { type: "card" } } },
    } as import("../lib/office/model").StripeSessionLike;
    const lines = [
      { description: h, quantity: qty, amount_total: qty * 1800, amount_subtotal: qty * 1800, amount_discount: 0, price: { unit_amount: 1800 } },
      { description: "Einwegpfand", quantity: qty * 24, amount_total: qty * 600, amount_subtotal: qty * 600, amount_discount: 0, price: { unit_amount: 25 } },
    ];
    out.push(fromStripe(s, lines, { status: i % 5 === 0 ? "versendet" : "offen" }, PRODUCTS, `EX-${String(i).padStart(6, "0")}`));
  }
  return out;
}

function time<T>(label: string, fn: () => T): { label: string; ms: number; out: T } {
  const t = performance.now();
  const out = fn();
  return { label, ms: performance.now() - t, out };
}

const sizes = process.argv.slice(2).map(Number).filter((x) => x > 0);
const year = 2026;
const range = yearRange(year);
const now = Date.UTC(year, 11, 31, 12);
console.log(`Node ${process.version} · ${process.platform}/${process.arch}`);
for (const n of sizes.length ? sizes : [500, 2000, 10000]) {
  const orders = fakeOrders(n, year);
  const ctx = { range, filters: [], createdBy: "Messung", now, siteUrl: "https://example.invalid", products: PRODUCTS };
  const lctx = { title: "Messung", range, filters: [], createdBy: "Messung", now };
  const rows = [
    time("Kennzahlen (computeKpis)", () => computeKpis(orders, range, now)),
    time("Filter (alle)", () => applyFilters(orders, NO_FILTERS, PRODUCTS).length),
    time("Excel vollständig (Tabellen)", () => buildSheets("voll", orders, ctx).length),
    time("Excel als Datei (XLSX)", () => buildXlsx(buildSheets("voll", orders, ctx)).length),
    time("PDF Tagesbericht", () => dailyReportPdf(orders, lctx, COMPANY, PRODUCTS, null).length),
    time("PDF Versandliste", () => shippingListPdf(orders, lctx, COMPANY, PRODUCTS, null).length),
    time("PDF Sammelliste", () => collectListPdf(orders, lctx, COMPANY, PRODUCTS, null).length),
    time("Bürobericht-Zusammenfassung", () => summarize(orders, range, PRODUCTS, now).orders),
    time("Erinnerungen + Benachrichtigungen", () => reminders(orders, DEFAULT_CONFIG, now).length + notifications(orders, DEFAULT_CONFIG, now - 7 * 86_400_000, PRODUCTS).length),
  ];
  console.log(`\n${n} Bestellungen`);
  for (const r of rows) console.log(`  ${r.label.padEnd(36)} ${r.ms.toFixed(0).padStart(6)} ms${typeof r.out === "number" && r.label.includes("PDF") ? `  (${(r.out / 1024).toFixed(0)} KB)` : ""}${r.label.includes("XLSX") ? `  (${((r.out as number) / 1024).toFixed(0)} KB)` : ""}`);
  const heap = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`  Speicher (Heap)                      ${heap.toFixed(0).padStart(6)} MB`);
}
