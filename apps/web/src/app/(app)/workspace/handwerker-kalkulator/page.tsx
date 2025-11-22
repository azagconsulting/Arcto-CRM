"use client";

import { useEffect, useMemo, useState } from "react";
import type { ChangeEvent } from "react";
import {
  AlertTriangle,
  BadgeEuro,
  Calculator,
  Hammer,
  Loader2,
  Percent,
  Sparkles,
} from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { OPENAI_KEY_STORAGE } from "@/lib/constants";

type CalcState = {
  jobTitle: string;
  hours: string;
  hourlyRate: string;
  materialCost: string;
  travelKm: string;
  travelRate: string;
  marginPercent: string;
  discountPercent: string;
  vatPercent: string;
  currency: string;
  notes: string;
};

const defaultState: CalcState = {
  jobTitle: "Badezimmer Renovierung",
  hours: "40",
  hourlyRate: "65",
  materialCost: "3200",
  travelKm: "60",
  travelRate: "0.35",
  marginPercent: "12",
  discountPercent: "5",
  vatPercent: "19",
  currency: "EUR",
  notes: "Anfahrt ca. 3 Termine, Materialpreise können schwanken.",
};

export default function HandwerkerKalkulatorPage() {
  const router = useRouter();
  const [calc, setCalc] = useState<CalcState>(defaultState);
  const [openAiKey, setOpenAiKey] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    setOpenAiKey(window.localStorage.getItem(OPENAI_KEY_STORAGE));
  }, []);

  const numeric = useMemo(() => {
    const hours = Number.parseFloat(calc.hours) || 0;
    const hourlyRate = Number.parseFloat(calc.hourlyRate) || 0;
    const materialCost = Number.parseFloat(calc.materialCost) || 0;
    const travelKm = Number.parseFloat(calc.travelKm) || 0;
    const travelRate = Number.parseFloat(calc.travelRate) || 0;
    const marginRate = Math.min(Math.max(Number.parseFloat(calc.marginPercent) || 0, 0), 100) / 100;
    const discountRate = Math.min(Math.max(Number.parseFloat(calc.discountPercent) || 0, 0), 100) / 100;
    const vatRate = Math.min(Math.max(Number.parseFloat(calc.vatPercent) || 0, 0), 100) / 100;

    const labor = hours * hourlyRate;
    const travel = travelKm * travelRate;
    const base = labor + materialCost + travel;
    const margin = base * marginRate;
    const subtotal = base + margin;
    const discount = subtotal * discountRate;
    const net = subtotal - discount;
    const vat = net * vatRate;
    const gross = net + vat;

    return { hours, hourlyRate, materialCost, travelKm, travelRate, marginRate, discountRate, vatRate, labor, travel, base, margin, subtotal, discount, net, vat, gross };
  }, [calc.discountPercent, calc.hours, calc.hourlyRate, calc.marginPercent, calc.materialCost, calc.travelKm, calc.travelRate, calc.vatPercent]);

  const handleChange = (key: keyof CalcState) => (event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    setCalc((prev) => ({ ...prev, [key]: event.target.value }));
  };

  const handleAiReview = async () => {
    if (!openAiKey) {
      setAiError("Bitte OpenAI-Key in den Einstellungen hinterlegen.");
      return;
    }
    setAiLoading(true);
    setAiError(null);
    setAiFeedback(null);

    const payload = {
      titel: calc.jobTitle || "Projekt",
      stunden: numeric.hours,
      stundensatz: numeric.hourlyRate,
      material: numeric.materialCost,
      anfahrtKm: numeric.travelKm,
      anfahrtRate: numeric.travelRate,
      margeProzent: numeric.marginRate * 100,
      rabattProzent: numeric.discountRate * 100,
      mwstProzent: numeric.vatRate * 100,
      nettopreis: numeric.net,
      bruttopreis: numeric.gross,
      notizen: calc.notes,
    };

    const prompt = `Du bist Kalkulations-Profi im Handwerk. Prüfe Angebot auf Marge, Aufwand, Risiken.
Angebot:
${JSON.stringify(payload, null, 2)}

Antwort als kurze Bullet-Liste:
- Einschätzung: fair / knapp / Risiko
- Empfohlene Anpassungen (Satz, Material, Anfahrt, Marge)
- Hinweis zu MwSt / Rabatt
- Nächste Schritte für Kund:in
Deutsch, prägnant.`;

    try {
      const response = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${openAiKey}`,
        },
        body: JSON.stringify({
          model: "gpt-4o-mini",
          temperature: 0.25,
          messages: [
            {
              role: "system",
              content: "Du prüfst Handwerker-Angebote. Sei klar, kurz, deutsch, praxisnah.",
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
      setAiFeedback(content);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : "KI-Bewertung fehlgeschlagen.");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <section className="space-y-8">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">KI Tool</p>
          <h1 className="text-3xl font-semibold text-white">Handwerker-Kalkulator</h1>
          <p className="text-sm text-slate-400">Arbeitszeit, Material, Anfahrt & Marge durchrechnen – inkl. KI-Risiko-Check.</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => router.push("/workspace/messages")}>
            Zur Inbox
          </Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(320px,40%)_minmax(0,60%)]">
        <Card title="Eingaben" description="Projekt, Aufwand und Preise anpassen.">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm text-slate-300">
              Projekt / Auftrag
              <Input className="mt-2" value={calc.jobTitle} onChange={handleChange("jobTitle")} placeholder="z.B. Dachsanierung" />
            </label>
            <label className="block text-sm text-slate-300">
              Stunden
              <Input className="mt-2" value={calc.hours} onChange={handleChange("hours")} placeholder="z.B. 40" />
            </label>
            <label className="block text-sm text-slate-300">
              Stundensatz ({calc.currency})
              <Input className="mt-2" value={calc.hourlyRate} onChange={handleChange("hourlyRate")} placeholder="z.B. 65" />
            </label>
            <label className="block text-sm text-slate-300">
              Material ({calc.currency})
              <Input className="mt-2" value={calc.materialCost} onChange={handleChange("materialCost")} placeholder="z.B. 3200" />
            </label>
            <label className="block text-sm text-slate-300">
              Anfahrt (km)
              <Input className="mt-2" value={calc.travelKm} onChange={handleChange("travelKm")} placeholder="z.B. 60" />
            </label>
            <label className="block text-sm text-slate-300">
              Anfahrtssatz ({calc.currency}/km)
              <Input className="mt-2" value={calc.travelRate} onChange={handleChange("travelRate")} placeholder="z.B. 0.35" />
            </label>
            <label className="block text-sm text-slate-300">
              Marge (%)
              <div className="mt-2 flex items-center gap-2">
                <Percent className="h-4 w-4 text-slate-500" />
                <Input className="flex-1" value={calc.marginPercent} onChange={handleChange("marginPercent")} placeholder="z.B. 12" />
              </div>
            </label>
            <label className="block text-sm text-slate-300">
              Rabatt (%)
              <Input className="mt-2" value={calc.discountPercent} onChange={handleChange("discountPercent")} placeholder="z.B. 5" />
            </label>
            <label className="block text-sm text-slate-300">
              MwSt (%)
              <Input className="mt-2" value={calc.vatPercent} onChange={handleChange("vatPercent")} placeholder="z.B. 19" />
            </label>
            <label className="block text-sm text-slate-300">
              Währung
              <Input className="mt-2" value={calc.currency} onChange={handleChange("currency")} placeholder="z.B. EUR" />
            </label>
          </div>
          <label className="mt-4 block text-sm text-slate-300">
            Notizen / Besonderheiten
            <Textarea className="mt-2" rows={3} value={calc.notes} onChange={handleChange("notes")} placeholder="z.B. Aufmaß, Saisonaufschlag, Materialrisiko" />
          </label>
          {!openAiKey && (
            <p className="mt-3 flex items-center gap-2 text-xs text-amber-300">
              <AlertTriangle className="h-3.5 w-3.5" /> OpenAI-Key fehlt. Hinterlege ihn in den Einstellungen.
            </p>
          )}
        </Card>

        <Card title="Ergebnis" description="Netto, MwSt. und Brutto auf einen Blick.">
          <div className="grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Arbeitskosten ({calc.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{numeric.labor.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">{numeric.hours}h x {numeric.hourlyRate.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Material ({calc.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{numeric.materialCost.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">Einkauf + Puffer</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Anfahrt ({calc.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{numeric.travel.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">{numeric.travelKm} km x {numeric.travelRate.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Marge ({calc.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{numeric.margin.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">{(numeric.marginRate * 100).toFixed(1)} % auf Basis</p>
            </div>
          </div>
          <div className="mt-4 grid gap-4 md:grid-cols-2">
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Zwischensumme ({calc.currency})</p>
              <p className="mt-2 text-xl font-semibold text-white">{numeric.subtotal.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">inkl. Marge, vor Rabatt</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Rabatt ({calc.currency})</p>
              <p className="mt-2 text-xl font-semibold text-white">-{numeric.discount.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">({(numeric.discountRate * 100).toFixed(1)} %)</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Netto ({calc.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{numeric.net.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">nach Rabatt</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">MwSt ({calc.currency})</p>
              <p className="mt-2 text-2xl font-semibold text-white">{numeric.vat.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
              <p className="mt-1 text-xs text-slate-400">@ {(numeric.vatRate * 100).toFixed(1)} %</p>
            </div>
          </div>
          <div className="mt-4 rounded-2xl border border-white/10 bg-white/10 p-4 text-center">
            <p className="text-xs uppercase tracking-[0.3em] text-slate-500">Brutto ({calc.currency})</p>
            <p className="mt-2 text-3xl font-semibold text-white">{numeric.gross.toLocaleString("de-DE", { maximumFractionDigits: 2 })}</p>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <Hammer className="h-4 w-4" /> {calc.jobTitle || "Projekt"}
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <BadgeEuro className="h-4 w-4" /> Rabatt {(numeric.discountRate * 100).toFixed(1)} %
            </span>
            <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
              <Percent className="h-4 w-4" /> Marge {(numeric.marginRate * 100).toFixed(1)} %
            </span>
          </div>
          <div className="mt-6 flex flex-wrap gap-2">
            <Button type="button" onClick={() => void handleAiReview()} disabled={aiLoading}>
              {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} KI-Check & Empfehlung
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={() => {
                setAiFeedback(null);
                setAiError(null);
              }}
            >
              Reset Feedback
            </Button>
          </div>
          {aiError && (
            <p className="mt-3 flex items-center gap-2 text-xs text-rose-300">
              <AlertTriangle className="h-3.5 w-3.5" /> {aiError}
            </p>
          )}
          {aiFeedback && (
            <div className="mt-4 space-y-2 rounded-2xl border border-white/10 bg-white/5 p-4 text-sm text-slate-200">
              <p className="text-xs uppercase tracking-[0.3em] text-slate-500">KI Feedback</p>
              <p className="whitespace-pre-line">{aiFeedback}</p>
            </div>
          )}
        </Card>
      </div>
    </section>
  );
}
