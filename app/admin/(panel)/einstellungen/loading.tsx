/** Platzhalter, während die Einstellungen laden */
export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Einstellungen werden geladen" className="animate-pulse" role="status">
      <div className="mb-8">
        <div className="h-8 w-48 rounded-lg bg-ink/10" />
        <div className="mt-3 h-4 w-full max-w-xl rounded bg-ink/5" />
      </div>
      <div className="mb-6 flex gap-2">
        {[28, 20, 32].map((w) => (
          <div className="h-9 rounded-full bg-white" key={w} style={{ width: `${w * 4}px` }} />
        ))}
      </div>
      {[10, 4, 2].map((fields) => (
        <div className="mb-6 rounded-3xl border border-line bg-white" key={fields}>
          <div className="border-line border-b px-6 py-4">
            <div className="h-4 w-44 rounded bg-ink/10" />
          </div>
          <div className="grid gap-5 p-6 sm:grid-cols-2">
            {Array.from({ length: fields }, (_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: feste Platzhalter
              <div key={i}>
                <div className="mb-2 h-3 w-28 rounded bg-ink/10" />
                <div className="h-11 rounded-xl bg-cream" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
