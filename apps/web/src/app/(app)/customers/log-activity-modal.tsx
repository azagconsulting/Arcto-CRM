"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type {
  Customer,
  CustomerActivity,
  CustomerActivityStatus,
} from "@/lib/types";

interface LogActivityModalProps {
  open: boolean;
  customer?: Customer | null;
  onClose: () => void;
  onLogged: (activity: CustomerActivity) => void;
}

const statusOptions: { label: string; value: CustomerActivityStatus }[] = [
  { label: "Geplant", value: "SCHEDULED" },
  { label: "Wartet", value: "WAITING" },
  { label: "Abgeschlossen", value: "DONE" },
];

type ActivityFormState = {
  title: string;
  detail: string;
  channel: string;
  status: CustomerActivityStatus;
  scheduledAt: string;
  completedAt: string;
};

const defaultState = (): ActivityFormState => ({
  title: "",
  detail: "",
  channel: "",
  status: "SCHEDULED",
  scheduledAt: new Date().toISOString().slice(0, 16),
  completedAt: "",
});

export function LogActivityModal({ open, customer, onClose, onLogged }: LogActivityModalProps) {
  const { authorizedRequest } = useAuth();
  const [form, setForm] = useState<ActivityFormState>(defaultState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setForm(defaultState());
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  if (!open) {
    return null;
  }

  const handleChange = (field: keyof ActivityFormState, value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customer) {
      setError("Kein Kunde ausgewählt.");
      return;
    }

    if (!form.title.trim()) {
      setError("Titel ist erforderlich.");
      return;
    }

    setSubmitting(true);
    setError(null);

    const payload = {
      title: form.title.trim(),
      detail: form.detail.trim() || undefined,
      channel: form.channel.trim() || undefined,
      status: form.status,
      scheduledAt: form.scheduledAt ? new Date(form.scheduledAt).toISOString() : undefined,
      completedAt: form.completedAt ? new Date(form.completedAt).toISOString() : undefined,
    };

    try {
      const activity = await authorizedRequest<CustomerActivity>(`/customers/${customer.id}/activities`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onLogged(activity);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Aktivität konnte nicht gespeichert werden.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-8">
      <div
        className="relative w-full max-w-lg rounded-[32px] border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label="Aktivität loggen"
      >
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-white/10 p-2 text-slate-300 hover:text-white"
          aria-label="Modal schließen"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="mb-6 pr-10">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Aktivität</p>
          <h2 className="text-2xl font-semibold text-white">Aktivität loggen</h2>
          <p className="text-sm text-slate-400">
            Hinterlege Notizen, Status und Termin für {customer?.name ?? "den Kunden"}.
          </p>
        </div>

        <form className="space-y-4" onSubmit={handleSubmit}>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Titel *</label>
            <Input
              value={form.title}
              onChange={(event) => handleChange("title", event.target.value)}
              placeholder="QBR vorbereiten"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Details</label>
            <Textarea
              rows={4}
              value={form.detail}
              onChange={(event) => handleChange("detail", event.target.value)}
              placeholder="Agenda definieren, Stakeholder einladen..."
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Kanal</label>
              <Input
                value={form.channel}
                onChange={(event) => handleChange("channel", event.target.value)}
                placeholder="E-Mail, Call, Video"
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Status</label>
              <select
                value={form.status}
                onChange={(event) => handleChange("status", event.target.value as CustomerActivityStatus)}
                className="w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40"
              >
                {statusOptions.map((option) => (
                  <option key={option.value} value={option.value} className="bg-slate-900 text-white">
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Geplant für</label>
              <Input
                type="datetime-local"
                value={form.scheduledAt}
                onChange={(event) => handleChange("scheduledAt", event.target.value)}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Abgeschlossen am</label>
              <Input
                type="datetime-local"
                value={form.completedAt}
                onChange={(event) => handleChange("completedAt", event.target.value)}
                disabled={form.status !== "DONE"}
              />
            </div>
          </div>

          {error && <p className="text-sm text-rose-300">{error}</p>}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Speichern
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
