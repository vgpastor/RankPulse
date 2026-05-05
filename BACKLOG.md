# RankPulse — Backlog técnico

> Solo trabajo pendiente. El histórico de items resueltos vive en
> `git log --oneline -- BACKLOG.md` y en los PRs #11, #12, #13.

## TL;DR

| Categoría | Cantidad |
|---|---:|
| Pendiente arquitectura/UX (devs) | 3 |
| Pendiente server-side (ops) | 2 |
| Pendiente del usuario | 5 |
| **Total** | **10** |

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

Más una migración para des-duplicar las 165 `tracked_keywords` actuales
(crear una `tracked_keyword` por (project, keyword, location), no por dominio).

**Impacto medido:** las 4 markets de PatrolTech con 5+3+5+2 dominios y
7+5+6+4 keywords son ahora 88 SERPs/refresh (~$0.31). Tras el refactor: 22
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

## ❌ Pendiente server-side / ops (no fixable desde código)

### #19 — Despliegue via SSH como `root`
El `SRV07_USER` actual del workflow es `root`. El blast radius de un PAT
comprometido o un commit malicioso al workflow es máximo (acceso total).

**Tarea:**
1. Crear usuario `rankpulse-deploy` en srv07 con grupo `docker` (sin sudo).
2. Acceso solo a `/var/www/vhosts/ingenierosweb.co/rankpulse.ingenierosweb.co/app/`.
3. Rotar la SSH key (la actual está en KeePass como `RankPulse GHA Deploy SSH Key`).
4. Actualizar GitHub Secret `SRV07_USER` y borrar la deploy key del
   `authorized_keys` de root.

---

### #25 — Patch de Plesk template no se versiona ni se valida tras updates de Plesk
Para que `vhost_nginx.conf` se incluya en cada vhost, parchamos
`/usr/local/psa/admin/conf/templates/custom/domain/nginxDomainVirtualHost.php`
con un sentinel `RANKPULSE-CUSTOM-MARKER`. Si Plesk actualiza la plantilla
default, el override puede quedar desfasado y los includes silenciosamente
dejarían de funcionar.

**Tarea:**
- Cron diario que diffea
  `/usr/local/psa/admin/conf/templates/default/domain/nginxDomainVirtualHost.php`
  contra el snapshot guardado al aplicar el patch. Si difiere, alerta.
- Mejor aún: extension de Plesk (`.zip` con manifest + hooks) que se instale
  oficialmente y sobreviva updates.

---

## 🟢 Pendiente del usuario (Víctor)

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
