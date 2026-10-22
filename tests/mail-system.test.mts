import assert from "node:assert/strict";
import { existsSync, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";

const ROOT = process.cwd();
// Eigener Arbeitsordner für den lokalen Datenspeicher (.data/store.json) – vor dem Laden der Module
process.chdir(await fs.mkdtemp(path.join(os.tmpdir(), "exstase-mail-system-")));
for (const k of ["VERCEL", "UPSTASH_REDIS_REST_URL", "KV_REST_API_URL", "BREVO_API_KEY", "RESEND_API_KEY", "SMTP_HOST", "SMTP_USER", "SMTP_PASS", "MAIL_FROM"]) delete process.env[k];

const { MAIL_TYPES, mailTypeOf } = await import("../lib/mail-types.ts");
const { renderPreview, PREVIEW_TAGS } = await import("../lib/mail-previews.ts");
const { DEFAULT_SETTINGS } = await import("../lib/settings-defaults.ts");
const { MAIL_IMAGE_HANDLES } = await import("../lib/mail-images.ts");
const { classifyKey } = await import("../lib/backup/keys.ts");

test("Jede E-Mail-Art hat eine Vorschau im neuen Design", () => {
  for (const t of MAIL_TYPES) {
    const r = renderPreview(t.tag, DEFAULT_SETTINGS);
    assert.ok(r, `Vorschau fehlt: ${t.tag}`);
    assert.ok(r.subject.length > 3, t.tag);
    assert.match(r.html, /\/mail\/logo\.png/, `Logo fehlt: ${t.tag}`);
    assert.doesNotMatch(r.html, /undefined|NaN|\[object Object\]/, `Platzhalter in ${t.tag}`);
    assert.doesNotMatch(r.text, /undefined|NaN/, `Platzhalter im Text von ${t.tag}`);
    assert.ok(r.text.trim().length > 20, `Text-Fassung zu kurz: ${t.tag}`);
  }
  assert.deepEqual([...PREVIEW_TAGS].sort(), MAIL_TYPES.map((t) => t.tag).sort());
});

test("Bestellbestätigung: Produktbilder, Pfand eigene Zeile, Fortschritt, kein „neutral verpackt“", () => {
  const r = renderPreview("bestellung", DEFAULT_SETTINGS);
  assert.ok(r);
  assert.match(r.html, /\/mail\/p\/classic\.jpg/);
  assert.match(r.html, /Einwegpfand \(36 × 0,25 €\)/);
  assert.match(r.html, /Bestellt/);
  assert.match(r.html, /Widerrufsbelehrung/);
  assert.doesNotMatch(r.html + r.text, /neutral/i);
  // Pfand erscheint nicht als eigene Artikelzeile mit Bild
  assert.doesNotMatch(r.html, /\/mail\/p\/pfand\.jpg/);
  assert.match(r.text, /Gesamt \(inkl\. MwSt\.\): 74,54/);
});

test("Werte von außen werden maskiert", async () => {
  const { adminDealerApplicationMail } = await import("../lib/mail-templates.ts");
  const r = adminDealerApplicationMail([["Firma", '<script>alert("x")</script>']], "<b>Böse</b>", DEFAULT_SETTINGS);
  assert.doesNotMatch(r.html, /<script>/);
  assert.match(r.html, /&lt;script&gt;/);
});

test("Mail-Bilder: jede gelistete Datei existiert, jedes Katalogprodukt hat eins", async () => {
  for (const h of MAIL_IMAGE_HANDLES) assert.ok(existsSync(path.join(ROOT, "public/mail/p", `${h}.jpg`)), h);
  assert.ok(existsSync(path.join(ROOT, "public/mail/logo.png")));
  const data = JSON.parse(await fs.readFile(path.join(ROOT, "data/products.json"), "utf8"));
  const products: { handle: string }[] = Array.isArray(data) ? data : data.products;
  for (const p of products) assert.ok(MAIL_IMAGE_HANDLES.has(p.handle), `Kein Mail-Bild für ${p.handle}`);
});

test("Kurznamen: Angebot zählt zur Nachricht, unbekannte bleiben unbekannt", () => {
  assert.equal(mailTypeOf("haendler-angebot")?.tag, "haendler-nachricht");
  assert.equal(mailTypeOf("monitor"), undefined);
});

test("Schalter: ausgeschaltete E-Mail wird nicht verschickt und als „aus“ protokolliert", async () => {
  const { setJSON, KEYS } = await import("../lib/store.ts");
  const { sendMail } = await import("../lib/mail.ts");
  const { getMailLog } = await import("../lib/mail-log.ts");
  await setJSON(KEYS.mail, { orderConfirmation: true, adminNotify: true, shippingNotice: true, adminEmail: "", off: ["haendler-anfrage"] });
  const res = await sendMail({ to: { email: "shop@example.com" }, subject: "Neue Händler-Anfrage: Test", html: "<p>x</p>", text: "x", tag: "haendler-anfrage" });
  assert.equal(res.ok, false);
  assert.equal(!res.ok && res.skipped, true);
  const log = await getMailLog();
  assert.equal(log[0].status, "aus");
  assert.equal(log[0].tag, "haendler-anfrage");
});

test("Immer-an-Mails lassen sich nicht ausschalten", async () => {
  const { mailEnabledIn } = await import("../lib/mail-settings.ts");
  const s = { orderConfirmation: false, adminNotify: false, shippingNotice: false, adminEmail: "", off: ["passwort", "newsletter-bestaetigung", "bestellung"] };
  assert.equal(mailEnabledIn(s, "passwort"), true);
  assert.equal(mailEnabledIn(s, "newsletter-bestaetigung"), true);
  assert.equal(mailEnabledIn(s, "bestellung"), false);
  assert.equal(mailEnabledIn(s, "versand"), true, "Versand-Schalter setzt nur das Häkchen vor");
  assert.equal(mailEnabledIn(s, "monitor"), true);
  // „Neue Bestellung“ aus heißt nicht „Neue Händler-Bestellung“ aus
  assert.equal(mailEnabledIn(s, "neue-bestellung"), false);
  assert.equal(mailEnabledIn(s, "neue-haendler-bestellung"), true);
  assert.equal(mailEnabledIn({ ...s, off: ["neue-haendler-bestellung"] }, "neue-haendler-bestellung"), false);
});

test("Protokoll: Fehler merkt sich den Inhalt, „nochmal senden“ räumt auf", async () => {
  const { sendMail } = await import("../lib/mail.ts");
  const { getMailLog, getRetryMail, markResent } = await import("../lib/mail-log.ts");
  // SMTP auf einen Port, an dem niemand lauscht → Versand schlägt sicher fehl
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = "1";
  process.env.SMTP_USER = "shop@example.com";
  process.env.SMTP_PASS = "x";
  const res2 = await sendMail({ to: { email: "kunde@example.com" }, subject: "Deine Bestellung 2", html: "<p>Hallo</p>", text: "Hallo", tag: "bestellung" });
  for (const k of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"]) delete process.env[k];
  assert.equal(res2.ok, false);
  const entry = (await getMailLog()).find((e) => e.subject === "Deine Bestellung 2");
  assert.ok(entry);
  assert.equal(entry.status, "fehler");
  assert.equal(entry.retry, true);
  const retry = await getRetryMail(entry.id);
  assert.equal(retry?.to.email, "kunde@example.com");
  assert.equal(retry?.html, "<p>Hallo</p>");
  await markResent(entry.id);
  assert.equal(await getRetryMail(entry.id), null);
  const after = (await getMailLog()).find((e) => e.id === entry.id);
  assert.ok(after?.resentAt);
  assert.equal(after?.retry, false);
});

test("Protokoll hält höchstens 300 Einträge und 30 Tage", async () => {
  const { pruneLog } = await import("../lib/mail-log.ts");
  const now = Date.now();
  const list = Array.from({ length: 320 }, (_, i) => ({ id: String(i), at: new Date(now - i * 60_000).toISOString(), tag: "x", to: "a@b.de", subject: "s", status: "ok" as const }));
  assert.equal(pruneLog(list, now).length, 300);
  const old = [{ id: "alt", at: new Date(now - 31 * 24 * 3600_000).toISOString(), tag: "x", to: "a@b.de", subject: "s", status: "ok" as const }];
  assert.equal(pruneLog(old, now).length, 0);
});

test("Datensicherung: Versandprotokoll gehört nicht hinein", () => {
  assert.equal(classifyKey("tt:mail-log").include, false);
  assert.equal(classifyKey("tt:mail-log:retry:0123456789abcdef").include, false);
  assert.equal(classifyKey("tt:ver:tt:mail-log").include, false);
  assert.equal(classifyKey("tt:mail").include, true);
});
