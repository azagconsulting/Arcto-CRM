"use client";

import { Card } from "@/components/ui/card";

const stepsGmail = [
  "IMAP in Gmail aktivieren (Einstellungen → Weiterleitung/POP-IMAP).",
  "2FA aktivieren.",
  "App-Passwort erstellen: https://myaccount.google.com/apppasswords → App „Mail“, Gerät „Sonstiges“ (z. B. „Arcto CRM“) → 16-stelliges Passwort kopieren.",
  "IMAP in Arcto: Host imap.gmail.com, Port 993, Verschlüsselung ssl, Benutzer = Gmail-Adresse, Passwort = App-Passwort.",
  "SMTP: Host smtp.gmail.com, Port 465 (ssl) oder 587 (tls), Benutzer = Gmail-Adresse, Passwort = App-Passwort, Absender aus Gmail-Domain.",
  "Bei Warnung „Application-specific password required“ oder „Invalid credentials“: App-Passwort prüfen oder Captcha-Freigabe https://accounts.google.com/DisplayUnlockCaptcha ausführen.",
];

const stepsGmx = [
  "IMAP beim Anbieter aktivieren (falls erforderlich).",
  "IMAP: Host imap.gmx.net, Port 993, SSL. Benutzer = volle Mailadresse, Passwort = Login-Passwort.",
  "SMTP: Host mail.gmx.net, Port 465 (ssl) oder 587 (tls). Absender sollte zur Domain passen, sonst 550-Sender-Fehler.",
];

const errors = [
  {
    title: "AUTHENTICATIONFAILED / Application-specific password required",
    hint: "Bei Gmail immer ein App-Passwort verwenden (siehe oben).",
  },
  {
    title: "550 Sender address is not allowed",
    hint: "Absender-Domain ist beim SMTP-Anbieter nicht erlaubt. Passe Absender an oder verwende die Domain des SMTP-Accounts.",
  },
  {
    title: "Kein „Zugriff verifiziert“",
    hint: "Login-Test beim Speichern schlägt fehl: Host/Port/Passwort prüfen, IMAP aktivieren, ggf. Captcha-Freigabe.",
  },
];

const aiInfo = [
  "OpenAI-Key in „Einstellungen → AI & Search Keys“ hinterlegen.",
  "Ohne Key wird keine Analyse gestartet und kein KI-Badge angezeigt.",
  "Es werden max. die letzten 5 eingehenden Nachrichten pro Tenant analysiert; ältere werden täglich nach 14 Tagen gelöscht.",
];

export default function HelpPage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Support</p>
        <h1 className="text-3xl font-semibold text-white">Hilfecenter</h1>
        <p className="text-sm text-slate-400">
          Kompakte Anleitung für E-Mail-Anbindung, App-Passwörter und KI-Analyse.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Gmail mit App-Passwort" description="So funktioniert IMAP/SMTP mit Google.">
          <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-200">
            {stepsGmail.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </Card>

        <Card title="GMX / Web.de" description="IMAP/SMTP Einstellungen">
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-200">
            {stepsGmx.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
        </Card>

        <Card title="Typische Fehlermeldungen" description="Schnelle Lösungen">
          <ul className="space-y-2 text-sm text-slate-200">
            {errors.map((item) => (
              <li key={item.title}>
                <p className="font-semibold text-white">{item.title}</p>
                <p className="text-slate-300">{item.hint}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card title="KI-Analyse" description="Wann Analysen laufen">
          <ul className="list-disc space-y-2 pl-5 text-sm text-slate-200">
            {aiInfo.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </Card>
      </div>
    </section>
  );
}
