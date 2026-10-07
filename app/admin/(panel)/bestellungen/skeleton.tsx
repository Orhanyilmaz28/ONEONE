/** Platzhalter, solange Bestellungen von Stripe geladen werden */
export function OrdersSkeleton({ variant }: { variant: "list" | "detail" }) {
  const bar = "animate-pulse rounded-full bg-ink/[0.06]";
  return (
    <div aria-busy="true" aria-live="polite">
      <span className="sr-only">Bestellungen werden geladen …</span>
      <div className={`${bar} h-8 w-56`} />
      <div className={`${bar} mt-3 mb-8 h-4 w-full max-w-md`} />
      {variant === "list" ? (
        <div className="rounded-3xl border border-line bg-white p-6">
          {Array.from({ length: 6 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: reine Platzhalter
            <div className="flex items-center gap-6 border-line border-b py-4 last:border-0" key={i}>
              <div className={`${bar} h-4 w-24`} />
              <div className={`${bar} hidden h-4 w-32 sm:block`} />
              <div className={`${bar} h-4 flex-1`} />
              <div className={`${bar} h-5 w-20`} />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <div className="space-y-6">
            <div className="h-64 animate-pulse rounded-3xl border border-line bg-white" />
            <div className="h-80 animate-pulse rounded-3xl border border-line bg-white" />
          </div>
          <div className="space-y-6">
            <div className="h-36 animate-pulse rounded-3xl border border-line bg-white" />
            <div className="h-44 animate-pulse rounded-3xl border border-line bg-white" />
          </div>
        </div>
      )}
    </div>
  );
}
