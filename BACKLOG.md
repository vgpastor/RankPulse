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
las últimas 10 sí o sí). Plantilla