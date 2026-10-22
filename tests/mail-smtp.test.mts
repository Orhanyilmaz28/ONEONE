import assert from "node:assert/strict";
import net from "node:net";
import { after, before, test } from "node:test";

/** Mini-SMTP-Server für den Test: nimmt eine Mail an und merkt sich Anmeldung und Inhalt */
type Received = { auth: string; from: string; to: string[]; data: string };
const received: Received[] = [];
let server: net.Server;
let port = 0;
const PASSWORD = "geheim-123";

before(async () => {
  server = net.createServer((socket) => {
    let mode: "cmd" | "data" = "cmd";
    let cur: Received = { auth: "", from: "", to: [], data: "" };
    let buffer = "";
    socket.write("220 test ESMTP\r\n");
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let i: number;
      while ((i = buffer.indexOf("\r\n")) >= 0) {
        const line = buffer.slice(0, i);
        buffer = buffer.slice(i + 2);
        if (mode === "data") {
          if (line === ".") {
            mode = "cmd";
            received.push(cur);
            cur = { auth: cur.auth, from: "", to: [], data: "" };
            socket.write("250 OK\r\n");
          } else cur.data += `${line}\n`;
          continue;
        }
        const cmd = line.toUpperCase();
        if (cmd.startsWith("EHLO")) socket.write("250-test\r\n250 AUTH PLAIN LOGIN\r\n");
        else if (cmd.startsWith("AUTH PLAIN")) {
          const [, user, pass] = Buffer.from(line.split(" ")[2] ?? "", "base64").toString("utf8").split("\0");
          if (pass === PASSWORD) {
            cur.auth = user;
            socket.write("235 OK\r\n");
          } else socket.write("535 Authentication failed\r\n");
        } else if (cmd.startsWith("MAIL FROM")) {
          cur.from = line;
          socket.write("250 OK\r\n");
        } else if (cmd.startsWith("RCPT TO")) {
          cur.to.push(line);
          socket.write("250 OK\r\n");
        } else if (cmd === "DATA") {
          mode = "data";
          socket.write("354 go\r\n");
        } else if (cmd === "QUIT") {
          socket.end("221 bye\r\n");
        } else socket.write("250 OK\r\n");
      }
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", () => r()));
  port = (server.address() as net.AddressInfo).port;
});

after(() => server.close());

function env(pass: string) {
  delete process.env.BREVO_API_KEY;
  delete process.env.RESEND_API_KEY;
  delete process.env.MAIL_FROM;
  process.env.SMTP_HOST = "127.0.0.1";
  process.env.SMTP_PORT = String(port);
  process.env.SMTP_USER = "hello@exstaseshop.com";
  process.env.SMTP_PASS = `"${pass}"`; // mitkopierte Anführungszeichen werden entfernt
}

test("SMTP: Versand über eigenes Postfach, Absender = SMTP_USER", async () => {
  env(PASSWORD);
  const { mailProvider, mailReady, parseFrom, sendMail } = await import("../lib/mail.ts");
  assert.equal(mailProvider(), "smtp");
  assert.equal(mailReady(), true);
  assert.deepEqual(parseFrom(), { name: "EXSTASE", email: "hello@exstaseshop.com" });
  const res = await sendMail({ to: { email: "kunde@example.com", name: "Kim <Test>" }, subject: "Deine Bestellung", html: "<p>Hallo</p>", text: "Hallo" });
  assert.deepEqual(res, { ok: true, provider: "smtp" });
  const mail = received.at(-1);
  assert.ok(mail);
  assert.equal(mail.auth, "hello@exstaseshop.com");
  assert.match(mail.from, /hello@exstaseshop\.com/);
  assert.match(mail.to.join(), /kunde@example\.com/);
  assert.match(mail.data, /Subject: Deine Bestellung/);
});

test("SMTP: falsches Passwort gibt verständliche Meldung", async () => {
  env("falsch");
  const { sendMail } = await import("../lib/mail.ts");
  const res = await sendMail({ to: { email: "kunde@example.com" }, subject: "x", html: "x", text: "x" });
  assert.equal(res.ok, false);
  assert.match(!res.ok ? res.error : "", /SMTP-Anmeldung abgelehnt/);
});

test("Brevo ohne MAIL_FROM nimmt nicht still das SMTP-Postfach als Absender", async () => {
  env(PASSWORD);
  process.env.BREVO_API_KEY = "xkeysib-test";
  const { mailProvider, mailReady, parseFrom } = await import("../lib/mail.ts");
  assert.equal(mailProvider(), "brevo");
  assert.equal(parseFrom(), null);
  assert.equal(mailReady(), false);
  delete process.env.BREVO_API_KEY;
});

test("SMTP: Rechnung als PDF-Anhang", async () => {
  env(PASSWORD);
  const { sendMail } = await import("../lib/mail.ts");
  const pdf = Buffer.from("%PDF-1.4 Testrechnung");
  const res = await sendMail({ to: { email: "kunde@example.com" }, subject: "Bestellung", html: "<p>x</p>", text: "x", attachments: [{ filename: "Rechnung-RE-2026-00001.pdf", content: pdf, contentType: "application/pdf" }] });
  assert.deepEqual(res, { ok: true, provider: "smtp" });
  const mail = received.at(-1);
  assert.ok(mail);
  assert.match(mail.data, /Content-Type: application\/pdf; name=Rechnung-RE-2026-00001\.pdf/);
  assert.match(mail.data.replace(/\n/g, ""), new RegExp(pdf.toString("base64").replace(/[+/=]/g, ".")));
});
