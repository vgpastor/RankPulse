# RankPulse — Backlog técnico

> Solo trabajo pendiente. El histórico de items resueltos vive en
> `git log --oneline -- BACKLOG.md` y en los PRs #11, #12, #13.

## TL;DR

| Categoría | Cantidad |
|---|---:|
| Pendiente arquitectura/UX (devs) | 9 |
| Pendiente del usuario (opcional) | 1 |
| **Total** | **10** |

> Numeración: items 7-14, 15, 16, 17, 18, 19, 20, 21, 22, 23 y A9 ya
> cerrados. Mantengo el id original para que enlaces externos a "BACKLOG
> #X" no se rompan; los huecos en la secuencia son a propósito.

---

## ❌ Pendiente arquitectura — nuevos providers gratis

> Filosofía: maximizar la captación de datos diaria (#21) ampliando la base
> de proveedores **gratis o casi gratis** antes que ampliar el gasto en
> DataForSEO. Cada provider debajo es un nuevo módulo en
> `packages/providers/<name>/` registrando 1+ endpoints en provider-core,
> con su `paramsSchema` (zod), `cost { unit, amount }`, `defaultCron`
> diario y un fetcher tipado.

### #24 — Google Analytics 4 Data API
**Aporta:** sesiones, usuarios, pageviews, conversiones, fuente/medio,
páginas top, cohortes, eventos personalizados — **datos REALES de tráfico**
desde el property GA4 del cliente. Gratis, cuotas amplias (200k req/día/
proyecto).

**Credencial:** service-account JSON (mismo flujo que GSC). El SA debe
añadirse como Viewer en GA4 → Admin → Property Access Management.
**Endpoints sugeridos:**
- `ga4-run-report` (params: propertyId, startDate token, endDate token,
  dimensions[], metrics[], rowLimit) — daily.
- `ga4-batch-run-reports` para multi-report en una llamada.
- `ga4-realtime-report` opcional para snapshot en vivo.

**Modelo de datos:** hypertable `ga4_daily_metrics(propertyId, date,
dimension_keys, metrics_jsonb)`. Linkable 1:N a `projects` igual que
`gsc_properties`.

### #25 — Google PageSpeed Insights / Core Web Vitals
**Aporta:** LCP, INP, CLS reales (CrUX) + lab metrics Lighthouse + score
performance/SEO/accessibility/best-practices/PWA. **SEO crítico** — Google
los usa para ranking factor.

**Credencial:** API key gratis (1 query/seg, 25k/día) — generar en Google
Cloud Console y guardar como `RANKPULSE_GOOGLE_API_KEY` en `.env.local`.
**Endpoints sugeridos:**
- `psi-runpagespeed` (params: url, strategy=mobile|desktop, category[]).
  Retorna lighthouseResult + loadingExperience (CrUX) + originLoadingExperience.

Run **diario por dominio (mobile + desktop = 2 fetches/dominio/día)** = 30
fetches/día PatrolTech, todos gratis.

### #26 — Chrome UX Report (CrUX) BigQuery / API
**Aporta:** Core Web Vitals reales agregados de usuarios reales de Chrome,
con histórico mensual de 25 meses. Complementa PSI (que solo da snapshot
del último mes).

**Credencial:** API key Google (la misma del PSI sirve), cuota 150
req/min/proyecto.
**Endpoints:** `crux-history` (params: origin, formFactor, metrics[]) —
mensual el día 14 (cuando Google publica datos del mes).

### #27 — Bing Webmaster Tools API
**Aporta:** ESPEJO de GSC pero para Bing — clicks, impresiones, posición
media, queries, top pages. Bing tiene 5-10% del mercado en EU/US y 20% en
algunos verticales B2B → es un canal real que GSC no ve.

**Credencial:** API key gratis desde Bing Webmaster (Settings → API
Access). Misma autorización que GSC: hay que verificar la propiedad y
autorizar.
**Endpoints:** `bing-page-stats`, `bing-query-stats`, `bing-keyword-stats`
— todos daily, gratis.

### #28 — OpenPageRank
**Aporta:** Domain Rank (proxy de Domain Authority de Moz), dominios
referidos contados — sustituto **gratis** de DataForSEO Backlinks API
($100/mo).

**Credencial:** API key gratis (registro en openpagerank.com), 1k req/día.
**Endpoints:** `opr-get-rank` (params: domains[]) — batch hasta 100 dominios
por llamada, monthly por dominio.

### #29 — Wayback Machine CDX API
**Aporta:** snapshots históricos de cada dominio — útil para detectar
cuándo apareció un competidor, cambios de title/description, redesigns.
Permite construir "timeline" de cada dominio y competidor.

**Credencial:** ninguna (API pública, ~rate limit cortés ~15req/s).
**Endpoints:** `wayback-cdx-search` (params: url, from, to, limit) —
weekly por dominio.

### #30 — SSL Labs + Security Headers + W3C Validator (auditoría técnica)
**Aporta:** scoring técnico paralelo a PageSpeed — TLS config, HTTP
security headers, validez HTML/CSS. Complementa al `on-page-instant-pages`
de DataForSEO con dimensiones que ese no cubre.

**Credencial:** ninguna (tres APIs públicas).
**Endpoints sugeridos:**
- `ssllabs-analyze` (1 fetch/dom/sem) — grado A+/A/B/C…
- `securityheaders-analyze` (1 fetch/dom/sem) — score CSP, HSTS, X-Frame…
- `w3c-validator-validate` (1 fetch/dom/sem) — errores HTML/CSS.

### #31 — Schema.org Rich Results Test API
**Aporta:** validar structured data de cada página y detectar qué rich
results es elegible (FAQ, Product, BreadcrumbList…) — clave para CTR
en SERP.

**Credencial:** ninguna (Google API pública).
**Endpoints:** `rich-results-test` (params: url) — weekly por URL clave.

### #32 — Cloudflare Radar (opcional, contexto macro)
**Aporta:** rankings globales de tráfico, tendencias de búsqueda, ataques
DDoS — contexto macro útil para correlacionar caídas de tráfico con
eventos del ecosistema.

**Credencial:** API token Cloudflare gratis (ya existe en KeePass).
**Endpoints:** `radar-domain-rank`, `radar-search-trends` — monthly.

---

### Resumen de ahorro vs DataForSEO de pago
| Endpoint DFS pagado | Reemplazo gratis | Ahorro/mes (PT) |
|---|---|---|
| backlinks/summary ($100/mo addon) | OpenPageRank (#28) | $100 |
| domain-rating-history | OpenPageRank histórico | incluido |
| keyword-data si pasamos a SearchConsole+Bing | GSC + Bing (#27) | ~$6 |
| on-page-instant ($0.00125/dom) | PSI + W3C + SSL Labs (#25, #30) | ~$0.5 |

### Coste operativo nuevo (todo gratis)
Sumando todos los endpoints arriba en cron diario para PatrolTech (15
dominios + 22 keywords): **0 €/mes**. Solo aumenta el coste de Postgres
(hypertables crecen ~5MB/mes por endpoint) y un poco de CPU del worker
(BullMQ procesa hasta 6req/s, sobra capacidad).

### Orden recomendado de implementación
1. **#25 PSI** — más rápido (API key + un fetch), valor inmediato (CWV).
2. **#24 GA4** — duplica el insight de GSC con datos de tráfico real.
3. **#27 Bing** — paralelo a GSC, mismo modelo mental.
4. **#28 OpenPageRank** — reemplaza la DataForSEO Backlinks $100/mo.
5. **#26 CrUX**, **#29 Wayback**, **#30 SSL/Headers/W3C** — siguientes
   sprints según prioridad UX.
6. **#31 Rich Results**, **#32 Cloudflare Radar** — si y cuando.

---

## 🟢 Pendiente del usuario (opcional)

- **DataForSEO Backlinks API** ($100/mo). Excluida del v1 — GSC referring
  domains + Ahrefs Free DR cubren el caso.
