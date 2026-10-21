/**
 * Master-Auftrag AP1 – Firmenstammdaten, Impressum und Geschäftsdokumente.
 * Rein (ohne Netz, ohne Datenbank): Standardwerte, Geschäftsführer-Reihenfolge, Abgleich, Formularprüfung, keine internen Daten im Code.
 */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { describe, test } from "node:test";

const ROOT = path.join(import.meta.dirname, "..");
const { company, MANAGING_DIRECTORS, COMPANY_DATA_SOURCE } = await import("../lib/company");
const sd = await import("../lib/settings-defaults");
const validate = await import("../app/admin/(panel)/einstellungen/validate");

describe("Firmenstammdaten", () => {
  test("Betreiberangaben vom 21.10.2026", () => {
    assert.equal(company.name, "Exstase Großhandel GmbH");
    assert.equal(company.street, "Carl-Kühne-Str. 4");
    assert.equal(company.city, "47638 Straelen");
    assert.equal(company.country, "Deutschland");
    assert.equal(company.phone, "0211 157 759-0");
    assert.equal(company.fax, "0211 157 759-29");
    assert.equal(company.email, "hello@exstase.com");
    assert.equal(company.website, "https://exstase.com");
    assert.equal(company.vatId, "DE311899184");
    assert.equal(company.register, "Amtsgericht Düsseldorf, HRB 90042");
    assert.equal(COMPANY_DATA_SOURCE.registerVerified, false, "Registerstand nicht amtlich geprüft → freigabepflichtig");
  });

  test("Geschäftsführer in genau dieser Reihenfolge, ausgeschiedener Geschäftsführer nicht enthalten", () => {
    assert.deepEqual([...MANAGING_DIRECTORS], ["Christopher Walich", "Orhan Yilmaz"]);
    assert.deepEqual(sd.managersOf(company.owner), ["Christopher Walich", "Orhan Yilmaz"]);
    assert.deepEqual(sd.managersOf(sd.DEFAULT_SETTINGS.company.owner), ["Christopher Walich", "Orhan Yilmaz"]);
    assert.doesNotMatch(JSON.stringify(company), /Dündar|Dundar/);
  });

  test("Geschäftsführer aus Freitext lesen (Reihenfolge bleibt, Anrede entfällt)", () => {
    assert.deepEqual(sd.managersOf("Geschäftsführer: Herr Christopher Walich"), ["Christopher Walich"]);
    assert.deepEqual(sd.managersOf("Geschäftsführer: Orhan Yilmaz und Christopher Walich"), ["Orhan Yilmaz", "Christopher Walich"]);
    assert.deepEqual(sd.managersOf("Christopher Walich; Orhan Yilmaz"), ["Christopher Walich", "Orhan Yilmaz"]);
    assert.deepEqual(sd.managersOf("[Geschäftsführer]"), []);
    assert.deepEqual(sd.managersOf(""), []);
  });

  test("Abgleich erkennt veraltete gespeicherte Firmendaten (Markenname zählt nicht)", () => {
    const stored = { ...sd.DEFAULT_SETTINGS.company, name: "exstase Großhandel GmbH", owner: "Geschäftsführer: Herr Christopher Walich", vatId: "DE 311899184", brand: "Anders" };
    const diff = sd.companyDiff(stored);
    assert.deepEqual(
      diff.map((d) => d.key),
      ["name", "owner"],
      "USt-IdNr. mit Leerzeichen gilt als gleich",
    );
    assert.deepEqual(sd.companyDiff(sd.DEFAULT_SETTINGS.company), []);
  });

  test("Fax und Website sind freiwillig (nicht „fehlt“)", () => {
    const s = { ...sd.DEFAULT_SETTINGS, company: { ...sd.DEFAULT_SETTINGS.company, fax: "", website: "" } };
    assert.deepEqual(sd.missingCompanyFields(s), []);
    const s2 = { ...sd.DEFAULT_SETTINGS, company: { ...sd.DEFAULT_SETTINGS.company, phone: "" } };
    assert.deepEqual(sd.missingCompanyFields(s2), ["phone"]);
  });

  test("Einstellungsformular: Standardwerte sind gültig, falsche Website/Registerangabe werden abgelehnt", () => {
    const input = validate.toInput(sd.DEFAULT_SETTINGS);
    const ok = validate.checkSettings(input);
    assert.deepEqual(ok.errors, {});
    assert.equal(ok.value?.company.fax, "0211 157 759-29");
    const bad = validate.checkSettings({ ...input, company: { ...input.company, website: "exstase.com", register: "Düsseldorf" } });
    assert.ok(bad.errors["company.website"]);
    assert.ok(bad.errors["company.register"]);
    const empty = validate.checkSettings({ ...input, company: { ...input.company, fax: "", website: "" } });
    assert.deepEqual(empty.errors, {}, "freiwillige Felder dürfen leer bleiben");
  });

  test("Registerangabe wird für das Impressum getrennt", async () => {
    const { splitRegister } = await import("../components/legal-page");
    assert.deepEqual(splitRegister("Amtsgericht Düsseldorf, HRB 90042"), { court: "Amtsgericht Düsseldorf", number: "HRB 90042" });
    assert.deepEqual(splitRegister("HRB 90042"), { court: "", number: "" });
  });

  test("Keine internen Firmendaten (Steuernummer, IBAN) im öffentlichen Code", async () => {
    const files = ["lib/company.ts", "lib/settings-defaults.ts", "app/impressum/page.tsx", "components/footer.tsx", "lib/dealer-orders.ts", "README.md"];
    for (const f of files) {
      const code = await fs.readFile(path.join(ROOT, f), "utf8");
      assert.doesNotMatch(code, /113\s*\/\s*5740\s*\/\s*4142|DE76\s?3005|DUSSDEDD/, f);
    }
  });
});
