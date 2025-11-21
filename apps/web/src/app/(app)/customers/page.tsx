"use client";

import { type ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle,
  Calendar,
  Edit3,
  Filter,
  Loader2,
  Mail,
  MapPin,
  MessageSquare,
  Phone,
  PhoneCall,
  Search,
  Sparkles,
  Upload,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { clsx } from "clsx";

import { useAuth } from "@/components/auth-provider";
import { useNotifications } from "@/components/notifications/notifications-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type {
  Customer,
  CustomerHealth,
  CustomerListResponse,
  CustomerSegment,
  CustomerImportResponse,
} from "@/lib/types";
import { CustomerModal } from "./customer-modal";
import { LogActivityModal } from "./log-activity-modal";

const segmentFilters: { label: string; value: "all" | CustomerSegment }[] = [
  { label: "Alle", value: "all" },
  { label: "Enterprise", value: "ENTERPRISE" },
  { label: "Scale-up", value: "SCALE" },
  { label: "Trial", value: "TRIAL" },
];

const healthFilters: { label: string; value: "all" | CustomerHealth }[] = [
  { label: "Gesund", value: "GOOD" },
  { label: "Aufmerksam", value: "ATTENTION" },
  { label: "Risiko", value: "RISK" },
];

const healthBadge: Record<CustomerHealth, string> = {
  GOOD: "bg-emerald-500/10 text-emerald-300",
  ATTENTION: "bg-amber-500/10 text-amber-300",
  RISK: "bg-rose-500/10 text-rose-300",
};

const currencyFormatter = new Intl.NumberFormat("de-DE", {
  style: "currency",
  currency: "EUR",
  maximumFractionDigits: 0,
});

const dateTimeFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatCurrency(cents: number) {
  return currencyFormatter.format(cents / 100);
}

function formatDate(value?: string | null) {
  if (!value) {
    return "–";
  }

  return dateTimeFormatter.format(new Date(value));
}

export default function CustomersPage() {
  const { authorizedRequest, loading: authLoading } = useAuth();
  const { notify } = useNotifications();
  const [selectedSegment, setSelectedSegment] = useState<"all" | CustomerSegment>("all");
  const [healthFilter, setHealthFilter] = useState<"all" | CustomerHealth>("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [data, setData] = useState<CustomerListResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [modalConfig, setModalConfig] = useState<{ mode: "create" | "edit"; customer?: Customer | null } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [activityModalOpen, setActivityModalOpen] = useState(false);
  const [csvImporting, setCsvImporting] = useState(false);
  const [csvImportMessage, setCsvImportMessage] = useState<string | null>(null);
  const [csvImportError, setCsvImportError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const notifiedActivitiesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(searchTerm), 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

  const fetchCustomers = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams();
        if (selectedSegment !== "all") {
          params.set("segment", selectedSegment);
        }
        if (healthFilter !== "all") {
          params.set("health", healthFilter);
        }
        if (debouncedSearch.trim()) {
          params.set("search", debouncedSearch.trim());
        }

        const query = params.toString() ? `?${params.toString()}` : "";
        const response = await authorizedRequest<CustomerListResponse>(`/customers${query}`, {
          signal,
        });
        setData(response);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }
        setError(err instanceof Error ? err.message : "API Fehler");
      } finally {
        setLoading(false);
      }
    },
    [selectedSegment, healthFilter, debouncedSearch, authorizedRequest],
  );

  useEffect(() => {
    if (authLoading) {
      return;
    }
    const controller = new AbortController();
    void fetchCustomers(controller.signal);
    return () => controller.abort();
  }, [authLoading, fetchCustomers]);

  useEffect(() => {
    if (!data?.items.length) {
      setSelectedCustomerId(null);
      return;
    }

    setSelectedCustomerId((current) => {
      if (current && data.items.some((customer) => customer.id === current)) {
        return current;
      }
      return data.items[0]?.id ?? null;
    });
  }, [data]);

  useEffect(() => {
    if (!data?.items.length) {
      return;
    }
    const now = Date.now();
    data.items.forEach((customer) => {
      customer.activities.forEach((activity) => {
        if (
          activity.status === "SCHEDULED" &&
          activity.scheduledAt &&
          new Date(activity.scheduledAt).getTime() <= now &&
          !notifiedActivitiesRef.current.has(activity.id)
        ) {
          notifiedActivitiesRef.current.add(activity.id);
          notify({
            title: "Aktivität fällig",
            description: `${customer.name} · ${formatDate(activity.scheduledAt)}`,
            variant: "warning",
          });
        }
      });
    });
  }, [data, notify]);

  const activeCustomer: Customer | null = useMemo(() => {
    if (!data?.items.length || !selectedCustomerId) {
      return null;
    }
    return data.items.find((customer) => customer.id === selectedCustomerId) ?? data.items[0];
  }, [data, selectedCustomerId]);

  const stats = data?.stats ?? {
    total: 0,
    atRisk: 0,
    enterprise: 0,
    scheduledMeetings: 0,
    totalMrrCents: 0,
  };

  const modalOpen = modalConfig !== null;
  const modalMode = modalConfig?.mode ?? "create";
  const modalCustomer = modalConfig?.customer ?? null;

  const handleCustomerSaved = useCallback(
    (customer: Customer) => {
      setSelectedCustomerId(customer.id);
      void fetchCustomers();
    },
    [fetchCustomers],
  );

  const openCreateModal = useCallback(() => {
    setModalConfig({ mode: "create" });
  }, []);

  const openEditModal = useCallback(() => {
    if (!activeCustomer) {
      return;
    }
    setModalConfig({ mode: "edit", customer: activeCustomer });
  }, [activeCustomer]);

  const handleDeleteCustomer = useCallback(async () => {
    if (!activeCustomer) {
      return;
    }
    const confirmed = window.confirm(`Willst du ${activeCustomer.name} wirklich löschen?`);
    if (!confirmed) {
      return;
    }
    setDeleteLoading(true);
    setError(null);
    try {
      await authorizedRequest(`/customers/${activeCustomer.id}`, { method: "DELETE" });
      setSelectedCustomerId(null);
      await fetchCustomers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunde konnte nicht gelöscht werden.");
    } finally {
      setDeleteLoading(false);
    }
  }, [activeCustomer, authorizedRequest, fetchCustomers]);

  const handleCsvButtonClick = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleCsvFileChange = useCallback(
    async (event: ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }

      setCsvImporting(true);
      setCsvImportMessage(null);
      setCsvImportError(null);

      const formData = new FormData();
      formData.append("file", file);

      try {
        const result = await authorizedRequest<CustomerImportResponse>("/customers/import", {
          method: "POST",
          body: formData,
        });
        setCsvImportMessage(`CSV importiert: ${result.imported} neu, ${result.skipped} übersprungen.`);
        if (result.errors.length) {
          setCsvImportError(result.errors.slice(0, 3).join(" | "));
        } else {
          setCsvImportError(null);
        }
        await fetchCustomers();
      } catch (err) {
        setCsvImportError(err instanceof Error ? err.message : "CSV-Import fehlgeschlagen.");
      } finally {
        setCsvImporting(false);
        event.target.value = "";
      }
    },
    [authorizedRequest, fetchCustomers],
  );

  const openActivityModal = useCallback(() => {
    if (!activeCustomer) {
      return;
    }
    setActivityModalOpen(true);
  }, [activeCustomer]);

  const handleActivityLogged = useCallback(() => {
    setActivityModalOpen(false);
    void fetchCustomers();
  }, [fetchCustomers]);

  return (
    <>
      <section className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Arcto CRM</p>
          <h1 className="text-3xl font-semibold text-white">Kunden</h1>
          <p className="text-sm text-slate-400">
            Verknüpft mit Prisma – inklusive Health-Signalen, Aktivitäten und Live-Filtern.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="ghost" size="sm">
            <Sparkles className="h-4 w-4" /> Automationen
          </Button>
          <Button variant="ghost" size="sm" onClick={handleCsvButtonClick} disabled={csvImporting}>
            {csvImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} CSV Import
          </Button>
          <Button size="sm" onClick={openCreateModal}>
            <UserPlus className="h-4 w-4" /> Kunde anlegen
          </Button>
          <input
            type="file"
            accept=".csv,text/csv"
            ref={fileInputRef}
            className="hidden"
            onChange={handleCsvFileChange}
          />
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card className="bg-gradient-to-br from-white/10 to-white/5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Aktive Kunden</p>
              <p className="text-3xl font-semibold text-white">{stats.total}</p>
              <p className="text-sm text-slate-400">{stats.enterprise} Enterprise · {stats.atRisk} mit Risiko</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 text-white">
              <Users className="h-6 w-6" />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Überwachter MRR</p>
              <p className="text-3xl font-semibold text-white">{formatCurrency(stats.totalMrrCents)}</p>
              <p className="text-sm text-slate-400">Filter berücksichtigen Segment & Suche</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 text-white">
              <TrendingUp className="h-6 w-6" />
            </div>
          </div>
        </Card>
        <Card>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Meetings geplant</p>
              <p className="text-3xl font-semibold text-white">{stats.scheduledMeetings}</p>
              <p className="text-sm text-slate-400">inkl. öffentlicher Aktivitäten aus Prisma</p>
            </div>
            <div className="rounded-2xl bg-white/10 p-3 text-white">
              <Calendar className="h-6 w-6" />
            </div>
          </div>
        </Card>
      </div>

      <Card className="flex flex-col gap-4 border-white/10 bg-white/5/30">
        <div className="flex flex-wrap items-center gap-3">
          {segmentFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() => setSelectedSegment(filter.value)}
              className={clsx(
                "rounded-full border px-4 py-1.5 text-sm",
                selectedSegment === filter.value
                  ? "border-white/40 bg-white/15 text-white"
                  : "border-white/10 text-slate-400 hover:border-white/40",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-slate-300">
            <Search className="h-4 w-4" />
            <input
              type="text"
              placeholder="Suche nach Namen, Regionen oder Owner"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <Button variant="ghost" size="sm">
            <Filter className="h-4 w-4" /> Filter
          </Button>
        </div>
        <div className="flex flex-wrap gap-3">
          {healthFilters.map((filter) => (
            <button
              key={filter.value}
              type="button"
              onClick={() =>
                setHealthFilter((current) => (current === filter.value ? "all" : (filter.value as CustomerHealth)))
              }
              className={clsx(
                "rounded-full border px-4 py-1 text-xs uppercase tracking-[0.2em]",
                healthFilter === filter.value
                  ? "border-white/40 bg-white/15 text-white"
                  : "border-white/10 text-slate-500 hover:border-white/30",
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>
        {loading && <p className="text-sm text-slate-400">Lade Kundendaten ...</p>}
        {error && !loading && <p className="text-sm text-rose-300">{error}</p>}
        {csvImportMessage && <p className="text-sm text-emerald-300">{csvImportMessage}</p>}
        {csvImportError && <p className="text-sm text-rose-300">{csvImportError}</p>}
      </Card>

      <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Card className="overflow-hidden">
          <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr_80px] gap-6 border-b border-white/5 px-6 py-3 text-xs uppercase tracking-[0.2em] text-slate-500">
            <p>Kunde</p>
            <p>Owner</p>
            <p>MRR</p>
            <p>Nächster Schritt</p>
            <p>Status</p>
          </div>
          <div>
            {data?.items.length === 0 && !loading && (
              <div className="px-6 py-12 text-center text-sm text-slate-400">
                Keine Kunden für die aktuelle Kombination gefunden.
              </div>
            )}
            {data?.items.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className={clsx(
                  "grid w-full grid-cols-[1.5fr_1fr_1fr_1fr_80px] gap-6 px-6 py-4 text-left transition",
                  activeCustomer?.id === customer.id ? "bg-white/10" : "hover:bg-white/5",
                )}
                onClick={() => setSelectedCustomerId(customer.id)}
              >
                <div>
                  <p className="font-semibold text-white">{customer.name}</p>
                  <p className="text-xs text-slate-500">
                    {customer.region ?? "–"} · {customer.decisionStage ?? "–"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {(customer.tags ?? []).map((tag) => (
                      <span key={tag} className="rounded-full bg-white/5 px-2 py-0.5 text-slate-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-slate-300">{customer.ownerName ?? "–"}</p>
                <p className="text-sm text-white">{formatCurrency(customer.mrrCents)}</p>
                <p className="text-sm text-slate-300">{customer.nextStep ?? "–"}</p>
                <span className={clsx("rounded-full px-3 py-1 text-center text-xs", healthBadge[customer.health])}>
                  {customer.health === "GOOD" && "Gesund"}
                  {customer.health === "ATTENTION" && "Aufmerksam"}
                  {customer.health === "RISK" && "Risiko"}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card
          title="Account Details"
          description="Alle Informationen stammen direkt aus der Prisma-Datenbank."
          action={
            activeCustomer ? (
              <div className="flex flex-wrap gap-2">
                <Button variant="ghost" size="sm" onClick={openEditModal}>
                  <Edit3 className="h-4 w-4" /> Bearbeiten
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-rose-300 hover:bg-rose-500/10 hover:text-rose-50"
                  onClick={handleDeleteCustomer}
                  disabled={deleteLoading}
                >
                  {deleteLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />} Löschen
                </Button>
              </div>
            ) : null
          }
        >
          {!activeCustomer ? (
            <p className="text-sm text-slate-400">Kein Kunde in der Auswahl.</p>
          ) : (
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Name</p>
                <p className="text-2xl font-semibold text-white">{activeCustomer.name}</p>
                <p className="text-xs text-slate-500">Owner: {activeCustomer.ownerName ?? "–"}</p>
              </div>
              <div className="flex flex-wrap gap-4 text-sm text-slate-300">
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1">
                  <MapPin className="h-4 w-4" /> {activeCustomer.region ?? "–"}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 capitalize">
                  <Sparkles className="h-4 w-4" /> {activeCustomer.segment.toLowerCase()}
                </span>
                <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1">
                  <TrendingUp className="h-4 w-4" /> {formatCurrency(activeCustomer.mrrCents)}
                </span>
              </div>
              <div className="rounded-2xl border border-white/10 p-4 text-sm text-slate-300">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Nächster Schritt</p>
                <p className="text-lg text-white">{activeCustomer.nextStep ?? "–"}</p>
                <p className="text-xs text-slate-500">Letzter Kontakt: {formatDate(activeCustomer.lastContactAt)}</p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-white/10 p-3 text-center">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Health</p>
                  <p className="text-lg font-semibold text-white">{activeCustomer.health.toLowerCase()}</p>
                </div>
                <div className="rounded-2xl border border-white/10 p-3 text-center">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Phase</p>
                  <p className="text-lg font-semibold text-white">{activeCustomer.decisionStage ?? "–"}</p>
                </div>
                <div className="rounded-2xl border border-white/10 p-3 text-center">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Kanal</p>
                  <p className="text-lg font-semibold text-white">{activeCustomer.preferredChannel ?? "–"}</p>
                </div>
              </div>

              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Kontakte</p>
                <div className="mt-3 space-y-3">
                  {activeCustomer.contacts.map((contact) => (
                    <div key={contact.id} className="flex items-center justify-between rounded-2xl border border-white/10 p-3">
                      <div>
                        <p className="text-sm font-semibold text-white">{contact.name}</p>
                        <p className="text-xs text-slate-500">{contact.role ?? "–"}</p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                        {(contact.channel === "E-Mail" || contact.channel === "Mail") && <Mail className="h-3.5 w-3.5" />}
                        {contact.channel === "Call" && <Phone className="h-3.5 w-3.5" />}
                        {contact.channel === "Video" && <PhoneCall className="h-3.5 w-3.5" />}
                        {contact.channel === "Docs" && <Sparkles className="h-3.5 w-3.5" />}
                        {contact.channel ?? "–"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Aktivität</p>
                  <Button variant="ghost" size="sm" onClick={openActivityModal} disabled={!activeCustomer}>
                    <MessageSquare className="h-4 w-4" /> Loggen
                  </Button>
                </div>
                <div className="space-y-3">
                  {activeCustomer.activities.map((activity) => (
                    <div key={activity.id} className="rounded-2xl border border-white/10 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-white">{activity.title}</p>
                          <p className="text-xs text-slate-500">{activity.detail ?? "–"}</p>
                        </div>
                        <span
                          className={clsx(
                            "rounded-full px-3 py-1 text-xs",
                            activity.status === "SCHEDULED" && "bg-sky-500/10 text-sky-200",
                            activity.status === "DONE" && "bg-emerald-500/10 text-emerald-200",
                            activity.status === "WAITING" && "bg-amber-500/10 text-amber-200",
                          )}
                        >
                          {activity.status === "SCHEDULED" && "Geplant"}
                          {activity.status === "DONE" && "Abgeschlossen"}
                          {activity.status === "WAITING" && "Wartet"}
                        </span>
                      </div>
                      <div className="mt-3 flex flex-wrap items-center gap-3 text-xs text-slate-400">
                        <span className="inline-flex items-center gap-1">
                          <Calendar className="h-3 w-3" /> {formatDate(activity.scheduledAt)}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" /> {activity.channel ?? "–"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <Button size="sm" className="flex-1 min-w-[120px]">
                  <Mail className="h-4 w-4" /> Mail senden
                </Button>
                <Button variant="secondary" size="sm" className="flex-1 min-w-[120px]">
                  <PhoneCall className="h-4 w-4" /> Call buchen
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>
      </section>
      <CustomerModal
        open={modalOpen}
        mode={modalMode}
        customer={modalCustomer}
        onClose={() => setModalConfig(null)}
        onSaved={(customer) => {
          setModalConfig(null);
          handleCustomerSaved(customer);
        }}
      />
      <LogActivityModal
        open={activityModalOpen}
        customer={activeCustomer}
        onClose={() => setActivityModalOpen(false)}
        onLogged={() => handleActivityLogged()}
      />
    </>
  );
}
