"use client";

import { useMemo, useState } from "react";
import { Filter, Mail, MapPin, Phone, Search, Sparkles, UserPlus } from "lucide-react";
import { clsx } from "clsx";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const segmentFilters = [
  { label: "Alle", value: "all" },
  { label: "Enterprise", value: "enterprise" },
  { label: "Scale-up", value: "scale" },
  { label: "Trial", value: "trial" },
];

const customerRecords = [
  {
    id: 1,
    name: "Nordwind AG",
    segment: "enterprise",
    owner: "Mara Schneider",
    region: "Berlin",
    health: "good",
    mrr: "€38.200",
    lastTouch: "vor 2 Std",
    nextStep: "QBR · 12. Feb",
    tags: ["Industry", "ERP"],
    contacts: [
      { name: "Anke Ritter", role: "CIO", channel: "E-Mail" },
      { name: "Jasper Fromm", role: "Ops Lead", channel: "Call" },
    ],
  },
  {
    id: 2,
    name: "Helix Logistics",
    segment: "scale",
    owner: "Jonas Pohl",
    region: "Hamburg",
    health: "attention",
    mrr: "€12.900",
    lastTouch: "gestern",
    nextStep: "Lizenz-Upgrades",
    tags: ["Transport", "API"],
    contacts: [
      { name: "Lea Vogt", role: "Head of Ops", channel: "Video" },
    ],
  },
  {
    id: 3,
    name: "Studio 27",
    segment: "trial",
    owner: "Helena Voigt",
    region: "Köln",
    health: "risk",
    mrr: "€3.400",
    lastTouch: "vor 4 Std",
    nextStep: "Onboarding Call",
    tags: ["Creative", "Trial"],
    contacts: [
      { name: "Milo Graf", role: "Founder", channel: "E-Mail" },
    ],
  },
  {
    id: 4,
    name: "Arctic Systems",
    segment: "enterprise",
    owner: "Mara Schneider",
    region: "München",
    health: "good",
    mrr: "€21.600",
    lastTouch: "heute",
    nextStep: "Renewal Draft",
    tags: ["Cloud", "Partner"],
    contacts: [
      { name: "Daniel Kluge", role: "CTO", channel: "Call" },
      { name: "Sofia Brand", role: "Finance", channel: "Docs" },
    ],
  },
];

type HealthState = "good" | "attention" | "risk";

const healthBadge: Record<HealthState, string> = {
  good: "bg-emerald-500/10 text-emerald-300",
  attention: "bg-amber-500/10 text-amber-300",
  risk: "bg-rose-500/10 text-rose-300",
};

export default function CustomersPage() {
  const [selectedSegment, setSelectedSegment] = useState<string>("all");
  const [selectedCustomer, setSelectedCustomer] = useState(customerRecords[0]);

  const filteredCustomers = useMemo(() => {
    if (selectedSegment === "all") return customerRecords;
    return customerRecords.filter((customer) => customer.segment === selectedSegment);
  }, [selectedSegment]);

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Arcto CRM</p>
          <h1 className="text-3xl font-semibold text-white">Kunden</h1>
          <p className="text-sm text-slate-400">Segment- und Health-basierte Übersicht für Accounts & Relationships.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="ghost" size="sm">
            <Sparkles className="h-4 w-4" /> Automationen
          </Button>
          <Button size="sm">
            <UserPlus className="h-4 w-4" /> Kunde anlegen
          </Button>
        </div>
      </div>

      <Card className="flex flex-col gap-4 border-white/10 bg-white/5/30 md:flex-row md:items-center md:justify-between">
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
        <div className="flex flex-1 flex-wrap items-center gap-3">
          <div className="flex flex-1 items-center gap-2 rounded-2xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-slate-300">
            <Search className="h-4 w-4" />
            <input
              type="text"
              placeholder="Suche nach Namen, Domains, Owner"
              className="flex-1 bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
            />
          </div>
          <Button variant="ghost" size="sm">
            <Filter className="h-4 w-4" /> Filter
          </Button>
        </div>
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
            {filteredCustomers.map((customer) => (
              <button
                key={customer.id}
                type="button"
                className={clsx(
                  "grid w-full grid-cols-[1.5fr_1fr_1fr_1fr_80px] gap-6 px-6 py-4 text-left transition",
                  selectedCustomer.id === customer.id
                    ? "bg-white/10"
                    : "hover:bg-white/5",
                )}
                onClick={() => setSelectedCustomer(customer)}
              >
                <div>
                  <p className="font-semibold text-white">{customer.name}</p>
                  <p className="text-xs text-slate-500">{customer.region}</p>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs">
                    {customer.tags.map((tag) => (
                      <span key={tag} className="rounded-full bg-white/5 px-2 py-0.5 text-slate-400">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
                <p className="text-sm text-slate-300">{customer.owner}</p>
                <p className="text-sm text-white">{customer.mrr}</p>
                <p className="text-sm text-slate-300">{customer.nextStep}</p>
                <span className={clsx("rounded-full px-3 py-1 text-center text-xs", healthBadge[customer.health as HealthState])}>
                  {customer.health === "good" && "Gesund"}
                  {customer.health === "attention" && "Aufmerksam"}
                  {customer.health === "risk" && "Risiko"}
                </span>
              </button>
            ))}
          </div>
        </Card>

        <Card title="Account Details" description="Synchronisiert mit Prisma, sobald Entitäten aktiv sind.">
          <div className="space-y-4">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-slate-500">Name</p>
              <p className="text-2xl font-semibold text-white">{selectedCustomer.name}</p>
              <p className="text-xs text-slate-500">Owner: {selectedCustomer.owner}</p>
            </div>
            <div className="flex flex-wrap gap-4 text-sm text-slate-300">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1">
                <MapPin className="h-4 w-4" /> {selectedCustomer.region}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1">
                <Sparkles className="h-4 w-4" /> {selectedCustomer.segment}
              </span>
            </div>
            <div className="rounded-2xl border border-white/10 p-4 text-sm text-slate-300">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Nächster Schritt</p>
              <p className="text-lg text-white">{selectedCustomer.nextStep}</p>
              <p className="text-xs text-slate-500">Letzter Kontakt: {selectedCustomer.lastTouch}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Kontakte</p>
              <div className="mt-3 space-y-3">
                {selectedCustomer.contacts.map((contact) => (
                  <div key={contact.name} className="flex items-center justify-between rounded-2xl border border-white/10 p-3">
                    <div>
                      <p className="text-sm font-semibold text-white">{contact.name}</p>
                      <p className="text-xs text-slate-500">{contact.role}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-xs text-slate-400">
                      {contact.channel === "E-Mail" && <Mail className="h-3.5 w-3.5" />}
                      {contact.channel === "Call" && <Phone className="h-3.5 w-3.5" />}
                      {contact.channel === "Video" && <Phone className="h-3.5 w-3.5 rotate-90" />}
                      {contact.channel === "Docs" && <Sparkles className="h-3.5 w-3.5" />}
                      {contact.channel}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
