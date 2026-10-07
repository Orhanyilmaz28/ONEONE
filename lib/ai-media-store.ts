import { type AiMediaType, type AiOverrides, isAiMediaType } from "./ai-media";
import { KEYS, getJSON, updateJSON } from "./store";

/** KI-Auswahl aus dem Dashboard (Übersicht „KI-Kennzeichnung“) */
export async function getAiOverrides(): Promise<AiOverrides> {
  const raw = await getJSON<Record<string, unknown>>(KEYS.aiMedia, {});
  return Object.fromEntries(Object.entries(raw).filter((e): e is [string, AiMediaType] => isAiMediaType(e[1])));
}

export async function setAiOverride(key: string, type: AiMediaType) {
  return updateJSON<AiOverrides>(KEYS.aiMedia, {}, (all) => ({ ...all, [key]: type }));
}

/** Auswahl für diese Medien entfernen (dann gilt wieder die Angabe am Medium) */
export async function clearAiOverrides(keys: string[]) {
  if (!keys.length) return;
  await updateJSON<AiOverrides>(KEYS.aiMedia, {}, (all) => {
    if (!keys.some((k) => k in all)) return all;
    const next = { ...all };
    for (const k of keys) delete next[k];
    return next;
  });
}
