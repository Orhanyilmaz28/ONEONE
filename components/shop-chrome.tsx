"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

/** Blendet Kopfzeile, Footer & Co. im Dashboard (/admin), auf der Passwort-Seite (/zugang) und im Händlerbereich (/haendler/portal, Login) aus */
export function ShopChrome({ header, footer, extras, children }: { header: ReactNode; footer: ReactNode; extras: ReactNode; children: ReactNode }) {
  const path = usePathname();
  const admin = path?.startsWith("/admin") || path === "/zugang" || path?.startsWith("/haendler/portal") || path === "/haendler/login" || path === "/haendler/aktivieren";
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
