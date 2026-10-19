import type { Metadata } from "next";
import { TwoFactorSetup } from "@/components/admin/two-factor-setup";
import { Badge, Card, Notice, PageHeader, Table, btnDanger, btnSecondary, formatDateTime } from "@/components/admin/ui";
import { currentAdminSession, requireAdmin } from "@/lib/admin-auth";
import { type SecurityEventType, listSecurityEvents } from "@/lib/admin-security/audit";
import { qrSvg } from "@/lib/admin-security/qr";
import { deviceLabel, maskIp } from "@/lib/admin-security/request-info";
import { SESSION_ABSOLUTE, SESSION_IDLE, listSessions } from "@/lib/admin-security/sessions";
import { encryptionConfigured, pendingSetup, twoFactorRequired, twoFactorStatus } from "@/lib/admin-security/two-factor";
import { cancelTwoFactorSetup, confirmTwoFactorSetup, revokeEverySession, revokeOtherSessions, revokeSessionAction } from "./actions";
import { DisableForm, RegenerateForm, StartSetupForm } from "./forms";

export const metadata: Metadata = { title: "Sicherheit" };
export const dynamic = "force-dynamic";

const EVENT_LABEL: Record<SecurityEventType, string> = {
  login_success: "Anmeldung erfolgreich",
  login_failed: "Anmeldung fehlgeschlagen",
  login_password_ok: "Passwort korrekt – 2. Schritt",
  second_factor_failed: "Code falsch",
  recovery_code_used: "Wiederherstellungscode benutzt",
  rate_limited: "Zu viele Versuche – gesperrt",
  twofa_setup_started: "2FA-Einrichtung gestartet",
  twofa_enabled: "2FA aktiviert",
  twofa_disabled: "2FA ausgeschaltet",
  recovery_codes_regenerated: "Neue Wiederherstellungscodes",
  logout: "Abgemeldet",
  session_revoked: "Sitzung beendet",
  sessions_revoked_all: "Sitzungen beendet",
};
const BAD: SecurityEventType[] = ["login_failed", "second_factor_failed", "rate_limited", "twofa_disabled"];

export default async function SecurityPage() {
  await requireAdmin();
  const me = await currentAdminSession();
  const [status, sessions, events, setup] = await Promise.all([twoFactorStatus(), listSessions(), listSecurityEvents(100), me ? pendingSetup(me.id, "Dashboard").catch(() => null) : null]);
  const keyOk = encryptionConfigured();
  const required = twoFactorRequired();
  const sessionSecret = (process.env.SESSION_SECRET ?? "").length >= 32;
  return (
    <>
      <PageHeader description="Zwei-Faktor-Anmeldung, angemeldete Geräte und Sicherheitsprotokoll des Dashboards." title="Sicherheit" />

      <div className="grid gap-6">
        <Card actions={status.enabled ? <Badge tone="green">aktiv</Badge> : <Badge tone="amber">aus</Badge>} title="Zwei-Faktor-Anmeldung (TOTP)">
          <TwoFactorSetup action={confirmTwoFactorSetup} doneHref="/admin/sicherheit" setup={!status.enabled && setup ? { qr: qrSvg(setup.uri), secret: setup.secret } : null}>
            {status.enabled ? (
              <div className="space-y-5 text-[14px]">
                <p>
                  Aktiv seit {status.enabledAt ? formatDateTime(status.enabledAt) : "–"}. Nach dem Passwort fragt das Dashboard nach dem Code aus der
                  Authenticator-App. Noch <b className="font-medium">{status.recoveryLeft}</b> von 10 Wiederherstellungscodes übrig.
                </p>
                {status.recoveryLeft <= 3 ? <Notice title="Nur noch wenige Wiederherstellungscodes">Erzeuge neue Codes und bewahre sie sicher auf.</Notice> : null}
                <RegenerateForm />
                {required ? (
                  <p className="text-muted">Ausschalten ist nicht möglich: Die Zwei-Faktor-Anmeldung ist vorgeschrieben (ADMIN_REQUIRE_2FA).</p>
                ) : (
                  <details className="rounded-2xl border border-line p-4">
                    <summary className="cursor-pointer font-medium">Zwei-Faktor-Anmeldung ausschalten</summary>
                    <p className="mt-2 mb-3 text-muted">Nur mit Passwort und gültigem Code. Alle anderen Sitzungen werden dabei beendet.</p>
                    <DisableForm />
                  </details>
                )}
              </div>
            ) : (
              <div className="space-y-4 text-[14px]">
                <p>
                  Schützt das Dashboard zusätzlich zum Passwort mit einem Code aus einer Authenticator-App. Nach dem Aktivieren werden alle anderen
                  Sitzungen beendet; die Anmeldung braucht dann immer Passwort <b className="font-medium">und</b> Code.
                </p>
                {keyOk ? (
                  <StartSetupForm />
                ) : (
                  <Notice title="ADMIN_2FA_KEY fehlt">
                    Für die verschlüsselte Speicherung des 2FA-Geheimnisses braucht der Shop die Umgebungsvariable <code>ADMIN_2FA_KEY</code> (mindestens 32
                    zufällige Zeichen). Anleitung siehe unten.
                  </Notice>
                )}
              </div>
            )}
          </TwoFactorSetup>
          {!status.enabled && setup ? (
            <form action={cancelTwoFactorSetup} className="mt-4">
              <button className="text-muted text-sm hover:text-ink" type="submit">
                Einrichtung abbrechen
              </button>
            </form>
          ) : null}
        </Card>

        <Card
          actions={
            <span className="flex flex-wrap gap-2">
              <form action={revokeOtherSessions}>
                <button className={btnSecondary} type="submit">
                  Alle anderen beenden
                </button>
              </form>
              <form action={revokeEverySession}>
                <button className={btnDanger} type="submit">
                  Alle beenden
                </button>
              </form>
            </span>
          }
          title={`Angemeldete Geräte (${sessions.length})`}
        >
          <p className="mb-3 text-[13px] text-muted">
            Sitzungen enden nach {SESSION_IDLE / 3600} Stunden ohne Aktivität, spätestens nach {SESSION_ABSOLUTE / 3600} Stunden.
          </p>
          <Table head={["Gerät", "Anmeldung", "Zuletzt aktiv", "IP", ""]}>
            {sessions.map((s) => (
              <tr key={s.id}>
                <td className="py-3 pr-4">
                  {deviceLabel(s.ua)} {s.id === me?.id ? <Badge tone="blue">dieses Gerät</Badge> : null}
                  <span className="block text-[12px] text-muted">{s.method ?? "Passwort"}</span>
                </td>
                <td className="py-3 pr-4">{formatDateTime(s.createdAt)}</td>
                <td className="py-3 pr-4">{formatDateTime(s.lastSeen)}</td>
                <td className="py-3 pr-4 font-mono text-[12px]">{maskIp(s.ip)}</td>
                <td className="py-3 text-right">
                  <form action={revokeSessionAction.bind(null, s.id)}>
                    <button className={btnSecondary} type="submit">
                      Beenden
                    </button>
                  </form>
                </td>
              </tr>
            ))}
          </Table>
        </Card>

        <Card title="Sicherheitsprotokoll (letzte 100 Ereignisse)">
          {events.length === 0 ? (
            <p className="text-[14px] text-muted">Noch keine Ereignisse.</p>
          ) : (
            <Table head={["Zeit", "Ereignis", "Details", "IP", "Gerät"]}>
              {events.map((e, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: Protokoll ohne eigene IDs
                <tr key={i}>
                  <td className="whitespace-nowrap py-2 pr-4">{formatDateTime(e.at)}</td>
                  <td className="py-2 pr-4">{BAD.includes(e.type) ? <Badge tone="red">{EVENT_LABEL[e.type]}</Badge> : EVENT_LABEL[e.type]}</td>
                  <td className="py-2 pr-4 text-muted">{e.detail ?? ""}</td>
                  <td className="py-2 pr-4 font-mono text-[12px]">{e.ip}</td>
                  <td className="py-2 text-muted">{deviceLabel(e.ua)}</td>
                </tr>
              ))}
            </Table>
          )}
        </Card>

        <Card title="Einstellungen in Vercel">
          <ul className="space-y-2 text-[14px]">
            <li>
              <Badge tone={keyOk ? "green" : "amber"}>{keyOk ? "gesetzt" : "fehlt"}</Badge> <code>ADMIN_2FA_KEY</code> – Schlüssel für das verschlüsselte
              2FA-Geheimnis (mind. 32 zufällige Zeichen, z. B. <code>openssl rand -base64 48</code>). Nicht mehr ändern, sobald 2FA aktiv ist.
            </li>
            <li>
              <Badge tone={sessionSecret ? "green" : "amber"}>{sessionSecret ? "gesetzt" : "fehlt"}</Badge> <code>SESSION_SECRET</code> – mind. 32 zufällige
              Zeichen. Damit enden alle Dashboard-Sitzungen automatisch, wenn das Admin-Passwort geändert wird.
            </li>
            <li>
              <Badge tone={required ? "green" : "neutral"}>{required ? "an" : "aus"}</Badge> <code>ADMIN_REQUIRE_2FA=1</code> – erst setzen, wenn die
              Zwei-Faktor-Anmeldung hier eingerichtet und getestet ist. Dann ist ohne zweiten Faktor kein Zugang mehr möglich.
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
