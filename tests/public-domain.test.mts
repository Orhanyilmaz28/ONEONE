/** Sichtbare Domain: nie die technische Vercel-Adresse, sonst exstaseshop.com (Wunsch Orhan, 21.10.2026) */
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { test } from "node:test";

const { publicDomain, company } = await import("../lib/company");
const ROOT = path.join(import.meta.dirname, "..");

test("publicDomain: Vercel-Adresse und localhost → exstaseshop.com, eigene Domain bleibt", () => {
  assert.equal(company.domain, "exstaseshop.com");
  assert.equal(publicDomain("https://exstaseshop.vercel.app"), "exstaseshop.com");
  assert.equal(publicDomain("https://oneone-git-x-wagenmeister.vercel.app/"), "exstaseshop.com");
  assert.equal(publicDomain("http://localhost:3000"), "exstaseshop.com");
  assert.equal(publicDomain(""), "exstaseshop.com");
  assert.equal(publicDomain(undefined), "exstaseshop.com");
  assert.equal(publicDomain("https://www.exstaseshop.com"), "exstaseshop.com");
  assert.equal(publicDomain("https://shop.example.de"), "shop.example.de");
});

test("Impressum nutzt publicDomain, Rechtstexte nennen nirgends „vercel.app“", async () => {
  const legal = await fs.readFile(path.join(ROOT, "components/legal-page.tsx"), "utf8");
  assert.match(legal, /const domain = publicDomain\(\)/);
  for (const f of ["app/impressum/page.tsx", "app/datenschutz/page.tsx", "app/agb/page.tsx", "app/widerruf/page.tsx", "app/kontakt/page.tsx", "components/legal-page.tsx"]) {
    assert.doesNotMatch(await fs.readFile(path.join(ROOT, f), "utf8"), /vercel\.app/, f);
  }
});
