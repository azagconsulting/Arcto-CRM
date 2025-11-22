"use client";

import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { CustomerMessage, ApiSettings } from "@/lib/types";
import { useRouter } from "next/navigation";
import { Mail, Loader2, Settings } from "lucide-react";

export default function DashboardPage() {
  const { user, authorizedRequest } = useAuth();
  const router = useRouter();
  const displayName = useMemo(() => {
    if (!user) {
      return "";
    }
    if (user.firstName || user.lastName) {
      return `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
    }
    return user.email ?? "";
  }, [user]);

  const [recentMessages, setRecentMessages] = useState<CustomerMessage[]>([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageError, setMessageError] = useState<string | null>(null);
  const [apiSettings, setApiSettings] = useState<ApiSettings | null>(null);
  const [apiLoading, setApiLoading] = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

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
        if (!active) return;
        setMessageError(err instanceof Error ? err.message : "Nachrichten konnten nicht geladen werden.");
      })
      .finally(() => active && setLoadingMessages(false));

    return () => {
      active = false;
      controller.abort();
    };
  }, [authorizedRequest]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    setApiLoading(true);
    setApiError(null);
    authorizedRequest<ApiSettings | null>("/settings/api", { signal: controller.signal })
      .then((data) => {
        if (!mounted) return;
        setApiSettings(data);
      })
      .catch((err) => {
        if (!mounted) return;
        setApiError(err instanceof Error ? err.message : "API-Einstellungen konnten nicht geladen werden.");
      })
      .finally(() => mounted && setApiLoading(false));
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest]);

  const handleOpenMessage = (id: string) => {
    router.push(`/workspace/messages?unassigned=${encodeURIComponent(id)}`);
  };

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Workspace</p>
        <h1 className="text-3xl font-semibold text-white">
          Willkommen zurück{displayName ? `, ${displayName}` : ""}
        </h1>
        <p className="text-sm text-slate-400">Das Dashboard wird bald mit deinen wichtigsten Kennzahlen gefüllt.</p>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
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
            <Button
              size="sm"
              variant="ghost"
              onClick={() => router.push("/workspace/messages")}
            >
              Alle Nachrichten öffnen
            </Button>
          </div>
        </Card>

        <Card
          title="Analytics"
          description="Google Analytics einbinden und Statistiken sehen."
          action={
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/settings?tab=api")}
              title="API & Integrationen"
            >
              <Settings className="h-4 w-4" />
            </Button>
          }
        >
          <div className="space-y-3 text-sm text-slate-300">
            {apiLoading && (
              <p className="flex items-center gap-2 text-xs text-slate-400">
                <Loader2 className="h-4 w-4 animate-spin" /> Lade API-Einstellungen...
              </p>
            )}
            {apiError && <p className="text-xs text-rose-300">{apiError}</p>}
            {apiSettings?.embedUrl ? (
              <div className="overflow-hidden rounded-2xl border border-white/10 bg-black/30">
                <iframe
                  title="Analytics"
                  src={apiSettings.embedUrl}
                  className="h-96 w-full border-0"
                  allow="fullscreen"
                />
              </div>
            ) : (
              <div className="flex h-48 flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-white/10 bg-white/5 text-slate-500">
                <p className="text-xs text-slate-400">
                  Noch kein GA-Embed hinterlegt. Hinterlege eine Iframe-URL oder Service-Account unter API & Integrationen.
                </p>
                {apiSettings?.hasServiceAccount ? (
                  <p className="text-[11px] text-emerald-300">Service-Account vorhanden – füge die Embed-URL hinzu.</p>
                ) : null}
              </div>
            )}
          </div>
        </Card>
      </div>
    </section>
  );
}
