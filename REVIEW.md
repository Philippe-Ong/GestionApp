# Revue de code — ThéCol Gestion v8.6

**Date :** 07.09.2026

Revue **en lecture seule** de `app.js` (6174 lignes), `index.html`, `styles.css` et `manifest.webmanifest`. **Aucun fichier n'a été modifié.** Les findings ci-dessous sont consolidés pour correction ultérieure ; chaque item est suivi d'une case à cocher `- [ ]` à valider une fois corrigé.

---

## 🔴 Critique

À corriger en priorité.

### Restaurer une commande livrée → double déduction de stock
- [x] — `app.js:2906` (`restaurerCommande`) : repasse une commande livrée à `produite` sans recréditer les lots ni purger `commande.lotsUtilises`. Le bouton « ↶ Restaurer » (L3284) permet ensuite de relivrer → stock déduit une seconde fois, silencieusement. Un BL déjà émis reste aussi en base.
  - **Fix :** recréditer les lots ou bloquer la restauration si `lotsUtilises` est non vide.

### `loadFromFirebase()` écrase le local sans arbitrage au démarrage
- [x] — `app.js:402-435` et `app.js:6157-6170` : au boot, chaque table Firestore réécrit le localStorage sans comparaison (le champ `updatedAt` est écrit L395 mais jamais relu), sans confirmation ni notification. Un autre appareil avec des données plus anciennes détruit les données locales récentes. Le backup `thecol_backup_pre_sync` (L413) est créé mais aucune fonction ne permet de le consulter/restaurer.
  - **Fix :** comparaison `updatedAt` (« newer wins ») + confirmation utilisateur avant écrasement + fonction de restauration du backup.

### Erreurs de sync jamais remontées à l'utilisateur
- [x] — `app.js:432-434` : le `catch` de `loadFromFirebase` ne fait que `console.error` ; la synchro montante (`DB.set` → `syncToFirebase`, L371-389) est fire-and-forget sans retry.
  - **Fix :** toast d'erreur + mécanisme de retry.

---

## 🟠 Important

### XSS dans les `onclick` inline
- [x] — `app.js:991` (noms d'arômes) et `app.js:1003` (noms de formats), aussi `app.js:4490` : `escapeHtml` est inopérant en contexte JS inline (les entités HTML sont décodées avant compilation de l'attribut `onclick`) — un nom contenant une apostrophe permet l'injection de code.
  - **Fix :** remplacer par attributs `data-*` + `addEventListener`, ou `encodeURIComponent` comme en L4775.

### Crash page commandes après « Dupliquer » puis « Annuler »
- [x] — `app.js:3368-3377` (`duplicateCommande`) : la copie est sauvée avec `dateLivraison: ''` avant le modal d'édition ; si annulation, `formatDate('')` → `RangeError` non attrapé (L2537/L186) → page commandes cassée.
  - **Fix :** date obligatoire ou suppression de la copie en cas d'abandon.

### Transitions de statut non encadrées
- [x] — `app.js:2667-2672` : le `<select name="statut">` du modal commande permet de créer directement une commande `livrée` sans déduction de stock (`livrerCommande` L2826 / `showLivraisonBouteillesModal` L2914), ou de rétrograder `produite` → `en_attente`.
  - **Fix :** matrice de transitions autorisées.

### Numéros de BL/commandes recyclés après suppression
- [x] — `app.js:273-281` (`getNextBLNumero`), `app.js:259-267` (commandes) : un BL supprimé (déjà émis au client) libère son numéro, qui peut être réattribué → deux BL officiels avec le même n°.
  - **Fix :** compteur persisté par table, jamais décrémenté.

### `exportArchivesExcel()` ignore les filtres affichés
- [x] — `app.js:3500-3538` : exporte toutes les commandes livrées sans lire `DB.getFilter('archive_year')`/`'archive_client'`, contrairement au rendu (L3425-3430) et à la doc (« exports filtered results »).
  - **Fix :** appliquer les mêmes filtres.

### Pas de service worker → pas de mode hors-ligne
- [x] — L'app est déclarée PWA (`manifest.webmanifest`, `display: standalone`) et embarquée en Capacitor, mais sans SW les CDN (XLSX/JSZip/Firebase/Fonts) exigent le réseau à chaque démarrage. Limite documentée dans `MOBILE.md:67` mais structurante pour un usage atelier.
  - **Fix :** SW minimal avec cache des assets statiques, ou auto-héberger les libs CDN.

### Code mort dangereux : `livrerCommande`
- [x] — `app.js:2826-2896` : aucun appelant, mais déduit le stock sans contrôle de DLC (L2856) et marque `livrée` même en livraison partielle (L2854-2884). Même statut pour `archiverCommande` (L2898), `checkStockAndUpdateCommandes` (L3117), `deleteCommande` (L3388), `showStatusDropdown` (L2799), `showPointageModal` (L2040), `showSaisieManuelleModal` (L2075), `addNewEmployee` (L1960), `deleteEmployee` (L1984), `formatTime` (L188).
  - **Fix :** supprimer ou reconnecter volontairement.

### Scripts CDN sans SRI
- [x] — `index.html:129-130` : jszip 3.10.1 et xlsx 0.18.5 depuis cdnjs, versions épinglées mais sans `integrity`/`crossorigin`.
  - **Fix :** ajouter les hash SRI (cdnjs les fournit) ou auto-héberger.

### Écritures multi-tables non transactionnelles
- [x] — `app.js:2877-2884` : chaque `DB.set` déclenche un `syncToFirebase` asynchrone indépendant ; une coupure entre deux `set` laisse un état incohérent (stock déduit mais commande non livrée).
  - **Fix :** batch de sync.

### Bypass de la couche DB pour l'inventaire
- [x] — `app.js:5160-5192` (`updateInventaireQty`) : écrit localStorage en direct avec sync debouncée 500 ms, doublant la logique de quota (L5182) et créant deux politiques de sync.
  - **Fix :** passer par `DB.set`.

---

## 🟡 Mineur

- [ ] `app.js:742` vs `app.js:946` — incohérence dashboard/stock : un lot dont la DLC est aujourd'hui est compté `expired` sur le dashboard mais `warning` dans Stock.
- [ ] `app.js:529-535` — `getStatus` : une DLC malformée est silencieusement traitée `ok`.
- [ ] `app.js:524` — `new Date('yyyy-mm-dd')` interprété en UTC : sur un appareil en timezone négative, DLC détectée un jour trop tôt.
- [ ] `app.js:4398-4423` — cuve résiduelle < 1 L sous le `min="1"` du slider (L4493) : état interne 0,3 L vs affichage snappé à 1.
- [ ] `app.js:4548-4550` — `ajusterCuves` : `return` avant application quand une seule cuve → slider sans effet.
- [ ] `app.js:4811-4824` — `validerProduction` : pas de garde surproduction (bouteilles saisies vs capacité cuve / `aProduire`).
- [ ] `app.js:1924`, `app.js:2125` — pointage : pause négative acceptée (`parseInt || 0` sans `Math.max(0, …)`).
- [ ] `app.js:1936` — pointage : shift de nuit impossible (`heureFin <= heureDebut` interdit).
- [ ] `app.js:1845-1912` — stats pointage : « Moyenne/jour » gonflée (total toutes employés ÷ jours uniques).
- [ ] `app.js:4675-4678` — matching inventaire par nom exact normalisé : « Mûre sauvage » ≠ « Mûres sauvages » → production bloquée. `syncRecettesInventaire` (L5805) réduit le risque sans le résoudre.
- [ ] `app.js:3880-3881` — `AROME_BL_NAMES` : clé `'edition noel'` dupliquée ; fallback singulier/pluriel (L3890) fragile.
- [ ] `app.js:4024` — `exportBLExcel` ne vérifie pas `typeof JSZip` contrairement au pattern XLSX (L3510).
- [ ] `app.js:4978-5006` — suppression totale de l'inventaire → les 14 consommables par défaut sont recréés silencieusement.
- [ ] `app.js:1418-1436` — `saveEditLot` : aucune validation (NaN, négatifs, DLC < DLV).
- [ ] `app.js:913` — `style="background: ${arome?.couleur}"` non échappé (les autres occurrences le sont : L993, L1019).
- [ ] `app.js:205`, `app.js:758-765` — `renderDashboard` ne filtre pas les arômes/formats inactifs (`actif`) contrairement à `getActive`.
- [ ] `app.js:3238` — bouton « Appeler » toujours vide : `saveClient` (L5932-5945) n'enregistre ni `email` ni `telephone` (attendus par SPEC.md L55-65). Idem `employe.tauxHoraire` (SPEC L19) et `pointage.notes` (SPEC L104) jamais renseignés.
- [x] Lots stockés par noms libres (`arome`/`format`) au lieu d'IDs (`aromeId`/`formatId`, SPEC L67-79) — fragile aux renommages. *(implémenté non destructif : aromeId/formatId à l'écriture, fallback nom pour les lots existants)*
- [ ] `styles.css:525` `#3498DB` ; L819/847/852/2337 `#3F6B2A` ×4 ; L2351 `#3CA350` ; L314/L2638 `#EDEAE3` ×2 — hex hors `:root` à extraire en variables.
- [x] `styles.css` — blocs `@media` éclatés (768px en deux endroits L1453-2058 et L2937+, bloc desktop après mobile L2115) — ordre fragile. *(traité v8.8 : aucune duplication restante, ordre vérifié fonctionnel)*
- [ ] `index.html:115` — overlay modal avec `aria-hidden="true"` statique + `role="dialog"` dans le DOM initial ; contenu derrière la modale non `inert` quand elle est ouverte.
- [ ] `index.html:36`, `app.js:661` — « Dashboard » ; `index.html:80` — « Sync » ; `app.js:1012/1016/1065` — badge « OK » ; `app.js:1210` etc. — « N/A » : textes UI non français (règle AGENTS.md).
- [x] `AGENTS.md:9` annonce v8.5 (stale vs v8.6) ; `CLAUDE.md` tailles obsolètes ; `styles.css?v=2.8` suit un compteur indépendant de la version app.

---

## 🔵 Suggestions (optionnel)

- [ ] `app.js:649-695` — `navigateTo` ne réécrit pas le hash sur route inconnue (fallback dashboard sans corriger l'URL ni la classe `active`).
- [ ] `app.js:674-684` vs `index.html:34-66` — route `#archives` atteignable uniquement via le toggle interne de `renderCommandes` (L2547) : à arbitrer.
- [ ] `app.js:4337-4424` — `renderProduction` : `aromes.find`/`formats.find`/`recettes.find` dans des boucles imbriquées O(commande·items·aromes) → factoriser avec les Maps existantes (L4430-4431).
- [ ] `app.js:3082-3091` — `computeTotals` du modal livraison en O(n²).
- [ ] `app.js:1009` — `renderStock` : `aromes.find` dans le `.map` des lots → pré-indexer par nom.
- [ ] `app.js:4849-4850` — `PRODUCTION_LOSS` (1.015) appliqué aussi aux ingrédients en `pcs`.
- [ ] `app.js:538-553` — `showToast` non empilable : multi-échecs de sync = toasts successives qui se masquent.
- [ ] `index.html:33-112` — SVG de nav dupliqués entre sidebar et bottom-nav → `<use>`/template.
- [ ] `design_handoff_thecol_app/` (737 Ko de PNG, JSX de prototypage) commité — à documenter ou déplacer.
- [ ] `README2.md` est un document utilisateur (pas un doublon) — à lier depuis `README.md`.

---

## ✅ Points forts

Aucune action requise.

- Sécurité XSS en contexte texte quasi parfaite (116 usages `escapeHtml`, toasts/modals protégés).
- Stock impossible à mettre en négatif (`validerProduction` L4783-4916 agrège les blocages avant écriture, livraison revérifie au commit L3025-3039).
- Accessibilité soignée (focus trap L622-646, restauration du focus, safe-areas iOS, pipeline Capacitor propre).
- Conversions d'unités exactes avec vérification de compatibilité (L287-352, L4858-4876).

---

## 📋 Ordre de correction recommandé

1. Les 3 critiques — commencer par le garde-fou `restaurerCommande` (le plus rapide/risqué).
2. XSS `onclick` inline.
3. Crash `duplicateCommande`.
4. Nettoyage du code mort + `exportArchivesExcel`.
5. Le reste.
