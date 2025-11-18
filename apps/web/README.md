# Arcto-CRM – Web

Minimalistische Next.js 16 Oberfläche bestehend aus Landingpage, leerem Dashboard und erhaltenen Einstellungen. Der Fokus liegt darauf, Colio-Funktionen zu entfernen und eine saubere CRM-Basis zu behalten.

## Verfügbare Routen
- `/` – Startseite mit Status/Story.
- `/dashboard` – Fast leeres Board mit Platzhaltern für zukünftige KPIs.
- `/settings` – Bestehende Settings-Struktur inkl. Theme Toggle.

## Entwicklung
```bash
npm run web:dev
```

## Produktion
```bash
npm run web:build && npm run web:start
```

## Design / Technik
- Tailwind CSS v4 + Plus Jakarta Sans.
- `next-themes` für Dark/Light.
- Gemeinsame Buttons & Cards unter `src/components/ui`.
