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