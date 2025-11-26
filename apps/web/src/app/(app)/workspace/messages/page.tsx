"use client";

import {
  AlertTriangle,
  Loader2,
  Mail,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";
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

// Helper functions
export const timestampFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});
export function formatTimestamp(value?: string | null) { if (!value) return ""; return timestampFormatter.format(new Date(value)); }
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
const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (value?: string | null) => !!value && uuidRegex.test(value);


export default function MessagesWorkspacePage() {
  const { authorizedRequest, loading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const router = useRouter();

  const customerIdFromUrl = searchParams.get("customerId");
  
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [unassignedMessages, setUnassignedMessages] = useState<CustomerMessage[]>([]);
  const [inboxMessages, setInboxMessages] = useState<CustomerMessage[]>([]);
  const [sentMessages, setSentMessages] = useState<CustomerMessage[]>([]);
  const [spamMessages, setSpamMessages] = useState<CustomerMessage[]>([]);
  
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
  const [openAiEnabled, setOpenAiEnabled] = useState<boolean | null>(null);
  const [unreadSummary, setUnreadSummary] = useState<{ leads: Record<string, number>; unassigned: number; total: number }>({ leads: {}, unassigned: 0, total: 0 });
  const [locallyReadIds, setLocallyReadIds] = useState<Set<string>>(new Set());

  const isUpdatingRef = useRef(false);
  const unassignedRef = useRef<CustomerMessage[]>([]);
  const inboxRef = useRef<CustomerMessage[]>([]);
  const sentRef = useRef<CustomerMessage[]>([]);
  const spamRef = useRef<CustomerMessage[]>([]);

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

    try {
      // If a customer ID is provided, we only fetch their messages
      if (customerId) {
        const [
          inboxResponse,
          sentResponse,
          spamResponse,
          customersResponse, // Fetch customer list to find the active one
        ] = await Promise.all([
          authorizedRequest<CustomerMessage[]>(`/messages/inbox?limit=50${customerQuery}`),
          authorizedRequest<CustomerMessage[]>(`/messages/sent?limit=50${customerQuery}`),
          spamRequest,
          authorizedRequest<CustomerListResponse>("/customers?limit=100"), // Fetch more to find the customer
        ]);

        setInboxMessages(inboxResponse);
        setSentMessages(sentResponse);
        setSpamMessages(spamResponse);
        
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
        ] = await Promise.all([
          authorizedRequest<CustomerListResponse>("/customers?limit=50"),
          authorizedRequest<Lead[]>("/leads?limit=50"),
          authorizedRequest<CustomerMessage[]>(`/messages/inbox?limit=50${customerQuery}`),
          authorizedRequest<CustomerMessage[]>(`/messages/unassigned?limit=50`),
          authorizedRequest<CustomerMessage[]>(`/messages/sent?limit=50${customerQuery}`),
          spamRequest,
          authorizedRequest<{ leads: Record<string, number>; unassigned: number; total: number }>("/messages/unread-summary"),
        ]);

        setCustomers(customersResponse.items);
        setLeads(leadsResponse);
        setInboxMessages(inboxResponse);
        setUnassignedMessages(unassignedResponse);
        setSentMessages(sentResponse);
        setSpamMessages(spamResponse);
        const derivedUnread = inboxResponse.filter((m) => m.direction === "INBOUND" && !m.readAt).length;
        setUnreadSummary({ ...unreadResponse, total: derivedUnread, unassigned: derivedUnread });
        
        if (typeof window !== "undefined") {
          window.localStorage.setItem(
            "workspace/messages/unread-total",
            JSON.stringify({ ...unreadResponse, total: derivedUnread }),
          );
          window.dispatchEvent(
            new CustomEvent("workspace-messages-counts", {
              detail: { total: derivedUnread },
            }),
          );
        }
      }

      const smtp = await authorizedRequest<SmtpSettings | null>("/settings/smtp");
      if (!smtp || !smtp.hasPassword) {
        setSmtpReady(false);
        setSmtpStatus("Bitte hinterlege deinen SMTP-Zugang unter Einstellungen.");
      } else {
        setSmtpReady(true);
        setSmtpStatus(null);
      }

      const aiFlag = await authorizedRequest<{ enabled: boolean }>("/settings/ai-enabled").catch(() => null);
      setOpenAiEnabled(aiFlag?.enabled ?? null);
    } catch (err) {
      setError("Daten konnten nicht geladen werden.");
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [authLoading, authorizedRequest]);

  useEffect(() => {
    void fetchMailboxData(customerIdFromUrl);
  }, [fetchMailboxData, customerIdFromUrl]);

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

  useEffect(() => {
    const messagesToAnalyze = [
      ...inboxMessages,
      ...unassignedMessages,
    ].filter((msg) => msg && !msg.analyzedAt && isUuid(msg.id));

    if (!messagesToAnalyze.length || isUpdatingRef.current) return;

    isUpdatingRef.current = true;

    (async () => {
      try {
        const results = await Promise.allSettled(
          messagesToAnalyze.map((msg) =>
            authorizedRequest<CustomerMessage>(`/messages/${msg.id}/analyze`, {
              method: "POST",
            }).catch((e) => {
              console.error(`Analyzing message ${msg.id} failed`, e);
              return null;
            }),
          ),
        );

        const updatedAnalyzedMessages = results
          .filter((res) => res.status === "fulfilled" && res.value)
          .map((res) => (res as PromiseFulfilledResult<CustomerMessage>).value);

        if (updatedAnalyzedMessages.length > 0) {
          setInboxMessages((prev) =>
            prev.map(
              (msg) =>
                updatedAnalyzedMessages.find((uMsg) => uMsg.id === msg.id) ||
                msg,
            ),
          );
          setUnassignedMessages((prev) =>
            prev.map(
              (msg) =>
                updatedAnalyzedMessages.find((uMsg) => uMsg.id === msg.id) ||
                msg,
            ),
          );
        }
      } catch (e) {
        console.error("Batch analyze failed", e);
      } finally {
        isUpdatingRef.current = false;
      }
    })();
  }, [unassignedMessages, inboxMessages, authorizedRequest]);
  
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
        setUnassignedMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setSentMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setSpamMessages((prev) =>
          prev.map((msg) => (ids.includes(msg.id) ? { ...msg, readAt: msg.readAt ?? now } : msg)),
        );
        setLocallyReadIds((prev) => {
          const next = new Set(prev);
          localIds.forEach((id) => next.add(id));
          return next;
        });
      } catch (err) {
        console.error("Mark read failed", err);
      }
    },
    [authorizedRequest],
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
        if (!map.has(msg.id)) {
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
      setLoadingThread(true);
      setThreadError(null);
      let url = "";

      let itemType, rawId;
      const firstHyphenIndex = selectedId.indexOf('-');

      if (firstHyphenIndex !== -1 && !isUuid(selectedId)) {
        itemType = selectedId.substring(0, firstHyphenIndex);
        rawId = selectedId.substring(firstHyphenIndex + 1);
      } else {
        itemType = activeMailbox;
        rawId = selectedId;
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

    if (activeMailbox === "customers") {
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
      } else if (activeMailbox === "inbox") {
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
                    const thread = inboxRef.current
                        .filter(m => m.fromEmail === senderEmail)
                        .sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
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
      }  else if (activeMailbox === 'sent' || activeMailbox === 'spam') {
          const messageSource = activeMailbox === 'sent' ? sentRef.current : spamRef.current;
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

  type InboxItem = { id: string; type: "lead"; data: CustomerMessage } | { id: string; type: "message"; data: CustomerMessage };

  const filteredItems = useMemo(() => {
    const lowerSearch = search.toLowerCase();
    
    let source: InboxItem[] | any[] = [];
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
    else return [];

    const sorted = [...source].sort((a, b) => {
        const dataA = (a as InboxItem).type ? (a as InboxItem).data : (a as any);
        const dataB = (b as InboxItem).type ? (b as InboxItem).data : (b as any);
        const tsA = dataA.receivedAt ?? dataA.sentAt ?? dataA.createdAt;
        const tsB = dataB.receivedAt ?? dataB.sentAt ?? dataB.createdAt;
        return new Date(tsB ?? 0).getTime() - new Date(tsA ?? 0).getTime();
    });

    if (!lowerSearch) return sorted;
    return sorted.filter(item => {
        const data = (item as InboxItem).type ? (item as InboxItem).data : (item as any);
        if (data.name) return data.name.toLowerCase().includes(lowerSearch);
        if (data.fullName) return data.fullName.toLowerCase().includes(lowerSearch);
        if (data.subject) return data.subject.toLowerCase().includes(lowerSearch);
        if (data.fromEmail) return data.fromEmail.toLowerCase().includes(lowerSearch);
        return false;
    });
  }, [search, activeMailbox, customers, leads, inboxMessages, sentMessages, spamMessages, locallyReadIds, unassignedMessages]);
  
  const renderInboxItem = (item: InboxItem, isActive: boolean) => {
    return renderUnassignedItem(item.data, isActive);
  };
  const renderCustomerItem = (item: Customer, isActive: boolean) => ( <div className={clsx("w-full rounded-2xl border px-4 py-3 text-left", isActive ? "border-white/30 bg-white/10" : "border-white/10 text-slate-300 hover:border-white/20")}> <p className="font-semibold text-white">{item.name}</p> <p className="text-xs text-slate-400">{item.segment}</p> </div> );
  const renderLeadItem = (item: Lead, isActive: boolean) => {
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
  
  const renderUnassignedItem = (item: CustomerMessage, isActive: boolean) => {
    if (!item) return null;
    const isUnread = item.direction === "INBOUND" && !item.readAt;
    const timestamp = formatTimestamp(item.receivedAt ?? item.sentAt ?? item.createdAt);
    const urgency = detectUrgency(item);
    return (
      <div className={clsx("w-full rounded-2xl border px-4 py-3 text-left", isActive ? "border-white/30 bg-white/10" : "border-white/10 text-slate-300 hover:border-white/20")}>
        <p className="font-semibold text-white truncate">{item.subject || "Ohne Betreff"}</p>
        <div className="mt-1 flex items-center gap-2 flex-wrap">
          <p className="text-xs text-slate-400">{item.fromEmail ?? "Kein Absender"}</p>
          {isUnread && <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-emerald-200">Neu</span>}
          {urgency && <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-200">{urgency}</span>}
          {item.analyzedAt && item.category && (
            <>
              <span className="rounded-full bg-sky-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-sky-200">{item.category}</span>
            </>
          )}
          {item.analyzedAt && item.sentiment && (
            <span className={clsx("rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase", {
                'bg-emerald-500/20 text-emerald-200': item.sentiment === 'positive',
                'bg-slate-500/20 text-slate-200': item.sentiment === 'neutral',
                'bg-rose-500/20 text-rose-200': item.sentiment === 'negative',
              })}>{item.sentiment}</span>
          )}
          {!item.analyzedAt && isUuid(item.id) && (
            <span className="rounded-full bg-purple-500/20 px-2 py-0.5 text-[10px] font-semibold uppercase text-purple-200 animate-pulse">analysiere...</span>
          )}
        </div>
        <p className="mt-1 text-xs text-slate-500">{timestamp}</p>
      </div>
    );
  };

  const renderSentItem = (item: CustomerMessage, isActive: boolean) => {
    const timestamp = formatTimestamp(item.sentAt ?? item.createdAt);
    return (
      <div className={clsx("w-full rounded-2xl border px-4 py-3 text-left", isActive ? "border-white/30 bg-white/10" : "border-white/10 text-slate-300 hover:border-white/20")}>
        <p className="font-semibold text-white truncate">{`An: ${item.toEmail}`}</p>
        <p className="text-sm text-slate-400 truncate">{item.subject || "Ohne Betreff"}</p>
        <p className="mt-1 text-xs text-slate-500">{timestamp}</p>
      </div>
    );
  };
  
  const renderSpamItem = (item: CustomerMessage, isActive: boolean) => {
    const timestamp = formatTimestamp(item.receivedAt ?? item.createdAt);
    return (
      <div className={clsx("w-full rounded-2xl border px-4 py-3 text-left", isActive ? "border-white/30 bg-white/10" : "border-white/10 text-slate-300 hover:border-white/20")}>
        <p className="font-semibold text-white truncate">{item.subject || "Ohne Betreff"}</p>
        <p className="text-sm text-slate-400">{item.fromEmail ?? "Kein Absender"}</p>
        <p className="mt-1 text-xs text-slate-500">{timestamp}</p>
      </div>
    );
  };

  const renderMap = { inbox: renderInboxItem, customers: renderCustomerItem, sent: renderSentItem, spam: renderSpamItem };

  const activeItem = useMemo(() => {
    if (!selectedId) return null;

    if (activeMailbox === 'customers') {
      return customers.find(c => c.id === selectedId);
    }
    
    if (activeMailbox === 'inbox') {
      const [itemType, rawId] = selectedId.split('-');
      if (itemType === 'lead') {
        return leads.find(l => l.id === rawId);
      }
      if (itemType === 'message') {
        return inboxMessages.find(m => m.id === rawId);
      }
    }
    
    if (activeMailbox === 'sent') {
      return sentMessages.find(m => m.id === selectedId);
    }
    if (activeMailbox === 'spam') {
      return spamMessages.find(m => m.id === selectedId);
    }

    return null;
  }, [customers, leads, inboxMessages, sentMessages, spamMessages, selectedId, activeMailbox]);

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
          <Button onClick={() => { setMessageToReplyTo(null); setIsComposerOpen(true); }}>
              <Mail className="mr-2 h-4 w-4" /> Neue Nachricht
          </Button>
        </div>
      </div>

      <div className="min-h-0 flex-1">
        <div className="grid h-full grid-cols-[minmax(240px,25%)_minmax(0,75%)] gap-6">
          <MailboxSidebar 
            activeMailbox={activeMailbox}
            onMailboxChange={handleMailboxChange}
            unreadCounts={{ leads: Object.values(unreadSummary.leads).reduce((a, b) => a + b, 0), unassigned: unreadSummary.unassigned }}
            onOpenSettings={() => router.push("/settings")}
          />

          <div className="h-full">
              {!selectedId ? (
                  <MessageList
                      items={filteredItems}
                      selectedId={selectedId}
                      onSelect={id => setSelectedId(id)}
                      loading={loading}
                      error={error}
                      searchQuery={search}
                      onSearchChange={setSearch}
                      renderItem={renderMap[activeMailbox] as any}
                      listTitle={activeMailbox === 'inbox' ? 'Posteingang' : 'Kunden'}
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
                      onReply={(message) => { setMessageToReplyTo(message); setIsComposerOpen(true); }}
                      title={(activeItem as any)?.name ?? (activeItem as any)?.fullName ?? (activeItem as any)?.subject ?? "Verlauf"}
                      description={"Details zur Konversation"}
                  />
      )}
          </div>
        </div>
      </div>
      
      <ComposerModal 
        isOpen={isComposerOpen}
        onClose={() => setIsComposerOpen(false)}
        onMessageSent={handleMessageSent}
        customer={activeMailbox === 'customers' ? activeItem as Customer : undefined}
        lead={activeMailbox === 'inbox' && (activeItem as Lead)?.fullName ? activeItem as Lead : undefined}
        messageToReplyTo={messageToReplyTo ?? (activeMailbox === 'inbox' && !(activeItem as Lead)?.fullName ? activeItem as CustomerMessage : null)}
        smtpReady={smtpReady}
        smtpStatus={smtpStatus}
      />
    </section>
  );
}
