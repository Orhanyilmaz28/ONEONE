/** Platzhalter, während die Produktliste lädt */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Produkte werden geladen" className="animate-pulse" role="status">
      <div className="mb-8">
        <div className="h-8 w-40 rounded-lg bg-ink/10" />
        <div className="mt-3 h-4 w-full max-w-xl rounded bg-ink/5" />
      </div>
      <div className="mb-6 h-20 rounded-2xl bg-sky-50" />
      <div className="mb-5 h-11 w-full max-w-lg rounded-full bg-white" />
      <div className="rounded-3xl border border-line bg-white p-6">
        {Array.from({ length: 6 }, (_, i) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: feste Platzhalter
          <div className="flex items-center gap-4 border-line border-b py-3 last:border-0" key={i}>
            <div className="h-[60px] w-12 rounded-xl bg-cream" />
            <div className="flex-1">
              <div className="h-4 w-48 rounded bg-ink/10" />
              <div className="mt-2 h-3 w-64 max-w-full rounded bg-ink/5" />
            </div>
            <div className="hidden h-5 w-20 rounded-full bg-ink/5 sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}
