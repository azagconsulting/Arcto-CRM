import type { LucideIcon } from "lucide-react";
import { Award, Briefcase, Calendar, CheckCircle2, Clock, Laptop, Plane, ShieldCheck, Sparkles, Target, UserPlus, Users } from "lucide-react";
import { clsx } from "clsx";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

const workforceStats: Array<{ label: string; value: string; hint: string; icon: LucideIcon }> = [
  {
    label: "Aktive Mitarbeiter",
    value: "128",
    hint: "+6 seit Januar · 2 Teams wachsen",
    icon: Users,
  },
  {
    label: "Onboarding Pipeline",
    value: "7 Personen",
    hint: "4 Tech · 3 Go-to-Market",
    icon: UserPlus,
  },
  {
    label: "Engagement Score",
    value: "8,7 / 10",
    hint: "letzter Pulse Mittwoch",
    icon: Target,
  },
  {
    label: "Remote Anteil",
    value: "64%",
    hint: "10 Städte · 2 Hubs",
    icon: Laptop,
  },
];

type SatisfactionLevel = "high" | "focus" | "watch";

const satisfactionBadge: Record<SatisfactionLevel, string> = {
  high: "bg-emerald-500/10 text-emerald-300",
  focus: "bg-amber-500/10 text-amber-300",
  watch: "bg-rose-500/10 text-rose-300",
};

interface TeamSnapshot {
  team: string;
  lead: string;
  headcount: number;
  focus: string;
  capacity: number;
  satisfaction: SatisfactionLevel;
  openRoles: number;
}

const teamSnapshot: TeamSnapshot[] = [
  {
    team: "Revenue",
    lead: "Mara Schneider",
    headcount: 34,
    focus: "Pipeline & Expansion",
    capacity: 86,
    satisfaction: "high",
    openRoles: 2,
  },
  {
    team: "Product",
    lead: "Jonas Pohl",
    headcount: 27,
    focus: "Journey Builder",
    capacity: 73,
    satisfaction: "focus",
    openRoles: 1,
  },
  {
    team: "Delivery",
    lead: "Helena Voigt",
    headcount: 22,
    focus: "Implementierungen & Partner",
    capacity: 92,
    satisfaction: "high",
    openRoles: 0,
  },
  {
    team: "Operations",
    lead: "Sofia Brand",
    headcount: 18,
    focus: "Finance · People Ops",
    capacity: 64,
    satisfaction: "watch",
    openRoles: 1,
  },
];

interface OnboardingJourney {
  name: string;
  role: string;
  phase: string;
  progress: number;
  buddy: string;
  checkIn: string;
}

const onboardingJourneys: OnboardingJourney[] = [
  {
    name: "Lina Köster",
    role: "Account Executive",
    phase: "Enablement Week",
    progress: 72,
    buddy: "Helena Voigt",
    checkIn: "Heute · 14:00",
  },
  {
    name: "Teo Berg",
    role: "Solutions Engineer",
    phase: "Tech Stack Deep Dive",
    progress: 46,
    buddy: "Daniel Kluge",
    checkIn: "Mittwoch",
  },
  {
    name: "Selin Arp",
    role: "CS Manager",
    phase: "Team Shadowing",
    progress: 28,
    buddy: "Mara Schneider",
    checkIn: "Freitag",
  },
];

type AbsenceState = "confirmed" | "pending" | "today";

const absenceTone: Record<AbsenceState, string> = {
  confirmed: "bg-slate-600/40 text-slate-100",
  pending: "bg-amber-500/10 text-amber-200",
  today: "bg-sky-500/10 text-sky-200",
};

const absenceEntries: Array<{
  name: string;
  type: string;
  range: string;
  state: AbsenceState;
}> = [
  { name: "Nora Falk", type: "Urlaub", range: "12.–16. Feb", state: "confirmed" },
  { name: "Daniel Kluge", type: "Client Offsite", range: "Heute", state: "today" },
  { name: "Sven Meyer", type: "Sabbatical", range: "Feb–März", state: "pending" },
];

const hiringStages: Array<{ stage: string; candidates: number; delta: string; conversion: number }> = [
  { stage: "Sourcing", candidates: 18, delta: "+3", conversion: 38 },
  { stage: "Interviews", candidates: 9, delta: "+1", conversion: 61 },
  { stage: "Case / Panel", candidates: 4, delta: "0", conversion: 75 },
  { stage: "Offer", candidates: 2, delta: "-1", conversion: 90 },
];

const pulseMetrics = [
  { label: "eNPS", value: "+45", detail: "+5 QoQ" },
  { label: "Retention Forecast", value: "95%", detail: "Rolling 12 Monate" },
  { label: "Learning Stunden", value: "42h", detail: "Ø pro Person" },
];

type TaskState = "completed" | "progress" | "pending";

const taskTone: Record<TaskState, string> = {
  completed: "bg-emerald-500/10 text-emerald-300",
  progress: "bg-sky-500/10 text-sky-200",
  pending: "bg-slate-600/40 text-slate-200",
};

const peopleTasks: Array<{
  title: string;
  owner: string;
  due: string;
  state: TaskState;
}> = [
  { title: "Feedback Zyklus Q1 abschließen", owner: "People Ops", due: "Heute", state: "progress" },
  { title: "Comp Review vorbereiten", owner: "Finance", due: "21. Feb", state: "pending" },
  { title: "Hybrid Policy unterschreiben lassen", owner: "Leadership Circle", due: "Abgeschlossen", state: "completed" },
];

const enablementTracks: Array<{ name: string; cohort: string; progress: number; status: string }> = [
  { name: "Deal Desk Playbook", cohort: "Revenue Team", progress: 82, status: "Live" },
  { name: "Journey Builder Zertifikat", cohort: "Delivery", progress: 54, status: "In Arbeit" },
  { name: "Prisma + NestJS Bootcamp", cohort: "Product & Tech", progress: 68, status: "Sprint 2" },
];

export default function MitarbeiterPage() {
  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">People Ops</p>
          <h1 className="text-3xl font-semibold text-white">Mitarbeiter</h1>
          <p className="text-sm text-slate-400">Headcount, Onboarding, Abwesenheiten und Hiring in einem Tab – bereit für dein CRM.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button size="sm">
            <UserPlus className="h-4 w-4" /> Mitarbeiter hinzufügen
          </Button>
          <Button variant="ghost" size="sm">
            <Calendar className="h-4 w-4" /> Kapazitätsplan öffnen
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {workforceStats.map((stat) => (
          <Card key={stat.label}>
            <div className="flex items-center gap-3">
              <span className="rounded-2xl border border-white/10 bg-white/5 p-3 text-white">
                <stat.icon className="h-4 w-4" />
              </span>
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{stat.label}</p>
                <p className="text-2xl font-semibold text-white">{stat.value}</p>
                <p className="text-xs text-slate-500">{stat.hint}</p>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 xl:grid-cols-[1.7fr_1.3fr]">
        <Card
          title="Team Footprint"
          description="Verteilung, Stimmung und Kapazität je Funktion."
          action={
            <Button variant="ghost" size="sm">
              <Sparkles className="h-4 w-4" /> Snapshot teilen
            </Button>
          }
        >
          <div className="space-y-4">
            {teamSnapshot.map((team) => (
              <div key={team.team} className="rounded-2xl border border-white/5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{team.team}</p>
                    <p className="text-xs text-slate-500">{team.lead} · {team.focus}</p>
                  </div>
                  <p className="text-sm text-slate-300">{team.headcount} Personen</p>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                  <span className={clsx("rounded-full px-3 py-1", satisfactionBadge[team.satisfaction])}>
                    {team.satisfaction === "high" && "Stabil"}
                    {team.satisfaction === "focus" && "Im Fokus"}
                    {team.satisfaction === "watch" && "Needs Support"}
                  </span>
                  <span className="rounded-full bg-white/5 px-3 py-1 text-slate-300">Open Roles: {team.openRoles}</span>
                  <span className="text-slate-500">Auslastung {team.capacity}%</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-sky-400 via-cyan-300 to-fuchsia-400"
                    style={{ width: `${team.capacity}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Onboarding Journeys"
          description="Buddy, Tasks und Check-ins in Echtzeit."
          action={
            <Button variant="secondary" size="sm">
              <Briefcase className="h-4 w-4" /> Playbook öffnen
            </Button>
          }
        >
          <div className="space-y-4">
            {onboardingJourneys.map((journey) => (
              <div key={journey.name} className="rounded-2xl border border-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{journey.name}</p>
                    <p className="text-xs text-slate-500">{journey.role}</p>
                  </div>
                  <span className="text-xs text-slate-400">{journey.checkIn}</span>
                </div>
                <p className="mt-2 text-sm text-slate-300">{journey.phase}</p>
                <div className="mt-3 h-1.5 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-emerald-400 to-sky-400"
                    style={{ width: `${journey.progress}%` }}
                  />
                </div>
                <div className="mt-2 flex items-center justify-between text-xs text-slate-400">
                  <span>Buddy: {journey.buddy}</span>
                  <span>{journey.progress}% abgeschlossen</span>
                </div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card
          title="Abwesenheiten"
          description="Kalender synchronisiert · Freigaben laufen über Prisma Workflow."
          action={
            <Button variant="ghost" size="sm">
              <Plane className="h-4 w-4" /> Abwesenheit planen
            </Button>
          }
        >
          <div className="space-y-3">
            {absenceEntries.map((entry) => (
              <div key={entry.name} className="flex items-center justify-between rounded-2xl border border-white/5 p-4">
                <div>
                  <p className="text-sm font-semibold text-white">{entry.name}</p>
                  <p className="text-xs text-slate-500">{entry.type}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-slate-300">{entry.range}</p>
                  <span className={clsx("mt-1 inline-flex rounded-full px-3 py-1 text-xs", absenceTone[entry.state])}>
                    {entry.state === "today" && "Heute"}
                    {entry.state === "confirmed" && "Bestätigt"}
                    {entry.state === "pending" && "Ausstehend"}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Hiring Pipeline"
          description="Stages, Conversion und offene Rollen."
          action={
            <Button variant="ghost" size="sm">
              <ShieldCheck className="h-4 w-4" /> Rollen freigeben
            </Button>
          }
        >
          <div className="space-y-4">
            {hiringStages.map((stage) => (
              <div key={stage.stage} className="rounded-2xl border border-white/5 p-4">
                <div className="flex items-center justify-between text-sm">
                  <p className="font-semibold text-white">{stage.stage}</p>
                  <span className="text-slate-400">{stage.candidates} Kandidat:innen · {stage.delta}</span>
                </div>
                <div className="mt-2 h-1.5 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 to-rose-400"
                    style={{ width: `${stage.conversion}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">Conversion {stage.conversion}%</p>
              </div>
            ))}
            <div className="rounded-2xl border border-dashed border-white/10 p-4 text-xs text-slate-400">
              Aktive Rollen: Account Executive · Implementation Lead · FP&A Analyst
            </div>
          </div>
        </Card>

        <Card title="People Health" description="Pulse, Retention und Fokusfelder.">
          <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
            {pulseMetrics.map((metric) => (
              <div key={metric.label} className="rounded-2xl border border-white/5 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-slate-500">{metric.label}</p>
                <p className="mt-2 text-2xl font-semibold text-white">{metric.value}</p>
                <p className="text-xs text-slate-500">{metric.detail}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 rounded-2xl border border-dashed border-white/10 p-4 text-sm text-slate-300">
            Fokus: Coaching für Team Operations, Listening Tour für Product geplant.
          </div>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="People Ops Aufgaben" description="To-dos für dieses Sprint-Commitment.">
          <div className="space-y-3">
            {peopleTasks.map((task) => (
              <div key={task.title} className="flex items-center gap-3 rounded-2xl border border-white/5 p-4">
                <span className={clsx("inline-flex rounded-full p-2", taskTone[task.state])}>
                  {task.state === "completed" ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
                </span>
                <div className="flex-1">
                  <p className="text-sm font-semibold text-white">{task.title}</p>
                  <p className="text-xs text-slate-500">{task.owner}</p>
                </div>
                <span className="text-xs text-slate-400">{task.due}</span>
              </div>
            ))}
          </div>
        </Card>

        <Card
          title="Enablement & Skills"
          description="Zertifizierungen, Trainings und Fortschritt."
          action={
            <Button size="sm" variant="ghost">
              <Award className="h-4 w-4" /> Zertifikate
            </Button>
          }
        >
          <div className="space-y-4">
            {enablementTracks.map((track) => (
              <div key={track.name} className="rounded-2xl border border-white/5 p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-white">{track.name}</p>
                    <p className="text-xs text-slate-500">{track.cohort}</p>
                  </div>
                  <span className="text-xs text-slate-400">{track.status}</span>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-violet-400 to-indigo-400"
                    style={{ width: `${track.progress}%` }}
                  />
                </div>
                <p className="mt-1 text-xs text-slate-500">{track.progress}% abgeschlossen</p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </section>
  );
}
