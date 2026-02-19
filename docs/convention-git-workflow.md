# Convention : Git Workflow

## Un commit par story

Chaque story doit produire **un seul commit** sur la branche principale. Cela facilite le review, le revert, et le suivi de progression.

## Format du message de commit

```
<prefix>(<scope>): <description>
```

### Préfixes

| Préfixe | Usage | Exemple |
|---------|-------|---------|
| `feat` | Nouvelle fonctionnalité | `feat(10.3): webhook POST Meta WhatsApp` |
| `fix` | Correction de bug | `fix(build): corriger null → string dans logWaitlistPromoted` |
| `chore` | Maintenance, dette technique | `chore: sprint dette technique D1-D6` |
| `test` | Ajout/modification de tests uniquement | `test(10.5): tests E2E Meta inbound/outbound` |
| `docs` | Documentation uniquement | `docs: convention Prisma migrations` |
| `refactor` | Refactoring sans changement de comportement | `refactor(auth): simplifier middleware session` |

### Scope

- Pour les stories d'un epic : `(X.Y)` — ex: `feat(10.3): ...`
- Pour les corrections build : `(build)` — ex: `fix(build): ...`
- Pour les composants spécifiques : `(component)` — ex: `feat(meta): ...`

## Ne pas accumuler les fichiers non commités

Entre chaque story :

1. Vérifier `git status` — aucun fichier modifié non lié à la story en cours
2. Si des fichiers non liés sont modifiés, les stasher ou les commiter séparément
3. Ne jamais commencer une nouvelle story avec un `git status` sale

## Checklist pré-story-done

- [ ] `git status` ne montre que les fichiers liés à la story
- [ ] Un seul commit avec message au bon format
- [ ] `npx vitest run` passe
- [ ] Pas de `console.log` ou code de debug restant
- [ ] Pas de fichiers `.env` ou secrets dans le diff
