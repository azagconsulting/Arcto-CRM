"use client";

import {
  AlertTriangle,
  Loader2,
  Mail,
  MessageSquare,
  Send,
  Sparkles,
} from "lucide-react";
import { clsx } from "clsx";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest } from "@/lib/api";
import { OPENAI_KEY_STORAGE } from "@/lib/constants";
import type {
  Customer,
  CustomerHealth,
  CustomerListResponse,
  CustomerMessage,
  CustomerMessageListResponse,
} from "@/lib/types";

const healthTone: Record<CustomerHealth, string> = {
  GOOD: "text-emerald-300 bg-emerald-500/10",
  ATTENTION: "text-amber-300 bg-amber-500/10",
  RISK: "text-rose-300 bg-rose-500/10",
};

const timestampFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function formatTimestamp(value?: string | null) {
  if (!value) {
    return "";
  }
  return timestampFormatter.format(new Date(value));
}

interface ComposerState {
  contactId: string;
  toEmail: string;
  subject: string;
  body: string;
}

export default function MessagesWorkspacePage() {
  const router = useRouter();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [threadMeta, setThreadMeta] = useState<CustomerMessageListResponse["customer"] | null>(null);
  const [messages, setMessages] = useState<CustomerMessage[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [composer, setComposer] = useState<ComposerState>({
    contactId: "",
    toEmail: "",
    subject: "",
    body: "",
  });
  const [composerNotice, setComposerNotice] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const [sending, setSending] = useState(false);
  const [openAiKey, setOpenAiKey] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setOpenAiKey(window.localStorage.getItem(OPENAI_KEY_STORAGE));
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setLoadingCustomers(true);
    setLoadError(null);

    async function fetchCustomers() {
      try {
        const response = await apiRequest<CustomerListResponse>("/customers?limit=50", {
          signal: controller.signal,
        });
        setCustomers(response.items);
        if (!selectedCustomerId && response.items.length) {
          setSelectedCustomerId(response.items[0].id);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }
        setLoadError(err instanceof Error ? err.message : "Konnte Kunden nicht laden.");
      } finally {
        setLoadingCustomers(false);
      }
    }

    fetchCustomers();
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedCustomerId) {
      setThreadMeta(null);
      setMessages([]);
      return;
    }

    const controller = new AbortController();
    setLoadingThread(true);
    setThreadError(null);

    async function fetchThread() {
      try {
        const response = await apiRequest<CustomerMessageListResponse>(
          `/customers/${selectedCustomerId}/messages`,
          { signal: controller.signal },
        );
        setThreadMeta(response.customer);
        setMessages(response.items);
        const defaultContact = response.customer.contacts[0];
        setComposer({
          contactId: defaultContact?.id ?? "",
          toEmail: defaultContact?.email ?? "",
          subject: "",
          body: "",
        });
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }
        setThreadError(err instanceof Error ? err.message : "Konnte Nachrichten nicht laden.");
      } finally {
        setLoadingThread(false);
      }
    }

    fetchThread();
    return () => controller.abort();
  }, [selectedCustomerId]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) {
      return customers;
    }
    const query = customerSearch.toLowerCase();
    return customers.filter((customer) => customer.name.toLowerCase().includes(query));
  }, [customers, customerSearch]);

  const orderedMessages = useMemo(() => {
    return [...messages].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  }, [messages]);

  const selectedContact = useMemo(() => {
    if (!threadMeta) {
      return null;
    }
    return threadMeta.contacts.find((contact) => contact.id === composer.contactId) ?? null;
  }, [threadMeta, composer.contactId]);

  const canSend = Boolean(
    composer.body.trim() && (selectedContact?.email || composer.toEmail.trim()),
  );

  const handleSend = useCallback(async () => {
    if (!selectedCustomerId) {
      return;
    }
    setSending(true);
    setComposerNotice(null);
    try {
      const payload = {
        contactId: composer.contactId || undefined,
        toEmail: composer.toEmail.trim() || undefined,
        subject: composer.subject.trim(),
        body: composer.body.trim(),
      };
      const response = await apiRequest<CustomerMessage>(
        `/customers/${selectedCustomerId}/messages`,
        {
          method: "POST",
          body: JSON.stringify(payload),
        },
      );
      setMessages((prev) => [response, ...prev]);
      setComposer((current) => ({ ...current, body: "" }));
      setComposerNotice({ type: "success", text: "Nachricht gesendet – wir tracken den Verlauf." });
    } catch (err) {
      setComposerNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Senden fehlgeschlagen.",
      });
    } finally {
      setSending(false);
    }
  }, [composer.body, composer.contactId, composer.subject, composer.toEmail, selectedCustomerId]);

  const handleGenerateAi = useCallback(async () => {
    if (!openAiKey) {
      setAiError("Bitte hinterlege zuerst deinen OpenAI-Key in den Einstellungen.");
      return;
    }
    if (!threadMeta) {
      setAiError("Wähle einen Kunden aus, bevor du den KI-Assistenten nutzt.");
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const history = messages
        .slice()
        .reverse()
        .slice(0, 6)
        .map((message) => {
          const author = message.direction === "INBOUND" ? "Kunde" : "CSM";
          return `${author}: ${message.body}`;
        })
        .join("\n---\n");

      const contactName = selectedContact?.name ?? threadMeta.name;
      const subjectPart = composer.subject ? `Betreff: ${composer.subject}` : "Betreff ist offen.";

      const prompt = `Du bist Customer Success Manager:in bei Arcto. Verfasse eine prägnante, empathische Antwort per E-Mail an ${contactName}. ${subjectPart}\nKontext:\n${history || "Der Kunde wartet auf ein Update."}\nDie Antwort darf maximal 220 Wörter haben und sollte mit einer freundlichen Grußformel enden.`;

      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.5,
          messages: [
            {
              role: "system",
              content: "Du hilfst Customer Success Teams beim Schreiben von professionellen Antworten.",
            },
            { role: "user", content: prompt },
          ],
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI-Fehler: ${response.status}`);
      }

      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content?.trim();

      if (!content) {
        throw new Error("Keine Antwort von OpenAI erhalten.");
      }

      setComposer((current) => ({ ...current, body: content }));
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "KI-Antwort konnte nicht erzeugt werden.");
    } finally {
      setAiLoading(false);
    }
  }, [composer.subject, messages, openAiKey, selectedContact, threadMeta]);

  const handleContactChange = (contactId: string) => {
    if (!threadMeta) {
      return;
    }
    const contact = threadMeta.contacts.find((item) => item.id === contactId);
    setComposer((current) => ({
      ...current,
      contactId,
      toEmail: contact?.email ?? "",
    }));
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Inbox</p>
          <h1 className="text-3xl font-semibold text-white">Messages</h1>
          <p className="text-sm text-slate-400">Echte E-Mails an deine Kunden – inklusive Verlauf, AI-Assistent und Versand aus dem CRM.</p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => router.push("/settings")}>
          <Sparkles className="h-4 w-4" /> API-Key verwalten
        </Button>
      </div>

      <div className="grid gap-6 lg:grid-cols-[300px,1fr]">
        <Card title="Kunden" description="Wähle einen Account, um die Inbox zu öffnen.">
          <Input
            placeholder="Suchen..."
            value={customerSearch}
            onChange={(event) => setCustomerSearch(event.target.value)}
          />
          {loadError && <p className="mt-3 text-xs text-rose-300">{loadError}</p>}
          {loadingCustomers && (
            <p className="mt-4 flex items-center gap-2 text-sm text-slate-300">
              <Loader2 className="h-4 w-4 animate-spin" /> Kunden werden geladen...
            </p>
          )}
          {!loadingCustomers && filteredCustomers.length === 0 && (
            <p className="mt-4 text-sm text-slate-400">Kein Kunde passt auf deine Suche.</p>
          )}
          <div className="mt-4 space-y-2">
            {filteredCustomers.map((customer) => {
              const isActive = customer.id === selectedCustomerId;
              return (
                <button
                  key={customer.id}
                  type="button"
                  onClick={() => setSelectedCustomerId(customer.id)}
                  className={clsx(
                    "w-full rounded-2xl border px-4 py-3 text-left",
                    isActive
                      ? "border-white/30 bg-white/10 text-white"
                      : "border-white/10 text-slate-300 hover:border-white/20",
                  )}
                >
                  <p className="text-sm font-semibold">{customer.name}</p>
                  <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                    <span>{customer.segment}</span>
                    <span
                      className={clsx(
                        "rounded-full px-2 py-0.5 text-[10px] font-semibold",
                        healthTone[customer.health],
                      )}
                    >
                      {customer.health}
                    </span>
                  </div>
                  {customer.lastContactAt && (
                    <p className="mt-1 text-xs text-slate-500">
                      Letzter Kontakt: {formatTimestamp(customer.lastContactAt)}
                    </p>
                  )}
                </button>
              );
            })}
          </div>
        </Card>

        <div className="space-y-6">
          <Card title="Verlauf" description="E-Mails, die zu diesem Kunden gehören.">
            {loadingThread && (
              <p className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Verlauf wird geladen...
              </p>
            )}
            {threadError && !loadingThread && (
              <p className="flex items-center gap-2 text-sm text-rose-300">
                <AlertTriangle className="h-4 w-4" /> {threadError}
              </p>
            )}
            {!loadingThread && !threadError && orderedMessages.length === 0 && (
              <p className="text-sm text-slate-400">Noch keine Nachrichten für diesen Kunden.</p>
            )}
            <div className="mt-4 space-y-4">
              {orderedMessages.map((message) => {
                const isOutbound = message.direction === "OUTBOUND";
                const metaLine = isOutbound
                  ? `Gesendet an ${message.toEmail ?? message.contact?.name ?? "Kontakt"}`
                  : `Empfangen von ${message.fromEmail ?? message.contact?.name ?? "Kontakt"}`;
                const date =
                  formatTimestamp(message.sentAt ?? message.receivedAt ?? message.createdAt);
                return (
                  <div
                    key={message.id}
                    className={clsx("flex", isOutbound ? "justify-end" : "justify-start")}
                  >
                    <div
                      className={clsx(
                        "max-w-2xl rounded-3xl border px-5 py-4 text-sm shadow-lg",
                        isOutbound
                          ? "border-sky-400/40 bg-sky-500/15 text-white"
                          : "border-white/10 bg-white/5 text-slate-100",
                      )}
                    >
                      <div className="flex items-center justify-between text-[11px] uppercase tracking-[0.3em] text-slate-300">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="h-3.5 w-3.5" />
                          {isOutbound ? "Outbound" : "Inbound"}
                        </span>
                        <span>{date}</span>
                      </div>
                      {message.subject && (
                        <p className="mt-2 text-sm font-semibold text-white">{message.subject}</p>
                      )}
                      <p className="mt-2 whitespace-pre-line text-sm text-slate-100">{message.body}</p>
                      <p className="mt-3 text-xs text-slate-400">{metaLine}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            <p className="mt-6 text-xs text-slate-500">Hinweis: Antworten laufen über den hinterlegten SMTP-Zugang.</p>
          </Card>

          <Card
            title="Antwort verfassen"
            description="Wähle Kontakt, Betreff und Text. Versand erfolgt per E-Mail."
            action={
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleGenerateAi}
                disabled={aiLoading}
              >
                {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} KI antworten lassen
              </Button>
            }
          >
            {!openAiKey && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-100">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <p>Für die KI-Antwort benötigst du einen OpenAI-Key unter Einstellungen.</p>
              </div>
            )}
            {aiError && (
              <p className="mb-4 flex items-center gap-2 text-xs text-rose-300">
                <AlertTriangle className="h-3.5 w-3.5" /> {aiError}
              </p>
            )}
            <div className="space-y-4">
              <div>
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Kontakt</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {threadMeta?.contacts.map((contact) => (
                    <button
                      key={contact.id}
                      type="button"
                      onClick={() => handleContactChange(contact.id)}
                      className={clsx(
                        "rounded-2xl border px-3 py-2 text-left text-sm",
                        composer.contactId === contact.id
                          ? "border-sky-400/60 bg-sky-500/15 text-white"
                          : "border-white/10 text-slate-300 hover:border-white/20",
                      )}
                    >
                      <p className="font-semibold">{contact.name}</p>
                      <p className="text-xs text-slate-400">{contact.role ?? contact.channel ?? "Kontakt"}</p>
                    </button>
                  ))}
                  {!threadMeta?.contacts.length && (
                    <p className="text-xs text-slate-500">Keine Kontakte hinterlegt.</p>
                  )}
                </div>
              </div>
              <label className="block text-sm text-slate-300">
                Empfänger (E-Mail)
                <div className="mt-2 flex items-center gap-2">
                  <Mail className="h-4 w-4 text-slate-500" />
                  <Input
                    className="flex-1"
                    value={composer.toEmail}
                    onChange={(event) =>
                      setComposer((current) => ({ ...current, toEmail: event.target.value }))
                    }
                    placeholder="kontakt@kunde.de"
                  />
                </div>
              </label>
              <label className="block text-sm text-slate-300">
                Betreff
                <Input
                  className="mt-2"
                  value={composer.subject}
                  onChange={(event) =>
                    setComposer((current) => ({ ...current, subject: event.target.value }))
                  }
                  placeholder="Status-Update, Einladung..."
                />
              </label>
              <label className="block text-sm text-slate-300">
                Nachricht
                <Textarea
                  rows={6}
                  className="mt-2"
                  value={composer.body}
                  onChange={(event) =>
                    setComposer((current) => ({ ...current, body: event.target.value }))
                  }
                  placeholder="Hallo..., hier dein Update."
                />
              </label>
              <Button
                type="button"
                className="w-full sm:w-auto"
                disabled={!canSend || sending}
                onClick={handleSend}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Nachricht senden
              </Button>
              {!canSend && (
                <p className="text-xs text-slate-500">
                  Fülle Nachricht und Empfänger aus, damit der Versand aktiviert wird.
                </p>
              )}
              {composerNotice && (
                <p
                  className={clsx(
                    "text-xs",
                    composerNotice.type === "success" ? "text-emerald-300" : "text-rose-300",
                  )}
                >
                  {composerNotice.text}
                </p>
              )}
            </div>
          </Card>
        </div>
      </div>
    </section>
  );
}
