"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Blendet Kopfzeile, Footer & Co. im Dashboard (/admin) und auf der Passwort-Seite (/zugang) aus */
export function ShopChrome({ header, footer, extras, children }: { header: ReactNode; footer: ReactNode; extras: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const admin = path?.startsWith("/admin") || path === "/zugang";
  if (admin) return <>{children}</>;
  return (
    <>
      {header}
      <main className="min-h-[60vh]" id="inhalt">
        {children}
      </main>
      {footer}
      {extras}
    </>
  );
}
