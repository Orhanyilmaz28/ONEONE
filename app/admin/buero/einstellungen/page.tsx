import type { Metadata } from "next";
import { Badge, Card, Notice, PageHeader, btn, btnDanger, btnSecondary, formatDateTime, input, label } from "@/components/admin/ui";
import { requireOffice } from "@/lib/admin-auth";
import { OFFICE_ROLES, ROLE_LABEL, ROLE_TEXT, type Role, can } from "@/lib/office/roles";
import { MIN_PASSWORD, type PublicUser, listUsers, publicUser } from "@/lib/office/users";
import { type SearchParams, paramsOf } from "../shared";
import { changeUserAction, createUserAction } from "./actions";

export const metadata: Metadata = { title: "Einstellungen · Büro" };
export const dynamic = "force-dynamic";

const ROLES: Role[] = ["admin", "buero", "lesen"];
const RIGHTS: [string, Record<Role, boolean>][] = [
  ["Büro-Übersicht und Bestellungen ansehen", { admin: true, buero: true, lesen: true }],
  ["Excel-Exporte erstellen", { admin: true, buero: true, lesen: false }],
  ["Büro-Zugänge verwalten", { admin: true, buero: false, lesen: false }],
  ["Restliches Dashboard (Produkte, Preise, Einstellungen, Sicherheit …)", { admin: true, buero: false, lesen: false }],
];

export default async function OfficeSettingsPage({ searchParams }: { searchParams: SearchParams }) {
  const me = await requireOffice();
  const p = await paramsOf(searchParams);
  const manage = can(me.role, "office.users");
  let users: PublicUser[] = [];
  let loadError = false;
  if (manage) {
    try {
      users = (await listUsers()).map(publicUser);
    } catch {
      loadError = true;
    }
  }

  return (
    <>
      <PageHeader description="Rollen und Zugänge der Büroverwaltung. Alle Rechte werden auf dem Server geprüft." title="Einstellungen" />

      <Card className="mb-6" title="Dein Zugang">
        <p className="text-[15px]">
          <b className="font-medium">{me.name}</b> · {ROLE_LABEL[me.role]}
        </p>
        <p className="mt-1 text-[14px] text-muted">{ROLE_TEXT[me.role]}</p>
      </Card>

      <Card className="mb-6" padded={false} title="Rollen">
        <div className="overflow-x-auto px-6 py-4">
          <table className="w-full min-w-[520px] text-left text-[14px]">
            <thead>
              <tr className="text-[12px] text-muted uppercase tracking-[0.08em]">
                <th className="py-2 pr-4 font-medium">Recht</th>
                {ROLES.map((r) => (
                  <th className="py-2 pr-4 font-medium" key={r}>
                    {ROLE_LABEL[r]}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {RIGHTS.map(([text, row]) => (
                <tr key={text}>
                  <td className="py-2 pr-4">{text}</td>
                  {ROLES.map((r) => (
                    <td className="py-2 pr-4" key={r}>
                      {row[r] ? "✓" : "–"}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {manage ? (
        <section id="zugaenge">
          <h2 className="mb-3 font-medium text-[17px]">Büro-Zugänge</h2>
          {p.ok ? (
            <div className="mb-4">
              <Notice title="Gespeichert" tone="green">
                {p.ok.slice(0, 300)}
              </Notice>
            </div>
          ) : null}
          {p.fehler ? (
            <div className="mb-4">
              <Notice title="Nicht gespeichert" tone="red">
                {p.fehler.slice(0, 300)}
              </Notice>
            </div>
          ) : null}
          {loadError ? (
            <Notice title="Zugänge konnten nicht geladen werden" tone="red">
              Der Datenspeicher ist gerade nicht erreichbar.
            </Notice>
          ) : (
            <>
              <div className="mb-6 space-y-3">
                {users.length === 0 ? <p className="text-[14px] text-muted">Noch keine Büro-Zugänge angelegt.</p> : null}
                {users.map((u) => (
                  <Card key={u.id}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">
                          {u.name} <span className="font-normal text-muted">· {u.username}</span>
                        </p>
                        <p className="mt-1 flex flex-wrap gap-1.5">
                          <Badge tone="blue">{ROLE_LABEL[u.role]}</Badge>
                          {u.active ? <Badge tone="green">aktiv</Badge> : <Badge tone="red">gesperrt</Badge>}
                          {u.twoFactor ? <Badge>2FA eingerichtet · {u.recoveryLeft} Codes übrig</Badge> : <Badge tone="amber">2FA noch nicht eingerichtet</Badge>}
                        </p>
                        <p className="mt-1 text-[12px] text-muted">
                          angelegt {formatDateTime(u.createdAt)}
                          {u.lastLoginAt ? ` · zuletzt angemeldet ${formatDateTime(u.lastLoginAt)}` : " · noch nie angemeldet"}
                        </p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 lg:grid-cols-2">
                      <form action={changeUserAction} className="flex gap-2">
                        <input name="id" type="hidden" value={u.id} />
                        <input name="op" type="hidden" value="role" />
                        <select aria-label="Rolle" className={input} defaultValue={u.role} name="role">
                          {OFFICE_ROLES.map((r) => (
                            <option key={r} value={r}>
                              {ROLE_LABEL[r]}
                            </option>
                          ))}
                        </select>
                        <button className={`${btnSecondary} shrink-0`} type="submit">
                          Rolle speichern
                        </button>
                      </form>
                      <form action={changeUserAction} className="flex gap-2">
                        <input name="id" type="hidden" value={u.id} />
                        <input name="op" type="hidden" value="password" />
                        <input aria-label="Neues Passwort" autoComplete="new-password" className={input} minLength={MIN_PASSWORD} name="password" placeholder={`Neues Passwort (mind. ${MIN_PASSWORD} Zeichen)`} required type="password" />
                        <button className={`${btnSecondary} shrink-0`} type="submit">
                          Setzen
                        </button>
                      </form>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                      <form action={changeUserAction}>
                        <input name="id" type="hidden" value={u.id} />
                        <input name="op" type="hidden" value={u.active ? "lock" : "unlock"} />
                        <button className={btnSecondary} type="submit">
                          {u.active ? "Sperren" : "Entsperren"}
                        </button>
                      </form>
                      {u.twoFactor ? (
                        <form action={changeUserAction}>
                          <input name="id" type="hidden" value={u.id} />
                          <input name="op" type="hidden" value="reset2fa" />
                          <button className={btnSecondary} type="submit">
                            2FA zurücksetzen
                          </button>
                        </form>
                      ) : null}
                      <form action={changeUserAction} className="flex items-center gap-2">
                        <input name="id" type="hidden" value={u.id} />
                        <input name="op" type="hidden" value="delete" />
                        <label className="flex items-center gap-1.5 text-[13px] text-muted">
                          <input name="confirm" required type="checkbox" value="ja" /> wirklich löschen
                        </label>
                        <button className={btnDanger} type="submit">
                          Löschen
                        </button>
                      </form>
                    </div>
                  </Card>
                ))}
              </div>

              <Card title="Neuen Büro-Zugang anlegen">
                <form action={createUserAction} className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className={label} htmlFor="n-name">
                      Name
                    </label>
                    <input className={input} id="n-name" maxLength={80} name="name" required />
                  </div>
                  <div>
                    <label className={label} htmlFor="n-user">
                      Benutzername
                    </label>
                    <input autoCapitalize="none" autoComplete="off" className={input} id="n-user" maxLength={32} name="username" pattern="[a-z0-9][a-z0-9._\-]{2,31}" placeholder="z. B. anna.buero" required spellCheck={false} />
                  </div>
                  <div>
                    <label className={label} htmlFor="n-role">
                      Rolle
                    </label>
                    <select className={input} defaultValue="buero" id="n-role" name="role">
                      {OFFICE_ROLES.map((r) => (
                        <option key={r} value={r}>
                          {ROLE_LABEL[r]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={label} htmlFor="n-pw">
                      Erstes Passwort (mind. {MIN_PASSWORD} Zeichen)
                    </label>
                    <input autoComplete="new-password" className={input} id="n-pw" minLength={MIN_PASSWORD} name="password" required type="password" />
                  </div>
                  <div className="sm:col-span-2">
                    <p className="mb-3 text-[13px] text-muted">
                      Anmeldung unter /admin/login mit Benutzername + Passwort. Beim ersten Mal richtet die Person die Zwei-Faktor-Anmeldung (Authenticator-App) ein. Dafür muss ADMIN_2FA_KEY in Vercel gesetzt sein.
                    </p>
                    <button className={btn} type="submit">
                      Zugang anlegen
                    </button>
                  </div>
                </form>
              </Card>
            </>
          )}
        </section>
      ) : null}
    </>
  );
}
