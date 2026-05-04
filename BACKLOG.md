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

### 4. ACME `No order found for account ID` en Let's Encrypt
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

## 🟡 Pendiente para devs (no bloqueante para uso normal)

### 5. Runtime via `tsx` en producción (deuda técnica conocida)
Los Dockerfiles usan `tsx` (transpilación on-the-fly) en lugar de un build
TypeScript a `dist/`. Funciona, pero:
- Penaliza arranque (~1-2 s extra de transpile)
- Aumenta tamaño de imagen (~30-50 MB de devDependencies)
- Posible fricción con `@nestjs/swagger` y `design:paramtypes` (ya hay un
  workaround try/catch en `apps/api/src/main.ts`)

**Tarea:** introducir multi-stage build en cada Dockerfile:
1. Stage `build`: `pnpm install --frozen-lockfile` + `tsc -p tsconfig.build.json`
   en cada paquete + en cada app.
2. Stage `runtime`: `node:20-bookworm-slim` con `pnpm install --prod
   --frozen-lockfile` + `COPY --from=build /workspace/dist`.

Cuando esté listo, el `try/catch` alrededor de `SwaggerModule.createDocument`
en `main.ts` puede simplificarse: con `tsc` como pipeline el problema de
`design:paramtypes` desaparece.

**Estado:** documentado. **No bloqueante.**

---

### 6. CI workflow en Node 20 — deprecación en septiembre 2026
**Síntoma:** GHA muestra warning:
> Node.js 20 actions are deprecated. Forced to Node 24 by June 2 2026, removed
> September 16 2026.

**Tarea:** revisar las actions usadas (`actions/checkout@v4`, `docker/login-action@v3`,
`docker/setup-buildx-action@v3`, `docker/build-push-action@v6`, `appleboy/ssh-action@v1.2.0`)
y bumpar a la versión que soporte Node 24 cuando esté disponible. Setear
`FORCE_JAVASCRIPT_ACTIONS_TO_NODE24=true` mientras tanto si queremos pre-empt.

**Estado:** **no bloqueante hasta junio 2026**.

---

### 7. Test de `docker compose build` end-to-end no está en CI
El bug de `config-typescript`/`config-biome` se descubrió en producción porque
no había un job que ejecutase `docker compose build` en CI antes del deploy.

**Tarea:** añadir un job en `.github/workflows/ci.yml`:
```yaml
- name: Verify Dockerfiles build
  run: docker compose -f docker-compose.dev.yml --profile full build
```
para detectar este tipo de errores antes de tocar producción.

**Estado:** **no bloqueante** pero altamente recomendado. Cualquier PR que
toque las dependencias de un workspace package podría volver a romperlo.

---

### 8. Despliegue via SSH como `root`
El `SRV07_USER` actual del workflow es `root`. Funciona, pero el blast radius
de un PAT comprometido o un commit malicioso al workflow es máximo (acceso
total al servidor).

**Tarea:** crear usuario `rankpulse-deploy` en srv07 con:
- Pertenencia al grupo `docker` (sin sudo)
- Acceso solo a `/var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/app/`
- Rotar la SSH key (la actual está en KeePass como `RankPulse GHA Deploy SSH Key`)

Después actualizar el GitHub Secret `SRV07_USER` y eliminar la deploy key del
authorized_keys de root.

**Estado:** **no bloqueante**. Buenas prácticas.

---

### 9. GHCR retention policy
Cada push a main publica `:sha-<commit>` y `:latest` para 3 imágenes. Sin
política de retención, el packages tab de GHCR va a acumular cientos de tags.

**Tarea:** añadir un workflow programado que llame a la GitHub Packages API
para borrar versiones más antiguas de N días (p.ej. 30 días, manteniendo
las últimas 10 sí o sí). Plantilla:
```yaml
- uses: actions/delete-package-versions@v5
  with:
    package-name: rankpulse-api
    package-type: container
    min-versions-to-keep: 10
    delete-only-untagged-versions: false
```

**Estado:** **no bloqueante** los primeros meses.

---

### 10. Health check de readyz no llega al worker
`GET /readyz` solo verifica conexión a la base de datos. El worker tiene su
propio loop BullMQ que puede caerse silenciosamente si Redis se desconecta.

**Tarea:** añadir un endpoint `/readyz` también en el worker (o exportar
métricas Prometheus que un Plesk healthcheck externo pueda consumir).
Mientras tanto, monitorización manual via `docker logs rankpulse-worker`.

**Estado:** **no bloqueante** en single-instance. Bloqueante si se llega a
multi-replica.

---

### 11. CORS solo permite `https://rankpulse.ingenierosweb.co`
Hardcoded en `.env.local` como `PUBLIC_WEB_ORIGIN`. Cuando se quiera servir
el SPA desde un CDN (p.ej. Cloudflare Pages) o un dominio propio del cliente,
hay que parametrizar mejor.

**Tarea:** soportar lista comma-separated en `CORS_ORIGINS` (ya hay código
para ello en `apps/api/src/main.ts`) y exponer una variable separada de
`PUBLIC_WEB_ORIGIN`.

**Estado:** **no bloqueante** mientras vivamos en una sola URL.

---

## 🟢 Pendiente del usuario (Víctor) — no devs

- **GSC service account JSON.** Subir a
  `/var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/app/config/gsc-service-account.json`
  el JSON de `claude-access@ingenierosweb.iam.gserviceaccount.com` para
  activar el provider GSC.
- **SMTP.** Si quieres alertas por email, rellenar `SMTP_*` en `.env.local` y
  reiniciar el stack.
- **Backup de Postgres.** No hay todavía. Cuando empiece a haber datos
  reales, montar un cron que `pg_dump` a un volumen externo + cloudflare R2.
- **Backlinks API de DataForSEO.** Requiere subscription de $100/mo. No
  necesario para v1 — GSC + Ahrefs Free cubren los referring domains.

---

## Cómo se actualiza esto

Cuando tú o un dev arregla una de las entradas `🟡`, marcad como ✅ y mueve a
la sección de "resueltos". El `BACKLOG.md` vive en el repo así que cualquier
PR puede tocarlo.
