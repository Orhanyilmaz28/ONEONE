import { mailProvider, mailReady } from "@/lib/mail";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Icon, StatIcon } from "@/components/admin/overview/icons";
import { RevenueChart } from "@/components/admin/overview/revenue-chart";
import { GUIDES, type SetupItem, SetupCheck } from "@/components/admin/overview/setup-check";
import { berlinHour, changePercent, computeOverview, formatLongDay } from "@/components/admin/overview/stats";
import { TodoList } from "@/components/admin/overview/todo-list";
import { TopProducts } from "@/components/admin/overview/top-products";
import { Card, Notice, PageHeader, Stat } from "@/components/admin/ui";
import { requireAdmin } from "@/lib/admin-auth";
import { getOverrides, getProducts } from "@/lib/catalog";
import { formatPrice } from "@/lib/format";
import { listOrders } from "@/lib/orders";
import { type Settings, getSettings, missingCompanyFields } from "@/lib/settings";
import { KEYS, getJSON, storeKind } from "@/lib/store";
import { getStripe } from "@/lib/stripe";
import type { Product } from "@/lib/types";

export const metadata: Metadata = { title: "Übersicht" };

const DAY_MS = 86_400_000;

const euro0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const todayFmt = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "long", day: "numeric", month: "long" });

/** Große Beträge ohne Cent, damit die Kacheln auch auf dem Handy nicht überlaufen */
function money(cents: number) {
  return cents >= 100_000 ? euro0.format(cents / 100) : formatPrice(cents);
}

function greeting(now: number) {
  const h = berlinHour(now);
  if (h < 11) return "Guten Morgen";
  if (h < 18) return "Guten Tag";
  return "Guten Abend";
}

const COMPANY_FIELD_LABEL: Record<keyof Settings["company"], string> = {
  name: "Firmenname",
  brand: "Markenname",
  owner: "Geschäftsführung",
  street: "Straße",
  city: "PLZ und Ort",
  country: "Land",
  email: "E-Mail-Adresse",
  phone: "Telefonnummer",
  vatId: "USt-IdNr.",
  register: "Handelsregister",
};

/** Umgebungsvariable hervorgehoben darstellen */
function Env({ children }: { children: ReactNode }) {
  return <code className="whitespace-nowrap rounded-md bg-cream px-1.5 py-0.5 font-mono text-[12.5px] text-ink">{children}</code>;
}

/** Vergleich mit den 30 Tagen davor – Pfeil + Farbe + Text (nie nur Farbe) */
function Trend({ current, previous, format }: { current: number; previous: number; format: (n: number) => string }) {
  const pct = changePercent(current, previous);
  if (pct === null) {
    return <span>30 Tage davor: {format(previous)}</span>;
  }
  if (pct === 0) return <span>Gleich wie in den 30 Tagen davor</span>;
  const up = pct > 0;
  return (
    <span>
      <span className={`inline-flex items-center gap-0.5 font-medium ${up ? "text-emerald-700" : "text-red-700"}`}>
        <Icon className="size-3.5" name={up ? "arrowUp" : "arrowDown"} strokeWidth={2.2} />
        <span className="sr-only">{up ? "plus" : "minus"}</span>
        {Math.abs(pct).toLocaleString("de-DE")} %
      </span>{" "}
      zu den 30 Tagen davor
    </span>
  );
}

/** Kleiner Fortschrittsring + Link zum Startklar-Check (nur solange noch etwas offen ist) */
function SetupPill({ done, total }: { done: number; total: number }) {
  const r = 7;
  const c = 2 * Math.PI * r;
  return (
    <a
      className="inline-flex items-center gap-2.5 rounded-full border border-line bg-white py-2 pr-4 pl-2.5 font-medium text-[14px] text-ink outline-none transition hover:border-ink/40 focus-visible:ring-2 focus-visible:ring-ink/30"
      href="#startklar"
    >
      <svg aria-hidden className="-rotate-90 size-[18px]" viewBox="0 0 18 18">
        <circle cx="9" cy="9" fill="none" r={r} stroke="#ece8e2" strokeWidth="2.5" />
        <circle cx="9" cy="9" fill="none" r={r} stroke="#141414" strokeDasharray={`${(done / total) * c} ${c}`} strokeLinecap="round" strokeWidth="2.5" />
      </svg>
      Startklar-Check: {done} von {total} erledigt
    </a>
  );
}

/** Bewertungen im Speicher, die noch freigegeben werden müssen */
function countPending(raw: unknown) {
  if (!Array.isArray(raw)) return 0;
  return raw.filter((r) => r && typeof r === "object" && (r as { status?: unknown }).status === "pending").length;
}

/** Newsletter: alle Anmeldungen + neue der letzten 30 Tage */
function newsletterStats(raw: unknown, now: number) {
  if (!Array.isArray(raw)) return { total: 0, recent: 0 };
  const since = now - 30 * DAY_MS;
  const recent = raw.filter((e) => {
    const created = e && typeof e === "object" ? (e as { createdAt?: unknown }).createdAt : undefined;
    const ms = typeof created === "number" ? created : typeof created === "string" ? Date.parse(created) : Number.NaN;
    return Number.isFinite(ms) && ms >= since;
  }).length;
  return { total: raw.length, recent };
}

export default async function AdminHome() {
  // Eigene Prüfung: das Layout allein schützt bei Client-Navigationen nicht zuverlässig
  await requireAdmin();
  // Zeitpunkt der Auswertung – alle Zahlen beziehen sich darauf
  const now = Date.now();
  const [result, reviewsRaw, newsletterRaw, settings, products, overrides] = await Promise.all([
    // 61 Tage = 30 Tage + die 30 Tage davor (für den Vergleich) + Puffer für die Zeitzone
    listOrders({ days: 61, limit: 1000 }),
    getJSON<unknown>(KEYS.reviews, []),
    getJSON<unknown>(KEYS.newsletter, []),
    getSettings(),
    getProducts({ includeHidden: true }),
    getOverrides(),
  ]);

  const o = computeOverview(result.orders, now);
  const pendingReviews = countPending(reviewsRaw);
  const newsletter = newsletterStats(newsletterRaw, now);
  const productMap = new Map<string, Product & { hidden?: boolean }>(products.map((p) => [p.handle, { ...p, hidden: overrides[p.handle]?.hidden }]));

  const avgPerDay = Math.round(o.month.revenue / 30);
  const best = o.days.reduce((a, b) => (b.revenue > a.revenue ? b : a), o.days[0]);

  // ── Startklar-Check ──
  const stripeKey = process.env.STRIPE_SECRET_KEY ?? "";
  const stripeOk = getStripe() !== null;
  const stripeError = result.source === "stripe" && result.error ? result.error : null;
  const liveKey = stripeOk && /^(sk|rk)_live_/.test(stripeKey);
  const testKey = stripeOk && /^(sk|rk)_test_/.test(stripeKey);
  const store = storeKind();
  const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "").trim();
  let siteHost = "";
  try {
    siteHost = siteUrl ? new URL(siteUrl).hostname : "";
  } catch {
    siteHost = "";
  }
  const siteOk = Boolean(siteHost) && !/^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])$/i.test(siteHost);
  const missing = missingCompanyFields(settings);
  const missingList = missing.map((k) => COMPANY_FIELD_LABEL[k]).join(", ");
  // Zutaten & Nährwerte (Pflichtangabe bei Lebensmitteln) – zählt nur bei Produkten, die im Shop zu sehen sind
  const shopProducts = products.filter((p) => !overrides[p.handle]?.hidden);
  const withoutMaterial = shopProducts.filter((p) => !p.material?.trim());

  const mailOk = mailReady() && mailProvider() !== "outbox";
  const setup: SetupItem[] = [
    {
      id: "stripe",
      title: "Zahlungen mit Stripe",
      done: stripeOk && !stripeError,
      status: stripeOk && !stripeError ? "Verbunden" : stripeError ? "Fehler" : "Fehlt",
      explanation: "Stripe wickelt alle Zahlungen ab (Karte, PayPal, Klarna, Apple Pay …). Dafür braucht der Shop deinen geheimen Stripe-Schlüssel.",
      detail: stripeError ? <span className="text-red-700">{stripeError}</span> : undefined,
      todo: stripeError ? (
        <>
          Im Stripe-Dashboard unter <b>Entwickler → API-Schlüssel</b> den Geheimschlüssel neu kopieren und bei Vercel in <Env>STRIPE_SECRET_KEY</Env> ersetzen. Danach
          neu bereitstellen („Redeploy“).
        </>
      ) : (
        <>
          Im Stripe-Dashboard unter <b>Entwickler → API-Schlüssel</b> den <b>Geheimschlüssel</b> kopieren. Bei Vercel unter <b>Settings → Environment Variables</b> als{" "}
          <Env>STRIPE_SECRET_KEY</Env> eintragen und neu bereitstellen („Redeploy“).
        </>
      ),
    },
    {
      id: "live",
      title: "Echte Zahlungen (Live-Modus)",
      done: liveKey,
      status: liveKey ? "Live" : testKey ? "Testmodus" : "Offen",
      explanation: (
        <>
          Mit einem Test-Schlüssel (beginnt mit <Env>sk_test_</Env>) kannst du gefahrlos ausprobieren – es fließt aber kein echtes Geld. Zum Verkaufen brauchst du den
          Live-Schlüssel (beginnt mit <Env>sk_live_</Env>).
        </>
      ),
      todo: testKey ? (
        <>
          In Stripe oben den Schalter <b>„Testmodus“</b> ausschalten, den Live-Geheimschlüssel kopieren und bei Vercel <Env>STRIPE_SECRET_KEY</Env> damit ersetzen.
          Stripe fragt vorher nach deinen Firmen- und Bankdaten.
        </>
      ) : (
        "Zuerst Stripe verbinden (Punkt darüber). Danach den Live-Schlüssel eintragen."
      ),
    },
    {
      id: "store",
      title: "Datenspeicher verbunden",
      done: store !== "none",
      status: store === "redis" ? "Online verbunden" : store === "file" ? "Lokal" : "Fehlt",
      explanation: "Hier merkt sich der Shop alles, was du im Dashboard änderst: Preise, Einstellungen, Bewertungen, Newsletter und den Versandstatus.",
      detail:
        store === "redis"
          ? "Verbunden mit Upstash Redis."
          : store === "file"
            ? "Auf diesem Computer wird eine Datei genutzt (.data/store.json). Online brauchst du Upstash Redis – siehe Anleitung „Online stellen“."
            : undefined,
      todo: (
        <>
          Bei Vercel im Projekt auf <b>Storage</b> klicken, <b>„Upstash for Redis“</b> (kostenlos) anlegen, mit diesem Projekt verbinden und neu bereitstellen.
        </>
      ),
      link: store === "redis" ? undefined : { href: GUIDES.online, label: "Schritt für Schritt in der Anleitung „Online stellen“", external: true },
    },
    {
      id: "domain",
      title: "Shop-Adresse eingetragen",
      done: siteOk,
      explanation: "Die Internet-Adresse deines Shops. Sie wird für die Rückkehr nach dem Bezahlen, für Google und beim Teilen von Links gebraucht.",
      detail: siteUrl ? `Aktuell eingetragen: ${siteUrl}` : "Noch keine Adresse eingetragen.",
      todo: (
        <>
          Bei Vercel unter <b>Settings → Environment Variables</b> die Variable <Env>NEXT_PUBLIC_SITE_URL</Env> mit deiner Adresse anlegen, z. B.{" "}
          <Env>https://exstase-energy.de</Env> – dann neu bereitstellen.
        </>
      ),
    },
    {
      id: "imprint",
      title: "Firmendaten fürs Impressum",
      done: missing.length === 0,
      status: missing.length ? `${missing.length} ${missing.length === 1 ? "Angabe fehlt" : "Angaben fehlen"}` : undefined,
      explanation: "Diese Angaben stehen im Impressum, in den AGB und in der Datenschutzerklärung. In Deutschland sind sie Pflicht.",
      detail: missing.length ? `Es fehlt noch: ${missingList}${missingList.endsWith(".") ? "" : "."}` : undefined,
      todo: "In den Einstellungen die fehlenden Felder ausfüllen und speichern – die Rechtstexte werden sofort aktualisiert.",
      link: missing.length ? { href: "/admin/einstellungen#firmendaten", label: "Firmendaten ergänzen" } : undefined,
    },
    {
      id: "material",
      title: "Zutaten & Nährwerte bei allen Produkten",
      done: withoutMaterial.length === 0,
      status: withoutMaterial.length ? `${withoutMaterial.length} ${withoutMaterial.length === 1 ? "fehlt" : "fehlen"}` : undefined,
      explanation: "Beim Online-Verkauf von Lebensmitteln müssen Kund:innen vor dem Kauf Zutaten, Allergene und Nährwerte sehen (Lebensmittelinformationsverordnung). Bitte von der Dose abtippen – inklusive Koffeingehalt.",
      detail: withoutMaterial.length
        ? withoutMaterial.length <= 3
          ? `Es fehlt noch bei: ${withoutMaterial.map((p) => p.title).join(", ")}.`
          : `Bei ${withoutMaterial.length} von ${shopProducts.length} Produkten im Shop fehlt die Angabe noch.`
        : undefined,
      todo: (
        <>
          Unter <b>Produkte</b> das Produkt öffnen und im Feld <b>Zutaten & Nährwerte</b> die Angaben von der Dose eintragen. Sie erscheint dann auf der Produktseite
          unter „Zutaten & Nährwerte“.
        </>
      ),
      link: withoutMaterial.length ? { href: "/admin/produkte?filter=material-fehlt", label: "Zutaten & Nährwerte ergänzen" } : undefined,
    },
    {
      id: "mail",
      title: "E-Mail-Versand eingerichtet",
      done: mailOk,
      status: mailOk ? (process.env.STRIPE_WEBHOOK_SECRET ? "Erledigt" : "Webhook fehlt") : "Offen",
      explanation:
        "Damit verschickt der Shop Bestellbestätigung, Versand-E-Mail, Newsletter-Bestätigung (Pflicht für Newsletter) und „Passwort vergessen“ selbst.",
      detail: mailOk && !process.env.STRIPE_WEBHOOK_SECRET ? "Empfohlen: Stripe-Webhook verbinden – dann kommt die Bestellbestätigung auch, wenn jemand die Danke-Seite schließt." : undefined,
      todo: (
        <>
          Kostenloses Konto bei Brevo anlegen, deine Domain dort bestätigen und in Vercel <Env>BREVO_API_KEY</Env> und <Env>MAIL_FROM</Env> eintragen – dann neu bereitstellen.
        </>
      ),
      link: { href: "/admin/einstellungen#emails", label: mailOk ? "E-Mail-Einstellungen" : "Zu den E-Mail-Einstellungen" },
    },
    {
      id: "password",
      title: "Dashboard mit Passwort geschützt",
      done: true,
      explanation: (
        <>
          Nur wer das Passwort kennt, kommt ins Dashboard. Wähle online ein eigenes, langes Passwort (<Env>ADMIN_PASSWORD</Env>) und gib es nicht weiter.
        </>
      ),
    },
  ];

  const openCount = o.openOrders.length;
  const setupDone = setup.filter((i) => i.done).length;

  return (
    <>
      <PageHeader
        description={
          <>
            {greeting(now)}! Heute ist {todayFmt.format(now)}. Hier siehst du auf einen Blick, wie dein Shop läuft und was zu tun ist.
          </>
        }
        title="Übersicht"
        actions={setupDone < setup.length ? <SetupPill done={setupDone} total={setup.length} /> : undefined}
      />

      {/* Hinweise zur Datenquelle */}
      {result.source === "demo" || result.source === "none" || stripeError ? (
        <div className="mb-6 flex flex-col gap-3">
          {result.source === "demo" ? (
            <Notice title="Beispieldaten – das sind noch keine echten Bestellungen" tone="blue">
              Stripe ist noch nicht verbunden. Damit du siehst, wie deine Übersicht später aussieht, zeigen wir dir erfundene Beispiel-Bestellungen. Sobald dein
              Stripe-Schlüssel eingetragen ist, erscheinen hier automatisch deine echten Zahlen.
            </Notice>
          ) : null}
          {result.source === "none" ? (
            <Notice title="Stripe ist noch nicht verbunden">
              Ohne Stripe kann niemand bezahlen, und hier erscheinen noch keine Bestellungen. Wie du Stripe verbindest, steht unten im{" "}
              <a className="font-medium underline underline-offset-2" href="#startklar">
                Startklar-Check
              </a>
              .
            </Notice>
          ) : null}
          {stripeError ? (
            <Notice title="Bestellungen konnten nicht vollständig geladen werden" tone="red">
              {stripeError}
            </Notice>
          ) : null}
        </div>
      ) : null}

      {/* Kennzahlen */}
      <section aria-label="Kennzahlen" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-3">
        <Stat
          hint={o.today.orders === 1 ? "1 Bestellung" : `${o.today.orders} Bestellungen`}
          icon={<StatIcon name="euro" />}
          label="Umsatz heute"
          value={money(o.today.revenue)}
        />
        <Stat
          hint={o.week.orders === 1 ? "1 Bestellung" : `${o.week.orders} Bestellungen`}
          icon={<StatIcon name="calendar" />}
          label="Umsatz 7 Tage"
          value={money(o.week.revenue)}
        />
        <Stat
          hint={<Trend current={o.month.revenue} format={money} previous={o.previousMonth.revenue} />}
          icon={<StatIcon name="chart" />}
          label="Umsatz 30 Tage"
          value={money(o.month.revenue)}
        />
        <Stat
          hint={<Trend current={o.month.orders} format={(n) => `${n} Bestellungen`} previous={o.previousMonth.orders} />}
          icon={<StatIcon name="bag" />}
          label="Bestellungen 30 Tage"
          value={o.month.orders.toLocaleString("de-DE")}
        />
        <Stat
          hint={o.month.orders ? <Trend current={o.month.average} format={money} previous={o.previousMonth.average} /> : "Noch keine Bestellungen"}
          icon={<StatIcon name="receipt" />}
          label="Ø Bestellwert"
          value={o.month.orders ? money(o.month.average) : "–"}
        />
        <Link
          className="rounded-3xl outline-none transition hover:[&>div]:border-ink/40 [&>div]:transition-colors focus-visible:ring-2 focus-visible:ring-ink/30 focus-visible:ring-offset-2 focus-visible:ring-offset-paper"
          href="/admin/bestellungen"
        >
          <Stat
            hint={
              openCount ? (
                <span className="font-medium text-amber-700">{openCount === 1 ? "Wartet auf Versand" : "Warten auf Versand"} →</span>
              ) : (
                <span className="font-medium text-emerald-700">Alles verschickt</span>
              )
            }
            icon={<StatIcon name="box" tone={openCount ? "amber" : "neutral"} />}
            label="Offene Versendungen"
            value={openCount.toLocaleString("de-DE")}
          />
        </Link>
      </section>
      {o.cancelled ? (
        <p className="mt-3 text-[13px] text-muted">
          {o.cancelled === 1 ? "1 stornierte Bestellung ist" : `${o.cancelled} stornierte Bestellungen sind`} in den Zahlen nicht enthalten.
        </p>
      ) : null}

      {/* Umsatz-Diagramm + Bestseller links, Aufgaben rechts (auf dem Handy: Diagramm → Aufgaben → Bestseller) */}
      <div className="mt-6 grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,23rem)]">
        <div className="xl:col-start-1 xl:row-start-1">
          <Card actions={<span className="text-[13px] text-muted">Letzte 30 Tage</span>} title="Umsatz pro Tag">
            {o.month.revenue ? (
              <dl className="mb-5 flex flex-wrap gap-x-8 gap-y-3">
                <div>
                  <dt className="text-[13px] text-muted">Gesamt</dt>
                  <dd className="font-medium text-[20px] tracking-[-0.01em]">{formatPrice(o.month.revenue)}</dd>
                </div>
                <div>
                  <dt className="text-[13px] text-muted">Ø pro Tag</dt>
                  <dd className="font-medium text-[20px] tracking-[-0.01em]">{formatPrice(avgPerDay)}</dd>
                </div>
                <div>
                  <dt className="text-[13px] text-muted">Bester Tag</dt>
                  <dd className="font-medium text-[20px] tracking-[-0.01em]">
                    {formatPrice(best.revenue)} <span className="font-normal text-[14px] text-muted tracking-normal">am {formatLongDay(best.key)}</span>
                  </dd>
                </div>
              </dl>
            ) : null}
            <RevenueChart days={o.days} />
          </Card>
        </div>

        <div className="xl:col-start-2 xl:row-span-2 xl:row-start-1">
          <TodoList newsletter={newsletter} now={now} openOrders={o.openOrders} pendingReviews={pendingReviews} />
        </div>

        <div className="xl:col-start-1 xl:row-start-2">
          <TopProducts items={o.topProducts} products={productMap} />
        </div>
      </div>

      {/* Startklar-Check über die volle Breite */}
      <div className="mt-6 scroll-mt-6" id="startklar">
        <SetupCheck items={setup} />
      </div>
    </>
  );
}
