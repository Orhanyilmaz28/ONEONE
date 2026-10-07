/** Sterne-Anzeige mit Bruchteilen (z. B. 4,6). */
export function Stars({ value, className = "size-4", label }: { value: number; className?: string; label?: string }) {
  const text = label ?? `${value.toLocaleString("de-DE", { maximumFractionDigits: 1 })} von 5 Sternen`;
  return (
    <span aria-label={text} className="inline-flex items-center gap-0.5" role="img">
      {[0, 1, 2, 3, 4].map((i) => {
        const fill = Math.max(0, Math.min(1, value - i));
        return (
          <span className={`relative inline-block ${className}`} key={i}>
            <svg aria-hidden className="absolute inset-0 size-full text-ink/15" viewBox="0 0 20 20">
              <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L1.3 7.8l6.1-.7L10 1.5Z" fill="currentColor" />
            </svg>
            <span className="absolute inset-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
              <svg aria-hidden className="size-full text-[#f5a524]" style={{ width: `${100 / Math.max(fill, 0.0001)}%`, maxWidth: "none" }} viewBox="0 0 20 20">
                <path d="M10 1.5l2.6 5.6 6.1.7-4.5 4.2 1.2 6-5.4-3-5.4 3 1.2-6L1.3 7.8l6.1-.7L10 1.5Z" fill="currentColor" />
              </svg>
            </span>
          </span>
        );
      })}
    </span>
  );
}

export function formatAverage(n: number) {
  return n.toLocaleString("de-DE", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}
