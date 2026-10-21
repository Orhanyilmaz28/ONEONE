import type { Channel, OfficeOrder } from "./model";
import type { Actor } from "./workflow";

/**
 * Kundenservice (Phase 3E) – Kundenfälle, Reklamationen, Retouren, Stornierungs- und Rückerstattungsanfragen.
 * Rein (ohne Speicher, ohne Netz) und vollständig testbar.
 *
 * - Jeder Fall bekommt eine eindeutige Nummer KS-JJJJ-NNNNN (atomar vergeben, siehe tickets-service.ts).
 * - Fälle verweisen auf bestehende Bestellungen (Schlüssel) und Kundenkonten/Händler (ID) – es wird kein neues
 *   Kundenkonto und keine zweite Bestelldatenbank angelegt. Für die Anzeige werden nur Name und E-Mail mitgeführt.
 * - Keine Lagerbuchung, keine Bestandskorrektur, keine Stripe-Rückerstattung, keine automatischen Kundennachrichten.
 * - Jede Änderung prüft den erwarteten Stand (`rev`) gegen gleichzeitige Bearbeitung und wird protokolliert.
 */

export const TICKET_KINDS = ["anfrage", "reklamation", "retoure", "storno", "erstattung"] as const;
export type TicketKind = (typeof TICKET_KINDS)[number];
export const TICKET_KIND_LABEL: Record<TicketKind, string> = {
  anfrage: "Anfrage",
  reklamation: "Reklamation",
  retoure: "Retoure",
  storno: "Stornierungsanfrage",
  erstattung: "Rückerstattungsanfrage",
};

export const TICKET_STATUS = ["neu", "in_bearbeitung", "rueckfrage", "wartet_kunde", "geloest", "geschlossen"] as const;
export type TicketStatus = (typeof TICKET_STATUS)[number];
export const TICKET_STATUS_LABEL: Record<TicketStatus, string> = {
  neu: "Neu",
  in_bearbeitung: "In Bearbeitung",
  rueckfrage: "Rückfrage offen",
  wartet_kunde: "Wartet auf Kunde",
  geloest: "Gelöst",
  geschlossen: "Geschlossen",
};
export const TICKET_STATUS_TONE: Record<TicketStatus, "blue" | "amber" | "orange" | "violet" | "green" | "neutral"> = {
  neu: "blue",
  in_bearbeitung: "amber",
  rueckfrage: "orange",
  wartet_kunde: "violet",
  geloest: "green",
  geschlossen: "neutral",
};
export const isClosed = (s: TicketStatus) => s === "geloest" || s === "geschlossen";

export const PRIORITIES = ["niedrig", "normal", "hoch", "dringend"] as const;
export type Priority = (typeof PRIORITIES)[number];
export const PRIORITY_LABEL: Record<Priority, string> = { niedrig: "Niedrig", normal: "Normal", hoch: "Hoch", dringend: "Dringend" };

export const COMPLAINT_TYPES = ["falscher_artikel", "beschaedigt", "fehlend", "falsche_menge", "lieferproblem", "qualitaet", "sonstiges"] as const;
export type ComplaintType = (typeof COMPLAINT_TYPES)[number];
export const COMPLAINT_LABEL: Record<ComplaintType, string> = {
  falscher_artikel: "Falscher Artikel",
  beschaedigt: "Beschädigte Ware",
  fehlend: "Fehlende Artikel",
  falsche_menge: "Falsche Menge",
  lieferproblem: "Lieferproblem",
  qualitaet: "Qualitätsproblem",
  sonstiges: "Sonstiges",
};

export const RETURN_STATUS = ["angefragt", "angekuendigt", "unterwegs", "eingegangen", "geprueft", "abgeschlossen"] as const;
export type ReturnStatus = (typeof RETURN_STATUS)[number];
export const RETURN_STATUS_LABEL: Record<ReturnStatus, string> = {
  angefragt: "Angefragt",
  angekuendigt: "Rücksendung vereinbart",
  unterwegs: "Unterwegs",
  eingegangen: "Eingegangen",
  geprueft: "Geprüft",
  abgeschlossen: "Abgeschlossen",
};
export const DECISIONS = ["offen", "erstattung", "ersatz", "gutschrift", "kulanz", "abgelehnt"] as const;
export type Decision = (typeof DECISIONS)[number];
export const DECISION_LABEL: Record<Decision, string> = {
  offen: "Noch offen",
  erstattung: "Erstattung (manuell in Stripe / per Überweisung)",
  ersatz: "Ersatzlieferung",
  gutschrift: "Gutschrift",
  kulanz: "Kulanz",
  abgelehnt: "Abgelehnt",
};
export const REFUND_STATUS = ["offen", "pruefung", "genehmigt", "abgelehnt", "manuell_erstattet"] as const;
export type RefundStatus = (typeof REFUND_STATUS)[number];
export const REFUND_STATUS_LABEL: Record<RefundStatus, string> = {
  offen: "Offen",
  pruefung: "In Prüfung",
  genehmigt: "Genehmigt (Erstattung noch manuell auslösen)",
  abgelehnt: "Abgelehnt",
  manuell_erstattet: "Manuell erstattet (außerhalb des Büros)",
};

/** Bereiche der Kundenservice-Übersicht */
export const SECTIONS = [
  { key: "alle", label: "Alle Kundenfälle" },
  { key: "neu", label: "Neue Anfragen" },
  { key: "reklamation", label: "Reklamationen" },
  { key: "retoure", label: "Retouren" },
  { key: "storno", label: "Stornierungsanfragen" },
  { key: "erstattung", label: "Rückerstattungsanfragen" },
  { key: "abgeschlossen", label: "Abgeschlossene Fälle" },
] as const;
export type SectionKey = (typeof SECTIONS)[number]["key"];

export type TicketCustomer = {
  /** konto = Kundenkonto (tt:customers), haendler = Händler (tt:dealers), gast = Bestellung ohne Konto / ohne Bestellung */
  kind: "konto" | "haendler" | "gast";
  id?: string;
  name: string;
  email: string;
};
export type TicketOrderRef = { key: string; number: string; channel: Channel };
export type ReturnLine = { title: string; handle?: string; quantity: number };

export type TicketEvent = { at: string; by: string; action: string; detail?: string };
export type TicketNote = { at: string; by: string; text: string };

export type Ticket = {
  number: string;
  rev: number;
  kind: TicketKind;
  status: TicketStatus;
  priority: Priority;
  /** Anliegen (Kurztext) */
  subject: string;
  description: string;
  channel: Channel | null;
  order: TicketOrderRef | null;
  /** Bestellnummer, wie angegeben, wenn keine Bestellung verknüpft werden konnte */
  orderText: string;
  customer: TicketCustomer;
  assignee: { id: string; label: string } | null;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
  complaint?: { type: ComplaintType };
  retour?: { lines: ReturnLine[]; reason: string; info: string; status: ReturnStatus; decision: Decision };
  refund?: { reason: string; requested: number; refundedAtCreation: number; status: RefundStatus };
  notes: TicketNote[];
  events: TicketEvent[];
};

export const MAX_NOTES = 200;
export const MAX_EVENTS = 300;
export const CONFLICT = "Dieser Fall wurde zwischenzeitlich geändert. Bitte die Seite neu laden.";

export const formatTicketNumber = (year: number, seq: number) => `KS-${year}-${String(seq).padStart(5, "0")}`;
export const isTicketNumber = (v: string) => /^KS-\d{4}-\d{5,}$/.test(v);

/** Freitext säubern (Steuerzeichen und spitze Klammern raus, Länge begrenzen) */
export const clean = (v: unknown, max: number) =>
  String(v ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f<>]+/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, max);
const oneLine = (v: unknown, max: number) => clean(v, max).replace(/\s+/g, " ");
const EMAIL = /^[^\s@<>()[\]",;:]+@[^\s@<>()[\]",;:]+\.[a-z]{2,}$/i;

/** Eurobetrag „12,50“ / „12.50“ / „12“ → Cent (null = ungültig) */
export function parseEuro(v: unknown): number | null {
  const s = String(v ?? "")
    .trim()
    .replace(/\s|€/g, "");
  if (!s) return null;
  if (!/^\d{1,7}([.,]\d{1,2})?$/.test(s)) return null;
  return Math.round(Number(s.replace(",", ".")) * 100);
}

/* ───────────── Anlegen ───────────── */

export type CreateInput = {
  kind: string;
  priority?: string;
  subject: string;
  description: string;
  customerName?: string;
  customerEmail?: string;
  orderText?: string;
  complaintType?: string;
  returnReason?: string;
  returnInfo?: string;
  /** Mengen je Bestellposition (Index → Menge) oder eine freie Position */
  returnQty?: Record<number, number>;
  returnFree?: { title: string; quantity: number };
  refundReason?: string;
  refundAmount?: string;
};

export type CreateContext = {
  order: OfficeOrder | null;
  /** Verknüpfung mit vorhandenem Kundenkonto bzw. Händler (falls ermittelt) */
  link?: { kind: "konto" | "haendler"; id: string } | null;
};

/** Neuen Fall prüfen und vorbereiten (ohne Nummer). Liefert Fehlertexte statt halb gültiger Daten. */
export function validateCreate(input: CreateInput, ctx: CreateContext): { ok: true; draft: Omit<Ticket, "number" | "rev" | "createdAt" | "createdBy" | "updatedAt" | "updatedBy" | "events" | "notes"> } | { ok: false; errors: string[] } {
  const errors: string[] = [];
  const kind = TICKET_KINDS.find((k) => k === input.kind);
  if (!kind) errors.push("Bitte die Art des Falls wählen.");
  const priority = PRIORITIES.find((p) => p === input.priority) ?? "normal";
  const subject = oneLine(input.subject, 120);
  if (subject.length < 3) errors.push("Bitte das Anliegen kurz beschreiben (mindestens 3 Zeichen).");
  const description = clean(input.description, 4000);
  const o = ctx.order;
  const name = o ? o.company || o.customerName || o.contact : oneLine(input.customerName, 120);
  const email = (o ? o.email : oneLine(input.customerEmail, 160)).toLowerCase();
  if (!o && name.length < 2) errors.push("Bitte den Namen des Kunden angeben (oder den Fall aus einer Bestellung heraus anlegen).");
  if (email && !EMAIL.test(email)) errors.push("Die E-Mail-Adresse ist ungültig.");
  const customer: TicketCustomer = ctx.link ? { kind: ctx.link.kind, id: ctx.link.id, name, email } : { kind: o?.channel === "haendler" ? "haendler" : "gast", name, email };

  let complaint: Ticket["complaint"];
  let retour: Ticket["retour"];
  let refund: Ticket["refund"];
  if (kind === "reklamation") {
    const t = COMPLAINT_TYPES.find((c) => c === input.complaintType);
    if (!t) errors.push("Bitte die Art der Reklamation wählen.");
    else complaint = { type: t };
  }
  if (kind === "retoure") {
    const lines: ReturnLine[] = [];
    if (o) {
      for (const [i, q] of Object.entries(input.returnQty ?? {})) {
        const line = o.lines[Number(i)];
        const qty = Math.floor(Number(q));
        if (!line || !Number.isFinite(qty) || qty <= 0) continue;
        if (qty > line.quantity) errors.push(`Retoure: höchstens ${line.quantity} × ${line.product}.`);
        else lines.push({ title: `${line.product}${line.sort && line.sort !== line.product ? ` – ${line.sort}` : ""}`.slice(0, 120), ...(line.handle ? { handle: line.handle } : {}), quantity: qty });
      }
    }
    if (input.returnFree && oneLine(input.returnFree.title, 120) && input.returnFree.quantity > 0) lines.push({ title: oneLine(input.returnFree.title, 120), quantity: Math.min(9999, Math.floor(input.returnFree.quantity)) });
    if (!lines.length) errors.push("Retoure: bitte mindestens ein Produkt mit Menge angeben.");
    const reason = clean(input.returnReason, 500);
    if (reason.length < 3) errors.push("Retoure: bitte den Rücksendegrund angeben.");
    retour = { lines, reason, info: clean(input.returnInfo, 1000), status: "angefragt", decision: "offen" };
  }
  if (kind === "erstattung") {
    const amount = parseEuro(input.refundAmount);
    const reason = clean(input.refundReason, 500);
    if (amount === null || amount <= 0) errors.push("Erstattung: bitte den angefragten Betrag in Euro angeben (z. B. 12,50).");
    if (o && amount !== null && amount > o.gross - o.refunded) errors.push("Erstattung: der Betrag ist höher als der noch nicht erstattete Bestellbetrag.");
    if (reason.length < 3) errors.push("Erstattung: bitte den Grund angeben.");
    refund = { reason, requested: amount ?? 0, refundedAtCreation: o?.refunded ?? 0, status: "offen" };
  }
  if (errors.length || !kind) return { ok: false, errors };
  return {
    ok: true,
    draft: {
      kind,
      status: "neu",
      priority,
      subject,
      description,
      channel: o?.channel ?? null,
      order: o ? { key: o.key, number: o.number, channel: o.channel } : null,
      orderText: o ? "" : oneLine(input.orderText, 40),
      customer,
      assignee: null,
      ...(complaint ? { complaint } : {}),
      ...(retour ? { retour } : {}),
      ...(refund ? { refund } : {}),
    },
  };
}

export function newTicket(number: string, draft: Extract<ReturnType<typeof validateCreate>, { ok: true }>["draft"], actor: Actor, now: number): Ticket {
  const at = new Date(now).toISOString();
  return { ...draft, number, rev: 1, createdAt: at, createdBy: actor.label, updatedAt: at, updatedBy: actor.label, notes: [], events: [{ at, by: actor.label, action: "angelegt", detail: TICKET_KIND_LABEL[draft.kind] }] };
}

/* ───────────── Bearbeiten ───────────── */

export type TicketAction =
  | { action: "zuweisen"; assignee: { id: string; label: string } | null }
  | { action: "prioritaet"; priority: string }
  | { action: "status"; status: string }
  | { action: "notiz"; text: string }
  | { action: "schliessen"; resolution?: string }
  | { action: "wiedereroeffnen"; reason: string }
  | { action: "retoure"; status: string; decision: string; info: string }
  | { action: "erstattung"; status: string }
  | { action: "reklamation"; type: string };

export type ActionOutcome = { ok: true; ticket: Ticket; changed: boolean } | { ok: false; code: "conflict" | "invalid" | "closed"; error: string };

/**
 * Eine Änderung rein anwenden. `rev` = Stand, den die Person gesehen hat (gegen gleichzeitige Bearbeitung).
 * Geschlossene Fälle lassen sich nur wieder eröffnen (mit Begründung) – sonst keine Änderung.
 */
export function applyTicketAction(t: Ticket, a: TicketAction, rev: number, actor: Actor, now: number): ActionOutcome {
  if (rev !== t.rev) return { ok: false, code: "conflict", error: CONFLICT };
  const at = new Date(now).toISOString();
  const closed = isClosed(t.status);
  if (closed && a.action !== "wiedereroeffnen" && a.action !== "notiz") return { ok: false, code: "closed", error: "Der Fall ist abgeschlossen. Bitte zuerst erneut eröffnen." };
  const ev = (action: string, detail?: string): TicketEvent => ({ at, by: actor.label, action, ...(detail ? { detail: detail.slice(0, 300) } : {}) });
  let next: Ticket = t;
  const events: TicketEvent[] = [];
  switch (a.action) {
    case "zuweisen": {
      const same = (t.assignee?.id ?? "") === (a.assignee?.id ?? "");
      if (same) return { ok: true, ticket: t, changed: false };
      next = { ...t, assignee: a.assignee ? { id: a.assignee.id.slice(0, 40), label: oneLine(a.assignee.label, 80) } : null };
      events.push(ev("zugewiesen", a.assignee ? a.assignee.label : "niemand"));
      break;
    }
    case "prioritaet": {
      const p = PRIORITIES.find((x) => x === a.priority);
      if (!p) return { ok: false, code: "invalid", error: "Unbekannte Priorität." };
      if (p === t.priority) return { ok: true, ticket: t, changed: false };
      next = { ...t, priority: p };
      events.push(ev("Priorität", `${PRIORITY_LABEL[t.priority]} → ${PRIORITY_LABEL[p]}`));
      break;
    }
    case "status": {
      const s = TICKET_STATUS.find((x) => x === a.status);
      if (!s) return { ok: false, code: "invalid", error: "Unbekannter Status." };
      if (s === "geschlossen") return { ok: false, code: "invalid", error: "Zum Schließen bitte „Fall schließen“ verwenden." };
      if (s === t.status) return { ok: true, ticket: t, changed: false };
      if (s === "geloest" && t.refund && (t.refund.status === "offen" || t.refund.status === "pruefung")) return { ok: false, code: "invalid", error: "Die Rückerstattungsanfrage ist noch offen. Bitte zuerst entscheiden." };
      next = { ...t, status: s };
      events.push(ev("Status", `${TICKET_STATUS_LABEL[t.status]} → ${TICKET_STATUS_LABEL[s]}`));
      break;
    }
    case "notiz": {
      const text = clean(a.text, 2000);
      if (text.length < 2) return { ok: false, code: "invalid", error: "Die Notiz ist leer." };
      const notes = [...t.notes, { at, by: actor.label, text }];
      next = { ...t, notes: notes.length > MAX_NOTES ? notes.slice(-MAX_NOTES) : notes };
      events.push(ev("Notiz"));
      break;
    }
    case "schliessen": {
      if (t.refund && (t.refund.status === "offen" || t.refund.status === "pruefung")) return { ok: false, code: "invalid", error: "Die Rückerstattungsanfrage ist noch offen. Bitte zuerst entscheiden." };
      if (t.retour && t.retour.decision === "offen") return { ok: false, code: "invalid", error: "Für die Retoure fehlt noch die Büroentscheidung." };
      next = { ...t, status: "geschlossen" };
      events.push(ev("geschlossen", clean(a.resolution, 300) || undefined));
      break;
    }
    case "wiedereroeffnen": {
      if (!closed) return { ok: false, code: "invalid", error: "Der Fall ist nicht abgeschlossen." };
      const reason = clean(a.reason, 300);
      if (reason.length < 3) return { ok: false, code: "invalid", error: "Bitte einen Grund für die Wiedereröffnung angeben." };
      next = { ...t, status: "in_bearbeitung" };
      events.push(ev("erneut eröffnet", reason));
      break;
    }
    case "retoure": {
      if (!t.retour) return { ok: false, code: "invalid", error: "Dieser Fall ist keine Retoure." };
      const status = RETURN_STATUS.find((x) => x === a.status);
      const decision = DECISIONS.find((x) => x === a.decision);
      if (!status || !decision) return { ok: false, code: "invalid", error: "Bitte Status und Entscheidung wählen." };
      const info = clean(a.info, 1000);
      if (status === t.retour.status && decision === t.retour.decision && info === t.retour.info) return { ok: true, ticket: t, changed: false };
      next = { ...t, retour: { ...t.retour, status, decision, info } };
      const parts = [status !== t.retour.status ? `Rücksendung: ${RETURN_STATUS_LABEL[status]}` : "", decision !== t.retour.decision ? `Entscheidung: ${DECISION_LABEL[decision]}` : "", info !== t.retour.info ? "Rücksendeinfo geändert" : ""].filter(Boolean);
      events.push(ev("Retoure", parts.join(" · ")));
      break;
    }
    case "erstattung": {
      if (!t.refund) return { ok: false, code: "invalid", error: "Dieser Fall ist keine Rückerstattungsanfrage." };
      const status = REFUND_STATUS.find((x) => x === a.status);
      if (!status) return { ok: false, code: "invalid", error: "Unbekannter Erstattungsstatus." };
      if (status === t.refund.status) return { ok: true, ticket: t, changed: false };
      next = { ...t, refund: { ...t.refund, status } };
      events.push(ev("Erstattung", REFUND_STATUS_LABEL[status]));
      break;
    }
    case "reklamation": {
      if (!t.complaint) return { ok: false, code: "invalid", error: "Dieser Fall ist keine Reklamation." };
      const type = COMPLAINT_TYPES.find((x) => x === a.type);
      if (!type) return { ok: false, code: "invalid", error: "Unbekannte Reklamationsart." };
      if (type === t.complaint.type) return { ok: true, ticket: t, changed: false };
      next = { ...t, complaint: { type } };
      events.push(ev("Reklamationsart", COMPLAINT_LABEL[type]));
      break;
    }
  }
  // Erste Bearbeitung durch Mitarbeitende: „Neu“ → „In Bearbeitung“
  if (next.status === "neu" && a.action !== "zuweisen" && a.action !== "prioritaet" && a.action !== "status") next = { ...next, status: "in_bearbeitung" };
  const allEvents = [...t.events, ...events];
  return {
    ok: true,
    changed: true,
    ticket: { ...next, rev: t.rev + 1, updatedAt: at, updatedBy: actor.label, events: allEvents.length > MAX_EVENTS ? [allEvents[0], ...allEvents.slice(-(MAX_EVENTS - 1))] : allEvents },
  };
}

/* ───────────── Übersicht ───────────── */

export function inSection(t: Ticket, s: SectionKey) {
  if (s === "alle") return true;
  if (s === "abgeschlossen") return isClosed(t.status);
  if (s === "neu") return t.status === "neu";
  return t.kind === s && !isClosed(t.status);
}

export type TicketFilter = { section: SectionKey; q: string; status: string; priority: string; mine: string; channel: string };

export function matchesTicket(t: Ticket, f: TicketFilter) {
  if (!inSection(t, f.section)) return false;
  if (f.status && t.status !== f.status) return false;
  if (f.priority && t.priority !== f.priority) return false;
  if (f.mine && t.assignee?.id !== f.mine) return false;
  if (f.channel && t.channel !== f.channel) return false;
  const q = f.q.trim().toLowerCase();
  if (q) {
    const hay = [t.number, t.subject, t.customer.name, t.customer.email, t.order?.number ?? "", t.orderText].join(" ").toLowerCase();
    if (!hay.includes(q)) return false;
  }
  return true;
}

const PRIO_RANK: Record<Priority, number> = { dringend: 0, hoch: 1, normal: 2, niedrig: 3 };
/** Offene zuerst, dann Priorität, dann älteste Bearbeitung zuerst; abgeschlossene nach letzter Änderung */
export function sortTickets(list: Ticket[]) {
  return [...list].sort((a, b) => {
    const ca = isClosed(a.status) ? 1 : 0;
    const cb = isClosed(b.status) ? 1 : 0;
    if (ca !== cb) return ca - cb;
    if (ca) return b.updatedAt.localeCompare(a.updatedAt);
    return PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.createdAt.localeCompare(b.createdAt);
  });
}

export function sectionCounts(list: Ticket[]): Record<SectionKey, number> {
  const out = Object.fromEntries(SECTIONS.map((s) => [s.key, 0])) as Record<SectionKey, number>;
  for (const t of list) for (const s of SECTIONS) if (inSection(t, s.key)) out[s.key]++;
  return out;
}

/** Weitere Fälle desselben Kunden (gleiches Konto/Händler oder gleiche E-Mail) – für die Kundenhistorie */
export function sameCustomer(a: Ticket, b: Ticket) {
  if (a.number === b.number) return false;
  if (a.customer.id && b.customer.id) return a.customer.kind === b.customer.kind && a.customer.id === b.customer.id;
  return Boolean(a.customer.email) && a.customer.email === b.customer.email;
}

/* ───────────── Antwortvorlagen (nur Text, kein Versand) ───────────── */

export const TEMPLATES = [
  { key: "eingang", label: "Eingangsbestätigung" },
  { key: "rueckfrage", label: "Rückfrage" },
  { key: "pruefung", label: "Reklamation in Prüfung" },
  { key: "entscheidung", label: "Entscheidung" },
  { key: "abschluss", label: "Abschluss" },
] as const;
export type TemplateKey = (typeof TEMPLATES)[number]["key"];

/** Vorlagentext zum Kopieren – wird nie automatisch verschickt */
export function renderTemplate(key: TemplateKey, t: Ticket, signer: string): { subject: string; text: string } {
  const hello = t.customer.name ? `Guten Tag ${t.customer.name},` : "Guten Tag,";
  const ref = `${t.number}${t.order ? ` zur Bestellung ${t.order.number}` : t.orderText ? ` zur Bestellung ${t.orderText}` : ""}`;
  const bye = ["", "Viele Grüße", signer || "Ihr EXSTASE-Kundenservice", "Exstase Großhandel GmbH"].join("\n");
  const decision = t.retour ? DECISION_LABEL[t.retour.decision] : t.refund ? REFUND_STATUS_LABEL[t.refund.status] : "[Entscheidung eintragen]";
  const body: Record<TemplateKey, string> = {
    eingang: `vielen Dank für Ihre Nachricht. Wir haben Ihr Anliegen „${t.subject}“ unter der Vorgangsnummer ${ref} aufgenommen und melden uns so schnell wie möglich.`,
    rueckfrage: `zu Ihrem Vorgang ${ref} benötigen wir noch eine Angabe von Ihnen:\n\n[Rückfrage eintragen]\n\nBitte antworten Sie einfach auf diese E-Mail und nennen Sie dabei die Vorgangsnummer.`,
    pruefung: `wir haben Ihre Reklamation (${ref}) erhalten${t.complaint ? ` – ${COMPLAINT_LABEL[t.complaint.type]}` : ""}. Wir prüfen den Fall und melden uns, sobald die Prüfung abgeschlossen ist.`,
    entscheidung: `wir haben Ihren Vorgang ${ref} geprüft. Unsere Entscheidung: ${decision}.\n\n[Details eintragen]`,
    abschluss: `Ihr Vorgang ${ref} ist abgeschlossen. Wenn Sie noch Fragen haben, antworten Sie gern auf diese E-Mail.`,
  };
  return { subject: `Ihr Vorgang ${t.number}${t.kind !== "anfrage" ? ` – ${TICKET_KIND_LABEL[t.kind]}` : ""}`, text: `${hello}\n\n${body[key]}\n${bye}` };
}
