/**
 * Aufbewahrung: tägliche Sicherungen 30 Tage, dazu je Kalenderwoche die erste Sicherung als Wochensicherung (12 Wochen).
 * Die neueste vollständige Sicherung wird nie gelöscht – egal wie alt.
 */
export type RetentionPolicy = { dailyDays: number; weeklyWeeks: number };

export function retentionPolicy(env = process.env): RetentionPolicy {
  const d = Math.round(Number(env.BACKUP_RETENTION_DAYS));
  const w = env.BACKUP_WEEKLY_WEEKS ? Math.round(Number(env.BACKUP_WEEKLY_WEEKS)) : Number.NaN;
  return { dailyDays: d >= 1 && d <= 3650 ? d : 30, weeklyWeeks: w >= 0 && w <= 520 ? w : 12 };
}

const DAY = 86_400_000;

/** ISO-Kalenderwoche (UTC) als „2026-W42“ */
export function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const year = t.getUTCFullYear();
  const week = Math.ceil(((t.getTime() - Date.UTC(year, 0, 1)) / DAY + 1) / 7);
  return `${year}-W${String(week).padStart(2, "0")}`;
}

export type RetentionItem = { id: string; createdAt: string };
export type RetentionDecision = { keep: Set<string>; weekly: Set<string>; remove: string[] };

export function decideRetention(items: RetentionItem[], now: number, policy: RetentionPolicy): RetentionDecision {
  const sorted = [...items].sort((a, b) => Date.parse(a.createdAt) - Date.parse(b.createdAt));
  const keep = new Set<string>();
  const weekly = new Set<string>();
  const firstOfWeek = new Map<string, string>();
  for (const it of sorted) {
    const w = isoWeek(new Date(it.createdAt));
    if (!firstOfWeek.has(w)) firstOfWeek.set(w, it.id);
  }
  for (const id of firstOfWeek.values()) weekly.add(id);
  for (const it of sorted) {
    const age = now - Date.parse(it.createdAt);
    if (age <= policy.dailyDays * DAY) keep.add(it.id);
    else if (weekly.has(it.id) && age <= policy.weeklyWeeks * 7 * DAY) keep.add(it.id);
  }
  const newest = sorted.at(-1);
  if (newest) keep.add(newest.id);
  return { keep, weekly, remove: sorted.filter((it) => !keep.has(it.id)).map((it) => it.id) };
}
