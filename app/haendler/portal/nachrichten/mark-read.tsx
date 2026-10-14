"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { markReadAction } from "./actions";

/** Beim Öffnen der Seite ungelesene Nachrichten als gelesen markieren (Zähler im Menü aktualisiert sich danach) */
export function MarkRead({ ids }: { ids: string[] }) {
  const router = useRouter();
  useEffect(() => {
    if (!ids.length) return;
    const t = window.setTimeout(() => markReadAction(ids).then(() => router.refresh()).catch(() => undefined), 1200);
    return () => window.clearTimeout(t);
  }, [ids, router]);
  return null;
}
