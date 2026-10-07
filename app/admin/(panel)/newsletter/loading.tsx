/** Platzhalter, solange die Newsletter-Liste geladen wird */
export default function Loading() {
  const bar = "animate-pulse rounded-full bg-ink/[0.06]";
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Newsletter-Anmeldungen werden geladen …</span>
      <div className={`${bar} h-8 w-44`} />
      <div className={`${bar} mt-3 mb-8 h-4 w-full max-w-md`} />
      <div className="mb-8 grid gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div className="h-[118px] animate-pulse rounded-3xl border border-line bg-card" key={i} />
        ))}
      </div>
      <div className="rounded-3xl border border-line bg-card p-6">
        {[0, 1, 2, 3, 4].map((i) => (
          <div className="flex items-center gap-6 border-line border-b py-4 last:border-0" key={i}>
            <div className={`${bar} h-4 flex-1`} />
            <div className={`${bar} h-4 w-32`} />
            <div className={`${bar} h-8 w-24`} />
          </div>
        ))}
      </div>
    </div>
  );
}
