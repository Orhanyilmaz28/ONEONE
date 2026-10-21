/** Platzhalter, während ein Produkt lädt */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Produkt wird geladen" className="animate-pulse" role="status">
      <div className="mb-4 flex justify-between">
        <div className="h-5 w-28 rounded bg-ink/5" />
        <div className="h-9 w-32 rounded-full bg-ink/5" />
      </div>
      <div className="mb-6 flex items-center gap-4">
        <div className="h-16 w-12 rounded-xl bg-ink/10" />
        <div>
          <div className="h-7 w-56 rounded-lg bg-ink/10" />
          <div className="mt-2 h-4 w-40 rounded bg-ink/5" />
        </div>
      </div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6">
          <div className="h-64 rounded-3xl border border-line bg-card" />
          <div className="h-44 rounded-3xl border border-line bg-card" />
          <div className="h-56 rounded-3xl border border-line bg-card" />
        </div>
        <div className="flex flex-col gap-6">
          <div className="h-56 rounded-3xl border border-line bg-card" />
          <div className="h-40 rounded-3xl border border-line bg-card" />
        </div>
      </div>
    </div>
  );
}
