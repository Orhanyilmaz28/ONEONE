/**
 * AP4 – Fallnummern gegen eine echte lokale Test-Redis (Upstash-REST-Brücke). Läuft nur mit REDIS_TEST_URL auf
 * 127.0.0.1/localhost; die Umgebung wird VOR dem Import gesetzt, damit der Speicher wirklich Redis nutzt.
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const url = process.env.REDIS_TEST_URL;
const local = Boolean(url && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(url));
for (const k of ["KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL"]) delete process.env[k];
if (local) {
  process.env.UPSTASH_REDIS_REST_URL = url;
  process.env.UPSTASH_REDIS_REST_TOKEN = process.env.REDIS_TEST_TOKEN;
}

test("Fallnummern parallel gegen echte Redis: eindeutig, lückenlos, Liste vollständig", { skip: local ? false : "REDIS_TEST_URL (lokal) nicht gesetzt" }, async () => {
  const store = await import("../lib/store");
  assert.equal(store.storeKind(), "redis");
  const tk = await import("../lib/office/tickets");
  const svc = await import("../lib/office/tickets-service");
  const r = await fetch(url as string, { method: "POST", headers: { Authorization: `Bearer ${process.env.REDIS_TEST_TOKEN}` }, body: JSON.stringify(["KEYS", "tt:*office-ticket*"]) });
  const keys = ((await r.json()) as { result: string[] }).result;
  if (keys.length) await fetch(url as string, { method: "POST", headers: { Authorization: `Bearer ${process.env.REDIS_TEST_TOKEN}` }, body: JSON.stringify(["DEL", ...keys]) });
  const v = tk.validateCreate({ kind: "anfrage", subject: "Parallel-Test", description: "", customerName: "Test Kunde" }, { order: null });
  assert.ok(v.ok);
  const actor = { role: "buero" as const, label: "Test", id: "u-t" };
  const now = Date.parse("2026-10-21T10:00:00Z");
  const list = await Promise.all(Array.from({ length: 25 }, () => svc.createTicket(v.draft, actor, now)));
  const nums = list.map((t) => t.number).sort();
  assert.equal(new Set(nums).size, 25);
  assert.equal(nums[24], "KS-2026-00025");
  assert.equal((await svc.listTickets()).length, 25);
  // gleichzeitige Änderung mit demselben Stand → genau eine gewinnt
  const t = list[0];
  const res = await Promise.all([svc.updateTicket(t.number, { action: "prioritaet", priority: "hoch" }, t.rev, actor), svc.updateTicket(t.number, { action: "prioritaet", priority: "niedrig" }, t.rev, actor)]);
  assert.equal(res.filter((x) => x.ok).length, 1);
});
