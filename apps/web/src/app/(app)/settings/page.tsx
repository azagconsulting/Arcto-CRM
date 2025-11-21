"use client";

import { FormEvent, useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { OPENAI_KEY_STORAGE } from "@/lib/constants";

const notificationOptions = [
  { label: "Wichtige Aktivitäten", description: "Deals, die in den roten Bereich laufen" },
  { label: "Team-Updates", description: "Statusmeldungen aus Workspaces" },
  { label: "Designänderungen", description: "Änderungen am Dark/Light Theme" },
];

export default function SettingsPage() {
  const [status, setStatus] = useState("Zuletzt gespeichert: gerade eben");
  const [openAiKey, setOpenAiKey] = useState("");
  const [openAiStatus, setOpenAiStatus] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }
    const storedKey = window.localStorage.getItem(OPENAI_KEY_STORAGE) ?? '';
    const id = window.requestAnimationFrame(() => setOpenAiKey(storedKey));
    return () => window.cancelAnimationFrame(id);
  }, []);


  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("Änderungen gespeichert – Backend folgt, sobald Prisma-Schema erweitert ist");
  };

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Workspace</p>
        <h1 className="text-3xl font-semibold text-white">Einstellungen</h1>
        <p className="text-sm text-slate-400">Design und Settings bleiben erhalten – nur die Colio-Features wurden zurückgesetzt.</p>
      </div>
      <p className="text-xs text-slate-500">{status}</p>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Profil" description="Basisinformationen für künftige CRM-Aktionen.">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm text-slate-300">
              Vor- und Nachname
              <input
                defaultValue="Mara Schneider"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                placeholder="Dein Name"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Rolle
              <input
                defaultValue="Owner"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                placeholder="Teamrolle"
              />
            </label>
            <label className="block text-sm text-slate-300">
              E-Mail
              <input
                type="email"
                defaultValue="mara@arcto.app"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
            </label>
            <Button size="sm" type="submit" className="w-full sm:w-auto">
              Speichern
            </Button>
          </form>
        </Card>

        <Card title="Arbeitsbereich" description="Branding, Regionen & technische Grundlagen.">
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block text-sm text-slate-300">
              Workspace-Name
              <input
                defaultValue="Arcto"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
            </label>
            <label className="block text-sm text-slate-300">
              Branche
              <input
                defaultValue="CRM"
                className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              />
            </label>
            <div>
              <p className="text-sm text-slate-300">Designmodus</p>
              <p className="text-xs text-slate-500">Dark- und Light-Mode bleiben aktiv, gesteuert über die Leiste oben.</p>
            </div>
            <Button size="sm" variant="secondary" type="submit" className="w-full sm:w-auto">
              Änderungen merken
            </Button>
          </form>
        </Card>
      </div>

      <Card title="OpenAI Automation" description="Speichere deinen API-Schlüssel, um den Social Generator nutzen zu können.">
        <form
          className="space-y-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (typeof window === 'undefined') {
              return;
            }
            window.localStorage.setItem(OPENAI_KEY_STORAGE, openAiKey.trim());
            setOpenAiStatus('OpenAI-Key gespeichert. Du kannst den Generator jetzt nutzen.');
          }}
        >
          <label className="block text-sm text-slate-300">
            Persönlicher OpenAI API-Key
            <input
              type="password"
              value={openAiKey}
              onChange={(event) => setOpenAiKey(event.target.value)}
              className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
              placeholder="sk-..."
            />
          </label>
          <div className="flex flex-wrap gap-3">
            <Button size="sm" type="submit">Key speichern</Button>
            <Button
              size="sm"
              type="button"
              variant="secondary"
              onClick={() => {
                if (typeof window === 'undefined') {
                  return;
                }
                window.localStorage.removeItem(OPENAI_KEY_STORAGE);
                setOpenAiKey('');
                setOpenAiStatus('OpenAI-Key entfernt.');
              }}
            >
              Key entfernen
            </Button>
          </div>
          {openAiStatus && <p className="text-xs text-slate-400">{openAiStatus}</p>}
        </form>
      </Card>

      <Card title="Benachrichtigungen" description="Definiere, welche Updates Prisma später ausliefert.">
        <form className="space-y-4" onSubmit={handleSubmit}>
          {notificationOptions.map((option) => (
            <label key={option.label} className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/5/40 p-4">
              <input type="checkbox" defaultChecked className="mt-1 h-4 w-4 accent-sky-400" />
              <span>
                <p className="text-sm font-medium text-white">{option.label}</p>
                <p className="text-xs text-slate-400">{option.description}</p>
              </span>
            </label>
          ))}
          <Button size="sm" type="submit">
            Einstellungen sichern
          </Button>
        </form>
      </Card>
    </section>
  );
}
