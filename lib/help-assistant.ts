/**
 * Fragen-Assistent („Fragen? Wir helfen gern“): feste Antworten aus Shop-Daten, ohne KI und ohne Kosten.
 * Läuft komplett im Browser – die Fragen der Kund:innen werden nirgends gespeichert oder verschickt.
 * Reine Funktionen (ohne React), damit sie in Tests geprüft werden können.
 */
import { formatPrice } from "./format";
import { MIX_MAX, MIX_TIERS } from "./mix";
import type { PublicSettings } from "./settings-defaults";

export const HELP_EMAIL = "hello@exstase.com";

export type HelpLink = { href: string; label: string };
export type HelpAnswer = { topic: string; text: string; links: HelpLink[] };

/** Was der Assistent über ein Produkt wissen muss */
export type HelpProduct = { handle: string; title: string; subtitle?: string; material?: string; onRequest?: boolean };

type Topic = {
  id: string;
  /** Frage auf dem Knopf (immer sichtbar im Fenster) */
  label: string;
  /** Wortstämme (klein, ohne Umlaute) – ein Treffer reicht */
  keywords: string[];
  /** Vorrang bei Gleichstand (z. B. „Liefert ihr nach Österreich?“ → Ausland statt Versand) */
  specific?: boolean;
  answer: (s: PublicSettings["shipping"]) => Omit<HelpAnswer, "topic">;
};

const CONTACT_LINK: HelpLink = { href: "/kontakt", label: "Kontakt" };

function shippingText(s: PublicSettings["shipping"]) {
  const cost = s.cost > 0 ? `Der Standardversand mit DHL kostet ${formatPrice(s.cost)}` : "Der Standardversand mit DHL ist kostenlos";
  const free = s.cost > 0 && s.freeFrom > 0 ? `, ab ${formatPrice(s.freeFrom)} Bestellwert ist er kostenlos` : "";
  const express = s.express > 0 ? ` Express (nächster Werktag) kostet ${formatPrice(s.express)}.` : "";
  return `${cost}${free}.${express}`;
}

export const HELP_TOPICS: Topic[] = [
  {
    id: "versand",
    label: "Was kostet der Versand?",
    keywords: ["versand", "liefer", "porto", "dhl", "paket", "wann kommt", "wie lange", "dauer", "express", "verschick", "senden", "zustell"],
    answer: (s) => ({
      text: `Wir versenden aus Straelen (NRW) innerhalb von 1–2 Werktagen, bei dir ist die Bestellung meist in 1–3 Werktagen. ${shippingText(s)}`,
      links: [{ href: "/versand", label: "Versand & Lieferung" }],
    }),
  },
  {
    id: "ausland",
    label: "Liefert ihr ins Ausland?",
    specific: true,
    keywords: ["ausland", "oesterreich", "schweiz", "niederlande", "holland", "belgien", "frankreich", "italien", "europa", "eu ", "international", "land", "laender"],
    answer: () => ({
      text: "Wir liefern derzeit nur innerhalb Deutschlands. Für größere Mengen ins Ausland schreib uns gern eine Mail.",
      links: [CONTACT_LINK],
    }),
  },
  {
    id: "pfand",
    label: "Wie funktioniert das Pfand?",
    keywords: ["pfand", "dose zurueck", "dosen zurueck", "leergut", "einweg"],
    answer: () => ({
      text: "Auf jede Dose und Flasche kommen 0,25 € Einwegpfand. Das Pfand steht im Warenkorb und an der Kasse als eigene Zeile, damit du immer siehst, was du zahlst. Leere Dosen gibst du wie gewohnt im Supermarkt am Automaten zurück.",
      links: [],
    }),
  },
  {
    id: "mix",
    label: "Wie funktioniert der Mix-Rabatt?",
    keywords: ["mix", "misch", "rabatt", "gemischt", "verschiedene sorten", "probier", "sparen", "angebot", "guenstiger"],
    answer: () => ({
      text: `Wenn du mindestens 2 verschiedene Sorten in den Warenkorb legst, gibt es Mix-Rabatt: ab ${MIX_TIERS[0].min} Trays ${MIX_TIERS[0].pct} %, bis zu ${MIX_MAX} % ab ${MIX_TIERS[MIX_TIERS.length - 1].min} Trays. Der Rabatt wird automatisch abgezogen.`,
      links: [{ href: "/mix", label: "Mix zusammenstellen" }],
    }),
  },
  {
    id: "sorten",
    label: "Welche Sorten gibt es?",
    keywords: ["sorte", "geschmack", "welche gibt", "was gibt", "sortiment", "produkte", "energy", "ice tea", "eistee", "kaffee", "coffee", "wasser", "aqua"],
    answer: () => ({
      text: "Es gibt EXSTASE Energy in vielen Sorten (auch Zero ohne Zucker), X-Tea Ice Tea, Ice Coffee und Aqua x Wasser. Verkauft wird im Tray (24 Dosen, Wasser 12 Flaschen). Schreib mir einfach den Namen einer Sorte, dann zeige ich dir die Seite dazu.",
      links: [{ href: "/products", label: "Alle Produkte" }],
    }),
  },
  {
    id: "zutaten",
    label: "Wo finde ich Zutaten & Koffein?",
    keywords: ["zutat", "koffein", "caffein", "naehrwert", "kalorie", "zucker", "allergen", "vegan", "inhaltsstoff", "taurin", "kcal", "gesund", "schwanger", "kinder", "zero"],
    answer: () => ({
      text: "Zutaten, Koffeingehalt und Nährwerte stehen auf jeder Produktseite unter „Zutaten & Nährwerte“ und auf der Dose. Zero ist die Variante ohne Zucker. Energy Drinks haben einen erhöhten Koffeingehalt und sind nicht für Kinder, Schwangere und Stillende empfohlen. Nenn mir eine Sorte, dann bringe ich dich direkt hin.",
      links: [{ href: "/products", label: "Alle Produkte" }],
    }),
  },
  {
    id: "zahlung",
    label: "Wie kann ich bezahlen?",
    keywords: ["zahl", "bezahl", "paypal", "kreditkarte", "karte", "apple pay", "google pay", "klarna", "rechnung", "lastschrift", "sepa", "ueberweis", "sicher"],
    answer: () => ({
      text: "Du bezahlst sicher über Stripe, zum Beispiel mit Kreditkarte, PayPal, Apple Pay oder Google Pay. Welche Zahlungsarten genau gehen, siehst du auf der Bezahlseite.",
      links: [],
    }),
  },
  {
    id: "rueckgabe",
    label: "Kann ich etwas zurückgeben?",
    keywords: ["rueckgabe", "zurueckgeb", "zuruecksend", "zurueckschick", "widerruf", "umtausch", "retour", "storn", "kaputt", "beschaedigt", "falsch geliefert", "reklamation"],
    answer: () => ({
      text: "Du kannst deine Bestellung innerhalb von 14 Tagen nach Erhalt ohne Angabe von Gründen widerrufen und die ungeöffnete Ware zurücksenden. Ist etwas beschädigt angekommen, schick uns bitte ein Foto per Mail, wir kümmern uns.",
      links: [{ href: "/widerruf", label: "Widerrufsbelehrung" }, CONTACT_LINK],
    }),
  },
  {
    id: "bestellung",
    label: "Wo ist meine Bestellung?",
    keywords: ["bestellung", "bestellt", "sendungsverfolgung", "tracking", "wo ist", "status", "bestellnummer", "bestaetigung", "aendern", "adresse"],
    answer: () => ({
      text: `Fragen zu einer Bestellung beantworten wir am schnellsten per Mail an ${HELP_EMAIL}. Schreib bitte deine Bestellnummer dazu. Wir melden uns meist innerhalb von 24 Stunden.`,
      links: [CONTACT_LINK],
    }),
  },
  {
    id: "haendler",
    label: "Gibt es Händlerpreise?",
    keywords: ["haendler", "gewerbe", "grosshandel", "palette", "b2b", "wiederverkauf", "gastro", "kiosk", "laden", "einzelhandel", "event", "grosse menge", "firma"],
    answer: () => ({
      text: "Für Handel, Gastronomie und Events gibt es Händlerpreise, Paletten und Mischpaletten. Registrier dich kurz als Händler, wir melden uns mit deinen Konditionen.",
      links: [{ href: "/haendler", label: "Händler werden" }],
    }),
  },
  {
    id: "kontakt",
    label: "Wie erreiche ich euch?",
    keywords: ["kontakt", "mensch", "mitarbeiter", "anruf", "telefon", "mail", "erreich", "sprechen", "hilfe"],
    answer: () => ({
      text: `Schreib uns an ${HELP_EMAIL}, wir antworten persönlich, meist innerhalb von 24 Stunden. Telefonisch erreichst du uns Mo–Fr von 9–17 Uhr.`,
      links: [CONTACT_LINK],
    }),
  },
];

/** Kleinschreibung, Umlaute ausschreiben, Satzzeichen weg */
export function normalize(text: string) {
  return ` ${text
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

/** Stichwort in der (normalisierten) Frage? Am Wortanfang, mit Leerzeichen am Ende nur als ganzes Wort */
function matches(q: string, keyword: string) {
  const k = normalize(keyword);
  return q.includes(keyword.endsWith(" ") ? k : k.trimEnd());
}

/** Wörter im Produktnamen, die allein nichts aussagen */
const GENERIC_WORDS = new Set(["ice", "x", "tea", "energy", "drink", "coffee", "aqua", "wasser", "und", "the", "taste", "exstase"]);

/** Findet ein Produkt, dessen Name in der Frage vorkommt (z. B. „Wie viel Koffein hat Watermelon?“) */
export function findProduct(question: string, products: HelpProduct[]): HelpProduct | undefined {
  const q = normalize(question);
  let best: { product: HelpProduct; score: number } | undefined;
  for (const p of products) {
    const name = normalize(p.title);
    // ganzer Name zählt am meisten, sonst einzelne aussagekräftige Wörter
    let score = q.includes(name) ? 100 + name.length : 0;
    if (!score) {
      for (const word of name.trim().split(" ")) {
        if (word.length >= 3 && !GENERIC_WORDS.has(word) && q.includes(` ${word} `)) score += word.length;
      }
    }
    if (score && (!best || score > best.score)) best = { product: p, score };
  }
  return best?.product;
}

function productAnswer(p: HelpProduct): HelpAnswer {
  const info = p.onRequest
    ? "Dieses Produkt gibt es auf Anfrage."
    : p.material?.trim()
      ? "Auf der Produktseite findest du Preis, Pfand sowie Zutaten, Koffein und Nährwerte."
      : "Auf der Produktseite findest du Preis und Pfand. Die Zutaten stehen auf der Dose, schreib uns gern, wenn du sie vorher brauchst.";
  return {
    topic: "produkt",
    text: `${p.title}${p.subtitle ? ` (${p.subtitle})` : ""}: ${info}`,
    links: [{ href: `/products/${p.handle}`, label: `Zu ${p.title}` }],
  };
}

export const FALLBACK_TEXT = `Dazu habe ich leider keine feste Antwort. Schreib uns an ${HELP_EMAIL}, wir antworten persönlich, meist innerhalb von 24 Stunden. Oder wähl unten ein Thema.`;

/** Beantwortet ein Thema (Knopf) */
export function answerTopic(id: string, shipping: PublicSettings["shipping"]): HelpAnswer | undefined {
  const t = HELP_TOPICS.find((x) => x.id === id);
  return t ? { topic: t.id, ...t.answer(shipping) } : undefined;
}

/** Beantwortet eine frei getippte Frage: Produktname vor Thema, sonst Hinweis auf Kontakt */
export function answerQuestion(question: string, shipping: PublicSettings["shipping"], products: HelpProduct[]): HelpAnswer {
  const q = normalize(question);
  const product = findProduct(question, products);
  // Stichwort muss am Wortanfang stehen; endet es mit Leerzeichen („eu “), zählt nur das ganze Wort („liefer“ passt zu „Lieferzeit“, „land“ nicht zu „Deutschland“)
  const topicScores = HELP_TOPICS.map((t) => ({ t, score: t.keywords.filter((k) => matches(q, k)).length }))
    .map(({ t, score }) => ({ t, score: score && t.specific ? score + 0.5 : score }));
  // Bei Fragen wie „Zutaten von Watermelon?“ oder nur „Watermelon“ zuerst das Produkt
  const best = topicScores.reduce((a, b) => (b.score > a.score ? b : a), { t: HELP_TOPICS[0], score: 0 });
  const productTopics = new Set(["sorten", "zutaten"]);
  if (product && (best.score === 0 || productTopics.has(best.t.id))) return productAnswer(product);
  if (best.score > 0) return { topic: best.t.id, ...best.t.answer(shipping) };
  if (product) return productAnswer(product);
  return { topic: "unbekannt", text: FALLBACK_TEXT, links: [CONTACT_LINK] };
}
