/** Händlerstufe als gut sichtbare Plakette (Farbe nach Name: Basic, Silver, Gold, Platin) */
const STYLES: [RegExp, { ring: string; bg: string; text: string }][] = [
  [/plat/i, { ring: "#c9e6ff", bg: "linear-gradient(135deg,#e8f6ff,#9fc7e6 55%,#dff1ff)", text: "#0b1b29" }],
  [/gold/i, { ring: "#ffd54a", bg: "linear-gradient(135deg,#fff1a8,#f2b705 55%,#ffe27a)", text: "#2b1d00" }],
  [/silv|silb/i, { ring: "#d8dde2", bg: "linear-gradient(135deg,#f4f6f8,#aab3bb 55%,#e3e7ea)", text: "#14181c" }],
];
const FALLBACK = { ring: "#8a8d86", bg: "linear-gradient(135deg,#3a3d38,#22251f)", text: "#f5f7f2" };

export function TierBadge({ name, size = "md" }: { name: string; size?: "sm" | "md" | "lg" }) {
  const st = STYLES.find(([re]) => re.test(name))?.[1] ?? FALLBACK;
  const dim = size === "lg" ? "px-5 py-2 text-base" : size === "sm" ? "px-3 py-1 text-[11px]" : "px-4 py-1.5 text-sm";
  return (
    <span className={`inline-flex items-center gap-2 rounded-full font-black uppercase tracking-[0.15em] shadow-[0_0_24px_-6px_var(--ring)] ${dim}`} style={{ background: st.bg, color: st.text, border: `1px solid ${st.ring}`, ["--ring" as string]: st.ring }}>
      <svg aria-hidden className="size-[1.1em]" fill="currentColor" viewBox="0 0 24 24">
        <path d="M12 2l2.9 6.6 7.1.6-5.4 4.7 1.6 7L12 17.3 5.8 20.9l1.6-7L2 9.2l7.1-.6z" />
      </svg>
      {name}
    </span>
  );
}
