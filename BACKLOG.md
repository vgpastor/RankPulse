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