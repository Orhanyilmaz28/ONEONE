"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import { CloseIcon } from "./icons";
import type { ProductSpec } from "@/lib/product-specs";

/** Pop-up im Händlerbereich (natives <dialog>: Esc schließt, Fokus bleibt im Fenster) */
export function Sheet({ title, actions, children, onClose, tall }: { title: string; actions?: ReactNode; children: ReactNode; onClose: () => void; tall?: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    d?.showModal();
    const before = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = before;
      d?.close();
    };
  }, []);
  return (
    <dialog
      aria-label={title}
      className={`anim-rise m-auto hidden max-h-[92dvh] w-[min(64rem,94vw)] max-w-none flex-col overflow-hidden rounded-[1.5rem] border border-line bg-paper p-0 text-ink shadow-2xl open:flex backdrop:bg-black/70 backdrop:backdrop-blur-sm ${tall ? "h-[92dvh]" : ""}`}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      // Klick auf den abgedunkelten Hintergrund schließt
      onClick={(e) => e.target === e.currentTarget && onClose()}
      ref={ref}
      style={{ animationDuration: "0.35s" }}
    >
      <header className="flex flex-wrap items-center gap-2 border-line border-b px-4 py-3 sm:px-6">
        <p className="mr-auto min-w-0 truncate font-bold">{title}</p>
        {actions}
        <button aria-label="Schließen" className="rounded-full p-2 transition hover:bg-card" onClick={onClose} type="button">
          <CloseIcon />
        </button>
      </header>
      {children}
    </dialog>
  );
}

const pill = "inline-flex h-9 items-center rounded-full border border-line px-3.5 text-sm transition hover:border-accent hover:text-accent";

/** Handy oder Browser ohne eingebauten PDF-Viewer: PDF direkt öffnen statt im Pop-up */
const openDirectly = () => window.matchMedia("(max-width: 767px), (pointer: coarse)").matches || navigator.pdfViewerEnabled === false;

/** Link auf ein PDF: am Computer als Pop-up mit Schließen-Knopf, auf dem Handy direkt im neuen Tab */
export function PdfLink({ href, title, className, children }: { href: string; title: string; className?: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <a
        className={className}
        href={href}
        onClick={(e) => {
          if (e.metaKey || e.ctrlKey || e.shiftKey || openDirectly()) return;
          e.preventDefault();
          setOpen(true);
        }}
        rel="noopener"
        target="_blank"
      >
        {children}
      </a>
      {open ? (
        <Sheet
          actions={
            <>
              <a className={pill} href={href} rel="noopener" target="_blank">
                Neues Fenster
              </a>
              <a className={pill} download href={`${href}?download=1`}>
                Herunterladen
              </a>
            </>
          }
          onClose={() => setOpen(false)}
          tall
          title={title}
        >
          <iframe className="min-h-0 w-full flex-1 bg-white" src={href} title={title} />
        </Sheet>
      ) : null}
    </>
  );
}

/** Datenblatt eines Artikels (Stammdaten aus dem Pass + Zutaten & Nährwerte) */
export function ProductDataButton({ title, spec, material, passHref, className }: { title: string; spec?: ProductSpec; material?: string; passHref?: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const rows: [string, string | undefined][] = spec
    ? [
        ["Art.-Nr.", spec.artNr],
        ["EAN (Einzelstück)", spec.gtin],
        ["Bezeichnung", spec.bezeichnung],
        ["Gebinde", spec.gebinde],
        ["Tray", spec.tray],
        ["Palette", spec.palette],
        ["MHD", spec.mhd],
        ["Lagerung", spec.lagerung],
        ["Vegan", spec.vegan ? "Ja" : undefined],
      ]
    : [];
  return (
    <>
      <button className={className} onClick={() => setOpen(true)} type="button">
        Daten
      </button>
      {open ? (
        <Sheet
          actions={
            passHref ? (
              <PdfLink className={pill} href={passHref} title={`Artikelpass ${title}`}>
                Artikelpass
              </PdfLink>
            ) : null
          }
          onClose={() => setOpen(false)}
          title={`Datenblatt ${title}`}
        >
          <div className="overflow-y-auto px-4 py-5 sm:px-6">
            {rows.length ? (
              <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-[11rem_1fr]">
                {rows
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div className="contents" key={k}>
                      <dt className="text-muted">{k}</dt>
                      <dd className="mb-2 font-medium tabular-nums sm:mb-0">{v}</dd>
                    </div>
                  ))}
              </dl>
            ) : (
              <p className="text-muted text-sm">Für diesen Artikel liegt noch kein Artikelpass vor – die Stammdaten folgen.</p>
            )}
            {material ? (
              <>
                <h3 className="mt-6 mb-2 font-bold">Zutaten &amp; Nährwerte</h3>
                <p className="whitespace-pre-line text-muted text-sm">{material}</p>
              </>
            ) : null}
          </div>
        </Sheet>
      ) : null}
    </>
  );
}
