# RankPulse — Backlog técnico

Cosas detectadas durante el primer despliegue end-to-end a producción
(srv07.ingenierosweb.co → https://rankpulse.ingenierosweb.co). Algunas las
resolví en el momento, otras quedan pendientes para una iteración de devs.
Marcado al final si es **bloqueante** o **no bloqueante**.

---

## 🔴 Resueltos en caliente durante el primer deploy

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

### 6. BullMQ jobId con ':' en `enqueueOnce`
**Síntoma:** todas las llamadas a `POST /providers/:id/job-definitions/:defId/run-now`
devolvían 500 con `Error: Custom Id cannot contain :`.

**Causa:** mismo bug que el commit aabcfeb del smoke-test, esta vez en
`packages/infrastructure/src/queue/bullmq-job-scheduler.ts:55` —
`jobId: \`manual:${runId}\``. BullMQ usa `:` como separador interno de Redis y
rechaza IDs custom que lo contengan.

**Fix aplicado** en commit `e88603d`: `manual:` → `manual-`.

**Tarea futura:** test de integración en
`packages/infrastructure/src/queue/bullmq-job-scheduler.spec.ts` que ejercite
`enqueueOnce` real contra Redis Testcontainer para que no se escape un tercer
caso del mismo bug.

**Estado:** ✅ resuelto. **No bloqueante.**

---

### 7. `ScheduleEndpointFetch` no valida la shape de `params` contra el endpoint
**Síntoma:** scheduleé 34 fetches con `{phrase, country, language}` y la API los
aceptó con 201. El worker, al procesar, falla con
`Invalid params for serp-google-organic-live: keyword/locationCode/languageCode required`.

**Causa:** `ScheduleEndpointFetchUseCase` guarda `params: Record<string, unknown>`
sin contraste contra el descriptor del endpoint. La validación cae en el worker
en time-of-fetch, demasiado tarde.

**Workaround aplicado:** `UPDATE provider_job_definitions SET params = jsonb_build_object(...)`
para reescribir las 34 filas a la shape correcta.

**Tarea para devs (alta prioridad):**
1. Que cada `EndpointDescriptor` exponga su `paramsSchema` (Zod).
2. `ScheduleEndpointFetchUseCase` valida `params` contra ese schema antes de
   guardar. Si falla, devuelve 400 con los errores Zod.

**Estado:** ✅ workaround. **Bloquea cualquier scheduling vía API.**

---

### 8. `RegisterProviderCredential` no valida el formato del secret
**Síntoma:** registré la credencial DataForSEO con `email:password` (separador
`:`). La API aceptó 201. El worker falla luego con
`DataForSEO credential must be "email|api_password"`.

**Causa:** `RegisterProviderCredentialUseCase` guarda `plaintextSecret` cifrado
sin pedirle al provider que lo valide.

**Workaround aplicado:** registrar una segunda credencial con el separador
correcto y borrar la antigua via SQL.

**Tarea para devs:**
- Cada `Provider` expone `validateCredentialPlaintext(plain: string): Result<void, Error>`.
- `RegisterProviderCredentialUseCase` lo invoca antes de cifrar. Si falla, 400.

**Estado:** ✅ workaround. **Confunde al usuario** (la credencial parece OK
hasta que el primer job falla).

---

### 9. `TrackedKeyword` y `JobDefinition` no se enlazan automáticamente
**Síntoma:** creé los 33 `TrackedKeyword` vía `POST /rank-tracking/keywords` y
luego los 34 `JobDefinition` vía `POST /providers/.../schedule`. El worker
procesó los 34 SERPs OK pero NO grabó NINGUNA `RankingObservation`.

**Causa:** `ProviderFetchProcessor` solo materializa la observación si
`params.trackedKeywordId` está presente. `ScheduleEndpointFetchUseCase` no
sabe nada de tracked keywords — son contextos separados.

**Workaround aplicado:** SQL UPDATE para inyectar `trackedKeywordId` en cada
def matcheando por `(project_id, domain, phrase, country, language)`. Tras
eso, los 34 SERPs siguientes generaron 34 ranking_observations correctas.

**Tarea para devs (alta prioridad):**
- Opción A: que `StartTrackingKeywordUseCase` también cree el JobDefinition
  asociado, con cron por defecto y `trackedKeywordId` ya en params.
- Opción B: nuevo endpoint `POST /rank-tracking/keywords/:id/schedule` que
  envuelva `ScheduleEndpointFetchUseCase` y rellene `trackedKeywordId` solo.

**Estado:** ✅ workaround. **Bug crítico de UX**: scheduling sin
trackedKeywordId gasta API quota sin generar datos visibles.

---

### 10. No hay endpoint para LISTAR / EDITAR / BORRAR JobDefinitions
**Síntoma:** durante el debugging tuve que entrar via SSH + `psql` directamente
a `provider_job_definitions` para reescribir params. La API solo expone POST
para crear, no GET/PUT/DELETE.

**Tarea para devs (alta prioridad — convergente con A8):**
- `GET /projects/:projectId/schedules` para listar todas las definiciones.
- `GET /providers/:id/job-definitions/:defId` para inspeccionar.
- `PATCH /providers/:id/job-definitions/:defId` para actualizar params/cron/enabled.
- `DELETE /providers/:id/job-definitions/:defId` para des-programar.

**Estado:** ❌ pendiente. **Sin esto, cualquier corrección post-mortem requiere
acceso DB directo.**

---

### 11. No hay endpoint API para gestionar Portfolios
**Síntoma:** la entidad `Portfolio` existe en `packages/domain/src/project-management/entities/portfolio.ts`
y tiene su `PortfolioRepository`. `POST /projects` acepta `portfolioId` para
asociar un proyecto. Las credenciales pueden tener `scope.type='portfolio'`.
Pero NO hay endpoints HTTP para crear/listar/editar/borrar portfolios — la
única forma de crearlos hoy es vía SQL directo a la tabla `portfolios`.

**Tarea para devs (alta prioridad):**
- `POST   /organizations/:orgId/portfolios` — crear portfolio (name, slug)
- `GET    /organizations/:orgId/portfolios` — listar
- `GET    /portfolios/:id` — detalle (con count de projects, domains)
- `PATCH  /portfolios/:id` — rename
- `DELETE /portfolios/:id` — borrar (CASCADE a projects o restringir si hay)

**Workaround actual:** `INSERT INTO portfolios ...` por SQL.

**Estado:** ❌ pendiente. **Bloquea modelar la jerarquía
Org → Portfolio → Project que el dominio ya soporta.**

---

### 12. ACL `extractRankingForDomain` solo extrae una posición por SERP
**Contexto del PRD:**
> _every external request is deduplicated across projects, coalesced in-flight,
> persisted, and served from cache when fresh. The same SERP query for ten
> projects = one external API call._

**Realidad actual:** una `SERPLiveResponse` tiene los top-30 dominios, pero el
processor solo extrae la posición del **único** dominio que viene en
`params.domain`. Si un proyecto tiene 5 dominios, hago 5 SERP fetches idénticos
($0.0035 × 5 = $0.0175) cuando técnicamente con UNA llamada podría sacar las 5
posiciones simultáneas ($0.0035 total, **5× más barato**).

**Tarea para devs (alta prioridad — está en el PRD como objetivo):**
1. Fork `extractRankingForDomain` → `extractRankingsForDomains(payload, domains[])`
   que devuelve `Map<domain, SerpRankingExtraction>`.
2. `ProviderFetchProcessor` mira las domain del proyecto (no `params.domain`),
   itera y llama `recordRankingObservationUseCase` por cada domain match.
3. `ScheduleEndpointFetchUseCase`: una sola def por (project, keyword, location, device),
   sin domain en params (el processor lo coge del proyecto).
4. Coalescing/cache: si el mismo (keyword, location, device) ya tiene un fetch
   reciente en otro project, reutilizar la raw_payload + extraer para los
   domains de los dos proyectos.

**Estado:** ❌ pendiente. **Hoy gastamos N× lo necesario en DataForSEO.**

---

### 13. UI no soporta el concepto de Portfolio
**Síntoma:** la nav del SPA tiene `Proyectos | Credenciales` pero no
`Portfolios`. Cuando se cierre el item 11 (API), la UI también necesita:
- Un selector de portfolio en el header (cambiar de "PatrolTech" a "RocStatus").
- Un breadcrumb `Org / Portfolio / Project`.
- En `ProjectsPage`: agrupar por portfolio o filtrar.

**Estado:** ❌ pendiente.

---

### 14. No hay manejo de DataForSEO 402 (saldo insuficiente)
**Síntoma:** tras gastar el crédito gratis de $1 (≈285 SERPs), DataForSEO
empieza a devolver HTTP 402. El worker registra el error en
`provider_job_runs.error_message` pero:
- No deshabilita el JobDefinition automáticamente (sigue intentando en cada cron tick).
- No notifica al operador (no hay alert).
- BullMQ reintenta el job según su política, gastando recursos.

**Tarea para devs:**
1. ProviderFetchProcessor distingue 402 del resto y marca la credencial
   como `quota_exceeded` (nuevo estado en provider_credentials).
2. Si todas las credenciales del provider están en quota_exceeded, los
   JobDefinitions se pausan automáticamente y se publica un evento
   `ProviderQuotaExceeded` que dispara una alerta (email/webhook).
3. UI muestra el balance actual de DataForSEO (endpoint `/v3/appendix/user_data`)
   en la página de credenciales.

**Estado:** ❌ pendiente. **Deuda crítica de operaciones** — sin esto, una
campaña agresiva agota el saldo silenciosamente.

---

### 15. SERP fetch redundante por proyecto: 1 SERP por (project, dom, kw, location)
**Contexto:** ya documentado parcialmente como item 12 (ACL una sola posición),
pero merece un item propio porque tras la migración a Portfolio→Project quedó
patente: la org tiene 7 proyectos, cada uno con N domains. PatrolTech ES con
5 dominios + 7 keywords genera 35 SERPs idénticas (la misma query, mismas
top-30 URLs). Coste: $0.1225 por refresh × 4 mercados PatrolTech ≈ $0.50/refresh.

**Si el ACL extrajera para varios dominios en una pasada** (item 12), serían
7 SERPs × 4 mercados = $0.098. **5× más barato**.

**Estado:** convergente con 12. Documentado por separado para resaltar el
impacto económico real medido tras agotar el saldo.

---

## 🔴 Gaps de UI (alta prioridad — bloquean el uso self-service del panel)

Detectados al hacer el bootstrap de la org PatrolTech con 11 proyectos. La API
soporta todos estos flujos, pero la SPA aún no los expone — requiriendo
scripting via `curl`/SDK para cualquier setup más allá de "registrarse y crear
un proyecto vacío".

### A1. Añadir competidor a un proyecto
- **API:** `POST /projects/:id/competitors`
- **SDK:** `api.projects.addCompetitor(...)` ya existe.
- **Falta:** botón "Add competitor" + formulario en `project-detail.page.tsx`
  (al lado de la lista que ya pinta).
- **Workaround actual:** vía API.

### A2. Importar lista de keywords (bulk)
- **API:** `POST /projects/:id/keywords` (acepta hasta 2000 phrases en un POST)
- **SDK:** `api.projects.importKeywords(...)` existe.
- **Falta:** un drawer en `project-detail.page.tsx` con textarea que parsee
  una keyword por línea (con tags opcionales tipo `keyword #ES #core`).
- **Workaround actual:** vía API.

### A3. Programar fetch SERP recurrente
- **API:** `POST /providers/:id/endpoints/:eid/schedule`
- **SDK:** `api.providers.schedule(...)` existe.
- **Falta:** UI para configurar cron + params por (proyecto, keyword).
  Idealmente, tras hacer track-keyword desde la UI, el form preguntase
  "¿programar fetch semanal? sí/no" y lo creara automáticamente.
- **Workaround actual:** vía API. Sin UI, los schedules son invisibles para
  el operador y no se pueden pausar/des-schedule.

### A4. Disparar un fetch one-off (manual)
- **API:** **NO EXISTE** endpoint para esto. La única forma de trigger es
  esperar al cron de un schedule existente (mín. 1 minuto si se usa `* * * * *`).
- **Falta:** `POST /providers/:id/endpoints/:eid/run-now` que llame a
  `JobScheduler.enqueueOnce(definition, runId)` (el método ya existe en el
  adapter BullMQ, solo falta exponerlo).
  Luego un botón "Run now" en cada keyword/schedule.
- **Workaround actual:** ninguno limpio. Para el bootstrap inicial usé
  schedules con cron weekly que NO se ejecutan hasta el siguiente lunes 06:00
  UTC — los datos no aparecen hasta entonces.

### A5. Añadir domain o location extra a un proyecto
- **API:** `POST /projects/:id/domains` y `/projects/:id/locations`
- **SDK:** ambos existen.
- **Falta:** botones "+ Add domain" / "+ Add location" en `project-detail.page.tsx`.
- **Workaround actual:** crear el proyecto con todo de inicio, o vía API.

### A6. GSC property linking + performance viewer
- **API:** `POST /gsc/properties`, `GET /gsc/projects/:id/properties`,
  `GET /gsc/properties/:id/performance`
- **Falta:** páginas `gsc-properties.page.tsx` y `gsc-performance.page.tsx`.
- **Workaround actual:** GSC no operativo en absoluto vía UI.

### A7. Histórico de keyword (chart)
- **API:** `GET /rank-tracking/keywords/:id/history`
- **Falta:** clic en una fila de rankings → drawer/página con line chart
  mostrando `position` vs `observedAt` (recharts ya está disponible para web,
  está en otros proyectos del stack).

### A8. Vista de schedules y job runs
- **API:** falta — solo hay POST schedule, no GET/DELETE.
- **Falta:** todo. Sin esto el operador no sabe qué fetches están programados
  ni sus runs pasados.

### A9. Bootstrap UX: po