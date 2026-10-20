import Link from "next/link";
import type { ReactNode } from "react";
import { CARRIERS } from "@/app/admin/(panel)/bestellungen/shipping";
import { Badge, Card, Notice, btn, btnDanger, btnSecondary, formatDateTime, input, label } from "@/components/admin/ui";
import { CHANNEL_LABEL, type OfficeOrder, PAYMENT_LABEL } from "@/lib/office/model";
import { type Principal, can } from "@/lib/office/roles";
import { addressLines, shipTo } from "@/lib/office/shipping";
import type { Product } from "@/lib/types";
import {
  ACTION_LABEL,
  CORRECTION_TARGETS,
  MAX_REASON,
  OFFICE_STATUS_LABEL,
  OFFICE_STATUS_TONE,
  PART_LABEL,
  SPEDITION,
  type WfAction,
  type WfRecord,
  activeRelease,
  attention,
  availableActions,
  changedSinceRelease,
  handoverCheck,
  mayRun,
  officeStatus,
  orderFingerprint,
  releaseCheck,
  shippedOutside,
} from "@/lib/office/workflow";
import { berlinToday } from "@/lib/office/workflow-store";
import { newOpId } from "@/lib/office/workflow-service";

const API = "/api/admin/buero/workflow";

export function OfficeStatusBadge({ o }: { o: OfficeOrder }) {
  const s = officeStatus(o, o.office);
  return <Badge tone={OFFICE_STATUS_TONE[s]}>{OFFICE_STATUS_LABEL[s]}</Badge>;
}

/** Versteckte Pflichtfelder jedes Bearbeitungsformulars: Bestellung, gesehener Stand, neue Vorgangs-ID */
function Base({ o, action }: { o: OfficeOrder; action: string }) {
  return (
    <>
      <input name="bestellung" type="hidden" value={o.key} />
      <input name="stand" type="hidden" value={o.office?.rev ?? 0} />
      <input name="vorgang" type="hidden" value={newOpId()} />
      <input name="aktion" type="hidden" value={action} />
    </>
  );
}

function Quick({ o, action, children, tone = "secondary" }: { o: OfficeOrder; action: WfAction | "versand_abgleichen"; children: ReactNode; tone?: "primary" | "secondary" | "danger" }) {
  return (
    <form action={API} method="post">
      <Base action={action} o={o} />
      <button className={tone === "primary" ? btn : tone === "danger" ? btnDanger : btnSecondary} type="submit">
        {children}
      </button>
    </form>
  );
}

const DIALOG_ACTIONS = ["freigeben", "zurueckstellen", "logistik", "versendet", "markieren", "korrektur"] as const;
export type DialogAction = (typeof DIALOG_ACTIONS)[number];
export const isDialog = (v: string): v is DialogAction => (DIALOG_ACTIONS as readonly string[]).includes(v);

const OK_TEXT: Record<string, string> = {
  pruefen: "Die Bestellung ist jetzt in Prüfung.",
  freigeben: "Die Bestellung ist für den Versand freigegeben.",
  zurueckstellen: "Die Bestellung wurde zurückgestellt.",
  wiederaufnehmen: "Die Bestellung ist wieder in Prüfung.",
  logistik: "Die Weitergabe an die Logistik ist dokumentiert. (Durchgeführt wurde sie außerhalb des Shops.)",
  versendet: "Der Versand ist erfasst.",
  abschliessen: "Die Bestellung ist abgeschlossen.",
  markieren: "Die Bestellung ist als „Prüfung erforderlich“ markiert.",
  markierung_entfernen: "Die Markierung wurde entfernt.",
  uebernehmen: "Du bist jetzt zuständig.",
  abgeben: "Die Zuständigkeit wurde abgegeben.",
  korrektur: "Der Status wurde korrigiert.",
  abgeglichen: "Die Versanddaten wurden in die Originalbestellung übernommen.",
  doppelt: "Dieser Schritt war bereits ausgeführt – es wurde nichts doppelt gespeichert.",
};

function List({ items }: { items: string[] }) {
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

/** Zusammenfassung der Bestellung für die Bestätigungsdialoge */
function OrderSummary({ o, products }: { o: OfficeOrder; products: Map<string, Product> }) {
  void products;
  return (
    <dl className="grid gap-x-6 gap-y-2 text-[14px] sm:grid-cols-[max-content_1fr]">
      <dt className="text-muted">Bestellung</dt>
      <dd className="font-medium">
        {o.number} · {CHANNEL_LABEL[o.channel]}
      </dd>
      <dt className="text-muted">Kunde</dt>
      <dd>{[o.company, o.customerName].filter(Boolean).join(" · ") || "—"}</dd>
      <dt className="text-muted">Lieferadresse</dt>
      <dd>{addressLines(shipTo(o), o.customerName).join(", ") || "fehlt"}</dd>
      <dt className="text-muted">Zahlung</dt>
      <dd>
        {PAYMENT_LABEL[o.paymentStatus]}
        {o.channel === "haendler" ? " (Händler auf Rechnung)" : ""}
      </dd>
      <dt className="text-muted">Artikel</dt>
      <dd>
        <ul className="space-y-0.5">
          {o.lines.map((l, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge der Positionen
            <li key={i}>
              {l.quantity} × {l.product}
              {l.unit ? ` (${l.unit})` : ""} <span className="text-muted">· {l.sku || "ohne Artikelnummer"}</span>
            </li>
          ))}
        </ul>
      </dd>
    </dl>
  );
}

function Dialog({ title, children, back }: { title: string; children: ReactNode; back: string }) {
  return (
    <section aria-labelledby="dialog-title" className="mb-6 rounded-3xl border-2 border-accent/30 bg-card p-6 shadow-[0_8px_30px_rgba(20,20,20,0.08)]" role="dialog">
      <div className="mb-4 flex items-start justify-between gap-3">
        <h2 className="font-medium text-[18px]" id="dialog-title">
          {title}
        </h2>
        <Link className="text-[13px] text-muted hover:text-ink" href={back}>
          Schließen
        </Link>
      </div>
      {children}
    </section>
  );
}

function Buttons({ back, submit, disabled, danger }: { back: string; submit: string; disabled?: boolean; danger?: boolean }) {
  return (
    <div className="mt-5 flex flex-wrap gap-2">
      <Link className={btnSecondary} href={back}>
        Abbrechen
      </Link>
      <button className={danger ? btnDanger : btn} disabled={disabled} type="submit">
        {submit}
      </button>
    </div>
  );
}

/** Bestätigungsdialog (serverseitig gerendert – kein Popup, kein JavaScript nötig) */
export function WorkflowDialog({ o, action, me, products, back, now }: { o: OfficeOrder; action: DialogAction; me: Principal; products: Map<string, Product>; back: string; now: number }) {
  const rec = o.office;
  if (!can(me.role, "office.workflow") || !mayRun(me.role, action) || !availableActions(o, rec).includes(action)) {
    return (
      <Notice title="Dieser Schritt ist gerade nicht möglich" tone="red">
        Entweder fehlt die Berechtigung oder der Bürostatus passt nicht (aktuell „{OFFICE_STATUS_LABEL[officeStatus(o, rec)]}“).{" "}
        <Link className="underline underline-offset-4" href={back}>
          Zurück
        </Link>
      </Notice>
    );
  }
  const fp = orderFingerprint(o, products);
  if (action === "freigeben") {
    const c = releaseCheck(o, rec, products);
    const again = Boolean(activeRelease(rec));
    return (
      <Dialog back={back} title={again ? "Erneut für den Versand freigeben" : "Für Versand freigeben"}>
        <OrderSummary o={o} products={products} />
        {c.blockers.length ? (
          <div className="mt-4">
            <Notice title="Freigabe nicht möglich" tone="red">
              <List items={c.blockers} />
            </Notice>
          </div>
        ) : null}
        {c.warnings.length ? (
          <div className="mt-4">
            <Notice title="Bitte beachten">
              <List items={c.warnings} />
            </Notice>
          </div>
        ) : null}
        <form action={API} className="mt-4 space-y-3" method="post">
          <Base action="freigeben" o={o} />
          <input name="fp" type="hidden" value={fp} />
          <input name="bestaetigt" type="hidden" value="1" />
          <div>
            <label className={label} htmlFor="wf-bemerkung">
              Bemerkung zur Freigabe (optional)
            </label>
            <textarea className={`${input} min-h-16`} id="wf-bemerkung" maxLength={MAX_REASON} name="bemerkung" />
          </div>
          {c.warnings.length ? (
            <label className="flex items-start gap-2.5 text-[14px]">
              <input className="mt-1" name="hinweise" required type="checkbox" value="1" />
              <span>Ich habe die Hinweise gelesen und gebe trotzdem frei.</span>
            </label>
          ) : null}
          <p className="text-[12px] text-muted">
            Die Freigabe wird mit deinem Namen, Datum, Uhrzeit und einem Fingerabdruck der Bestellung gespeichert. Ändert sich die Bestellung danach, muss sie erneut freigegeben werden. Es wird nichts an die Logistik oder den Kunden gesendet.
          </p>
          <Buttons back={back} disabled={c.blockers.length > 0} submit="Verbindlich freigeben" />
        </form>
      </Dialog>
    );
  }
  if (action === "logistik") {
    const c = handoverCheck(o, rec, products);
    const repeat = Boolean(rec?.handovers.length);
    const rel = activeRelease(rec);
    return (
      <Dialog back={back} title={repeat ? "Erneute Weitergabe dokumentieren" : "Als an Logistik weitergegeben markieren"}>
        <p className="mb-4 rounded-2xl bg-violet-50 px-4 py-3 text-[14px] text-violet-900">Die Weitergabe wurde außerhalb des Shops durchgeführt und soll jetzt dokumentiert werden.</p>
        <dl className="mb-4 grid gap-x-6 gap-y-1 text-[14px] sm:grid-cols-[max-content_1fr]">
          <dt className="text-muted">Anzahl</dt>
          <dd>1 Bestellung</dd>
          <dt className="text-muted">Bestellnummer</dt>
          <dd className="font-medium">{o.number}</dd>
          <dt className="text-muted">Freigabe</dt>
          <dd>{rel ? `Version ${rel.version} vom ${formatDateTime(rel.at)} (${rel.by})` : "—"}</dd>
          <dt className="text-muted">Dokumentiert von</dt>
          <dd>{me.role === "admin" ? "Administrator" : me.username}</dd>
          <dt className="text-muted">Zeitpunkt</dt>
          <dd>{formatDateTime(now)} (beim Bestätigen)</dd>
        </dl>
        {c.blockers.length ? (
          <Notice title="Nicht möglich" tone="red">
            <List items={c.blockers} />
          </Notice>
        ) : null}
        {c.warnings.length ? (
          <Notice title="Achtung">
            <List items={c.warnings} />
          </Notice>
        ) : null}
        <form action={API} className="mt-4 space-y-3" method="post">
          <Base action="logistik" o={o} />
          <input name="fp" type="hidden" value={fp} />
          <input name="bestaetigt" type="hidden" value="1" />
          {repeat ? (
            <div>
              <label className={label} htmlFor="wf-grund">
                Begründung (Pflicht)
              </label>
              <textarea className={`${input} min-h-16`} id="wf-grund" maxLength={MAX_REASON} minLength={3} name="grund" required />
            </div>
          ) : null}
          <div>
            <label className={label} htmlFor="wf-bemerkung">
              Bemerkung (optional)
            </label>
            <textarea className={`${input} min-h-16`} id="wf-bemerkung" maxLength={MAX_REASON} name="bemerkung" />
          </div>
          <p className="text-[12px] text-muted">Der Shop überträgt nichts an die Logistik und kann nicht bestätigen, dass dort etwas angekommen ist.</p>
          <Buttons back={back} disabled={c.blockers.length > 0} submit={repeat ? "Erneute Weitergabe dokumentieren" : "Weitergabe dokumentieren"} />
        </form>
      </Dialog>
    );
  }
  if (action === "versendet") {
    const today = berlinToday(now);
    const defCarrier = (o.carrier as string) || "DHL";
    return (
      <Dialog back={back} title="Als versendet markieren">
        <OrderSummary o={o} products={products} />
        <form action={API} className="mt-4 space-y-3" method="post">
          <Base action="versendet" o={o} />
          <input name="fp" type="hidden" value={fp} />
          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <label className={label} htmlFor="wf-dienst">
                Versanddienstleister
              </label>
              <select className={`${input} pr-8`} defaultValue={defCarrier} id="wf-dienst" name="versanddienst">
                {CARRIERS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
                <option value={SPEDITION}>Spedition (ohne Sendungsnummer)</option>
              </select>
            </div>
            <div>
              <label className={label} htmlFor="wf-nr">
                Sendungsnummer
              </label>
              <input autoComplete="off" className={input} defaultValue={o.tracking} id="wf-nr" maxLength={60} name="sendungsnummer" />
            </div>
            <div>
              <label className={label} htmlFor="wf-datum">
                Versanddatum
              </label>
              <input className={input} defaultValue={today} id="wf-datum" max={today} name="versanddatum" required type="date" />
            </div>
          </div>
          <div>
            <label className={label} htmlFor="wf-vb">
              Versandbemerkung (optional)
            </label>
            <textarea className={`${input} min-h-16`} id="wf-vb" maxLength={MAX_REASON} name="versandbemerkung" />
          </div>
          <p className="text-[13px]">
            Verantwortlich: <b className="font-medium">{me.role === "admin" ? "Administrator" : me.username}</b>
          </p>
          <label className="flex items-start gap-2.5 text-[14px]">
            <input className="mt-1" name="bestaetigt" required type="checkbox" value="1" />
            <span>Ich bestätige, dass diese Bestellung versendet wurde.</span>
          </label>
          <p className="text-[12px] text-muted">
            Status „versendet“, Sendungsnummer und Versanddienst werden in die Originalbestellung übernommen{o.channel === "haendler" ? " (bei Händlern nur der Status)" : ""}. Es wird keine E-Mail an den Kunden geschickt.
          </p>
          <Buttons back={back} submit="Verbindlich als versendet markieren" />
        </form>
      </Dialog>
    );
  }
  const reasonOnly: Record<"zurueckstellen" | "markieren", { title: string; label: string; submit: string }> = {
    zurueckstellen: { title: "Bestellung zurückstellen", label: "Warum wird die Bestellung zurückgestellt? (Pflicht)", submit: "Zurückstellen" },
    markieren: { title: "„Prüfung erforderlich“ markieren", label: "Was muss geprüft werden? (Pflicht)", submit: "Markieren" },
  };
  if (action === "zurueckstellen" || action === "markieren") {
    const t = reasonOnly[action];
    return (
      <Dialog back={back} title={t.title}>
        <form action={API} className="space-y-3" method="post">
          <Base action={action} o={o} />
          <div>
            <label className={label} htmlFor="wf-grund">
              {t.label}
            </label>
            <textarea className={`${input} min-h-20`} id="wf-grund" maxLength={MAX_REASON} minLength={3} name="grund" required />
          </div>
          <Buttons back={back} submit={t.submit} />
        </form>
      </Dialog>
    );
  }
  // Korrektur (nur Administrator)
  const current = officeStatus(o, rec);
  return (
    <Dialog back={back} title="Status korrigieren (Administrator)">
      <p className="mb-3 text-[14px] text-muted">
        Für Ausnahmefälle, z. B. um eine abgeschlossene Bestellung wieder zu öffnen. Die Korrektur wird mit Grund protokolliert. Originalbestellung, Zahlung und Rechnung bleiben unverändert{shippedOutside(o, rec) || rec?.shipment?.synced ? " – auch der dort eingetragene Versandstatus" : ""}.
      </p>
      <form action={API} className="space-y-3" method="post">
        <Base action="korrektur" o={o} />
        <div>
          <label className={label} htmlFor="wf-ziel">
            Neuer Bürostatus (aktuell „{OFFICE_STATUS_LABEL[current]}“)
          </label>
          <select className={`${input} pr-8`} id="wf-ziel" name="ziel" required>
            {CORRECTION_TARGETS.filter((t) => t !== current).map((t) => (
              <option key={t} value={t}>
                {OFFICE_STATUS_LABEL[t]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={label} htmlFor="wf-grund">
            Grund der Korrektur (Pflicht)
          </label>
          <textarea className={`${input} min-h-16`} id="wf-grund" maxLength={MAX_REASON} minLength={3} name="grund" required />
        </div>
        <label className="flex items-start gap-2.5 text-[14px]">
          <input className="mt-1" name="bestaetigt" required type="checkbox" value="1" />
          <span>Ich korrigiere den Bürostatus bewusst.</span>
        </label>
        <Buttons back={back} danger submit="Status korrigieren" />
      </form>
    </Dialog>
  );
}

/** Karte „Bearbeitung“ auf der Bestellseite */
export function WorkflowCard({ o, me, products, back, ok, fehler, konflikt }: { o: OfficeOrder; me: Principal; products: Map<string, Product>; back: string; ok: string; fehler: string; konflikt: boolean }) {
  const rec: WfRecord | null | undefined = o.office;
  const status = officeStatus(o, rec);
  const write = can(me.role, "office.workflow");
  const acts = write ? availableActions(o, rec).filter((a) => mayRun(me.role, a)) : [];
  const rel = activeRelease(rec);
  const changed = changedSinceRelease(o, rec, products);
  const att = attention(o, rec, products);
  const dialog = (a: DialogAction) => `${back}?aktion=${a}`;
  const has = (a: WfAction) => acts.includes(a);
  return (
    <Card className="mb-6" title="Bearbeitung im Büro">
      {ok && OK_TEXT[ok] ? (
        <div className="mb-4">
          <Notice title="Erledigt" tone="green">
            {OK_TEXT[ok]}
          </Notice>
        </div>
      ) : null}
      {fehler ? (
        <div className="mb-4">
          <Notice title={konflikt ? "Bitte aktualisieren" : "Nicht ausgeführt"} tone="red">
            {fehler}{" "}
            {konflikt ? (
              <Link className="underline underline-offset-4" href={back}>
                Seite aktualisieren
              </Link>
            ) : null}
          </Notice>
        </div>
      ) : null}
      <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
        <div className="space-y-3 text-[14px]">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={OFFICE_STATUS_TONE[status]}>{OFFICE_STATUS_LABEL[status]}</Badge>
            {rec?.flag ? <Badge tone="amber">Prüfung erforderlich</Badge> : null}
            {shippedOutside(o, rec) ? <span className="text-[13px] text-muted">(laut Originalbestellung)</span> : null}
          </div>
          {rec?.flag ? (
            <p>
              <span className="text-muted">Markiert: </span>
              {rec.flag.reason} <span className="text-muted">· {rec.flag.by}, {formatDateTime(rec.flag.at)}</span>
            </p>
          ) : null}
          <p>
            <span className="text-muted">Zuständig: </span>
            {rec?.assignee ?? "niemand"}
          </p>
          <p>
            <span className="text-muted">Letzte Bearbeitung: </span>
            {rec?.updatedBy ? `${formatDateTime(rec.updatedAt)} · ${rec.updatedBy}` : "noch keine"}
          </p>
          {rel ? (
            <p>
              <span className="text-muted">Freigabe: </span>
              Version {rel.version} · {formatDateTime(rel.at)} · {rel.by}
              {rel.remark ? <span className="block text-muted">Bemerkung: {rel.remark}</span> : null}
            </p>
          ) : null}
          {changed.length ? (
            <Notice title="Nach der Freigabe geändert" tone="red">
              Geändert: {changed.map((p) => PART_LABEL[p]).join(", ")}. Weitergabe und Versand sind gesperrt, bis die Bestellung erneut freigegeben ist.
            </Notice>
          ) : null}
          {rec?.handovers.length ? (
            <div>
              <p className="text-muted">Weitergabe an Logistik (dokumentiert, außerhalb des Shops durchgeführt)</p>
              <ul className="text-[13px]">
                {rec.handovers.map((h) => (
                  <li key={h.id}>
                    {formatDateTime(h.at)} · {h.by} · Vorgang {h.id} · Freigabe {h.releaseVersion}
                    {h.repeat ? ` · erneut: ${h.reason}` : ""}
                    {h.remark ? ` · ${h.remark}` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {rec?.shipment ? (
            <p>
              <span className="text-muted">Versand: </span>
              {rec.shipment.carrier}
              {rec.shipment.tracking ? ` · ${rec.shipment.tracking}` : ""} · {rec.shipment.date} · {rec.shipment.by}
              {rec.shipment.remark ? <span className="block text-muted">{rec.shipment.remark}</span> : null}
              {rec.shipment.synced ? (
                <span className="block text-[12px] text-muted">In die Originalbestellung übernommen (ohne Kunden-E-Mail).</span>
              ) : (
                <span className="block text-[12px] text-red-700">Noch nicht in die Originalbestellung übernommen{rec.shipment.syncError ? `: ${rec.shipment.syncError}` : ""}.</span>
              )}
            </p>
          ) : null}
          {att.length ? (
            <Notice title="Braucht Aufmerksamkeit">
              <List items={att.map((a) => a.text)} />
            </Notice>
          ) : null}
        </div>
        <div>
          {write ? (
            <div className="flex flex-wrap gap-2">
              {has("pruefen") ? (
                <Quick action="pruefen" o={o}>
                  In Prüfung nehmen
                </Quick>
              ) : null}
              {has("freigeben") && (status !== "freigegeben" && status !== "logistik" ? true : changed.length > 0) ? (
                <Link className={btn} href={dialog("freigeben")}>
                  {rel ? "Erneut freigeben" : "Für Versand freigeben"}
                </Link>
              ) : null}
              {has("wiederaufnehmen") ? (
                <Quick action="wiederaufnehmen" o={o} tone="primary">
                  Wieder in Prüfung nehmen
                </Quick>
              ) : null}
              {has("logistik") ? (
                <Link className={rec?.handovers.length ? btnSecondary : btn} href={dialog("logistik")}>
                  {rec?.handovers.length ? "Erneute Weitergabe dokumentieren" : "Als an Logistik weitergegeben markieren"}
                </Link>
              ) : null}
              {has("versendet") ? (
                <Link className={status === "logistik" ? btn : btnSecondary} href={dialog("versendet")}>
                  Als versendet markieren
                </Link>
              ) : null}
              {has("abschliessen") ? (
                <Quick action="abschliessen" o={o} tone="primary">
                  Abschließen
                </Quick>
              ) : null}
              {rec?.shipment && !rec.shipment.synced ? (
                <Quick action="versand_abgleichen" o={o}>
                  Versanddaten erneut übertragen
                </Quick>
              ) : null}
              {has("zurueckstellen") ? (
                <Link className={btnSecondary} href={dialog("zurueckstellen")}>
                  Zurückstellen
                </Link>
              ) : null}
              {has("markieren") ? (
                <Link className={btnSecondary} href={dialog("markieren")}>
                  „Prüfung erforderlich“ markieren
                </Link>
              ) : null}
              {has("markierung_entfernen") ? (
                <Quick action="markierung_entfernen" o={o}>
                  Markierung entfernen
                </Quick>
              ) : null}
              {has("uebernehmen") ? (
                <Quick action="uebernehmen" o={o}>
                  Zuständigkeit übernehmen
                </Quick>
              ) : null}
              {has("abgeben") ? (
                <Quick action="abgeben" o={o}>
                  Zuständigkeit abgeben
                </Quick>
              ) : null}
              {has("korrektur") && status !== "storniert" ? (
                <Link className={btnDanger} href={dialog("korrektur")}>
                  Status korrigieren
                </Link>
              ) : null}
            </div>
          ) : (
            <p className="text-[14px] text-muted">Nur Lesezugriff – Änderungen sind mit diesem Zugang nicht möglich.</p>
          )}
          {status === "storniert" ? <p className="mt-3 text-[13px] text-muted">Stornierte Bestellungen können nicht freigegeben werden. Die Stornierung kommt aus der Originalbestellung.</p> : null}
        </div>
      </div>
      <History rec={rec} />
    </Card>
  );
}

function History({ rec }: { rec: WfRecord | null | undefined }) {
  if (!rec?.events.length) return <p className="mt-6 text-[13px] text-muted">Noch keine Bearbeitungsschritte.</p>;
  return (
    <div className="mt-6">
      <p className="mb-2 text-[13px] text-muted">Änderungsprotokoll (nicht bearbeitbar)</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="text-muted">
            <tr>
              <th className="py-1.5 pr-3 font-normal">Zeitpunkt</th>
              <th className="py-1.5 pr-3 font-normal">Wer</th>
              <th className="py-1.5 pr-3 font-normal">Aktion</th>
              <th className="py-1.5 pr-3 font-normal">Status vorher → nachher</th>
              <th className="py-1.5 pr-3 font-normal">Grund / Angaben</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {[...rec.events].reverse().map((e) => (
              <tr key={e.id + e.action}>
                <td className="py-1.5 pr-3 tabular-nums">{formatDateTime(e.at)}</td>
                <td className="py-1.5 pr-3">{e.by}</td>
                <td className="py-1.5 pr-3">{ACTION_LABEL[e.action]}</td>
                <td className="py-1.5 pr-3">
                  {OFFICE_STATUS_LABEL[e.from]}
                  {e.from !== e.to ? ` → ${OFFICE_STATUS_LABEL[e.to]}` : ""}
                </td>
                <td className="py-1.5 pr-3 text-muted">{[e.reason, e.detail].filter(Boolean).join(" · ") || "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
