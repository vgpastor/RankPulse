# RankPulse — Backlog

> El backlog vive en **GitHub Issues** desde el commit que añade este
> párrafo. El fichero se conserva como punto de entrada y para preservar
> el histórico via `git log -- BACKLOG.md`.

## Dónde está el trabajo pendiente

- Issue tracker: <https://github.com/vgpastor/RankPulse/issues>
- Milestone activo: [`v1.1 — Free providers expansion`](https://github.com/vgpastor/RankPulse/milestones)

```bash
gh issue list --label provider --state open
gh issue list --milestone "v1.1 — Free providers expansion"
gh issue view <id>
```

## Etiquetas

| Label | Significado |
|---|---|
| `provider` | Integración de un nuevo data provider en `provider-core` |
| `free-source` | Fuente gratis o casi gratis |
| `paid-source` | Fuente de pago — requiere subscripción |
| `architecture` | Decisión arquitectónica transversal |
| `dx` | Developer experience / tooling |
| `user-action` | Requiere acción del product owner (creds, billing) |
| `enhancement` | Nueva funcionalidad |

## Numeración interna

Los títulos de issues llevan un prefijo `#NN — …` con la numeración
heredada del antiguo BACKLOG.md (items #15-#32 + A1-A9). Esa
numeración interna se preserva para que referencias en commits y
código sigan funcionando — el número que asigna GitHub al issue va por
encima como identificador real para el tracker.

## Histórico

El BACKLOG.md anterior con todos los items (resueltos y pendientes)
está en `git log --oneline --all -- BACKLOG.md` y en los PRs #11, #12,
#13, #15, #16.
