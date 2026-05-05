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

## ❌ Pendiente arquitectura/producto (items 11-15)

Cambios de modelo/infra que no son deuda técnica menor: requieren
decisiones de arquitectura y suelen tener impacto económico.

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

## 🟡 Deuda técnica / pendiente devs (no bloqueante para uso normal)

Restauro los items que originalmente venían en el primer commit de BACKLOG
(635c514) y se perdieron en reescrituras posteriores, más algunos
descubrimientos nuevos.

### 16. Runtime via `tsx` en producción (deuda técnica conocida)
Los Dockerfiles usan `tsx` (transpilación on-the-fly) en lugar de un build
TypeScript a `dist/`. Funciona, pero:
- Penaliza arranque (~1-2s extra de transpile).
- Aumenta tamaño de imagen (~30-50 MB de devDependencies).
- Posible fricción con `@nestjs/swagger` y `design:paramtypes` (ya hay un
  workaround try/catch en `apps/api/src/main.ts`).

**Tarea:** introducir multi-stage build en cada Dockerfile (build → tsc → runtime
con `--prod` install). Cuando esté listo, simplificar el try/catch alrededor de
`SwaggerModule.createDocument` en `main.ts`.

**Estado:** ❌ pendiente. **No bloqueante.**

---

### 17. CI/release usando Node 20 — deprecación junio 2026
GHA muestra warning: las actions están en Node 20 y Anthropic forzará Node 24
por defecto en junio 2026. Removidas en septiembre 2026.

**Tarea:** bumpar `actions/checkout`, `actions/setup-node`, `actions/cache`,
`docker/setup-buildx-action`, `docker/login-action`, `docker/build-push-action`,
`appleboy/ssh-action` a versiones que soporten Node 24. Setear
`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` mientras tanto si queremos
pre-empt.

**Estado:** ❌ **no bloqueante hasta junio 2026**.

---

### 18. CI no ejecuta `docker compose build` — el bug de config-typescript llegó a prod
El bug de `config-typescript`/`config-biome` (item 1) se descubrió en producción
porque no había un job que ejecutara `docker compose build` en CI antes del
deploy.

**Tarea:** añadir job en `.github/workflows/ci.yml`:
```yaml
- name: Verify Dockerfiles build
  run: docker compose -f docker-compose.dev.yml --profile full build
```

**Estado:** ❌ **altamente recomendado**. Cualquier PR que toque dependencies
de un workspace package podría volver a romperlo.

---

### 19. Despliegue via SSH como `root`
El `SRV07_USER` actual del workflow es `root`. Funciona, pero el blast radius
de un PAT comprometido o un commit malicioso al workflow es máximo (acceso
total al servidor).

**Tarea:**
- Crear usuario `rankpulse-deploy` en srv07 con grupo `docker` (sin sudo).
- Acceso solo a `/var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/app/`.
- Rotar la SSH key (la actual está en KeePass como `RankPulse GHA Deploy SSH Key`).
- Actualizar GitHub Secret `SRV07_USER` y borrar la deploy key del
  `authorized_keys` de root.

**Estado:** ❌ **buenas prácticas. No bloqueante** ahora pero alta prioridad
de seguridad.

---

### 20. GHCR retention policy
Cada push a main publica `:sha-<commit>` y `:latest` para 3 imágenes. Sin
política de retención, GHCR acumula cientos de tags.

**Tarea:** workflow programado que llame a la GitHub Packages API para borrar
versiones más antiguas de N días (p.ej. 30, manteniendo las últimas 10):
```yaml
- uses: actions/delete-package-versions@v5
  with:
    package-name: rankpulse-api
    package-type: container
    min-versions-to-keep: 10
    delete-only-untagged-versions: false
```

**Estado:** ❌ **no bloqueante** los primeros meses.

---

### 21. Worker no expone `/readyz`
`GET /readyz` en la API solo verifica conexión a la base de datos. El worker
tiene su propio loop BullMQ que puede caerse silenciosamente si Redis se
desconecta.

**Tarea:** añadir un endpoint `/readyz` también en el worker (o exportar
métricas Prometheus que un healthcheck externo pueda consumir). Mientras
tanto, monitorización manual via `docker logs rankpulse-worker`.

**Estado:** ❌ **no bloqueante** en single-instance. Bloqueante si se llega
a multi-replica.

---

### 22. `CORS_ORIGINS` solo permite `https://rankpulse.ingenierosweb.co`
Hardcodeado en `.env.local` como `PUBLIC_WEB_ORIGIN`. Cuando se quiera servir
el SPA desde un CDN (p.ej. Cloudflare Pages) o un dominio del cliente, hay
que parametrizar mejor.

**Tarea:** soportar lista comma-separated en `CORS_ORIGINS` (ya hay código
para ello en `apps/api/src/main.ts`) y exponer una variable separada de
`PUBLIC_WEB_ORIGIN`.

**Estado:** ❌ **no bloqueante** mientras vivamos en una sola URL.

---

### 23. NestJS Throttler demasiado agresivo para operaciones bulk legítimas
**Síntoma:** durante el bootstrap de la org PatrolTech con scripts de
`/rank-tracking/keywords` y `/projects/:id/competitors`, hit consistente de
HTTP 429 después de ~10 requests en ráfaga. El throttler default de NestJS
no distingue entre "bot atacando" y "operador admin scriptando setup".

**Workaround actual:** scripts con `time.sleep(2.5-5s)` entre llamadas. Triplica
el tiempo de bootstrap (10 min en lugar de 3) y a veces aún recibe 429.

**Tarea:**
1. Excluir endpoints "admin write" (rank-tracking, schedules, competitors,
   keywords import) del throttler global.
2. O exponer header `X-Operator-Bootstrap` que un PAT con scope admin pueda
   usar para bypassear el rate limit.
3. Documentar los límites del throttler en el README — hoy son invisibles.

**Estado:** ❌ pendiente. **Fricción real** para cualquier setup masivo
vía API o SDK.

---

### 24. Mensaje de error confuso al añadir un dominio ya adjuntado a OTRO proyecto
**Síntoma:** `POST /projects/:id/domains` con `patroltech.online` tras
haberlo añadido a otro project del mismo org devuelve:
> "Domain patroltech.online already attached to project"

El mensaje sugiere que está adjuntado a ESTE project, cuando en realidad la
violación es: el dominio está en otro project del mismo org (existe regla
única `(organization_id, domain)` cross-project).

**Tarea (DDD):**
- `Project.addDomain` debería distinguir conflict-en-mismo-project (lanza
  `ConflictError("already attached to **this** project")`) vs
  conflict-cross-project (lanza
  `ConflictError("already attached to project '<otherProjectName>'")`).
- O mejor: definir si el modelo permite o no que el mismo dominio esté en
  varios proyectos del mismo org. Si lo permite, eliminar la regla. Si no,
  el mensaje debe ser explícito.

**Estado:** ❌ pendiente. **Confunde al operador**, especialmente al modelar
proyectos por mercado donde dominios "hub" (`patroltech.online`) querrían
estar en N proyectos.

---

### 25. Patch de Plesk template no se versiona ni se valida tras updates de Plesk
**Síntoma:** para que `vhost_nginx.conf` se incluya en cada vhost (item 2),
parchamos `/usr/local/psa/admin/conf/templates/custom/domain/nginxDomainVirtualHost.php`
con un sentinel `RANKPULSE-CUSTOM-MARKER`. Si Plesk actualiza la plantilla
default (que es de donde copiamos), nuestro override puede quedar desfasado
y la includes silenciosamente dejaría de funcionar.

**Tarea:**
- Workflow de monitorización: cron diario que diffea
  `/usr/local/psa/admin/conf/templates/default/domain/nginxDomainVirtualHost.php`
  contra el snapshot guardado al aplicar el patch. Si difiere, alerta.
- Mejor aún: extension de Plesk (`.zip` con manifest + hooks) que se instale
  oficialmente y sobreviva updates.

**Estado:** ❌ pendiente. **Bajo riesgo** mientras Plesk no haga un release
mayor del template, pero invisible si pasa.

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
