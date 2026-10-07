import Link from "next/link";
import { ArrowIcon } from "./icons";

const STEPS = [
  { id: "starter", name: "Starter", trays: "2–4 Trays", cans: "bis 96 Dosen", pct: "3–7 %", blocks: 4, hue: "#a8e652" },
  { id: "power", name: "Power", trays: "6–9 Trays", cans: "bis 216 Dosen", pct: "9–10 %", blocks: 9, hue: "#c6f03c" },
  { id: "mega", name: "Mega", trays: "12–24 Trays", cans: "bis 576 Dosen", pct: "12–15 %", blocks: 18, hue: "#ffd400" },
  { id: "palette", name: "Palette", trays: "bis 108 Trays", cans: "2.592 Dosen", pct: "Händlerpreis", blocks: 30, hue: "#ff2d95", pallet: true },
];

/** „Von Tray bis Palette“: vier Stufen als wachsende Tray-Stapel – jede Stufe führt zu ihrem Abschnitt */
export function MixLadder() {
  let k = 0;
  return (
    <div className="relative mb-14 overflow-hidden rounded-[2.5rem] border border-line bg-card px-5 pt-10 pb-8 sm:px-10">
      <div aria-hidden className="pointer-events-none absolute -top-32 left-1/2 size-[44rem] -translate-x-1/2 rounded-full bg-accent/10 blur-3xl" />
      <div className="relative mb-10 max-w-2xl">
        <p className="t-eyebrow">Mehr Trays, mehr Ersparnis</p>
        <h2 className="t-h2 mt-3">
          Von Tray bis <span className="grad-text">Palette.</span>
        </h2>
        <p className="t-lead mt-3">Such dir deine Größe: je mehr Trays im Paket, desto höher der Rabatt. Ganz oben wartet die Palette – für Händler, Gastro und Events.</p>
      </div>
      <ul className="relative grid grid-cols-2 items-end gap-4 lg:grid-cols-4">
        {STEPS.map((s) => (
          <li key={s.id}>
            <Link className="group block" href={`#${s.id}`}>
              <div className="relative flex min-h-[11rem] items-end justify-center pb-3">
                <div className="grid w-full max-w-[9rem] grid-cols-6 content-end gap-1">
                  {Array.from({ length: s.blocks }, (_, i) => (
                    <span
                      className="tray-can aspect-[4/3] rounded-[3px] border border-white/10 transition-transform duration-300 group-hover:-translate-y-0.5"
                      key={i}
                      style={{ "--i": k++ % 24, background: `linear-gradient(135deg, ${s.hue}, color-mix(in srgb, ${s.hue} 35%, #000))`, opacity: 0.55 + ((i * 7) % 5) * 0.1 } as React.CSSProperties}
                    />
                  ))}
                </div>
                {s.pallet ? <span aria-hidden className="absolute inset-x-[10%] bottom-0 h-2 rounded bg-[repeating-linear-gradient(90deg,#8a6a3d_0_14px,#5e4526_14px_18px)]" /> : null}
              </div>
              <div className={`rounded-2xl border p-4 transition-colors group-hover:border-accent ${s.pallet ? "border-accent/60 bg-accent/10" : "border-line"}`}>
                <p className="font-black text-xl uppercase tracking-tight">{s.name}</p>
                <p className="text-muted text-sm">{s.trays}</p>
                <p className="text-muted text-xs">{s.cans}</p>
                <p className="mt-2 flex items-center justify-between font-bold text-accent text-sm">
                  {s.pct === "Händlerpreis" ? "Auf Anfrage" : `−${s.pct}`}
                  <span className="transition-transform group-hover:translate-x-1">
                    <ArrowIcon />
                  </span>
                </p>
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
