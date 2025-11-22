"use client";

import {
  Bot,
  Calculator,
  ChevronLeft,
  ChevronRight,
  LayoutDashboard,
  LifeBuoy,
  LogOut,
  Menu,
  MessageSquare,
  Newspaper,
  Settings,
  Sparkles,
  Search,
  UserCog,
  Users,
  X,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { clsx } from "clsx";

type NavigationIcon = typeof LayoutDashboard;

interface NavigationChild {
  title: string;
  href: string;
  description: string;
  icon?: NavigationIcon;
}

interface NavigationItem {
  title: string;
  href?: string;
  icon: NavigationIcon;
  description: string;
  badge?: number;
  children?: NavigationChild[];
}

const MESSAGE_COUNTS_KEY = "workspace/messages/unread-total";

const navigationBase: NavigationItem[] = [
  {
    title: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    description: "Schneller Überblick über Leads und Aktivitäten",
  },
  {
    title: "Kunden",
    href: "/customers",
    icon: Users,
    description: "Accounts, Beziehungen und Health",
  },
  {
    title: "Mitarbeiter",
    href: "/mitarbeiter",
    icon: UserCog,
    description: "People Ops, Kapazität und Hiring im Blick",
  },
  {
    title: "Blog",
    href: "/workspace/blog",
    icon: Newspaper,
    description: "Beiträge verfassen und veröffentlichen",
  },
  {
    title: "Messages",
    href: "/workspace/messages",
    icon: MessageSquare,
    description: "Inbox & E-Mails mit Kunden",
  },
  {
    title: "KI Tool",
    icon: Bot,
    description: "Assistenten & Automationen",
    children: [
      {
        title: "Angebotskalkulator",
        href: "/workspace/angebot-kalkulator",
        icon: Calculator,
        description: "Preise, Rabatte & AI-Check",
      },
      {
        title: "Lead Finder",
        href: "/workspace/lead-finder",
        icon: Search,
        description: "Firmen recherchieren & anreichern",
      },
      {
        title: "Social Launch",
        href: "/workspace/social",
        icon: Sparkles,
        description: "Automatisierte Beiträge mit OpenAI",
      },
    ],
  },
];

const footerNavigation: NavigationItem[] = [
  {
    title: "Einstellungen",
    href: "/settings",
    icon: Settings,
    description: "Branding, Bereiche und Automationen verwalten",
  },
  {
    title: "Hilfscenter",
    href: "/help",
    icon: LifeBuoy,
    description: "Guides, Support & FAQ",
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout, loading } = useAuth();
  const [messagesBadge, setMessagesBadge] = useState(0);
  const [openDropdown, setOpenDropdown] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const displayName = user?.firstName ? `${user.firstName} ${user.lastName ?? ""}`.trim() : user?.email;
  const avatarInitials = useMemo(() => {
    if (user?.firstName || user?.lastName) {
      return `${user?.firstName?.charAt(0) ?? ""}${user?.lastName?.charAt(0) ?? ""}`.toUpperCase();
    }
    return user?.email?.charAt(0).toUpperCase() ?? "?";
  }, [user?.email, user?.firstName, user?.lastName]);

  useEffect(() => {
    if (!loading && !user) {
      router.replace("/");
    }
  }, [loading, router, user]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }
    const readFromStorage = () => {
      try {
        const raw = window.localStorage.getItem(MESSAGE_COUNTS_KEY);
        if (!raw) {
          setMessagesBadge(0);
          return;
        }
        const parsed: unknown = JSON.parse(raw);
        if (typeof parsed === "object" && parsed && "total" in parsed) {
          const total = Number((parsed as Record<string, unknown>).total);
          setMessagesBadge(Number.isFinite(total) ? total : 0);
        }
      } catch {
        setMessagesBadge(0);
      }
    };
    readFromStorage();

    const handleCustom = (event: Event) => {
      const detail = (event as CustomEvent<{ total: number }>).detail;
      if (detail && typeof detail.total === "number") {
        setMessagesBadge(Math.max(0, detail.total));
      }
    };

    const handleStorage = (event: StorageEvent) => {
      if (event.key === MESSAGE_COUNTS_KEY) {
        readFromStorage();
      }
    };

    window.addEventListener("workspace-messages-counts", handleCustom as EventListener);
    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("workspace-messages-counts", handleCustom as EventListener);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  useEffect(() => {
    setOpenDropdown(null);
  }, [pathname]);

  const isItemActive = (item: NavigationItem) => {
    if (item.children?.length) {
      return item.children.some((child) => pathname.startsWith(child.href));
    }
    return item.href ? pathname.startsWith(item.href) : false;
  };

  return (
    <div className="min-h-screen text-[var(--text-primary)] lg:flex">
      <aside
        className={clsx(
          "fixed inset-y-0 left-0 z-[210] flex flex-col border-r py-8 transition-all duration-300 ease-out",
          sidebarOpen ? "translate-x-0" : "-translate-x-full",
          "lg:sticky lg:top-0 lg:z-[200] lg:translate-x-0 lg:h-screen",
          sidebarCollapsed ? "lg:w-24 px-3" : "lg:w-72 px-6",
        )}
        style={{
          borderColor: "var(--panel-border)",
          background: "linear-gradient(180deg, rgba(255,255,255,0.04) 0%, rgba(255,255,255,0.01) 100%)",
        }}
      >
        <div className={clsx("relative flex items-center justify-between gap-3", sidebarCollapsed && "flex-col")}>
          {!sidebarCollapsed && <Logo className="text-[var(--text-primary)]" href="/dashboard" />}
          {sidebarCollapsed && (
            <div className="relative flex flex-col items-center gap-2">
              <Button
                size="icon"
                variant="ghost"
                className="hidden lg:inline-flex text-[var(--text-primary)]"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                title="Sidebar ausklappen"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
              <Link href="/dashboard" className="flex items-center text-[var(--text-primary)]">
                <span className="text-lg font-semibold leading-none">A</span>
              </Link>
            </div>
          )}
          <div className={clsx("flex items-center gap-2", sidebarCollapsed && "w-full justify-end")}>
            {!sidebarCollapsed && (
              <Button
                size="icon"
                variant="ghost"
                className="hidden lg:inline-flex text-[var(--text-primary)]"
                onClick={() => setSidebarCollapsed((prev) => !prev)}
                title="Sidebar ein-/ausfahren"
              >
                {sidebarCollapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
              </Button>
            )}
            <Button
              size="icon"
              variant="ghost"
              className="lg:hidden text-[var(--text-primary)]"
              onClick={() => setSidebarOpen(false)}
              aria-label="Sidebar schließen"
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>
        <nav className="mt-10 space-y-1 relative z-[210] overflow-visible">
          {navigationBase.map((item) => {
            const Icon = item.icon;
            const hasChildren = Boolean(item.children?.length);
            const isActive = isItemActive(item);
            const isDropdownOpen = hasChildren && openDropdown === item.title;
            const badge = item.href === "/workspace/messages" ? messagesBadge : item.badge;

            return (
              <div
                key={item.title}
                className="relative group"
              >
                {hasChildren ? (
                  <button
                    type="button"
                    aria-expanded={isDropdownOpen}
                    onClick={() =>
                      setOpenDropdown((current) => (current === item.title ? null : item.title))
                    }
                    className={clsx(
                      "group/button block w-full rounded-3xl border px-4 py-3 text-left transition-all",
                      isActive
                        ? "bg-[var(--nav-active-bg)] text-[var(--text-primary)] shadow-[0_18px_38px_-30px_rgba(15,23,42,0.5)]"
                        : "bg-[var(--nav-bg)] text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]",
                      sidebarCollapsed ? "justify-center px-3 text-[var(--text-primary)] border-transparent bg-transparent shadow-none" : "",
                    )}
                    style={{
                      borderColor: isActive ? "var(--panel-border-strong)" : "var(--panel-border)",
                    }}
                  >
                    <div
                      className={clsx(
                        "flex items-center",
                        sidebarCollapsed ? "justify-center gap-0" : "gap-3",
                      )}
                    >
                      <Icon
                        className={clsx(
                          "h-5 w-5 text-[var(--text-primary)]",
                          sidebarCollapsed ? "text-[var(--text-primary)]" : "",
                        )}
                      />
                      {!sidebarCollapsed && (
                        <div className="flex flex-1 items-center justify-between gap-3">
                          <p className="text-sm font-semibold">{item.title}</p>
                          <ChevronRight
                            className={clsx(
                              "h-4 w-4 transition-transform",
                              isDropdownOpen
                                ? "rotate-90 text-[var(--text-primary)]"
                                : "text-[var(--text-secondary)]",
                            )}
                          />
                        </div>
                      )}
                    </div>
                  </button>
                ) : (
                  <Link
                    href={item.href as string}
                    className={clsx(
                      "group/link block rounded-3xl border px-4 py-3 transition-all",
                      isActive
                        ? "bg-[var(--nav-active-bg)] text-[var(--text-primary)] shadow-[0_18px_38px_-30px_rgba(15,23,42,0.5)]"
                        : "bg-[var(--nav-bg)] text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]",
                      sidebarCollapsed ? "justify-center px-3 text-[var(--text-primary)] border-transparent bg-transparent shadow-none" : "",
                    )}
                    style={{
                      borderColor: isActive ? "var(--panel-border-strong)" : "var(--panel-border)",
                    }}
                  >
                    <div
                      className={clsx(
                        "flex items-center",
                        sidebarCollapsed ? "justify-center gap-0" : "gap-3",
                      )}
                    >
                      <Icon
                        className={clsx(
                          "h-5 w-5 text-[var(--text-primary)]",
                          sidebarCollapsed ? "text-[var(--text-primary)]" : "",
                        )}
                      />
                      {!sidebarCollapsed && (
                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-semibold">{item.title}</p>
                            {badge ? (
                              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                                {badge}
                              </span>
                            ) : null}
                          </div>
                        </div>
                      )}
                    </div>
                  </Link>
                )}

                {hasChildren ? (
                  <div
                    className={clsx(
                      "absolute left-[calc(100%+12px)] top-1/2 z-[999] min-w-[240px] -translate-y-1/2 rounded-3xl border bg-[var(--nav-bg)] p-2 shadow-2xl transition-all duration-150 ease-out",
                      isDropdownOpen
                        ? "pointer-events-auto opacity-100 translate-x-0"
                        : "pointer-events-none opacity-0 translate-x-2",
                    )}
                    style={{
                      borderColor: "var(--panel-border-strong)",
                      backgroundColor: "rgba(2, 6, 23, 0.98)",
                    }}
                  >
                    {item.children?.map((child) => {
                      const ChildIcon = child.icon ?? Icon;
                      const childActive = pathname.startsWith(child.href);
                      return (
                        <Link
                          key={child.title}
                          href={child.href}
                          onClick={() => setOpenDropdown(null)}
                          className={clsx(
                            "flex items-center gap-3 rounded-2xl border px-3 py-2 transition-all",
                            childActive
                              ? "bg-[var(--nav-active-bg)] text-[var(--text-primary)] shadow-[0_18px_38px_-30px_rgba(15,23,42,0.5)]"
                              : "text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]",
                          )}
                          style={{
                            borderColor: childActive ? "var(--panel-border-strong)" : "var(--panel-border)",
                          }}
                        >
                          <ChildIcon
                            className={clsx(
                              "h-5 w-5 text-[var(--text-primary)]",
                              sidebarCollapsed ? "text-[var(--text-primary)]" : "",
                            )}
                          />
                          <p className="text-sm font-semibold">{child.title}</p>
                        </Link>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="mt-6 border-t border-white/10 pt-4">
          <div className="space-y-1">
            {footerNavigation.map((item) => {
              const Icon = item.icon;
              const isActive = isItemActive(item);
              const badge = item.href === "/workspace/messages" ? messagesBadge : item.badge;
              return (
                <Link
                  key={item.title}
                  href={item.href as string}
                  className={clsx(
                    "group/link block rounded-3xl border px-4 py-3 transition-all",
                    isActive
                      ? "bg-[var(--nav-active-bg)] text-[var(--text-primary)] shadow-[0_18px_38px_-30px_rgba(15,23,42,0.5)]"
                      : "bg-[var(--nav-bg)] text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]",
                    sidebarCollapsed ? "justify-center px-3 text-[var(--text-primary)] border-transparent bg-transparent shadow-none" : "",
                  )}
                  style={{
                    borderColor: isActive ? "var(--panel-border-strong)" : "var(--panel-border)",
                  }}
                >
                  <div
                    className={clsx(
                      "flex items-center",
                      sidebarCollapsed ? "justify-center gap-0" : "gap-3",
                    )}
                  >
                    <Icon className="h-5 w-5 text-[var(--text-primary)]" />
                    {!sidebarCollapsed && (
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold">{item.title}</p>
                        {badge ? (
                          <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-[11px] font-semibold text-emerald-200">
                            {badge}
                          </span>
                        ) : null}
                      </div>
                    )}
                  </div>
                </Link>
              );
            })}
            <button
              type="button"
              onClick={logout}
              className={clsx(
                "group/link block w-full rounded-3xl border px-4 py-3 text-left transition-all",
                "bg-[var(--nav-bg)] text-[var(--text-secondary)] hover:bg-[var(--nav-hover-bg)] hover:text-[var(--text-primary)]",
                sidebarCollapsed ? "justify-center px-3 text-[var(--text-primary)] border-transparent bg-transparent shadow-none" : "",
              )}
              style={{ borderColor: "var(--panel-border)" }}
            >
              <div
                className={clsx(
                  "flex items-center",
                  sidebarCollapsed ? "justify-center gap-0" : "gap-3",
                )}
              >
                <LogOut className="h-5 w-5 text-[var(--text-primary)]" />
                {!sidebarCollapsed && <p className="text-sm font-semibold">Logout</p>}
              </div>
            </button>
          </div>
        </div>
      </aside>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[200] bg-black/50 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <div className="flex flex-1 flex-col">
        <header
          className="sticky top-0 z-30 border-b px-4 py-4 backdrop-blur sm:px-8"
          style={{
            borderColor: "var(--panel-border-strong)",
            backgroundColor: "var(--nav-bg)",
            color: "var(--text-primary)",
          }}
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <Button
                size="icon"
                variant="ghost"
                className="lg:hidden"
                onClick={() => setSidebarOpen(true)}
                aria-label="Sidebar öffnen"
              >
                <Menu className="h-5 w-5" />
              </Button>
              {!sidebarCollapsed && (
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--text-secondary)]">Workspace</p>
                  <p className="text-lg font-semibold text-[var(--text-primary)]">Arcto Labs</p>
                </div>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button
                variant="ghost"
                size="sm"
                className="hidden sm:inline-flex text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                <LifeBuoy className="h-4 w-4" /> Support
              </Button>
              <ThemeToggle />
              {user ? (
                <>
                  <div
                    className="flex h-9 w-9 items-center justify-center overflow-hidden rounded-full border"
                    style={{
                      borderColor: "var(--panel-border)",
                      backgroundColor: "var(--badge-bg)",
                    }}
                  >
                    {user.avatarUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={user.avatarUrl} alt={displayName ?? "Profil"} className="h-full w-full object-cover" />
                    ) : (
                      <span className="text-xs font-semibold uppercase text-[var(--text-primary)]">{avatarInitials}</span>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-8 lg:px-12">{children}</main>
      </div>
    </div>
  );
}
