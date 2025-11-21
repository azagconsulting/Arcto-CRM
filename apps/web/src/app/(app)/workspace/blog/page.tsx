"use client";

import { clsx } from "clsx";
import {
  CalendarDays,
  CheckCircle2,
  Loader2,
  PenSquare,
  Plus,
  RefreshCcw,
  Search,
  Sparkles,
  Trash2,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OPENAI_KEY_STORAGE } from "@/lib/constants";
import type { BlogPost, BlogPostListResponse } from "@/lib/types";

type BlogFormState = {
  title: string;
  slug: string;
  excerpt: string;
  coverImage: string;
  content: string;
  featured: boolean;
  published: boolean;
};

const emptyForm = (): BlogFormState => ({
  title: "",
  slug: "",
  excerpt: "",
  coverImage: "",
  content: "",
  featured: false,
  published: false,
});

const dateFormatter = new Intl.DateTimeFormat("de-DE", {
  dateStyle: "medium",
  timeStyle: "short",
});

function estimateReadingTime(content: string) {
  const words = content.trim().split(/\s+/).filter(Boolean).length;
  const minutes = Math.max(1, Math.round(words / 180));
  return `${minutes} Min. Lesezeit`;
}

function formatDate(value?: string | null) {
  if (!value) return "—";
  try {
    return dateFormatter.format(new Date(value));
  } catch {
    return "—";
  }
}

function slugify(value: string) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function toFormState(post?: BlogPost | null): BlogFormState {
  if (!post) {
    return emptyForm();
  }

  return {
    title: post.title ?? "",
    slug: post.slug ?? "",
    excerpt: post.excerpt ?? "",
    coverImage: post.coverImage ?? "",
    content: post.content ?? "",
    featured: post.featured ?? false,
    published: post.published ?? false,
  };
}

export default function BlogManagerPage() {
  const { authorizedRequest, loading: authLoading } = useAuth();
  const [posts, setPosts] = useState<BlogPost[]>([]);
  const [stats, setStats] = useState({ total: 0, published: 0, drafts: 0 });
  const [form, setForm] = useState<BlogFormState>(emptyForm);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isCreatingNew, setIsCreatingNew] = useState(false);
  const [slugTouched, setSlugTouched] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [listLoading, setListLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [coverSuggestion, setCoverSuggestion] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [openAiKey, setOpenAiKey] = useState<string | null>(null);
  const [autoTopic, setAutoTopic] = useState("");
  const [autoAudience, setAutoAudience] = useState("");
  const [autoTone, setAutoTone] = useState("");
  const [autoNarrative, setAutoNarrative] = useState("");
  const [autoOutline, setAutoOutline] = useState("");
  const [autoLoading, setAutoLoading] = useState(false);
  const [autoError, setAutoError] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [assistantPrompt, setAssistantPrompt] = useState("");
  const [assistantLoading, setAssistantLoading] = useState(false);
  const [assistantError, setAssistantError] = useState<string | null>(null);

  const selectedPost = useMemo(
    () => (selectedId ? posts.find((post) => post.id === selectedId) ?? null : null),
    [posts, selectedId],
  );

  const filteredPosts = useMemo(() => {
    if (!searchTerm.trim()) {
      return posts;
    }
    const query = searchTerm.toLowerCase();
    return posts.filter(
      (post) =>
        post.title?.toLowerCase().includes(query) ||
        post.slug?.toLowerCase().includes(query) ||
        post.excerpt?.toLowerCase().includes(query),
    );
  }, [posts, searchTerm]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    setOpenAiKey(window.localStorage.getItem(OPENAI_KEY_STORAGE));
  }, []);

  const loadPosts = useCallback(
    async (preferredId?: string | null) => {
      setListLoading(true);
      setError(null);
      try {
        const response = await authorizedRequest<BlogPostListResponse>("/blog/posts?limit=50");
        const items = response.items ?? [];
        setPosts(items);
        if (items.length) {
          setStats(
            response.stats ?? {
              total: items.length,
              published: items.filter((item) => item.published).length,
              drafts: items.filter((item) => !item.published).length,
            },
          );
        } else {
          setStats({ total: 0, published: 0, drafts: 0 });
        }
        if (preferredId) {
          setSelectedId(preferredId);
          const next = items.find((item) => item.id === preferredId);
          if (next) {
            setForm(toFormState(next));
            setIsCreatingNew(false);
            setSlugTouched(true);
          }
        } else if (!isCreatingNew && selectedId) {
          const existing = items.find((item) => item.id === selectedId);
          if (existing) {
            setForm(toFormState(existing));
            setSlugTouched(true);
          }
        } else if (!items.length) {
          setForm(emptyForm);
          setSelectedId(null);
          setSlugTouched(false);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Beiträge konnten nicht geladen werden.";
        setError(message);
      } finally {
        setListLoading(false);
      }
    },
    [authorizedRequest, isCreatingNew, selectedId],
  );

  useEffect(() => {
    if (authLoading) return;
    void loadPosts();
  }, [authLoading, loadPosts]);

  const titleValue = form.title;
  useEffect(() => {
    if (slugTouched) return;
    setForm((prev) => {
      const autoSlug = slugify(prev.title || "");
      if (!autoSlug && !prev.slug) {
        return prev;
      }
      if (autoSlug === prev.slug) {
        return prev;
      }
      return { ...prev, slug: autoSlug };
    });
  }, [slugTouched, titleValue]);

  const handleSelectPost = (post: BlogPost) => {
    setSelectedId(post.id);
    setIsCreatingNew(false);
    setForm(toFormState(post));
    setSlugTouched(true);
    setMessage(null);
    setError(null);
    setCoverSuggestion(null);
    setMediaError(null);
    setAutoTopic("");
    setAutoAudience("");
    setAutoTone("");
    setAutoOutline("");
    setAutoNarrative("");
    setIsModalOpen(true);
  };

  const handleCreateNew = () => {
    setSelectedId(null);
    setIsCreatingNew(true);
    setForm(emptyForm);
    setSlugTouched(false);
    setMessage(null);
    setError(null);
    setCoverSuggestion(null);
    setMediaError(null);
    setAutoTopic("");
    setAutoAudience("");
    setAutoTone("");
    setAutoOutline("");
    setAutoNarrative("");
    setIsModalOpen(true);
  };

  const handleSlugChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSlugTouched(true);
    setForm((prev) => ({ ...prev, slug: event.target.value }));
  };

  const handleInputChange = (
    field: keyof Pick<BlogFormState, "title" | "excerpt" | "coverImage" | "content">,
  ) =>
    (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
      if (field === "title") {
        setMessage(null);
      }
    };

  const handleToggle = (field: "published" | "featured") =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.checked }));
    };

  const handleSearchChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setSearchTerm(event.target.value);
  };

  const handleMediaLinkChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setMediaError(null);
    setForm((prev) => ({ ...prev, coverImage: event.target.value }));
  };

  const handleMediaUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    if (!file.type.startsWith("image/")) {
      setMediaError("Bitte lade nur Bilddateien hoch.");
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") {
        setForm((prev) => ({ ...prev, coverImage: result }));
        setMediaError(null);
      }
    };
    reader.readAsDataURL(file);
  };

  const clearMedia = () => {
    setForm((prev) => ({ ...prev, coverImage: "" }));
    setMediaError(null);
    setCoverSuggestion(null);
  };

  const handleAutoGenerate = async () => {
    if (!openAiKey) {
      setAutoError("Hinterlege zuerst deinen OpenAI-Key unter Einstellungen.");
      return;
    }
    setAutoLoading(true);
    setAutoError(null);
    try {
      const prompt = `Du bist ein B2B-Tech-Autor für SaaS und CRM. Schreibe einen Blogpost auf Deutsch, mindestens 600 Wörter, mit klaren Markdown-Überschriften, Aufzählungen und konkreten Beispielen.
Thema: ${autoTopic}
Zielpersona: ${autoAudience}
Tonalität: ${autoTone}
Kontext oder Storyline: ${autoNarrative || "Nutze deine eigenen Beispiele, wenn nichts vorgegeben ist."}
Struktur: ${autoOutline}
Der Blogpost soll folgende Abschnitte enthalten: 1) Hook, 2) Problem mit Daten/Statistiken, 3) Insights/Lösungsabschnitte (mind. 3 Punkte), 4) Handlungsempfehlung, 5) CTA.
Verwende lebendige Sprache, konkrete Beispiele und schließe mit einem starken CTA, der Arcto erwähnt.
Gib ein JSON im Format {"title": "...", "excerpt": "...", "content": "...", "coverPrompt": "..."} zurück. "content" muss vollständiges Markdown mit den genannten Abschnitten sein.`;

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
              content:
                "Du schreibst prägnante SaaS-Blogposts mit klarer Struktur und Datenfokus. Antworte nur mit JSON.",
            },
            { role: "user", content: prompt },
          ],
          response_format: {
            type: "json_schema",
            json_schema: {
              name: "blog_post",
              schema: {
                type: "object",
                properties: {
                  title: { type: "string", description: "Prägnanter Blogtitel" },
                  excerpt: { type: "string", description: "2-3 Sätze Teaser" },
                  content: {
                    type: "string",
                    description:
                      "Ausformulierter Blogartikel in Markdown, inkl. Überschriften und Bulletpoints",
                  },
                  coverPrompt: {
                    type: "string",
                    description: "Prompt oder Idee für ein hero visuals",
                  },
                },
                required: ["title", "excerpt", "content"],
                additionalProperties: false,
              },
            },
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI-Fehler: ${response.status}`);
      }

      const body = await response.json();
      const content = body?.choices?.[0]?.message?.content;
      const contentString = typeof content === "string" ? content.trim() : "";
      if (!contentString) {
        throw new Error("Keine Antwort von OpenAI erhalten");
      }

      let parsed: {
        title?: string;
        excerpt?: string;
        content?: string;
        coverPrompt?: string;
      } | null = null;

      try {
        parsed = JSON.parse(contentString);
      } catch (parseError) {
        console.warn("Konnte JSON nicht parsen", parseError);
      }

      const coverPrompt = parsed?.coverPrompt?.trim() || null;
      if (coverPrompt) {
        setCoverSuggestion(coverPrompt);
      }

      const defaultTopic = autoTopic || "Wie CS-Teams AI nutzen";
      const defaultAudience = autoAudience || "B2B Customer Success Leads";
      const defaultTone = autoTone || "modern, mutig, datenbasiert";

      const nextTitle = (parsed?.title?.trim() || defaultTopic || "AI Beitrag").trim();
      const nextSlug = slugify(nextTitle || `ai-post-${Date.now()}`) || `ai-post-${Date.now()}`;

      const fallbackExcerpt = `${nextTitle} · ${defaultAudience}`.trim();
      const fallbackContent = `## ${nextTitle}\n\n### 1. Hook\nBeschreibe in 2-3 Sätzen die aktuelle Lage von ${defaultAudience} im Stil ${defaultTone}.\n\n### 2. Problem\nErkläre das Problem detailliert mit einer Statistik.\n\n### 3. Insights\n- Insight 1\n- Insight 2\n- Insight 3\n\n### 4. Handlungsempfehlung\nKonkrete Schritte als Liste.\n\n### 5. CTA\nCTA: Jetzt Demo buchen und mit Arcto starten.`;

      const normalizeField = (value: unknown, fallback: string) => {
        if (typeof value === "string") {
          const trimmed = value.trim();
          return trimmed.length ? trimmed : fallback;
        }
        if (Array.isArray(value)) {
          const joined = value.join("\n").trim();
          return joined.length ? joined : fallback;
        }
        if (typeof value === "object" && value !== null) {
          try {
            const stringified = JSON.stringify(value, null, 2).trim();
            return stringified.length ? stringified : fallback;
          } catch {
            return fallback;
          }
        }
        return fallback;
      };

      const nextExcerpt = normalizeField(parsed?.excerpt, fallbackExcerpt);
      const nextContent = normalizeField(parsed?.content, fallbackContent);
      const coverImageSuggestion = form.coverImage || "";

      const generatedForm: BlogFormState = {
        title: nextTitle,
        slug: nextSlug,
        excerpt: nextExcerpt,
        coverImage: coverImageSuggestion,
        content: nextContent,
        featured: false,
        published: false,
      };

      setSelectedId(null);
      setIsCreatingNew(true);
      setForm(generatedForm);
      setSlugTouched(true);

      const created = await authorizedRequest<BlogPost>(`/blog/posts`, {
        method: "POST",
        body: JSON.stringify(generatedForm),
      });

      setMessage("AI-Beitrag erstellt. Du kannst ihn jetzt noch verfeinern.");
      setSelectedId(created.id);
      setIsCreatingNew(false);
      setIsModalOpen(true);
      await loadPosts(created.id);
    } catch (err) {
      setAutoError(err instanceof Error ? err.message : "Automatisierung fehlgeschlagen.");
    } finally {
      setAutoLoading(false);
    }
  };

  const handleContentAssist = async () => {
    if (!assistantPrompt.trim()) {
      setAssistantError("Beschreibe kurz, welche Änderung du möchtest.");
      return;
    }

    if (!openAiKey) {
      setAssistantError("Bitte hinterlege deinen OpenAI-Key unter Einstellungen.");
      return;
    }

    setAssistantLoading(true);
    setAssistantError(null);
    try {
      const prompt = `Du bist ein professioneller Redakteur. Überarbeite den folgenden Blogpost nach dieser Anweisung:\n\"${assistantPrompt.trim()}\"\n\nText:\n${form.content}\n\nGib nur den überarbeiteten Text als Markdown aus.`;

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
            { role: "system", content: "Du bist ein hilfreicher Redakteur, der Texte verbessert." },
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

      setForm((prev) => ({ ...prev, content }));
      setAssistantOpen(false);
      setAssistantPrompt("");
    } catch (err) {
      setAssistantError(err instanceof Error ? err.message : "KI-Anpassung fehlgeschlagen.");
    } finally {
      setAssistantLoading(false);
    }
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setIsCreatingNew(false);
    setSelectedId(null);
    setCoverSuggestion(null);
    setMediaError(null);
    setAssistantOpen(false);
    setAssistantPrompt("");
    setAssistantError(null);
  };

  const regenerateSlug = () => {
    setSlugTouched(true);
    setForm((prev) => {
      const fallback = `beitrag-${Date.now()}`;
      const suggestion = slugify(prev.title || fallback) || fallback;
      return { ...prev, slug: suggestion };
    });
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!form.title.trim()) {
      setError("Bitte gib einen Titel ein.");
      return;
    }
    if (!form.slug.trim()) {
      setError("Bitte vergebe einen gültigen Slug.");
      return;
    }
    if (form.content.trim().length < 40) {
      setError("Der Inhalt sollte mindestens ein paar Sätze umfassen.");
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    const payload = {
      title: form.title.trim(),
      slug: form.slug.trim(),
      excerpt: form.excerpt.trim(),
      coverImage: form.coverImage.trim(),
      content: form.content.trim(),
      featured: form.featured,
      published: form.published,
    };

    try {
      if (selectedId) {
        await authorizedRequest<BlogPost>(`/blog/posts/${selectedId}`, {
          method: "PATCH",
          body: JSON.stringify(payload),
        });
        setMessage("Änderungen gespeichert.");
        await loadPosts(selectedId);
      } else {
        const created = await authorizedRequest<BlogPost>(`/blog/posts`, {
          method: "POST",
          body: JSON.stringify(payload),
        });
        setSelectedId(created.id);
        setIsCreatingNew(false);
        setIsModalOpen(true);
        setMessage("Beitrag veröffentlicht.");
        await loadPosts(created.id);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Speichern fehlgeschlagen.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    if (typeof window !== "undefined") {
      const confirmed = window.confirm("Beitrag wirklich löschen?");
      if (!confirmed) {
        return;
      }
    }

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      await authorizedRequest(`/blog/posts/${selectedId}`, {
        method: "DELETE",
      });
      setMessage("Beitrag gelöscht.");
      await loadPosts(null);
      handleCloseModal();
    } catch (err) {
      const message = err instanceof Error ? err.message : "Löschen fehlgeschlagen.";
      setError(message);
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = () => {
    void loadPosts(selectedId);
  };

  const publishedBadge = form.published ? "Live" : "Entwurf";
  const estimatedReadingTime = estimateReadingTime(form.content || "");

  return (
    <>
      <section className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Content Ops</p>
          <h1 className="text-3xl font-semibold text-white">Blog</h1>
          <p className="text-sm text-slate-400">
            Beiträge verfassen, veröffentlichen und direkt auf der Landingpage ausspielen.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button variant="ghost" size="sm" onClick={handleRefresh} disabled={listLoading}>
            {listLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCcw className="h-4 w-4" />} Neu laden
          </Button>
          <Button size="sm" onClick={handleCreateNew}>
            <Plus className="h-4 w-4" /> Neuer Beitrag
          </Button>
        </div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card className="bg-gradient-to-br from-sky-500/10 to-transparent">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Live</p>
          <p className="mt-2 text-3xl font-semibold text-white">{stats.published}</p>
          <p className="text-xs text-slate-500">Veröffentlicht & sichtbar</p>
        </Card>
        <Card className="bg-gradient-to-br from-amber-500/10 to-transparent">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Entwürfe</p>
          <p className="mt-2 text-3xl font-semibold text-white">{stats.drafts}</p>
          <p className="text-xs text-slate-500">Noch in Bearbeitung</p>
        </Card>
        <Card className="bg-gradient-to-br from-emerald-500/10 to-transparent">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Gesamt</p>
          <p className="mt-2 text-3xl font-semibold text-white">{stats.total}</p>
          <p className="text-xs text-slate-500">Beiträge im Archiv</p>
        </Card>
        <Card className="bg-gradient-to-br from-purple-500/10 to-transparent">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Aktueller Draft</p>
          <p className="mt-2 text-3xl font-semibold text-white">{estimatedReadingTime}</p>
          <p className="text-xs text-slate-500">Geschätzte Lesezeit</p>
        </Card>
      </div>

      {(message || error) && (
        <div className="rounded-3xl border border-white/10 bg-white/5 p-4 text-sm">
          {message && (
            <p className="flex items-center gap-2 text-emerald-300">
              <CheckCircle2 className="h-4 w-4" /> {message}
            </p>
          )}
          {error && <p className="mt-1 text-rose-300">{error}</p>}
        </div>
      )}

      <Card
        title="Beiträge"
        description="Aktuelle Drafts und Lives."
        action={
          <div className="flex items-center gap-2">
            <Search className="h-3.5 w-3.5 text-slate-500" />
            <Input
              value={searchTerm}
              onChange={handleSearchChange}
              placeholder="Suchen..."
              className="h-8 w-40 rounded-2xl bg-black/20 text-xs"
            />
          </div>
        }
      >
        {filteredPosts.length === 0 && !listLoading ? (
          <p className="text-sm text-slate-400">
            Keine Beiträge für deine Suche. Probiere einen anderen Begriff.
          </p>
        ) : (
          <div className="space-y-3">
            {filteredPosts.map((post) => (
              <button
                key={post.id}
                type="button"
                onClick={() => handleSelectPost(post)}
                className={clsx(
                  "block w-full rounded-2xl border px-4 py-3 text-left transition-colors",
                  selectedId === post.id && isModalOpen
                    ? "border-white/40 bg-white/10"
                    : "border-white/10 hover:border-white/30",
                )}
              >
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-white">{post.title}</p>
                    <p className="text-xs text-slate-400">
                      {post.published ? `Live seit ${formatDate(post.publishedAt)}` : "Entwurf"}
                    </p>
                  </div>
                  <span
                    className={clsx(
                      "rounded-full px-3 py-1 text-xs font-semibold",
                      post.published
                        ? "bg-emerald-500/10 text-emerald-300"
                        : "bg-amber-500/10 text-amber-200",
                    )}
                  >
                    {post.published ? "Live" : "Draft"}
                  </span>
                </div>
                {post.excerpt && (
                  <p className="mt-2 line-clamp-2 text-xs text-slate-400">{post.excerpt}</p>
                )}
              </button>
            ))}
          </div>
        )}
      </Card>
      </section>

      {isModalOpen ? (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
        <div className="absolute inset-0 bg-black/80" onClick={handleCloseModal} />
        <div className="relative z-10 h-[95vh] w-full max-w-6xl overflow-y-auto rounded-3xl border border-white/10 bg-slate-950 p-6 shadow-2xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                {isCreatingNew ? "Neuer Beitrag" : "Blog Editor"}
              </p>
              <h2 className="text-2xl font-semibold text-white">
                {form.title || selectedPost?.title || "Unbenannter Beitrag"}
              </h2>
            </div>
            <Button variant="ghost" size="sm" onClick={handleCloseModal}>
              Schließen
            </Button>
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-[3fr,2fr]">
            <div className="space-y-6">
              <Card
                title="AI-Automatisierung"
                description="Briefing definieren – Arcto schreibt dir einen ersten Entwurf."
                action={
                  !openAiKey ? (
                    <span className="text-xs text-rose-200">
                      OpenAI-Key unter Einstellungen nötig
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">Key erkannt</span>
                  )
                }
              >
                <div className="space-y-4">
                  <label className="text-sm text-slate-300">
                    <span className="font-semibold text-white">Thema oder Hook</span>
                    <span className="block text-xs text-slate-500">
                      Max. 1 Satz – was versprichst du der Zielgruppe?
                    </span>
                    <Input
                      value={autoTopic}
                      onChange={(event) => setAutoTopic(event.target.value)}
                      className="mt-2"
                      placeholder="z. B. Wie CS-Teams AI in QBRs einsetzen"
                    />
                  </label>
                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="text-sm text-slate-300">
                      <span className="font-semibold text-white">Zielpersona</span>
                      <span className="block text-xs text-slate-500">
                        Funktion, Seniorität, Branche
                      </span>
                      <Input
                        value={autoAudience}
                        onChange={(event) => setAutoAudience(event.target.value)}
                        className="mt-2"
                        placeholder="z. B. B2B Customer Success Leads"
                      />
                    </label>
                    <label className="text-sm text-slate-300">
                      <span className="font-semibold text-white">Tonalität</span>
                      <span className="block text-xs text-slate-500">
                        2-3 Adjektive für Stil und Sprache
                      </span>
                      <Input
                        value={autoTone}
                        onChange={(event) => setAutoTone(event.target.value)}
                        className="mt-2"
                        placeholder="z. B. modern, mutig, datenbasiert"
                      />
                    </label>
                  </div>
                  <label className="text-sm text-slate-300">
                    <span className="font-semibold text-white">Struktur</span>
                    <span className="block text-xs text-slate-500">
                      Kapitel in Reihenfolge, getrennt durch Kommas
                    </span>
                    <Textarea
                      rows={3}
                      value={autoOutline}
                      onChange={(event) => setAutoOutline(event.target.value)}
                      className="mt-2"
                      placeholder="z. B. Hook, Problem, 3 Insights, Handlungsempfehlung, CTA"
                    />
                  </label>
                  <label className="text-sm text-slate-300">
                    <span className="font-semibold text-white">Kontext / Storyline</span>
                    <span className="block text-xs text-slate-500">
                      Beschreibe in 2-4 Sätzen die Ausgangslage, Pain Points oder bestehende Assets.
                    </span>
                    <Textarea
                      rows={4}
                      value={autoNarrative}
                      onChange={(event) => setAutoNarrative(event.target.value)}
                      className="mt-2"
                      placeholder="z. B. Unser CS-Team kämpfte mit manuellem Reporting und fehlender Storyline für QBRs ... "
                    />
                  </label>
                  <Button size="sm" onClick={handleAutoGenerate} disabled={autoLoading}>
                    {autoLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}{" "}
                    Beitrag generieren
                  </Button>
                  {autoError && <p className="text-xs text-rose-300">{autoError}</p>}
                  {coverSuggestion && (
                    <p className="text-xs text-slate-400">
                      Cover-Idee: <span className="text-white">{coverSuggestion}</span>
                    </p>
                  )}
                </div>
              </Card>

              <Card
                title="Editor"
                description="Content schreiben, Assets verlinken und veröffentlichen."
                action={
                  selectedPost ? (
                    <div className="text-xs text-slate-400">
                      Zuletzt aktualisiert {formatDate(selectedPost.updatedAt)}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400">Neuer Beitrag</div>
                  )
                }
              >
                <form id="blog-editor-form" className="space-y-4" onSubmit={handleSubmit}>
                  <div className="grid gap-4 lg:grid-cols-2">
                    <label className="text-sm text-slate-300">
                      Titel
                      <Input
                        value={form.title}
                        onChange={handleInputChange("title")}
                        placeholder="z. B. Warum Arcto CRM Ruhe reinbringt"
                        disabled={saving}
                        className="mt-2"
                      />
                    </label>
                    <div>
                      <label className="text-sm text-slate-300">Slug</label>
                      <div className="mt-2 flex items-center gap-2">
                        <div className="rounded-2xl border border-white/10 bg-black/40 px-3 py-3 text-xs text-slate-500">
                          /blog/
                        </div>
                        <Input
                          value={form.slug}
                          onChange={handleSlugChange}
                          placeholder="ruhe-im-crm"
                          disabled={saving}
                        />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          onClick={regenerateSlug}
                          disabled={saving}
                        >
                          Neu
                        </Button>
                      </div>
                    </div>
                  </div>

                  <label className="text-sm text-slate-300">
                    Untertitel / Teaser
                    <Textarea
                      rows={3}
                      value={form.excerpt}
                      onChange={handleInputChange("excerpt")}
                      placeholder="Kurze Einordnung für die Vorschau"
                      disabled={saving}
                      className="mt-2"
                    />
                  </label>

                  <div className="relative rounded-3xl border border-white/10 bg-black/20 p-4">
                    <label className="text-sm text-slate-300 flex items-center justify-between">
                      <span>Inhalt</span>
                      <button
                        type="button"
                        className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-white/10 bg-white/10 text-slate-200 transition hover:text-white"
                        onClick={() => {
                          setAssistantOpen((open) => !open);
                          setAssistantError(null);
                        }}
                        title="KI-Assistent öffnen"
                      >
                        <Sparkles className="h-4 w-4" />
                      </button>
                    </label>
                    <Textarea
                      rows={12}
                      value={form.content}
                      onChange={handleInputChange("content")}
                      placeholder="Schreibe deinen Artikel..."
                      disabled={saving}
                      className="mt-2 font-mono"
                    />
                    {assistantOpen ? (
                      <div className="mt-3 rounded-2xl border border-white/10 bg-black/60 p-4 text-sm text-slate-300 space-y-3">
                        <p className="text-xs uppercase tracking-[0.3em] text-slate-500">
                          KI-Anpassung
                        </p>
                        <Textarea
                          rows={3}
                          value={assistantPrompt}
                          onChange={(event) => setAssistantPrompt(event.target.value)}
                          placeholder="z. B. Füge einen Abschnitt mit konkreten KPIs hinzu oder formuliere den CTA mutiger."
                          className="text-sm"
                        />
                        {assistantError && <p className="text-xs text-rose-300">{assistantError}</p>}
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            size="sm"
                            onClick={handleContentAssist}
                            disabled={assistantLoading}
                          >
                            {assistantLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Sparkles className="h-4 w-4" />
                            )}{" "}
                            Anwenden
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setAssistantOpen(false);
                              setAssistantPrompt("");
                              setAssistantError(null);
                            }}
                          >
                            Abbrechen
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </div>

                  <div className="grid gap-4 md:grid-cols-2">
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-sky-400"
                        checked={form.published}
                        onChange={handleToggle("published")}
                        disabled={saving}
                      />
                      <span>
                        <p className="text-sm font-semibold text-white">Veröffentlichen</p>
                        <p className="text-xs text-slate-400">
                          Sichtbar auf der öffentlichen Blogseite
                        </p>
                      </span>
                    </label>
                    <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-white/10 bg-black/20 p-4">
                      <input
                        type="checkbox"
                        className="mt-1 h-4 w-4 accent-sky-400"
                        checked={form.featured}
                        onChange={handleToggle("featured")}
                        disabled={saving}
                      />
                      <span>
                        <p className="text-sm font-semibold text-white">Highlight</p>
                        <p className="text-xs text-slate-400">Ganz oben im Blog hervorheben</p>
                      </span>
                    </label>
                  </div>

                </form>
              </Card>
            </div>

            <div className="space-y-6">
              <Card
                title="Media & Assets"
                description="Cover per Link oder Upload hinterlegen."
                action={
                  form.coverImage ? (
                    <Button variant="ghost" size="sm" onClick={clearMedia}>
                      Clear
                    </Button>
                  ) : null
                }
              >
                <div className="space-y-3">
                  <label className="text-sm text-slate-300">
                    Bild über Link
                    <Input
                      value={form.coverImage?.startsWith("data:") ? "" : form.coverImage}
                      onChange={handleMediaLinkChange}
                      placeholder="https://..."
                      className="mt-2"
                    />
                  </label>
                  <label className="text-sm text-slate-300">
                    Oder hochladen
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleMediaUpload}
                      className="mt-2 block w-full text-xs text-slate-400"
                    />
                  </label>
                  {mediaError && <p className="text-xs text-rose-300">{mediaError}</p>}
                  <div className="rounded-2xl border border-dashed border-white/10 p-3 text-center text-xs text-slate-500">
                    {form.coverImage ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={form.coverImage}
                        alt="Cover"
                        className="h-36 w-full rounded-xl object-cover"
                      />
                    ) : (
                      "Noch kein Bild ausgewählt."
                    )}
                  </div>
                </div>
              </Card>

              <Card title="Live Preview" description="So wirkt dein Beitrag auf der Landingpage.">
                <div className="overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 to-black">
                  {form.coverImage ? (
                    <div
                      className="h-48 w-full bg-cover bg-center"
                      style={{ backgroundImage: `url(${form.coverImage})` }}
                    />
                  ) : (
                    <div className="flex h-48 items-center justify-center bg-slate-900/70 text-slate-600">
                      <Sparkles className="h-6 w-6" />{" "}
                      <span className="ml-2 text-sm">Kein Cover hinterlegt</span>
                    </div>
                  )}
                  <div className="space-y-3 p-5">
                    <div className="flex flex-wrap items-center gap-2 text-xs uppercase tracking-[0.3em] text-slate-500">
                      <span>{publishedBadge}</span>
                      {form.featured && <span className="text-emerald-300">FEATURED</span>}
                      <span>{estimatedReadingTime}</span>
                    </div>
                    <h3 className="text-xl font-semibold text-white">
                      {form.title || "Titel folgt..."}
                    </h3>
                    <p className="text-sm text-slate-400">
                      {form.excerpt || "Sobald du einen Teaser schreibst, erscheint er hier."}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/30 px-4 py-3 text-sm text-slate-400">
                  <div>
                    Status: <span className="font-semibold text-white">{publishedBadge}</span>
                    {selectedPost?.publishedAt && form.published && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs">
                        <CalendarDays className="h-3.5 w-3.5" /> {formatDate(selectedPost.publishedAt)}
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {selectedId && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={handleDelete}
                        disabled={saving}
                        className="text-rose-300 hover:text-rose-200"
                      >
                        <Trash2 className="h-4 w-4" /> Löschen
                      </Button>
                    )}
                    <Button type="submit" size="sm" form="blog-editor-form" disabled={saving}>
                      {saving ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <PenSquare className="h-4 w-4" />
                      )}{" "}
                      {selectedId ? "Speichern" : "Veröffentlichen"}
                    </Button>
                  </div>
                </div>
              </Card>

            </div>
          </div>
        </div>
      </div>
    ) : null}
    </>
  );
}
