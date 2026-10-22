/**
 * Alle E-Mails, die der Shop verschickt – für Dashboard → E-Mails (Schalter, Vorschau, Protokoll).
 * `tag` ist der Kurzname, mit dem sendMail() die Mail kennzeichnet.
 * Reines Datenmodul: darf auch in Client-Komponenten verwendet werden.
 */

export type MailGroup = "kunden" | "haendler" | "influencer" | "intern";

export type MailType = {
  tag: string;
  /** weitere Kurznamen derselben Mail (z. B. Angebot statt Nachricht) */
  alias?: string[];
  label: string;
  /** Wann die Mail verschickt wird */
  when: string;
  group: MailGroup;
  /** Kann im Dashboard ausgeschaltet werden */
  switchable: boolean;
  /** Warum die Mail immer an ist bzw. wie der Schalter wirkt */
  note?: string;
  /** Verschickst du selbst (kein Schalter nötig) */
  manual?: boolean;
};

export const MAIL_GROUPS: { key: MailGroup; label: string }[] = [
  { key: "kunden", label: "An Kund:innen" },
  { key: "haendler", label: "An Händler" },
  { key: "influencer", label: "An Influencer" },
  { key: "intern", label: "An dich" },
];

export const MAIL_TYPES: MailType[] = [
  { tag: "bestellung", group: "kunden", label: "Bestellbestätigung", when: "Nach jeder bezahlten Bestellung, mit Widerrufsbelehrung.", switchable: true },
  {
    tag: "versand",
    group: "kunden",
    label: "Versand-Mail",
    when: "Mit Sendungsnummer, wenn du eine Bestellung auf „Versendet“ setzt.",
    switchable: true,
    note: "Aus = das Häkchen „Kund:in informieren“ ist beim Versenden nicht vorausgewählt.",
  },
  { tag: "passwort", group: "kunden", label: "Passwort zurücksetzen", when: "Wenn Kund:innen „Passwort vergessen“ nutzen.", switchable: false, note: "Immer an – sonst kommen Kund:innen nicht mehr in ihr Konto." },
  { tag: "newsletter-bestaetigung", group: "kunden", label: "Newsletter bestätigen", when: "Nach der Anmeldung zum Newsletter.", switchable: false, note: "Immer an – die Bestätigung ist gesetzlich nötig (Double-Opt-in)." },

  { tag: "haendler-bestaetigung", group: "haendler", label: "Eingang der Händler-Anfrage", when: "Direkt nach einer Anfrage über „Händler werden“.", switchable: true },
  { tag: "haendler-freischaltung", group: "haendler", label: "Händlerzugang freigeschaltet", when: "Wenn du einen Händler freigibst oder einen neuen Zugangslink erzeugst.", switchable: false, note: "Immer an – enthält den Link zum Zugang." },
  { tag: "haendler-bestellung", group: "haendler", label: "Händler-Bestellbestätigung", when: "Nach jeder Bestellung im Händlerportal.", switchable: true },
  {
    tag: "haendler-bestellstatus",
    group: "haendler",
    label: "Status einer Händler-Bestellung",
    when: "Wenn du den Status änderst und „per E-Mail informieren“ anhakst.",
    switchable: false,
    manual: true,
    note: "Entscheidest du bei jeder Statusänderung selbst.",
  },
  { tag: "haendler-rechnung", group: "haendler", label: "Rechnung bereit", when: "Wenn du eine Händler-Rechnung freigibst oder korrigierst.", switchable: true },
  {
    tag: "haendler-nachricht",
    alias: ["haendler-angebot"],
    group: "haendler",
    label: "Nachricht oder Angebot",
    when: "Wenn du unter Händler → Nachrichten etwas verschickst.",
    switchable: false,
    manual: true,
    note: "Verschickst du selbst. Angebote gehen nur an Händler mit Einwilligung.",
  },

  { tag: "influencer-bestaetigung", group: "influencer", label: "Eingang der Bewerbung", when: "Direkt nach einer Bewerbung über „Influencer werden“.", switchable: true },
  { tag: "influencer-freischaltung", group: "influencer", label: "Partner freigeschaltet", when: "Wenn du einen Influencer freischaltest.", switchable: false, note: "Immer an – enthält Code und Link zum Zugang." },
  { tag: "influencer-gutschrift", group: "influencer", label: "Provisionsgutschrift", when: "Wenn du eine monatliche Gutschrift erstellst.", switchable: true },

  { tag: "neue-bestellung", group: "intern", label: "Neue Bestellung", when: "Bei jeder bezahlten Bestellung im Shop.", switchable: true },
  { tag: "neue-haendler-bestellung", group: "intern", label: "Neue Händler-Bestellung", when: "Bei jeder Bestellung im Händlerportal.", switchable: true },
  { tag: "haendler-anfrage", group: "intern", label: "Neue Händler-Anfrage", when: "Wenn jemand Händler werden möchte.", switchable: true },
  { tag: "influencer-anfrage", group: "intern", label: "Neue Influencer-Bewerbung", when: "Wenn sich jemand als Influencer bewirbt.", switchable: true },
  { tag: "test", group: "intern", label: "Test-E-Mail", when: "Wenn du im Dashboard auf „Test“ klickst.", switchable: false, manual: true, note: "Nur zum Ausprobieren." },
];

export function mailTypeOf(tag: string | undefined): MailType | undefined {
  if (!tag) return undefined;
  return MAIL_TYPES.find((t) => t.tag === tag || t.alias?.includes(tag));
}

/** Kurzname → lesbarer Name (für das Protokoll) */
export function mailLabel(tag: string | undefined) {
  if (tag === "monitor") return "Störungsmeldung";
  return mailTypeOf(tag)?.label ?? tag ?? "E-Mail";
}
