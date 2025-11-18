"use client";

import { LayoutDashboard, LifeBuoy, Settings, UserCog, Users } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

import { Logo } from "@/components/logo";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import { clsx } from "clsx";

const navigation = [
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
    title: "Einstellungen",
    href: "/settings",
    icon: Settings,
    description: "Branding, Bereiche und Automationen verwalten",
  },
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 lg:flex">
      <aside className="hidden w-72 flex-col border-r border-white/5 bg-gradient-to-b from-white/5 to-transparent px-6 py-8 lg:flex">
        <Logo className="text-white" href="/dashboard" />
        <nav className="mt-10 space-y-1">
          {navigation.map((item) => {
            const Icon = item.icon;
            const isActive = pathname.startsWith(item.href);

            return (
              <Link
                key={item.title}
                href={item.href}
                className={clsx(
                  "group block rounded-3xl border border-transparent px-4 py-3 transition-all",
                  isActive
                    ? "border-white/20 bg-white/10 text-white"
                    : "text-slate-300 hover:border-white/20 hover:bg-white/5",
                )}
              >
                <div className="flex items-center gap-3">
                  <span className="rounded-2xl border border-white/10 bg-white/5 p-2">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold">{item.title}</p>
                    <p className="text-xs text-slate-400">{item.description}</p>
                  </div>
                </div>
              </Link>
            );
          })}
        </nav>
        <div className="mt-auto rounded-3xl border border-white/5 bg-white/5 p-5 text-sm text-slate-400">
          <p className="text-sm font-semibold text-white">CRM Mission Control</p>
          <p>Dein Workspace ist bereit für die nächste Funktion.</p>
        </div>
      </aside>
      <div className="flex flex-1 flex-col">
        <header className="border-b border-white/5 bg-black/10 px-4 py-4 backdrop-blur supports-[backdrop-filter]:bg-black/20 sm:px-8">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Workspace</p>
              <p className="text-lg font-semibold text-white">Arcto Labs</p>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="sm" className="hidden sm:inline-flex">
                <LifeBuoy className="h-4 w-4" /> Support
              </Button>
              <ThemeToggle />
            </div>
          </div>
        </header>
        <main className="flex-1 px-4 py-8 sm:px-8 lg:px-12">{children}</main>
      </div>
    </div>
  );
}
