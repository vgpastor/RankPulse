# RankPulse — Backlog técnico

> Solo trabajo pendiente. El histórico de items resueltos vive en
> `git log --oneline -- BACKLOG.md` y en los PRs #11, #12, #13.

## TL;DR

| Categoría | Cantidad |
|---|---:|
| Pendiente arquitectura/UX (devs) | 3 |
| Pendiente del usuario (opcional) | 1 |
| **Total** | **4** |

---

## ❌ Pendiente arquitectura / producto / UX

### #15 — SERP fetch redundante por proyecto (5× ahorro DataForSEO)
**Contexto:** una `SERPLiveResponse` trae el top-30 entero. Hoy el processor
solo extrae la posición del único dominio que viene en `params.domain`. Si un
proyecto tiene 5 dominios, hago 5 SERP fetches idénticos
(`$0.0035 × 5 = $0.0175`) cuando con UNA llamada podrían sacarse las 5
posiciones simultáneas (`$0.0035`, **5× más barato**).

**Estado actual:** PR #13 ya implementó `extractRankingsForDomains(payload, domains[])`
en el ACL. Falta el **paso 2**: refactor del `ProviderFetchProcessor` para que:
1. Lea `project.domains` en lugar de `params.domain`.
2. Itere y persista una `RankingObservation` por cada domain match.
3. Coalesce/cache: si la misma `(keyword, location, device)` ya tiene un
   fetch reciente en otro project, reutilizar la `raw_payload`.

Más una migración para des-duplicar las `tracked_keywords` actuales.

---

### #16 — Runtime via `tsx`/swc-node en producción (deuda técnica)
Los apps usan transpilación on-the-fly (`@swc-node/register`) en lugar de un
build TS a `dist/`. Funciona pero penaliza arranque (~1-2s) y aumenta tamaño.
Migrar a multi-stage build → `tsc → dist/`.

---

### A9 — Bootstrap UX: post-registro debería pedir credenciales primero
Tras registro la SPA va a /projects vacía. Mejor: asistente que pida
(1) credencial DataForSEO, (2) primer proyecto, (3) primer keyword + schedule.

---

## 🟢 Pendiente del usuario (opcional)

- **DataForSEO Backlinks API** ($100/mo). Excluida del v1 — GSC referring
  domains + Ahrefs Free DR cubren el caso.
