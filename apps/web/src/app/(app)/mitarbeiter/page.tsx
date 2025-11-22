"use client";

import { AlertTriangle, Loader2, UserPlus } from "lucide-react";
import { clsx } from "clsx";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { AuthUser, CreateEmployeeResponse, UserRole } from "@/lib/types";

const roleOptions: Array<{ label: string; value: UserRole; hint: string }> = [
  { label: "Admin", value: "ADMIN", hint: "Voller Zugriff, Einstellungen & Rollen" },
  { label: "Coordinator", value: "COORDINATOR", hint: "Standardrolle für CS Ops" },
  { label: "Agent", value: "AGENT", hint: "Bearbeitet Kunden & Leads" },
  { label: "Viewer", value: "VIEWER", hint: "Nur Lesezugriff" },
];

type InviteFormState = {
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
  password: string;
  note: string;
};

const initialInviteForm: InviteFormState = {
  firstName: "",
  lastName: "",
  email: "",
  role: "COORDINATOR",
  password: "",
  note: "",
};

export default function MitarbeiterPage() {
  const { authorizedRequest } = useAuth();
  const [employees, setEmployees] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [inviteForm, setInviteForm] = useState(initialInviteForm);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    async function fetchEmployees() {
      try {
        const data = await authorizedRequest<AuthUser[]>("/users", {
          signal: controller.signal,
        });
        setEmployees(data);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "Mitarbeiter konnten nicht geladen werden.");
      } finally {
        setLoading(false);
      }
    }

    void fetchEmployees();
    return () => controller.abort();
  }, [authorizedRequest]);

  const sortedEmployees = useMemo(() => {
    return [...employees].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [employees]);

  const handleInviteChange = (value: Partial<InviteFormState>) => {
    setInviteForm((current) => ({ ...current, ...value }));
  };

  const handleInviteSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setInviteLoading(true);
    setInviteNotice(null);
    setGeneratedPassword(null);
    try {
      const payload = {
        firstName: inviteForm.firstName.trim() || undefined,
        lastName: inviteForm.lastName.trim() || undefined,
        email: inviteForm.email.trim().toLowerCase(),
        role: inviteForm.role,
        password: inviteForm.password.trim() || undefined,
      };

      const response = await authorizedRequest<CreateEmployeeResponse>("/users", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setEmployees((current) => [response.user, ...current]);
      setInviteNotice({ type: "success", text: "Mitarbeiter erstellt. Zugangsdaten teilen und willkommen heißen!" });
      const fallbackPassword = inviteForm.password.trim() || null;
      setGeneratedPassword(response.temporaryPassword ?? fallbackPassword);
      setInviteForm(initialInviteForm);
    } catch (err) {
      setInviteNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Einladung konnte nicht gespeichert werden.",
      });
    } finally {
      setInviteLoading(false);
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Team</p>
          <h1 className="text-3xl font-semibold text-white">Mitarbeiter einladen</h1>
          <p className="text-sm text-slate-400">Neue Kolleg:innen hinzufügen und Zugänge verwalten.</p>
        </div>
        <Button size="sm" form="invite-form" type="submit" disabled={inviteLoading}>
          <UserPlus className="h-4 w-4" /> Einladung senden
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[420px,1fr]">
        <Card
          title="Mitarbeiter einladen"
          description="Neuer Zugang für Kolleg:innen. Passwort automatisch generieren oder selbst definieren."
        >
          <form id="invite-form" className="space-y-4" onSubmit={handleInviteSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">
                Vorname
                <Input
                  className="mt-2"
                  value={inviteForm.firstName}
                  onChange={(event) => handleInviteChange({ firstName: event.target.value })}
                  placeholder="Mara"
                />
              </label>
              <label className="text-sm text-slate-300">
                Nachname
                <Input
                  className="mt-2"
                  value={inviteForm.lastName}
                  onChange={(event) => handleInviteChange({ lastName: event.target.value })}
                  placeholder="Schneider"
                />
              </label>
            </div>
            <label className="text-sm text-slate-300">
              E-Mail
              <Input
                type="email"
                className="mt-2"
                value={inviteForm.email}
                onChange={(event) => handleInviteChange({ email: event.target.value })}
                placeholder="mara@arcto.app"
                required
              />
            </label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">
                Rolle
                <select
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                  value={inviteForm.role}
                  onChange={(event) => handleInviteChange({ role: event.target.value as UserRole })}
                >
                  {roleOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-xs text-slate-500">
                  {roleOptions.find((role) => role.value === inviteForm.role)?.hint}
                </p>
              </label>
              <label className="text-sm text-slate-300">
                Passwort (optional)
                <Input
                  type="password"
                  className="mt-2"
                  value={inviteForm.password}
                  onChange={(event) => handleInviteChange({ password: event.target.value })}
                  placeholder="leer lassen für Autogenerierung"
                />
              </label>
            </div>
            <label className="text-sm text-slate-300">
              Notiz / Verantwortliche Person
              <Textarea
                rows={3}
                className="mt-2"
                value={inviteForm.note}
                onChange={(event) => handleInviteChange({ note: event.target.value })}
                placeholder="z. B. Team, Projekte oder erstes Onboarding-Ziel"
              />
            </label>
            {inviteNotice && (
              <p className={clsx("text-xs", inviteNotice.type === "success" ? "text-emerald-300" : "text-rose-300")}>
                {inviteNotice.text}
              </p>
            )}
            {generatedPassword && (
              <p className="text-xs text-sky-300">
                Temporäres Passwort: <span className="font-mono">{generatedPassword}</span>
              </p>
            )}
          </form>
        </Card>

        <Card
          title="Zugänge & Aktivitäten"
          description="Wer nutzt das CRM? Alle Accounts transparent in einer Liste."
          action={
            loading ? (
              <Loader2 className="h-4 w-4 animate-spin text-slate-300" />
            ) : (
              <span className="text-xs text-slate-400">{employees.length} Einträge</span>
            )
          }
        >
          {error && (
            <p className="mb-3 text-xs text-rose-300">
              <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />
              {error}
            </p>
          )}
          <div className="space-y-4">
            {loading && (
              <p className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Mitarbeiter werden geladen...
              </p>
            )}
            {!loading && sortedEmployees.length === 0 && (
              <p className="text-sm text-slate-400">Noch keine Zugänge vorhanden.</p>
            )}
            {sortedEmployees.map((employee) => (
              <div
                key={employee.id}
                className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-white">
                      {employee.firstName
                        ? `${employee.firstName} ${employee.lastName ?? ""}`.trim()
                        : employee.email}
                    </p>
                    <p className="text-xs text-slate-400">{employee.email}</p>
                  </div>
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/80">
                    {employee.role.toLowerCase()}
                  </span>
                </div>
                <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                  <p>
                    <span className="text-slate-500">Login zuletzt:</span>{" "}
                    {employee.lastLoginAt
                      ? new Date(employee.lastLoginAt).toLocaleString("de-DE")
                      : "Noch nie"}
                  </p>
                  <p>
                    <span className="text-slate-500">Profil erstellt:</span>{" "}
                    {new Date(employee.createdAt).toLocaleDateString("de-DE")}
                  </p>
                  <p>
                    <span className="text-slate-500">Fokus:</span>{" "}
                    {employee.headline || employee.jobTitle || "Team Mitglied"}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
