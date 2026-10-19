/**
 * Datensicherung von der Kommandozeile (gleiche Logik wie Dashboard und Cron).
 *
 *   npm run backup -- create              Sicherung erstellen
 *   npm run backup -- list                Sicherungen auflisten
 *   npm run backup -- verify <id>         Sicherung prüfen (ändert nichts)
 *   npm run backup -- restore-test <id>   in die Testdatenbank (BACKUP_RESTORE_TEST_URL/_TOKEN) wiederherstellen
 *
 * Variablen wie in docs/DATENSICHERUNG.md (z. B. aus .env.local laden: `node --env-file=.env.local …`).
 * Eine Wiederherstellung in die Produktivdatenbank ist hier ebenfalls gesperrt.
 */
import { restoreToTest } from "../lib/backup/restore";
import { defaultDeps, listBackups, runBackup, verifyBackup } from "../lib/backup/service";

const [cmd, id] = process.argv.slice(2);
const deps = defaultDeps();

async function main() {
  if (cmd === "create") {
    const r = await runBackup(deps, "cli");
    console.log(r.ok ? `OK ${r.meta.id} · ${r.meta.entries} Einträge · ${r.meta.size} Byte · gelöscht: ${r.removed.length}` : `FEHLER ${r.error}`);
    return r.ok ? 0 : 1;
  }
  if (!deps.storage) {
    console.log("FEHLER Kein Speicher für Sicherungen eingerichtet (BACKUP_S3_* oder lokal BACKUP_LOCAL_DIR).");
    return 1;
  }
  if (cmd === "list") {
    for (const b of await listBackups(deps.storage)) console.log(`${b.id}  ${b.status.padEnd(10)} ${b.weekly ? "Woche" : "Tag  "}  ${String(b.size).padStart(10)} Byte  ${b.meta?.entries ?? "-"} Einträge${b.problem ? `  (${b.problem})` : ""}`);
    return 0;
  }
  if ((cmd === "verify" || cmd === "restore-test") && id) {
    const r = cmd === "verify" ? await verifyBackup(deps.storage, id) : await restoreToTest(deps, id);
    for (const s of r.steps) console.log(`${s.ok ? "✓" : "✕"} ${s.label}${s.detail ? ` – ${s.detail}` : ""}`);
    console.log(r.ok ? "OK" : "FEHLER");
    return r.ok ? 0 : 1;
  }
  console.log("Aufruf: npm run backup -- create | list | verify <id> | restore-test <id>");
  return 2;
}

main().then((code) => process.exit(code));
