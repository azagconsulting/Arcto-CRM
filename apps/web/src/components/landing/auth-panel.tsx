"use client";

import { LogIn, Loader2, UserPlus } from "lucide-react";
import { clsx } from "clsx";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { useAuth } from "@/components/auth-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type Mode = "login" | "register";

const initialState = {
  email: "",
  password: "",
  firstName: "",
  lastName: "",
};

export function LandingAuthPanel() {
  const router = useRouter();
  const { login, register, error, user } = useAuth();
  const [mode, setMode] = useState<Mode>("login");
  const [form, setForm] = useState(initialState);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");

  const handleChange = (field: keyof typeof form) =>
    (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: event.target.value }));
    };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setStatus("submitting");

    try {
      if (mode === "login") {
        await login({
          email: form.email,
          password: form.password,
        });
      } else {
        await register({
          email: form.email,
          password: form.password,
          firstName: form.firstName,
          lastName: form.lastName,
        });
      }
      setStatus("success");
      router.push("/dashboard");
    } catch (err) {
      console.error(err);
      setStatus("error");
    }
  };

  const disabled = status === "submitting";
  const Icon = mode === "login" ? LogIn : UserPlus;

  return (
    <div id="zugang" className="rounded-[32px] border border-white/10 bg-white/5 p-6 shadow-[0_30px_70px_rgba(8,15,40,0.4)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.4em] text-slate-400">
            {mode === "login" ? "Login" : "Workspace Zugang"}
          </p>
          <h2 className="text-2xl font-semibold text-white">
            {mode === "login" ? "Direkt weiterarbeiten" : "Team Account anlegen"}
          </h2>
        </div>
        <div className="flex items-center gap-2 rounded-full border border-white/10 bg-black/30 p-1 text-xs">
          {(["login", "register"] as Mode[]).map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setMode(item)}
              className={clsx(
                "rounded-full px-3 py-1 font-medium transition",
                mode === item ? "bg-white/20 text-white" : "text-slate-400 hover:text-white",
              )}
            >
              {item === "login" ? "Login" : "Registrieren"}
            </button>
          ))}
        </div>
      </div>

      {user && (
        <p className="mt-4 rounded-2xl border border-emerald-300/40 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          Bereits eingeloggt als <span className="font-semibold">{user.email}</span>. Gehe direkt zum Dashboard.
        </p>
      )}

      <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
        {mode === "register" && (
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Vorname</label>
              <Input
                placeholder="Mara"
                autoComplete="given-name"
                value={form.firstName}
                onChange={handleChange("firstName")}
                disabled={disabled}
              />
            </div>
            <div>
              <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Nachname</label>
              <Input
                placeholder="Schneider"
                autoComplete="family-name"
                value={form.lastName}
                onChange={handleChange("lastName")}
                disabled={disabled}
              />
            </div>
          </div>
        )}
        <div>
          <label className="text-xs uppercase tracking-[0.3em] text-slate-400">E-Mail</label>
          <Input
            required
            type="email"
            autoComplete="email"
            placeholder="du@arcto.app"
            value={form.email}
            onChange={handleChange("email")}
            disabled={disabled}
          />
        </div>
        <div>
          <label className="text-xs uppercase tracking-[0.3em] text-slate-400">Passwort</label>
          <Input
            required
            type="password"
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            placeholder="••••••••"
            value={form.password}
            onChange={handleChange("password")}
            disabled={disabled}
          />
        </div>
        <Button type="submit" disabled={disabled} className="w-full">
          {status === "submitting" ? (
            <span className="flex items-center justify-center gap-2">
              <Loader2 className="h-4 w-4 animate-spin" /> Wird gesendet
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Icon className="h-4 w-4" />
              {mode === "login" ? "Login & Dashboard" : "Account erstellen"}
            </span>
          )}
        </Button>
        {(status === "error" || error) && (
          <p className="text-center text-sm text-rose-300">{error ?? "Etwas ist schiefgelaufen."}</p>
        )}
        {status === "success" && (
          <p className="text-center text-sm text-emerald-300">Erfolgreich! Du wirst weitergeleitet …</p>
        )}
      </form>
      <p className="mt-4 text-center text-xs text-slate-400">
        Deine Daten bleiben bei Arcto. Mit dem Account erhältst du Zugriff auf Dashboard & Settings.
      </p>
    </div>
  );
}
