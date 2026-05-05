# RankPulse — Backlog técnico

> Solo trabajo pendiente. El histórico de items resueltos vive en
> `git log --oneline -- BACKLOG.md` y en los PRs #11, #12, #13.

## TL;DR

| Categoría | Cantidad |
|---|---:|
| Pendiente arquitectura/UX (devs) | 2 |
| Pendiente del usuario (opcional) | 1 |
| **Total** | **3** |

> Numeración: items 7-14, 15, 17, 18, 19, 20, 21, 22 y 23 ya cerrados.
> Mantengo el id original para que enlaces externos a "BACKLOG #X" no se
> rompan; los huecos en la secuencia son a propósito.

---

## ❌ Pendiente arquitectura / producto / UX

### #16 — Runtime via `tsx`/swc-node en producción (deuda técnica)
Los apps usan transpilación on-the-fly (`@swc-node/register`) en lugar de un
build TS a `dist/`. Funciona pero penaliza arranque (~1-2s) y aumenta tamaño.
Migrar a multi-stage build → `tsc → dist/`.

---

### A9 — Bootstrap UX: post-registro debería pedir credenciales primero
Tras registro la SPA va a /projects vacía. Mejor: asistente que pida
(1) credencial DataForSEO, (2) primer proyecto, (3) primer keyword + schedule.

---


## 🟢 Pendiente del usuario (opcional)

- **DataForSEO Backlinks API** ($100/mo). Excluida del v1 — GSC referring
  domains + Ahrefs Free DR cubren el caso.
