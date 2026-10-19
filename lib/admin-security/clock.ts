/** Uhr für die Sicherheitslogik – in Tests austauschbar */
const g = globalThis as unknown as { __ttNow?: () => number };

export const now = () => (g.__ttNow ? g.__ttNow() : Date.now());

export function setClock(fn: (() => number) | undefined) {
  g.__ttNow = fn;
}
