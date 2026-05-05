# RankPulse — Backlog técnico

> Solo trabajo pendiente. El histórico de items resueltos vive en
> `git log --oneline -- BACKLOG.md` y en los PRs #11, #12, #13.

## TL;DR

| Categoría | Cantidad |
|---|---:|
| Pendiente arquitectura/UX (devs) | 5 |
| Pendiente del usuario (opcional) | 1 |
| **Total** | **6** |

> Numeración: items 7-14, 15, 17, 20, 22 y 23 ya cerrados. Mantengo el id
> original para que enlaces externos a "BACKLOG #X" no se rompan; los
> huecos en la secuencia son a propósito.

---

## ❌ Pendiente arquitectura / producto / UX

### #16 — Runtime via `tsx`/swc-node en producción (deuda técnica)
Los apps usan transpilación on-the-fly (`@swc-node/register`) en lugar de un
build TS a `dist/`. Funciona pero penaliza arranque (~1-2s) y aumenta tamaño.
Migrar a multi-stage build → `tsc → dist/`.

---

### A9 — Bootstrap UX: post-registro debería pedir credenciales primero
Tras registro la SPA va a /projects vacía. Mejor: asistente que pida
(1) credencial DataForSEO, (2) primer proyecto, (3) primer keyword + schedule.

---

### #18 — Auto-discovery de competidores desde SERP
**Problema:** los proyectos arrancan con cero competidores. Se añaden a mano,
y los locale-specific (FR, MX) son difíciles de adivinar.

**Idea:** cada vez que un fetch SERP devuelva el top-N, identificar los
dominios externos (no propios, no ya-trackeados como competidores) que
aparecen recurrentemente en las keywords de un proyecto. Cuando un dominio
supere un umbral (p.ej. aparezca en top-10 en ≥30% de las keywords del
proyecto durante ≥3 fetches consecutivos), auto-añadirlo como competidor
(o emitir un evento "CompetitorSuggested" para que el usuario apruebe).

**Capas:**
- **rank-tracking domain:** evento `RankingObservationRecorded` ya existe.
- **Nuevo use-case en `project-management`:** `SuggestCompetitorsFromSerp`
  que consume esos eventos y mantiene un agregado de frecuencia.
- **API:** `GET /projects/:id/competitor-suggestions` (lista pendientes) +
  `POST /projects/:id/competitors/from-suggestion/:sid` (promover).
- **UI:** badge en el panel del proyecto con sugerencias pendientes.

Esto desacopla el descubrimiento del operador y mejora con cada SERP fetch.

---

### #19 — Ampliar provider-core con más endpoints DataForSEO
**Problema:** el provider-registry solo expone `serp-google-organic-live` para
DataForSEO. Para "captar la mayor cantidad de datos" del producto faltan:

| Endpoint DataForSEO | Categoría | Datos que aporta |
|---|---|---|
| `keywords-data/google-ads/search-volume` | keyword research | volumen, CPC, competencia |
| `dataforseo-labs/google/keyword-difficulty` | keyword research | dificultad SEO |
| `dataforseo-labs/google/keywords-for-site` | keyword research | keywords que rankea un dominio |
| `serp/google/organic/overview` | SERP analytics | features SERP (PAA, snippets, ads) |
| `dataforseo-labs/google/related-keywords` | keyword research | keywords relacionadas |
| `dataforseo-labs/google/competitors-domain` | competidores | dominios que rankean en mismas SERPs |
| `domain-analytics/whois/overview` | dominio | edad, registrar, ip |
| `on-page/instant-pages` | on-page | metadatos, performance, headings |
| `backlinks/summary` ⚠️ | backlinks | DR, RD count, anchor text — **requiere addon $100/mo** |

**Acción:** añadir descriptores en `packages/providers/dataforseo/src/endpoints/`,
registrarlos en `provider-core`, exponer schemas de params + cost per call,
e integrar en el registry. Cada endpoint nuevo trae sus propios `paramsSchema`
(zod) y un fetcher.

Sin esto el dashboard solo vive de SERP rank tracking; con esto tendríamos
volume + difficulty para priorización, on-page para auditorías, y
competidores SERP-overlap para benchmarking.

---

### #21 — DIRECTIVA: auto-fetch diario universal para histórico
**Filosofía:** todas las fuentes de datos (presentes y futuras) se programan
con cron diario por defecto, persistiendo a la BD. La UI sólo lee del
histórico — nunca dispara fetches. El usuario no debe "navegar para que algo
se cargue"; el dato ya está ahí.

**Implicaciones por capa:**
- **provider-core:** todo `EndpointDescriptor` nuevo lleva `defaultCron: '0 X * * *'`.
- **scheduling:** al enlazar una nueva property/dominio, el caso de uso
  correspondiente crea su `JobDefinition` automáticamente. Ej. `LinkGscProperty`
  debería emitir `GscPropertyLinked` y un listener crear el cron.
- **UI:** los componentes consumen endpoints que LEEN de hypertables
  (`ranking_observations`, `gsc_daily_metrics`, etc.), no llamadas live al
  provider.
- **operación:** un proyecto pausado significa todas sus `JobDefinitions`
  con `enabled=false` (lo que ya hicimos para DeaMap/GE/RocStatus).

---

## 🟢 Pendiente del usuario (opcional)

- **DataForSEO Backlinks API** ($100/mo). Excluida del v1 — GSC referring
  domains + Ahrefs Free DR cubren el caso.
