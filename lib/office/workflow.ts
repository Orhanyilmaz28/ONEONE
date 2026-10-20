import { createHash } from "node:crypto";
import { isCarrier, isValidTracking, normalizeTracking } from "@/app/admin/(panel)/bestellungen/shipping";
import type { Product } from "../types";
import type { OfficeAddress, OfficeOrder } from "./model";
import type { Role } from "./roles";
import { lineContents } from "./shipping";
import { berlinParts } from "./time";

const pad2 = (n: number) => String(n).padStart(2, "0");
/** Kalendertag in deutscher Zeit als JJJJ-MM-TT */
export const berlinDay = (ms: number) => {
  const p = berlinParts(ms);
  return `${p.y}-${pad2(p.m)}-${pad2(p.d)}`;
};

/**
 * Büro-Arbeitsablauf (Phase 3C): eigener Bearbeitungsstand je Bestellung – getrennt von Stripe-Zahlungsstatus und
 * Händler-Bestellstatus, die hier nie überschrieben werden.
 *
 * Neu eingegangen → In Prüfung → Freigegeben → An Logistik weitergegeben → Versendet → Abgeschlossen
 * Neu / In Prüfung / Freigegeben → Zurückgestellt → In Prüfung · Storniert ergibt sich nur aus der Originalbestellung.
 * Abgeschlossen lässt sich nur über eine eigene, protokollierte Korrektur durch Administrator:innen wieder öffnen.
 *
 * Alles hier ist rein (ohne Speicher, ohne Netz) und damit vollständig testbar. Jede Änderung prüft den erwarteten
 * Bearbeitungsstand (`rev`, gegen gleichzeitige Änderungen) und die Vorgangs-ID (`op`, gegen doppeltes Absenden).
 */
export const OFFICE_STATUS = ["neu", "pruefung", "freigegeben", "logistik", "versendet", "abgeschlossen", "zurueckgestellt", "storniert"] as const;
export type OfficeStatus = (typeof OFFICE_STATUS)[number];

export const OFFICE_STATUS_LABEL: Record<OfficeStatus, string> = {
  neu: "Neu eingegangen",
  pruefung: "In Prüfung",
  freigegeben: "Freigegeben",
  logistik: "An Logistik weitergegeben",
  versendet: "Versendet",
  abgeschlossen: "Abgeschlossen",
  zurueckgestellt: "Zurückgestellt",
  storniert: "Storniert",
};
export type Tone = "neutral" | "blue" | "amber" | "green" | "orange" | "violet" | "red";
export const OFFICE_STATUS_TONE: Record<OfficeStatus, Tone> = {
  neu: "blue",
  pruefung: "amber",
  freigegeben: "green",
  logistik: "violet",
  versendet: "green",
  abgeschlossen: "neutral",
  zurueckgestellt: "orange",
  storniert: "red",
};

export const ACTIONS = [
  "pruefen",
  "freigeben",
  "zurueckstellen",
  "wiederaufnehmen",
  "logistik",
  "versendet",
  "abschliessen",
  "markieren",
  "markierung_entfernen",
  "uebernehmen",
  "abgeben",
  "korrektur",
] as const;
export type WfAction = (typeof ACTIONS)[number];
export const ACTION_LABEL: Record<WfAction | "versand_abgeglichen", string> = {
  pruefen: "In Prüfung genommen",
  freigeben: "Für Versand freigegeben",
  zurueckstellen: "Zurückgestellt",
  wiederaufnehmen: "Wieder in Prüfung genommen",
  logistik: "Weitergabe an Logistik dokumentiert",
  versendet: "Als versendet markiert",
  abschliessen: "Abgeschlossen",
  markieren: "„Prüfung erforderlich“ markiert",
  markierung_entfernen: "Markierung „Prüfung erforderlich“ entfernt",
  uebernehmen: "Zuständigkeit übernommen",
  abgeben: "Zuständigkeit abgegeben",
  korrektur: "Status durch Administrator korrigiert",
  versand_abgeglichen: "Versanddaten in die Originalbestellung übernommen",
};
/** Ziele einer Administrator-Korrektur */
export const CORRECTION_TARGETS = ["neu", "pruefung", "zurueckgestellt", "versendet", "abgeschlossen"] as const satisfies readonly OfficeStatus[];
/** Versandarten fürs Büro: Paketdienste aus dem Dashboard + Spedition (ohne Sendungsnummer) */
export const SPEDITION = "Spedition";

export type ReleaseParts = { adresse: string; artikel: string; zahlung: string; storno: string };
export const PART_LABEL: Record<keyof ReleaseParts, string> = { adresse: "Lieferadresse", artikel: "Artikel oder Mengen", zahlung: "Zahlung oder Erstattung", storno: "Stornierung" };

/** `mix`: Mixpaket-Inhalt laut Produktdaten zum Zeitpunkt der Freigabe (Momentaufnahme, Produkt → Inhalt) */
export type Release = { id: string; version: number; at: string; by: string; byId: string; fp: string; parts: ReleaseParts; remark: string; warnings: string[]; mix?: Record<string, string> };
export type Handover = { id: string; at: string; by: string; byId: string; releaseId: string; releaseVersion: number; releaseFp: string; remark: string; reason?: string; repeat: boolean };
export type Shipment = { carrier: string; tracking: string; date: string; remark: string; by: string; byId: string; at: string; op: string; synced: boolean; syncError?: string };
export type WfEvent = { id: string; at: string; by: string; byId: string; role: Role; action: WfAction | "versand_abgeglichen"; from: OfficeStatus; to: OfficeStatus; reason?: string; detail?: string };

export type WfRecord = {
  key: string;
  /** Bestellnummer (nur zur Kontrolle der Zuordnung) */
  order: string;
  /** Bearbeitungsstand – steigt mit jeder Änderung (gleichzeitige Änderungen werden erkannt) */
  rev: number;
  status: OfficeStatus;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
  assignee?: string;
  flag?: { reason: string; at: string; by: string };
  release?: Release;
  releases: number;
  handovers: Handover[];
  shipment?: Shipment;
  /** Status durch Administrator korrigiert – der Versandstatus der Originalbestellung überstimmt ihn dann nicht mehr */
  corrected?: boolean;
  events: WfEvent[];
  /** Zuletzt verarbeitete Vorgangs-IDs (Schutz vor doppelt abgeschickten Anfragen) */
  ops: string[];
};

export type Actor = { role: Role; label: string; id: string };

const MAX_EVENTS = 200;
const MAX_OPS = 50;
const MAX_HANDOVERS = 30;
export const MAX_REASON = 300;
export const CONFLICT_MESSAGE = "Diese Bestellung wurde zwischenzeitlich geändert. Bitte aktualisieren.";

/* ───────────── Zustand ───────────── */

const isCancelled = (o: OfficeOrder) => o.processing === "storniert" || o.shippingStatus === "storniert";

/**
 * Wirksamer Bürostatus: Storniert kommt immer aus der Originalbestellung. Wurde die Bestellung im Dashboard schon als
 * versendet markiert, zeigt das Büro „Versendet“ (außer nach einer Administrator-Korrektur).
 */
export function officeStatus(o: OfficeOrder, rec: WfRecord | null | undefined): OfficeStatus {
  if (isCancelled(o)) return "storniert";
  const stored = rec?.status ?? "neu";
  if (o.shippingStatus === "versendet" && !rec?.corrected && !["versendet", "abgeschlossen"].includes(stored)) return "versendet";
  return stored;
}
/** Versand stammt aus dem Dashboard (nicht im Büro erfasst) */
export const shippedOutside = (o: OfficeOrder, rec: WfRecord | null | undefined) => officeStatus(o, rec) === "versendet" && rec?.status !== "versendet";

/** Freigabe, die gerade gilt (nicht nach Zurückstellen oder Korrektur) */
export function activeRelease(rec: WfRecord | null | undefined): Release | null {
  if (!rec?.release) return null;
  return ["freigegeben", "logistik", "versendet", "abgeschlossen"].includes(rec.status) ? rec.release : null;
}

/* ───────────── Fingerabdruck der Freigabe ───────────── */

const h = (v: unknown) => createHash("sha256").update(JSON.stringify(v)).digest("hex").slice(0, 16);
const addr = (a: OfficeAddress | null) => (a ? [a.name, a.company, a.line1, a.line2, a.zip, a.city, a.country].map((x) => (x ?? "").trim()) : null);

/** Getrennte Prüfsummen, damit klar ist, WAS sich nach der Freigabe geändert hat */
export function releaseParts(o: OfficeOrder, products: Map<string, Product>): ReleaseParts {
  return {
    adresse: h([addr(o.delivery ?? o.billing), o.delivery ? "lief" : "rech", o.company, o.contact]),
    artikel: h(o.lines.map((l) => [l.sku, l.handle ?? "", l.product, l.quantity, l.unit, l.unitsPerPack, lineContents(l, products)])),
    zahlung: h([o.paymentStatus, o.refunded, o.gross]),
    storno: h([isCancelled(o)]),
  };
}
export const partsFingerprint = (p: ReleaseParts) => h([p.adresse, p.artikel, p.zahlung, p.storno]);
export const orderFingerprint = (o: OfficeOrder, products: Map<string, Product>) => partsFingerprint(releaseParts(o, products));

/** Was hat sich seit der gültigen Freigabe geändert? (leer = nichts, oder keine Freigabe) */
export function changedSinceRelease(o: OfficeOrder, rec: WfRecord | null | undefined, products: Map<string, Product>): (keyof ReleaseParts)[] {
  const r = activeRelease(rec);
  if (!r) return [];
  const now = releaseParts(o, products);
  return (Object.keys(now) as (keyof ReleaseParts)[]).filter((k) => now[k] !== r.parts[k]);
}
export const changedLabel = (parts: (keyof ReleaseParts)[]) => parts.map((p) => PART_LABEL[p]).join(", ");

/* ───────────── Prüfungen ───────────── */

export function addressComplete(a: OfficeAddress | null): boolean {
  return Boolean(a && (a.name.trim() || a.company.trim()) && a.line1.trim() && a.zip.trim() && a.city.trim());
}

export function isMixLine(l: OfficeOrder["lines"][number], products: Map<string, Product>) {
  const p = l.handle ? products.get(l.handle) : undefined;
  return Boolean(p?.contents?.length || p?.collections?.includes("mixpakete"));
}

export type Check = { blockers: string[]; warnings: string[] };

/**
 * Prüfung vor der Versandfreigabe. Hindernisse verhindern die Freigabe; Hinweise müssen bestätigt werden.
 * Händlerbestellungen auf Rechnung brauchen keine Zahlung vor dem Versand (Zahlung nach Lieferung).
 */
export function releaseCheck(o: OfficeOrder, rec: WfRecord | null | undefined, products: Map<string, Product>): Check {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const status = officeStatus(o, rec);
  const changed = changedSinceRelease(o, rec, products);
  if (isCancelled(o)) blockers.push("Die Bestellung ist storniert.");
  else if (status === "versendet" || status === "abgeschlossen") blockers.push("Die Bestellung ist bereits versendet.");
  else if (status === "zurueckgestellt") blockers.push("Die Bestellung ist zurückgestellt – bitte zuerst wieder in Prüfung nehmen.");
  else if ((status === "freigegeben" || status === "logistik") && !changed.length) blockers.push("Die Bestellung ist bereits freigegeben und seitdem unverändert.");
  if (!o.lines.length) blockers.push("Die Bestellung hat keine Artikel.");
  const a = o.delivery ?? o.billing;
  if (!addressComplete(a)) blockers.push("Die Lieferadresse ist unvollständig (Name/Firma, Straße, PLZ und Ort nötig).");
  for (const l of o.lines) {
    if (!Number.isInteger(l.quantity) || l.quantity <= 0) blockers.push(`Unklare Menge bei „${l.product}“.`);
    else if (!l.unit || l.unitsPerPack === null) blockers.push(`Unklare Verpackungseinheit bei „${l.product}“ (Einheit oder Inhalt je Einheit fehlt).`);
  }
  if (o.channel === "privat") {
    if (o.paymentStatus === "offen") blockers.push("Die Privatbestellung ist noch nicht bezahlt.");
    if (o.paymentStatus === "erstattet") blockers.push("Die Zahlung wurde vollständig erstattet.");
    if (o.paymentStatus === "teilweise_erstattet") warnings.push("Ein Teil der Zahlung wurde erstattet – bitte Mengen vor dem Versand prüfen.");
  } else if (o.processing === "offen") {
    warnings.push("Die Händlerbestellung ist im Händlerbereich noch nicht bestätigt.");
  }
  const noSku = o.lines.filter((l) => !l.sku).map((l) => l.product);
  if (noSku.length) warnings.push(`Artikelnummer fehlt bei: ${noSku.join(", ")}.`);
  const noMix = o.lines.filter((l) => isMixLine(l, products) && !products.get(l.handle ?? "")?.contents?.length).map((l) => l.product);
  if (noMix.length) warnings.push(`Mixpaket-Inhalt ist in den Produktdaten nicht hinterlegt: ${noMix.join(", ")}.`);
  if (!o.delivery && o.billing) warnings.push("Keine eigene Lieferadresse – die Rechnungsadresse wird verwendet.");
  if (rec?.flag) warnings.push(`Markiert „Prüfung erforderlich“: ${rec.flag.reason}`);
  if (changed.length) warnings.push(`Seit der letzten Freigabe geändert: ${changedLabel(changed)}.`);
  return { blockers, warnings };
}

/** Darf die Weitergabe an die Logistik dokumentiert werden? */
export function handoverCheck(o: OfficeOrder, rec: WfRecord | null | undefined, products: Map<string, Product>): Check {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const status = officeStatus(o, rec);
  if (isCancelled(o)) blockers.push("Die Bestellung ist storniert.");
  else if (status !== "freigegeben" && status !== "logistik") blockers.push("Nur freigegebene Bestellungen können als an die Logistik weitergegeben dokumentiert werden.");
  const changed = changedSinceRelease(o, rec, products);
  if (changed.length) blockers.push(`Die Bestellung wurde nach der Versandfreigabe geändert (${changedLabel(changed)}) – bitte erneut freigeben.`);
  if (rec?.handovers.length) warnings.push(`Die Weitergabe wurde bereits ${rec.handovers.length === 1 ? "einmal" : `${rec.handovers.length}-mal`} dokumentiert (zuletzt ${fmt(rec.handovers[rec.handovers.length - 1].at)}). Eine erneute Weitergabe braucht eine Begründung.`);
  return { blockers, warnings };
}

export type ShipmentInput = { carrier: string; tracking: string; date: string; remark: string };

/** Versandangaben prüfen (rein). `today` = heutiges Datum (JJJJ-MM-TT, Berlin). */
export function shipmentCheck(o: OfficeOrder, rec: WfRecord | null | undefined, s: ShipmentInput, products: Map<string, Product>, today: string): Check & { tracking: string } {
  const blockers: string[] = [];
  const warnings: string[] = [];
  const status = officeStatus(o, rec);
  if (isCancelled(o)) blockers.push("Die Bestellung ist storniert.");
  else if (status !== "freigegeben" && status !== "logistik") blockers.push(status === "versendet" || status === "abgeschlossen" ? "Die Bestellung ist bereits als versendet erfasst." : "Nur freigegebene Bestellungen können als versendet markiert werden.");
  if (!activeRelease(rec)) blockers.push("Es gibt keine gültige Versandfreigabe.");
  const changed = changedSinceRelease(o, rec, products);
  if (changed.length) blockers.push(`Die Bestellung wurde nach der Versandfreigabe geändert (${changedLabel(changed)}) – bitte erneut freigeben.`);
  const carrier = s.carrier.trim();
  if (!isCarrier(carrier) && carrier !== SPEDITION) blockers.push("Bitte einen Versanddienstleister auswählen.");
  const tracking = normalizeTracking(s.tracking ?? "");
  if (carrier !== SPEDITION && !tracking) blockers.push("Bitte die Sendungsnummer eintragen (bei Spedition ohne Nummer „Spedition“ wählen).");
  if (tracking && !isValidTracking(tracking)) blockers.push("Die Sendungsnummer sieht nicht gültig aus (6–40 Zeichen, nur Buchstaben, Ziffern und Bindestrich).");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s.date) || Number.isNaN(Date.parse(`${s.date}T12:00:00Z`))) blockers.push("Bitte ein gültiges Versanddatum angeben.");
  else {
    if (s.date > today) blockers.push("Das Versanddatum liegt in der Zukunft.");
    // Vergleich als Kalendertag in deutscher Zeit (Bestellung um 0:30 Uhr am 21. → frühestens der 21.)
    if (s.date < berlinDay(o.createdAt)) blockers.push("Das Versanddatum liegt vor dem Bestelldatum.");
  }
  if (o.tracking && tracking && normalizeTracking(o.tracking) !== tracking) blockers.push(`Die Bestellung hat bereits eine andere Sendungsnummer (${o.tracking}). Bitte im Dashboard klären.`);
  if (o.carrier && carrier && o.carrier !== carrier && o.tracking) warnings.push(`In der Bestellung ist bereits „${o.carrier}“ als Versanddienstleister eingetragen.`);
  if (!rec?.handovers.length) warnings.push("Eine Weitergabe an die Logistik wurde nicht dokumentiert.");
  return { blockers, warnings, tracking };
}

/* ───────────── Übergänge ───────────── */

/** Welche Aktionen sind im aktuellen Status möglich (ohne Rechteprüfung) */
export function availableActions(o: OfficeOrder, rec: WfRecord | null | undefined): WfAction[] {
  const s = officeStatus(o, rec);
  const out: WfAction[] = [];
  if (s === "neu") out.push("pruefen", "freigeben", "zurueckstellen");
  if (s === "pruefung") out.push("freigeben", "zurueckstellen");
  if (s === "zurueckgestellt") out.push("wiederaufnehmen");
  if (s === "freigegeben") out.push("logistik", "versendet", "zurueckstellen", "freigeben");
  if (s === "logistik") out.push("logistik", "versendet", "freigeben");
  if (s === "versendet") out.push("abschliessen");
  if (s !== "storniert") out.push(rec?.flag ? "markierung_entfernen" : "markieren");
  out.push(rec?.assignee ? "abgeben" : "uebernehmen");
  out.push("korrektur");
  return out;
}

export type ActionInput = {
  action: WfAction;
  /** Bearbeitungsstand, den die Person gesehen hat */
  rev: number;
  /** Vorgangs-ID (einmalig je Formular) */
  op: string;
  reason?: string;
  remark?: string;
  /** Hinweise gelesen und bestätigt */
  ack?: boolean;
  /** „Verbindlich …“ bestätigt */
  confirm?: boolean;
  /** Fingerabdruck der Bestellung, die im Bestätigungsdialog gezeigt wurde */
  fp?: string;
  shipment?: ShipmentInput;
  target?: OfficeStatus;
  /** Heutiges Datum in Berlin (JJJJ-MM-TT) für die Datumsprüfung */
  today?: string;
};

export type ActionResult =
  | { ok: true; rec: WfRecord; duplicate: boolean; event?: WfEvent; shipmentChanged: boolean }
  | { ok: false; code: "conflict" | "invalid" | "forbidden"; error: string; blockers?: string[] };

const fail = (code: "conflict" | "invalid" | "forbidden", error: string, blockers?: string[]): ActionResult => ({ ok: false, code, error, blockers });
const clean = (v: string | undefined, max = MAX_REASON) => (v ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, max);
const fmt = (iso: string) => new Date(iso).toLocaleString("de-DE", { timeZone: "Europe/Berlin", dateStyle: "short", timeStyle: "short" });

/** Gültige Vorgangs-ID (vom Formular erzeugt) */
export const isOpId = (v: unknown): v is string => typeof v === "string" && /^[A-Za-z0-9_-]{8,64}$/.test(v);

export function emptyRecord(o: OfficeOrder, now: number): WfRecord {
  const at = new Date(now).toISOString();
  return { key: o.key, order: o.number, rev: 0, status: "neu", createdAt: at, updatedAt: at, updatedBy: "", releases: 0, handovers: [], events: [], ops: [] };
}

const ROLE_ACTIONS: Record<Role, readonly WfAction[]> = {
  admin: ACTIONS,
  buero: ACTIONS.filter((a) => a !== "korrektur"),
  lesen: [],
};
export const mayRun = (role: Role, action: WfAction) => ROLE_ACTIONS[role].includes(action);

/**
 * Eine Aktion anwenden (rein). Wird innerhalb der atomaren Speicher-Aktualisierung aufgerufen – bei einem Konflikt
 * erneut mit dem frischen Stand. Gleiche Vorgangs-ID = bereits erledigt (kein zweites Mal).
 */
export function applyAction(prev: WfRecord | null, o: OfficeOrder, input: ActionInput, actor: Actor, now: number, products: Map<string, Product>): ActionResult {
  if (!mayRun(actor.role, input.action)) return fail("forbidden", "Für diese Aktion fehlt die Berechtigung.");
  if (!isOpId(input.op)) return fail("invalid", "Ungültige Anfrage (Vorgangs-ID fehlt). Bitte die Seite neu laden.");
  if (prev && prev.key !== o.key) return fail("invalid", "Bestellung passt nicht zum Bearbeitungsstand.");
  const base = prev ?? emptyRecord(o, now);
  if (base.ops.includes(input.op)) return { ok: true, rec: base, duplicate: true, shipmentChanged: false };
  if (!Number.isInteger(input.rev) || input.rev !== base.rev) return fail("conflict", CONFLICT_MESSAGE);

  const at = new Date(now).toISOString();
  const from = officeStatus(o, prev);
  const reason = clean(input.reason);
  const remark = clean(input.remark);
  const rec: WfRecord = { ...base, order: o.number, handovers: [...base.handovers], events: [...base.events], ops: [...base.ops] };
  let to: OfficeStatus = from;
  let detail = "";
  let shipmentChanged = false;
  const needConfirm = () => (input.confirm ? null : fail("invalid", "Bitte die Aktion ausdrücklich bestätigen."));
  const needReason = (what: string) => (reason.length >= 3 ? null : fail("invalid", `Bitte eine Begründung angeben (${what}).`));
  const freshFp = () => (input.fp && input.fp !== orderFingerprint(o, products) ? fail("conflict", CONFLICT_MESSAGE) : null);
  const wrong = () => fail("invalid", `„${ACTION_LABEL[input.action]}“ ist im Status „${OFFICE_STATUS_LABEL[from]}“ nicht möglich.`);

  switch (input.action) {
    case "pruefen":
      if (from !== "neu") return wrong();
      to = "pruefung";
      break;
    case "zurueckstellen": {
      if (!["neu", "pruefung", "freigegeben"].includes(from)) return wrong();
      const e = needReason("warum zurückgestellt");
      if (e) return e;
      to = "zurueckgestellt";
      break;
    }
    case "wiederaufnehmen":
      if (from !== "zurueckgestellt") return wrong();
      to = "pruefung";
      break;
    case "freigeben": {
      if (!["neu", "pruefung", "freigegeben", "logistik"].includes(from)) return wrong();
      const e = needConfirm() ?? freshFp();
      if (e) return e;
      const check = releaseCheck(o, prev, products);
      if (check.blockers.length) return fail("invalid", "Freigabe nicht möglich.", check.blockers);
      if (check.warnings.length && !input.ack) return fail("invalid", "Bitte die Hinweise lesen und bestätigen.", check.warnings);
      const parts = releaseParts(o, products);
      const again = Boolean(activeRelease(prev));
      rec.releases = base.releases + 1;
      const mix = Object.fromEntries(o.lines.filter((l) => isMixLine(l, products)).map((l) => [l.handle ?? l.product, lineContents(l, products)]));
      rec.release = { id: input.op, version: rec.releases, at, by: actor.label, byId: actor.id, fp: partsFingerprint(parts), parts, remark, warnings: check.warnings.slice(0, 10), ...(Object.keys(mix).length ? { mix } : {}) };
      to = "freigegeben";
      detail = `Freigabe ${rec.releases}${again ? " (erneut, nach Änderung)" : ""}${check.warnings.length ? ` · ${check.warnings.length} Hinweis(e) bestätigt` : ""}`;
      break;
    }
    case "logistik": {
      if (from !== "freigegeben" && from !== "logistik") return wrong();
      const e = needConfirm() ?? freshFp();
      if (e) return e;
      const check = handoverCheck(o, prev, products);
      if (check.blockers.length) return fail("invalid", "Weitergabe kann nicht dokumentiert werden.", check.blockers);
      const repeat = base.handovers.length > 0;
      if (repeat) {
        const r = needReason("warum die Weitergabe erneut dokumentiert wird");
        if (r) return r;
      }
      const rel = activeRelease(prev) as Release;
      rec.handovers.push({ id: input.op, at, by: actor.label, byId: actor.id, releaseId: rel.id, releaseVersion: rel.version, releaseFp: rel.fp, remark, ...(repeat ? { reason } : {}), repeat });
      if (rec.handovers.length > MAX_HANDOVERS) rec.handovers = [rec.handovers[0], ...rec.handovers.slice(-(MAX_HANDOVERS - 1))];
      to = "logistik";
      detail = `${repeat ? "Erneute Weitergabe" : "Weitergabe"} dokumentiert · Vorgang ${input.op} · zu Freigabe ${rel.version} (Durchführung außerhalb des Shops)`;
      break;
    }
    case "versendet": {
      if (from !== "freigegeben" && from !== "logistik") return wrong();
      const e = needConfirm() ?? freshFp();
      if (e) return e;
      if (!input.shipment) return fail("invalid", "Versandangaben fehlen.");
      const check = shipmentCheck(o, prev, input.shipment, products, input.today ?? at.slice(0, 10));
      if (check.blockers.length) return fail("invalid", "Versand kann nicht erfasst werden.", check.blockers);
      rec.shipment = { carrier: input.shipment.carrier.trim(), tracking: check.tracking, date: input.shipment.date, remark: clean(input.shipment.remark), by: actor.label, byId: actor.id, at, op: input.op, synced: false };
      shipmentChanged = true;
      to = "versendet";
      detail = `${rec.shipment.carrier}${rec.shipment.tracking ? ` · ${rec.shipment.tracking}` : ""} · ${rec.shipment.date}`;
      break;
    }
    case "abschliessen":
      if (from !== "versendet") return wrong();
      to = "abgeschlossen";
      break;
    case "markieren": {
      if (from === "storniert") return wrong();
      const e = needReason("was geprüft werden muss");
      if (e) return e;
      rec.flag = { reason, at, by: actor.label };
      break;
    }
    case "markierung_entfernen":
      if (!base.flag) return fail("invalid", "Die Bestellung ist nicht markiert.");
      rec.flag = undefined;
      break;
    case "uebernehmen":
      rec.assignee = actor.label;
      break;
    case "abgeben":
      if (!base.assignee) return fail("invalid", "Es ist niemand zuständig.");
      rec.assignee = undefined;
      break;
    case "korrektur": {
      const target = input.target;
      if (!target || !(CORRECTION_TARGETS as readonly string[]).includes(target)) return fail("invalid", "Bitte einen gültigen Zielstatus wählen.");
      if (from === "storniert") return fail("invalid", "Stornierte Bestellungen werden in der Originalbestellung geändert, nicht im Büro.");
      if (target === from) return fail("invalid", "Die Bestellung hat diesen Status bereits.");
      const e = needReason("Grund der Korrektur") ?? needConfirm();
      if (e) return e;
      to = target;
      rec.corrected = true;
      detail = "Korrektur – Originalbestellung, Zahlung und Rechnung bleiben unverändert";
      break;
    }
    default:
      return fail("invalid", "Unbekannte Aktion.");
  }

  rec.status = to;
  rec.rev = base.rev + 1;
  rec.updatedAt = at;
  rec.updatedBy = actor.label;
  const event: WfEvent = { id: input.op, at, by: actor.label, byId: actor.id, role: actor.role, action: input.action, from, to, ...(reason ? { reason } : {}), ...(detail ? { detail } : {}) };
  rec.events.push(event);
  if (rec.events.length > MAX_EVENTS) rec.events = rec.events.slice(-MAX_EVENTS);
  rec.ops.push(input.op);
  if (rec.ops.length > MAX_OPS) rec.ops = rec.ops.slice(-MAX_OPS);
  return { ok: true, rec, duplicate: false, event, shipmentChanged };
}

/** Versand-Abgleich mit der Originalbestellung vermerken (rein) */
export function markSynced(rec: WfRecord, op: string, error: string | null, now: number): WfRecord {
  if (!rec.shipment || rec.shipment.op !== op) return rec;
  const at = new Date(now).toISOString();
  if (error) return { ...rec, shipment: { ...rec.shipment, synced: false, syncError: error } };
  const event: WfEvent = { id: `${op}-sync`, at, by: "System", byId: "system", role: "admin", action: "versand_abgeglichen", from: rec.status, to: rec.status, detail: "Status „versendet“, Sendungsnummer und Versanddienst in der Originalbestellung eingetragen (ohne Kunden-E-Mail)" };
  return { ...rec, shipment: { ...rec.shipment, synced: true, syncError: undefined }, events: [...rec.events, event].slice(-MAX_EVENTS) };
}

/* ───────────── Aufmerksamkeit ───────────── */

export type AttentionKind = "markiert" | "blockiert" | "adresse" | "sku" | "zahlung" | "geaendert" | "erneut_weitergegeben" | "abgleich";
export const ATTENTION_LABEL: Record<AttentionKind, string> = {
  markiert: "Prüfung erforderlich",
  blockiert: "Freigabe blockiert",
  adresse: "Adresse unvollständig",
  sku: "Artikelnummer fehlt",
  zahlung: "Zahlungsproblem",
  geaendert: "Nach Freigabe geändert",
  erneut_weitergegeben: "Weitergabe erneut dokumentiert",
  abgleich: "Versanddaten nicht übertragen",
};

/** Gründe, warum eine Bestellung Aufmerksamkeit braucht (leer = alles in Ordnung) */
export function attention(o: OfficeOrder, rec: WfRecord | null | undefined, products: Map<string, Product>): { kind: AttentionKind; text: string }[] {
  const status = officeStatus(o, rec);
  if (status === "storniert" || status === "abgeschlossen") return rec?.flag ? [{ kind: "markiert", text: rec.flag.reason }] : [];
  const out: { kind: AttentionKind; text: string }[] = [];
  if (rec?.flag) out.push({ kind: "markiert", text: rec.flag.reason });
  const open = status === "neu" || status === "pruefung";
  if (open || status === "freigegeben" || status === "logistik") {
    if (!addressComplete(o.delivery ?? o.billing)) out.push({ kind: "adresse", text: "Lieferadresse unvollständig" });
    const noSku = o.lines.filter((l) => !l.sku);
    if (noSku.length) out.push({ kind: "sku", text: `Artikelnummer fehlt (${noSku.map((l) => l.product).join(", ")})` });
    if (o.channel === "privat" && o.paymentStatus !== "bezahlt") out.push({ kind: "zahlung", text: o.paymentStatus === "offen" ? "Noch nicht bezahlt" : o.paymentStatus === "erstattet" ? "Vollständig erstattet" : "Teilweise erstattet" });
  }
  if (open) {
    const c = releaseCheck(o, rec, products);
    const other = c.blockers.filter((b) => !/Lieferadresse|nicht bezahlt|vollständig erstattet/.test(b));
    if (other.length) out.push({ kind: "blockiert", text: other[0] });
  }
  const changed = changedSinceRelease(o, rec, products);
  if (changed.length && status !== "versendet") out.push({ kind: "geaendert", text: `Geändert: ${changedLabel(changed)} – erneut freigeben` });
  if ((rec?.handovers.filter((x) => x.repeat).length ?? 0) > 0 && (status === "logistik" || status === "freigegeben")) out.push({ kind: "erneut_weitergegeben", text: "Weitergabe an die Logistik wurde erneut dokumentiert" });
  if (rec?.shipment && !rec.shipment.synced && status === "versendet") out.push({ kind: "abgleich", text: "Versand im Büro erfasst, aber noch nicht in die Originalbestellung übernommen" });
  return out;
}
