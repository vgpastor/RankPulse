# RankPulse — Backlog técnico

Cosas detectadas durante el primer despliegue end-to-end a producción
(srv07.ingenierosweb.co → https://rankpulse.ingenierosweb.co). Algunas las
resolví en el momento, otras quedan pendientes para una iteración de devs.
Marcado al final si es **bloqueante** o **no bloqueante**.

---

## ✅ Resueltos en caliente durante el primer deploy (items 1-5)

### 1. Dockerfiles referenciaban paquetes inexistentes
**Síntoma:** El primer build de GHA falló con
`failed to calculate checksum: "/packages/config-typescript/package.json": not found`.

**Causa:** Los tres `docker/{api,worker,web}.Dockerfile` tenían entradas `COPY`
para `packages/config-typescript` y `packages/config-biome`, paquetes que
nunca llegaron a existir en el monorepo (probablemente planeados pero no
implementados — `packages/` solo tiene `application, contracts, domain,
infrastructure, providers, sdk, shared, testing, ui`).

**Fix aplicado** en commit `9d48132`:
```
fix(docker): drop COPY refs to non-existent config-typescript/config-biome packages
```

**Tarea futura para devs:** decidir si esos paquetes se van a crear de verdad
(p.ej. para extraer `tsconfig.base.json` y `biome.json` a paquetes
reutilizables) y, si sí, reañadir las líneas a los Dockerfiles. Si no, dejar
los Dockerfiles como están.

**Estado:** ✅ resuelto. **No bloqueante.**

---

### 2. `vhost_nginx.conf` de Plesk no se incluía
**Síntoma:** Plesk crea un fichero
`/var/www/vhosts/system/<DOMAIN>/conf/vhost_nginx.conf` para directivas
custom, pero la plantilla por defecto sólo lo incluye cuando la propiedad
`physicalHosting->customNginxConfigFile` está poblada — y esa propiedad sólo
se popula al guardar las directivas vía panel UI o REST API
(`/api/v2/domains/{id}/web-server-settings`), que requiere credenciales de
admin que no tenía a mano.

**Fix aplicado** (en el servidor, no en el repo):
- Custom template Plesk en
  `/usr/local/psa/admin/conf/templates/custom/domain/nginxDomainVirtualHost.php`
- Patchea la condición original para que, si no hay `customNginxConfigFile`
  configurado vía panel, caiga al fichero por convención
  `/var/www/vhosts/system/<DOMAIN>/conf/vhost_nginx.conf` cuando exista.
- Sentinel `RANKPULSE-CUSTOM-MARKER` para detectar reaplicación.

**Tarea futura para devs:** documentar este fichero en el README de
infraestructura. Si Plesk se reinstala o actualiza el template default, hay
que reaplicar el patch (es idempotente).

**Estado:** ✅ resuelto. **No bloqueante.**

---

### 3. Compose original en `/opt/RankPulse/docker-compose.yml` era obsoleto
**Síntoma:** El compose original creado al bootstrap del servidor apuntaba a
una imagen `ghcr.io/vgpastor/rankpulse:latest` monolítica (no existía), usaba
`postgres:17-alpine` (no TimescaleDB, requerido), y no tenía Redis. No
encajaba con la arquitectura real (api / worker / web separados).

**Fix aplicado** en commit `a2ad131`: nuevo `docker-compose.prod.yml` con la
arquitectura real (timescaledb-ha:pg16 + redis + api + worker + web +
migrate one-shot), tira de imágenes `ghcr.io/vgpastor/rankpulse-{api,worker,web}`,
y bind a `127.0.0.1` en lugar de `0.0.0.0`.

**Estado:** ✅ resuelto. **No bloqueante.**

---

### 4. Bundle hash colision entre builds con distinto `VITE_API_BASE_URL`
**Síntoma:** El primer despliegue en producción funcionó. Tras un cambio de la
GitHub variable `PUBLIC_API_BASE_URL` (rebuild → distinto contenido), el
nuevo bundle se sirvió bajo el **mismo filename hashed** que el anterior
(`index-BJUOfFdE.js`). Como nginx envía `Cache-Control: max-age=31536000,
immutable` para `/assets/*`, los navegadores que ya habían cacheado la
versión vieja no volvieron a pedirla — y como el contenido del filename era
distinto (con la URL incorrecta), las llamadas iban a
`https://.../api/v1/api/v1/auth/login` y devolvían 404 → la SPA mostraba
"Email o contraseña inválidos".

El problema raíz: **Vite hashea el chunk basándose en su contenido, pero la
sustitución de `import.meta.env.VITE_API_BASE_URL` ocurre antes del hashing**;
sin embargo, en algún punto del flujo (cache de Buildx con `cache-from gha`
+ `mode=max`) el hash terminó siendo el mismo aun con contenido distinto.

**Workaround inmediato:** hard refresh (Ctrl+Shift+R) o ventana incógnito.

**Tarea para devs (importante):**
1. Cambiar `apps/web/vite.config.ts` para incluir un sufijo de versión por
   build:
   ```ts
   build: {
     rollupOptions: {
       output: {
         entryFileNames: `assets/[name]-${process.env.BUILD_VERSION ?? '[hash]'}.js`,
         chunkFileNames: `assets/[name]-${process.env.BUILD_VERSION ?? '[hash]'}.js`,
         assetFileNames: `assets/[name]-${process.env.BUILD_VERSION ?? '[hash]'}.[ext]`,
       },
     },
   },
   ```
   Y exportar `BUILD_VERSION=${{ github.sha }}` en el step de build de
   `release.yml`. Así cada commit produce un filename único garantizado.
2. **Alternativa más segura:** servir `/index.html` con
   `Cache-Control: no-cache` (Plesk → "Apache & nginx Settings" →
   additional directives). El HTML siempre se re-pide, los assets cacheados
   son seguros porque el HTML referencia la versión correcta.

**Estado:** ✅ producción tiene el bundle correcto; aplica para evitar la
trampa la próxima vez. **No bloqueante** ahora pero alta prioridad antes del
siguiente cambio de env var.

---

### 5. ACME `No order found for account ID` en Let's Encrypt
**Síntoma:** Plesk LE CLI fallaba con
`Type: urn:ietf:params:acme:error:malformed Status: 404 Detail: No order found for account ID …`
incluso después de borrar accounts.

**Fix aplicado:** purgar todo el estado del módulo
(`rm -rf /usr/local/psa/var/modules/letsencrypt/{etc,orders,registrations}/*`
+ borrar `letsencrypt.sqlite3`). Reintentar funcionó.

**Tarea futura para devs:** documentar el procedimiento de "reset LE state"
en runbook de operaciones. La causa fundamental fue una orden ACME huérfana
en la BD de Plesk; podría volver a pasar tras un downtime largo o una
manipulación del módulo.

**Estado:** ✅ resuelto. Cert R13 válido hasta 2026-08-02. **No bloqueante.**

---

## ✅ Resueltos en sprints posteriores (items 6-10)

Cerrados por los PRs #11 (`e244776` — pre-persist validation + CRUD job-defs)
y #12 (`d5e55f2` — test BullMQ + opción A auto-schedule + UI A1-A8).

### 6. BullMQ jobId con ':' en `enqueueOnce`
**Síntoma:** todas las llamadas a `POST /providers/:id/job-definitions/:defId/run-now`
devolvían 500 con `Error: Custom Id cannot contain :`.

**Causa:** mismo bug que el commit aabcfeb del smoke-test, esta vez en
`packages/infrastructure/src/queue/bullmq-job-scheduler.ts:55` —
`jobId: \`manual:${runId}\``. BullMQ usa `:` como separador interno de Redis y
rechaza IDs custom que lo contengan.

**Fix aplicado** en commit `e88603d`: `manual:` → `manual-`.

**Test de regresión añadido:** `packages/infrastructure/src/queue/bullmq-job-scheduler.spec.ts`
mockea `bullmq.Queue` y verifica que (1) los nombres de cola usan `-` no `:`,
(2) `enqueueOnce` siempre genera `jobId: "manual-<runId>"` y nunca contiene
`:`, (3) `register` instala el repeatable con el cron pattern correcto, (4)
`register` sobre una definición disabled cae en unregister, (5) la Queue se
cachea por providerId. Más rápido que arrastrar testcontainers para una sola
comprobación de formato.

**Estado:** ✅ resuelto + test de regresión.

---

### 7. `ScheduleEndpointFetch` no valida la shape de `params` contra el endpoint
**Síntoma:** scheduleé 34 fetches con `{phrase, country, language}` y la API los
aceptó con 201. El worker, al procesar, falla con
`Invalid params for serp-google-organic-live: keyword/locationCode/languageCode required`.

**Causa:** `ScheduleEndpointFetchUseCase` guarda `params: Record<string, unknown>`
sin contraste contra el descriptor del endpoint. La validación cae en el worker
en time-of-fetch, demasiado tarde.

**Fix aplicado:** `ScheduleEndpointFetchUseCase` recibe ahora un
`EndpointParamsValidator` (puerto sobre `ProviderRegistry.endpoint().paramsSchema`)
y valida los `params` antes de persistir; si fallan, lanza `InvalidInputError`
(→ 400). Como el `safeParse` strippea claves desconocidas, los campos
inyectados por el sistema (`organizationId`, `trackedKeywordId`) viajan ahora
en `cmd.systemParams` y se mergean tras la validación.

**Estado:** ✅ resuelto.

---

### 8. `RegisterProviderCredential` no valida el formato del secret
**Síntoma:** registré la credencial DataForSEO con `email:password` (separador
`:`). La API aceptó 201. El worker falla luego con
`DataForSEO credential must be "email|api_password"`.

**Causa:** `RegisterProviderCredentialUseCase` guarda `plaintextSecret` cifrado
sin pedirle al provider que lo valide.

**Fix aplicado:** la interfaz `Provider` ahora expone
`validateCredentialPlaintext(plain: string): void` (lanza `InvalidInputError`
si el formato no encaja). DataForSEO delega en `parseCredential`, GSC en
`parseServiceAccount`. `RegisterProviderCredentialUseCase` recibe un
`CredentialFormatValidator` (puerto sobre `ProviderRegistry`) y lo invoca
antes de cifrar — credenciales mal formadas fallan en POST con 400 en lugar
de quemarse en el worker en el primer fetch.

**Estado:** ✅ resuelto.

---

### 9. `TrackedKeyword` y `JobDefinition` no se enlazan automáticamente
**Síntoma:** creé los 33 `TrackedKeyword` vía `POST /rank-tracking/keywords` y
luego los 34 `JobDefinition` vía `POST /providers/.../schedule`. El worker
procesó los 34 SERPs OK pero NO grabó NINGUNA `RankingObservation`.

**Causa:** `ProviderFetchProcessor` solo materializa la observación si
`params.trackedKeywordId` está presente. `ScheduleEndpointFetchUseCase` no
sabe nada de tracked keywords — son contextos separados.

**Fix aplicado (opción B):** `ScheduleEndpointRequest` admite un
`trackedKeywordId` opcional. El controller lo añade a `systemParams`, que el
use case mergea tras la validación. Con el campo presente, el processor
materializará la `RankingObservation` correspondiente.

**Fix aplicado (opción A):** `StartTrackingKeywordRequest` admite un
`autoSchedule` opcional `{ providerId, endpointId, cron, params,
credentialOverrideId? }`. Cuando viene en el cuerpo, el `RankTrackingController`
ejecuta `StartTrackingKeyword` y, en el mismo handler, encadena
`ScheduleEndpointFetch` con `systemParams.trackedKeywordId` ya inyectado. La
respuesta devuelve ambos ids: `{ trackedKeywordId, scheduledDefinitionId }`.
Las dos operaciones NO son transaccionales — son contextos distintos; en un
fallo parcial el caller puede fallback a `POST /providers/.../schedule`
explícito.

**Estado:** ✅ resuelto (opciones A + B).

---

### 10. No hay endpoint para LISTAR / EDITAR / BORRAR JobDefinitions
**Síntoma:** durante el debugging tuve que entrar via SSH + `psql` directamente
a `provider_job_definitions` para reescribir params. La API solo expone POST
para crear, no GET/PUT/DELETE.

**Fix aplicado:** cuatro endpoints nuevos en `ProvidersController` (con
chequeo de pertenencia al proyecto/org reutilizando un helper
`loadDefinitionAndAuthorize`):
- `GET /providers/job-definitions/by-project/:projectId` — lista.
- `GET /providers/:providerId/job-definitions/:defId` — inspeccionar.
- `PATCH /providers/:providerId/job-definitions/:defId` — actualizar
  `cron` / `params` / `enabled` (re-registra el repeatable en BullMQ con el
  nuevo patrón).
- `DELETE /providers/:providerId/job-definitions/:defId` — des-programar
  (unregister + delete row).

Use cases en `manage-job-definition.use-cases.ts`. SDK actualizado con los
métodos `listJobDefinitions / getJobDefinition / updateJobDefinition /
deleteJobDefinition / runJobDefinitionNow`.

**Estado:** ✅ resuelto a nivel API/SDK.

---

## ✅ Resueltos (items 11-15)

Cerrados por la PR `feat/close-backlog-items-11-25`. Cambios de modelo /
infra resueltos en una sola PR para acelerar.

### 11. No hay endpoint API para gestionar Portfolios — ✅ resuelto
**Síntoma original:** la entidad `Portfolio` existe en el dominio, pero la
única forma de crear filas era SQL directo.

**Fix aplicado:** 5 endpoints expuestos por el nuevo `PortfoliosController`:
- `POST /organizations/:orgId/portfolios` — crea (validación ≥2 chars).
- `GET /organizations/:orgId/portfolios` — lista con `projectCount`.
- `GET /portfolios/:id` — detalle.
- `PATCH /portfolios/:id` — rename (use case `RenamePortfolioUseCase`,
  método `Portfolio.rename`).
- `DELETE /portfolios/:id` — borra (rechaza con 409 si quedan projects
  asociados; nunca silenciamos un NULL).

Use cases en `manage-portfolios.use-cases.ts` (10 unit tests cubriendo
happy paths, NotFound, conflict, validación). `PortfolioRepository`
gana `delete()` y `countProjects()`. Drizzle impl + in-memory testing
repo + SDK (`api.projects.{create,list,get,rename,delete}Portfolio`) +
OpenAPI spec.

**Estado:** ✅ resuelto API + SDK.

---

### 12. ACL `extractRankingForDomain` solo extrae una posición por SERP — ✅ ACL resuelto
**Síntoma original:** N domains del proyecto = N llamadas a DataForSEO
($0.0035 × N) cuando técnicamente UNA llamada cubre los N.

**Fix aplicado (paso 1 — el ACL ya soporta multi-domain):** nueva función
`extractRankingsForDomains(payload, domains[]): Map<string, SerpRankingExtraction>`
en `serp-to-ranking.acl.ts`. Hace UN solo pase por los items del SERP y
rellena el match para cada domain target en O(items × domains). Las
features se calculan una sola vez (describen el SERP, no el dominio).
4 specs nuevos cubren la nueva firma + el caso "domain ausente devuelve
null pero la key existe en el Map". `extractRankingForDomain` se
reimplementa en términos del nuevo (back-compat zero).

**Pendiente (paso 2 — processor + scheduler refactor):** `ProviderFetchProcessor`
sigue extrayendo solo `params.domain`. La migración requiere:
1. `ScheduleEndpointFetchUseCase` deja de aceptar `domain` en params.
2. `ProviderFetchProcessor` carga `project.domains` y llama
   `recordRankingObservationUseCase` por cada match.
3. Migrar las 34 JobDefinitions existentes para quitar `params.domain`.

Es un cambio que toca jobs en producción (rebajar params en filas vivas) y
preferí hacerlo en su propia PR donde el plan de migración pueda revisarse
con calma.

**Estado:** ✅ ACL multi-domain landed (gana inmediatamente: cualquier futuro
caller puede usarlo). Processor migration ❌ pendiente — issue #15 cubre el
impacto económico.

---

### 13. UI no soporta el concepto de Portfolio — ✅ resuelto
**Fix aplicado:**
- Nueva entrada "Portfolios" en la nav del `AppShell`.
- Página `/portfolios` (`PortfoliosPage`) con DataTable: nombre, org,
  projectCount badge, fecha de creación, acción Delete (con Modal de
  confirmación + manejo del 409 cuando hay projects asociados).
- Drawer `CreatePortfolioDrawer`: select de organizations basado en
  `me.memberships` (solo orgs donde el user pertenece) + name input.
- Mobile-first siguiendo el patrón ya establecido por A1-A8 (Drawer
  bottom-sheet, DataTable cards-en-mobile, Modal centrado).

**Pendiente (no bloqueante, mejora UX):** breadcrumb `Org / Portfolio /
Project` en project-detail y agrupar/filtrar por portfolio en
ProjectsPage. La gestión CRUD ya está; estos son mejoras estéticas.

**Estado:** ✅ resuelto en lo esencial.

---

### 14. No hay manejo de DataForSEO 402 (saldo insuficiente) — ✅ auto-pause + log resuelto
**Fix aplicado:** `ProviderFetchProcessor` ahora reconoce `DataForSeoApiError`
y `GscApiError` con `status === 402` (helper `isQuotaExhaustedError`). Cuando
ocurren:
- `definition.disable()` se llama y se persiste — el siguiente cron tick
  cae en el branch `if (!definition.enabled) skip`.
- El run se marca `failed` con `code: 'QUOTA_EXCEEDED', retryable: false`
  (BullMQ no reintenta).
- Se loguea un `warn` con instrucción al operador: "top up credit and
  re-enable from the UI".

El operador ve la def "paused" en `/projects/$id/schedules` (UI A8 ya
existe) y puede reactivar con el toggle del EditScheduleDrawer una vez
recargado el saldo.

**Pendiente (no bloqueante, mejora):** `quota_exceeded` como estado del
agregado `ProviderCredential` + dashboard de balance vía
`/v3/appendix/user_data`. Implica nueva migración del schema
`provider_credentials`; lo dejo en su propia PR para revisar el modelo de
datos con calma. Por ahora, el problema operacional crítico (parar el
sangrado) ya está cubierto.

**Estado:** ✅ resuelto en lo crítico.

---

### 15. SERP fetch redundante por proyecto: 1 SERP por (project, dom, kw, location)
**Estado:** convergente con #12. El ACL ya hace multi-domain en una pasada
(landed en esta PR); el ahorro económico real (5× menos llamadas a
DataForSEO) requiere completar el paso 2 del item 12 (processor refactor).

Hasta que ese paso land, este item permanece como recordatorio del impacto
económico medido. **Documentado.**

---

## 🟡 Deuda técnica / pendiente devs (mayoría resuelta en esta PR)

Mayoría cerrada por la PR `feat/close-backlog-items-11-25`. Los items que
quedan ❌ requieren acceso al server (#19, #25) o son refactors de scope
mayor que merecen su propia PR (#16). El resto está ✅ landed.

### 16. Runtime via `tsx` en producción (deuda técnica conocida) — ❌ deferido a PR propia
Pasar a multi-stage exige también que CADA workspace package (`packages/*`)
exporte desde `dist/` en lugar de `src/`, lo que toca su `main`,
`types`, `tsconfig.json` y `package.json#scripts.build` por paquete (10
paquetes). Es una refactor mecánica pero amplia que multiplica el blast
radius de esta PR sin retorno operativo inmediato (el arranque actual
funciona, solo es 1-2s más lento).

**Plan:** PR dedicada `chore/multistage-dockerfiles` que cambie los 10
package.json + tsconfigs + Dockerfiles a la vez, con un solo objetivo y
un test de smoke claro (curl /healthz post-build).

**Estado:** ❌ pendiente, **deferido a PR propia** por scope.

---

### 17. CI/release usando Node 20 — deprecación junio 2026 — ✅ resuelto
**Fix aplicado:** `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24: 'true'` añadido al
nivel de workflow en `ci.yml`, lo que pre-empt fuerza Node 24 en todas las
JS-actions. Las versiones actuales (`actions/checkout@v4`, `setup-node@v4`,
`cache@v4`, `docker/*-action@v3/v6`, `appleboy/ssh-action@v1.2.0`) ya son
compatibles con Node 24 — el flag solo desbloquea su uso.

**Estado:** ✅ resuelto.

---

### 18. CI no ejecuta `docker compose build` — ✅ resuelto
**Fix aplicado:** nuevo job `docker-build` en `.github/workflows/ci.yml`
con matrix por app (api, worker, web). Cada uno corre `docker/build-push-action@v6`
con `push: false` y caché GHA `scope=ci-<app>` independiente del scope
de `release.yml` para no contaminar la cache de producción. Bugs como
el `config-typescript` (item 1) ahora bloquean la PR antes del merge.

**Estado:** ✅ resuelto.

---

### 19. Despliegue via SSH como `root` — ❌ requiere acceso al server (no fixable desde código)
**Estado:** ❌ **pendiente — solo el operador puede ejecutar este cambio**.
Pasos exactos documentados arriba (crear `rankpulse-deploy`, rotar SSH key,
actualizar secret); no hay nada que cambiar en el repo (las GitHub Secrets
no se versionan).

---

### 20. GHCR retention policy — ✅ resuelto
**Fix aplicado:** nuevo workflow `.github/workflows/ghcr-retention.yml`
ejecutándose cron `'0 3 * * 1'` (lunes 03:00 UTC) y on-demand
(`workflow_dispatch` con flag `dry_run`). Matrix sobre las 3 imágenes
(rankpulse-{api,worker,web}); por cada una mantiene `min-versions-to-keep:
10`, ignora `latest|main` (siempre se preservan), y borra el resto. Permission
`packages: write` y nada más.

**Estado:** ✅ resuelto.

---

### 21. Worker no expone `/readyz` — ✅ resuelto
**Fix aplicado:** nuevo `apps/worker/src/health-server.ts` — `http.createServer`
de 30 líneas, sin Nest. Dos endpoints:
- `GET /healthz` — 200 si el proceso está vivo (para docker compose
  healthchecks).
- `GET /readyz` — 200 sólo si `SELECT 1` contra Postgres + `PING` a Redis +
  `worker.isRunning() && !isPaused()` para CADA worker BullMQ. 503 con
  `{ ok: false, checks: { postgres, redis, workers } }` si algo falla.

Inyección por callbacks (`pingPostgres`, `pingRedis`) — el server no
conoce drizzle ni ioredis. Configurable via `HEALTH_PORT` (default 3300,
0 para desactivar) + `HEALTH_HOST`. Wired en `main.ts` con apagado
ordenado en SIGTERM/SIGINT.

**Estado:** ✅ resuelto.

---

### 22. `CORS_ORIGINS` solo permite `https://rankpulse.ingenierosweb.co` — ✅ resuelto
**Fix aplicado:** `CORS_ORIGINS` parsea la lista comma-separated en `env.ts`,
trim por entrada, drop de empties, valida que cada uno sea URL absoluta vía
Zod (`.pipe(z.array(z.string().url()))`). El `main.ts` aplica `enableCors`
solo cuando hay ≥1 origen — `CORS_ORIGINS=` vacío deja CORS desactivado
por defecto (single-origin same-domain setups).

**Estado:** ✅ resuelto.

---

### 23. NestJS Throttler demasiado agresivo para operaciones bulk legítimas — ✅ resuelto
**Fix aplicado:**
1. Default throttle bumpeado de 240/min → **600/min** (10/s, suficiente para
   un usuario humano polleando dashboards).
2. Nuevo throttle nombrado `bulk` con **6_000/min** (100/s).
3. `@Throttle({ bulk: { ttl: 60_000, limit: 6_000 } })` aplicado a:
   - `POST /projects/:id/competitors`
   - `POST /projects/:id/keywords`
   - `POST /rank-tracking/keywords`
   - `POST /providers/:providerId/endpoints/:endpointId/schedule`
   Estos endpoints siguen detrás del JwtAuthGuard — sólo se relaja el rate,
   no la autorización.

**Estado:** ✅ resuelto.

---

### 24. Mensaje de error confuso al añadir un dominio ya adjuntado a OTRO proyecto — ✅ resuelto
**Fix aplicado:**
1. `Project.addDomain` (dominio) sigue siendo el guardián de la invariante
   intra-aggregate y ahora dice "already attached to **this** project".
2. Nuevo método de port `ProjectRepository.findByDomainInOrganization()` +
   impl en Drizzle (chequea `primaryDomain` + tabla `projectDomains` en una
   sola pasada UNION-style) + impl en in-memory testing repo.
3. `AddDomainToProjectUseCase` lo llama ANTES del `addDomain`; si encuentra
   un owner distinto al project actual, lanza
   `ConflictError("Domain X is already attached to project 'Y' (id) in this
   organization")`. Pre-empt antes de chocar contra la unique cross-project.
4. Spec original actualizado (este project) + spec nuevo (cross-project)
   verifican el mensaje exacto.

**Pendiente (decisión de producto):** si quisiéramos PERMITIR mismo
dominio en N proyectos del mismo org (caso "hub domain"), habría que
quitar la unique constraint cross-project. El fix actual mantiene la
constraint pero la diagnostica claro — partiendo de ahí el cambio futuro
es trivial (drop constraint + drop el lookup).

**Estado:** ✅ resuelto.

---

### 25. Patch de Plesk template — ❌ requiere acceso al server (no fixable desde código)
**Estado:** ❌ **pendiente — vive en el server, no en el repo**. El cron de
monitorización propuesto se podría montar como systemd timer en srv07; se
documenta arriba el procedimiento.

---

## 🟢 Pendiente del usuario (Víctor) — no devs

- **GSC service account JSON.** Subir a
  `/var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/app/config/gsc-service-account.json`
  el JSON de `claude-access@ingenierosweb.iam.gserviceaccount.com` para
  activar el provider GSC.
- **SMTP.** Si quieres alertas por email, rellenar `SMTP_*` en `.env.local`
  y reiniciar el stack.
- **Backup de Postgres.** No hay todavía. Cuando empiece a haber datos
  reales, montar un cron que `pg_dump` a un volumen externo + Cloudflare R2.
- **Recargar saldo DataForSEO.** El crédito de $1 gratis está agotado tras
  los 181 SERPs del bootstrap. Mínimo $50 (≈11 meses al ritmo actual).
- **DataForSEO Backlinks API ($100/mo).** Excluida del v1 — GSC referring
  domains + Ahrefs Free DR cubren el caso.

---

## 🔴 Gaps de UI (alta prioridad — bloquean el uso self-service del panel)

Detectados al hacer el bootstrap de la org PatrolTech con 11 proyectos. La API
soporta todos estos flujos, pero la SPA aún no los expone — requiriendo
scripting via `curl`/SDK para cualquier setup más allá de "registrarse y crear
un proyecto vacío".

Todos los gaps siguientes resueltos en una segunda PR sobre `feat/close-remaining-backlog`.
Patrones compartidos: atomic design (atoms en `packages/ui/src/atoms`, molecules en
`packages/ui/src/molecules`, organisms drawer-form en `apps/web/src/components`),
mobile-first (Drawer es bottom sheet bajo `md`, side panel `md+`; DataTable
collapsa a tarjetas apiladas en mobile), TanStack Query para fetching/cache,
Zod contracts → SDK → UI sin duplicar tipos.

### A1. Añadir competidor a un proyecto — ✅ resuelto
- `AddCompetitorDrawer` (organism) en `apps/web/src/components`.
- Lanzado desde el header de la card de competidores en `project-detail.page.tsx`
  (botón "+ Add" en cada card; estados vacíos también muestran CTA).
- Invalida `['project', id, 'competitors']` al éxito.

### A2. Importar lista de keywords (bulk) — ✅ resuelto
- `ImportKeywordsDrawer` con textarea monospace (font-mono).
- Parser inline: una keyword por línea, `#TAG` opcional. Cap 2000 phrases por
  POST (validado client-side antes de enviar para evitar el round-trip).

### A3. Programar fetch SERP recurrente — ✅ resuelto
- `ScheduleFetchDrawer`: select de provider + select de endpoint (autoload
  vía `api.providers.list()`), cron input prefijado con `defaultCron` del
  endpoint, textarea JSON de params con plantilla por endpoint.
- Disponible desde la página `/projects/$id/schedules` ("New schedule").

### A4. Disparar un fetch one-off (manual) — ✅ resuelto
- Botón `Play` en cada fila de la tabla de schedules. Llama a
  `api.providers.runJobDefinitionNow` y muestra un banner de éxito/error.

### A5. Añadir domain o location extra a un proyecto — ✅ resuelto
- `AddDomainDrawer` (con select main/subdomain/alias) y `AddLocationDrawer`
  (country ISO + language BCP-47), ambos en project-detail.

### A6. GSC property linking + performance viewer — ✅ resuelto
- Página `/projects/$id/gsc` lista las properties ligadas con DataTable;
  drawer `LinkGscPropertyDrawer` para añadir nuevas (URL_PREFIX o DOMAIN).
- Página `/projects/$id/gsc/$propertyId` con métricas agregadas (clicks,
  impressions, CTR, avg position) y line chart dual-axis (clicks vs
  impressions) usando `recharts` (recién añadido como dep de web).

### A7. Histórico de keyword (chart) — ✅ resuelto
- Filas de la tabla de rankings clickeables → `KeywordHistoryDrawer` con
  line chart de posición vs tiempo. Eje Y invertido (#1 arriba). Línea
  punteada en y=10 marcando el límite "page 1".

### A8. Vista de schedules y job runs — ✅ resuelto
- **API job runs:** `GET /providers/:providerId/job-definitions/:defId/runs`
  añadido (use case `ListJobRunsUseCase` + 3 specs). SDK:
  `api.providers.listJobRuns(...)`.
- **UI:** página `/projects/$id/schedules` con `DataTable` (Endpoint, Cron,
  Status, Last run, Actions). Acciones por fila: Run now, History (abre
  `ScheduleRunsDrawer` con auto-refresh de 5s), Edit (abre
  `EditScheduleDrawer` con cron/params/enabled), Delete (modal de
  confirmación). Botón "+ New schedule" en la cabecera.

### A9. Bootstrap UX: post-registro debería pedir credenciales primero
- **Hoy:** registras, te metes en /projects, ves vacío con un botón "+ Nuevo
  proyecto". Si añades proyectos sin credenciales, ningún fetch funciona.
- **Mejor:** asistente que tras registro pida (1) credencial DataForSEO,
  (2) primer proyecto, (3) primer keyword tracked + schedule. Todo en una
  ventana modal.
