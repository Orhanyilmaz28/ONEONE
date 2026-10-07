/** Platzhalter, während ein Produkt lädt */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Produkt wird geladen" className="animate-pulse" role="status">
      <div className="mb-4 h-5 w-28 rounded bg-ink/5" />
      <div className="mb-8">
        <div className="h-8 w-56 rounded-lg bg-ink/10" />
        <div className="mt-3 h-4 w-full max-w-xl rounded bg-ink/5" />
      </div>
      <div className="grid grid-cols-1 items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col gap-6 xl:col-start-2 xl:row-start-1">
          <div className="h-48 rounded-3xl border border-line bg-white" />
          <div className="h-56 rounded-3xl border border-line bg-white" />
        </div>
        <div className="rounded-3xl border border-line bg-white p-6 xl:col-start-1 xl:row-start-1">
          <div className="h-36 rounded-2xl bg-paper" />
          {Array.from({ length: 5 }, (_, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: feste Platzhalter
            <div className="flex items-center gap-4 border-line border-b py-4 last:border-0" key={i}>
              <div className="h-4 flex-1 rounded bg-ink/10" />
              <div className="h-10 w-32 rounded-xl bg-ink/5" />
              <div className="h-10 w-32 rounded-xl bg-ink/5" />
              <div className="h-5 w-9 rounded-full bg-ink/10" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
