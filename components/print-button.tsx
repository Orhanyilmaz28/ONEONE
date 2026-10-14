"use client";

/** Druckt die Seite – im Druckdialog „Als PDF speichern“ wählen */
export function PrintButton({ className, label = "Drucken / als PDF speichern" }: { className?: string; label?: string }) {
  return (
    <button className={className} onClick={() => window.print()} type="button">
      {label}
    </button>
  );
}
