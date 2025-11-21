"use client";

import { clsx } from "clsx";
import { Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Customer, CustomerHealth, CustomerSegment } from "@/lib/types";

type CustomerModalMode = "create" | "edit";

interface CustomerModalProps {
  mode: CustomerModalMode;
  open: boolean;
  customer?: Customer | null;
  onClose: () => void;
  onSaved: (customer: Customer) => void;
}

type CustomerFormState = {
  name: string;
  ownerName: string;
  region: string;
  decisionStage: string;
  preferredChannel: string;
  segment: CustomerSegment;
  health: CustomerHealth;
  mrr: string;
  nextStep: string;
  nextStepDueAt: string;
  lastContactAt: string;
  tags: string;
  contactId: string;
  contactName: string;
  contactRole: string;
  contactEmail: string;
  contactChannel: string;
  contactPhone: string;
};

type FormErrors = Partial<Record<keyof CustomerFormState, string>>;

const segmentOptions: { label: string; value: CustomerSegment }[] = [
  { label: "Enterprise", value: "ENTERPRISE" },
  { label: "Scale-up", value: "SCALE" },
  { label: "Trial", value: "TRIAL" },
];

const healthOptions: { label: string; value: CustomerHealth }[] = [
  { label: "Gesund", value: "GOOD" },
  { label: "Aufmerksam", value: "ATTENTION" },
  { label: "Risiko", value: "RISK" },
];

const initialState: CustomerFormState = {
  name: "",
  ownerName: "",
  region: "",
  decisionStage: "",
  preferredChannel: "",
  segment: "SCALE",
  health: "GOOD",
  mrr: "",
  nextStep: "",
  nextStepDueAt: "",
  lastContactAt: "",
  tags: "",
  contactId: "",
  contactName: "",
  contactRole: "",
  contactEmail: "",
  contactChannel: "",
  contactPhone: "",
};

const selectClasses =
  "w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none focus:ring-2 focus:ring-sky-400/40";

function toDateTimeInput(value?: string | null) {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toISOString().slice(0, 16);
}

function customerToFormState(customer: Customer): CustomerFormState {
  const primaryContact = customer.contacts[0];
  return {
    name: customer.name,
    ownerName: customer.ownerName ?? "",
    region: customer.region ?? "",
    decisionStage: customer.decisionStage ?? "",
    preferredChannel: customer.preferredChannel ?? "",
    segment: customer.segment,
    health: customer.health,
    mrr: (customer.mrrCents / 100).toString(),
    nextStep: customer.nextStep ?? "",
    nextStepDueAt: toDateTimeInput(customer.nextStepDueAt),
    lastContactAt: toDateTimeInput(customer.lastContactAt),
    tags: customer.tags?.join(", ") ?? "",
    contactId: primaryContact?.id ?? "",
    contactName: primaryContact?.name ?? "",
    contactRole: primaryContact?.role ?? "",
    contactEmail: primaryContact?.email ?? "",
    contactChannel: primaryContact?.channel ?? "",
    contactPhone: primaryContact?.phone ?? "",
  };
}

export function CustomerModal({ mode, open, customer, onClose, onSaved }: CustomerModalProps) {
  const { authorizedRequest } = useAuth();
  const [form, setForm] = useState<CustomerFormState>(initialState);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const isEditMode = mode === "edit";

  useEffect(() => {
    if (!open) {
      setForm(initialState);
      setErrors({});
      setSubmitError(null);
      return;
    }

    if (isEditMode && customer) {
      setForm(customerToFormState(customer));
    } else {
      setForm(initialState);
    }
    setErrors({});
    setSubmitError(null);
  }, [open, mode, isEditMode, customer]);

  useEffect(() => {
    if (!open) {
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const tagsArray = useMemo(
    () =>
      form.tags
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
    [form.tags],
  );

  const contactFieldsTouched =
    form.contactName.trim() ||
    form.contactRole.trim() ||
    form.contactEmail.trim() ||
    form.contactChannel.trim() ||
    form.contactPhone.trim();

  function handleChange(field: keyof CustomerFormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setErrors((prev) => {
      if (!prev[field]) {
        return prev;
      }
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }

  function parseMrrToCents(value: string) {
    if (!value.trim()) {
      return NaN;
    }
    const normalized = value.replace(/[^\d,.-]/g, "").replace(",", ".");
    const amount = Number(normalized);
    if (Number.isNaN(amount)) {
      return NaN;
    }
    return Math.round(amount * 100);
  }

  function validateForm(): number | null {
    const nextErrors: FormErrors = {};

    if (!form.name.trim()) {
      nextErrors.name = "Name ist erforderlich.";
    }

    const mrrCents = parseMrrToCents(form.mrr);
    if (Number.isNaN(mrrCents) || mrrCents < 0) {
      nextErrors.mrr = "Ungültiger Betrag.";
    }

    if (form.contactEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contactEmail.trim())) {
      nextErrors.contactEmail = "Ungültige E-Mail.";
    }

    if (contactFieldsTouched && !form.contactName.trim()) {
      nextErrors.contactName = "Name des Kontakts fehlt.";
    }

    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) {
      return null;
    }

    return mrrCents;
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const mrrCents = validateForm();
    if (mrrCents === null) {
      return;
    }

    setSubmitting(true);
    setSubmitError(null);

    const payload: Record<string, unknown> = {
      name: form.name.trim(),
      segment: form.segment,
      health: form.health,
      mrrCents,
    };

    const ownerName = form.ownerName.trim();
    if (ownerName) {
      payload.ownerName = ownerName;
    } else if (isEditMode) {
      payload.ownerName = null;
    }

    const region = form.region.trim();
    if (region) {
      payload.region = region;
    } else if (isEditMode) {
      payload.region = null;
    }

    const decisionStage = form.decisionStage.trim();
    if (decisionStage) {
      payload.decisionStage = decisionStage;
    } else if (isEditMode) {
      payload.decisionStage = null;
    }

    const preferredChannel = form.preferredChannel.trim();
    if (preferredChannel) {
      payload.preferredChannel = preferredChannel;
    } else if (isEditMode) {
      payload.preferredChannel = null;
    }

    const nextStep = form.nextStep.trim();
    if (nextStep) {
      payload.nextStep = nextStep;
    } else if (isEditMode) {
      payload.nextStep = null;
    }

    if (form.lastContactAt) {
      payload.lastContactAt = new Date(form.lastContactAt).toISOString();
    } else if (isEditMode) {
      payload.lastContactAt = null;
    }

    if (form.nextStepDueAt) {
      payload.nextStepDueAt = new Date(form.nextStepDueAt).toISOString();
    } else if (isEditMode) {
      payload.nextStepDueAt = null;
    }

    if (tagsArray.length > 0) {
      payload.tags = tagsArray;
    } else if (isEditMode) {
      payload.tags = [];
    }

    const contactFieldValue = (value: string) => {
      const trimmed = value.trim();
      if (trimmed) {
        return trimmed;
      }
      return isEditMode ? null : undefined;
    };

    const contactPayload =
      form.contactName.trim() || contactFieldsTouched
        ? {
            name: (form.contactName || form.contactEmail || form.contactPhone).trim(),
            role: contactFieldValue(form.contactRole),
            channel: contactFieldValue(form.contactChannel),
            email: contactFieldValue(form.contactEmail),
            phone: contactFieldValue(form.contactPhone),
          }
        : null;

    if (!isEditMode && contactPayload && contactPayload.name) {
      payload.contacts = [contactPayload];
    }

    if (isEditMode) {
      if (!customer) {
        setSubmitError("Kein Kunde in der Auswahl.");
        setSubmitting(false);
        return;
      }

      if (contactPayload) {
        payload.primaryContact = {
          id: form.contactId || undefined,
          ...contactPayload,
        };
      }
    }

    const endpoint = isEditMode && customer ? `/customers/${customer.id}` : "/customers";

    try {
      const savedCustomer = await authorizedRequest<Customer>(endpoint, {
        method: isEditMode ? "PATCH" : "POST",
        body: JSON.stringify(payload),
      });
      onSaved(savedCustomer);
    } catch (err) {
      setSubmitError(
        err instanceof Error
          ? err.message
          : isEditMode
            ? "Kunde konnte nicht aktualisiert werden."
            : "Kunde konnte nicht angelegt werden.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return null;
  }

  const title = isEditMode ? "Kunde bearbeiten" : "Neuen Kunden anlegen";
  const subtitle = isEditMode
    ? "Aktualisiere Stammdaten, Health und Notizen für den ausgewählten Account."
    : "Stammdaten, Umsatz und erster Kontakt reichen aus, um sofort mit der Betreuung zu starten.";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 px-4 py-8">
      <div
        className="relative w-full max-w-4xl rounded-[32px] border border-white/10 bg-slate-950/95 p-6 text-white shadow-2xl"
        role="dialog"
        aria-modal="true"
        aria-label={title}
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
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">
            {isEditMode ? "Account Update" : "Kundenanlage"}
          </p>
          <h2 className="text-2xl font-semibold text-white">{title}</h2>
          <p className="text-sm text-slate-400">{subtitle}</p>
        </div>

        <form className="space-y-6" onSubmit={handleSubmit}>
          <div className="grid gap-6 lg:grid-cols-2">
            <div className="space-y-4">
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Unternehmensname *</label>
                <Input
                  value={form.name}
                  onChange={(event) => handleChange("name", event.target.value)}
                  invalid={!!errors.name}
                  placeholder="Acme Robotics GmbH"
                />
                {errors.name && <p className="mt-1 text-xs text-rose-300">{errors.name}</p>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Owner</label>
                  <Input
                    value={form.ownerName}
                    onChange={(event) => handleChange("ownerName", event.target.value)}
                    placeholder="Verantwortliche Person"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Region</label>
                  <Input
                    value={form.region}
                    onChange={(event) => handleChange("region", event.target.value)}
                    placeholder="DACH"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Segment</label>
                  <select
                    value={form.segment}
                    onChange={(event) => handleChange("segment", event.target.value as CustomerSegment)}
                    className={clsx(selectClasses, errors.segment && "border-rose-400/60 text-rose-100")}
                  >
                    {segmentOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-slate-900 text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Health</label>
                  <select
                    value={form.health}
                    onChange={(event) => handleChange("health", event.target.value as CustomerHealth)}
                    className={clsx(selectClasses, errors.health && "border-rose-400/60 text-rose-100")}
                  >
                    {healthOptions.map((option) => (
                      <option key={option.value} value={option.value} className="bg-slate-900 text-white">
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">MRR (EUR) *</label>
                <Input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="15000"
                  value={form.mrr}
                  onChange={(event) => handleChange("mrr", event.target.value)}
                  invalid={!!errors.mrr}
                />
                {errors.mrr && <p className="mt-1 text-xs text-rose-300">{errors.mrr}</p>}
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Tags</label>
                <Input value={form.tags} onChange={(event) => handleChange("tags", event.target.value)} placeholder="SaaS, Marketing, Integrationen" />
                {tagsArray.length > 0 && (
                  <p className="mt-1 text-xs text-slate-500">Erkannt: {tagsArray.join(", ")}</p>
                )}
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Nächster Schritt</label>
                <Textarea
                  rows={3}
                  placeholder="Demo vorbereiten, PoC-Inhalte abstimmen ..."
                  value={form.nextStep}
                  onChange={(event) => handleChange("nextStep", event.target.value)}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Phase</label>
                  <Input
                    value={form.decisionStage}
                    onChange={(event) => handleChange("decisionStage", event.target.value)}
                    placeholder="Evaluation"
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Kanal</label>
                  <Input
                    value={form.preferredChannel}
                    onChange={(event) => handleChange("preferredChannel", event.target.value)}
                    placeholder="E-Mail"
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Letzter Kontakt</label>
                  <Input
                    type="datetime-local"
                    value={form.lastContactAt}
                    onChange={(event) => handleChange("lastContactAt", event.target.value)}
                  />
                </div>
                <div>
                  <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Fälligkeit nächster Schritt</label>
                  <Input
                    type="datetime-local"
                    value={form.nextStepDueAt}
                    onChange={(event) => handleChange("nextStepDueAt", event.target.value)}
                  />
                </div>
              </div>

              <div className="rounded-3xl border border-white/10 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Primärer Kontakt</p>
                <div className="mt-3 space-y-3">
                  <div>
                    <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Name</label>
                    <Input
                      value={form.contactName}
                      onChange={(event) => handleChange("contactName", event.target.value)}
                      placeholder="Ansprechpartner*in"
                      invalid={!!errors.contactName}
                    />
                    {errors.contactName && <p className="mt-1 text-xs text-rose-300">{errors.contactName}</p>}
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Rolle</label>
                      <Input
                        value={form.contactRole}
                        onChange={(event) => handleChange("contactRole", event.target.value)}
                        placeholder="CTO, Head of Sales …"
                      />
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Bevorzugter Kanal</label>
                      <Input
                        value={form.contactChannel}
                        onChange={(event) => handleChange("contactChannel", event.target.value)}
                        placeholder="E-Mail, Call, Video"
                      />
                    </div>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div>
                      <label className="text-xs uppercase tracking-[0.2em] text-slate-400">E-Mail</label>
                      <Input
                        type="email"
                        value={form.contactEmail}
                        onChange={(event) => handleChange("contactEmail", event.target.value)}
                        placeholder="kontakt@acme.com"
                        invalid={!!errors.contactEmail}
                      />
                      {errors.contactEmail && <p className="mt-1 text-xs text-rose-300">{errors.contactEmail}</p>}
                    </div>
                    <div>
                      <label className="text-xs uppercase tracking-[0.2em] text-slate-400">Telefon</label>
                      <Input
                        value={form.contactPhone}
                        onChange={(event) => handleChange("contactPhone", event.target.value)}
                        placeholder="+49 173 1234"
                      />
                    </div>
                  </div>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  Optional — falls du direkt einen Kontakt speichern bzw. aktualisieren möchtest.
                </p>
              </div>
            </div>
          </div>

          {submitError && <p className="text-sm text-rose-300">{submitError}</p>}

          <div className="flex flex-wrap justify-end gap-3">
            <Button type="button" variant="ghost" onClick={onClose}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEditMode ? "Änderungen speichern" : "Kunde speichern"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
