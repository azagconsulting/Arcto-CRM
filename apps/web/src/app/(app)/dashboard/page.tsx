"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Clock3, Globe2, Loader2, Mail, MousePointerClick, RefreshCw, TrendingUp } from "lucide-react";
import { useRouter } from "next/navigation";
import { clsx } from "clsx";

import { useAuth } from "@/components/auth-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type {
  CustomerMessage,
  TrackingPageStat,
  TrackingSummary,
  TrackingTimeseriesPoint,
} from "@/lib/types";

export default function DashboardPage() {
  const { user, authorizedRequest } = useAuth();
  const router = useRouter();
  const displayName = useMemo(() => {
    if (!user) return "";
    if (user.firstName || user.lastName) {
      return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
    }
    return user.email ?? "";
  }, [user]);

  const [recentMessages, setRecentMessages] = useState<CustomerMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);

  const [trackingSummary, setTrackingSummary] = useState<TrackingSummary | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);
  const [trackingError, setTrackingError] = useState<string | null>(null);
  const [rangeKey, setRangeKey] = useState<"7" | "30" | "custom">("7");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setLoadingMessages(true);
    setMessageError(null);
    authorizedRequest<CustomerMessage[]>("/messages/unassigned?limit=3", {
      signal: controller.signal,
    })
      .then((data) => {
        if (!active) return;
        setRecentMessages(data ?? []);
      })
      .catch((err) => {
        if (!active || (err instanceof DOMException && err.name === "AbortError")) return;
        setMessageError(err instanceof Error ? err.message : "Nachrichten konnten nicht geladen werden.");
      })
      .finally(() => active && setLoadingMessages(false));

    return () => {
      active = false;
      controller.abort();
    };
  }, [authorizedRequest]);

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

  const handleOpenMessage = (id: string) => {
    router.push(`/workspace/messages?unassigned=${encodeURIComponent(id)}`);
  };

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

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Workspace</p>
        <h1 className="text-3xl font-semibold text-white">
          Willkommen zurück{displayName ? `, ${displayName}` : ""}
        </h1>
        <p className="text-sm text-slate-400">
          Eigenes Tracking für jede Seite – Pageviews, Klickrate, Verweildauer und Traffic-Mix.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card
          title="Tracking & Traffic"
          description="Eigene Events statt GA: Pageviews, Klicks, Verweildauer."
          action={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <div className="flex items-center gap-1 rounded-full border border-white/10 bg-white/10 px-2 py-1 text-xs shadow-[0_10px_30px_rgba(15,23,42,0.35)]">
                <RangeChip
                  label="7T"
                  active={rangeKey === "7"}
                  onClick={() => {
                    setRangeKey("7");
                    void loadTracking({ days: 7 });
                  }}
                />
                <RangeChip
                  label="30T"
                  active={rangeKey === "30"}
                  onClick={() => {
                    setRangeKey("30");
                    void loadTracking({ days: 30 });
                  }}
                />
                <RangeChip
                  label="Custom"
                  active={rangeKey === "custom"}
                  onClick={() => setRangeKey("custom")}
                />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="rounded-full border border-white/10 bg-white/5"
                onClick={() => {
                  if (rangeKey === "custom" && customFrom && customTo) {
                    void loadTracking({ from: customFrom, to: customTo });
                  } else if (rangeKey === "30") {
                    void loadTracking({ days: 30 });
                  } else {
                    void loadTracking({ days: 7 });
                  }
                }}
              >
                {trackingLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              </Button>
            </div>
          }
        >
          {trackingError && <p className="text-xs text-rose-300">{trackingError}</p>}
          {trackingLoading && !trackingSummary ? (
            <p className="flex items-center gap-2 text-xs text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Lade Tracking...
            </p>
          ) : null}
          {trackingSummary ? (
            <div className="space-y-5">
              {rangeKey === "custom" && (
                <div className="flex flex-wrap items-start justify-end gap-3 rounded-2xl border border-white/10 bg-white/5 p-3 text-xs">
                  <div className="flex items-start gap-2">
                    <label className="flex flex-col gap-1 text-slate-300">
                      Von
                      <Input
                        type="date"
                        value={customFrom}
                        onChange={(e) => setCustomFrom(e.target.value)}
                        className="w-36 rounded-full bg-slate-900/60"
                      />
                    </label>
                    <label className="flex flex-col gap-1 text-slate-300">
                      Bis
                      <Input
                        type="date"
                        value={customTo}
                        onChange={(e) => setCustomTo(e.target.value)}
                        className="w-36 rounded-full bg-slate-900/60"
                      />
                    </label>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Button
                      size="xs"
                      className="rounded-full px-3"
                      disabled={!customFrom || !customTo}
                      onClick={() => {
                        if (!customFrom || !customTo) return;
                        void loadTracking({ from: customFrom, to: customTo });
                      }}
                    >
                      Anwenden
                    </Button>
                    <p className="text-[11px] text-slate-400">Max. 90 Tage.</p>
                  </div>
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                <MetricTile
                  icon={TrendingUp}
                  label="Pageviews"
                  value={formatNumber(trackingSummary.totals.views)}
                  hint={`${formatNumber(trackingSummary.totals.uniqueVisitors)} Besucher`}
                />
                <MetricTile
                  icon={MousePointerClick}
                  label="Klickrate"
                  value={formatPercent(trackingSummary.totals.clicks / Math.max(trackingSummary.totals.views, 1))}
                  hint={`${formatNumber(trackingSummary.totals.clicks)} Klicks`}
                />
                <MetricTile
                  icon={Clock3}
                  label="Ø Verweildauer"
                  value={formatDuration(trackingSummary.totals.avgDurationMs)}
                  hint="Über alle Seiten"
                />
                <MetricTile
                  icon={Globe2}
                  label="Organisch"
                  value={formatPercent(trackingSummary.totals.organicShare)}
                  hint="vs. Direkt/Referrals"
                />
              </div>

              <div className="rounded-2xl border border-white/5 bg-gradient-to-b from-white/10 via-white/5 to-transparent p-4">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>{formatDate(trackingSummary.since)}</span>
                  <span>{formatDate(trackingSummary.until)}</span>
                </div>
                <div className="mt-3">
                  <StockLineChart data={trackingSummary.timeseries} />
                </div>
              </div>

              <div className="grid gap-4 lg:grid-cols-[1.3fr_1fr]">
                <TopPagesList pages={trackingSummary.pages} />
                <SourceSplit organic={sourceTotals.organic} direct={sourceTotals.direct} total={sourceTotals.total} />
              </div>
            </div>
          ) : !trackingLoading ? (
            <p className="text-sm text-slate-400">Noch keine Events gesendet. Das Tracking läuft automatisch auf allen Seiten.</p>
          ) : null}
        </Card>

        <Card
          title="Letzte E-Mails"
          description="Neueste unzugeordnete Nachrichten. Klicke zum Öffnen in Messages."
        >
          {loadingMessages && (
            <p className="flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" /> Nachrichten werden geladen...
            </p>
          )}
          {messageError && <p className="text-xs text-rose-300">{messageError}</p>}
          {!loadingMessages && recentMessages.length === 0 && (
            <p className="text-sm text-slate-400">Keine neuen Nachrichten.</p>
          )}
          <div className="mt-2 space-y-3">
            {recentMessages.map((message) => (
              <button
                key={message.id}
                type="button"
                onClick={() => handleOpenMessage(message.id)}
                className="w-full text-left rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/20 hover:bg-white/10"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 text-sm text-white">
                    <Mail className="h-4 w-4 text-slate-300" />
                    <span className="font-semibold">{message.subject || "Ohne Betreff"}</span>
                  </div>
                  <span className="text-xs text-slate-400">
                    {message.receivedAt || message.sentAt || message.createdAt
                      ? new Date(message.receivedAt ?? message.sentAt ?? message.createdAt).toLocaleString("de-DE")
                      : ""}
                  </span>
                </div>
                <p className="mt-1 text-xs text-slate-400">{message.fromEmail ?? "Unbekannter Absender"}</p>
                <p className="mt-1 line-clamp-2 text-sm text-slate-200">{message.preview ?? message.body}</p>
              </button>
            ))}
          </div>
          <div className="mt-4">
            <Button size="sm" variant="ghost" onClick={() => router.push("/workspace/messages")}>
              Alle Nachrichten öffnen
            </Button>
          </div>
        </Card>
      </div>
    </section>
  );
}

function MetricTile({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: typeof TrendingUp;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-white/5 bg-white/5 px-4 py-3">
      <div className="flex items-center gap-3">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-white/10 text-white">
          <Icon className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[11px] uppercase tracking-[0.3em] text-slate-400">{label}</p>
          <p className="text-lg font-semibold text-white leading-tight">{value}</p>
          {hint ? <p className="text-[11px] text-slate-400">{hint}</p> : null}
        </div>
      </div>
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

function TopPagesList({ pages }: { pages: TrackingPageStat[] }) {
  const top = pages.slice(0, 4);
  if (top.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-white/10 bg-white/5 px-4 py-6 text-sm text-slate-400">
        Noch keine Seitenaufrufe in diesem Zeitraum.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Top Seiten</p>
      <div className="mt-3 space-y-3">
        {top.map((page) => (
          <div key={page.path} className="flex items-center justify-between gap-3 rounded-xl border border-white/5 bg-white/5 px-3 py-2">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-white">{page.path}</p>
              <p className="text-[11px] text-slate-400">
                CTR {formatPercent(page.clickRate)} • Ø {formatDuration(page.avgDurationMs)}
              </p>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-white">{formatNumber(page.views)}</p>
              <p className="text-[11px] text-slate-400">{formatNumber(page.uniqueVisitors)} Besucher</p>
            </div>
          </div>
        ))}
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
    <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
      <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Traffic-Mix</p>
      <div className="mt-3 h-3 overflow-hidden rounded-full border border-white/10 bg-white/5">
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
