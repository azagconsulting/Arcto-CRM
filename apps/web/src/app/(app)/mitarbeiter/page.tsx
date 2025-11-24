"use client";

import { AlertTriangle, Edit, Loader2, Trash2, UserPlus, X } from "lucide-react";
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

// --- Invite Modal ---
type InviteFormState = { firstName: string; lastName: string; email: string; role: UserRole; password: string; };
const initialInviteForm: InviteFormState = { firstName: "", lastName: "", email: "", role: "COORDINATOR", password: "" };

interface InviteEmployeeModalProps {
  open: boolean;
  onClose: () => void;
  onEmployeeInvited: (employee: AuthUser) => void;
}

function InviteEmployeeModal({ open, onClose, onEmployeeInvited }: InviteEmployeeModalProps) {
  const { authorizedRequest } = useAuth();
  const [inviteForm, setInviteForm] = useState(initialInviteForm);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteNotice, setInviteNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setInviteForm(initialInviteForm);
      setInviteNotice(null);
      setGeneratedPassword(null);
      setInviteLoading(false);
    }
  }, [open]);

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
        method: "POST", body: JSON.stringify(payload),
      });

      setInviteNotice({ type: "success", text: "Mitarbeiter erstellt. Zugangsdaten teilen!" });
      const fallbackPassword = inviteForm.password.trim() || null;
      setGeneratedPassword(response.temporaryPassword ?? fallbackPassword);
      onEmployeeInvited(response.user);
    } catch (err) {
      setInviteNotice({ type: "error", text: err instanceof Error ? err.message : "Einladung fehlgeschlagen." });
    } finally {
      setInviteLoading(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-8">
      <div className="relative w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl">
        <div className="mb-6 pr-10">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Team</p>
          <h2 className="text-2xl font-semibold text-white">Mitarbeiter einladen</h2>
          <p className="text-sm text-slate-400">Passwort automatisch generieren oder selbst definieren.</p>
        </div>
        <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full border border-white/10 p-2 text-slate-300 hover:text-white" aria-label="Modal schließen" >
          <X className="h-4 w-4" />
        </button>
        
        <form className="space-y-4" onSubmit={handleInviteSubmit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">Vorname <Input className="mt-2" value={inviteForm.firstName} onChange={(e) => setInviteForm(f => ({...f, firstName: e.target.value}))} placeholder="Mara" /></label>
              <label className="text-sm text-slate-300">Nachname <Input className="mt-2" value={inviteForm.lastName} onChange={(e) => setInviteForm(f => ({...f, lastName: e.target.value}))} placeholder="Schneider" /></label>
            </div>
            <label className="text-sm text-slate-300">E-Mail <Input type="email" className="mt-2" value={inviteForm.email} onChange={(e) => setInviteForm(f => ({...f, email: e.target.value}))} placeholder="mara@arcto.app" required /></label>
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-sm text-slate-300">
                Rolle
                <select className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none" value={inviteForm.role} onChange={(e) => setInviteForm(f => ({...f, role: e.target.value as UserRole}))}>
                  {roleOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                </select>
                <p className="mt-1 text-xs text-slate-500">{roleOptions.find((role) => role.value === inviteForm.role)?.hint}</p>
              </label>
              <label className="text-sm text-slate-300">
                Passwort (optional)
                <Input type="password" className="mt-2" value={inviteForm.password} onChange={(e) => setInviteForm(f => ({...f, password: e.target.value}))} placeholder="leer für Autogenerierung" />
              </label>
            </div>
            {inviteNotice && <p className={clsx("text-xs", inviteNotice.type === "success" ? "text-emerald-300" : "text-rose-300")}>{inviteNotice.text}</p>}
            {generatedPassword && <p className="text-xs text-sky-300">Temporäres Passwort: <span className="font-mono">{generatedPassword}</span></p>}
            <div className="flex justify-end gap-2 pt-4">
              <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
              <Button type="submit" disabled={inviteLoading}>{inviteLoading ? <Loader2 className="h-4 w-4 animate-spin"/> : <UserPlus className="h-4 w-4" />} Einladung senden</Button>
            </div>
        </form>
      </div>
    </div>
  );
}

// --- Edit Modal ---
type EditFormState = { firstName: string; lastName: string; role: UserRole; };

interface EditEmployeeModalProps {
  open: boolean;
  employee: AuthUser | null;
  onClose: () => void;
  onEmployeeUpdated: (employee: AuthUser) => void;
}

function EditEmployeeModal({ open, employee, onClose, onEmployeeUpdated }: EditEmployeeModalProps) {
    const { authorizedRequest } = useAuth();
    const [form, setForm] = useState<EditFormState>({ firstName: '', lastName: '', role: 'AGENT' });
    const [loading, setLoading] = useState(false);
    const [notice, setNotice] = useState<string | null>(null);

    useEffect(() => {
        if(open && employee) {
            setForm({
                firstName: employee.firstName ?? '',
                lastName: employee.lastName ?? '',
                role: employee.role,
            });
            setNotice(null);
            setLoading(false);
        }
    }, [open, employee]);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if(!employee) return;
        setLoading(true);
        setNotice(null);

        try {
            const payload = {
                firstName: form.firstName.trim() || undefined,
                lastName: form.lastName.trim() || undefined,
                role: form.role,
            };
            const updated = await authorizedRequest<AuthUser>(`/users/${employee.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
            onEmployeeUpdated(updated);
        } catch(err) {
            setNotice(err instanceof Error ? err.message : 'Update fehlgeschlagen.');
        } finally {
            setLoading(false);
        }
    }

    if(!open || !employee) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-8">
          <div className="relative w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl">
            <div className="mb-6 pr-10">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Mitarbeiter bearbeiten</p>
              <h2 className="text-2xl font-semibold text-white">{employee.firstName} {employee.lastName}</h2>
              <p className="text-sm text-slate-400">{employee.email}</p>
            </div>
            <button type="button" onClick={onClose} className="absolute right-4 top-4 rounded-full border border-white/10 p-2 text-slate-300 hover:text-white" aria-label="Modal schließen" >
              <X className="h-4 w-4" />
            </button>
            
            <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm text-slate-300">Vorname <Input className="mt-2" value={form.firstName} onChange={(e) => setForm(f => ({...f, firstName: e.target.value}))} /></label>
                  <label className="text-sm text-slate-300">Nachname <Input className="mt-2" value={form.lastName} onChange={(e) => setForm(f => ({...f, lastName: e.target.value}))} /></label>
                </div>
                <label className="text-sm text-slate-300">
                    Rolle
                    <select className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none" value={form.role} onChange={(e) => setForm(f => ({...f, role: e.target.value as UserRole}))}>
                        {roleOptions.map((option) => (<option key={option.value} value={option.value}>{option.label}</option>))}
                    </select>
                </label>
                {notice && <p className="text-xs text-rose-300">{notice}</p>}
                <div className="flex justify-end gap-2 pt-4">
                  <Button type="button" variant="ghost" onClick={onClose}>Abbrechen</Button>
                  <Button type="submit" disabled={loading}>{loading ? <Loader2 className="h-4 w-4 animate-spin"/> : null} Speichern</Button>
                </div>
            </form>
          </div>
        </div>
    );
}

export default function MitarbeiterPage() {
  const { authorizedRequest, user } = useAuth();
  const [employees, setEmployees] = useState<AuthUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isInviteModalOpen, setInviteModalOpen] = useState(false);
  const [editingEmployee, setEditingEmployee] = useState<AuthUser | null>(null);

  const isAdmin = useMemo(() => user?.role === 'ADMIN', [user]);

  useEffect(() => {
    const controller = new AbortController();
    async function fetchEmployees() {
      setLoading(true);
      setError(null);
      try {
        const data = await authorizedRequest<AuthUser[]>("/users", { signal: controller.signal });
        setEmployees(data);
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          setError(err instanceof Error ? err.message : "Mitarbeiter konnten nicht geladen werden.");
        }
      } finally {
        setLoading(false);
      }
    }
    void fetchEmployees();
    return () => controller.abort();
  }, [authorizedRequest]);

  const sortedEmployees = useMemo(() => {
    return [...employees].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }, [employees]);

  const handleEmployeeInvited = (newEmployee: AuthUser) => {
    setEmployees((current) => [newEmployee, ...current]);
    setTimeout(() => setInviteModalOpen(false), 1500);
  };

  const handleEmployeeUpdated = (updatedEmployee: AuthUser) => {
    setEmployees(current => current.map(e => e.id === updatedEmployee.id ? updatedEmployee : e));
    setEditingEmployee(null);
  };

  const handleDelete = async (employeeId: string) => {
    if (!window.confirm("Soll dieser Mitarbeiter wirklich gelöscht werden?")) return;
    
    try {
        await authorizedRequest(`/users/${employeeId}`, { method: 'DELETE' });
        setEmployees(current => current.filter(e => e.id !== employeeId));
    } catch(err) {
        setError(err instanceof Error ? err.message : 'Löschen fehlgeschlagen.');
    }
  }

  return (
    <>
      <section className="space-y-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Team</p>
            <h1 className="text-3xl font-semibold text-white">Mitarbeiter</h1>
            <p className="text-sm text-slate-400">Kolleg:innen hinzufügen und Zugänge verwalten.</p>
          </div>
          <Button size="sm" onClick={() => setInviteModalOpen(true)}>
            <UserPlus className="h-4 w-4" /> Mitarbeiter einladen
          </Button>
        </div>

        <Card title="Zugänge & Aktivitäten" description="Wer nutzt das CRM? Alle Accounts transparent in einer Liste." action={loading ? <Loader2 className="h-4 w-4 animate-spin text-slate-300" /> : <span className="text-xs text-slate-400">{employees.length} Einträge</span>}>
          {error && <p className="mb-3 text-xs text-rose-300"><AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{error}</p>}
          <div className="space-y-4">
            {loading && <p className="flex items-center gap-2 text-sm text-slate-300"><Loader2 className="h-4 w-4 animate-spin" /> Mitarbeiter werden geladen...</p>}
            {!loading && sortedEmployees.length === 0 && <p className="text-sm text-slate-400">Noch keine Zugänge vorhanden.</p>}
            {sortedEmployees.map((employee) => (
              <div key={employee.id} className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="font-semibold text-white">{employee.firstName ? `${employee.firstName} ${employee.lastName ?? ""}`.trim() : employee.email}</p>
                    <p className="text-xs text-slate-400">{employee.email}</p>
                  </div>
                  <div className="flex items-center gap-4">
                    <span className="rounded-full bg-white/10 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white/80">{employee.role.toLowerCase()}</span>
                    {user?.id !== employee.id && (
                        <div className="flex items-center gap-2">
                            <Button variant="ghost" size="sm" onClick={() => setEditingEmployee(employee)}><Edit className="h-4 w-4" /> Bearbeiten</Button>
                            <Button variant="ghost" size="sm" className="text-rose-300 hover:text-rose-200" onClick={() => handleDelete(employee.id)}><Trash2 className="h-4 w-4" /> Löschen</Button>
                        </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </section>

      <InviteEmployeeModal 
        open={isInviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        onEmployeeInvited={handleEmployeeInvited}
      />
      <EditEmployeeModal
        open={!!editingEmployee}
        onClose={() => setEditingEmployee(null)}
        employee={editingEmployee}
        onEmployeeUpdated={handleEmployeeUpdated}
      />
    </>
  );
}
