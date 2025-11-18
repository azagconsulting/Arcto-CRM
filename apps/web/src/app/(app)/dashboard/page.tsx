import { ArrowUpRight, CircleDashed, RefreshCcw, Users } from "lucide-react";
import { clsx } from "clsx";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const stats = [
  {
    label: "Pipeline gesamt",
    value: "€420.000",
    hint: "+12% vs. letzte Woche",
  },
  {
    label: "Gewichtete Prognose",
    value: "€148.500",
    hint: "38 Deals · Fokus auf Phase 3",
  },
  {
    label: "Conversion",
    value: "32%",
    hint: "+4% seit Start Arcto",
  },
  {
    label: "Aktive Kontakte",
    value: "214",
    hint: "63 mit offenen Aufgaben",
  },
];

const pipelineStages = [
  { stage: "Lead", amount: "€120k", deals: 18, progress: 24 },
  { stage: "Qualified", amount: "€140k", deals: 11, progress: 48 },
  { stage: "Verhandlung", amount: "€90k", deals: 6, progress: 70 },
  { stage: "Won", amount: "€70k", deals: 3, progress: 100 },
];

const followUps = [
  {
    title: "Demo vorbereiten",
    account: "Helix Logistics",
    due: "09:30",
    channel: "Video Call",
  },
  {
    title: "Pricing Feedback",
    account: "Nordwind AG",
    due: "11:00",
    channel: "E-Mail",
  },
  {
    title: "Legal Review",
    account: "Studio 27",
    due: "15:00",
    channel: "Docs",
  },
];

const meetings = [
  {
    time: "09:00",
    subject: "QBR – Arctic Systems",
    attendees: ["Daniel", "Sofia"],
  },
  {
    time: "13:00",
    subject: "Onboarding Paket",
    attendees: ["Mara"],
  },
  {
    time: "16:30",
    subject: "ALZAG & Partner Sync",
    attendees: ["CRM Squad"],
  },
];

const activities = [
  {
    title: "Vertrag gesendet",
    meta: "Futura Solar · Phase 4",
    time: "vor 18 Min",
  },
  {
    title: "Deal verschoben",
    meta: "Urban Mobility → Phase 2",
    time: "vor 1 Std",
  },
  {
    title: "Neuer Lead",
    meta: "Cloudshift – via Website",
    time: "vor 3 Std",
  },
];

const leaderboard = [
  { name: "Mara Schneider", amount: "€82k", indicator: "+18%" },
  { name: "Jonas Pohl", amount: "€64k", indicator: "+5%" },
  { name: "Helena Voigt", amount: "€51k", indicator: "+2%" },
];

const health = {
  ready: 5,
  awaiting: 12,
  blocked: 3,
};

function PipelineBar({ progress }: { progress: number }) {
  return (
    <div className="h-2 rounded-full bg-white/10">
      <div
        className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-fuchsia-400"
        style={{ width: `${progress}%` }}
      />
    </div>
  );
}

function ForecastSparkline() {
  return (
    <svg viewBox="0 0 120 60" className="h-24 w-full" aria-hidden>
      <defs>
        <linearGradient id="forecast" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(56,189,248,0.6)" />
          <stop offset="100%" stopColor="rgba(56,189,248,0)" />
        </linearGradient>
      </defs>
      <path
        d="M0 50 L20 35 L40 45 L60 20 L80 30 L100 10 L120 18"
        fill="none"
        stroke="rgba(125,211,252,1)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <path
        d="M0 60 L0 50 L20 35 L40 45 L60 20 L80 30 L100 10 L120 18 L120 60 Z"
        fill="url(#forecast)"
      />
    </svg>
  );
}

export default function DashboardPage() {
  return (
    <section className="space-y-10">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Arcto by ALZAG Consulting</p>
          <h1 className="text-3xl font-semibold text-white">Command Center</h1>
          <p className="text-sm text-slate-400">
            Pipeline, Forecast und Aktivitäten in einer Ansicht – bereit für den nächsten CRM-Sprint.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="ghost" size="sm">
            <RefreshCcw className="h-4 w-4" /> Aktualisieren
          </Button>
          <Button size="sm">
            <CircleDashed className="h-4 w-4" /> Deal hinzufügen
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <p className="text-sm text-slate-400">{stat.label}</p>
            <div className="mt-3 flex items-baseline gap-2">
              <p className="text-3xl font-semibold text-white">{stat.value}</p>
              <span className="text-xs text-emerald-300">{stat.hint}</span>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        <Card
          title="Pipeline"
          description="Stage-fokussierte Übersicht – Zahlen kommen direkt aus Prisma, sobald Deals aktiv sind."
          className="xl:col-span-2"
        >
          <div className="space-y-4">
            {pipelineStages.map((stage) => (
              <div key={stage.stage} className="rounded-2xl border border-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{stage.stage}</p>
                    <p className="text-xs text-slate-400">{stage.deals} Deals · {stage.amount}</p>
                  </div>
                  <p className="text-sm text-slate-400">{stage.progress}%</p>
                </div>
                <div className="mt-3">
                  <PipelineBar progress={stage.progress} />
                </div>
              </div>
            ))}
          </div>
        </Card>
        <Card title="Forecast" description="Projecte Werte in den nächsten 30 Tagen.">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-slate-400">Weighted Forecast</p>
                <p className="text-2xl font-semibold text-white">€148.500</p>
              </div>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-3 py-1 text-xs text-emerald-300">
                <ArrowUpRight className="h-3 w-3" /> +6,2%
              </span>
            </div>
            <ForecastSparkline />
            <div className="grid gap-3 text-sm text-slate-400">
              <p className="flex items-center justify-between">
                <span>Abschlusswahrscheinlichkeit &gt;60%</span>
                <span className="text-white">€92k</span>
              </p>
              <p className="flex items-center justify-between">
                <span>Upsell-Potenzial</span>
                <span className="text-white">€37k</span>
              </p>
              <p className="flex items-center justify-between">
                <span>Nächste 7 Tage</span>
                <span className="text-white">€19k</span>
              </p>
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Follow-ups"
          description="Heutige Aufgaben – bald direkt aus deiner Prisma Task Queue."
          className="lg:col-span-1"
        >
          <div className="space-y-3">
            {followUps.map((item) => (
              <div key={item.title} className="rounded-2xl border border-white/5 p-4">
                <div className="flex items-center justify-between text-white">
                  <p className="font-medium">{item.title}</p>
                  <span className="text-xs text-slate-400">{item.due}</span>
                </div>
                <p className="text-sm text-slate-400">{item.account}</p>
                <p className="text-xs text-slate-500">{item.channel}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Meetings" description="Kalender Sync folgt – hier siehst du den Plan für heute.">
          <div className="space-y-3">
            {meetings.map((meeting) => (
              <div key={meeting.subject} className="flex items-center gap-4 rounded-2xl border border-white/5 p-4">
                <div className="text-sm text-slate-400">{meeting.time}</div>
                <div>
                  <p className="font-semibold text-white">{meeting.subject}</p>
                  <p className="text-xs text-slate-500">{meeting.attendees.join(", ")}</p>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Best Performer" description="Top 3 nach Pipeline-Volumen">
          <div className="space-y-4">
            {leaderboard.map((member, idx) => (
              <div
                key={member.name}
                className={clsx(
                  "flex items-center justify-between rounded-2xl border border-white/5 p-4",
                  idx === 0 && "bg-white/5",
                )}
              >
                <div>
                  <p className="text-sm font-semibold text-white">{member.name}</p>
                  <p className="text-xs text-slate-500">{member.indicator}</p>
                </div>
                <p className="text-lg text-white">{member.amount}</p>
              </div>
            ))}
            <div className="rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-400">
              Teamstatus: {health.ready} Deals bereit · {health.awaiting} warten · {health.blocked} blockiert
            </div>
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Aktivitäten" description="Live-Stream deiner Pipeline">
          <div className="space-y-4">
            {activities.map((activity) => (
              <div key={activity.title} className="flex items-center gap-3 rounded-2xl border border-white/5 p-4">
                <span className="rounded-full bg-white/10 p-2">
                  <Users className="h-4 w-4" />
                </span>
                <div>
                  <p className="font-medium text-white">{activity.title}</p>
                  <p className="text-sm text-slate-400">{activity.meta}</p>
                </div>
                <span className="ml-auto text-xs text-slate-500">{activity.time}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card title="Playbooks" description="Sofort startklar – konfiguriere deine nächsten Schritte">
          <div className="space-y-3 text-sm text-slate-400">
            <div className="flex items-center justify-between rounded-2xl border border-white/5 p-4">
              <div>
                <p className="text-white">Account Warm-Up</p>
                <p className="text-xs text-slate-500">Sequenz mit 3 Touchpoints</p>
              </div>
              <Button size="sm" variant="secondary">
                Aktivieren
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-white/5 p-4">
              <div>
                <p className="text-white">Renewal Radar</p>
                <p className="text-xs text-slate-500">360° Report folgt per Prisma Job</p>
              </div>
              <Button size="sm" variant="ghost">
                Vormerken
              </Button>
            </div>
            <div className="flex items-center justify-between rounded-2xl border border-dashed border-white/10 p-4">
              <div>
                <p className="text-white">ALZAG Partner Board</p>
                <p className="text-xs text-slate-500">Synchronisiert externe Leads</p>
              </div>
              <Button size="sm">Öffnen</Button>
            </div>
          </div>
        </Card>
      </div>
    </section>
  );
}
