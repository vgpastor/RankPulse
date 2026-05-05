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

Más una migración para des-duplicar las `tracked_keywords` actuales (crear
una `tracked_keyword` por (project, keyword, location), no por dominio).

**Impacto medido:** las 4 markets de PatrolTech con 5+3+5+2 dominios y
7+5+6+4 keywords son hoy 88 SERPs/refresh (~$0.31). Tras el refactor: 22
SERPs (~$0.077). En todo el portfolio: hoy ~181 fetches/refresh
(~$0.63), tras refactor ~50 (~$0.18).

---

### #16 — Runtime via `tsx` en producción (deuda técnica)
Los Dockerfiles usan `tsx` (transpilación on-the-fly) en lugar de un build
TypeScript a `dist/`. Funciona, pero:
- Penaliza arranque (~1-2 s extra de transpile).
- Aumenta tamaño de imagen (~30-50 MB de devDependencies).
- Posible fricción con `@nestjs/swagger` y `design:paramtypes` (workaround
  try/catch ya en `apps/api/src/main.ts`).

**Tarea:** introducir multi-stage build en cada Dockerfile (build → tsc →
runtime con `--prod` install). Cuando esté listo, simplificar el try/catch
alrededor de `SwaggerModule.createDocument` en `main.ts`.

**Por qué pendiente:** requiere refactor `main`+`build` per-package en los
10 paquetes del workspace. Aplazado a PR propia (no bloqueante).

---

### A9 — Bootstrap UX: post-registro debería pedir credenciales primero
- **Hoy:** registras, te metes en /projects, ves vacío con un botón "+ Nuevo
  proyecto". Si añades proyectos sin credenciales, ningún fetch funciona.
- **Mejor:** asistente que tras registro pida (1) credencial DataForSEO,
  (2) primer proyecto, (3) primer keyword tracked + schedule. Todo en una
  ventana modal.

---

## 🟢 Pendiente del usuario (opcional)

- **DataForSEO Backlinks API** ($100/mo). Excluida del v1 — GSC referring
  domains + Ahrefs Free DR cubren el caso. Solo si quieres datos completos
  de backlinks.
