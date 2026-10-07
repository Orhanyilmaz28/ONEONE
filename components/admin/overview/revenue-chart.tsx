import { formatPrice } from "@/lib/format";
import { type DayBucket, formatLongDay, formatShortDay } from "./stats";

/**
 * Säulendiagramm „Umsatz pro Tag“ – reines SVG, ohne zusätzliche Bibliothek und ohne JavaScript.
 *
 * Kniff: Das SVG hat keine viewBox. Alle waagerechten Werte sind Prozentangaben, alle
 * senkrechten Werte Pixel. So passt sich das Diagramm jeder Breite an (Handy bis Desktop),
 * ohne dass Schrift oder runde Ecken verzerrt werden.
 * Die Tooltips erscheinen per CSS (:hover / :has), daher braucht es keinen Client-Code.
 * Für Screenreader und Tastatur gibt es darunter alle Werte als Tabelle.
 */

const H = 236; // Gesamthöhe in px
const TOP = 14; // Platz über der höchsten Säule
const BASE = 204; // Grundlinie (y)
const LABEL_Y = 226; // Datumsbeschriftung (y)
const TIP_W = 148;
const TIP_H = 76;

const euro0 = new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });

/** Runde Achsenschritte (1, 2, 5, 10 × 10ⁿ), mindestens 1 € */
function niceScale(maxCents: number) {
  const raw = Math.max(maxCents, 100) / 4;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const n = raw / pow;
  const step = Math.max(100, (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow);
  const top = Math.ceil(Math.max(maxCents, 1) / step) * step;
  const ticks: number[] = [];
  for (let v = 0; v <= top; v += step) ticks.push(v);
  return { top, ticks };
}

const pct = (v: number) => `${v.toFixed(3)}%`;

function plural(n: number, one: string, many: string) {
  return `${n.toLocaleString("de-DE")} ${n === 1 ? one : many}`;
}

/** CSS für Hover-Effekt und Tooltips (ein Satz Regeln je Tag) */
function chartCss(count: number) {
  const rules = [
    ".rc-bar{transition:opacity .15s ease}",
    ".rc-tip{opacity:0;transition:opacity .15s ease;pointer-events:none}",
    ".rc-plot:has(.rc-d:hover) .rc-bar{opacity:.3}",
    ".rc-plot .rc-d:hover .rc-bar{opacity:1}",
    "@media (prefers-reduced-motion: reduce){.rc-bar,.rc-tip{transition:none}}",
  ];
  for (let i = 0; i < count; i++) rules.push(`.rc-plot:has(.rc-h${i}:hover) .rc-t${i}{opacity:1}`);
  return rules.join("");
}

export function RevenueChart({ days }: { days: DayBucket[] }) {
  const n = days.length;
  const max = Math.max(0, ...days.map((d) => d.revenue));
  const empty = max === 0;
  const { top, ticks } = niceScale(max);
  const slot = 100 / n;
  const barW = slot * 0.62;
  const y = (cents: number) => BASE - (cents / top) * (BASE - TOP);

  const total = days.reduce((s, d) => s + d.revenue, 0);
  const best = days.reduce((a, b) => (b.revenue > a.revenue ? b : a), days[0]);
  const activeDays = days.filter((d) => d.revenue > 0).length;
  const summary = empty
    ? "In den letzten 30 Tagen gab es noch keinen Umsatz."
    : `Gesamt ${formatPrice(total)} an ${plural(activeDays, "Tag", "Tagen")} mit Bestellungen. Bester Tag: ${formatLongDay(best.key)} mit ${formatPrice(best.revenue)}.`;

  // Beschriftete Tage auf der x-Achse: jeder 7. Tag rückwärts ab heute
  const labelled = new Set<number>();
  for (let i = n - 1; i >= 0; i -= 7) labelled.add(i);

  return (
    <figure className="m-0">
      <style>{chartCss(n)}</style>
      <div className="relative flex">
        {/* y-Achse (HTML, damit die Schrift auf jeder Breite gleich groß bleibt) */}
        <div aria-hidden className="relative w-14 shrink-0 text-[11px] text-muted tabular-nums" style={{ height: H }}>
          {empty
            ? null
            : ticks.map((t) => (
                <span className="absolute right-3 leading-[14px]" key={t} style={{ top: y(t) - 7 }}>
                  {euro0.format(t / 100)}
                </span>
              ))}
        </div>

        <svg aria-describedby="rc-desc" aria-labelledby="rc-title" className="rc-plot block min-w-0 flex-1 overflow-visible" height={H} role="img" width="100%">
          <title id="rc-title">Umsatz pro Tag in den letzten 30 Tagen</title>
          <desc id="rc-desc">{summary}</desc>

          {/* Hilfslinien – dezent, durchgezogen */}
          {empty
            ? null
            : ticks.slice(1).map((t) => <line key={t} stroke="#efebe5" strokeWidth={1} x1="0" x2="100%" y1={y(t) + 0.5} y2={y(t) + 0.5} />)}
          <line stroke="#d9d4cc" strokeWidth={1} x1="0" x2="100%" y1={BASE + 0.5} y2={BASE + 0.5} />

          {/* Säulen + unsichtbare, große Trefferflächen */}
          {days.map((d, i) => {
            const x = i * slot + (slot - barW) / 2;
            const h = d.revenue > 0 ? Math.max(3, BASE - y(d.revenue)) : 0;
            return (
              <g className="rc-d" key={d.key}>
                <rect className={`rc-h${i}`} fill="transparent" height={BASE - TOP + 26} width={pct(slot)} x={pct(i * slot)} y={TOP - 4} />
                {h > 0 ? (
                  <g className="rc-bar" fill="#141414" pointerEvents="none">
                    {/* Oben 4 px abgerundet, unten eckig an der Grundlinie */}
                    <rect height={h} rx={4} width={pct(barW)} x={pct(x)} y={BASE - h} />
                    {h > 4 ? <rect height={4} width={pct(barW)} x={pct(x)} y={BASE - 4} /> : null}
                  </g>
                ) : (
                  <rect className="rc-bar" fill="#ddd8d0" height={2} pointerEvents="none" rx={1} width={pct(barW)} x={pct(x)} y={BASE - 2} />
                )}
              </g>
            );
          })}

          {/* Datum unter ausgewählten Säulen */}
          {days.map((d, i) =>
            labelled.has(i) ? (
              <text
                fill="#6b6966"
                fontSize={11}
                key={d.key}
                textAnchor={i === n - 1 ? "end" : i === 0 ? "start" : "middle"}
                x={i === n - 1 ? "100%" : pct(i === 0 ? i * slot : (i + 0.5) * slot)}
                y={LABEL_Y}
              >
                {i === n - 1 ? "Heute" : formatShortDay(d.key)}
              </text>
            ) : null,
          )}

          {/* Tooltips – nach den Säulen gezeichnet, damit sie immer obenauf liegen */}
          {days.map((d, i) => {
            const barTop = d.revenue > 0 ? Math.min(y(d.revenue), BASE - 3) : BASE - 2;
            const above = barTop - TIP_H - 10 >= 0;
            // Über der Säule (am Rand bündig) – oder daneben, wenn oben kein Platz ist
            const dx = above ? (i < 3 ? -16 : i > n - 4 ? -TIP_W + 16 : -TIP_W / 2) : i < n / 2 ? 16 : -TIP_W - 16;
            const dy = above ? barTop - TIP_H - 10 : 0;
            return (
              <svg className={`rc-tip rc-t${i}`} key={d.key} overflow="visible" x={pct((i + 0.5) * slot)} y={dy}>
                <g transform={`translate(${dx} 0)`}>
                  <rect fill="#141414" height={TIP_H} rx={12} width={TIP_W} />
                  <text fill="#ffffff" fontSize={15} fontWeight={600} x={14} y={24}>
                    {formatPrice(d.revenue)}
                  </text>
                  <text fill="#ffffff" fillOpacity={0.72} fontSize={12} x={14} y={44}>
                    {formatLongDay(d.key)}
                  </text>
                  <text fill="#ffffff" fillOpacity={0.72} fontSize={12} x={14} y={62}>
                    {d.orders ? plural(d.orders, "Bestellung", "Bestellungen") : "Keine Bestellung"}
                  </text>
                </g>
              </svg>
            );
          })}
        </svg>

        {empty ? (
          <div className="pointer-events-none absolute inset-x-0 top-0 flex items-center justify-center px-6 text-center" style={{ height: BASE }}>
            <p className="max-w-xs text-[15px] text-muted">
              Noch keine Umsätze in den letzten 30 Tagen. Sobald die erste Bestellung bezahlt ist, erscheint sie hier.
            </p>
          </div>
        ) : null}
      </div>

      {/* Alle Werte zum Nachlesen – auch für Tastatur und Screenreader */}
      <details className="group mt-4 border-line border-t pt-3">
        <summary className="flex w-fit cursor-pointer list-none items-center gap-1.5 rounded-lg text-[13px] text-muted outline-none hover:text-ink focus-visible:ring-2 focus-visible:ring-ink/30 [&::-webkit-details-marker]:hidden">
          <svg aria-hidden className="size-3.5 transition group-open:rotate-90" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} viewBox="0 0 24 24">
            <path d="m9 6 6 6-6 6" />
          </svg>
          Alle Tageswerte als Tabelle
        </summary>
        <div className="mt-3 max-h-72 overflow-y-auto rounded-2xl border border-line">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Umsatz und Bestellungen pro Tag, neueste zuerst</caption>
            <thead className="sticky top-0 bg-paper text-[12px] text-muted">
              <tr>
                <th className="px-4 py-2 font-medium" scope="col">
                  Tag
                </th>
                <th className="px-4 py-2 text-right font-medium" scope="col">
                  Bestellungen
                </th>
                <th className="px-4 py-2 text-right font-medium" scope="col">
                  Umsatz
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line tabular-nums">
              {[...days].reverse().map((d) => (
                <tr className={d.revenue ? "" : "text-muted"} key={d.key}>
                  <th className="px-4 py-2 font-normal" scope="row">
                    {formatLongDay(d.key)}
                  </th>
                  <td className="px-4 py-2 text-right">{d.orders}</td>
                  <td className="px-4 py-2 text-right">{formatPrice(d.revenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
