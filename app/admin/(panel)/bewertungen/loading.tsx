/** Platzhalter, solange Bewertungen geladen werden */
export default function Loading() {
  const bar = "animate-pulse rounded-full bg-ink/[0.06]";
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Bewertungen werden geladen …</span>
      <div className={`${bar} h-8 w-48`} />
      <div className={`${bar} mt-3 mb-8 h-4 w-full max-w-md`} />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div className="h-[118px] animate-pulse rounded-3xl border border-line bg-card" key={i} />
        ))}
      </div>
      <div className={`${bar} mb-5 h-10 w-80 max-w-full`} />
      <div className="space-y-4">
        {[0, 1].map((i) => (
          <div className="h-64 animate-pulse rounded-3xl border border-line bg-card" key={i} />
        ))}
      </div>
    </div>
  );
}
