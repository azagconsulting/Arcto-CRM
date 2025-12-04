"use client";

import { Mail, RefreshCw, Trash2, Folder, CheckSquare, Square, X, RotateCcw } from "lucide-react";
import { clsx } from "clsx";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/auth-provider";
import { ApiError } from "@/lib/api";
import type {
  Customer,
  CustomerListResponse,
  CustomerMessage,
  CustomerMessageListResponse,
  CustomerMessageStatus,
  Lead,
  LeadMessageListResponse,
  SmtpSettings,
} from "@/lib/types";

// Import new components
import { MailboxSidebar, Mailbox } from "./mailbox-sidebar";
import { MessageList } from "./message-list";
import { MessageView } from "./message-view";
import { ComposerModal } from "./composer-modal";
import type { CustomerFormState } from "../../customers/customer-modal";
import { CustomerModal } from "../../customers/customer-modal";

// Helper functions
export const timestampFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});
export function formatTimestamp(value?: string | null) { if (!value) return ""; return timestampFormatter.format(new Date(value)); }
const compactListDateFormatter = new Intl.DateTimeFormat("de-DE", {
  weekday: "short",
  day: "2-digit",
  month: "2-digit",
});
export function formatCompactListDate(value?: string | null) {
  if (!value) return "";
  const raw = compactListDateFormatter.format(new Date(value));
  return raw.replace(",", "").trim();
}
export function formatAttachmentSize(size?: number | null) { if (!size || size <= 0) return null; if (size < 1024) return `${size} B`; const kb = size / 1024; if (kb < 1024) return `${Math.round(kb)} KB`; return `${(kb / 1024).toFixed(1)} MB`; }

export function detectUrgency(message?: CustomerMessage | null) {
  if (!message?.urgency) return null;
  if (message.urgency === "high") {
    return "Kritisch";
  }
  if (message.urgency === "medium") {
    return "Dringend";
  }
  return null;
}
export function getCategoryMeta(category?: CustomerMessage["category"]) {
  switch (category) {
    case "KUENDIGUNG":
      return { label: "Kündigung", className: "bg-rose-500/20 text-rose-200" };
    case "KRITISCH":
      return { label: "Kritisch", className: "bg-red-500/25 text-red-100" };
    case "KOSTENVORANSCHLAG":
      return { label: "Kostenvoranschlag", className: "bg-indigo-500/20 text-indigo-100" };
    default:
      return null;
  }
}
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value?: string | null) => !!value && uuidRegex.test(value);
type UnreadSummary = { leads: Record<string, number>; unassigned: number; total: number };
const MESSAGE_COUNTS_KEY = "workspace/messages/unread-total";
const COMPOSER_OPEN_KEY = "workspace/messages/composer-open";
const FOLDER_STORAGE_KEY = "workspace/messages/folders";
const FOLDER_ASSIGNMENTS_KEY = "workspace/messages/folder-assignments";
const countUnreadMessages = (items: CustomerMessage[]) =>
  items.filter((msg) => msg.direction === "INBOUND" && !msg.readAt).length;
const toTitleCase = (value?: string | null) =>
  value ? value.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase()) : "";

const extractNameFromBody = (body?: string | null) => {
  if (!body) return "";
  const trimmed = body.trim();
  if (!trimmed) return "";
  const patterns = [
    /mit freundlichen grüßen[,:\-\s]*([^\n]+)/i,
    /beste[n]?\s+grüße[,:\-\s]*([^\n]+)/i,
    /viele\s+grüße[,:\-\s]*([^\n]+)/i,
    /grüße[,:\-\s]*([^\n]+)/i,
    /cheers[,:\-\s]*([^\n]+)/i,
    /thanks[,:\-\s]*([^\n]+)/i,
  ];
  for (const pattern of patterns) {
    const match = trimmed.match(pattern);
    if (match?.[1]) {
      return toTitleCase(match[1].trim().replace(/[^a-zA-ZäöüÄÖÜß\s\-']/g, ""));
    }
  }
  const lines = trimmed.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const candidate = lines[lines.length - 1] || "";
  if (candidate && candidate.length <= 50) {
    return toTitleCase(candidate.replace(/[^a-zA-ZäöüÄÖÜß\s\-']/g, ""));
  }
  return "";
};

const extractPhoneFromBody = (body?: string | null) => {
  if (!body) return "";
  const matches = body.match(/\+?\d[\d\s()./-]{6,}/g);
  if (!matches) return "";
  const cleaned = matches
    .map((m) => m.replace(/[^\d+]/g, ""))
    .filter((m) => m.length >= 8);
  if (!cleaned.length) return "";
  cleaned.sort((a, b) => b.length - a.length);
  return cleaned[0];
};

const extractCompany = (body?: string | null, email?: string | null) => {
  const companyHints = [
    "gmbh",
    "ag",
    "ug",
    "ltd",
    "inc",
    "sarl",
    "sas",
    "bv",
    "nv",
    "llc",
  ];
  if (body) {
    const lines = body
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    for (const line of lines) {
      if (line.length > 60) continue;
      const lower = line.toLowerCase();
      if (companyHints.some((hint) => lower.includes(hint))) {
        return toTitleCase(line.replace(/[^a-zA-ZäöüÄÖÜß\s\-\&]/g, ""));
      }
    }
  }
  if (email) {
    const domainPart = email.split("@")[1]?.split(".")[0];
    if (domainPart && domainPart.length > 3) {
      return toTitleCase(domainPart.replace(/[^a-zA-ZäöüÄÖÜß\s\-\&]/g, ""));
    }
  }
  return "";
};

function prefillFromMessage(msg: CustomerMessage): Partial<CustomerFormState> {
  const fromEmail = msg.fromEmail?.trim() ?? "";
  const bodySource = msg.body || msg.summary || msg.preview || "";
  const nameFromBody = extractNameFromBody(bodySource);
  const companyFromBody = extractCompany(bodySource, fromEmail);
  const phoneFromBody = extractPhoneFromBody(bodySource);
  const contactName =
    nameFromBody ||
    msg.contact?.name?.trim() ||
    (() => {
      const local = fromEmail.split("@")[0] ?? "";
      return local ? toTitleCase(local.replace(/[._]/g, " ")) : "";
    })();
  const subject = msg.subject?.trim() ?? "";
  const rawPreview = (msg.summary || msg.preview || msg.body || "").trim();
  const bodyPreview = rawPreview
    ? `${rawPreview.replace(/\s+/g, " ").slice(0, 240)}${rawPreview.length > 240 ? "…" : ""}`
    : "";
  const customerName = companyFromBody || contactName || "Privatperson";
  return {
    name: customerName,
    contactName,
    contactEmail: fromEmail,
    contactChannel: "email",
    preferredChannel: "email",
    nextStep: bodyPreview || subject || "Neue Anfrage aus E-Mail",
    nextStepDueAt: "",
    tags: "",
    ownerName: "",
    region: "",
    decisionStage: "",
    contactRole: "",
    contactId: "",
    contactPhone: phoneFromBody,
    mrr: "",
    segment: "SCALE",
    health: "GOOD",
    lastContactAt: msg.receivedAt ?? msg.createdAt,
  };
}


export default function MessagesWorkspacePage() {
  const { authorizedRequest, loading: authLoading, user } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const customerIdFromUrl = searchParams.get("customerId");
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [unassignedMessages, setUnassignedMessages] = useState<CustomerMessage[]>([]);
  const [inboxMessages, setInboxMessages] = useState<CustomerMessage[]>([]);
  const [sentMessages, setSentMessages] = useState<CustomerMessage[]>([]);
  const [spamMessages, setSpamMessages] = useState<CustomerMessage[]>([]);
  const [trashMessages, setTrashMessages] = useState<CustomerMessage[]>([]);
  
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [activeMailbox, setActiveMailbox] = useState<Mailbox>(customerIdFromUrl ? "customers" : "inbox");
  const [selectedId, setSelectedId] = useState<string | null>(customerIdFromUrl);
  const [search, setSearch] = useState("");

  const [threadMessages, setThreadMessages] = useState<CustomerMessage[]>([]);
  const [loadingThread, setLoadingThread] = useState(false);
  const [threadError, setThreadError] = useState<string | null>(null);

  const [isComposerOpen, setIsComposerOpen] = useState(false);
  const [messageToReplyTo, setMessageToReplyTo] = useState<CustomerMessage | null>(null);

  const [smtpReady, setSmtpReady] = useState(true);
  const [smtpStatus, setSmtpStatus] = useState<string | null>(null);
  const [unreadSummary, setUnreadSummary] = useState<UnreadSummary>({ leads: {}, unassigned: 0, total: 0 });
  const [locallyReadIds, setLocallyReadIds] = useState<Set<string>>(new Set());
  const [folders, setFolders] = useState<string[]>([]);
  const [folderAssignments, setFolderAssignments] = useState<Record<string, string>>({});
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedBulkIds, setSelectedBulkIds] = useState<Set<string>>(new Set());
  const [bulkFolderTarget, setBulkFolderTarget] = useState("");
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [showCustomerModal, setShowCustomerModal] = useState(false);
  const [customerPrefill, setCustomerPrefill] = useState<Partial<CustomerFormState> | null>(null);

  const unassignedRef = useRef<CustomerMessage[]>([]);
  const inboxRef = useRef<CustomerMessage[]>([]);
  const sentRef = useRef<CustomerMessage[]>([]);
  const spamRef = useRef<CustomerMessage[]>([]);
  const trashRef = useRef<CustomerMessage[]>([]);

  const customersById = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach((customer) => {
      map.set(customer.id, customer);
    });
    return map;
  }, [customers]);

  const customerNamesByEmail = useMemo(() => {
    const map = new Map<string, { customerName: string; contactName?: string | null }>();
    customers.forEach((customer) => {
      customer.contacts?.forEach((contact) => {
        if (!contact?.email) return;
        map.set(contact.email.toLowerCase(), { customerName: customer.name, contactName: contact.name });
      });
    });
    return map;
  }, [customers]);

  const contactSuggestions = useMemo(() => {
    const seen = new Set<string>();
    const list: { id?: string; name?: string | null; email?: string | null; customerName?: string | null }[] = [];
    customers.forEach((customer) => {
      customer.contacts?.forEach((contact) => {
        const email = contact.email?.trim().toLowerCase();
        if (!email || seen.has(email)) return;
        seen.add(email);
        list.push({
          id: contact.id,
          name: contact.name,
          email,
          customerName: customer.name,
        });
      });
    });
    return list;
  }, [customers]);

  const persistSummaryToStorage = useCallback((summary: UnreadSummary) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(MESSAGE_COUNTS_KEY, JSON.stringify(summary));
    window.dispatchEvent(
      new CustomEvent("workspace-messages-counts", {
        detail: { total: summary.total ?? 0, summary },
      }),
    );
  }, []);

  const applyUnreadSummary = useCallback(
    (next: UnreadSummary | ((prev: UnreadSummary) => UnreadSummary), persist = true) => {
      setUnreadSummary((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (persist) {
          persistSummaryToStorage(resolved);
        }
        return resolved;
      });
    },
    [persistSummaryToStorage],
  );

  useEffect(() => {
    unassignedRef.current = unassignedMessages;
  }, [unassignedMessages]);

  useEffect(() => {
    inboxRef.current = inboxMessages;
  }, [inboxMessages]);

  useEffect(() => {
    sentRef.current = sentMessages;
  }, [sentMessages]);

  useEffect(() => {
    spamRef.current = spamMessages;
  }, [spamMessages]);
  useEffect(() => {
    trashRef.current = trashMessages;
  }, [trashMessages]);

  const onlyInbound = useCallback(
    (items: CustomerMessage[]) => items.filter((msg) => msg.direction === "INBOUND"),
    [],
  );

  // Restore composer open state after unexpected reloads
  useEffect(() => {
    if (typeof window === "undefined") return;
    const persisted = window.localStorage.getItem(COMPOSER_OPEN_KEY);
    if (persisted === "1") {
      setIsComposerOpen(true);
    }
  }, []);

  useEffect(() => {
    const syncFromStorage = () => {
      if (typeof window === "undefined") return;
      try {
        const raw = window.localStorage.getItem(MESSAGE_COUNTS_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw) as Partial<UnreadSummary>;
        const next: UnreadSummary = {
          leads: (parsed?.leads as Record<string, number>) ?? {},
          unassigned: Number.isFinite(parsed?.unassigned) ? Number(parsed?.unassigned) : 0,
          total: Number.isFinite(parsed?.total) ? Number(parsed?.total) : 0,
        };
        applyUnreadSummary(next, false);
      } catch {
        // ignore parse errors
      }
    };

    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ total?: number; summary?: UnreadSummary }>).detail;
      if (detail?.summary) {
        const summary = detail.summary;
        applyUnreadSummary(
          {
            leads: summary.leads ?? {},
            unassigned: Number.isFinite(summary.unassigned) ? Number(summary.unassigned) : 0,
            total: Number.isFinite(summary.total) ? Number(summary.total) : 0,
          },
          false,
        );
        return;
      }
      if (typeof detail?.total === "number") {
        applyUnreadSummary(
          (prev) => ({
            ...prev,
            total: Math.max(0, detail.total ?? 0),
          }),
          false,
        );
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === MESSAGE_COUNTS_KEY) {
        syncFromStorage();
      }
    };

    syncFromStorage();
    if (typeof window !== "undefined") {
      window.addEventListener("workspace-messages-counts", handleCustom as EventListener);
      window.addEventListener("storage", handleStorage);
    }
    return () => {
      if (typeof window !== "undefined") {
        window.removeEventListener("workspace-messages-counts", handleCustom as EventListener);
        window.removeEventListener("storage", handleStorage);
      }
    };
  }, [applyUnreadSummary]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!user?.tenantId) {
      setFolders([]);
      setFolderAssignments({});
      return;
    }
    const foldersKey = `${FOLDER_STORAGE_KEY}/${user.tenantId}`;
    const assignmentsKey = `${FOLDER_ASSIGNMENTS_KEY}/${user.tenantId}`;
    try {
      const storedFolders = window.localStorage.getItem(foldersKey);
      const storedAssignments = window.localStorage.getItem(assignmentsKey);
      setFolders(storedFolders ? (JSON.parse(storedFolders) as string[]) : []);
      setFolderAssignments(storedAssignments ? (JSON.parse(storedAssignments) as Record<string, string>) : {});
    } catch {
      setFolders([]);
      setFolderAssignments({});
    }
  }, [user?.tenantId]);

  const persistFolders = useCallback(
    (nextFolders: string[], nextAssignments: Record<string, string>) => {
      if (typeof window === "undefined" || !user?.tenantId) return;
      const foldersKey = `${FOLDER_STORAGE_KEY}/${user.tenantId}`;
      const assignmentsKey = `${FOLDER_ASSIGNMENTS_KEY}/${user.tenantId}`;
      window.localStorage.setItem(foldersKey, JSON.stringify(nextFolders));
      window.localStorage.setItem(assignmentsKey, JSON.stringify(nextAssignments));
    },
    [user?.tenantId],
  );

  const fetchMailboxData = useCallback(async (customerId?: string | null) => {
    if (authLoading) return;
    setLoading(true);
    setError(null);

    const customerQuery = customerId ? `&customerId=${customerId}` : "";

    const spamRequest = authorizedRequest<CustomerMessage[]>(`/messages/spam?limit=50${customerQuery}`).catch((err) => {
      if (err instanceof ApiError && err.status === 404) {
        console.warn("Spam-Endpoint nicht verfügbar, verwende leere Liste.");
        return [];
      }
      throw err;
    });
    const trashRequest = authorizedRequest<CustomerMessage[]>(`/messages/trash?limit=50`).catch((err) => {
      console.warn("Papierkorb konnte nicht geladen werden", err);
      return [];
    });

    try {
      // If a customer ID is provided, we only fetch their messages
      if (customerId) {
        const [
          inboxResponse,
          sentResponse,
          spamResponse,
          trashResponse,
          customersResponse, // Fetch customer list to find the active one
        ] = await Promise.all([
          authorizedRequest<CustomerMessage[]>(`/messages/inbox?limit=50${customerQuery}`),
          authorizedRequest<CustomerMessage[]>(`/messages/sent?limit=50${customerQuery}`),
          spamRequest,
          trashRequest,
          authorizedRequest<CustomerListResponse>("/customers?limit=100"), // Fetch more to find the customer
        ]);

        setInboxMessages(onlyInbound(inboxResponse));
        setSentMessages(sentResponse);
        setSpamMessages(spamResponse);
        setTrashMessages(trashResponse ?? []);
        
        const allCustomers = customersResponse.items;
        const currentCustomer = allCustomers.find(c => c.id === customerId);
        setCustomers(currentCustomer ? [currentCustomer] : []);

        setLeads([]);
        setUnassignedMessages([]);

      } else {
         const [
          customersResponse,
          leadsResponse,
          inboxResponse,
          unassignedResponse,
          sentResponse,
          spamResponse,
          unreadResponse,
          trashResponse,
        ] = await Promise.all([
          authorizedRequest<CustomerListResponse>("/customers?limit=50"),
          authorizedRequest<Lead[]>("/leads?limit=50"),
          authorizedRequest<CustomerMessage[]>(`/messages/inbox?limit=50${customerQuery}`),
          authorizedRequest<CustomerMessage[]>(`/messages/unassigned?limit=50`),
          authorizedRequest<CustomerMessage[]>(`/messages/sent?limit=50${customerQuery}`),
          spamRequest,
          authorizedRequest<{ leads: Record<string, number>; unassigned: number; total: number }>("/messages/unread-summary"),
          trashRequest,
        ]);

        setCustomers(customersResponse.items);
        setLeads(leadsResponse);
        setInboxMessages(onlyInbound(inboxResponse));
        setUnassignedMessages(onlyInbound(unassignedResponse));
        setSentMessages(sentResponse);
        setSpamMessages(spamResponse);
        setTrashMessages(trashResponse ?? []);
        const derivedUnread = countUnreadMessages(inboxResponse);
        applyUnreadSummary({ ...unreadResponse, total: derivedUnread, unassigned: derivedUnread });
      }

      const smtp = await authorizedRequest<SmtpSettings | null>("/settings/smtp");
      if (!smtp || !smtp.hasPassword) {
        setSmtpReady(false);
        setSmtpStatus("Bitte hinterlege deinen SMTP-Zugang unter Einstellungen.");
      } else {
        setSmtpReady(true);
        setSmtpStatus(null);
      }
    } catch (err) {
      setError("Daten konnten nicht geladen werden.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [applyUnreadSummary, authLoading, authorizedRequest]);

  useEffect(() => {
    void fetchMailboxData(customerIdFromUrl);
  }, [fetchMailboxData, customerIdFromUrl]);

  // Background refresh for unread counters without visible reloads
  useEffect(() => {
    if (authLoading) return;

    let mounted = true;
    const controller = new AbortController();

    const syncUnread = async () => {
      try {
        const summary = await authorizedRequest<{ leads: Record<string, number>; unassigned: number; total: number }>(
          "/messages/unread-summary",
          { signal: controller.signal },
        );
        if (!mounted || !summary) return;

        const leads = summary.leads ?? {};
        const unassigned = Number.isFinite(summary.unassigned) ? summary.unassigned : 0;
        const computedTotal = Math.max(
          Number.isFinite(summary.total) ? summary.total : 0,
          unassigned,
          Object.values(leads).reduce((acc, value) => acc + (Number.isFinite(value) ? value : 0), 0),
        );

        applyUnreadSummary({
          leads,
          unassigned,
          total: computedTotal,
        });
      } catch (err) {
        if (controller.signal.aborted) return;
        console.warn("Unread summary refresh failed", err);
      }
    };

    void syncUnread();
    const interval = setInterval(syncUnread, 20000);

    return () => {
      mounted = false;
      controller.abort();
      clearInterval(interval);
    };
  }, [applyUnreadSummary, authLoading, authorizedRequest]);

  const leadToMessage = (lead: Lead): CustomerMessage => ({
    id: lead.id,
    customerId: null,
    leadId: lead.id,
    contact: null,
    direction: "INBOUND",
    status: "SENT" as CustomerMessageStatus,
    subject: (() => {
      const firstLine = lead.message?.split(/\r?\n/)[0]?.trim();
      if (firstLine && !firstLine.toLowerCase().includes("neue anfrage über kontaktformular")) {
        return firstLine.slice(0, 120);
      }
      return lead.fullName || lead.email || "Ohne Betreff";
    })(),
    preview: lead.message?.trim() || undefined,
    body: lead.message ?? "",
    fromEmail: lead.email,
    toEmail: undefined,
    attachments: [],
    readAt: lead.processedAt ?? (locallyReadIds.has(lead.id) ? new Date().toISOString() : null),
    sentAt: null,
    receivedAt: lead.createdAt,
    createdAt: lead.createdAt,
    updatedAt: lead.createdAt,
  });

  // Nachrichtenauswertung via OpenAI ist aktuell deaktiviert, um unerwartete Refreshes zu vermeiden.
  
  const fetchMessagesByEmails = useCallback(
    async (emails: string[]) => {
      if (!emails.length) return [];
      const results = await Promise.all(
        emails.map((email) =>
          authorizedRequest<CustomerMessage[]>(
            `/messages/by-email?email=${encodeURIComponent(email)}`,
          ),
        ),
      );
      const seen = new Set<string>();
      const combined: CustomerMessage[] = [];
      results.forEach((items) => {
        items.forEach((msg) => {
          if (seen.has(msg.id)) return;
          seen.add(msg.id);
          combined.push(msg);
        });
      });
      combined.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
      return combined;
    },
    [authorizedRequest],
  );

  const markMessagesRead = useCallback(
    async (messages: CustomerMessage[]) => {
      const unread = messages.filter(
        (msg) => msg.direction === "INBOUND" && !msg.readAt,
      );
      if (!unread.length) return;
      const ids = unread.map((msg) => msg.id).filter(Boolean);
      if (!ids.length) return;

      const serverIds = ids.filter((id) => isUuid(id));
      const now = new Date().toISOString();
      const localIds = new Set<string>(ids);
      unread.forEach((msg) => {
        if (msg.leadId) {
          localIds.add(msg.leadId);
        }
        if (msg.id.startsWith("lead-")) {
          localIds.add(msg.id.replace(/^lead-/, ""));
        }
      });

      try {
        if (serverIds.length) {
          await authorizedRequest("/messages/read", {
            method: "POST",
            body: JSON.stringify({ ids: serverIds }),
          });
        }

        setThreadMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setInboxMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setUnassignedMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setSentMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setSpamMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setTrashMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setLocallyReadIds((prev) => {
          const next = new Set(prev);
          localIds.forEach((id) => next.add(id));
          return next;
        });
        applyUnreadSummary((prev) => {
          const nextLeads = { ...prev.leads };
          let nextUnassigned = prev.unassigned;
          unread.forEach((msg) => {
            if (msg.leadId && nextLeads[msg.leadId] !== undefined) {
              nextLeads[msg.leadId] = Math.max(0, nextLeads[msg.leadId] - 1);
            } else if (!msg.customerId && !msg.leadId) {
              nextUnassigned = Math.max(0, nextUnassigned - 1);
            }
          });
          const nextTotal = Math.max(0, prev.total - unread.length);
          return { ...prev, leads: nextLeads, unassigned: nextUnassigned, total: nextTotal };
        });
      } catch (err) {
        console.error("Mark read failed", err);
      }
    },
    [applyUnreadSummary, authorizedRequest],
  );

  const markLeadProcessed = useCallback(
    async (leadId: string) => {
      const exists = leads.some((lead) => lead.id === leadId);
      if (!exists) {
        return;
      }
      try {
        const updated = await authorizedRequest<Lead>(`/leads/${leadId}/read`, {
          method: "PATCH",
        });
        setLeads((prev) =>
          prev.map((lead) => (lead.id === leadId ? { ...lead, processedAt: updated.processedAt } : lead)),
        );
        setLocallyReadIds((prev) => {
          const next = new Set(prev);
          next.add(leadId);
          return next;
        });
      } catch (err) {
        console.error("Lead read update failed", err);
      }
    },
    [authorizedRequest, leads],
  );

  const mergeAndSortMessages = useCallback((lists: CustomerMessage[][]) => {
    const map = new Map<string, CustomerMessage>();
    lists.forEach((list) => {
      list?.forEach((msg) => {
        const existing = map.get(msg.id);
        if (!existing) {
          map.set(msg.id, msg);
          return;
        }
        const existingTs = new Date(existing.updatedAt ?? existing.createdAt ?? 0).getTime();
        const incomingTs = new Date(msg.updatedAt ?? msg.createdAt ?? 0).getTime();
        if (incomingTs >= existingTs) {
          map.set(msg.id, msg);
        }
      });
    });
    return Array.from(map.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
    );
  }, []);

  useEffect(() => {
    if (!selectedId) { setThreadMessages([]); return; };

    async function fetchThread() {
      if (!selectedId) return;
      const currentSelectedId = selectedId;
      setLoadingThread(true);
      setThreadError(null);
      let url = "";

      let itemType, rawId;
      const firstHyphenIndex = currentSelectedId.indexOf('-');

      if (firstHyphenIndex !== -1 && !isUuid(currentSelectedId)) {
        itemType = currentSelectedId.substring(0, firstHyphenIndex);
        rawId = currentSelectedId.substring(firstHyphenIndex + 1);
      } else {
        itemType = activeMailbox;
        rawId = currentSelectedId;
      }

      const findCustomerEmails = () => {
        if (activeMailbox !== "customers") return [];
        const customer = customers.find((c) => c.id === rawId);
        if (!customer) return [];
        const emails =
          customer.contacts
            ?.map((contact) => contact.email?.trim().toLowerCase() ?? null)
            .filter((email): email is string => Boolean(email)) ?? [];
        return Array.from(new Set(emails));
      };

    const mailboxKind = isFolderMailbox ? "inbox" : activeMailbox;

    if (mailboxKind === "customers") {
      const emails = findCustomerEmails();
      const requests: Promise<CustomerMessage[]>[] = [];

      if (emails.length) {
          requests.push(fetchMessagesByEmails(emails));
        }

        requests.push(
          authorizedRequest<CustomerMessageListResponse>(`/customers/${rawId}/messages`)
            .then((response) => response.items)
            .catch((err) => {
              if (err instanceof ApiError && err.status === 404) {
                return [];
              }
              throw err;
            }),
        );

        try {
          const results = await Promise.all(requests);
          const merged = mergeAndSortMessages(results);
          setThreadMessages(merged);
          setThreadError(null);
          await markMessagesRead(merged);
          if (rawId) {
            await markLeadProcessed(rawId);
          }
          return;
        } catch (err) {
          console.error(err);
          const localMatches = mergeAndSortMessages([
            inboxRef.current.filter((m) => m.customerId === rawId),
            unassignedRef.current.filter((m) => m.customerId === rawId),
            emails.length
              ? inboxRef.current.filter(
                  (m) =>
                    (m.toEmail && emails.includes(m.toEmail.toLowerCase())) ||
                    (m.fromEmail && emails.includes(m.fromEmail.toLowerCase())),
                )
              : [],
          ]);
          if (localMatches.length) {
            setThreadMessages(localMatches);
            setThreadError(null);
            await markMessagesRead(localMatches);
            return;
          }
          const message =
            err instanceof Error && err.message
              ? err.message
              : "Verlauf konnte nicht geladen werden.";
          setThreadError(message);
        } finally {
          setLoadingThread(false);
        }

        return;
      } else if (mailboxKind === "inbox") {
          if (itemType === 'lead') {
            url = `/leads/${rawId}/messages`;
          } else if (itemType === 'message') { 
            const clickedMessage = inboxRef.current.find(m => m.id === rawId);
        if (clickedMessage?.leadId) {
            url = `/leads/${clickedMessage.leadId}/messages`;
            } else if (clickedMessage?.customerId) {
                url = `/customers/${clickedMessage.customerId}/messages`;
            } else {
                const senderEmail = clickedMessage?.fromEmail;
                if (senderEmail) {
                    const emailMessages = await fetchMessagesByEmails([senderEmail]);
                    const thread = mergeAndSortMessages([emailMessages]);
                    setThreadMessages(thread);
                    await markMessagesRead(thread);
                    if (clickedMessage?.leadId) {
                      await markLeadProcessed(clickedMessage.leadId);
                    }
                } else {
                    const single = clickedMessage ? [clickedMessage] : [];
                    setThreadMessages(single);
                    await markMessagesRead(single);
                    if (clickedMessage?.leadId) {
                      await markLeadProcessed(clickedMessage.leadId);
                    }
                }
                setLoadingThread(false);
                return;
            }
          }
      }  else if (mailboxKind === 'sent' || mailboxKind === 'spam' || mailboxKind === 'trash') {
          const messageSource = mailboxKind === 'sent' ? sentRef.current : mailboxKind === 'spam' ? spamRef.current : trashRef.current;
          const message = messageSource.find(m => m.id === rawId);
          if (message?.leadId) {
            url = `/leads/${message.leadId}/messages`;
          } else if (message?.customerId) {
            url = `/customers/${message.customerId}/messages`;
          } else {
            if(message) {
              const single = [message];
              setThreadMessages(single);
              await markMessagesRead(single);
              if (message.leadId) {
                await markLeadProcessed(message.leadId);
              }
            }
              setLoadingThread(false);
              return;
            }
      }
      
      if (!url) {
        setLoadingThread(false);
        setThreadError("Verlauf konnte nicht gefunden werden.");
        return;
      }
      
      try {
        const response = await authorizedRequest<CustomerMessageListResponse | LeadMessageListResponse>(url);
        setThreadMessages(response.items);
        await markMessagesRead(response.items);
        if (activeMailbox === "inbox" && itemType === "lead") {
          await markLeadProcessed(rawId);
        }
      } catch (err) {
        const message =
          err instanceof Error && err.message
            ? err.message
            : "Verlauf konnte nicht geladen werden.";
        setThreadError(message);
      } finally {
        setLoadingThread(false);
      }
    }

    fetchThread();
  }, [selectedId, activeMailbox, authorizedRequest, customers, fetchMessagesByEmails, mergeAndSortMessages, markMessagesRead, markLeadProcessed]);

  const handleMailboxChange = (mailbox: Mailbox) => {
    if (customerIdFromUrl) {
      router.push("/workspace/messages");
    }
    clearSelection();
    setActiveMailbox(mailbox);
    setSelectedId(null);
    setSearch("");
    setThreadMessages([]);
    setMessageToReplyTo(null);
  };
  
  const handleMessageSent = (newMessage: CustomerMessage) => {
    if (selectedId) {
        setThreadMessages(prev => [newMessage, ...prev]);
    } else if(activeMailbox === 'inbox') {
        // This is tricky, we don't know if it's a lead or unassigned reply
    }
  };

  const handleCreateFolder = useCallback(
    (name: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;
      setFolders((prev) => {
        if (prev.includes(trimmed)) return prev;
        const next = [...prev, trimmed];
        persistFolders(next, folderAssignments);
        return next;
      });
    },
    [folderAssignments, persistFolders],
  );

  const handleRenameFolder = useCallback(
    (prevName: string, nextName: string) => {
      const trimmed = nextName.trim();
      if (!trimmed || trimmed === prevName) return;
      setFolders((prev) => {
        if (!prev.includes(prevName)) return prev;
        if (prev.includes(trimmed)) return prev;
        const next = prev.map((f) => (f === prevName ? trimmed : f));
        setFolderAssignments((prevAssignments) => {
          const nextAssignments: Record<string, string> = {};
          Object.entries(prevAssignments).forEach(([msgId, folder]) => {
            nextAssignments[msgId] = folder === prevName ? trimmed : folder;
          });
          persistFolders(next, nextAssignments);
          return nextAssignments;
        });
        return next;
      });
    },
    [persistFolders],
  );

  const handleDeleteFolder = useCallback(
    (name: string) => {
      setFolders((prev) => {
        if (!prev.includes(name)) return prev;
        const next = prev.filter((f) => f !== name);
        setFolderAssignments((prevAssignments) => {
          const nextAssignments: Record<string, string> = {};
          Object.entries(prevAssignments).forEach(([msgId, folder]) => {
            if (folder !== name) nextAssignments[msgId] = folder;
          });
          persistFolders(next, nextAssignments);
          return nextAssignments;
        });
        if (activeMailbox === `folder:${name}`) {
          setActiveMailbox("inbox");
          setSelectedId(null);
        }
        return next;
      });
    },
    [activeMailbox, persistFolders],
  );

  const handleMoveFolder = useCallback(
    (name: string, direction: "up" | "down") => {
      setFolders((prev) => {
        const idx = prev.indexOf(name);
        if (idx === -1) return prev;
        const target = direction === "up" ? idx - 1 : idx + 1;
        if (target < 0 || target >= prev.length) return prev;
        const next = [...prev];
        [next[idx], next[target]] = [next[target], next[idx]];
        persistFolders(next, folderAssignments);
        return next;
      });
    },
    [folderAssignments, persistFolders],
  );

  const handleMoveToFolder = useCallback(
    (message: CustomerMessage, folderName: string) => {
      if (!folderName.trim()) return;
      if (message.direction !== "INBOUND") return;
      setFolders((prev) => {
        const nextFolders = prev.includes(folderName) ? prev : [...prev, folderName];
        setFolderAssignments((prevAssignments) => {
          const nextAssignments = { ...prevAssignments, [message.id]: folderName };
          persistFolders(nextFolders, nextAssignments);
          return nextAssignments;
        });
        return nextFolders;
      });
    },
    [persistFolders],
  );

  const selectableInboxItem = useCallback((item: InboxItem) => item.type === "message", []);

  const getSelectionId = useCallback(
    (item: InboxItem) => (item.type === "message" ? item.data.id : item.id),
    [],
  );

  const toggleSelectItem = useCallback(
    (item: InboxItem) => {
      const id = getSelectionId(item);
      setSelectedBulkIds((prev) => {
        const next = new Set(prev);
        if (next.has(id)) {
          next.delete(id);
        } else {
          next.add(id);
        }
        return next;
      });
    },
    [getSelectionId],
  );

  const clearSelection = useCallback(() => {
    setSelectionMode(false);
    setSelectedBulkIds(new Set());
    setBulkFolderTarget("");
  }, []);

  const handleBulkMoveToTrash = useCallback(async () => {
    const ids = Array.from(selectedBulkIds);
    if (!ids.length) return;
    const idSet = new Set(ids);
    const now = new Date().toISOString();
    setBulkProcessing(true);
    try {
      await authorizedRequest("/messages/trash", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      const movedPool = [
        ...inboxRef.current,
        ...unassignedRef.current,
        ...spamRef.current,
        ...trashRef.current,
      ].filter((msg) => idSet.has(msg.id));

      setInboxMessages((prev) => prev.filter((msg) => !idSet.has(msg.id)));
      setUnassignedMessages((prev) => prev.filter((msg) => !idSet.has(msg.id)));
      setSpamMessages((prev) => prev.filter((msg) => !idSet.has(msg.id)));
      setTrashMessages((prev) => {
        const map = new Map<string, CustomerMessage>();
        [...prev, ...movedPool.map((msg) => ({ ...msg, deletedAt: msg.deletedAt ?? now }))].forEach((msg) => {
          map.set(msg.id, { ...msg, deletedAt: msg.deletedAt ?? now });
        });
        return Array.from(map.values()).sort(
          (a, b) =>
            new Date(b.deletedAt ?? b.createdAt).getTime() -
            new Date(a.deletedAt ?? a.createdAt).getTime(),
        );
      });
      setFolderAssignments((prev) => {
        const next = { ...prev };
        ids.forEach((id) => {
          if (next[id]) delete next[id];
        });
        persistFolders(folders, next);
        return next;
      });
      applyUnreadSummary((prev) => {
        const unreadRemoved = movedPool.filter((msg) => msg.direction === "INBOUND" && !msg.readAt);
        if (!unreadRemoved.length) return prev;
        const leads = { ...prev.leads };
        let unassigned = prev.unassigned;
        unreadRemoved.forEach((msg) => {
          if (msg.leadId && leads[msg.leadId] !== undefined) {
            leads[msg.leadId] = Math.max(0, leads[msg.leadId] - 1);
          } else if (!msg.customerId && !msg.leadId) {
            unassigned = Math.max(0, unassigned - 1);
          }
        });
        const total = Math.max(0, prev.total - unreadRemoved.length);
        return { ...prev, leads, unassigned, total };
      });
      if (selectedId) {
        const normalized = selectedId.startsWith("message-") ? selectedId.replace("message-", "") : selectedId;
        if (idSet.has(normalized)) {
          setSelectedId(null);
          setThreadMessages([]);
        }
      }
      clearSelection();
    } catch (err) {
      console.error("Papierkorb verschieben fehlgeschlagen", err);
    } finally {
      setBulkProcessing(false);
    }
  }, [applyUnreadSummary, authorizedRequest, clearSelection, folders, persistFolders, selectedBulkIds, selectedId]);

  const handleSingleMoveToTrash = useCallback(
    async (message: CustomerMessage) => {
      try {
        await authorizedRequest("/messages/trash", {
          method: "POST",
          body: JSON.stringify({ ids: [message.id] }),
        });
        setInboxMessages((prev) => prev.filter((m) => m.id !== message.id));
        setUnassignedMessages((prev) => prev.filter((m) => m.id !== message.id));
        setSpamMessages((prev) => prev.filter((m) => m.id !== message.id));
        setTrashMessages((prev) => [{ ...message, deletedAt: new Date().toISOString() }, ...prev]);
        if (selectedId === message.id) {
          setSelectedId(null);
          setThreadMessages([]);
        }
      } catch (err) {
        console.error("Papierkorb (einzeln) fehlgeschlagen", err);
      }
    },
    [authorizedRequest, selectedId],
  );

  const handleExtractContact = useCallback(
    (message: CustomerMessage) => {
      const prefill = prefillFromMessage(message);
      setCustomerPrefill(prefill);
      setShowCustomerModal(true);
    },
    [],
  );

  const handleBulkMoveToFolder = useCallback(() => {
    const ids = Array.from(selectedBulkIds);
    const target = bulkFolderTarget.trim();
    if (!ids.length || !target) return;
    const idSet = new Set(ids);
    const pool = [...inboxMessages, ...unassignedMessages, ...spamMessages];
    const eligible = pool.filter((msg) => idSet.has(msg.id) && msg.direction === "INBOUND");
    if (!eligible.length) return;
    setFolders((prev) => {
      const nextFolders = prev.includes(target) ? prev : [...prev, target];
      setFolderAssignments((prevAssign) => {
        const nextAssign = { ...prevAssign };
        eligible.forEach((msg) => {
          nextAssign[msg.id] = target;
        });
        persistFolders(nextFolders, nextAssign);
        return nextAssign;
      });
      return nextFolders;
    });
  }, [bulkFolderTarget, inboxMessages, persistFolders, selectedBulkIds, spamMessages, unassignedMessages]);

  const handleBulkRestoreFromTrash = useCallback(async () => {
    const ids = Array.from(selectedBulkIds);
    if (!ids.length) return;
    const idSet = new Set(ids);
    const toRestore = trashRef.current.filter((msg) => idSet.has(msg.id));
    if (!toRestore.length) return;
    setBulkProcessing(true);
    try {
      await authorizedRequest("/messages/trash/restore", {
        method: "POST",
        body: JSON.stringify({ ids }),
      });
      const restored = toRestore.map((msg) => ({ ...msg, deletedAt: null }));
      setTrashMessages((prev) => prev.filter((msg) => !idSet.has(msg.id)));

      setSpamMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        restored
          .filter((m) => m.isSpam)
          .forEach((m) => map.set(m.id, m));
        return Array.from(map.values());
      });
      setInboxMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        restored
          .filter((m) => !m.isSpam)
          .forEach((m) => map.set(m.id, m));
        return Array.from(map.values());
      });
      setUnassignedMessages((prev) => {
        const map = new Map(prev.map((m) => [m.id, m]));
        restored
          .filter((m) => !m.isSpam && !m.customerId && !m.leadId && m.direction === "INBOUND")
          .forEach((m) => map.set(m.id, m));
        return Array.from(map.values());
      });

      applyUnreadSummary((prev) => {
        let total = prev.total;
        let unassigned = prev.unassigned;
        const leads = { ...prev.leads };
        restored.forEach((msg) => {
          if (msg.direction === "INBOUND" && !msg.readAt) {
            total += 1;
            if (msg.leadId) {
              leads[msg.leadId] = (leads[msg.leadId] ?? 0) + 1;
            } else if (!msg.customerId) {
              unassigned += 1;
            }
          }
        });
        return { ...prev, total, unassigned, leads };
      });

      if (selectedId) {
        const normalized = selectedId.startsWith("message-")
          ? selectedId.replace("message-", "")
          : selectedId;
        if (idSet.has(normalized)) {
          setSelectedId(null);
          setThreadMessages([]);
        }
      }
      clearSelection();
    } catch (err) {
      console.error("Wiederherstellen fehlgeschlagen", err);
    } finally {
      setBulkProcessing(false);
    }
  }, [applyUnreadSummary, authorizedRequest, clearSelection, selectedBulkIds, selectedId]);

  const isFolderMailbox = activeMailbox.startsWith("folder:");
  const activeFolder = isFolderMailbox ? activeMailbox.replace("folder:", "") : null;

  const folderUnread = useMemo(() => {
    const result: Record<string, number> = {};
    const pool = [...inboxMessages, ...unassignedMessages, ...spamMessages];
    pool.forEach((msg) => {
      const folderName = folderAssignments[msg.id];
      if (!folderName) return;
      if (msg.direction === "INBOUND" && !msg.readAt) {
        result[folderName] = (result[folderName] ?? 0) + 1;
      }
    });
    return result;
  }, [folderAssignments, inboxMessages, spamMessages, unassignedMessages]);

  const folderMessages = useMemo(() => {
    if (!activeFolder) return [];
    const pool = [...inboxMessages, ...unassignedMessages, ...spamMessages];
    const seen = new Set<string>();
    return pool.filter((msg) => {
      if (seen.has(msg.id)) return false;
      if (folderAssignments[msg.id] !== activeFolder) return false;
      seen.add(msg.id);
      return true;
    });
  }, [activeFolder, folderAssignments, inboxMessages, spamMessages, unassignedMessages]);

  type InboxItem = { id: string; type: "lead"; data: CustomerMessage } | { id: string; type: "message"; data: CustomerMessage };
  type ListItem = InboxItem | Customer | Lead | CustomerMessage;

  const filteredItems = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    
    let source: ListItem[] = [];
    if (activeMailbox === "inbox") {
        const leadItems: InboxItem[] = leads.map((lead) => ({
          id: `lead-${lead.id}`,
          type: "lead",
          data: leadToMessage(lead),
        }));
        const inboxItems: InboxItem[] = inboxMessages
          .filter(Boolean)
          .map((msg) => ({ id: `message-${msg.id}`, type: "message", data: msg }));
        const unassignedItems: InboxItem[] = unassignedMessages
          .filter(Boolean)
          .map((msg) => ({ id: `message-${msg.id}`, type: "message", data: msg }));
        const seen = new Set<string>();
        const merged = [...leadItems, ...inboxItems, ...unassignedItems].filter((item) => {
          if (seen.has(item.id)) return false;
          seen.add(item.id);
          return true;
        });
        source = merged;
    }
    else if (activeMailbox === "customers") source = customers;
    else if (activeMailbox === "sent") source = sentMessages;
    else if (activeMailbox === "spam") source = spamMessages;
    else if (activeMailbox === "trash") source = trashMessages;
    else if (isFolderMailbox && activeFolder) {
      const folderItems: InboxItem[] = folderMessages.map((msg) => ({
        id: `message-${msg.id}`,
        type: "message",
        data: msg,
      }));
      source = folderItems;
    }
    else return [];

    const sorted = [...source].sort((a, b) => {
        const dataA = "type" in a ? a.data : a;
        const dataB = "type" in b ? b.data : b;
        const tsA =
          (dataA as CustomerMessage).deletedAt ??
          (dataA as CustomerMessage).receivedAt ??
          (dataA as CustomerMessage).sentAt ??
          (dataA as CustomerMessage).createdAt;
        const tsB =
          (dataB as CustomerMessage).deletedAt ??
          (dataB as CustomerMessage).receivedAt ??
          (dataB as CustomerMessage).sentAt ??
          (dataB as CustomerMessage).createdAt;
        return new Date(tsB ?? 0).getTime() - new Date(tsA ?? 0).getTime();
    });

    if (!lowerSearch) return sorted;
    return sorted.filter((item) => {
        const data = "type" in item ? item.data : item;
        if ("name" in data && typeof data.name === "string") return data.name.toLowerCase().includes(lowerSearch);
        if ("fullName" in data && typeof data.fullName === "string") return data.fullName.toLowerCase().includes(lowerSearch);
        if ("subject" in data && typeof (data as CustomerMessage).subject === "string" && (data as CustomerMessage).subject) return (data as CustomerMessage).subject!.toLowerCase().includes(lowerSearch);
        if ("fromEmail" in data && typeof (data as CustomerMessage).fromEmail === "string" && (data as CustomerMessage).fromEmail) return (data as CustomerMessage).fromEmail!.toLowerCase().includes(lowerSearch);
        return false;
    });
  }, [search, activeMailbox, activeFolder, customers, leads, inboxMessages, sentMessages, spamMessages, trashMessages, unassignedMessages, folderMessages, isFolderMailbox]);
  
  const renderInboxItem = (
    item: InboxItem,
    isActive: boolean,
    selectionInfo?: { selectable: boolean; selected: boolean; selectionActive: boolean },
  ) => {
    const selectable = selectionInfo?.selectable && selectableInboxItem(item);
    return renderUnassignedItem(item.data, isActive, {
      isSelected: Boolean(selectable && selectionInfo?.selected),
      selectionActive: Boolean(selectable && selectionInfo?.selectionActive),
      onToggle: selectable ? () => toggleSelectItem(item) : undefined,
    });
  };
  const renderCustomerItem = (item: Customer, isActive: boolean, _selection?: unknown) => {
    const primaryContact = item.contacts?.find((contact) => contact.email?.trim()) ?? item.contacts?.[0];
    const email = primaryContact?.email?.trim() || "Keine E-Mail hinterlegt";
    const responsible =
      item.ownerName?.trim() || primaryContact?.name?.trim() || "Keine verantwortliche Person";

    return (
      <div
        className={clsx(
          "w-full rounded-2xl border px-4 py-3 text-left",
          isActive ? "border-white/30 bg-white/10" : "border-white/10 text-slate-300 hover:border-white/20",
        )}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-semibold text-white">{item.name}</p>
            <p className="truncate text-xs text-slate-300">E-Mail: {email}</p>
            <p className="truncate text-xs text-slate-300">Verantwortlich: {responsible}</p>
          </div>
        </div>
      </div>
    );
  };
  const renderLeadItem = (item: Lead, isActive: boolean, _selection?: unknown) => {
    const unreadCount = unreadSummary.leads[item.id] ?? 0;
    const isUnreadLead = unreadCount > 0;
    return (
      <div className={clsx("w-full rounded-2xl border px-4 py-3 text-left", isActive ? "border-white/30 bg-white/10" : "border-white/10 text-slate-300 hover:border-white/20")}>
        <p className="font-semibold text-white">{item.fullName}</p>
        <div className="mt-1 flex items-center gap-2">
          <p className="text-xs text-slate-400">{item.email}</p>
          {isUnreadLead && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-200">Neu</span>}
        </div>
      </div>
    );
  };
  
  const resolveSenderDisplay = useCallback(
    (item: CustomerMessage) => {
      const primaryEmail = (item.fromEmail || item.contact?.email || "").trim();
      const lookupKey = primaryEmail.toLowerCase();
      const mapped = lookupKey ? customerNamesByEmail.get(lookupKey) : undefined;
      let mappedName = mapped?.contactName?.trim() || mapped?.customerName;
      if (!mappedName && item.customerId) {
        const customer = customersById.get(item.customerId);
        if (customer) mappedName = customer.name;
      }

      const label =
        item.contact?.name?.trim() ||
        mappedName ||
        primaryEmail ||
        item.contact?.email ||
        "Unbekannt";
      const email = primaryEmail || item.contact?.email || undefined;

      return { label, email };
    },
    [customerNamesByEmail, customersById],
  );

  const renderUnassignedItem = (
    item: CustomerMessage,
    isActive: boolean,
    selectionState?: { isSelected: boolean; selectionActive: boolean; onToggle?: () => void },
  ) => {
    if (!item) return null;
    const isUnread = item.direction === "INBOUND" && !item.readAt;
    const timestamp = formatCompactListDate(item.receivedAt ?? item.sentAt ?? item.createdAt);
    const urgency = detectUrgency(item);
    const categoryMeta = getCategoryMeta(item.category);
    const { label: fromLabel, email: fromEmail } = resolveSenderDisplay(item);
    const teaserSource = item.preview?.trim() || item.summary?.trim() || item.body || "";
    const teaser = teaserSource.replace(/\s+/g, " ").trim();
    const teaserDisplay = teaser.length > 140 ? `${teaser.slice(0, 140)}…` : teaser;
    return (
      <div className="relative">
        {selectionState?.selectionActive && (
          <button
            type="button"
            aria-label={selectionState.isSelected ? "Abwählen" : "Auswählen"}
            onClick={(e) => {
              e.stopPropagation();
              selectionState.onToggle?.();
            }}
            className={clsx(
              "absolute left-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-full border text-slate-100 transition",
              selectionState.isSelected
                ? "border-emerald-400/60 bg-emerald-500/20"
                : "border-white/10 bg-white/5 hover:border-white/30",
            )}
          >
            {selectionState.isSelected ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />}
          </button>
        )}
      <div
        className={clsx(
          "w-full rounded-2xl border px-4 py-3 text-left",
          selectionState?.selectionActive ? "pl-12" : "",
          isActive ? "border-white/30 bg-white/10" : "border-white/10 text-slate-300 hover:border-white/20",
        )}
      >
        <div className="grid grid-cols-[minmax(140px,0.9fr)_minmax(0,1.7fr)_auto] items-center gap-3">
          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2">
              <p className="truncate font-semibold text-white">{fromLabel}</p>
              {isUnread && (
                <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-200">
                  Neu
                </span>
              )}
              {categoryMeta && (
                <span
                  className={clsx(
                    "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                    categoryMeta.className,
                  )}
                >
                  {categoryMeta.label}
                </span>
              )}
              {urgency && (
                <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-200">
                  {urgency}
                </span>
              )}
            </div>
            {fromEmail && fromEmail !== fromLabel && (
              <p className="truncate text-xs text-slate-400">{fromEmail}</p>
            )}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-semibold text-white">{item.subject || "Ohne Betreff"}</p>
            {teaserDisplay && <p className="truncate text-xs text-slate-400">{teaserDisplay}</p>}
          </div>
          <div className="ml-auto text-right text-xs text-slate-400 tabular-nums">{timestamp}</div>
        </div>
      </div>
      </div>
    );
  };

  const renderSentItem = (item: CustomerMessage, isActive: boolean, _selection?: unknown) => {
    const timestamp = formatCompactListDate(item.sentAt ?? item.createdAt);
    const teaserSource = item.preview?.trim() || item.summary?.trim() || item.body || "";
    const teaser = teaserSource.replace(/\s+/g, " ").trim();
    const teaserDisplay = teaser.length > 140 ? `${teaser.slice(0, 140)}…` : teaser;
    return (
      <div
        className={clsx(
          "w-full rounded-2xl border px-4 py-3 text-left",
          isActive ? "border-white/30 bg-white/10" : "border-white/10 text-slate-300 hover:border-white/20",
        )}
      >
        <div className="grid grid-cols-[minmax(140px,0.9fr)_minmax(0,1.7fr)_auto] items-center gap-3">
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-semibold text-white">{`An: ${item.toEmail ?? "Unbekannt"}`}</p>
            {item.fromEmail && <p className="truncate text-xs text-slate-400">{item.fromEmail}</p>}
          </div>
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-semibold text-white">{item.subject || "Ohne Betreff"}</p>
            {teaserDisplay && <p className="truncate text-xs text-slate-400">{teaserDisplay}</p>}
          </div>
          <div className="ml-auto text-right text-xs text-slate-400 tabular-nums">{timestamp}</div>
        </div>
      </div>
    );
  };
  
  const renderSpamItem = (item: CustomerMessage, isActive: boolean, _selection?: unknown) => {
    const timestamp = formatTimestamp(item.receivedAt ?? item.createdAt);
    const categoryMeta = getCategoryMeta(item.category);
    return (
      <div className={clsx("w-full rounded-2xl border px-4 py-3 text-left", isActive ? "border-white/30 bg-white/10" : "border-white/10 text-slate-300 hover:border-white/20")}>
        <div className="flex items-center gap-2">
          <p className="font-semibold text-white truncate">{item.subject || "Ohne Betreff"}</p>
          {categoryMeta && (
            <span
              className={clsx(
                "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                categoryMeta.className,
              )}
            >
              {categoryMeta.label}
            </span>
          )}
        </div>
        <p className="text-sm text-slate-400">{item.fromEmail ?? "Kein Absender"}</p>
        <p className="mt-1 text-xs text-slate-500">{timestamp}</p>
      </div>
    );
  };

  const renderTrashItem = (
    item: CustomerMessage,
    isActive: boolean,
    selection?: { selectable: boolean; selected: boolean; selectionActive: boolean },
  ) => {
    return renderUnassignedItem(item, isActive, {
      isSelected: Boolean(selection?.selected),
      selectionActive: Boolean(selection?.selectionActive),
      onToggle: selection?.selectable
        ? () => {
            const id = item.id;
            setSelectedBulkIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          }
        : undefined,
    });
  };

  type RenderFn = (
    item: unknown,
    isActive: boolean,
    selection?: { selectable: boolean; selected: boolean; selectionActive: boolean },
  ) => React.ReactNode;

  const renderMap: Record<string, RenderFn> = {
    inbox: (item, isActive, selection) => renderInboxItem(item as InboxItem, isActive, selection),
    customers: (item, isActive) => renderCustomerItem(item as Customer, isActive),
    sent: (item, isActive) => renderSentItem(item as CustomerMessage, isActive),
    spam: (item, isActive) => renderSpamItem(item as CustomerMessage, isActive),
    trash: (item, isActive, selection) => renderTrashItem(item as CustomerMessage, isActive, selection),
  };
  if (isFolderMailbox) {
    renderMap[activeMailbox] = (item, isActive, selection) =>
      renderInboxItem(item as InboxItem, isActive, selection);
  }

  const activeItem = useMemo(() => {
    if (!selectedId) return null;

    if (activeMailbox === 'customers') {
      return customers.find(c => c.id === selectedId);
    }
    
    if (activeMailbox === 'inbox' || isFolderMailbox) {
      const [itemType, rawId] = selectedId.split('-');
      if (itemType === 'lead') {
        return leads.find(l => l.id === rawId);
      }
      if (itemType === 'message') {
        const pool = isFolderMailbox ? folderMessages : inboxMessages;
        return pool.find(m => m.id === rawId);
      }
    }
    
    if (activeMailbox === 'sent') {
      return sentMessages.find(m => m.id === selectedId);
    }
    if (activeMailbox === 'spam') {
      return spamMessages.find(m => m.id === selectedId);
    }
    if (activeMailbox === 'trash') {
      return trashMessages.find((m) => m.id === selectedId);
    }

    return null;
  }, [customers, leads, inboxMessages, sentMessages, spamMessages, trashMessages, selectedId, activeMailbox, isFolderMailbox, folderMessages]);

  const resolvedTitle = useMemo(() => {
    if (!activeItem) return "Verlauf";
    if ("name" in activeItem && typeof activeItem.name === "string" && activeItem.name) return activeItem.name;
    if ("fullName" in activeItem && typeof (activeItem as Lead).fullName === "string" && (activeItem as Lead).fullName) {
      return (activeItem as Lead).fullName;
    }
    if ("subject" in activeItem && typeof (activeItem as CustomerMessage).subject === "string" && (activeItem as CustomerMessage).subject) {
      return (activeItem as CustomerMessage).subject as string;
    }
    return "Verlauf";
  }, [activeItem]);

  const selectionConfig:
    | {
        enabled: boolean;
        active: boolean;
        selected: Set<string>;
        canSelect: (item: ListItem) => boolean;
        getId?: (item: ListItem) => string;
        toggle: (item: ListItem) => void;
      }
    | undefined =
    activeMailbox === "inbox" || isFolderMailbox
      ? {
          enabled: true,
          active: selectionMode,
          selected: selectedBulkIds,
          canSelect: (item: ListItem) => selectableInboxItem(item as InboxItem),
          getId: (item: ListItem) => getSelectionId(item as InboxItem),
          toggle: (item: ListItem) => toggleSelectItem(item as InboxItem),
        }
      : activeMailbox === "trash"
      ? {
          enabled: true,
          active: selectionMode,
          selected: selectedBulkIds,
          canSelect: () => true,
          getId: (item: ListItem) => ("id" in item ? (item as CustomerMessage).id : ""),
          toggle: (item: ListItem) => {
            const id = "id" in item ? (item as CustomerMessage).id : "";
            if (!id) return;
            setSelectedBulkIds((prev) => {
              const next = new Set(prev);
              if (next.has(id)) next.delete(id);
              else next.add(id);
              return next;
            });
          },
        }
      : undefined;

  const selectionActions =
    activeMailbox === "inbox" || isFolderMailbox
      ? !selectionMode
        ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectionMode(true)}
              className="gap-2 rounded-full border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] text-[var(--text-primary)] hover:border-[color:var(--panel-border-strong)]"
            >
              <Square className="h-4 w-4" /> Auswählen
            </Button>
          )
        : (
            <div className="relative inline-flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm shadow-[var(--panel-shadow)]">
              <button
                type="button"
                aria-label="Auswahl beenden"
                onClick={() => clearSelection()}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-slate-900/80 text-slate-200 shadow"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                  {selectedBulkIds.size} ausgewählt
                </span>
                <select
                  value={bulkFolderTarget}
                  onChange={(e) => setBulkFolderTarget(e.target.value)}
                  className="h-9 rounded-full border border-white/10 bg-slate-900/80 px-3 text-sm text-[var(--text-primary)] outline-none"
                >
                  <option value="">Ordner wählen</option>
                  {folders.map((folder) => (
                    <option key={folder} value={folder}>
                      {folder}
                    </option>
                  ))}
                </select>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!selectedBulkIds.size || !bulkFolderTarget}
                  onClick={() => handleBulkMoveToFolder()}
                  className="gap-2 rounded-full border border-white/10 bg-white/5 text-white hover:border-white/20"
                >
                  <Folder className="h-4 w-4" /> In Ordner
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!selectedBulkIds.size || bulkProcessing}
                  onClick={() => void handleBulkMoveToTrash()}
                  className="gap-2 rounded-full border border-white/10 bg-white/5 text-white hover:border-white/20"
                >
                  <Trash2 className="h-4 w-4" /> Papierkorb
                </Button>
              </div>
            </div>
          )
      : activeMailbox === "trash"
      ? !selectionMode
        ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSelectionMode(true)}
              className="gap-2 rounded-full border-[color:var(--panel-border)] bg-[color:var(--panel-bg)] text-[var(--text-primary)] hover:border-[color:var(--panel-border-strong)]"
            >
              <Square className="h-4 w-4" /> Auswählen
            </Button>
          )
        : (
            <div className="relative inline-flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm shadow-[var(--panel-shadow)]">
              <button
                type="button"
                aria-label="Auswahl beenden"
                onClick={() => clearSelection()}
                className="absolute -right-2 -top-2 flex h-7 w-7 items-center justify-center rounded-full border border-white/15 bg-slate-900/80 text-slate-200 shadow"
              >
                <X className="h-3.5 w-3.5" />
              </button>
              <div className="flex items-center gap-2">
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs text-slate-300">
                  {selectedBulkIds.size} ausgewählt
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!selectedBulkIds.size || bulkProcessing}
                  onClick={() => void handleBulkRestoreFromTrash()}
                  className="gap-2 rounded-full border border-white/10 bg-white/5 text-white hover:border-white/20"
                >
                  <RotateCcw className="h-4 w-4" /> Wiederherstellen
                </Button>
              </div>
            </div>
          )
      : null;

  return (
    <section className="flex h-full flex-col gap-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-3xl font-semibold text-white">Nachrichten</h1>
            {unreadSummary.total > 0 && (
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-100">
                {unreadSummary.total} neu
              </span>
            )}
          </div>
          <p className="text-sm text-slate-400">Ihr zentrales Postfach für die Kundenkommunikation.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => void fetchMailboxData(customerIdFromUrl)} disabled={loading}>
            <RefreshCw className={clsx("mr-2 h-4 w-4", loading && "animate-spin")} /> Aktualisieren
          </Button>
          <Button onClick={() => { setMessageToReplyTo(null); setIsComposerOpen(true); if (typeof window !== "undefined") window.localStorage.setItem(COMPOSER_OPEN_KEY, "1"); }}>
              <Mail className="mr-2 h-4 w-4" /> Neue Nachricht
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <div className="grid h-[calc(100vh-220px)] min-h-0 grid-cols-[70px_minmax(0,1fr)] gap-3 overflow-hidden lg:grid-cols-[minmax(200px,26%)_minmax(0,74%)] lg:gap-6">
          <MailboxSidebar 
            activeMailbox={activeMailbox}
            onMailboxChange={handleMailboxChange}
            unreadCounts={{
              leads: Object.values(unreadSummary.leads).reduce((a, b) => a + b, 0),
              unassigned: unreadSummary.unassigned,
              trash: trashMessages.length,
            }}
            folders={folders}
            folderUnread={folderUnread}
            onCreateFolder={handleCreateFolder}
            onRenameFolder={handleRenameFolder}
            onDeleteFolder={handleDeleteFolder}
            onMoveFolder={handleMoveFolder}
            onOpenSettings={() => router.push("/settings")}
            className="sticky top-4 h-full min-h-0 w-[70px] max-w-[70px] lg:w-auto lg:max-w-none"
          />

          <div className="flex h-full min-h-0 flex-col overflow-hidden">
              {!selectedId ? (
                  <MessageList
                      items={filteredItems}
                      selectedId={selectedId}
                      onSelect={id => setSelectedId(id)}
                      actions={selectionActions}
                      selection={selectionConfig}
                      loading={loading}
                      error={error}
                      searchQuery={search}
                      onSearchChange={setSearch}
                      renderItem={renderMap[activeMailbox]}
                      listTitle={
                        activeMailbox === 'inbox'
                          ? 'Posteingang'
                          : activeMailbox === 'customers'
                          ? 'Kunden'
                          : activeMailbox === 'sent'
                          ? 'Gesendet'
                          : activeMailbox === 'spam'
                          ? 'Spam'
                          : activeMailbox === 'trash'
                          ? 'Papierkorb'
                          : isFolderMailbox && activeFolder
                          ? `Ordner: ${activeFolder}`
                          : 'Nachrichten'
                      }
                      listDescription="Wählen Sie einen Eintrag, um den Verlauf zu sehen."
                  />
              ) : (
                  <MessageView
                      messages={threadMessages}
                      loading={loadingThread}
                      error={threadError}
                      onBack={() => {
                        if (customerIdFromUrl) {
                          router.push("/workspace/messages");
                        }
                        setSelectedId(null);
                        setMessageToReplyTo(null);
                      }}
                      onReply={(message) => { setMessageToReplyTo(message); setIsComposerOpen(true); if (typeof window !== "undefined") window.localStorage.setItem(COMPOSER_OPEN_KEY, "1"); }}
                      onMoveToFolder={(message, folder) => handleMoveToFolder(message, folder)}
                      onMoveToTrash={(message) => handleSingleMoveToTrash(message)}
                      onExtractContact={(message) => handleExtractContact(message)}
                      folders={folders}
                      title={resolvedTitle}
                      description={"Details zur Konversation"}
                  />
      )}
          </div>
        </div>
      </div>
      
      <ComposerModal 
        isOpen={isComposerOpen}
        onClose={() => { setIsComposerOpen(false); if (typeof window !== "undefined") window.localStorage.removeItem(COMPOSER_OPEN_KEY); }}
        onMessageSent={handleMessageSent}
        customer={activeMailbox === 'customers' ? activeItem as Customer : undefined}
        lead={(activeMailbox === 'inbox' || isFolderMailbox) && (activeItem as Lead)?.fullName ? activeItem as Lead : undefined}
        thread={threadMessages}
        messageToReplyTo={
          messageToReplyTo ??
          ((activeMailbox === 'inbox' || isFolderMailbox) && !(activeItem as Lead)?.fullName ? (activeItem as CustomerMessage) : null)
        }
        smtpReady={smtpReady}
        smtpStatus={smtpStatus}
        contactSuggestions={contactSuggestions}
      />
      <CustomerModal
        mode="create"
        open={showCustomerModal}
        prefill={customerPrefill}
        onClose={() => { setShowCustomerModal(false); setCustomerPrefill(null); }}
        onSaved={(customer) => {
          setShowCustomerModal(false);
          setCustomerPrefill(null);
          setCustomers((prev) => {
            const map = new Map(prev.map((c) => [c.id, c]));
            map.set(customer.id, customer);
            return Array.from(map.values());
          });
        }}
      />
    </section>
  );
}
