"use client";

import {
  AlertTriangle,
  Loader2,
  Mail,
  MessageSquare,
  Paperclip,
  Send,
  Sparkles,
  X,
} from "lucide-react";
import { clsx } from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/components/auth-provider";
import { OPENAI_KEY_STORAGE } from "@/lib/constants";
import type {
  Customer,
  CustomerHealth,
  CustomerListResponse,
  CustomerMessage,
  CustomerMessageListResponse,
  Lead,
  LeadMessageListResponse,
  SmtpSettings,
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

function formatAttachmentSize(size?: number | null) {
  if (!size || size <= 0) {
    return null;
  }
  if (size < 1024) {
    return `${size} B`;
  }
  const kb = size / 1024;
  if (kb < 1024) {
    return `${Math.round(kb)} KB`;
  }
  return `${(kb / 1024).toFixed(1)} MB`;
}

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const urgencySignals = [
  {
    label: "Kritisch",
    keywords: [
      "schlecht", "beschwer", "unfassbar", "folgen", "anwalt", "klage", "frist", "droh", "drohe",
      "24 stunden", "sofort melden", "nicht melden", "letzte warnung",
    ],
  },
  { label: "Kündigung", keywords: ["kündigen", "kündigung", "cancel", "terminate", "abschaltung"] },
  { label: "Outage", keywords: ["ausfall", "störung", "outage", "down", "fehler", "error", "nicht erreichbar"] },
  { label: "Dringend", keywords: ["dringend", "urgent", "sofort", "asap", "notfall", "emergency", "zeitnah"] },
  {
    label: "Angebot",
    keywords: [
      "angebot", "angebot anfordern", "kostenvoranschlag", "kosten voranschlag", "preis anfrage",
      "pricing", "quote", "quotation", "estimate", "proposal", "kostenaufstellung", "budget",
      "kalkulation", "kosten schätzung", "preisübersicht",
    ],
  },
  {
    label: "Werbung",
    keywords: [
      "werbung", "newsletter", "promotion", "promo", "rabatt", "gutschein", "coupon",
      "kampagne", "marketing", "advertisement", "ad campaign", "aktion", "angebot des tages",
    ],
  },
];

function detectUrgency(text?: string | null) {
  if (!text) {
    return null;
  }
  const haystack = text.toLowerCase();
  for (const signal of urgencySignals) {
    if (signal.keywords.some((kw) => haystack.includes(kw))) {
      return signal.label;
    }
  }
  return null;
}

const UNREAD_TOTAL_STORAGE_KEY = "workspace/messages/unread-total";

interface ComposerState {
  contactId: string;
  toEmail: string;
  subject: string;
  body: string;
}

interface AttachmentItem {
  id: string;
  file: File;
  url: string;
}

export default function MessagesWorkspacePage() {
  const router = useRouter();
  const { authorizedRequest, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  const [threadMeta, setThreadMeta] = useState<CustomerMessageListResponse["customer"] | null>(null);
  const [messages, setMessages] = useState<CustomerMessage[]>([]);
  const [unassignedMessages, setUnassignedMessages] = useState<CustomerMessage[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [selectedLeadId, setSelectedLeadId] = useState<string | null>(null);
  const [leadThread, setLeadThread] = useState<LeadMessageListResponse | null>(null);
  const [selectedUnassignedId, setSelectedUnassignedId] = useState<string | null>(null);
  const [customerSearch, setCustomerSearch] = useState("");
  const [leadSearch, setLeadSearch] = useState("");
  const [loadingCustomers, setLoadingCustomers] = useState(true);
  const [loadingThread, setLoadingThread] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [threadError, setThreadError] = useState<string | null>(null);
  const [loadingLeads, setLoadingLeads] = useState(true);
  const [leadError, setLeadError] = useState<string | null>(null);
  const [leadThreadError, setLeadThreadError] = useState<string | null>(null);
  const [loadingUnassigned, setLoadingUnassigned] = useState(false);
  const [unassignedError, setUnassignedError] = useState<string | null>(null);
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
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [aiChatMode, setAiChatMode] = useState<null | "edit" | "create">(null);
  const [aiChatInput, setAiChatInput] = useState("");
  const [smtpReady, setSmtpReady] = useState(true);
  const [smtpStatus, setSmtpStatus] = useState<string | null>(null);
  const [sidebarMode, setSidebarMode] = useState<"customers" | "leads" | "unassigned">("customers");
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [unreadSummary, setUnreadSummary] = useState<{ leads: Record<string, number>; unassigned: number; total: number }>({
    leads: {},
    unassigned: 0,
    total: 0,
  });

  useEffect(() => {
    const unassignedParam = searchParams?.get("unassigned");
    if (unassignedParam) {
      setSidebarMode("unassigned");
      setSelectedUnassignedId(unassignedParam);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!selectedUnassignedId) {
      return;
    }
    const target = document.getElementById(`unassigned-${selectedUnassignedId}`);
    if (target) {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [selectedUnassignedId, unassignedMessages]);

  const attachmentsRef = useRef<AttachmentItem[]>([]);
  useEffect(() => {
    attachmentsRef.current = attachments;
  }, [attachments]);
  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setOpenAiKey(window.localStorage.getItem(OPENAI_KEY_STORAGE));
  }, []);

  const refreshUnreadSummary = useCallback(async () => {
    try {
      const response = await authorizedRequest<{ leads: Record<string, number>; unassigned: number; total: number }>(
        "/messages/unread-summary",
      );
      setUnreadSummary(response);
    } catch (err) {
      console.error("Unread-Summary konnte nicht geladen werden.", err);
    }
  }, [authorizedRequest]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    void refreshUnreadSummary();
  }, [authLoading, refreshUnreadSummary]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    const controller = new AbortController();
    let mounted = true;

    async function fetchSmtpStatus() {
      try {
        const response = await authorizedRequest<SmtpSettings | null>("/settings/smtp", {
          signal: controller.signal,
        });
        if (!mounted) {
          return;
        }
        if (!response || !response.hasPassword) {
          setSmtpReady(false);
          setSmtpStatus("Bitte hinterlege deinen SMTP-Zugang unter Einstellungen.");
        } else {
          setSmtpReady(true);
          setSmtpStatus(null);
        }
      } catch (err) {
        if ((err as Error).name === "AbortError" || !mounted) {
          return;
        }
        setSmtpReady(false);
        setSmtpStatus(err instanceof Error ? err.message : "SMTP-Status konnte nicht geladen werden.");
      }
    }

    void fetchSmtpStatus();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest, authLoading]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoadingCustomers(true);
    setLoadError(null);

    async function fetchCustomers() {
      try {
        const response = await authorizedRequest<CustomerListResponse>("/customers?limit=50", {
          signal: controller.signal,
        });
        if (!active) {
          return;
        }
        setCustomers(response.items);
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return;
        }
        if (!active) {
          return;
        }
        setLoadError(err instanceof Error ? err.message : "Konnte Kunden nicht laden.");
      } finally {
        if (active) {
          setLoadingCustomers(false);
        }
      }
    }

    void fetchCustomers();
    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authorizedRequest, authLoading]);

  useEffect(() => {
    if (!customers.length) {
      setSelectedCustomerId(null);
      return;
    }
    setSelectedCustomerId((current) => {
      if (current && customers.some((customer) => customer.id === current)) {
        return current;
      }
      return null;
    });
  }, [customers]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoadingLeads(true);
    setLeadError(null);

    async function fetchLeads() {
      try {
        const response = await authorizedRequest<Lead[]>("/leads?limit=50", {
          signal: controller.signal,
        });
        if (!active) {
          return;
        }
        setLeads(response);
      } catch (err) {
        if ((err as Error).name === "AbortError" || !active) {
          return;
        }
        setLeadError(err instanceof Error ? err.message : "Kontaktanfragen konnten nicht geladen werden.");
      } finally {
        if (active) {
          setLoadingLeads(false);
        }
      }
    }

    void fetchLeads();
    return () => {
      active = false;
      controller.abort();
    };
  }, [authorizedRequest, authLoading]);

  useEffect(() => {
    if (authLoading) {
      return;
    }
    const controller = new AbortController();
    let active = true;
    setLoadingUnassigned(true);
    setUnassignedError(null);

    async function fetchUnassigned() {
      try {
        const response = await authorizedRequest<CustomerMessage[]>("/messages/unassigned?limit=50", {
          signal: controller.signal,
        });
        if (!active) {
          return;
        }
        setUnassignedMessages(response);
      } catch (err) {
        if ((err as Error).name === "AbortError" || !active) {
          return;
        }
        setUnassignedError(err instanceof Error ? err.message : "Unzuordenbare Nachrichten konnten nicht geladen werden.");
      } finally {
        if (active) {
          setLoadingUnassigned(false);
        }
      }
    }

    void fetchUnassigned();
    return () => {
      active = false;
      controller.abort();
    };
  }, [authorizedRequest, authLoading]);

  useEffect(() => {
    if (!leads.length) {
      setSelectedLeadId(null);
      return;
    }
    setSelectedLeadId((current) => {
      if (current && leads.some((lead) => lead.id === current)) {
        return current;
      }
      return null;
    });
  }, [leads]);

  useEffect(() => {
    if (!unassignedMessages.length) {
      setSelectedUnassignedId(null);
      return;
    }
    setSelectedUnassignedId((current) => {
      if (current && unassignedMessages.some((message) => message.id === current)) {
        return current;
      }
      return null;
    });
  }, [unassignedMessages]);

  useEffect(() => {
    if (!selectedCustomerId) {
      setThreadMeta(null);
      setMessages([]);
      return;
    }
    if (authLoading) {
      return;
    }

    const controller = new AbortController();
    let mounted = true;
    setLoadingThread(true);
    setThreadError(null);

    async function fetchThread() {
      try {
        const response = await authorizedRequest<CustomerMessageListResponse>(
          `/customers/${selectedCustomerId}/messages`,
          { signal: controller.signal },
        );
        if (!mounted) {
          return;
        }
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
        if ((err as Error).name === "AbortError" || !mounted) {
          return;
        }
        setThreadError(err instanceof Error ? err.message : "Konnte Nachrichten nicht laden.");
      } finally {
        if (mounted) {
          setLoadingThread(false);
        }
      }
    }

    void fetchThread();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest, authLoading, selectedCustomerId]);

  useEffect(() => {
    if (!selectedLeadId) {
      setLeadThread(null);
      return;
    }
    if (authLoading) {
      return;
    }

    const controller = new AbortController();
    let mounted = true;
    setLeadThreadError(null);

    async function fetchLeadThread() {
      try {
        const response = await authorizedRequest<LeadMessageListResponse>(
          `/leads/${selectedLeadId}/messages`,
          { signal: controller.signal },
        );
        if (!mounted) {
          return;
        }
        setLeadThread(response);
        setComposer((current) => ({
          ...current,
          contactId: "",
          toEmail: response.lead.email ?? "",
        }));
      } catch (err) {
        if ((err as Error).name === "AbortError" || !mounted) {
          return;
        }
        setLeadThreadError(err instanceof Error ? err.message : "Verlauf konnte nicht geladen werden.");
      }
    }

    void fetchLeadThread();
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest, authLoading, selectedLeadId]);

  const filteredCustomers = useMemo(() => {
    if (!customerSearch.trim()) {
      return customers;
    }
    const query = customerSearch.toLowerCase();
    return customers.filter((customer) => customer.name.toLowerCase().includes(query));
  }, [customers, customerSearch]);

  const filteredLeads = useMemo(() => {
    if (!leadSearch.trim()) {
      return leads;
    }
    const query = leadSearch.toLowerCase();
    return leads.filter((lead) => lead.fullName.toLowerCase().includes(query) || lead.email?.toLowerCase().includes(query));
  }, [leadSearch, leads]);

  const orderedMessages = useMemo(() => {
    return [...messages].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [messages]);

  const orderedLeadMessages = useMemo(() => {
    if (!leadThread?.items.length) {
      return [];
    }
    return [...leadThread.items].sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, [leadThread?.items]);

  const activeUnassigned = useMemo(
    () => unassignedMessages.find((message) => message.id === selectedUnassignedId) ?? null,
    [selectedUnassignedId, unassignedMessages],
  );

  const isLeadView = sidebarMode === "leads";
  const isUnassignedView = sidebarMode === "unassigned";
  const conversationMessages = isLeadView
    ? orderedLeadMessages
    : isUnassignedView
      ? activeUnassigned
        ? [activeUnassigned]
        : []
      : orderedMessages;
  const conversationLoading = isLeadView
    ? (!leadThread && Boolean(selectedLeadId))
    : isUnassignedView
      ? loadingUnassigned
      : loadingThread;
  const conversationError = isLeadView
    ? leadThreadError
    : isUnassignedView
      ? unassignedError
      : threadError;

  const selectedContact = useMemo(() => {
    if (!threadMeta || sidebarMode !== "customers") {
      return null;
    }
    return threadMeta.contacts.find((contact) => contact.id === composer.contactId) ?? null;
  }, [threadMeta, composer.contactId, sidebarMode]);

  const activeCustomer = useMemo(
    () => customers.find((customer) => customer.id === selectedCustomerId) ?? null,
    [customers, selectedCustomerId],
  );

  const activeLead = leadThread?.lead ?? null;

  useEffect(() => {
    if (!isUnassignedView) {
      return;
    }
    if (!activeUnassigned) {
      setComposer((current) => ({
        ...current,
        contactId: "",
        toEmail: "",
        subject: current.subject,
      }));
      return;
    }
    setComposer((current) => ({
      ...current,
      contactId: "",
      toEmail: activeUnassigned.fromEmail ?? "",
      subject: activeUnassigned.subject ?? "",
    }));
  }, [activeUnassigned, isUnassignedView]);

  const leadUnreadCount = useMemo(
    () =>
      Object.values(unreadSummary.leads).reduce((sum, value) => sum + value, 0),
    [unreadSummary.leads],
  );

  const unassignedUnreadCount = unreadSummary.unassigned;

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const payload = {
      leads: leadUnreadCount,
      unassigned: unassignedUnreadCount,
      total: leadUnreadCount + unassignedUnreadCount,
      updatedAt: Date.now(),
    };
    window.localStorage.setItem(UNREAD_TOTAL_STORAGE_KEY, JSON.stringify(payload));
    window.dispatchEvent(
      new CustomEvent("workspace-messages-counts", {
        detail: { total: payload.total },
      }),
    );
  }, [leadUnreadCount, unassignedUnreadCount]);

  const handleLeadSelect = useCallback((leadId: string) => {
    setSelectedLeadId(leadId);
  }, []);

  const handleUnassignedSelect = useCallback(
    (messageId: string) => {
      setSelectedUnassignedId(messageId);
    },
    [],
  );

  const handleAttachmentSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) {
      return;
    }
    setAttachments((prev) => [
      ...prev,
      ...files.map((file) => ({
        id: `${Date.now()}-${file.name}-${Math.random().toString(16).slice(2)}`,
        file,
        url: URL.createObjectURL(file),
      })),
    ]);
    event.target.value = "";
  };

  const handleAttachmentRemove = (id: string) => {
    setAttachments((prev) => {
      const target = prev.find((item) => item.id === id);
      if (target) {
        URL.revokeObjectURL(target.url);
      }
      return prev.filter((item) => item.id !== id);
    });
  };

  const applyReadAtToState = useCallback((ids: string[], readAt: string) => {
    if (!ids.length) {
      return;
    }
    setMessages((current) =>
      current.map((message) =>
        ids.includes(message.id) ? { ...message, readAt } : message,
      ),
    );
    setUnassignedMessages((current) =>
      current.map((message) =>
        ids.includes(message.id) ? { ...message, readAt } : message,
      ),
    );
    setLeadThread((current) =>
      current
        ? {
            ...current,
            items: current.items?.map((message) =>
              ids.includes(message.id) ? { ...message, readAt } : message,
            ) ?? [],
          }
        : current,
    );
  }, []);

  const hasRecipient = isLeadView
    ? Boolean(composer.toEmail.trim() || activeLead?.email)
    : isUnassignedView
      ? Boolean(composer.toEmail.trim())
      : Boolean(selectedContact?.email || composer.toEmail.trim());
  const hasContent = Boolean(composer.body.trim() || attachments.length);
  const canSend = hasRecipient && hasContent;

  const readFileAsBase64 = useCallback(
    (file: File) =>
      new Promise<{ name: string; type: string; size: number; data: string }>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = reader.result as string;
          const base64 = result.includes(",") ? result.split(",")[1] : result;
          resolve({
            name: file.name,
            type: file.type || "application/octet-stream",
            size: file.size,
            data: base64,
          });
        };
        reader.onerror = () => reject(reader.error ?? new Error("Datei konnte nicht gelesen werden."));
        reader.readAsDataURL(file);
      }),
    [],
  );

  const markMessagesAsRead = useCallback(
    async (ids: string[]) => {
      const uniqueIds = Array.from(new Set(ids)).filter((id) => uuidPattern.test(id));
      if (!uniqueIds.length) {
        return;
      }
      const readAt = new Date().toISOString();
      applyReadAtToState(uniqueIds, readAt);
      try {
        await authorizedRequest<void>("/messages/read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ids: uniqueIds }),
        });
        void refreshUnreadSummary();
      } catch (err) {
        console.error("Mark-as-read fehlgeschlagen", err);
      }
    },
    [applyReadAtToState, authorizedRequest, refreshUnreadSummary],
  );

  useEffect(() => {
    if (conversationLoading) {
      return;
    }
    const unreadInbound = conversationMessages
      .filter((message) => message.direction === "INBOUND" && !message.readAt)
      .map((message) => message.id)
      .filter((id) => uuidPattern.test(id));
    if (unreadInbound.length) {
      void markMessagesAsRead(unreadInbound);
    }
  }, [conversationLoading, conversationMessages, markMessagesAsRead]);

  const handleSend = useCallback(async () => {
    if (!smtpReady) {
      setComposerNotice({
        type: "error",
        text: "SMTP-Zugang fehlt. Bitte aktualisiere deine Einstellungen, bevor du sendest.",
      });
      return;
    }

    const hasAttachments = attachments.length > 0;
    const trimmedBody = composer.body.trim();
    if (!trimmedBody && !hasAttachments) {
      setComposerNotice({
        type: "error",
        text: "Bitte Nachricht eingeben oder eine Datei anhängen.",
      });
      return;
    }

    setSending(true);
    setComposerNotice(null);

    let encodedAttachments: Awaited<ReturnType<typeof readFileAsBase64>>[] = [];
    try {
      if (hasAttachments) {
        encodedAttachments = await Promise.all(
          attachments.map((item) => readFileAsBase64(item.file)),
        );
      }
    } catch (err) {
      setSending(false);
      setComposerNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Anhänge konnten nicht gelesen werden.",
      });
      return;
    }

    const basePayload = {
      contactId: composer.contactId || undefined,
      toEmail: composer.toEmail.trim() || undefined,
      subject: composer.subject.trim() || undefined,
      body: trimmedBody || "Siehe angehängte Dateien.",
      ...(encodedAttachments.length ? { attachments: encodedAttachments } : {}),
    };

    try {
      const buildRequestInit = (payload: Record<string, unknown>) => ({
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (isLeadView) {
        if (!selectedLeadId) {
          return;
        }
        const leadPayload = {
          ...basePayload,
          toEmail: basePayload.toEmail || activeLead?.email || undefined,
        };
        const response = await authorizedRequest<CustomerMessage>(
          `/leads/${selectedLeadId}/messages`,
          buildRequestInit(leadPayload),
        );
        setLeadThread((current) =>
          current
            ? {
                ...current,
                items: [response, ...(current.items ?? [])],
              }
            : current,
        );
      } else if (isUnassignedView) {
        if (!basePayload.toEmail) {
          throw new Error("Keine Empfängeradresse vorhanden.");
        }
        const response = await authorizedRequest<CustomerMessage>(
          `/messages/unassigned`,
          buildRequestInit(basePayload),
        );
        setUnassignedMessages((current) => [response, ...current]);
        setSelectedUnassignedId(response.id);
      } else {
        if (!selectedCustomerId) {
          return;
        }
        const response = await authorizedRequest<CustomerMessage>(
          `/customers/${selectedCustomerId}/messages`,
          buildRequestInit(basePayload),
        );
        setMessages((prev) => [response, ...prev]);
      }
      setComposer((current) => ({ ...current, body: "" }));
      setAttachments((prev) => {
        prev.forEach((item) => URL.revokeObjectURL(item.url));
        return [];
      });
      setComposerNotice({ type: "success", text: "Nachricht gesendet – wir tracken den Verlauf." });
    } catch (err) {
      setComposerNotice({
        type: "error",
        text: err instanceof Error ? err.message : "Senden fehlgeschlagen.",
      });
    } finally {
      setSending(false);
    }
  }, [
    activeLead?.email,
    authorizedRequest,
    composer.body,
    composer.contactId,
    composer.subject,
    composer.toEmail,
    isLeadView,
    isUnassignedView,
    selectedCustomerId,
    selectedLeadId,
    smtpReady,
    attachments,
  ]);

  const handleGenerateAi = useCallback(async () => {
    if (!openAiKey) {
      setAiError("Bitte hinterlege zuerst deinen OpenAI-Key in den Einstellungen.");
      return;
    }
    if (isUnassignedView) {
      setAiError("Bitte wähle einen Kunden oder eine Anfrage, um den KI-Assistenten zu nutzen.");
      return;
    }
    if (!isLeadView && !threadMeta) {
      setAiError("Wähle einen Kunden aus, bevor du den KI-Assistenten nutzt.");
      return;
    }
    if (isLeadView && !leadThread?.lead) {
      setAiError("Wähle eine Anfrage aus, bevor du den KI-Assistenten nutzt.");
      return;
    }

    setAiLoading(true);
    setAiError(null);

    try {
      const historySource = isLeadView ? orderedLeadMessages : orderedMessages;
      const history = historySource
        .slice()
        .reverse()
        .slice(0, 6)
        .map((message) => {
          const author = message.direction === "INBOUND" ? "Kunde" : "CSM";
          return `${author}: ${message.body}`;
        })
        .join("\n---\n");

      const contactName = isLeadView
        ? leadThread?.lead.fullName ?? leadThread?.lead.email ?? "Kontakt"
        : selectedContact?.name ?? threadMeta?.name ?? "Kontakt";
      const subjectPart = composer.subject ? `Betreff: ${composer.subject}` : "Betreff ist offen.";

      const prompt = `Du bist Customer Success Manager:in bei Arcto. Verfasse eine prägnante, empathische Antwort per E-Mail an ${contactName}. ${subjectPart}\nKontext:\n${history || "Der Kontakt wartet auf ein Update."}\nDie Antwort darf maximal 220 Wörter haben und sollte mit einer freundlichen Grußformel enden.`;

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
  }, [
    composer.subject,
    isLeadView,
    isUnassignedView,
    leadThread?.lead,
    openAiKey,
    orderedLeadMessages,
    orderedMessages,
    selectedContact,
    threadMeta,
  ]);

  const handleAiCreateWithPrompt = useCallback(
    async (promptInput: string) => {
      if (!openAiKey) {
        setAiError("Bitte hinterlege zuerst deinen OpenAI-Key in den Einstellungen.");
        return;
      }
      if (isUnassignedView) {
        setAiError("Bitte wähle einen Kunden oder eine Anfrage, um den KI-Assistenten zu nutzen.");
        return;
      }
      if (!threadMeta && !leadThread?.lead) {
        setAiError("Bitte wähle einen Kontakt, bevor du eine neue Nachricht erzeugst.");
        return;
      }
      const contactName = isLeadView
        ? leadThread?.lead.fullName ?? leadThread?.lead.email ?? "Kontakt"
        : selectedContact?.name ?? threadMeta?.name ?? "Kontakt";
      const subjectPart = composer.subject ? `Betreff: ${composer.subject}` : "Betreff ist offen.";

      setAiLoading(true);
      setAiError(null);
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.6,
            messages: [
              {
                role: "system",
                content: "Du schreibst neue, knappe E-Mails für Customer Success: freundlich, lösungsorientiert, max. 220 Wörter.",
              },
              {
                role: "user",
                content: `Erzeuge eine neue E-Mail an ${contactName}. ${subjectPart}\nWunsch: ${promptInput || "kein spezieller Wunsch"}\nFreundliche Grußformel am Ende.`,
              },
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
        setAiMenuOpen(false);
        setAiChatMode(null);
        setAiChatInput("");
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "KI-Antwort konnte nicht erzeugt werden.");
      } finally {
        setAiLoading(false);
      }
    },
    [
      composer.subject,
      isLeadView,
      isUnassignedView,
      leadThread?.lead,
      openAiKey,
      selectedContact,
      threadMeta,
    ],
  );

  const handleAiGenerateWithPrompt = useCallback(
    async (promptInput: string) => {
      if (!openAiKey) {
        setAiError("Bitte hinterlege zuerst deinen OpenAI-Key in den Einstellungen.");
        return;
      }
      if (isUnassignedView) {
        setAiError("Bitte wähle einen Kunden oder eine Anfrage, um den KI-Assistenten zu nutzen.");
        return;
      }
      const contactName = isLeadView
        ? leadThread?.lead.fullName ?? leadThread?.lead.email ?? "Kontakt"
        : selectedContact?.name ?? threadMeta?.name ?? "Kontakt";
      const subjectPart = composer.subject ? `Betreff: ${composer.subject}` : "Betreff ist offen.";
      const historySource = isLeadView ? orderedLeadMessages : orderedMessages;
      const history = historySource
        .slice()
        .reverse()
        .slice(0, 6)
        .map((message) => {
          const author = message.direction === "INBOUND" ? "Kunde" : "CSM";
          return `${author}: ${message.body}`;
        })
        .join("\n---\n");

      setAiLoading(true);
      setAiError(null);
      try {
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
              {
                role: "user",
                content: `Erzeuge eine Antwort-E-Mail an ${contactName}. ${subjectPart}\nKontext:\n${history || "Der Kontakt wartet auf ein Update."}\nZusatzwunsch: ${promptInput || "keine"}\nMax 220 Wörter und mit freundlicher Grußformel.`,
              },
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
        setAiMenuOpen(false);
        setAiChatMode(null);
        setAiChatInput("");
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "KI-Antwort konnte nicht erzeugt werden.");
      } finally {
        setAiLoading(false);
      }
    },
    [
      composer.subject,
      isLeadView,
      isUnassignedView,
      leadThread?.lead,
      openAiKey,
      orderedLeadMessages,
      orderedMessages,
      selectedContact,
      threadMeta,
    ],
  );

  const handleAiEditWithPrompt = useCallback(
    async (promptInput: string) => {
      if (!openAiKey) {
        setAiError("Bitte hinterlege zuerst deinen OpenAI-Key in den Einstellungen.");
        return;
      }
      if (!composer.body.trim()) {
        setAiError("Bitte gib zuerst einen Entwurf ein, den wir überarbeiten können.");
        return;
      }
      setAiLoading(true);
      setAiError(null);
      try {
        const response = await fetch("https://api.openai.com/v1/chat/completions", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${openAiKey}`,
          },
          body: JSON.stringify({
            model: "gpt-4o-mini",
            temperature: 0.4,
            messages: [
              {
                role: "system",
                content: "Du polierst E-Mails für Customer Success: klar, freundlich, lösungsorientiert.",
              },
              {
                role: "user",
                content: `Überarbeite diesen Entwurf:\n${composer.body}\nHinweis: ${promptInput || "keine"}\nHalte dich an max. 220 Wörter, klarer Ton, freundlicher Abschluss.`,
              },
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
        setAiMenuOpen(false);
        setAiChatMode(null);
        setAiChatInput("");
      } catch (err) {
        setAiError(err instanceof Error ? err.message : "KI-Korrektur fehlgeschlagen.");
      } finally {
        setAiLoading(false);
      }
    },
    [composer.body, openAiKey],
  );

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

  const detailPanel = (
    <Card
      title={
        isUnassignedView ? "Nachrichteninfo" : isLeadView ? "Lead-Details" : "Kundenprofil"
      }
      description={
        isUnassignedView
          ? "E-Mails ohne Zuordnung – prüfe Absender, Betreff und Inhalt."
          : isLeadView
            ? "Kontaktdaten, Status und Nachricht der Anfrage."
            : "Kontext & Kontakte des ausgewählten Accounts."
      }
    >
      {isUnassignedView ? (
        activeUnassigned ? (
          <div className="space-y-4 text-sm text-slate-300">
            <div>
              <p className="text-lg font-semibold text-white">{activeUnassigned.subject || "Ohne Betreff"}</p>
              <p className="text-xs text-slate-400">
                {formatTimestamp(activeUnassigned.receivedAt ?? activeUnassigned.sentAt ?? activeUnassigned.createdAt)} ·{" "}
                {activeUnassigned.direction === "INBOUND" ? "Eingang" : "Ausgang"}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Absender</p>
              <p className="mt-2 text-sm text-white">{activeUnassigned.fromEmail ?? "Keine Adresse"}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
              <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Empfänger</p>
              <p className="mt-2 text-sm text-white">{activeUnassigned.toEmail ?? "Keine Adresse"}</p>
            </div>
            {activeUnassigned.preview && (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Vorschau</p>
                <p className="mt-2 whitespace-pre-line">{activeUnassigned.preview}</p>
              </div>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Wähle eine Nachricht aus der Liste.</p>
        )
      ) : isLeadView ? (
        activeLead ? (
          <div className="space-y-4 text-sm text-slate-300">
            <div>
              <p className="text-lg font-semibold text-white">{activeLead.fullName}</p>
              <p className="text-xs text-slate-400">{activeLead.email ?? "Keine E-Mail hinterlegt"}</p>
              {activeLead.company && (
                <p className="mt-1 text-xs text-slate-400">{activeLead.company}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
              <span className="rounded-full bg-white/10 px-3 py-1 text-white">{activeLead.status}</span>
              <span className="rounded-full bg-white/10 px-3 py-1 text-white">{activeLead.priority}</span>
              {activeLead.createdAt && (
                <span className="rounded-full bg-white/10 px-3 py-1 text-white">
                  Seit {new Date(activeLead.createdAt).toLocaleDateString("de-DE")}
                </span>
              )}
            </div>
            {activeLead.message ? (
              <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
                <p className="text-[11px] uppercase tracking-[0.3em] text-slate-500">Nachricht</p>
                <p className="mt-2 whitespace-pre-line">“{activeLead.message}”</p>
              </div>
            ) : (
              <p className="text-xs text-slate-500">Keine Nachricht vorhanden.</p>
            )}
          </div>
        ) : (
          <p className="text-sm text-slate-400">Wähle eine Kontaktanfrage aus der Liste.</p>
        )
      ) : threadMeta ? (
        <div className="space-y-4 text-sm text-slate-300">
          <div>
            <p className="text-lg font-semibold text-white">{threadMeta.name}</p>
            {activeCustomer && (
              <div className="mt-2 flex flex-wrap gap-2 text-[11px] uppercase tracking-[0.3em] text-slate-500">
                <span className="rounded-full bg-white/10 px-3 py-1 text-white">{activeCustomer.segment}</span>
                <span
                  className={clsx(
                    "rounded-full px-3 py-1 text-white",
                    healthTone[activeCustomer.health],
                  )}
                >
                  {activeCustomer.health}
                </span>
                {activeCustomer.lastContactAt && (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-white">
                    Kontakt {formatTimestamp(activeCustomer.lastContactAt)}
                  </span>
                )}
              </div>
            )}
          </div>
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Kontakte</p>
            {threadMeta.contacts.length === 0 && (
              <p className="mt-2 text-xs text-slate-500">Noch keine Kontakte hinterlegt.</p>
            )}
            <div className="mt-2 space-y-2">
              {threadMeta.contacts.map((contact) => (
                <div
                  key={contact.id}
                  className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300"
                >
                  <p className="text-white">{contact.name}</p>
                  <p className="text-xs text-slate-400">
                    {contact.role ?? contact.channel ?? "Kontakt"} · {contact.email ?? "Keine E-Mail"}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-slate-400">Wähle einen Kunden aus der Liste.</p>
      )}
    </Card>
  );

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

      <div className="space-y-6">
        <div className="space-y-4">
          <div className="flex gap-2 rounded-3xl border border-white/5 bg-white/5/30 p-1 text-sm">
            <button
              type="button"
              onClick={() => {
                setSidebarMode("customers");
                setSelectedLeadId(null);
                setSelectedUnassignedId(null);
              }}
              className={clsx(
                "flex-1 rounded-2xl px-3 py-2",
                sidebarMode === "customers"
                  ? "bg-white/20 text-white"
                  : "text-slate-300 hover:bg-white/10",
              )}
            >
              Kunden
            </button>
            <button
              type="button"
                onClick={() => {
                  setSidebarMode("leads");
                  setSelectedCustomerId(null);
                  setSelectedUnassignedId(null);
                }}
                className={clsx(
                  "flex-1 rounded-2xl px-3 py-2",
                  sidebarMode === "leads"
                    ? "bg-white/20 text-white"
                  : "text-slate-300 hover:bg-white/10",
              )}
            >
              <span className="flex items-center justify-center gap-2">
                Kontaktanfragen
                {Boolean(leadUnreadCount) && (
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      sidebarMode === "leads"
                        ? "bg-slate-900/70 text-white"
                        : "bg-white/10 text-white/80",
                    )}
                  >
                    {leadUnreadCount}
                  </span>
                )}
              </span>
            </button>
            <button
              type="button"
              onClick={() => {
                setSidebarMode("unassigned");
                setSelectedCustomerId(null);
                setSelectedLeadId(null);
              }}
              className={clsx(
                "flex-1 rounded-2xl px-3 py-2",
                sidebarMode === "unassigned"
                  ? "bg-white/20 text-white"
                  : "text-slate-300 hover:bg-white/10",
              )}
            >
              <span className="flex items-center justify-center gap-2">
                Nachrichten
                {Boolean(unassignedUnreadCount) && (
                  <span
                    className={clsx(
                      "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                      sidebarMode === "unassigned"
                        ? "bg-slate-900/70 text-white"
                        : "bg-white/10 text-white/80",
                    )}
                  >
                    {unassignedUnreadCount}
                  </span>
                )}
              </span>
            </button>
          </div>

          <div className="grid gap-6 md:grid-cols-[minmax(280px,35%)_minmax(0,65%)] lg:grid-cols-[minmax(320px,33%)_minmax(0,67%)]">
            <div className="space-y-4">
              {sidebarMode === "customers" && (
                <Card
                  className="flex h-[480px] flex-col md:h-[560px] lg:h-[640px]"
                  title="Kunden"
                  description="Wähle einen Account, um die Inbox zu öffnen."
                >
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
                  <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
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
              )}
              {sidebarMode === "leads" && (
                <Card
                  className="flex h-[480px] flex-col md:h-[560px] lg:h-[640px]"
                  title="Kontaktanfragen"
                  description="Website-Formulare & neue Leads."
                >
                  <Input
                    placeholder="Suchen..."
                    value={leadSearch}
                    onChange={(event) => setLeadSearch(event.target.value)}
                  />
                  {leadError && <p className="mt-3 text-xs text-rose-300">{leadError}</p>}
                  {loadingLeads && (
                    <p className="mt-4 flex items-center gap-2 text-sm text-slate-300">
                      <Loader2 className="h-4 w-4 animate-spin" /> Kontaktanfragen werden geladen...
                    </p>
                  )}
                  {!loadingLeads && filteredLeads.length === 0 && (
                    <p className="mt-4 text-sm text-slate-400">Keine Anfrage gefunden.</p>
                  )}
                  <div className="mt-4 flex-1 space-y-2 overflow-y-auto pr-1">
                    {filteredLeads.map((lead) => {
                      const isActiveLead = lead.id === selectedLeadId;
                      const unreadCount = unreadSummary.leads[lead.id] ?? 0;
                      const isUnreadLead = unreadCount > 0;
                      return (
                        <button
                          key={lead.id}
                          type="button"
                          onClick={() => handleLeadSelect(lead.id)}
                          className={clsx(
                            "w-full rounded-2xl border px-4 py-3 text-left",
                            isActiveLead
                              ? "border-white/30 bg-white/10 text-white"
                              : "border-white/10 text-slate-300 hover:border-white/20",
                          )}
                        >
                          <p className="text-sm font-semibold">{lead.fullName}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <p className="text-xs text-slate-400">{lead.email}</p>
                            {isUnreadLead && (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                                Neu
                              </span>
                            )}
                          </div>
                          <div className="mt-1 flex items-center gap-2 text-[11px] uppercase tracking-[0.2em] text-slate-500">
                            <span>{lead.status}</span>
                            <span>{lead.priority}</span>
                          </div>
                          {lead.createdAt && (
                            <p className="mt-1 text-xs text-slate-500">
                              Eingegangen: {formatTimestamp(lead.createdAt)}
                            </p>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </Card>
              )}
              {sidebarMode === "unassigned" && (
                <Card title="Nachrichten" description="E-Mails ohne Zuordnung im Posteingang.">
                  {unassignedError && (
                    <p className="mt-3 flex items-center gap-2 text-xs text-rose-300">
                      <AlertTriangle className="h-3.5 w-3.5" /> {unassignedError}
                    </p>
                  )}
                  {loadingUnassigned && (
                    <p className="mt-4 flex items-center gap-2 text-sm text-slate-300">
                      <Loader2 className="h-4 w-4 animate-spin" /> Nachrichten werden geladen...
                    </p>
                  )}
                  {!loadingUnassigned && unassignedMessages.length === 0 && (
                    <p className="mt-4 text-sm text-slate-400">Keine offenen Nachrichten vorhanden.</p>
                  )}
                  <div className="mt-4 space-y-2">
                    {unassignedMessages.map((message) => {
                      const isActiveMessage = message.id === selectedUnassignedId;
                      const isUnread =
                        message.direction === "INBOUND" && !message.readAt;
                      const timestamp = formatTimestamp(message.receivedAt ?? message.sentAt ?? message.createdAt);
                      const urgency = detectUrgency(`${message.subject ?? ""} ${message.preview ?? message.body ?? ""}`);
                      return (
                        <button
                          id={`unassigned-${message.id}`}
                          key={message.id}
                          type="button"
                          onClick={() => handleUnassignedSelect(message.id)}
                          className={clsx(
                            "w-full rounded-2xl border px-4 py-3 text-left",
                            isActiveMessage
                              ? "border-white/30 bg-white/10 text-white"
                              : "border-white/10 text-slate-300 hover:border-white/20",
                          )}
                        >
                          <p className="text-sm font-semibold">{message.subject || "Ohne Betreff"}</p>
                          <div className="mt-1 flex items-center gap-2">
                            <p className="text-xs text-slate-400">
                              {message.fromEmail ?? "Keine Absenderadresse"}
                            </p>
                            {isUnread && (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-200">
                                Neu
                              </span>
                            )}
                            {urgency && (
                              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-amber-200">
                                {urgency}
                              </span>
                            )}
                          </div>
                          <p className="mt-1 text-xs text-slate-500">{timestamp}</p>
                        </button>
                      );
                    })}
                  </div>
                </Card>
              )}
            </div>
            {sidebarMode === "customers" && (
              <Card
            className="flex h-[480px] flex-col md:h-[560px] lg:h-[640px]"
            title={isUnassignedView ? "Nachrichtenverlauf" : isLeadView ? "Anfrage" : "Verlauf"}
            description={
              isUnassignedView
                ? "E-Mails, die keinem Kunden oder Lead zugeordnet werden konnten."
                : isLeadView
                  ? "E-Mails & Formularinhalte zum Lead."
                  : "E-Mails, die zu diesem Kunden gehören."
            }
          >
            {conversationLoading && (
              <p className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Verlauf wird geladen...
              </p>
            )}
            {conversationError && !conversationLoading && (
              <p className="flex items-center gap-2 text-sm text-rose-300">
                <AlertTriangle className="h-4 w-4" /> {conversationError}
              </p>
            )}
            <div className="mt-4 flex-1 overflow-y-auto pr-2">
              {!conversationLoading && !conversationError && conversationMessages.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {isLeadView
                    ? "Noch keine Antworten auf diese Anfrage."
                    : isUnassignedView
                      ? "Aktuell liegen keine unzugeordneten Nachrichten vor."
                      : "Noch keine Nachrichten für diesen Kunden."}
                </p>
              ) : (
                <div className="space-y-4">
                  {conversationMessages.map((message) => {
                    const isOutbound = message.direction === "OUTBOUND";
                    const metaLine = isOutbound
                      ? `Gesendet an ${message.toEmail ?? message.contact?.name ?? "Kontakt"}`
                      : `Empfangen von ${message.fromEmail ?? message.contact?.name ?? "Kontakt"}`;
                    const urgency = detectUrgency(`${message.subject ?? ""} ${message.preview ?? message.body ?? ""}`);
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
                            <span className="flex items-center gap-2">
                              {urgency && (
                                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-200">
                                  {urgency}
                                </span>
                              )}
                              {date}
                            </span>
                          </div>
                          {message.subject && (
                            <p className="mt-2 text-sm font-semibold text-white">{message.subject}</p>
                          )}
                          <p className="mt-2 whitespace-pre-line text-sm text-slate-100">{message.body}</p>
                          {message.attachments?.length ? (
                            <div className="mt-3 space-y-2">
                              {message.attachments.map((attachment, index) => {
                                const href = attachment.data
                                  ? `data:${attachment.type ?? "application/octet-stream"};base64,${attachment.data}`
                                  : undefined;
                                const sizeLabel = formatAttachmentSize(attachment.size);
                                return (
                                  <a
                                    key={`${message.id}-att-${index}`}
                                    href={href}
                                    download={attachment.name || undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white transition hover:border-sky-400/60 hover:text-white"
                                  >
                                    <Paperclip className="h-4 w-4" />
                                    <span className="truncate">{attachment.name || "Anhang"}</span>
                                    {sizeLabel && (
                                      <span className="text-[11px] text-slate-300">{sizeLabel}</span>
                                    )}
                                    {!href && (
                                      <span className="text-[11px] text-amber-200">Keine Datei verfügbar</span>
                                    )}
                                  </a>
                                );
                              })}
                            </div>
                          ) : null}
                          <p className="mt-3 text-xs text-slate-400">{metaLine}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="mt-6 text-xs text-slate-500">Hinweis: Antworten laufen über den hinterlegten SMTP-Zugang.</p>
          </Card>
            )}

            {sidebarMode === "leads" && (
              <Card
            className="flex h-[480px] flex-col md:h-[560px] lg:h-[640px]"
            title={isUnassignedView ? "Nachrichtenverlauf" : isLeadView ? "Anfrage" : "Verlauf"}
            description={
              isUnassignedView
                ? "E-Mails, die keinem Kunden oder Lead zugeordnet werden konnten."
                : isLeadView
                  ? "E-Mails & Formularinhalte zum Lead."
                  : "E-Mails, die zu diesem Kunden gehören."
            }
          >
            {conversationLoading && (
              <p className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Verlauf wird geladen...
              </p>
            )}
            {conversationError && !conversationLoading && (
              <p className="flex items-center gap-2 text-sm text-rose-300">
                <AlertTriangle className="h-4 w-4" /> {conversationError}
              </p>
            )}
            <div className="mt-4 flex-1 overflow-y-auto pr-2">
              {!conversationLoading && !conversationError && conversationMessages.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {isLeadView
                    ? "Noch keine Antworten auf diese Anfrage."
                    : isUnassignedView
                      ? "Aktuell liegen keine unzugeordneten Nachrichten vor."
                      : "Noch keine Nachrichten für diesen Kunden."}
                </p>
              ) : (
                <div className="space-y-4">
                  {conversationMessages.map((message) => {
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
                          {message.attachments?.length ? (
                            <div className="mt-3 space-y-2">
                              {message.attachments.map((attachment, index) => {
                                const href = attachment.data
                                  ? `data:${attachment.type ?? "application/octet-stream"};base64,${attachment.data}`
                                  : undefined;
                                const sizeLabel = formatAttachmentSize(attachment.size);
                                return (
                                  <a
                                    key={`${message.id}-att-${index}`}
                                    href={href}
                                    download={attachment.name || undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white transition hover:border-sky-400/60 hover:text-white"
                                  >
                                    <Paperclip className="h-4 w-4" />
                                    <span className="truncate">{attachment.name || "Anhang"}</span>
                                    {sizeLabel && (
                                      <span className="text-[11px] text-slate-300">{sizeLabel}</span>
                                    )}
                                    {!href && (
                                      <span className="text-[11px] text-amber-200">Keine Datei verfügbar</span>
                                    )}
                                  </a>
                                );
                              })}
                            </div>
                          ) : null}
                          <p className="mt-3 text-xs text-slate-400">{metaLine}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="mt-6 text-xs text-slate-500">Hinweis: Antworten laufen über den hinterlegten SMTP-Zugang.</p>
          </Card>
            )}

            {sidebarMode === "unassigned" && (
              <Card
            className="flex h-[480px] flex-col md:h-[560px] lg:h-[640px]"
            title={isUnassignedView ? "Nachrichtenverlauf" : isLeadView ? "Anfrage" : "Verlauf"}
            description={
              isUnassignedView
                ? "E-Mails, die keinem Kunden oder Lead zugeordnet werden konnten."
                : isLeadView
                  ? "E-Mails & Formularinhalte zum Lead."
                  : "E-Mails, die zu diesem Kunden gehören."
            }
          >
            {conversationLoading && (
              <p className="flex items-center gap-2 text-sm text-slate-300">
                <Loader2 className="h-4 w-4 animate-spin" /> Verlauf wird geladen...
              </p>
            )}
            {conversationError && !conversationLoading && (
              <p className="flex items-center gap-2 text-sm text-rose-300">
                <AlertTriangle className="h-4 w-4" /> {conversationError}
              </p>
            )}
            <div className="mt-4 flex-1 overflow-y-auto pr-2">
              {!conversationLoading && !conversationError && conversationMessages.length === 0 ? (
                <p className="text-sm text-slate-400">
                  {isLeadView
                    ? "Noch keine Antworten auf diese Anfrage."
                    : isUnassignedView
                      ? "Aktuell liegen keine unzugeordneten Nachrichten vor."
                      : "Noch keine Nachrichten für diesen Kunden."}
                </p>
              ) : (
                <div className="space-y-4">
                  {conversationMessages.map((message) => {
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
                          {message.attachments?.length ? (
                            <div className="mt-3 space-y-2">
                              {message.attachments.map((attachment, index) => {
                                const href = attachment.data
                                  ? `data:${attachment.type ?? "application/octet-stream"};base64,${attachment.data}`
                                  : undefined;
                                const sizeLabel = formatAttachmentSize(attachment.size);
                                return (
                                  <a
                                    key={`${message.id}-att-${index}`}
                                    href={href}
                                    download={attachment.name || undefined}
                                    target="_blank"
                                    rel="noreferrer"
                                    className="flex items-center gap-2 rounded-2xl border border-white/10 bg-black/20 px-3 py-2 text-xs text-white transition hover:border-sky-400/60 hover:text-white"
                                  >
                                    <Paperclip className="h-4 w-4" />
                                    <span className="truncate">{attachment.name || "Anhang"}</span>
                                    {sizeLabel && (
                                      <span className="text-[11px] text-slate-300">{sizeLabel}</span>
                                    )}
                                    {!href && (
                                      <span className="text-[11px] text-amber-200">Keine Datei verfügbar</span>
                                    )}
                                  </a>
                                );
                              })}
                            </div>
                          ) : null}
                          <p className="mt-3 text-xs text-slate-400">{metaLine}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            <p className="mt-6 text-xs text-slate-500">Hinweis: Antworten laufen über den hinterlegten SMTP-Zugang.</p>
          </Card>
            )}
          </div>

          
        </div>

        <div className="grid gap-6 lg:grid-cols-2">
          {detailPanel}
          <Card
            title="Antwort verfassen"
            description="Wähle Kontakt, Betreff und Text. Versand erfolgt per E-Mail."
            action={
              <div className="relative flex items-center justify-end gap-2">
                <div
                  className={clsx(
                    "absolute right-full top-1/2 z-30 flex flex-col gap-2 rounded-2xl border border-white/10 bg-black/60 p-2 shadow-lg backdrop-blur-sm transition-all duration-200 ease-out origin-right",
                    aiMenuOpen
                      ? "opacity-100 -translate-y-1/2 -translate-x-2 scale-100"
                      : "opacity-0 -translate-y-1/2 translate-x-2 scale-95",
                  )}
                  style={{ pointerEvents: aiMenuOpen ? "auto" : "none" }}
                  onClick={(event) => event.stopPropagation()}
                >
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-full px-4"
                    onClick={() => {
                        setAiChatMode("create");
                        setAiChatInput("");
                        setAiMenuOpen(false);
                    }}
                  >
                    Create
                  </Button>
                  <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="rounded-full px-4"
                    onClick={() => {
                      void handleAiGenerateWithPrompt("");
                      setAiMenuOpen(false);
                    }}
                    >
                      Generate
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="rounded-full px-4"
                    onClick={() => {
                        setAiChatMode("edit");
                        setAiChatInput("");
                        setAiMenuOpen(false);
                    }}
                  >
                    Edit
                  </Button>
                </div>
                <Button
                  type="button"
                  variant={aiMenuOpen ? "default" : "secondary"}
                  size="sm"
                  onClick={() => setAiMenuOpen((prev) => !prev)}
                  disabled={aiLoading}
                  className="rounded-full px-4"
                >
                  {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} AI
                </Button>
              </div>
            }
          >
            {!smtpReady && smtpStatus && (
              <div className="mb-4 flex items-start gap-3 rounded-2xl border border-rose-400/30 bg-rose-500/10 p-3 text-xs text-rose-100">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <p>{smtpStatus}</p>
              </div>
            )}
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
            {aiChatMode && (
              <div className="mb-4 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                  {aiChatMode === "create"
                    ? "Create: Hinweise für neue E-Mail"
                    : "Edit: Hinweise für Überarbeitung"}
                </p>
                <Textarea
                  rows={3}
                  value={aiChatInput}
                  onChange={(event) => setAiChatInput(event.target.value)}
                  placeholder={
                    aiChatMode === "create"
                        ? "z.B. Tonalität, Schwerpunkte, Infos für die neue Nachricht."
                        : "z.B. Ton softer, klarere Struktur, Kürzen auf 120 Wörter."
                  }
                />
                <div className="flex flex-wrap gap-2">
                  {aiChatMode === "create" && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleAiCreateWithPrompt(aiChatInput)}
                      disabled={aiLoading}
                    >
                      {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Neue E-Mail erzeugen
                    </Button>
                  )}
                  {aiChatMode === "edit" && (
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => void handleAiEditWithPrompt(aiChatInput)}
                      disabled={aiLoading}
                    >
                      {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Entwurf verfeinern
                    </Button>
                  )}
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    onClick={() => {
                      setAiChatMode(null);
                      setAiChatInput("");
                      setAiMenuOpen(false);
                    }}
                  >
                    Abbrechen
                  </Button>
                </div>
              </div>
            )}
            <div className="space-y-4">
              {!isLeadView && !isUnassignedView && (
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
              )}
              {isLeadView && activeLead && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                  <p className="font-semibold text-white">{activeLead.fullName}</p>
                  <p className="text-xs text-slate-400">{activeLead.email ?? "Keine E-Mail hinterlegt"}</p>
                </div>
              )}
              {isUnassignedView && activeUnassigned && (
                <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-sm text-slate-300">
                  <p className="font-semibold text-white">{activeUnassigned.subject || "Ohne Betreff"}</p>
                  <p className="text-xs text-slate-400">
                    {activeUnassigned.fromEmail ?? "Keine Absenderadresse"}
                  </p>
                </div>
              )}
              {isUnassignedView && !activeUnassigned && (
                <p className="text-xs text-slate-500">Wähle eine Nachricht aus, um zu antworten.</p>
              )}
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
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm text-slate-300">Anhänge</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="file"
                      ref={fileInputRef}
                      className="hidden"
                      multiple
                      onChange={handleAttachmentSelect}
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="flex items-center gap-2"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <Paperclip className="h-4 w-4" /> Hinzufügen
                    </Button>
                  </div>
                </div>
                {attachments.length ? (
                  <div className="space-y-2">
                    {attachments.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200"
                      >
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="truncate underline decoration-slate-400 hover:text-white"
                        >
                          {item.file.name} ({Math.max(1, Math.round(item.file.size / 1024))} KB)
                        </a>
                        <button
                          type="button"
                          onClick={() => handleAttachmentRemove(item.id)}
                          className="text-slate-400 hover:text-white"
                          aria-label="Anhang entfernen"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">Keine Anhänge hinzugefügt.</p>
                )}
              </div>
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
                disabled={!canSend || sending || !smtpReady}
                onClick={handleSend}
              >
                {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Nachricht senden
              </Button>
              {!canSend && (
                <p className="text-xs text-slate-500">
                  {isLeadView
                    ? "Füge Nachricht oder Anhang hinzu und ergänze ggf. die Empfängeradresse."
                    : isUnassignedView
                      ? "Füge Nachricht oder Anhang hinzu und eine gültige Empfängeradresse."
                      : "Füge Nachricht oder Anhang hinzu und stelle den Empfänger ein, damit der Versand aktiviert wird."}
                </p>
              )}
              {!smtpReady && (
                <p className="text-xs text-rose-300">
                  Versand deaktiviert: Bitte aktualisiere deinen SMTP-Zugang in den Einstellungen.
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
