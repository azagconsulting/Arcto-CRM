"use client";

import { useEffect, useMemo, useState } from "react";
import { clsx } from "clsx";
import { useSearchParams } from "next/navigation";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OPENAI_KEY_STORAGE, SERPAPI_KEY_STORAGE } from "@/lib/constants";
import type {
  ApiSettings,
  ImapEncryption,
  ImapSettings,
  SmtpEncryption,
  SmtpSettings,
  WorkspaceSettings,
  AuthUser,
} from "@/lib/types";

type SettingsTab =
  | "profile"
  | "workspace"
  | "ai"
  | "email"
  | "notifications"
  | "api"
  | "help";

type ProfileForm = {
  firstName: string;
  lastName: string;
  email: string;
  jobTitle: string;
  headline: string;
  phone: string;
  location: string;
  pronouns: string;
  bio: string;
  avatarUrl: string;
  linkedinUrl: string;
  twitterUrl: string;
  calendlyUrl: string;
};

const notificationOptions = [
  { label: "Wichtige Aktivitäten", description: "Deals, die in den roten Bereich laufen" },
  { label: "Team-Updates", description: "Statusmeldungen aus Workspaces" },
  { label: "Designänderungen", description: "Änderungen am Dark/Light Theme" },
];

const defaultProfileForm: ProfileForm = {
  firstName: "",
  lastName: "",
  email: "",
  jobTitle: "",
  headline: "",
  phone: "",
  location: "",
  pronouns: "",
  bio: "",
  avatarUrl: "",
  linkedinUrl: "",
  twitterUrl: "",
  calendlyUrl: "",
};

const defaultWorkspaceForm: WorkspaceSettings = {
  companyName: null,
  legalName: null,
  industry: null,
  tagline: null,
  mission: null,
  vision: null,
  description: null,
  foundedYear: null,
  teamSize: null,
  supportEmail: null,
  supportPhone: null,
  timezone: "Europe/Berlin",
  currency: "EUR",
  vatNumber: null,
  registerNumber: null,
  address: {
    street: null,
    postalCode: null,
    city: null,
    country: null,
  },
  branding: {
    primaryColor: "#0ea5e9",
    secondaryColor: "#0f172a",
    accentColor: "#f97316",
    logoUrl: null,
    coverImageUrl: null,
  },
  social: {
    website: "https://",
    linkedin: "https://www.linkedin.com/",
    twitter: "https://x.com/",
    facebook: null,
    instagram: null,
    youtube: null,
  },
  updatedAt: undefined,
};

export default function SettingsPage() {
  const { user, authorizedRequest, refreshProfile } = useAuth();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<SettingsTab>("profile");
  const [status, setStatus] = useState<string | null>(null);

  const [profileForm, setProfileForm] = useState<ProfileForm>(defaultProfileForm);
  const [profileNotice, setProfileNotice] = useState<string | null>(null);
  const [profileSaving, setProfileSaving] = useState(false);

  const [workspaceForm, setWorkspaceForm] = useState<WorkspaceSettings>(defaultWorkspaceForm);
  const [workspaceNotice, setWorkspaceNotice] = useState<string | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceSaving, setWorkspaceSaving] = useState(false);

  const [openAiKey, setOpenAiKey] = useState("");
  const [serpApiKey, setSerpApiKey] = useState("");
  const [openAiStatus, setOpenAiStatus] = useState<string | null>(null);
  const [serpStatus, setSerpStatus] = useState<string | null>(null);
  const [apiSettings, setApiSettings] = useState<ApiSettings>({
    embedUrl: "",
    apiToken: null,
    hasServiceAccount: false,
    updatedAt: "",
    serviceAccountJson: "",
  });
  const [apiStatus, setApiStatus] = useState<string | null>(null);
  const [apiSaving, setApiSaving] = useState(false);

  const [smtpForm, setSmtpForm] = useState<SmtpSettings>({
    host: "",
    port: 587,
    username: "",
    fromName: "",
    fromEmail: "",
    encryption: "tls",
    hasPassword: false,
    updatedAt: "",
  });
  const [smtpPassword, setSmtpPassword] = useState("");
  const [smtpNotice, setSmtpNotice] = useState<string | null>(null);
  const [smtpSaving, setSmtpSaving] = useState(false);

  const [imapForm, setImapForm] = useState<ImapSettings>({
    host: "",
    port: 993,
    username: "",
    mailbox: "INBOX",
    encryption: "ssl",
    hasPassword: false,
    sinceDays: 7,
    updatedAt: "",
    verifiedAt: null,
  });
  const [imapPassword, setImapPassword] = useState("");
  const [imapNotice, setImapNotice] = useState<string | null>(null);
  const [imapSaving, setImapSaving] = useState(false);
  const [apiLoading, setApiLoading] = useState(false);

  const profileInitials = useMemo(() => {
    const initials = `${profileForm.firstName?.[0] ?? ""}${profileForm.lastName?.[0] ?? ""}`.trim();
    return initials || profileForm.email?.[0]?.toUpperCase() || "A";
  }, [profileForm.email, profileForm.firstName, profileForm.lastName]);

  useEffect(() => {
    if (user) {
      setProfileForm((current) => ({
        ...current,
        firstName: user.firstName ?? "",
        lastName: user.lastName ?? "",
        email: user.email ?? "",
        jobTitle: (user as AuthUser).jobTitle ?? "",
        headline: user.headline ?? "",
        phone: user.phone ?? "",
        location: user.location ?? "",
        pronouns: user.pronouns ?? "",
        bio: user.bio ?? "",
        avatarUrl: user.avatarUrl ?? "",
        linkedinUrl: user.linkedinUrl ?? "",
        twitterUrl: user.twitterUrl ?? "",
        calendlyUrl: user.calendlyUrl ?? "",
      }));
    }
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const storedKey = window.localStorage.getItem(OPENAI_KEY_STORAGE) ?? "";
    const storedSerp = window.localStorage.getItem(SERPAPI_KEY_STORAGE) ?? "";
    setOpenAiKey(storedKey);
    setSerpApiKey(storedSerp);
  }, []);

  useEffect(() => {
    const tab = searchParams?.get("tab");
    if (tab && ["profile", "workspace", "ai", "email", "notifications", "api"].includes(tab)) {
      setActiveTab(tab as SettingsTab);
    }
  }, [searchParams]);

  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    setWorkspaceLoading(true);
    authorizedRequest<WorkspaceSettings | null>("/settings/workspace", { signal: controller.signal })
      .then((data) => {
        if (!active) return;
        if (!data) {
          setWorkspaceForm(defaultWorkspaceForm);
          return;
        }
        setWorkspaceForm(data);
      })
      .catch(() => undefined)
      .finally(() => active && setWorkspaceLoading(false));
    return () => {
      active = false;
      controller.abort();
    };
  }, [authorizedRequest]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    authorizedRequest<SmtpSettings | null>("/settings/smtp", { signal: controller.signal })
      .then((data) => {
        if (!mounted || !data) return;
        setSmtpForm(data);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    setApiLoading(true);
    authorizedRequest<ApiSettings | null>("/settings/api", { signal: controller.signal })
      .then((data) => {
        if (!mounted) return;
        if (data) {
          setApiSettings(data);
        }
      })
      .catch(() => undefined)
      .finally(() => mounted && setApiLoading(false));
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest]);

  useEffect(() => {
    let mounted = true;
    const controller = new AbortController();
    authorizedRequest<ImapSettings | null>("/settings/imap", { signal: controller.signal })
      .then((data) => {
        if (!mounted || !data) return;
        setImapForm(data);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      controller.abort();
    };
  }, [authorizedRequest]);

  const handleProfileSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setProfileSaving(true);
    setProfileNotice(null);
    try {
      await authorizedRequest<AuthUser>("/users/me", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profileForm),
      });
      setProfileNotice("Profil gespeichert.");
      await refreshProfile();
    } catch (err) {
      setProfileNotice(err instanceof Error ? err.message : "Profil konnte nicht gespeichert werden.");
    } finally {
      setProfileSaving(false);
    }
  };

  const handleWorkspaceSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setWorkspaceSaving(true);
    setWorkspaceNotice(null);
    try {
      const payload = {
        ...workspaceForm,
        foundedYear: workspaceForm.foundedYear ? Number(workspaceForm.foundedYear) : null,
        teamSize: workspaceForm.teamSize ? Number(workspaceForm.teamSize) : null,
      };
      const response = await authorizedRequest<WorkspaceSettings>("/settings/workspace", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setWorkspaceForm(response);
      setWorkspaceNotice("Unternehmensprofil gespeichert.");
    } catch (err) {
      setWorkspaceNotice(err instanceof Error ? err.message : "Unternehmensprofil konnte nicht gespeichert werden.");
    } finally {
      setWorkspaceSaving(false);
    }
  };

  const handleOpenAiSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typeof window === "undefined") return;
    window.localStorage.setItem(OPENAI_KEY_STORAGE, openAiKey.trim());
    setOpenAiStatus("OpenAI-Key gespeichert.");
  };

  const handleSerpSave = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (typeof window === "undefined") return;
    window.localStorage.setItem(SERPAPI_KEY_STORAGE, serpApiKey.trim());
    setSerpStatus("SerpAPI-Key gespeichert.");
  };

  const handleSmtpSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSmtpSaving(true);
    setSmtpNotice(null);
    try {
      const payload = {
        ...smtpForm,
        port: Number(smtpForm.port),
        password: smtpPassword || undefined,
      };
      const response = await authorizedRequest<SmtpSettings>("/settings/smtp", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setSmtpForm(response);
      setSmtpPassword("");
      setSmtpNotice("SMTP gespeichert.");
    } catch (err) {
      setSmtpNotice(err instanceof Error ? err.message : "SMTP konnte nicht gespeichert werden.");
    } finally {
      setSmtpSaving(false);
    }
  };

  const handleApiSave = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setApiSaving(true);
    setApiStatus(null);
    try {
      const payload = {
        embedUrl: apiSettings.embedUrl?.trim() || null,
        apiToken: apiSettings.apiToken?.trim() || undefined,
        serviceAccountJson: apiSettings.serviceAccountJson?.trim() || undefined,
      };
      const response = await authorizedRequest<ApiSettings>("/settings/api", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setApiSettings({
        ...response,
        serviceAccountJson: "",
        hasServiceAccount: response.hasServiceAccount || Boolean(apiSettings.serviceAccountJson),
      });
      setApiStatus("API/Embed gespeichert.");
    } catch (err) {
      setApiStatus(err instanceof Error ? err.message : "API-Einstellungen konnten nicht gespeichert werden.");
    } finally {
      setApiSaving(false);
    }
  };

  const handleImapSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setImapSaving(true);
    setImapNotice(null);
    try {
    const payload = {
      ...imapForm,
      verifiedAt: undefined,
      port: Number(imapForm.port),
      password: imapPassword || undefined,
      sinceDays: Number(imapForm.sinceDays),
    };
      const response = await authorizedRequest<ImapSettings>("/settings/imap", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      setImapForm(response);
      setImapPassword("");
      setImapNotice(
        response.verifiedAt
          ? "IMAP gespeichert. Zugriff verifiziert."
          : "IMAP gespeichert.",
      );
    } catch (err) {
      setImapNotice(err instanceof Error ? err.message : "IMAP konnte nicht gespeichert werden.");
    } finally {
      setImapSaving(false);
    }
  };

  return (
    <section className="space-y-8">
      <div>
        <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Workspace</p>
        <h1 className="text-3xl font-semibold text-white">Einstellungen</h1>
        <p className="text-sm text-slate-400">Pflege Profil, Unternehmensdaten, AI Keys und E-Mail Setup an einem Ort.</p>
      </div>
      {status && <p className="text-xs text-slate-500">{status}</p>}

      <div className="flex flex-wrap gap-2 rounded-3xl border border-white/10 bg-white/5 p-2">
        {[
          { key: "profile", label: "Profil" },
          { key: "workspace", label: "Unternehmensprofil" },
          { key: "ai", label: "AI & Search Keys" },
          { key: "email", label: "E-Mail Einstellungen" },
          { key: "api", label: "API & Integrationen" },
          { key: "notifications", label: "Benachrichtigungen" },
          { key: "help", label: "Hilfecenter" },
        ].map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setActiveTab(tab.key as SettingsTab)}
            className={clsx(
              "rounded-2xl px-4 py-2 text-sm transition",
              activeTab === tab.key ? "bg-white/20 text-white" : "text-slate-300 hover:bg-white/10",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === "profile" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Profil" description="Basisinformationen für Signaturen und Automationen.">
            <form className="space-y-4" onSubmit={handleProfileSubmit}>
              <div className="flex items-center gap-4 rounded-3xl border border-white/5 bg-white/5/40 p-4">
                <div className="h-16 w-16 overflow-hidden rounded-2xl border border-white/10 bg-white/5">
                  {profileForm.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={profileForm.avatarUrl} alt="Profilbild" className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-lg font-semibold text-white/70">
                      {profileInitials}
                    </div>
                  )}
                </div>
                <div className="text-sm text-slate-400">
                  <p>Profilbild / Initialen</p>
                  <p className="text-xs">Hinterlege einen Bild-Link oder lasse das Feld leer für Initialen.</p>
                </div>
              </div>
              <label className="block text-sm text-slate-300">
                Avatar URL
                <Input className="mt-2" name="avatarUrl" value={profileForm.avatarUrl} onChange={(e) => setProfileForm({ ...profileForm, avatarUrl: e.target.value })} placeholder="https://..." />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Vorname
                  <Input className="mt-2" value={profileForm.firstName} onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })} placeholder="Mara" />
                </label>
                <label className="block text-sm text-slate-300">
                  Nachname
                  <Input className="mt-2" value={profileForm.lastName} onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })} placeholder="Schneider" />
                </label>
              </div>
              <label className="block text-sm text-slate-300">
                Jobtitel
                <Input className="mt-2" value={profileForm.jobTitle} onChange={(e) => setProfileForm({ ...profileForm, jobTitle: e.target.value })} placeholder="Customer Success Lead" />
              </label>
              <label className="block text-sm text-slate-300">
                Headline
                <Input className="mt-2" value={profileForm.headline} onChange={(e) => setProfileForm({ ...profileForm, headline: e.target.value })} placeholder="Hilft Teams, Forecasts zu gewinnen" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  E-Mail
                  <Input type="email" className="mt-2" value={profileForm.email} onChange={(e) => setProfileForm({ ...profileForm, email: e.target.value })} placeholder="mara@arcto.app" />
                </label>
                <label className="block text-sm text-slate-300">
                  Telefonnummer
                  <Input className="mt-2" value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} placeholder="+49 30 123456" />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Standort
                  <Input className="mt-2" value={profileForm.location} onChange={(e) => setProfileForm({ ...profileForm, location: e.target.value })} placeholder="Berlin, Deutschland" />
                </label>
                <label className="block text-sm text-slate-300">
                  Pronomen
                  <Input className="mt-2" value={profileForm.pronouns} onChange={(e) => setProfileForm({ ...profileForm, pronouns: e.target.value })} placeholder="sie/ihr" />
                </label>
              </div>
              <label className="block text-sm text-slate-300">
                Kurzprofil
                <Textarea rows={3} className="mt-2" value={profileForm.bio} onChange={(e) => setProfileForm({ ...profileForm, bio: e.target.value })} placeholder="Was macht dich aus?" />
              </label>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  LinkedIn
                  <Input className="mt-2" value={profileForm.linkedinUrl} onChange={(e) => setProfileForm({ ...profileForm, linkedinUrl: e.target.value })} placeholder="https://linkedin.com/in/..." />
                </label>
                <label className="block text-sm text-slate-300">
                  X / Twitter
                  <Input className="mt-2" value={profileForm.twitterUrl} onChange={(e) => setProfileForm({ ...profileForm, twitterUrl: e.target.value })} placeholder="https://x.com/..." />
                </label>
              </div>
              <label className="block text-sm text-slate-300">
                Calendly
                <Input className="mt-2" value={profileForm.calendlyUrl} onChange={(e) => setProfileForm({ ...profileForm, calendlyUrl: e.target.value })} placeholder="https://calendly.com/..." />
              </label>
              <Button size="sm" type="submit" disabled={profileSaving}>
                {profileSaving ? "Speichern…" : "Profil speichern"}
              </Button>
              {profileNotice && <p className="text-xs text-emerald-300">{profileNotice}</p>}
            </form>
          </Card>
        </div>
      )}

      {activeTab === "workspace" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="Unternehmensprofil" description="Branding & Kontaktdaten.">
            <form className="space-y-4" onSubmit={handleWorkspaceSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Unternehmensname
                  <Input className="mt-2" value={workspaceForm.companyName ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, companyName: e.target.value })} />
                </label>
                <label className="block text-sm text-slate-300">
                  Rechtlicher Name
                  <Input className="mt-2" value={workspaceForm.legalName ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, legalName: e.target.value })} />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Branche
                  <Input className="mt-2" value={workspaceForm.industry ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, industry: e.target.value })} />
                </label>
                <label className="block text-sm text-slate-300">
                  Teamgröße
                  <Input className="mt-2" value={workspaceForm.teamSize ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, teamSize: e.target.value as unknown as number })} />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block text-sm text-slate-300">
                  Straße
                  <Input className="mt-2" value={workspaceForm.address?.street ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, address: { ...(workspaceForm.address ?? {}), street: e.target.value } })} />
                </label>
                <label className="block text-sm text-slate-300">
                  PLZ / Stadt
                  <div className="mt-2 grid grid-cols-[120px,1fr] gap-2">
                    <Input value={workspaceForm.address?.postalCode ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, address: { ...(workspaceForm.address ?? {}), postalCode: e.target.value } })} placeholder="10115" />
                    <Input value={workspaceForm.address?.city ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, address: { ...(workspaceForm.address ?? {}), city: e.target.value } })} placeholder="Berlin" />
                  </div>
                </label>
              </div>
              <label className="block text-sm text-slate-300">
                Land
                <Input className="mt-2" value={workspaceForm.address?.country ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, address: { ...(workspaceForm.address ?? {}), country: e.target.value } })} placeholder="Deutschland" />
              </label>
              <label className="block text-sm text-slate-300">
                Kurzbeschreibung
                <Textarea rows={3} className="mt-2" value={workspaceForm.description ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, description: e.target.value })} placeholder="Was macht dein Unternehmen?" />
              </label>
              {workspaceNotice && <p className="text-xs text-emerald-300">{workspaceNotice}</p>}
              <Button size="sm" type="submit" disabled={workspaceSaving}>
                {workspaceSaving ? "Speichern…" : "Unternehmensprofil speichern"}
              </Button>
            </form>
          </Card>

          <Card title="Branding" description="Farben & Medien.">
            <div className="space-y-3 text-sm text-slate-300">
              <label className="block">
                Logo URL
                <Input className="mt-2" value={workspaceForm.branding?.logoUrl ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, branding: { ...(workspaceForm.branding ?? {}), logoUrl: e.target.value } })} placeholder="https://..." />
              </label>
              <label className="block">
                Cover Bild URL
                <Input className="mt-2" value={workspaceForm.branding?.coverImageUrl ?? ""} onChange={(e) => setWorkspaceForm({ ...workspaceForm, branding: { ...(workspaceForm.branding ?? {}), coverImageUrl: e.target.value } })} placeholder="https://..." />
              </label>
              <div className="grid gap-3 sm:grid-cols-3">
                <label className="block">
                  Primary
                  <Input type="color" className="mt-2 h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent" value={workspaceForm.branding?.primaryColor ?? "#0ea5e9"} onChange={(e) => setWorkspaceForm({ ...workspaceForm, branding: { ...(workspaceForm.branding ?? {}), primaryColor: e.target.value } })} />
                </label>
                <label className="block">
                  Secondary
                  <Input type="color" className="mt-2 h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent" value={workspaceForm.branding?.secondaryColor ?? "#0f172a"} onChange={(e) => setWorkspaceForm({ ...workspaceForm, branding: { ...(workspaceForm.branding ?? {}), secondaryColor: e.target.value } })} />
                </label>
                <label className="block">
                  Accent
                  <Input type="color" className="mt-2 h-10 w-full cursor-pointer rounded-lg border border-white/10 bg-transparent" value={workspaceForm.branding?.accentColor ?? "#f97316"} onChange={(e) => setWorkspaceForm({ ...workspaceForm, branding: { ...(workspaceForm.branding ?? {}), accentColor: e.target.value } })} />
                </label>
              </div>
              <p className="text-xs text-slate-500">
                Farbanpassungen wirken auf Angebote, PDF-Templates und künftige Mail-Templates.
              </p>
            </div>
          </Card>
        </div>
      )}

      {activeTab === "ai" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="OpenAI Automation" description="Speichere deinen API-Schlüssel für AI-Features.">
            <form className="space-y-4" onSubmit={handleOpenAiSave}>
              <label className="block text-sm text-slate-300">
                OpenAI API-Key
                <input
                  type="password"
                  value={openAiKey}
                  onChange={(event) => setOpenAiKey(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                  placeholder="sk-..."
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Button size="sm" type="submit">Key speichern</Button>
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (typeof window === "undefined") return;
                    window.localStorage.removeItem(OPENAI_KEY_STORAGE);
                    setOpenAiKey("");
                    setOpenAiStatus("OpenAI-Key entfernt.");
                  }}
                >
                  Key entfernen
                </Button>
              </div>
              {openAiStatus && <p className="text-xs text-slate-400">{openAiStatus}</p>}
            </form>
          </Card>

          <Card title="Search Key" description="SerpAPI Key für Websuche">
            <form className="space-y-4" onSubmit={handleSerpSave}>
              <label className="block text-sm text-slate-300">
                SerpAPI Key
                <input
                  value={serpApiKey}
                  onChange={(event) => setSerpApiKey(event.target.value)}
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-white placeholder:text-slate-500 focus:border-sky-400 focus:outline-none"
                  placeholder="serp_api_key"
                />
              </label>
              <div className="flex flex-wrap gap-3">
                <Button size="sm" type="submit">Key speichern</Button>
                <Button
                  size="sm"
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    if (typeof window === "undefined") return;
                    window.localStorage.removeItem(SERPAPI_KEY_STORAGE);
                    setSerpApiKey("");
                    setSerpStatus("SerpAPI-Key entfernt.");
                  }}
                >
                  Key entfernen
                </Button>
              </div>
              {serpStatus && <p className="text-xs text-slate-400">{serpStatus}</p>}
            </form>
          </Card>
        </div>
      )}

      {activeTab === "email" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card title="SMTP" description="Versandadresse und Zugangsdaten.">
            <form className="space-y-4" onSubmit={handleSmtpSubmit}>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Host
                  <Input className="mt-2" value={smtpForm.host} onChange={(e) => setSmtpForm({ ...smtpForm, host: e.target.value })} />
                </label>
                <label className="text-sm text-slate-300">
                  Port
                  <Input className="mt-2" value={smtpForm.port} onChange={(e) => setSmtpForm({ ...smtpForm, port: Number(e.target.value) })} />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Nutzername
                  <Input className="mt-2" value={smtpForm.username} onChange={(e) => setSmtpForm({ ...smtpForm, username: e.target.value })} />
                </label>
                <label className="text-sm text-slate-300">
                  Passwort
                  <Input
                    type="password"
                    className="mt-2"
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder={smtpForm.hasPassword ? "Gespeichert" : ""}
                  />
                </label>
              </div>
              <label className="text-sm text-slate-300">
                Absendername
                <Input className="mt-2" value={smtpForm.fromName ?? ""} onChange={(e) => setSmtpForm({ ...smtpForm, fromName: e.target.value })} />
              </label>
              <label className="text-sm text-slate-300">
                Absender E-Mail
                <Input className="mt-2" value={smtpForm.fromEmail ?? ""} onChange={(e) => setSmtpForm({ ...smtpForm, fromEmail: e.target.value })} />
              </label>
              <label className="text-sm text-slate-300">
                Verschlüsselung
                <select
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                  value={smtpForm.encryption}
                  onChange={(event) => setSmtpForm({ ...smtpForm, encryption: event.target.value as SmtpEncryption })}
                >
                  <option value="none">Keine</option>
                  <option value="ssl">SSL</option>
                  <option value="tls">TLS</option>
                </select>
              </label>
              {smtpNotice && <p className="text-xs text-emerald-300">{smtpNotice}</p>}
              {smtpForm.updatedAt && <p className="text-xs text-slate-400">Aktualisiert: {smtpForm.updatedAt}</p>}
              <Button size="sm" type="submit" disabled={smtpSaving}>
                {smtpSaving ? "Speichern…" : "SMTP speichern"}
              </Button>
            </form>
          </Card>

          <Card title="IMAP" description="Eingehende E-Mails synchronisieren.">
            <form className="space-y-4" onSubmit={handleImapSubmit}>
              {imapForm.verifiedAt && (
                <div className="rounded-xl border border-emerald-300/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-100">
                  Zugriff verifiziert am {new Date(imapForm.verifiedAt).toLocaleString("de-DE")}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Host
                  <Input className="mt-2" value={imapForm.host} onChange={(e) => setImapForm({ ...imapForm, host: e.target.value })} />
                </label>
                <label className="text-sm text-slate-300">
                  Port
                  <Input className="mt-2" value={imapForm.port} onChange={(e) => setImapForm({ ...imapForm, port: Number(e.target.value) })} />
                </label>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="text-sm text-slate-300">
                  Nutzername
                  <Input className="mt-2" value={imapForm.username} onChange={(e) => setImapForm({ ...imapForm, username: e.target.value })} />
                </label>
                <label className="text-sm text-slate-300">
                  Passwort
                  <Input
                    type="password"
                    className="mt-2"
                    value={imapPassword}
                    onChange={(e) => setImapPassword(e.target.value)}
                    placeholder={imapForm.hasPassword ? "Gespeichert" : ""}
                  />
                </label>
              </div>
              <label className="text-sm text-slate-300">
                Mailbox
                <Input className="mt-2" value={imapForm.mailbox} onChange={(e) => setImapForm({ ...imapForm, mailbox: e.target.value })} />
              </label>
              <label className="text-sm text-slate-300">
                Sync Zeitraum (Tage)
                <Input className="mt-2" value={imapForm.sinceDays} onChange={(e) => setImapForm({ ...imapForm, sinceDays: Number(e.target.value) })} />
              </label>
              <label className="text-sm text-slate-300">
                Verschlüsselung
                <select
                  className="mt-2 w-full rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white focus:border-sky-400 focus:outline-none"
                  value={imapForm.encryption}
                  onChange={(event) => setImapForm({ ...imapForm, encryption: event.target.value as ImapEncryption })}
                >
                  <option value="none">Keine</option>
                  <option value="ssl">SSL</option>
                  <option value="tls">TLS</option>
                </select>
              </label>
              {imapNotice && <p className="text-xs text-emerald-300">{imapNotice}</p>}
              {imapForm.updatedAt && <p className="text-xs text-slate-400">Aktualisiert: {imapForm.updatedAt}</p>}
              <Button size="sm" type="submit" disabled={imapSaving}>
                {imapSaving ? "Speichern…" : "IMAP speichern"}
              </Button>
            </form>
          </Card>
        </div>
      )}

      {activeTab === "notifications" && (
        <div className="space-y-4">
          <Card title="Benachrichtigungen" description="Steuere, welche Updates dich erreichen.">
            <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setStatus("Benachrichtigungen gespeichert (lokal)."); }}>
              {notificationOptions.map((option) => (
                <label key={option.label} className="flex items-start gap-3 rounded-2xl border border-white/5 bg-white/5/40 p-4">
                  <input type="checkbox" defaultChecked className="mt-1 h-4 w-4 accent-sky-400" />
                  <span>
                    <p className="text-sm font-medium text-white">{option.label}</p>
                    <p className="text-xs text-slate-400">{option.description}</p>
                  </span>
                </label>
              ))}
              <Button size="sm" type="submit">
                Einstellungen sichern
              </Button>
            </form>
          </Card>
        </div>
      )}

      {activeTab === "help" && (
        <div className="grid gap-4 lg:grid-cols-[280px,1fr]">
          <div className="space-y-3 rounded-3xl border border-white/10 bg-gradient-to-b from-white/10 to-white/5 p-4 text-sm text-slate-200">
            <p className="text-xs uppercase tracking-[0.25em] text-slate-400">Schnellzugriff</p>
            <div className="space-y-2">
              <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => setActiveTab("email")}>
                E-Mail-Einstellungen öffnen
              </Button>
              <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => setActiveTab("ai")}>
                OpenAI-Key hinterlegen
              </Button>
              <Button size="sm" variant="outline" className="w-full justify-start" onClick={() => setActiveTab("api")}>
                API & Integrationen
              </Button>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-3 text-xs text-slate-300">
              <p className="font-semibold text-white">Häufige Fragen</p>
              <ul className="mt-2 space-y-1 list-disc pl-4">
                <li>Gmail mit App-Passwort (2FA Pflicht)</li>
                <li>Absender-Fehler 550 beheben</li>
                <li>Warum kein KI-Badge? (Key fehlt)</li>
              </ul>
            </div>
          </div>
          <div className="space-y-4">
            <Card title="Gmail mit App-Passwort" description="So klappt IMAP/SMTP mit Google.">
              <ol className="list-decimal space-y-2 pl-5 text-sm text-slate-200">
                <li>IMAP in Gmail aktivieren (Einstellungen → Weiterleitung/POP-IMAP).</li>
                <li>2FA aktivieren.</li>
                <li>App-Passwort erstellen: myaccount.google.com/apppasswords → App „Mail“, Gerät „Sonstiges“ (z. B. „Arcto CRM").</li>
                <li>IMAP: Host imap.gmail.com, Port 993, SSL; Benutzer = Gmail-Adresse; Passwort = App-Passwort.</li>
                <li>SMTP: Host smtp.gmail.com, Port 465 (ssl) oder 587 (tls); Benutzer = Gmail-Adresse; Passwort = App-Passwort; Absender aus Gmail-Domain.</li>
                <li>Fehler „Application-specific password required“ → App-Passwort prüfen oder Captcha-Freigabe: https://accounts.google.com/DisplayUnlockCaptcha.</li>
              </ol>
            </Card>

            <Card title="GMX / Web.de" description="IMAP/SMTP Einstellungen">
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-200">
                <li>IMAP ggf. im Postfach aktivieren.</li>
                <li>IMAP: imap.gmx.net, Port 993, SSL. SMTP: mail.gmx.net, Port 465 (ssl) oder 587 (tls).</li>
                <li>Benutzer = volle Mailadresse, Passwort = Login-Passwort; Absender zur Domain passend wählen.</li>
              </ul>
            </Card>

            <Card title="Typische Fehlermeldungen" description="Schnell lösen">
              <ul className="space-y-2 text-sm text-slate-200">
                <li><span className="font-semibold text-white">AUTHENTICATIONFAILED / App-Passwort nötig:</span> Bei Gmail immer ein App-Passwort nutzen.</li>
                <li><span className="font-semibold text-white">550 Sender address is not allowed:</span> Absender-Domain vom SMTP-Anbieter blockiert → Absender auf passende Domain ändern.</li>
                <li><span className="font-semibold text-white">Kein „Zugriff verifiziert“:</span> Login-Test fehlgeschlagen → Host/Port/Passwort prüfen, IMAP aktivieren, ggf. Captcha-Freigabe.</li>
              </ul>
            </Card>

            <Card title="KI-Analyse" description="Wann Analysen laufen">
              <ul className="list-disc space-y-2 pl-5 text-sm text-slate-200">
                <li>OpenAI-Key unter „AI & Search Keys“ hinterlegen.</li>
                <li>Ohne Key kein KI-Badge und keine Analyse.</li>
                <li>Max. die letzten 5 eingehenden Nachrichten pro Tenant werden analysiert; nach 14 Tagen werden Mails (inkl. Analyse) gelöscht.</li>
              </ul>
            </Card>
          </div>
        </div>
      )}
{activeTab === "api" && (
        <div className="space-y-4">
          <Card
            title="API & Integrationen"
            description="Google Analytics einbetten oder per API anbinden."
          >
            <form className="space-y-4" onSubmit={handleApiSave}>
              <label className="block text-sm text-slate-300">
                GA Embed / Iframe URL
                <Input
                  className="mt-2"
                  value={apiSettings.embedUrl ?? ""}
                  onChange={(e) => setApiSettings({ ...apiSettings, embedUrl: e.target.value })}
                  placeholder="https://analytics.google.com/..."
                />
              </label>
              <label className="block text-sm text-slate-300">
                API Token (optional)
                <Input
                  type="password"
                  className="mt-2"
                  value={apiSettings.apiToken ?? ""}
                  onChange={(e) => setApiSettings({ ...apiSettings, apiToken: e.target.value })}
                  placeholder="Service-Account oder OAuth Token"
                />
              </label>
              <label className="block text-sm text-slate-300">
                Service-Account JSON hochladen
                <input
                  type="file"
                  accept=".json,application/json"
                  className="mt-2 w-full text-sm text-slate-200 file:mr-3 file:rounded-xl file:border file:border-white/10 file:bg-white/5 file:px-3 file:py-2 file:text-slate-200 hover:file:bg-white/10"
                  onChange={async (event) => {
                    const file = event.target.files?.[0];
                    if (!file) return;
                    try {
                      const text = await file.text();
                      setApiSettings((current) => ({ ...current, serviceAccountJson: text }));
                      setApiStatus("Service-Account geladen – speichern, um zu übernehmen.");
                    } catch (err) {
                      setApiStatus("Datei konnte nicht gelesen werden.");
                    }
                  }}
                />
              </label>
              <p className="text-xs text-slate-500">
                Für OAuth/Service-Account: GA Reporting API mit Mess-ID/Property-ID nutzen. Embed läuft per Iframe,
                API-Zugriff erfolgt über das gespeicherte Service-Account-JSON und Token (Analyse-Calls folgen).
              </p>
              <Button size="sm" type="submit" disabled={apiSaving}>
                {apiSaving ? "Speichern…" : "Speichern"}
              </Button>
              {apiStatus && <p className="text-xs text-emerald-300">{apiStatus}</p>}
              {apiSettings.hasServiceAccount && (
                <p className="text-xs text-emerald-200">Service-Account hinterlegt.</p>
              )}
              {apiSettings.updatedAt && <p className="text-xs text-slate-400">Aktualisiert: {apiSettings.updatedAt}</p>}
            </form>
          </Card>
        </div>
      )}
    </section>
  );
}
