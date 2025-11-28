"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Download,
  BarChart3,
  Clock3,
  Filter,
  Loader2,
  MousePointerClick,
  RefreshCw,
  Search,
  Sparkles,
} from "lucide-react";
import { clsx } from "clsx";

import { useAuth } from "@/components/auth-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { TrackingPageStat, TrackingSummary, TrackingTimeseriesPoint } from "@/lib/types";

type RangeKey = "7" | "30" | "90" | "custom";
type SortKey = "views" | "ctr" | "duration" | "clicks" | "unique";

export default function TrackingPage() {
  const { authorizedRequest } = useAuth();
  const [trackingSummary, setTrackingSummary] = useState<TrackingSummary | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<RangeKey>("7");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [pathQuery, setPathQuery] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("views");
  const [sortDir, setSortDir] = useState<"desc" | "asc">("desc");

  const sourceTotals = useMemo(() => {
    const series = trackingSummary?.timeseries ?? [];
    return series.reduce(
      (acc, point) => {
        acc.organic += point.organic;
        acc.direct += point.direct;
        acc.total += point.views;
        return acc;
      },
      { organic: 0, direct: 0, total: 0 },
    );
  }, [trackingSummary]);

  const loadTracking = useCallback(
    async (options?: { days?: number; from?: string; to?: string; signal?: AbortSignal }) => {
      setTrackingLoading(true);
      setTrackingError(null);
      try {
        const params = new URLSearchParams();
        if (options?.from) params.set("from", options.from);
        if (options?.to) params.set("to", options.to);
        if (!options?.from && !options?.to) {
          params.set("days", String(options?.days ?? 7));
        }
        const data = await authorizedRequest<TrackingSummary>(`/tracking/summary?${params.toString()}`, {
          signal: options?.signal,
        });
        setTrackingSummary(data ?? null);
      } catch (err) {
        if (options?.signal?.aborted) return;
        setTrackingError(err instanceof Error ? err.message : "Tracking konnte nicht geladen werden.");
      } finally {
        if (!options?.signal?.aborted) {
          setTrackingLoading(false);
        }
      }
    },
    [authorizedRequest],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadTracking({ days: 7, signal: controller.signal });
    return () => controller.abort();
  }, [loadTracking]);

  const filteredPages = useMemo(() => {
    if (!trackingSummary?.pages) return [];
    const query = pathQuery.trim().toLowerCase();
    let pages = trackingSummary.pages;
    if (query) {
      pages = pages.filter((page) => page.path.toLowerCase().includes(query));
    }
    const sorters: Record<SortKey, (page: TrackingPageStat) => number> = {
      views: (p) => p.views,
      ctr: (p) => p.clickRate,
      duration: (p) => p.avgDurationMs,
      clicks: (p) => p.clicks,
      unique: (p) => p.uniqueVisitors,
    };
    const selector = sorters[sortKey];
    const sorted = [...pages].sort((a, b) => {
      const delta = selector(a) - selector(b);
      return sortDir === "desc" ? -delta : delta;
    });
    return sorted;
  }, [pathQuery, sortDir, sortKey, trackingSummary?.pages]);

  const insights = useMemo(() => {
    if (!trackingSummary?.pages?.length) return [];
    const pages = trackingSummary.pages;
    const minViews = 5;
    const byCtr = [...pages].filter((p) => p.views >= minViews).sort((a, b) => b.clickRate - a.clickRate);
    const byDuration = [...pages].filter((p) => p.views >= minViews).sort((a, b) => b.avgDurationMs - a.avgDurationMs);
    const topCtr = byCtr[0];
    const topDuration = byDuration[0];
    return [
      topCtr && `Beste CTR: ${formatPercent(topCtr.clickRate)} auf ${topCtr.path}`,
      topDuration && `Längste Verweildauer: ${formatDuration(topDuration.avgDurationMs)} auf ${topDuration.path}`,
      `Organisch-Anteil: ${formatPercent(trackingSummary.totals.organicShare)} im Zeitraum`,
    ].filter(Boolean) as string[];
  }, [trackingSummary]);

  const trends = useMemo(() => {
    const series = trackingSummary?.timeseries ?? [];
    if (series.length < 2) return null;
    const first = series[0];
    const last = series[series.length - 1];
    const delta = (current: number, prev: number) => ({
      value: current - prev,
      pct: prev ? (current - prev) / prev : current ? 1 : 0,
    });
    return {
      views: delta(last.views, first.views),
      clicks: delta(last.clicks, first.clicks),
      organic: delta(last.organic, first.organic),
    };
  }, [trackingSummary]);

  const refresh = () => {
    if (rangeKey === "custom" && customFrom && customTo) {
      void loadTracking({ from: customFrom, to: customTo });
    } else if (rangeKey === "90") {
      void loadTracking({ days: 90 });
    } else if (rangeKey === "30") {
      void loadTracking({ days: 30 });
    } else {
      void loadTracking({ days: 7 });
    }
  };

  return (
    <section className="space-y-6">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Workspace</p>
        <h1 className="text-3xl font-semibold text-white">Tracking Analytics</h1>
        <p className="text-sm text-slate-400">Pageviews, CTR, Verweildauer und Traffic-Mix auf einen Blick.</p>
      </div>

      <Card
        title="Zeitraum & Filter"
        description="Schnellbereiche oder eigenes Datum wählen. Optional nach Pfad filtern."
        action={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs shadow-[0_10px_30px_rgba(15,23,42,0.35)]">
              <RangeChip label="7T" active={rangeKey === "7"} onClick={() => { setRangeKey("7"); void loadTracking({ days: 7 }); }} />
              <RangeChip label="30T" active={rangeKey === "30"} onClick={() => { setRangeKey("30"); void loadTracking({ days: 30 }); }} />
              <RangeChip label="90T" active={rangeKey === "90"} onClick={() => { setRangeKey("90"); void loadTracking({ days: 90 }); }} />
              <RangeChip label="Custom" active={rangeKey === "custom"} onClick={() => setRangeKey("custom")} />
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full border border-white/10 bg-white/5"
              onClick={refresh}
              aria-label="Tracking neu laden"
            >
              {trackingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col text-xs text-slate-300">
              Von
              <Input
                type="date"
                value={customFrom}
                onChange={(e) => setCustomFrom(e.target.value)}
                className="w-40 rounded-full bg-slate-900/60"
              />
            </label>
            <label className="flex flex-col text-xs text-slate-300">
              Bis
              <Input
                type="date"
                value={customTo}
                onChange={(e) => setCustomTo(e.target.value)}
                className="w-40 rounded-full bg-slate-900/60"
              />
            </label>
            <Button
              size="sm"
              className="rounded-full px-4"
              disabled={!customFrom || !customTo}
              onClick={() => {
                if (!customFrom || !customTo) return;
                setRangeKey("custom");
                void loadTracking({ from: customFrom, to: customTo });
              }}
            >
              Anwenden
            </Button>
          </div>
          <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-2 text-sm text-slate-300">
            <Search className="h-4 w-4" />
            <input
              className="bg-transparent text-sm text-white outline-none placeholder:text-slate-500"
              placeholder="Pfad filtern (z. B. /pricing)"
              value={pathQuery}
              onChange={(e) => setPathQuery(e.target.value)}
            />
          </div>
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-4">
        <MetricTile icon={BarChart3} label="Pageviews" value={formatNumber(trackingSummary?.totals.views ?? 0)} hint="Alle Events im Zeitraum" />
        <MetricTile
          icon={MousePointerClick}
          label="Klickrate"
          value={formatPercent((trackingSummary?.totals.clicks ?? 0) / Math.max(trackingSummary?.totals.views ?? 1, 1))}
          hint={`${formatNumber(trackingSummary?.totals.clicks ?? 0)} Klicks`}
        />
        <MetricTile
          icon={Clock3}
          label="Ø Verweildauer"
          value={formatDuration(trackingSummary?.totals.avgDurationMs ?? 0)}
          hint="Über alle Seiten"
        />
        <MetricTile
          icon={Sparkles}
          label="Organisch-Anteil"
          value={formatPercent(trackingSummary?.totals.organicShare ?? 0)}
          hint="vs. Direkt/Referrals"
        />
      </div>

      <Card
        title="Traffic Verlauf"
        description="Pageviews (solid) und organisch (dashed)."
        action={
          <div className="flex items-center gap-2 text-xs text-slate-400">
            <Filter className="h-4 w-4" />
            <span>{trackingSummary ? `${formatDate(trackingSummary.since)} – ${formatDate(trackingSummary.until)}` : "Zeitraum"}</span>
          </div>
        }
      >
        {trackingError && <p className="text-xs text-rose-300">{trackingError}</p>}
        {trackingLoading && !trackingSummary ? (
          <p className="flex items-center gap-2 text-xs text-slate-400">
            <Loader2 className="h-4 w-4 animate-spin" /> Lade Tracking...
          </p>
        ) : null}
        {trackingSummary ? <StockLineChart data={trackingSummary.timeseries} /> : <p className="text-sm text-slate-400">Keine Daten.</p>}
      </Card>

      <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
        <Card title="Traffic-Mix" description="Organisch vs. Direkt/Referrals">
          <SourceSplit organic={sourceTotals.organic} direct={sourceTotals.direct} total={sourceTotals.total} />
        </Card>

        <Card title="Trends & Veränderungen" description="Start → Ende des Zeitraums">
          {trends ? (
            <div className="space-y-2 text-sm text-slate-200">
              <TrendLine label="Pageviews" change={trends.views} />
              <TrendLine label="Klicks" change={trends.clicks} />
              <TrendLine label="Organisch" change={trends.organic} />
            </div>
          ) : (
            <p className="text-sm text-slate-400">Zu wenige Punkte für Trends.</p>
          )}
        </Card>
      </div>

      <div className="grid gap-4 xl:grid-cols-[2fr_1fr]">
        <Card
          title="Seiten-Performance"
          description="Sortiere nach Views, CTR oder Verweildauer."
          action={
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-300">
              <span>Sortieren nach</span>
              <SortSelect sortKey={sortKey} sortDir={sortDir} onChange={setSortKey} onToggleDir={() => setSortDir((d) => (d === "desc" ? "asc" : "desc"))} />
              <Button
                size="xs"
                variant="ghost"
                className="rounded-full border border-white/10 bg-white/5 text-[11px]"
                onClick={() => exportPagesCsv(filteredPages)}
              >
                <Download className="mr-1 h-3 w-3" />
                CSV
              </Button>
            </div>
          }
        >
          <PageTable pages={filteredPages} />
        </Card>

        <Card title="Insights" description="Schnelle Auffälligkeiten">
          <ul className="space-y-3 text-sm text-slate-200">
            {insights.length ? (
              insights.map((item) => (
                <li key={item} className="flex items-start gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2">
                  <ArrowUpRight className="mt-0.5 h-4 w-4 text-sky-300" />
                  <span>{item}</span>
                </li>
              ))
            ) : (
              <li className="text-slate-400">Noch keine Insights verfügbar.</li>
            )}
          </ul>
        </Card>
      </div>
    </section>
  );
}

function exportPagesCsv(pages: TrackingPageStat[]) {
  if (typeof window === "undefined" || pages.length === 0) return;
  const header = [
    "path",
    "views",
    "uniqueVisitors",
    "clicks",
    "clickRate",
    "avgDurationMs",
    "organicViews",
    "directViews",
  ];
  const rows = pages.map((p) =>
    [
      p.path,
      p.views,
      p.uniqueVisitors,
      p.clicks,
      p.clickRate.toFixed(4),
      p.avgDurationMs,
      p.organicViews,
      p.directViews,
    ]
      .map((cell) => `"${String(cell).replace(/"/g, '""')}"`)
      .join(","),
  );
  const csv = [header.join(","), ...rows].join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "tracking-pages.csv";
  link.click();
  URL.revokeObjectURL(url);
}

function PageTable({ pages }: { pages: TrackingPageStat[] }) {
  if (!pages.length) {
    return <p className="text-sm text-slate-400">Keine Seiten im Zeitraum gefunden.</p>;
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/5">
      <div className="grid grid-cols-[1.3fr_repeat(5,minmax(0,1fr))] gap-3 border-b border-white/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-slate-400">
        <span>Pfad</span>
        <span className="text-right">Views</span>
        <span className="text-right">Unique</span>
        <span className="text-right">CTR</span>
        <span className="text-right">Ø Zeit</span>
        <span className="text-right">Klicks</span>
      </div>
      <div className="divide-y divide-white/5">
        {pages.map((page) => (
          <div key={page.path} className="grid grid-cols-[1.3fr_repeat(5,minmax(0,1fr))] items-center gap-3 px-4 py-3 text-sm text-slate-200">
            <div className="truncate text-white">{page.path}</div>
            <div className="text-right font-semibold">{formatNumber(page.views)}</div>
            <div className="text-right text-slate-300">{formatNumber(page.uniqueVisitors)}</div>
            <div className="text-right text-slate-300">{formatPercent(page.clickRate)}</div>
            <div className="text-right text-slate-300">{formatDuration(page.avgDurationMs)}</div>
            <div className="text-right text-slate-300">{formatNumber(page.clicks)}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SortSelect({
  sortKey,
  sortDir,
  onChange,
  onToggleDir,
}: {
  sortKey: SortKey;
  sortDir: "asc" | "desc";
  onChange: (key: SortKey) => void;
  onToggleDir: () => void;
}) {
  return (
    <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1">
      <select
        className="bg-transparent text-xs text-white outline-none"
        value={sortKey}
        onChange={(e) => onChange(e.target.value as SortKey)}
      >
        <option value="views">Views</option>
        <option value="unique">Unique</option>
        <option value="ctr">CTR</option>
        <option value="duration">Verweildauer</option>
        <option value="clicks">Klicks</option>
      </select>
      <button
        type="button"
        onClick={onToggleDir}
        className="rounded-full border border-white/10 bg-white/10 px-2 py-1 text-[11px] text-slate-200"
      >
        {sortDir === "desc" ? "↓" : "↑"}
      </button>
    </div>
  );
}

function StockLineChart({ data }: { data: TrackingTimeseriesPoint[] }) {
  if (!data.length) {
    return <p className="text-sm text-slate-400">Keine Daten für den Zeitraum.</p>;
  }

  const width = 640;
  const height = 220;
  const margin = 14;
  const maxValue = Math.max(...data.map((point) => Math.max(point.views, point.organic, point.direct)), 1);
  const usableHeight = height - margin * 2;
  const step = data.length > 1 ? (width - margin * 2) / (data.length - 1) : 0;

  const points = data.map((point, index) => {
    const x = margin + index * step;
    const yViews = height - margin - (point.views / maxValue) * usableHeight;
    const yOrganic = height - margin - (point.organic / maxValue) * usableHeight;
    return { x, yViews, yOrganic, value: point.views, label: point.date };
  });

  const viewPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.yViews.toFixed(1)}`).join(" ");
  const organicPath = points.map((point, index) => `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.yOrganic.toFixed(1)}`).join(" ");

  const areaPath = [
    `M ${points[0].x.toFixed(1)} ${height - margin}`,
    ...points.map((point) => `L ${point.x.toFixed(1)} ${point.yViews.toFixed(1)}`),
    `L ${points[points.length - 1].x.toFixed(1)} ${height - margin}`,
    "Z",
  ].join(" ");

  const lastPoint = points[points.length - 1];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Traffic Verlauf" className="h-52 w-full">
      <defs>
        <linearGradient id="trafficArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="rgba(14,165,233,0.35)" />
          <stop offset="100%" stopColor="rgba(14,165,233,0.02)" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill="url(#trafficArea)" />
      <path d={viewPath} fill="none" stroke="rgba(56,189,248,0.8)" strokeWidth={2.5} strokeLinecap="round" />
      <path
        d={organicPath}
        fill="none"
        stroke="rgba(52,211,153,0.9)"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeDasharray="6 4"
      />
      <circle cx={lastPoint.x} cy={lastPoint.yViews} r={4} fill="#0ea5e9" stroke="white" strokeWidth={2} />
    </svg>
  );
}

function TrendLine({ label, change }: { label: string; change: { value: number; pct: number } }) {
  const isUp = change.value > 0;
  const deltaLabel = formatNumber(Math.abs(change.value));
  const pctLabel = `${Math.round(change.pct * 1000) / 10}%`;
  return (
    <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-3 py-2">
      <div>
        <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
        <p className="text-sm text-slate-200">
          {isUp ? "▲" : change.value < 0 ? "▼" : "—"} {deltaLabel} ({pctLabel})
        </p>
      </div>
    </div>
  );
}

function SourceSplit({ organic, direct, total }: { organic: number; direct: number; total: number }) {
  const safeTotal = Math.max(total, organic + direct, 0);
  const baseTotal = safeTotal || 0;
  const organicPercent = baseTotal ? Math.min(100, Math.max(0, (organic / baseTotal) * 100)) : 0;
  const directPercent = baseTotal ? Math.min(100, Math.max(0, (direct / baseTotal) * 100)) : 0;
  const otherCount = Math.max(0, baseTotal - organic - direct);
  const otherPercent = baseTotal ? Math.max(0, 100 - organicPercent - directPercent) : 0;

  return (
    <div>
      <div className="mt-2 h-3 overflow-hidden rounded-full border border-white/10 bg-white/5">
        <div className="flex h-full">
          <span style={{ width: `${organicPercent}%` }} className="h-full bg-emerald-500/70" />
          <span style={{ width: `${directPercent}%` }} className="h-full bg-sky-500/70" />
          <span style={{ width: `${otherPercent}%` }} className="h-full bg-slate-500/50" />
        </div>
      </div>
      <div className="mt-3 space-y-2 text-xs text-slate-300">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-400" />
            <span>Organisch</span>
          </div>
          <span>{formatNumber(organic)} Aufrufe</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-sky-400" />
            <span>Direkt</span>
          </div>
          <span>{formatNumber(direct)} Aufrufe</span>
        </div>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-slate-400" />
            <span>Referrals/sonstiges</span>
          </div>
          <span>{formatNumber(otherCount)} Aufrufe</span>
        </div>
      </div>
    </div>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 p-4 shadow-[0_10px_40px_rgba(8,47,73,0.35)]">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">{label}</p>
        <p className="mt-1 text-2xl font-semibold text-white">{value}</p>
        {hint && <p className="text-xs text-slate-400">{hint}</p>}
      </div>
      <span className="flex h-10 w-10 items-center justify-center rounded-2xl bg-sky-500/10 text-sky-200">
        <Icon className="h-5 w-5" />
      </span>
    </div>
  );
}

function RangeChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "rounded-lg px-2 py-1",
        active ? "bg-white/20 text-white" : "text-slate-300 hover:bg-white/10",
      )}
    >
      {label}
    </button>
  );
}

function formatNumber(value: number) {
  return value.toLocaleString("de-DE");
}

function formatPercent(value: number) {
  return `${Math.round(value * 1000) / 10}%`;
}

function formatDuration(durationMs: number) {
  if (!durationMs || Number.isNaN(durationMs)) return "0s";
  const totalSeconds = Math.round(durationMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes === 0) return `${seconds}s`;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

function formatDate(value: string) {
  const date = new Date(value);
  return date.toLocaleDateString("de-DE", { day: "2-digit", month: "short" });
}
