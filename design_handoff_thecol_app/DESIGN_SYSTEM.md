# ThéCol — Design System v1.0
> Référence complète pour l'implémentation Android (Kotlin / Java + Material 3).
> Coller ce fichier en contexte dans Cursor / Copilot / Gemini avant de générer du code UI.

---

## 1. Identité & Marque

- **Nom de l'app** : ThéCol
- **Police principale** : Outfit (Google Fonts) — variantes : Regular (400), SemiBold (600), Bold (700)
- **Langue** : Français (Suisse)
- **Stack** : Android, Kotlin / Java, Material 3 (com.google.android.material:material:1.11.0+)
- **Logo** : `res/drawable/logo_thecol.png` — fond mint (#C8F0C0), wordmark vert vif (#3CB043)
  - Espace de protection minimum : 16dp autour du logo
  - Taille minimum affichée : 80dp de large
  - Ne jamais modifier les couleurs du logo

---

## 2. Tokens Couleurs — `res/values/colors.xml`

```xml
<!-- Brand -->
<color name="colorPrimary">#5D7B3E</color>        <!-- CTA, accents, onglet actif -->
<color name="colorPrimaryDark">#2C4A2E</color>     <!-- Header sombre, gradient -->
<color name="colorPrimaryLight">#8BA66B</color>    <!-- Accent secondaire -->

<!-- Surfaces -->
<color name="colorBackground">#F5F5F0</color>      <!-- Fond général de l'app -->
<color name="colorSurface">#FFFFFF</color>          <!-- Cards, headers, inputs -->

<!-- Texte -->
<color name="colorTextPrimary">#2A2A2A</color>     <!-- Corps, titres -->
<color name="colorTextSecondary">#777777</color>   <!-- Labels, sous-titres -->
<color name="colorTextTertiary">#AAAAAA</color>    <!-- Placeholders, hints -->

<!-- Bordures -->
<color name="colorBorder">#E0DDD5</color>          <!-- Contours cards, inputs -->
<color name="colorBorderLight">#EEEAE2</color>     <!-- Séparateurs discrets -->

<!-- Statuts -->
<color name="colorSuccessBg">#B8D4A0</color>       <!-- Fond badge "livrée" -->
<color name="colorSuccess">#7BB865</color>          <!-- Indicateur succès, dot live -->
<color name="colorWarningBg">#F0D9A0</color>       <!-- Fond badge "en attente" -->
<color name="colorWarning">#C8960A</color>          <!-- Texte warning, urgence -->
<color name="colorErrorBg">#E8B4AF</color>         <!-- Fond badge "en retard" -->
<color name="colorError">#C0392B</color>            <!-- Bouton danger, erreurs -->
<color name="colorInfoBg">#A8C8E8</color>          <!-- Fond badge "produite" -->
<color name="colorInfo">#2E72B8</color>             <!-- Indicateur info -->

<!-- Utilitaires -->
<color name="white">#FFFFFF</color>
<color name="black">#000000</color>
<color name="transparent">#00000000</color>
```

> ⚠️ Les couleurs du logo (`#3CB043`, `#C8F0C0`) sont distinctes du vert UI (`#5D7B3E`). Ne pas les mélanger.

---

## 3. Typographie — `res/values/dimens.xml` + `res/font/`

Police : **Outfit** (Downloadable Font ou `res/font/outfit_regular.ttf`, `outfit_semibold.ttf`, `outfit_bold.ttf`)

| Nom              | Taille | Poids | LH   | Usage Android                          |
|------------------|--------|-------|------|----------------------------------------|
| Display          | 38sp   | 700   | 1.0  | Horloge pointage                       |
| H1               | 28sp   | 700   | 1.1  | Titre écran, montant principal         |
| H2               | 26sp   | 700   | 1.1  | Stats dashboard                        |
| H3               | 22sp   | 700   | 1.2  | KPI secondaire                         |
| Title Large      | 16sp   | 600   | 1.3  | Header titre normal (Toolbar)          |
| Body Large Bold  | 15sp   | 600   | 1.3  | Noms clients en liste                  |
| Body             | 13sp   | 400   | 1.35 | Corps de liste, description            |
| Body SemiBold    | 13sp   | 600   | 1.35 | Boutons, montants, actions             |
| Caption          | 12sp   | 400   | 1.4  | Sous-titres, métadonnées               |
| Section Label    | 11sp   | 600   | 1.3  | Titres section — TOUJOURS UPPERCASE + letterSpacing 0.04 |
| Micro            | 10sp   | 500   | 1.3  | Pills, badges, labels onglets          |
| Nano             | 9sp    | 400   | 1.3  | Petits indicateurs                     |

---

## 4. Espacements & Géométrie — `res/values/dimens.xml`

```xml
<!-- Espacement (base 4dp) -->
<dimen name="spacing_1">4dp</dimen>
<dimen name="spacing_2">8dp</dimen>
<dimen name="spacing_3">12dp</dimen>
<dimen name="spacing_4">16dp</dimen>
<dimen name="spacing_5">20dp</dimen>
<dimen name="spacing_6">24dp</dimen>
<dimen name="spacing_8">32dp</dimen>
<dimen name="spacing_12">48dp</dimen>

<!-- Border Radius -->
<dimen name="radius_xs">6dp</dimen>       <!-- Petites cellules -->
<dimen name="radius_sm">8dp</dimen>       <!-- Boutons small -->
<dimen name="radius_md">10dp</dimen>      <!-- Inputs, boutons standard -->
<dimen name="radius_card">12dp</dimen>    <!-- Cards -->
<dimen name="radius_card_lg">16dp</dimen> <!-- Hero cards -->
<dimen name="radius_pill">20dp</dimen>    <!-- Badges, pills -->

<!-- Composants -->
<dimen name="btn_height_sm">28dp</dimen>
<dimen name="btn_height_md">36dp</dimen>
<dimen name="btn_height_lg">42dp</dimen>
<dimen name="input_height">40dp</dimen>
<dimen name="tab_bar_height">56dp</dimen>
<dimen name="app_bar_height">44dp</dimen>
<dimen name="card_padding">14dp</dimen>
<dimen name="screen_padding_h">16dp</dimen>
```

**Élévation :**
- Cards standard : `elevation="1dp"` + ombre `0 1px 3px rgba(0,0,0,0.05)`
- AppBar / Headers : élévation 0 + `borderBottom 1dp colorBorder`
- Bottom Sheets / Dialogs : `elevation="4dp"`

---

## 5. Composants

### 5.1 Boutons

```xml
<!-- Primaire -->
<style name="Widget.TheCol.Button.Primary" parent="Widget.Material3.Button">
    <item name="backgroundTint">@color/colorPrimary</item>
    <item name="android:textColor">@color/white</item>
    <item name="android:textSize">@dimen/text_body</item>       <!-- 13sp -->
    <item name="android:textStyle">bold</item>
    <item name="android:minHeight">@dimen/btn_height_md</item>  <!-- 36dp -->
    <item name="cornerRadius">@dimen/radius_md</item>           <!-- 10dp -->
    <item name="android:paddingStart">@dimen/spacing_4</item>
    <item name="android:paddingEnd">@dimen/spacing_4</item>
</style>
```

| Variante    | Fond           | Texte             | Hauteur |
|-------------|----------------|-------------------|---------|
| Primary     | colorPrimary   | white             | 36dp    |
| Secondary   | #EDEAE3        | colorTextPrimary  | 36dp    |
| Danger      | colorError     | white             | 36dp    |
| Ghost       | transparent    | colorTextPrimary  | 36dp, border 1.5dp colorBorder |
| Small       | selon variante | idem              | 28dp    |
| Large       | selon variante | idem              | 42dp    |

- Ripple : `?attr/selectableItemBackground` (borné sur le bouton)
- État pressé : alpha 0.65 si pas de ripple Material

---

### 5.2 Badges de statut

Composant : `TextView` ou `Chip` Material

| Statut       | Fond (bg)       | Usage                    |
|--------------|-----------------|--------------------------|
| en attente   | colorWarningBg  | Commande non planifiée   |
| produite     | colorInfoBg     | Commande en production   |
| livrée       | colorSuccessBg  | Commande livrée          |
| en retard    | colorErrorBg    | Facture / retard         |
| payée        | colorSuccessBg  | Facture réglée           |
| ok           | colorSuccessBg  | Stock suffisant          |
| bientôt      | colorWarningBg  | DLC proche               |
| expiré       | colorErrorBg    | DLC dépassée             |

Specs : `cornerRadius=20dp`, `paddingHorizontal=9dp`, `paddingVertical=2dp`, `textSize=10sp`, `textStyle=bold`

---

### 5.3 Cards (MaterialCardView)

```xml
<style name="Widget.TheCol.Card" parent="Widget.Material3.CardView.Elevated">
    <item name="cardCornerRadius">@dimen/radius_card</item>   <!-- 12dp -->
    <item name="cardElevation">1dp</item>
    <item name="cardBackgroundColor">@color/colorSurface</item>
</style>
```

- **Padding interne** : 12–14dp
- **Accent left-border** : `View` de 4dp de large, hauteur fill, couleur selon statut — placé à gauche dans un `ConstraintLayout` ou `LinearLayout`
- **Card sombre (hero)** : background `colorPrimaryDark` (#2C4A2E), texte blanc

---

### 5.4 Champs de saisie (TextInputLayout)

```xml
<style name="Widget.TheCol.TextInputLayout" parent="Widget.Material3.TextInputLayout.OutlinedBox">
    <item name="boxCornerRadiusTopStart">@dimen/radius_md</item>
    <item name="boxCornerRadiusTopEnd">@dimen/radius_md</item>
    <item name="boxCornerRadiusBottomStart">@dimen/radius_md</item>
    <item name="boxCornerRadiusBottomEnd">@dimen/radius_md</item>
    <item name="boxStrokeColor">@color/colorBorder</item>       <!-- repos : #E0DDD5 -->
    <item name="boxStrokeColorFocused">@color/colorPrimary</item> <!-- focus : #5D7B3E -->
    <item name="boxStrokeWidth">1.5dp</item>
</style>
```

- Hauteur : 40dp
- Label : Section Label (11sp, 600, UPPERCASE, letterSpacing 0.04), couleur colorTextSecondary
- Note sous le champ : 10sp colorTextTertiary

---

### 5.5 AppBar / Header

```xml
<style name="Widget.TheCol.Toolbar" parent="Widget.Material3.Toolbar">
    <item name="android:background">@color/colorSurface</item>
    <item name="elevation">0dp</item>
</style>
```

- **Header "big"** : titre H1 (28sp bold), padding `top=8dp bottom=14dp horizontal=16dp`
- **Header normal** : titre Title Large (16sp 600), padding `11dp`
- **Bouton retour** : `colorPrimary`, texte "‹ Retour", 14sp
- Séparation via `AppBarLayout` avec `android:background="@color/colorBorder"` en bas (1dp)

---

### 5.6 Barre de navigation (BottomNavigationView)

```xml
<!-- NavigationBar Material 3 -->
<com.google.android.material.navigationrail.NavigationBarView
    app:itemIconTint="@color/nav_icon_color"
    app:itemTextColor="@color/nav_icon_color"
    app:itemActiveIndicatorColor="@color/colorPrimaryLight" />
```

| Propriété          | Valeur                                          |
|--------------------|-------------------------------------------------|
| Hauteur            | 56dp + window insets bottom                     |
| Background         | colorSurface, élévation 8dp                     |
| 5 onglets          | Accueil · Commandes · Pointage · Stock · Plus   |
| Icône active       | colorPrimary, opacity 1.0                       |
| Icône inactive     | colorTextPrimary, opacity 0.38                  |
| Label actif        | 10sp SemiBold, colorPrimary                     |
| Badge numérique    | fond #E04040, texte blanc, 9sp, border 1.5dp blanc |

---

### 5.7 Tracker de progression commande

5 étapes : **Créée → Planif. → Produite → BL → Livrée**

| État    | Pastille (24dp)                        | Connecteur (2dp h)  |
|---------|----------------------------------------|---------------------|
| done    | bg colorSuccess, ✓ blanc, pas de border | colorSuccess        |
| current | bg colorWarningBg, border 2dp colorPrimary | colorBorderLight |
| pending | bg #EDEAE3                             | colorBorderLight    |

- Label actif : 9sp, w600, colorPrimary
- Label inactif : 9sp, w400, colorTextTertiary

---

### 5.8 Avatars employés

- Fond : `colorSuccessBg` (#B8D4A0)
- Initiales : taille = `diameter × 0.3`, w700
- **Dot "en cours"** : `diameter × 0.26`, bg `#3CA350`, border 2dp blanc, positionné `top-right`
- Tailles : 30dp (sm) · 36dp (md) · 46dp (lg)

---

## 6. Interactions & Navigation

### 6.1 Transitions entre écrans (Fragment / Activity)

| Paramètre          | Valeur                                             |
|--------------------|----------------------------------------------------|
| Aller vers         | slide-in depuis la droite (translateX 100% → 0)   |
| Retour             | slide-out vers la droite (translateX 0 → 100%)     |
| Changement d'onglet | cross-fade ou slide selon direction               |
| Durée              | 280ms                                              |
| Interpolateur      | FastOutSlowInInterpolator (≈ cubic-bezier 0.32,0,0.18,1) |
| Fragment           | `FragmentTransaction.setCustomAnimations()`        |
| Activity           | `ActivityOptions.makeCustomAnimation()`            |
| Compose            | `AnimatedNavHost + slideIntoContainer()`           |

### 6.2 Feedback tactile

| Contexte             | Implémentation Android                                 |
|----------------------|--------------------------------------------------------|
| Boutons / rows       | `?attr/selectableItemBackground` (borné)              |
| FAB / icônes         | `?attr/selectableItemBackgroundBorderless`            |
| Cards cliquables     | `foreground` ripple sur `MaterialCardView`            |
| État pressé (fallback) | alpha 0.65                                          |
| Haptique             | `HapticFeedbackConstants.VIRTUAL_KEY` sur actions clés |

### 6.3 Toast / Snackbar

| Propriété        | Valeur                                          |
|------------------|-------------------------------------------------|
| Composant        | `Snackbar` (Material 3)                        |
| Position         | bottom, 16dp au-dessus de la NavBar            |
| Fond             | #1E1E1E, 88% opacité                           |
| Texte            | blanc, 13sp                                    |
| cornerRadius     | 20dp                                           |
| Durée            | ~1 800ms                                       |
| Entrée           | fade-in 200ms                                  |
| Sortie           | fade-out 300ms                                 |

### 6.4 Listes & scroll

| Propriété        | Valeur                                             |
|------------------|----------------------------------------------------|
| Scrollbar        | `android:scrollbars="none"`                       |
| Over-scroll      | `android:overScrollMode="never"`                  |
| Pull-to-refresh  | `SwipeRefreshLayout`, couleur colorPrimary        |
| Swipe action     | `ItemTouchHelper` sur RecyclerView                |

---

## 7. Architecture de navigation

```
BottomNavigationView (5 onglets)
├── Dashboard (Accueil)
│     └── → Commandes (tab)
│     └── → Pointage (tab)
│     └── → Stock (tab)
├── Commandes
│     ├── Liste + mini-calendrier
│     ├── → Détail commande (slide-in)
│     └── → Créer commande (bottom sheet modal)
├── Pointage
│     ├── Horloge + boutons arrivée/départ
│     └── Saisie manuelle + historique du jour
├── Stock
│     ├── Vue par arôme (grille 2 col)
│     ├── → Inventaire consommables (nav)
│     └── → Production (nav)
└── Plus
      ├── → Comptabilité (nav)
      ├── → Production (nav)
      ├── → Inventaire (nav)
      └── → Paramètres (nav)
```

---

## 8. Données métier de référence

### Arômes
- Citron, Pêche, Fraise, Nature

### Formats
- 25cl, 50cl, 1L

### Statuts commande
`en attente` → `planifiée` → `produite` → `BL émis` → `livrée`

### Statuts facture
`brouillon` → `envoyée` → `payée` | `en retard`

### Statuts stock/lot
`ok` → `bientôt` → `expiré` (basé sur DLC)

### Employés (exemple)
Philippe (admin/patron), Marie D., Thomas L., Pierre M.

---

## 9. Notes d'implémentation Android

```
// build.gradle (app)
implementation 'com.google.android.material:material:1.11.0'
implementation 'androidx.navigation:navigation-fragment-ktx:2.7.7'
implementation 'androidx.navigation:navigation-ui-ktx:2.7.7'

// Font Outfit — res/font/outfit.xml (Downloadable Fonts)
// File > New > More > Download Fonts dans Android Studio

// Theme application dans AndroidManifest.xml
android:theme="@style/Theme.TheCol"

// window insets (edge-to-edge recommandé)
WindowCompat.setDecorFitsSystemWindows(window, false)
ViewCompat.setOnApplyWindowInsetsListener(binding.root) { v, insets -> ... }
```

**Recommandations :**
- Utiliser `ViewBinding` ou `DataBinding`
- `RecyclerView` + `ListAdapter` (DiffUtil) pour toutes les listes
- `ViewModel` + `LiveData` / `StateFlow` par écran
- Dark mode : prévoir `res/values-night/colors.xml` (non spécifié pour l'instant)
- Logo launcher : générer avec Android Studio Image Asset Tool (48/72/96/144/192dp)

---

*ThéCol Design System v1.0 — Mai 2026*
