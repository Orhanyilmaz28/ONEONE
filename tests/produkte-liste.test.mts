/**
 * Produkt-Bearbeitung im Dashboard: Artikelnummern (doppelt/fehlt), Filter „Zu erledigen“, Gruppierung,
 * Blätter-Links und erlaubte Bildpfade. Rein, ohne Netz und ohne Datenbank.
 */
import assert from "node:assert/strict";
import { describe, test } from "node:test";

for (const k of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN", "VERCEL"]) delete process.env[k];

const { skuInfo } = await import("../app/admin/(panel)/produkte/checks");
const list = await import("../app/admin/(panel)/produkte/list");
const { checkContent } = await import("../app/admin/(panel)/produkte/content");
const { catalog } = await import("../lib/catalog");

describe("Artikelnummern", () => {
  test("doppelte Nummer wird bei beiden Produkten gemeldet", () => {
    const specs = { a: { artNr: "X1" }, b: { artNr: "X1" }, c: { artNr: "X2" } } as never;
    const info = skuInfo(["a", "b", "c", "d"], specs);
    assert.deepEqual(info.a.duplicateOf, ["b"]);
    assert.deepEqual(info.b.duplicateOf, ["a"]);
    assert.deepEqual(info.c.duplicateOf, []);
    assert.equal(info.d.artNr, undefined);
  });

  test("echter Katalog: D31102 steht bei Caramel und Vanille (Daten bleiben unverändert)", () => {
    const info = skuInfo(catalog.products.map((p) => p.handle));
    assert.deepEqual(info["ice-coffee-caramel"].duplicateOf, ["ice-coffee-vanille"]);
  });
});

describe("Produktliste", () => {
  const rows = list.buildRows(catalog.products, {});

  test("„Zu erledigen“ umfasst fehlende Zutaten, fehlende und doppelte Artikelnummern", () => {
    const todo = rows.filter((r) => list.matchesFilter(r, "zu-erledigen"));
    for (const r of rows) {
      const expected = !r.product.material || !r.artNr || r.artNrDuplicate.length > 0;
      assert.equal(todo.includes(r), expected, r.product.handle);
    }
    assert.ok(rows.filter((r) => list.matchesFilter(r, "artnr-doppelt")).every((r) => r.artNr === "D31102"));
  });

  test("Suche findet Artikelnummer und EAN", () => {
    assert.deepEqual(
      rows.filter((r) => list.matchesSearch(r, "D31044")).map((r) => r.product.handle),
      ["lime"],
    );
    const ean = rows.find((r) => r.ean)?.ean as string;
    assert.equal(rows.filter((r) => list.matchesSearch(r, ean)).length, 1);
  });

  test("Gruppen folgen den Kollektionen und enthalten jedes Produkt genau einmal", () => {
    const groups = list.groupRows(rows);
    const handles = groups.flatMap((g) => g.rows.map((r) => r.product.handle));
    assert.equal(handles.length, rows.length);
    assert.equal(new Set(handles).size, rows.length);
    assert.equal(groups[0].key, catalog.collections[0].handle);
  });

  test("Links behalten Filter und Suche", () => {
    assert.equal(list.productHref("lime", "material-fehlt", ""), "/admin/produkte/lime?liste=material-fehlt");
    assert.equal(list.listHref("material-fehlt", "D3"), "/admin/produkte?filter=material-fehlt&q=D3");
    assert.equal(list.productHref("lime", "", ""), "/admin/produkte/lime");
    assert.equal(list.isFilter("artnr-fehlt"), true);
    assert.equal(list.isFilter("quatsch"), false);
  });
});

describe("Bilder", () => {
  const base = { title: "T", subtitle: "", description: "", collections: [], highlights: "", capacity: "", absorbency: "", packSize: "", options: [] };
  test("Dosen-Fotos aus dem Katalog sind erlaubt (sonst ließ sich der Text nicht speichern)", () => {
    const { errors } = checkContent({ ...base, images: [{ src: "/dosen-foto/lime.webp", alt: "" }] }, []);
    assert.equal(errors.images, undefined);
  });
  test("fremde oder verdächtige Pfade bleiben gesperrt", () => {
    assert.ok(checkContent({ ...base, images: [{ src: "https://evil.example/x.jpg", alt: "" }] }, []).errors.images);
    assert.ok(checkContent({ ...base, images: [{ src: "/dosen-foto/../x.jpg", alt: "" }] }, []).errors.images);
  });
});

describe("Varianten umbenennen", async () => {
  const { buildVariants, renamedVariants } = await import("../app/admin/(panel)/produkte/content");
  const old = [
    { id: "p-24er-tray", title: "24er Tray", price: 1800, available: true, options: { Packung: "24er Tray" } },
    { id: "p-48er-tray", title: "48er Tray", price: 3500, available: false, options: { Packung: "48er Tray" } },
  ];
  test("umbenannte Varianten werden der Reihe nach zugeordnet", () => {
    const next = buildVariants("p", [{ name: "Packung", values: ["24er Karton", "48er Karton"] }], old, { price: 1000 });
    assert.deepEqual(renamedVariants(old, next), { "p-24er-tray": "p-24er-karton", "p-48er-tray": "p-48er-karton" });
  });
  test("nur hinzugefügt oder entfernt → keine Zuordnung", () => {
    const more = buildVariants("p", [{ name: "Packung", values: ["24er Tray", "48er Tray", "72er Tray"] }], old, { price: 1000 });
    assert.deepEqual(renamedVariants(old, more), {});
    const less = buildVariants("p", [{ name: "Packung", values: ["24er Tray"] }], old, { price: 1000 });
    assert.deepEqual(renamedVariants(old, less), {});
  });
});
