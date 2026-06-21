# Handoff : ThéCol — App de gestion mobile

> **Pour Claude Code** : ce dossier contient tout ce qu'il faut pour implémenter l'app ThéCol en Android natif. Lis ce README **en premier**, puis `DESIGN_SYSTEM.md` pour les tokens, et utilise les fichiers HTML dans `references/` comme référence visuelle uniquement.

---

## 🎯 Vue d'ensemble

**ThéCol** est une app mobile de gestion pour une petite entreprise suisse qui produit et livre du thé glacé artisanal (Ice Tea). L'app aide le patron à gérer au quotidien :

- 📋 **Commandes** clients (café, restaurants, supermarchés)
- ⏱ **Pointage** des employés
- 📦 **Stock** de bouteilles produites + inventaire des consommables
- ⚙️ **Production** (planification cuves)
- 💰 **Comptabilité** (factures simples)

**Utilisateurs** :
- Patron (admin) — vision complète, accès comptabilité
- Employés — pointage, consultation commandes, stock

**Langue** : Français (Suisse) — montants en CHF, format de date `jj.mm.aaaa`

---

## 📂 À propos des fichiers de design

> ⚠️ **IMPORTANT** : Les fichiers dans `references/` sont des **maquettes HTML/React de référence visuelle**, **PAS du code à copier**. Ils ont été créés comme prototypes pour montrer l'apparence et le comportement attendus.
>
> **Ta mission** : recréer ces designs en **Android natif (Kotlin + Java)** en utilisant les composants et patterns Android idiomatiques. N'essaie pas de "porter" le HTML vers Android — utilise le design system (`DESIGN_SYSTEM.md`) pour produire du code Android propre.

---

## 🎨 Fidélité

**Hi-fi** — Ces maquettes sont **pixel-perfect** :
- Couleurs finales (toutes définies dans `DESIGN_SYSTEM.md`)
- Typographie finale (Outfit, tailles en `sp`)
- Espacements et radius validés
- Interactions et transitions définies

Recrée l'UI au pixel près en utilisant Material 3 et les tokens fournis.

---

## 🛠 Stack technique

| Élément              | Choix                                                |
|----------------------|------------------------------------------------------|
| Langage              | **Kotlin** (Java accepté pour code historique)       |
| Min SDK              | 24 (Android 7.0)                                     |
| Target SDK           | 34 (Android 14)                                      |
| UI                   | **XML + Material 3** (Views) — ou Jetpack Compose si tu préfères |
| Architecture         | MVVM (ViewModel + StateFlow ou LiveData)             |
| Navigation           | Jetpack Navigation Component                         |
| Listes               | RecyclerView + ListAdapter (DiffUtil)                |
| DI                   | Hilt (recommandé)                                    |
| Persistance locale   | Room                                                 |
| Async                | Coroutines + Flow                                    |

**Dépendances Gradle de référence :**
```kotlin
implementation("com.google.android.material:material:1.11.0")
implementation("androidx.navigation:navigation-fragment-ktx:2.7.7")
implementation("androidx.navigation:navigation-ui-ktx:2.7.7")
implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.7.0")
implementation("androidx.recyclerview:recyclerview:1.3.2")
implementation("androidx.constraintlayout:constraintlayout:2.1.4")
implementation("androidx.room:room-runtime:2.6.1")
implementation("androidx.room:room-ktx:2.6.1")
kapt("androidx.room:room-compiler:2.6.1")
```

---

## 📱 Architecture de navigation

```
MainActivity
└── BottomNavigationView (5 onglets)
    ├── 🏠 Accueil (Dashboard)
    ├── 📋 Commandes
    │     ├── Liste + mini-calendrier
    │     ├── → Détail commande (slide-in)
    │     └── → Créer commande (bottom sheet modal)
    ├── ⏱ Pointage
    │     └── Horloge + saisie + historique
    ├── 📦 Stock
    │     ├── Vue par arôme
    │     ├── → Inventaire (nav)
    │     └── → Production (nav)
    └── ☰ Plus
          ├── → Comptabilité
          ├── → Production
          ├── → Inventaire
          └── → Paramètres
```

**Implémentation suggérée** : un seul `NavHostFragment` racine, plus un graphe de navigation par onglet (multiple back stacks Material).

---

## 📄 Écrans à implémenter (10 au total)

### 1. **Dashboard / Accueil**

**Rôle** : vue du jour pour le patron — pointage + tâches + stats rapides.

**Layout (top → bottom)** :
1. **Header "big"** — titre "Aujourd'hui" + avatar circulaire en haut à droite
2. **Card hero sombre** (background `colorPrimaryDark` #2C4A2E)
   - Label "POINTAGE"
   - Heure courante en Display (38sp bold)
   - Sous-texte "Pas encore pointé aujourd'hui"
   - Bouton blanc plein "Pointer mon arrivée" avec icône ⏱
3. **Card "3 choses à faire"** — liste de 3 todos avec checkbox circulaire
   - Cliquer la checkbox = toggle done (strikethrough + couleur grisée)
   - Cliquer la ligne = naviguer vers l'écran lié (commande / inventaire / pointage)
4. **Grille 2 colonnes** de KPIs
   - Stock total : 1240 — "↑ +48 cette semaine"
   - Commandes : 3 — "2 urgentes"
5. **Card alerte jaune** (background `colorWarningBg` + opacity)
   - ⚠ Stock bas avec navigation vers Inventaire

**Navigation depuis cet écran** :
- Card pointage → Pointage tab
- Items todo → écran lié
- KPI Stock → Stock tab
- KPI Commandes → Commandes tab
- Card alerte → Inventaire screen

---

### 2. **Commandes (liste + calendrier)**

**Layout** :
1. Header "big" "Commandes" + bouton "+ Créer" (Primary small)
2. **Mini-calendrier semaine** — 7 jours horizontaux
   - Jour sélectionné = pill vert (colorPrimary)
   - Jours avec commandes = dot jaune dessous
   - Boutons ‹ › pour changer de semaine
3. **Filtres** — 3 pills statuts (`en attente`, `produite`, `livrée`)
4. **Liste de cards commandes** :
   - Border-left 4dp couleur statut
   - `#042` en label gris (Nano)
   - Nom client en Body Large Bold
   - Badge statut à droite
   - Articles en Caption gris
   - Séparateur fin
   - Date + montant `CHF 480.–` en Body SemiBold colorPrimary

---

### 3. **Détail commande**

**Layout** :
1. Header normal "‹ Retour" + "#042 Café du Nord" + bouton "⋯"
2. **Hero card blanche** — badge statut + montant `CHF 480.–` H1 + livraison
3. **Step tracker** 5 étapes (Créée → Planif. → Produite → BL → Livrée)
4. **Card jaune "Prochaine action"** — étape courante + CTA "→ Planifier en production"
5. Section "Articles" — liste
6. Section "Client" — nom, lieu, 2 boutons (Appeler / Itinéraire)
7. Actions bas — Dupliquer (ghost) / Annuler (danger)

---

### 4. **Créer commande**

**Layout** :
1. Header "Annuler" / titre / "Créer" (link colorPrimary)
2. Section "Client" — pills sélectionnables (radio visuel)
3. Section "Date de livraison" — TextInputLayout
4. Section "Articles" — **matrice arôme × format** (4×3)
   - 4 lignes : Citron, Pêche, Fraise, Nature
   - 3 colonnes : 25cl, 50cl, 1L
   - Chaque cellule : tap → incrémente de 12
   - Cellule vide = `+` gris ; cellule remplie = nombre en vert sur fond vert clair
5. Card total — apparaît dès qu'une cellule > 0

---

### 5. **Pointage**

**Layout** :
1. Header "big" "Pointage"
2. **Card gradient** (background `linear-gradient 135deg colorPrimary → colorPrimaryDark`)
   - Heure géante (52sp)
   - Date du jour
   - 2 boutons : ⏱ Arrivée (blanc) / ⏹ Départ (rouge/danger)
3. Section "Qui pointe ?" — grille 2 colonnes d'avatars sélectionnables
   - Sélectionné = bordure 2dp colorPrimary + fond vert clair
   - Employé "live" (en cours) = dot vert top-right
4. Card "Saisie manuelle" — 3 champs (Arrivée / Départ / Pause) + bouton Enregistrer
5. Card historique du jour — liste avatars avec heures

**Important** :
- L'heure courante affichée doit être **temps réel** (Timer ou Handler tick chaque seconde)
- Pointage = écrire une `TimeEntry` en base avec employeId + arrivée + départ optionnel

---

### 6. **Stock**

**Layout** :
1. Header "big" "Stock" + bouton "+ Lot"
2. Barre de recherche (TextInputLayout)
3. **Grille 2×2** des 4 arômes
   - Dot coloré + nom + chiffre H2 colorPrimary + "btl vendables"
4. Section "Lots récents" — cards avec border-left coloré selon statut DLC (ok/bientôt/expiré)

---

### 7. **Inventaire**

**Layout** :
1. Header "big" "Inventaire" + bouton "+"
2. Card alerte jaune en haut
3. Liste consommables — chaque ligne :
   - Dot statut (vert si ok, rouge si bas)
   - Nom + quantité
   - Stepper `−` / `+` à droite (boutons 34dp carrés)

---

### 8. **Production**

**Layout** :
1. Header "big" "Production" + lien "Calculer"
2. Card période (Du / → / Au)
3. Section "Cuves" — pour chaque arôme :
   - Dot + nom + total litres
   - Pour chaque cuve : barre de progression + litres + bouton "Prod." (devient ✓ OK une fois fait)
4. Section "Ingrédients" — liste avec quantité requise / disponible

---

### 9. **Comptabilité**

**Layout** :
1. Header normal "‹ Plus" + bouton "+ Facture"
2. **Card hero gradient** — Revenus du mois + 3 KPI inline (Encaissé / En attente / Marge)
3. Liste factures — `F-042`, client, montant, badge statut

---

### 10. **Plus (menu)**

**Layout** :
1. Header "big" "Plus"
2. Card profil — avatar + nom + rôle
3. Section "Modules" — 4 lignes navigables (Compta / Production / Inventaire / Livraisons) avec icône + nom + sub-info colorée si alerte
4. Section "Paramètres" — 5 lignes (Employés / Arômes / Formats / Sauvegarde / Préférences)

---

## 🔁 Interactions globales

### Transitions Fragment
- **Forward** : slide-in depuis la droite — `translateX 100% → 0`, 280ms, `FastOutSlowInInterpolator`
- **Back** : slide-out vers la droite
- **Tab switch** : cross-fade ou slide selon direction des index

```kotlin
findNavController().navigate(
    R.id.action_to_detail,
    args,
    navOptions {
        anim {
            enter = R.anim.slide_in_right
            exit = R.anim.slide_out_left
            popEnter = R.anim.slide_in_left
            popExit = R.anim.slide_out_right
        }
    }
)
```

### Feedback tactile
- Tous les éléments tappables : ripple Material via `?attr/selectableItemBackground` (borné) ou `selectableItemBackgroundBorderless` (FAB, icônes)
- Cards : ripple sur le `MaterialCardView` avec `app:rippleColor="@color/colorPrimary"`
- Haptique : `HapticFeedbackConstants.VIRTUAL_KEY` sur actions clés (pointer arrivée/départ, valider commande)

### Snackbar (toast custom)
- Position : bottom, 16dp au-dessus de la BottomNav
- Fond `#1E1E1E` à 88% opacité, texte blanc 13sp, cornerRadius 20dp
- Durée ~1800ms
- Usage : confirmations d'action (✓ Commande créée, ⏱ Arrivée pointée, etc.)

### Listes
- Scrollbar invisible (`android:scrollbars="none"`)
- Over-scroll désactivé (`overScrollMode="never"`)
- Pull-to-refresh `SwipeRefreshLayout` avec `setColorSchemeColors(colorPrimary)`

---

## 📊 Modèle de données

Voici les entités à créer dans Room :

```kotlin
@Entity
data class Client(
    @PrimaryKey val id: String,
    val name: String,        // "Café du Nord"
    val location: String,    // "Lausanne"
    val phone: String?,
    val address: String?
)

enum class OrderStatus { EN_ATTENTE, PLANIFIEE, PRODUITE, BL_EMIS, LIVREE, ANNULEE }

@Entity
data class Order(
    @PrimaryKey val id: String,           // "042"
    val clientId: String,
    val deliveryDate: LocalDate,
    val status: OrderStatus,
    val totalChf: BigDecimal,
    val notes: String?
)

enum class Aroma { CITRON, PECHE, FRAISE, NATURE }
enum class Format { ML_250, ML_500, ML_1000 }   // 25cl, 50cl, 1L

@Entity
data class OrderLine(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val orderId: String,
    val aroma: Aroma,
    val format: Format,
    val quantity: Int
)

@Entity
data class Employee(
    @PrimaryKey val id: String,
    val firstName: String,
    val lastName: String?,
    val role: String        // "admin", "employee"
)

@Entity
data class TimeEntry(
    @PrimaryKey(autoGenerate = true) val id: Long = 0,
    val employeeId: String,
    val date: LocalDate,
    val arrival: LocalTime,
    val departure: LocalTime?,    // null = encore en cours
    val pauseMinutes: Int = 0
)

enum class StockStatus { OK, BIENTOT, EXPIRE }

@Entity
data class StockLot(
    @PrimaryKey val id: String,
    val aroma: Aroma,
    val format: Format,
    val quantity: Int,
    val productionDate: LocalDate,
    val expiryDate: LocalDate
)

@Entity
data class Consumable(
    @PrimaryKey val id: String,
    val name: String,            // "Thé noir", "Capsules 25cl"
    val quantity: Double,
    val unit: String,            // "g", "mL", "pcs"
    val threshold: Double        // seuil d'alerte
)

enum class InvoiceStatus { BROUILLON, ENVOYEE, PAYEE, EN_RETARD }

@Entity
data class Invoice(
    @PrimaryKey val id: String,  // "F-042"
    val orderId: String,
    val amount: BigDecimal,
    val status: InvoiceStatus,
    val issueDate: LocalDate,
    val dueDate: LocalDate
)
```

---

## 🎨 Design tokens

> Tous les tokens sont dans **`DESIGN_SYSTEM.md`** — le lire AVANT d'écrire le moindre layout. Il contient :
>
> - `colors.xml` complet
> - `dimens.xml` complet (spacing + radius + font sizes en sp)
> - `themes.xml` complet (Theme.TheCol + styles boutons/cards/inputs)
> - Spec détaillée par composant (Bouton, Badge, Card, Input, Header, TabBar, StepTracker, Avatar)

---

## 🖼 Assets

| Fichier                                | Usage                                            |
|----------------------------------------|--------------------------------------------------|
| `assets/logo_thecol.png`               | Logo principal (PNG 1280×1280) — splash, header  |
| `assets/logo_thecol_app_icon.jpg`      | Source pour générer le launcher icon            |

**À faire :**
1. Convertir le logo en `res/drawable/logo_thecol.xml` (Vector Drawable) si possible, sinon `res/drawable-xxxhdpi/logo_thecol.png`
2. Générer les launcher icons via Android Studio → `File > New > Image Asset` (48 / 72 / 96 / 144 / 192dp)
3. Configurer le splash screen API (Android 12+) avec le logo centré sur `colorBackground`

---

## 📚 Fichiers de référence (HTML)

| Fichier                                       | À utiliser pour                          |
|-----------------------------------------------|------------------------------------------|
| `references/Design System.html`               | Voir les couleurs/typo/composants en interactif |
| `references/Prototype Mobile ThéCol.html`     | Voir le comportement de navigation et les transitions |
| `references/Wireframes Mobile ThéCol.html`    | Voir les variations explorées (3 dashboards, 2 pointages…) |

**Pour ouvrir** : double-clic sur le fichier HTML — il s'ouvre dans le navigateur.

⚠️ Ces fichiers utilisent React/JSX **uniquement comme prototype**. Ne pas chercher à porter le JSX vers Android.

---

## ✅ Plan d'implémentation suggéré

**Phase 1 — Foundation (1–2 jours)**
1. Setup projet Android + dépendances Gradle
2. Coller `colors.xml`, `dimens.xml`, `themes.xml` depuis `DESIGN_SYSTEM.md`
3. Télécharger la font Outfit via Downloadable Fonts
4. Créer les `TextAppearance.TheCol.*` styles
5. Setup Room database + entities

**Phase 2 — Navigation (1 jour)**
1. `MainActivity` avec `BottomNavigationView`
2. Navigation graph (5 onglets, multiple back stacks)
3. Animations slide_in_right / slide_out_left dans `res/anim/`

**Phase 3 — Composants réutilisables (1 jour)**
1. Layout XML `view_status_badge.xml` (pill)
2. Layout XML `view_step_tracker.xml` (custom View ou ConstraintLayout)
3. Layout XML `view_avatar.xml` (avec dot live optionnel)
4. Layouts pour cards (variantes : standard, accent left-border, hero sombre, hero gradient)

**Phase 4 — Écrans (5–7 jours)**
1. Dashboard
2. Pointage (priorité métier : utilisé chaque jour)
3. Commandes (liste + détail + création)
4. Stock + Inventaire
5. Production
6. Comptabilité
7. Plus + Paramètres

**Phase 5 — Polish**
1. Snackbar custom (style ThéCol)
2. Transitions inter-écrans
3. Pull-to-refresh + empty states
4. Test sur petits écrans (Pixel 4a) et grandes tablettes

---

## ❓ À demander au propriétaire avant de coder

- **Backend / sync** : l'app est-elle 100% locale (Room) ou doit-elle se synchroniser avec un serveur ? (non spécifié pour l'instant — par défaut Room local)
- **Multi-utilisateurs** : un seul appareil partagé pour le pointage, ou un compte par employé ?
- **Sauvegarde** : export CSV ? Backup cloud ?
- **Dark mode** : pas spécifié — laisser en mode clair forcé pour la v1 (`AppCompatDelegate.setDefaultNightMode(MODE_NIGHT_NO)`)

---

*ThéCol — Handoff v1.0 — Mai 2026*
