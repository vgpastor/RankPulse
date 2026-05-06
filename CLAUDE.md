# CLAUDE.md

> Guía operativa para agentes de IA (Claude Code, Cursor, etc.) que trabajen
> sobre este repositorio. Resume **principios, arquitectura, convenciones y
> comandos** que NO se pueden inferir leyendo el código en frío.
>
> Si modificas algo que invalide este fichero, **actualízalo en el mismo PR**.

---

## 1. Qué es RankPulse

Plataforma open-source self-hosted de inteligencia SEO **multi-proyecto,
multi-dominio, multi-país**. Sustituye a Ahrefs/Semrush para monitorización
multi-proyecto a una fracción del coste. Licencia **AGPL-3.0**.

- Backend: **NestJS 11 + TypeScript estricto**, Postgres 16 + TimescaleDB
  (Drizzle ORM), Redis + BullMQ.
- Frontend: **React 19 + Vite + TanStack Router/Query + Tailwind v4 + shadcn/ui**.
- Monorepo: **pnpm workspaces + Turborepo + Biome**.
- Node `>=24`, pnpm `>=10`. Usa **Corepack** o `npm i -g pnpm@10.33.2`.

---

## 2. Principios no negociables

Toda contribución (humana o IA) debe respetar estos principios. Si una tarea te
empuja a romperlos, **detente y pregunta**.

### 2.1 DDD por dominios funcionales SEO

- Bounded contexts nombrados por **lenguaje del negocio**, no por tecnología:
  `rank-tracking`, `search-console-insights`, `provider-connectivity`,
  `project-management`, `identity-access`, `entity-awareness`,
  `traffic-analytics`, `web-performance`, `bing-webmaster-insights`,
  `macro-context`.
- **Prohibido** crear contextos genéricos tipo `metrics`, `data`, `utils`,
  `core` (más allá del shared-kernel ya existente). Cada contexto posee sus
  propias entidades, value objects, eventos y puertos.
- Un contexto nuevo se añade como carpeta hermana en `packages/domain/src/<contexto>`
  con la estructura: `entities/`, `value-objects/`, `events/`, `ports/`, `index.ts`.
- Si dos contextos necesitan compartir un concepto, va a `shared-kernel` solo si
  es **ubicuo** (IDs, Clock, Result). Si no, duplica — el coste de duplicar es
  menor que el de un acoplamiento equivocado.

### 2.2 SOLID

- **S** — Cada use case hace **una** cosa. Si un comando coordina más de un
  agregado, parte el use case o emite eventos de dominio.
- **O** — Para añadir un proveedor nuevo no se toca el core; se crea un paquete
  en `packages/providers/<name>` que implementa el contrato `Provider`.
- **L** — Las implementaciones de un puerto (`*-repository`, `Clock`,
  `EventPublisher`) deben ser intercambiables sin que el caller cambie.
- **I** — Puertos pequeños y específicos (un repo por agregado). Nada de
  "GodRepository".
- **D** — `domain` y `application` dependen **solo** de abstracciones. NestJS,
  Drizzle, ioredis, helmet, jose, etc. viven en `infrastructure`/`apps`.

### 2.3 Clean Code

- Nombres de dominio: si el negocio dice "tracked keyword", el código dice
  `TrackedKeyword`, **no** `Item`, `Record`, `Data`.
- Funciones cortas, una sola razón para cambiar.
- Comentarios explican el **por qué**, nunca el **qué**.
- Borra código muerto y `// removed`-comments. Sin "por si acaso".
- Prefiere errores tipados (`Result`, excepciones de dominio en
  `shared-kernel`) sobre `throw new Error("...")`.

### 2.4 Atomic Design en la UI

- `packages/ui` es la librería compartida. Estructura:
  - `atoms/` — `button`, `input`, `label`, `badge`, `spinner`, `select`, `textarea`.
  - `molecules/` — `card`, `data-table`, `drawer`, `empty-state`, `form-field`, `modal`.
  - `organisms/` — composición de moléculas (cuando exista, crear carpeta).
  - `templates/` — layouts de página.
- `apps/web/src/pages/*.page.tsx` son **pages** (Atomic Design); compone organismos.
- `apps/web/src/components/*-drawer.tsx` son organismos de feature; deben usar
  átomos/moléculas de `@rankpulse/ui` y **nunca** redefinir un átomo localmente.
- Si necesitas un átomo nuevo, créalo en `packages/ui/src/atoms/` y expórtalo
  desde `packages/ui/src/index.ts`.

### 2.5 Mobile-first

- Tailwind: estilos base sin breakpoint = mobile. Escala con `sm:`, `md:`,
  `lg:`, `xl:`. **Nunca** al revés.
- Diseña layouts con `flex-col` por defecto; cambia a `lg:flex-row` cuando haga
  falta. Tablas: `data-table` debe tener vista colapsada o scroll horizontal en
  pantallas pequeñas.
- Cualquier organismo nuevo debe verse correcto a **375px** (iPhone SE) antes
  de mergear. Verifícalo manualmente o con la pestaña device de DevTools.
- Toques accesibles: targets `min-h-11 min-w-11` (44px) en controles.

### 2.6 API auto-funcional (OpenAPI-first)

> Lo principal del proyecto: **la API tiene que estar viva y autodocumentada
> sin intervención manual.**

- Toda ruta nueva en `apps/api/src/modules/<contexto>/*.controller.ts` debe:
  1. Estar registrada con prefijo `api/v1` (lo aplica `main.ts`).
  2. Validar entrada con **Zod** (los DTOs viven en `@rankpulse/contracts`).
  3. Declarar `summary`, `description`, request/response examples y `tags` en
     el spec OpenAPI 3.1 (`apps/api/src/openapi/spec.ts`).
  4. Pasar el lint Spectral (CI lo ejecuta).
- El SDK TypeScript (`packages/sdk`) se **autogenera** desde el OpenAPI; no se
  edita a mano. Si cambias un endpoint, regenera el SDK y commitea el diff.
- Healthchecks (`/healthz`, `/readyz`) y `/openapi.json` + `/docs` están
  excluidos del prefijo `api/v1` por diseño — **no los muevas**.
- El **shutdown** debe ser ordenado: `app.enableShutdownHooks()` ya está
  activo; no añadas listeners de `SIGTERM`/`SIGINT` paralelos.

### 2.7 Escalabilidad por defecto

- **Cache + dedupe en cada petición externa.** Cada endpoint de proveedor
  declara `cacheTtl` e `idempotencyWindow`. La misma SERP query para 10
  proyectos = **1** llamada externa. Si añades una integración y no defines
  estos campos, CI debería rechazarlo.
- **Time-series por contexto**: hypertables TimescaleDB + continuous aggregates.
  Nunca metas observaciones en una tabla relacional plana.
- **Rate-limit en API**: `ThrottlerModule` define tres throttlers — `default`
  (600/min), `auth` (20/min), `bulk` (6000/min). Endpoints de bulk-write deben
  optar explícitamente con `@Throttle({ bulk: ... })`.
- **Stateless API + workers escalables**: cualquier estado mutable vive en
  Postgres o Redis, **nunca** en memoria del proceso. Permite `pm2 reload` sin
  drama y escalado horizontal.
- **Multi-scope credentials** (`org` → `portfolio` → `project` → `domain`):
  resuelve en el resolver del contexto `provider-connectivity`. No hardcodees
  scope en use cases.

---

## 3. Reglas de dependencia (impuestas en code review)

```
shared        → (nada)
domain        → shared
application   → shared, domain
infrastructure→ shared, domain, application
providers/*   → shared, domain, application, infrastructure
contracts     → (independiente, lo consumen api y web)
sdk           → autogenerado desde OpenAPI
ui            → react + tailwind (sin lógica de negocio)
testing       → adapters in-memory de los puertos
apps/api      → wire-up de todo lo anterior + NestJS
apps/worker   → wire-up + NestJS + BullMQ
apps/web      → contracts + sdk + ui
```

- **NestJS, Drizzle, ioredis, helmet, jose, BullMQ NO pueden importarse en
  `domain` ni `application`.** Si lo necesitas, define un puerto en
  `domain/<contexto>/ports/` e implémentalo en `infrastructure/`.
- Composition root: `apps/api/src/composition/composition-root.ts` cablea
  puertos→adapters. Use cases se exponen vía tokens (`composition/tokens.ts`)
  para que los módulos NestJS los inyecten.

---

## 4. Convenciones de código y estilo

- **Formato**: Biome (`pnpm format`, `pnpm lint:fix`). Indentación = `tab`,
  ancho 2, comillas simples, semicolons, trailing commas. Markdown/YAML/JSON
  usan **espacios** (ver `.editorconfig`).
- **TypeScript estricto**: ya activado en `tsconfig.base.json`
  (`strict`, `noUncheckedIndexedAccess`, `noImplicitOverride`,
  `noFallthroughCasesInSwitch`). No bajes flags.
- **ESM puro**: `"type": "module"` en todos los packages. Imports relativos
  con extensión `.js` (no `.ts`) — lo exige NodeNext y los compilados.
- **Sin `any` salvo justificación**. Biome lo marca como warning; no merguees
  PRs con `any` nuevos sin comentario explicando el porqué.
- **Imports**: `useImportType: warn` y `useNodejsImportProtocol: error` —
  importa tipos como `import type` y módulos node como `node:fs`.

### Naming

| Cosa | Convención | Ejemplo |
|---|---|---|
| Entidad / Aggregate root | `PascalCase` | `TrackedKeyword`, `Project` |
| Value object | `PascalCase` | `Position`, `SearchEngine`, `Device` |
| Use case | `PascalCase` + `UseCase` suffix | `RecordRankingObservationUseCase` |
| Puerto (interfaz) | `PascalCase` + dominio | `RankingObservationRepository` |
| Evento de dominio | Verbo en pasado | `KeywordPositionChanged` |
| Fichero TS | `kebab-case` | `record-ranking-observation.use-case.ts` |
| Test unitario | mismo nombre + `.spec.ts` | `record-ranking-observation.use-case.spec.ts` |
| Componente React | `PascalCase` componente, `kebab-case` archivo | `Button` en `button.tsx`, `AddDomainDrawer` en `add-domain-drawer.tsx` |

---

## 5. Testing

- **Vitest** para unit + integration. **Playwright** para e2e (cuando exista).
  **Testcontainers** para integration con Postgres/Redis reales.
- **Mock solo en los bordes (puertos)**: los unit tests de use cases usan
  entidades reales y adapters in-memory de `packages/testing`. Si te ves
  mockeando algo interno al use case, **extrae un puerto**.
- **Asserts sobre comportamiento observable**, no sobre llamadas internas.
  Prefiere `expect(repo.findById(...)).toEqual(...)` sobre
  `expect(repo.save).toHaveBeenCalledWith(...)`.
- Cobertura mínima implícita: cada use case nuevo trae su `.spec.ts`.
- Comandos:
  - `pnpm test` — toda la suite (turbo).
  - `pnpm test:unit` — unit tests aislados.
  - `pnpm test:integration` — integración con servicios.
  - `pnpm --filter @rankpulse/<paquete> test` — un paquete concreto.

---

## 6. Comandos clave

> Ejecuta siempre desde la raíz del repo salvo nota explícita.

### Setup inicial

```bash
pnpm install
docker compose -f docker-compose.dev.yml up -d postgres redis
cp .env.example .env       # rellena .env.local con secretos reales
pnpm --filter @rankpulse/infrastructure db:migrate
```

### Desarrollo (3 terminales)

```bash
pnpm --filter @rankpulse/api dev      # http://localhost:3000  (docs: /docs)
pnpm --filter @rankpulse/worker dev
pnpm --filter @rankpulse/web dev      # http://localhost:5173
```

### Validación pre-commit (corre todo lo que CI ejecuta)

```bash
pnpm lint       # biome
pnpm typecheck  # tsc --noEmit en todos los packages
pnpm test       # vitest
pnpm build      # tsc -p tsconfig.build.json + vite build
```

### Drizzle

```bash
pnpm --filter @rankpulse/infrastructure db:generate   # nuevas migraciones
pnpm --filter @rankpulse/infrastructure db:migrate    # aplicar
```

### Limpieza

```bash
pnpm clean      # borra dist/.turbo/*.tsbuildinfo de todos los packages
```

---

## 7. Cómo añadir cosas (recetas)

### 7.1 Nuevo use case

1. Define o reutiliza la entidad/VO en `packages/domain/src/<contexto>/`.
2. Si necesita un repo nuevo, declara la interfaz en `…/ports/` (sin
   implementación).
3. Crea el use case en `packages/application/src/<contexto>/use-cases/<nombre>.use-case.ts`
   inyectando los puertos por constructor.
4. Test unitario `<nombre>.use-case.spec.ts` con adapters in-memory de
   `packages/testing`.
5. Implementa los puertos en `packages/infrastructure/src/persistence/...`
   (Drizzle) y registra el binding en `apps/api/src/composition/`.
6. Expón en HTTP creando/actualizando un controller en
   `apps/api/src/modules/<contexto>/`.
7. Añade el endpoint al spec en `apps/api/src/openapi/spec.ts` (summary,
   description, examples, tags) y regenera el SDK.

### 7.2 Nuevo provider externo

1. `mkdir packages/providers/<name>` y declara su `package.json` con
   `"name": "@rankpulse/provider-<name>"`.
2. Implementa el contrato `Provider` de `@rankpulse/provider-core` declarando
   endpoints, schedules, **`cacheTtl`** e **`idempotencyWindow`**.
3. Regístralo en `pnpm-workspace.yaml` (ya cubierto por `packages/providers/*`).
4. Importa el módulo en `apps/api/src/app.module.ts` y `apps/worker/...`.
5. Abre la issue de seguimiento con etiquetas `provider` + `free-source`
   o `paid-source`, y reclámala antes de empezar (ver "Claim de issues").

### 7.3 Nuevo átomo / molécula UI

1. Crea el componente en `packages/ui/src/atoms/<name>.tsx` (o `molecules/`).
2. Usa `class-variance-authority` (`cva`) para variantes y `cn()` (de `lib/cn`).
3. Exporta desde `packages/ui/src/index.ts`.
4. Usa **mobile-first** Tailwind y respeta tokens de `styles.css`.
5. (Cuando tengamos Storybook configurado) añade el `.stories.tsx`.

### 7.4 Nueva página web

1. Crea `apps/web/src/pages/<feature>.page.tsx`.
2. Registra la ruta en `apps/web/src/router.tsx`.
3. Consume datos vía `@rankpulse/sdk` + `@tanstack/react-query`.
4. Compón con átomos/moléculas de `@rankpulse/ui`. Layout mobile-first.
5. i18n: añade claves en `apps/web/src/i18n.ts` — **no hardcodees strings**.

---

## 8. Seguridad y observabilidad

- **Nunca commitees `.env.local`** ni cualquier `.env.*.local` (gitignored ya).
  `.env` solo lleva valores **dev/safe**.
- Credenciales de proveedor cifradas con `RANKPULSE_MASTER_KEY` (32 bytes hex).
  Generación / rotación documentadas en `SECURITY.md`.
- Auth: JWT con `jose`, guard global `JwtAuthGuard` (configurado en
  `app.module.ts`). Las rutas públicas usan el decorador correspondiente.
- CORS: solo orígenes en `env.CORS_ORIGINS`. CSP relajada únicamente para
  `/docs` (Swagger) por diseño.
- Logs estructurados: usa `Logger` de NestJS con un contexto identificable
  (e.g. `RankTrackingController`). No `console.log`.

---

## 9. Git, branches y CI

- Trunk-based: rama `main` siempre verde.
- Convención de commits: **Conventional Commits** con scope = bounded context.
  Ejemplos:
  - `feat(rank-tracking): publish KeywordPositionChanged on observation ingest`
  - `fix(provider-connectivity): cascade credentials when domain scope is empty`
  - `test(project-management): cover invalid-domain rejection`
- PRs **focales** (un contexto o un cross-cutting concern). Antes de pedir
  review: `pnpm lint && pnpm typecheck && pnpm test`.
- CI (`.github/workflows/ci.yml`): lint → typecheck → unit → build → docker
  build (api/worker/web). Si rompes uno, arréglalo, no lo silencies.

### Gestión de tareas — **solo GitHub**

> **No usamos `BACKLOG.md` ni ficheros de planificación dentro del repo.**
> Todo el trabajo pendiente, decisiones y discusiones viven en GitHub.

- **Issues** (`gh issue list`, `gh issue create`) — única fuente de verdad del backlog.
- **Milestones** — agrupan issues por release / sprint (ej: `v1.1 — Free providers expansion`).
- **Projects (board)** — vista kanban / roadmap; mueve tarjetas en lugar de
  reordenar listas en markdown.
- **Labels** estándar:
  - `provider` — integración de un nuevo data provider.
  - `free-source` / `paid-source` — coste de la fuente.
  - `architecture` — decisión arquitectónica transversal.
  - `dx` — developer experience / tooling.
  - `user-action` — requiere acción del product owner (creds, billing).
  - `enhancement` / `bug` / `documentation` — tipo de cambio.
  - `wip` — issue actualmente en curso (ver "Claim de issues" abajo).
- **Discussions** — para RFCs y debates abiertos, no en Issues.
- **PRs** — referencian la issue con `Closes #123` para auto-cerrarla al merge.

#### Claim de issues (evitar trabajo duplicado)

> **Regla dura, válida tanto para humanos como para agentes IA:** antes de
> escribir una sola línea de código sobre una issue, **recláma­la**. Si ya
> está reclamada por otro, **NO empieces** — escoge otra o coordina en el
> hilo de la issue.

Procedimiento de claim:

1. Asígnate la issue: `gh issue edit <id> --add-assignee @me`.
2. Añádele el label `wip`: `gh issue edit <id> --add-label wip`.
3. Deja un comentario corto: `gh issue comment <id> --body "Tomando esto"`
   (opcionalmente con ETA).

Antes de empezar, comprueba que **nadie** la haya reclamado ya:

```bash
gh issue view <id> --json assignees,labels,comments
gh issue list --label wip --state open   # qué hay en vuelo ahora mismo
```

Si la issue tiene `assignees` no vacío **o** lleva el label `wip`, **abandona**
y elige otra. Solo se "roba" una issue si han pasado >7 días de inactividad y
el assignee no responde en el hilo en 24h.

Al terminar (PR mergeado): el `Closes #N` cierra la issue, y el label `wip` se
retira automáticamente al cierre (o quítalo a mano si la issue queda abierta
por otra razón).

**Reglas para el agente IA:**

1. Antes de crear código nuevo significativo, **busca o abre una issue**
   (`gh issue create` o el MCP de GitHub). Enlaza el PR con `Closes #N`.
2. **Recláma la issue antes de tocar código** (asignación + label `wip` +
   comentario). Si otra persona/agente ya la tiene, **no la cojas** — busca
   otra. Esta regla es absoluta.
3. **No** crees ni edites `BACKLOG.md`, `TODO.md`, `ROADMAP.md` ni similares
   dentro del repo. Si encuentras uno antiguo, propon su retirada en una issue.
4. Las decisiones técnicas se documentan en Discussions o en un ADR
   (`docs/adr/NNNN-titulo.md`) — **nunca** en un fichero suelto en raíz.
5. Para descubrir trabajo pendiente:
   ```bash
   gh issue list --state open --search "no:assignee -label:wip"  # libres
   gh issue list --label provider
   gh issue list --milestone "v1.1 — Free providers expansion"
   gh issue view <id>
   ```

---

## 10. Despliegue (resumen para no romperlo)

Producción en `srv07`: **PM2 (host) + Plesk Docker (storage)**. Detalles
exhaustivos en `ops/DEPLOY.md`.

- API y worker corren con PM2 (cluster + fork) bajo el vhost user
  `ingenierosweb`. Manifest en `ops/ecosystem.config.cjs`.
- Postgres (TimescaleDB) y Redis en contenedores Docker gestionados por Plesk
  con bind-mounts dentro del vhost (backups Plesk los cubren).
- Web SPA = build estático Vite en `httpdocs/`. nginx de Plesk sirve estáticos
  y proxya `/api/*`, `/healthz`, `/readyz`, `/docs`, `/openapi.json` a PM2.
- Pipeline: push a `main` → build SPA → SSH a srv07 → `git pull` →
  `pnpm install` → `drizzle-kit migrate` → swap `httpdocs/` →
  `pm2 reload --update-env`. Workflow: `.github/workflows/release.yml`.

> No introduzcas estado local en API/worker que rompa el `pm2 reload`.
> Cualquier estado mutable a Redis o Postgres.

---

## 11. Para el agente IA: protocolo de trabajo

1. **Lee `CONTRIBUTING.md` y este `CLAUDE.md`** antes de tocar código.
2. Si una tarea cruza ≥ 3 contextos, **pregunta o spawnea un plan** antes de
   implementar.
3. **No introduzcas dependencias nuevas** sin justificación; revisa el bundle
   y la licencia (AGPL-compatible).
4. Cambios en API → actualiza spec OpenAPI **en el mismo PR** y regenera SDK.
5. Cambios en UI → verifica mobile (375px) **y** desktop antes de cerrar la
   tarea.
6. Cambios en `domain` → ejecuta `pnpm test:unit` del paquete afectado y de
   `application` (acoplado).
7. Si tu cambio invalida algo de este fichero, **edítalo en el mismo PR**.
8. Nunca uses `git --no-verify`, `--force` a `main`, ni borres ramas ajenas.
9. Idioma: comentarios y docs nuevas en **inglés** (alineado con el código
   existente). El backlog y este CLAUDE.md están en español por preferencia
   del maintainer — no traduzcas el código.

---

## 12. Atajos mentales (cheatsheet)

- ¿Necesito un servicio nuevo? → ¿Es de negocio? `domain`. ¿Coordina? `application`.
  ¿Habla con el mundo? `infrastructure` o `providers/*`.
- ¿Llamo a una API externa? → ¿Tiene `cacheTtl` + `idempotencyWindow`? Si no,
  defínelos.
- ¿Mockeo algo en un test? → ¿Es un puerto? OK. ¿Es interno? Refactoriza.
- ¿Hardcodeo un string visible? → No. i18n.
- ¿Estilo solo desktop? → No. Mobile-first.
- ¿Doy de alta una ruta? → ¿Está en el spec OpenAPI? ¿Validada con Zod?

---

_Última actualización: 2026-05-06. Mantén este archivo vivo._
