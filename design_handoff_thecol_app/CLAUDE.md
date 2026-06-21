# Instructions pour Claude Code

Tu travailles sur **ThéCol**, une app Android de gestion pour une petite entreprise suisse de thé glacé artisanal.

## Avant de coder, lis dans cet ordre :

1. **`README.md`** — vue d'ensemble, écrans, navigation, modèle de données
2. **`DESIGN_SYSTEM.md`** — tokens couleurs, typo, espacements, specs composants, XML prêt à coller
3. **`references/Design System.html`** (optionnel) — pour visualiser le design system de manière interactive

## Règles strictes

- **Stack** : Android natif, Kotlin (Java accepté). Material 3. Min SDK 24.
- **Ne JAMAIS** copier le code JSX/React des fichiers HTML — ce sont des maquettes de référence visuelle uniquement.
- **Toujours** utiliser les tokens du design system (`@color/colorPrimary`, `@dimen/spacing_4`, etc.) plutôt que des valeurs en dur.
- **Police** : Outfit (Downloadable Fonts).
- **Langue** : Français (Suisse). Format date `jj.mm.aaaa`, montants en `CHF`.
- **Architecture** : MVVM (ViewModel + StateFlow), Navigation Component, RecyclerView + ListAdapter, Room.

## Composants à créer en premier (réutilisables)

- `StatusBadge` (pill colorée selon statut)
- `StepTracker` (5 étapes de commande)
- `Avatar` (initiales + dot live optionnel)
- `KpiCard` (label + grand chiffre + sub-info)
- Snackbar custom au style ThéCol

## Comportements de navigation

- Slide-in depuis la droite, 280ms, `FastOutSlowInInterpolator`
- BottomNavigationView avec multiple back stacks (un graphe par onglet)
- Détail commande = nouveau Fragment (slide-in), pas un bottom sheet
- Création de commande = `BottomSheetDialogFragment`

## Tu peux poser ces questions au propriétaire

- Backend / sync nécessaire ou app 100% locale ?
- Un compte par employé ou device partagé ?
- Dark mode pour la v1 ?
- Export comptabilité (CSV, PDF) ?

## Logo

`assets/logo_thecol.png` à intégrer dans `res/drawable/`. Couleurs du logo (vert vif `#3CB043`, fond mint `#C8F0C0`) **différentes** du vert UI (`#5D7B3E`) — ne pas mélanger.
