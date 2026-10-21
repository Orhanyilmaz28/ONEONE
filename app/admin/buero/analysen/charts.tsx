import { formatPrice } from "@/lib/format";
import type { Bucket } from "@/lib/office/analytics";

/**
 * Diagramme der Verkaufsanalyse – reines SVG/HTML vom Server, ohne Zusatzpaket.
 * Farben nach der Datenrolle: Serie 1 Privat (blau), Serie 2 Händler (orange) – geprüft auf der dunklen Dashboard-Fläche
 * (Kontrast ≥ 3:1, farbenblind unterscheidbar). Einzelne Reihen nutzen immer Serie 1. Jede Grafik hat eine Legende bzw.
 * direkte Beschriftung, einen Tooltip je Balken (Maus) und eine Tabelle als Alternative.
 */
export const S1 = "#3987e5";
export const S2 = "#d95926";

const eur0 = (c: number) => (c / 100).toLocaleString("de-DE", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const int = (n: number) => n.toLocaleString("de-DE");

/** Senkrechte Balken (gestapelt Privat/Händler oder eine Reihe) über die Zeit */
export function TimeBars({ buckets, mode, title }: { buckets: Bucket[]; mode: "umsatz" | "bestellungen" | "rabatt"; title: string }) {
  const W = 720;
  const H = 220;
  const padL = 64;
  const padB = 28;
  const padT = 12;
  const val = (b: Bucket) => (mode === "umsatz" ? b.b2c + b.b2b : mode === "bestellungen" ? b.orders : b.discount);
  const max = Math.max(1, ...buckets.map(val));
  const step = niceStep(max);
  const top = Math.ceil(max / step) * step;
  const plotW = W - padL - 8;
  const plotH = H - padB - padT;
  const bw = plotW / Math.max(1, buckets.length);
  const barW = Math.max(2, Math.min(28, bw - 2));
  const y = (v: number) => padT + plotH - (v / top) * plotH;
  const fmt = (v: number) => (mode === "bestellungen" ? int(v) : eur0(v));
  const ticks = Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  const labelEvery = Math.ceil(buckets.length / 12);
  return (
    <figure className="m-0">
      <figcaption className="mb-2 flex flex-wrap items-center gap-4 text-[13px] text-muted">
        <span className="font-medium text-ink">{title}</span>
        {mode === "umsatz" ? (
          <>
            <Legend color={S1} label="Privat (Zahlungseingänge)" />
            <Legend color={S2} label="Händler (Rechnungsaufträge)" />
          </>
        ) : null}
      </figcaption>
      <svg aria-label={title} className="h-auto w-full" role="img" viewBox={`0 0 ${W} ${H}`}>
        {ticks.map((t) => (
          <g key={t}>
            <line stroke="currentColor" strokeOpacity={t === 0 ? 0.35 : 0.1} x1={padL} x2={W - 8} y1={y(t)} y2={y(t)} />
            <text className="fill-current text-muted" fontSize="10" textAnchor="end" x={padL - 6} y={y(t) + 3}>
              {fmt(t)}
            </text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const x = padL + i * bw + (bw - barW) / 2;
          const tip = `${b.label}: ${mode === "umsatz" ? `Privat ${formatPrice(b.b2c)} · Händler ${formatPrice(b.b2b)} · gesamt ${formatPrice(b.b2c + b.b2b)}` : mode === "bestellungen" ? `${int(b.orders)} Bestellungen` : `Rabatte ${formatPrice(b.discount)}`}`;
          const segs = mode === "umsatz" ? [{ v: b.b2c, c: S1 }, { v: b.b2b, c: S2 }] : [{ v: val(b), c: S1 }];
          let acc = 0;
          return (
            <g key={b.label + i}>
              <title>{tip}</title>
              {/* großer Trefferbereich für den Tooltip */}
              <rect fill="transparent" height={plotH} width={bw} x={padL + i * bw} y={padT} />
              {segs.map((s, j) => {
                if (s.v <= 0) return null;
                const y1 = y(acc + s.v);
                const h = y(acc) - y1 - (acc > 0 ? 2 : 0);
                acc += s.v;
                // biome-ignore lint/suspicious/noArrayIndexKey: feste Reihenfolge der Segmente
                return <rect fill={s.c} height={Math.max(1, h)} key={j} rx={barW > 6 ? 2 : 0} width={barW} x={x} y={y1} />;
              })}
              {i % labelEvery === 0 ? (
                <text className="fill-current text-muted" fontSize="10" textAnchor="middle" x={padL + i * bw + bw / 2} y={H - 10}>
                  {b.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
    </figure>
  );
}

function niceStep(max: number) {
  const raw = max / 4;
  const p = 10 ** Math.floor(Math.log10(raw));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

export function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span aria-hidden className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}

/** Waagerechte Balkenliste (Rangliste) – Wert immer als Text daneben */
export function BarList({ rows, money = true }: { rows: { label: string; value: number; hint?: string }[]; money?: boolean }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  if (!rows.length) return <p className="text-[14px] text-muted">Keine Daten im Zeitraum.</p>;
  return (
    <ul className="space-y-2">
      {rows.map((r) => (
        <li className="grid grid-cols-[minmax(110px,180px)_1fr_auto] items-center gap-3 text-[13px]" key={r.label} title={`${r.label}: ${money ? formatPrice(r.value) : int(r.value)}${r.hint ? ` · ${r.hint}` : ""}`}>
          <span className="truncate">{r.label}</span>
          <span className="h-3 rounded-r" style={{ width: `${Math.max(1, (r.value / max) * 100)}%`, background: S1 }} />
          <span className="tabular-nums text-ink/80">
            {money ? formatPrice(r.value) : int(r.value)}
            {r.hint ? <span className="text-muted"> · {r.hint}</span> : null}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Anteil Privat/Händler als ein geteilter Balken mit Beschriftung */
export function SplitBar({ a, b }: { a: number; b: number }) {
  const total = a + b;
  if (!total) return <p className="text-[14px] text-muted">Kein Umsatz im Zeitraum.</p>;
  const pa = (a / total) * 100;
  const pct = (v: number) => `${v.toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`;
  return (
    <div>
      <div className="flex h-4 w-full gap-[2px] overflow-hidden rounded" role="img" aria-label={`Privat ${pct(pa)}, Händler ${pct(100 - pa)}`}>
        {a > 0 ? <span style={{ width: `${pa}%`, background: S1 }} title={`Privat ${formatPrice(a)} (${pct(pa)})`} /> : null}
        {b > 0 ? <span style={{ width: `${100 - pa}%`, background: S2 }} title={`Händler ${formatPrice(b)} (${pct(100 - pa)})`} /> : null}
      </div>
      <div className="mt-2 flex flex-wrap justify-between gap-2 text-[13px]">
        <Legend color={S1} label={`Privat ${formatPrice(a)} · ${pct(pa)}`} />
        <Legend color={S2} label={`Händler ${formatPrice(b)} · ${pct(100 - pa)}`} />
      </div>
    </div>
  );
}
