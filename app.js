// ThéCol Gestion - Application JavaScript

// Application-wide constants
const CONSTANTS = {
    PRODUCTION_LOSS: 1.015,    // +1.5% loss buffer applied to ingredient consumption
    CAPSULE_LOSS: 1.075,       // +7.5% loss buffer for capsules
    CUVE_MAX_L: 25,            // max litres per cuve
    STOCK_WARN_DAYS: 30        // DLC warning threshold in days
};

// Presets de tarifs clients — choisis dans la fiche client (champ tarifs)
const TARIF_PRESETS = {
    distributeur: { prix25cl: '2.25', prix50cl: '3.80', prix100cl: '6.00' },
    prive:        { prix25cl: '3.00', prix50cl: '5.00', prix100cl: '8.50' }
};

// Normalise une valeur de tarif (texte libre legacy ou clé canonique) en l'une des 3 clés
// canoniques : 'distributeur' | 'prive' | 'custom'. Insensible à la casse + accents.
const normalizeTarifKey = (raw) => {
    if (!raw) return 'custom';
    const s = String(raw).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
    if (s.startsWith('distrib')) return 'distributeur';   // Distributeur(s), Distrib., etc.
    if (s.startsWith('priv'))    return 'prive';          // Privé, Prive, Private, etc.
    return 'custom';
};

// Migration silencieuse au boot :
//   1. réécrit tous les client.tarifs en clés canoniques (distributeur/prive/custom)
//   2. pour les clients en distributeur/prive sans prix → applique le preset
// Sans effet pour les clients déjà à jour. Ne touche jamais à un prix déjà rempli.
const migrateClientTarifs = () => {
    try {
        const clients = DB.get('clients') || [];
        let changedKey = 0, changedPrix = 0;
        const isEmpty = (v) => v === undefined || v === null || String(v).trim() === '';
        clients.forEach(c => {
            const canonical = normalizeTarifKey(c.tarifs);
            if (c.tarifs !== canonical) {
                c.tarifs = canonical;
                changedKey++;
            }
            const preset = TARIF_PRESETS[c.tarifs];
            if (preset) {
                if (isEmpty(c.prix25cl))  { c.prix25cl  = preset.prix25cl;  changedPrix++; }
                if (isEmpty(c.prix50cl))  { c.prix50cl  = preset.prix50cl;  changedPrix++; }
                if (isEmpty(c.prix100cl)) { c.prix100cl = preset.prix100cl; changedPrix++; }
            }
        });
        if (changedKey + changedPrix > 0) {
            DB.set('clients', clients);
            console.log(`[migration] ${changedKey} tarifs normalisés, ${changedPrix} prix remplis`);
        }
    } catch (e) {
        console.warn('[migration] migrateClientTarifs failed:', e);
    }
};

// Au moment d'ouvrir le modal client, applique le preset si la catégorie est distributeur/prive
// mais que les prix sont vides. Sécurité runtime supplémentaire si la migration n'a pas tourné.
const applyTarifPresetIfEmpty = () => {
    const form = document.getElementById('clientForm');
    if (!form) return;
    const cat = form.tarifs?.value;
    const preset = TARIF_PRESETS[cat];
    if (!preset) return;
    const isEmpty = (v) => v === undefined || v === null || String(v).trim() === '';
    if (isEmpty(form.prix25cl.value))  form.prix25cl.value  = preset.prix25cl;
    if (isEmpty(form.prix50cl.value))  form.prix50cl.value  = preset.prix50cl;
    if (isEmpty(form.prix100cl.value)) form.prix100cl.value = preset.prix100cl;
};

// Retourne la clé prix client correspondant à un format ('prix25cl' / 'prix50cl' / 'prix100cl')
// ou null si inconnu. Robuste face aux contenanceCl en string et aux formats sans contenanceCl.
// IMPORTANT : contenanceCl est en CENTILITRES (cl), donc 25 = 25cl, pas 250ml.
const getFormatPriceKey = (format) => {
    if (!format) return null;
    const cl = Number(format.contenanceCl);
    if (cl === 25)  return 'prix25cl';
    if (cl === 50)  return 'prix50cl';
    if (cl === 100) return 'prix100cl';
    // Fallback par nom de format (legacy schemas sans contenanceCl)
    const nom = String(format.nom || '').toLowerCase().replace(/\s+/g, '');
    if (/^25cl$/.test(nom))                  return 'prix25cl';
    if (/^50cl$/.test(nom))                  return 'prix50cl';
    if (/^(100cl|1l|1000ml|1\.0l)$/.test(nom)) return 'prix100cl';
    return null;
};

// Applique un preset de tarif au form client (déclenché par le select onChange)
const applyTarifPreset = (selectEl) => {
    const cat = selectEl.value;
    const preset = TARIF_PRESETS[cat];
    if (!preset) return; // 'custom' → ne touche pas aux prix existants
    const form = document.getElementById('clientForm');
    if (!form) return;
    form.prix25cl.value = preset.prix25cl;
    form.prix50cl.value = preset.prix50cl;
    form.prix100cl.value = preset.prix100cl;
};

// Détecte une modification manuelle d'un prix → bascule la catégorie en "Personnalisé"
const onPrixInputChange = () => {
    const form = document.getElementById('clientForm');
    if (!form) return;
    const cat = form.tarifs?.value;
    const preset = TARIF_PRESETS[cat];
    if (!preset) return; // déjà custom
    const matches = form.prix25cl.value === preset.prix25cl
                 && form.prix50cl.value === preset.prix50cl
                 && form.prix100cl.value === preset.prix100cl;
    if (!matches) form.tarifs.value = 'custom';
};

// Utility Functions
const generateId = () => {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return '_' + crypto.randomUUID().replace(/-/g, '').slice(0, 12);
    }
    return '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
};

const debounce = (fn, ms) => {
    let timer = null;
    return (...args) => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = null; fn(...args); }, ms);
    };
};

// Index un tableau par id (O(n)) — permet lookups O(1) dans les boucles de rendu
const indexById = (arr) => new Map((arr || []).map(x => [x.id, x]));
const indexBy = (arr, keyFn) => new Map((arr || []).map(x => [keyFn(x), x]));

// Sub-renderer Livraisons : card "Commandes livrées sans BL" (separee du reste
// pour permettre un re-render cible apres creation/suppression de BL).
const renderLivraisonsSansBLCard = (commandesLivreesSansBL, lookups) => {
    if (commandesLivreesSansBL.length === 0) return '';
    return `
        <div class="card mt-4" id="livraisonsSansBLCard">
            <div class="card-header">
                <h3 class="card-title">Commandes livrées sans BL</h3>
            </div>
            <div class="table-container">
                <table>
                    <thead>
                        <tr>
                            <th>No Commande</th>
                            <th>Client</th>
                            <th>Date livraison</th>
                            <th>Articles</th>
                            <th>Action</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${commandesLivreesSansBL.map(cmd => {
                            const client = lookups.clientsById.get(cmd.clientId);
                            const totalItems = getItems(cmd).reduce((sum, item) => sum + (item.quantite || 0), 0);
                            const articlesPreview = getItems(cmd).slice(0, 2).map(item => {
                                const a = lookups.aromesById.get(item.aromeId);
                                const f = lookups.formatsById.get(item.formatId);
                                return escapeHtml(`${item.quantite}x ${a?.nom || '?'} ${f?.nom || '?'}`);
                            }).join(', ');

                            return `
                                <tr>
                                    <td>#${getCommandeNumero(cmd)}</td>
                                    <td>${escapeHtml(client?.societe || client?.nom || 'N/A')}</td>
                                    <td>${cmd.dateLivraison || cmd.dateCommande ? formatDate(cmd.dateLivraison || cmd.dateCommande) : '-'}</td>
                                    <td>${articlesPreview}${getItems(cmd).length > 2 ? '...' : ''} (${totalItems})</td>
                                    <td>
                                        <button class="btn btn-sm btn-primary" onclick="createBLFromCommande('${cmd.id}')">Créer le BL</button>
                                    </td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
};

// Cache pour le modal de commande : evite 2x DB.get par touche dans la matrice
// (clients, formats, aromes sont stables tant que le modal est ouvert)
let _commandeModalCache = null;
// Id de la commande dupliquée en cours d'édition (supprimée si le modal est abandonné)
let _pendingDuplicateId = null;
const formatDate = (date) => {
    if (!date) return '—';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('fr-CH');
};
const formatDateTime = (date) => new Date(date).toLocaleString('fr-CH');

// Parse "HH:MM" → total minutes since midnight, or null if invalid.
const parseHHMM = (str) => {
    if (typeof str !== 'string') return null;
    const m = /^(\d{1,2}):(\d{2})$/.exec(str.trim());
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
};

// Null-safe accessor for command/order line items.
const getItems = (cmd) => (cmd && Array.isArray(cmd.items)) ? cmd.items : [];

// Returns active rows from a DB table (rows where actif !== false).
const getActive = (tableName) => DB.get(tableName).filter(r => r.actif);

// Custom confirmation dialog returning a Promise<boolean>.
// Uses the same modal infrastructure as the rest of the app.
// Resolves false on Escape, overlay click, or close-X (any external dismissal).
const confirmDialog = (message, { danger = false, confirmLabel = 'Confirmer', cancelLabel = 'Annuler', title = 'Confirmation' } = {}) => {
    return new Promise((resolve) => {
        const safeMsg = escapeHtml(message);
        const confirmBtnClass = danger ? 'btn-danger' : 'btn-primary';
        modal.show(title,
            `<p style="margin: 8px 0;">${safeMsg}</p>`,
            `<button class="btn btn-secondary" id="__confirmCancelBtn" type="button">${escapeHtml(cancelLabel)}</button>
             <button class="btn ${confirmBtnClass}" id="__confirmOkBtn" type="button">${escapeHtml(confirmLabel)}</button>`
        );
        const overlayEl = document.getElementById('modalOverlay');
        let settled = false;
        const settle = (result) => {
            if (settled) return;
            settled = true;
            observer?.disconnect();
            modal.hide();
            resolve(result);
        };
        // Watch for the modal overlay losing the 'active' class (Escape, overlay click, X button).
        const observer = overlayEl ? new MutationObserver(() => {
            if (!overlayEl.classList.contains('active')) settle(false);
        }) : null;
        observer?.observe(overlayEl, { attributes: true, attributeFilter: ['class'] });
        document.getElementById('__confirmOkBtn')?.addEventListener('click', () => settle(true));
        document.getElementById('__confirmCancelBtn')?.addEventListener('click', () => settle(false));
    });
};

// Toggle a button's busy/loading state. Disables, swaps content, returns a restore() function.
const setBusy = (btnEl, label = '…') => {
    if (!btnEl) return () => {};
    const originalHTML = btnEl.innerHTML;
    const originalDisabled = btnEl.disabled;
    btnEl.disabled = true;
    btnEl.setAttribute('aria-busy', 'true');
    btnEl.innerHTML = `<span class="spinner" aria-hidden="true"></span> ${escapeHtml(label)}`;
    return () => {
        btnEl.innerHTML = originalHTML;
        btnEl.disabled = originalDisabled;
        btnEl.removeAttribute('aria-busy');
    };
};
const getLocalDateISOString = () => {
    const date = new Date();
    const offset = date.getTimezoneOffset();
    date.setMinutes(date.getMinutes() - offset);
    return date.toISOString().split('T')[0];
};

const getNextCommandeNumero = () => {
    const commandes = DB.get('commandes');
    let maxNum = 0;
    commandes.forEach(cmd => {
        const num = parseInt(cmd.numero || '0', 10);
        if (num > maxNum) maxNum = num;
    });
    const meta = DB._readMeta();
    const persisted = parseInt(meta.lastCommandeNumero || '0', 10);
    const next = Math.max(persisted, maxNum) + 1;
    meta.lastCommandeNumero = next;
    DB._writeMeta(meta);
    return String(next).padStart(5, '0');
};

const getCommandeNumero = (commande) => {
    return commande.numero || commande.id.slice(-5);
};

const getNextBLNumero = () => {
    const livraisons = DB.get('livraisons');
    let maxNum = 0;
    livraisons.forEach(liv => {
        const num = parseInt(liv.numeroBL || '0', 10);
        if (num > maxNum) maxNum = num;
    });
    const meta = DB._readMeta();
    const persisted = parseInt(meta.lastBLNumero || '0', 10);
    const next = Math.max(persisted, maxNum) + 1;
    meta.lastBLNumero = next;
    DB._writeMeta(meta);
    return String(next).padStart(5, '0');
};

const getBLNumero = (livraison) => {
    return livraison.numeroBL || livraison.id.slice(-5);
};

// Unit Normalization & Conversion
const CANONICAL_UNITS = ['g', 'kg', 'mL', 'L', 'pcs', 'm', 'caisse(s)'];
const UNIT_ALIASES = {
    'gr': 'g', 'gramme': 'g', 'grammes': 'g',
    'ml': 'mL', 'millilitre': 'mL', 'millilitres': 'mL',
    'l': 'L', 'litre': 'L', 'litres': 'L',
    'kilogramme': 'kg', 'kilogrammes': 'kg'
};
const UNIT_FAMILY = {
    'g': 'mass', 'kg': 'mass',
    'mL': 'volume', 'L': 'volume',
    'pcs': 'count', 'caisse(s)': 'count',
    'm': 'length'
};
const CONVERSION_FACTORS = {
    mass: { gToKg: 0.001, kgToG: 1000 },
    volume: { mLToL: 0.001, LToML: 1000 }
};

const normalizeUnit = (unit) => {
    if (!unit) return null;
    const lower = String(unit).toLowerCase().trim();
    return UNIT_ALIASES[lower] || lower;
};

const isValidUnit = (unit) => {
    return CANONICAL_UNITS.includes(normalizeUnit(unit));
};

const getUnitFamily = (unit) => {
    return UNIT_FAMILY[normalizeUnit(unit)] || null;
};

const areUnitsCompatible = (unit1, unit2) => {
    const u1 = normalizeUnit(unit1);
    const u2 = normalizeUnit(unit2);
    if (!u1 || !u2) return false;
    return getUnitFamily(u1) === getUnitFamily(u2) && getUnitFamily(u1) !== null;
};

const convertQuantity = (quantity, fromUnit, toUnit) => {
    const from = normalizeUnit(fromUnit);
    const to = normalizeUnit(toUnit);
    if (!from || !to) return null;
    if (!areUnitsCompatible(from, to)) return null;

    const qty = parseFloat(quantity);
    if (isNaN(qty)) return null;

    if (from === to) return qty;

    const family = getUnitFamily(from);
    if (family === 'mass') {
        if (from === 'g' && to === 'kg') return qty * CONVERSION_FACTORS.mass.gToKg;
        if (from === 'kg' && to === 'g') return qty * CONVERSION_FACTORS.mass.kgToG;
    }
    if (family === 'volume') {
        if (from === 'mL' && to === 'L') return qty * CONVERSION_FACTORS.volume.mLToL;
        if (from === 'L' && to === 'mL') return qty * CONVERSION_FACTORS.volume.LToML;
    }
    return null;
};

const displayUnit = (unit) => {
    return normalizeUnit(unit) || unit;
};

// Data Storage with Firebase sync
const FIREBASE_FIRESTORE_URL = 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

const compareSyncTimestamps = (cloudT, localT) => {
    if (!localT) return 'cloud';
    if (!cloudT) return 'local';
    if (cloudT === localT) return 'equal';
    return cloudT > localT ? 'cloud' : 'local';
};

const delaySyncRetry = (attempt) => new Promise(resolve => setTimeout(resolve, attempt === 2 ? 2000 : 8000));

const DB = {
    firebaseSynced: false,

    _readMeta: () => {
        try {
            return JSON.parse(localStorage.getItem('thecol_meta')) || {};
        } catch (e) {
            console.error('Error parsing sync meta:', e);
            return {};
        }
    },

    _writeMeta: (meta) => {
        try {
            localStorage.setItem('thecol_meta', JSON.stringify(meta));
        } catch (e) {
            console.error('Error saving sync meta:', e);
        }
    },

    _touchMeta: (key, timestamp) => {
        const meta = DB._readMeta();
        meta[key] = timestamp || new Date().toISOString();
        DB._writeMeta(meta);
    },
    
    get: (key) => {
        const data = localStorage.getItem('thecol_' + key);
        if (!data) return [];
        try {
            const parsed = JSON.parse(data);
            return Array.isArray(parsed) ? parsed : [];
        } catch (e) {
            console.error('Error parsing data for key ' + key, e);
            showToast('Données corrompues pour « ' + key + ' ». Restaurez depuis Firebase.', 'error');
            return [];
        }
    },
    
    set: (key, data) => {
        let localOk = true;
        try {
            localStorage.setItem('thecol_' + key, JSON.stringify(data));
        } catch (e) {
            localOk = false;
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                console.warn('localStorage full for key ' + key + ', attempting Firebase sync');
            } else {
                console.error('Error saving data for key ' + key, e);
            }
        }
        DB._touchMeta(key);
        if (window.firebaseReady && window.firebaseDb) {
            DB.syncToFirebase(key, data);
        }
        if (!localOk) {
            showToast('Stockage local plein. Synchronisation cloud effectuée.', 'warning');
        }
    },
    
    syncToFirebase: async (key, data) => {
        if (!window.firebaseReady || !window.firebaseDb) return;
        let lastError = null;
        for (let attempt = 1; attempt <= 3; attempt++) {
            try {
                const { setDoc, doc } = await import(FIREBASE_FIRESTORE_URL);
                await setDoc(doc(window.firebaseDb, 'data', key), { data: data, updatedAt: new Date().toISOString() });
                return;
            } catch (e) {
                lastError = e;
                console.error(`Firebase sync error for ${key} (tentative ${attempt}/3):`, e);
                if (attempt < 3) await delaySyncRetry(attempt);
            }
        }
        showToast('Synchronisation cloud échouée pour « ' + key + ' » — données enregistrées localement uniquement.', 'error');
    },
    
    setMany: async (entries) => {
        Object.keys(entries).forEach(key => {
            try {
                localStorage.setItem('thecol_' + key, JSON.stringify(entries[key]));
            } catch (e) {
                console.error('Error saving data for key ' + key, e);
            }
        });
        const timestamp = new Date().toISOString();
        DB._writeManyMeta(entries, timestamp);
        if (window.firebaseReady && window.firebaseDb) {
            let lastError = null;
            for (let attempt = 1; attempt <= 3; attempt++) {
                try {
                    const { writeBatch, doc } = await import(FIREBASE_FIRESTORE_URL);
                    const batch = writeBatch(window.firebaseDb);
                    Object.keys(entries).forEach(key => {
                        batch.set(doc(window.firebaseDb, 'data', key), { data: entries[key], updatedAt: timestamp });
                    });
                    await batch.commit();
                    return;
                } catch (e) {
                    lastError = e;
                    console.error(`Firebase batch sync error (tentative ${attempt}/3):`, e);
                    if (attempt < 3) await delaySyncRetry(attempt);
                }
            }
            showToast('Synchronisation cloud échouée pour plusieurs tables — données enregistrées localement uniquement.', 'error');
        }
    },
    
    _writeManyMeta: (entries, timestamp) => {
        const meta = DB._readMeta();
        Object.keys(entries).forEach(key => {
            meta[key] = timestamp;
        });
        DB._writeMeta(meta);
    },

    _compareMeta: async () => {
        if (!window.firebaseReady || !window.firebaseDb) return null;
        try {
            const { getDocs, collection } = await import(FIREBASE_FIRESTORE_URL);
            const snapshot = await getDocs(collection(window.firebaseDb, 'data'));
            const localEntries = {};
            const cloudEntries = {};
            const pendingTables = [];
            let pendingTableCount = 0;
            snapshot.forEach(docSnap => {
                const key = docSnap.id;
                const cloudData = docSnap.data().data;
                if (!Array.isArray(cloudData)) return;
                const cloudTimestamp = docSnap.data().updatedAt;
                const localTimestamp = DB._readMeta()[key] || null;
                const isLocalNewer = compareSyncTimestamps(cloudTimestamp, localTimestamp) === 'local';
                const needsSync = isLocalNewer && (cloudTimestamp || localTimestamp);
                pendingTableCount += needsSync ? 1 : 0;
                pendingTables.push({ key, cloudTimestamp, localTimestamp, needsSync });
            });
            return { pendingTables, pendingTableCount };
        } catch (e) {
            console.error('Firebase meta load error:', e);
            return null;
        }
    },

    _shouldSync: async () => {
        if (!window.firebaseReady || !window.firebaseDb) return { shouldSync: false };
        const meta = await DB._compareMeta();
        if (!meta || meta.pendingTableCount === 0) return { shouldSync: false, meta };
        const ok = await confirmDialog(`Certaines données locales (${meta.pendingTableCount} table(s)) sont plus récentes que le cloud. Les pousser vers le cloud ?`);
        return { shouldSync: !!ok, meta };
    },
    
    loadFromFirebase: async (showNotification = true) => {
        if (!window.firebaseReady || !window.firebaseDb) return;
        try {
            // Backup before sync
            const backup = {};
            for (let i = 0; i < localStorage.length; i++) {
                const k = localStorage.key(i);
                if (k.startsWith('thecol_') && !k.startsWith('thecol_backup_')) {
                    backup[k] = localStorage.getItem(k);
                }
            }
            localStorage.setItem('thecol_backup_pre_sync', JSON.stringify(backup));

            const { getDocs, collection } = await import(FIREBASE_FIRESTORE_URL);
            const snapshot = await getDocs(collection(window.firebaseDb, 'data'));
            let hasData = false;
            let localToCloud = 0;
            let cloudToLocal = 0;
            const pushAfter = [];
            snapshot.forEach(docSnap => {
                const key = docSnap.id;
                const cloudData = docSnap.data().data;
                if (!Array.isArray(cloudData)) return;
                hasData = true;
                const cloudTimestamp = docSnap.data().updatedAt;
                const localTimestamp = DB._readMeta()[key] || null;
                if (compareSyncTimestamps(cloudTimestamp, localTimestamp) === 'local') {
                    localToCloud++;
                    pushAfter.push(key);
                } else {
                    cloudToLocal++;
                    localStorage.setItem('thecol_' + key, JSON.stringify(cloudData));
                    DB._touchMeta(key, cloudTimestamp || new Date().toISOString());
                }
            });
            if (hasData) {
                DB.firebaseSynced = true;
            }
            for (const key of pushAfter) {
                const localData = DB.get(key);
                await DB.syncToFirebase(key, localData);
            }
            if (showNotification) {
                if (cloudToLocal > 0) {
                    showToast(`${cloudToLocal} table(s) mise(s) à jour depuis le cloud`);
                } else if (localToCloud > 0) {
                    showToast('Données locales déjà à jour');
                } else {
                    showToast('Aucune donnée dans le cloud');
                }
            }
        } catch(e) {
            console.error('Firebase load error:', e);
            showToast('Échec du chargement depuis le cloud', 'error');
        }
    },
    
    init: () => {
        const tables = ['employees', 'aromes', 'formats', 'recettes', 'clients', 'lots', 'history', 'commandes', 'pointages', 'inventaire', 'livraisons'];
        tables.forEach(table => {
            if (!localStorage.getItem('thecol_' + table)) {
                localStorage.setItem('thecol_' + table, '[]');
            }
        });
    },

    // UI filter persistence — keeps storage keys uniform under "thecol_filter_<name>".
    getFilter: (name) => localStorage.getItem('thecol_filter_' + name) || '',
    setFilter: (name, value) => localStorage.setItem('thecol_filter_' + name, value || ''),
    
    // Sync from Firebase on page load
    initFromFirebase: async () => {
        if (!window.firebaseReady || !window.firebaseDb) return;
        await DB.loadFromFirebase();
    }
};

const calculateAvailableStock = (lots, referenceDate = new Date()) => {
    const ref = dateOnly(referenceDate);
    const stock = {};
    lots.filter(lot => !lot.dlc || dateOnly(lot.dlc) >= ref).forEach(lot => {
        const key = `${lot.arome}-${lot.format}`;
        if (!stock[key]) stock[key] = 0;
        stock[key] += lot.quantite || 0;
    });
    return stock;
};

const restoreBackupPreSync = () => {
    try {
        const raw = localStorage.getItem('thecol_backup_pre_sync');
        if (!raw) {
            showToast('Aucun backup de synchronisation disponible', 'warning');
            return;
        }
        const backup = JSON.parse(raw);
        let count = 0;
        const meta = DB._readMeta();
        Object.keys(backup).forEach(k => {
            if (!k.startsWith('thecol_') || k.startsWith('thecol_backup_') || k.startsWith('thecol_filter_') || k.startsWith('thecol_show_') || k === 'thecol_meta') return;
            localStorage.setItem(k, backup[k]);
            meta[k.slice('thecol_'.length)] = new Date().toISOString();
            count++;
        });
        DB._writeMeta(meta);
        showToast(`Backup restauré : ${count} entrée(s) restaurée(s)`, 'success');
        renderCurrentView();
    } catch (e) {
        console.error('Backup restore error:', e);
        showToast('Échec de la restauration du backup', 'error');
    }
};
window.restoreBackupPreSync = restoreBackupPreSync;

// Manual sync function
window.forceFirebaseSync = async () => {
    const syncBtn = document.getElementById('syncBtn');
    const restoreBtn = setBusy(syncBtn, 'Sync…');
    const { shouldSync } = await DB._shouldSync();
    if (!shouldSync) {
        restoreBtn();
        return;
    }
    modal.show('Synchronisation',
        '<div style="text-align:center; padding: 20px;" aria-busy="true"><p><span class="spinner" aria-hidden="true"></span> Synchronisation en cours avec le Cloud...</p><p>Veuillez patienter.</p></div>',
        '');
    document.getElementById('modalClose').style.display = 'none'; // Lock modal during sync
    try {
        await DB.loadFromFirebase(true);
        renderCurrentView();
    } catch(e) {
        showToast('Erreur lors de la synchronisation', 'error');
    } finally {
        document.getElementById('modalClose').style.display = 'block';
        modal.hide();
        restoreBtn();
    }
};

// Default values from Stock project
const DEFAULT_AROMES = ['hibiscus', 'mure sauvage', 'poire à botzi', 'sureau', 'herbes des alpes'];
const DEFAULT_FORMATS = ['0.25l', '0.5l', '1l'];
const DEFAULT_COULEURS = {
    'hibiscus': '#E74C3C',
    'mure sauvage': '#8E44AD',
    'poire à botzi': '#27AE60',
    'sureau': '#3498DB',
    'herbes des alpes': '#2ECC71'
};

// Initialize default data if empty
// Calculate dates (same as Stock project)
const calculateDates = (productionDate) => {
    const prod = new Date(productionDate);
    const saleLimit = new Date(prod);
    saleLimit.setMonth(saleLimit.getMonth() + 1);
    const consumptionLimit = new Date(prod);
    consumptionLimit.setMonth(consumptionLimit.getMonth() + 6);
    return {
        dlv: saleLimit.toISOString().split('T')[0],
        dlc: consumptionLimit.toISOString().split('T')[0]
    };
};

const escapeHtml = (str) => {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
};

const dateOnly = (d) => {
    const dt = d instanceof Date ? new Date(d.getTime()) : new Date(d);
    dt.setHours(0, 0, 0, 0);
    return dt;
};

const getStatus = (dlc, now, oneMonthFromNow) => {
    if (!dlc) return 'ok';
    const dlcDate = dateOnly(dlc);
    if (now > dlcDate) return 'expired';
    if (dlcDate <= oneMonthFromNow) return 'warning';
    return 'ok';
};

// Toast Notifications
const showToast = (message, type = 'success') => {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20">
            ${type === 'success' ? '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>' :
              type === 'error' ? '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>' :
              '<path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>'}
        </svg>
        <span>${escapeHtml(message)}</span>
    `;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
};

const safeRender = (html) => {
    const el = document.getElementById('content');
    if (el) el.innerHTML = html;
};

// UI Lock helper (Anti-Double Clic)
const disableSaveBtn = (event) => {
    if (!event || !event.target) return null;
    const btn = event.target;
    if (btn.tagName !== 'BUTTON') return null;
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'En cours...';
    return () => {
        btn.disabled = false;
        btn.innerHTML = originalText;
    };
};

// Modal
const modal = {
    _previouslyFocused: null,
    show: (title, body, footer, size = '') => {
        const titleEl = document.getElementById('modalTitle');
        const bodyEl = document.getElementById('modalBody');
        const footerEl = document.getElementById('modalFooter');
        const overlayEl = document.getElementById('modalOverlay');
        if (titleEl) titleEl.textContent = title || '';
        if (bodyEl) bodyEl.innerHTML = body || '';
        if (footerEl) footerEl.innerHTML = footer || '';
        if (overlayEl) {
            overlayEl.classList.add('active');
            overlayEl.setAttribute('aria-hidden', 'false');
        }
        const container = document.getElementById('modalContainer');
        if (container) {
            container.className = 'modal-container' + (size === 'large' ? ' modal-large' : '');
        }
        modal._previouslyFocused = document.activeElement;
        const focusableSelector = 'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled])';
        // Prefer focusing inside the body (form fields). Fall back to footer (action buttons),
        // which is what we want for confirmDialog whose body has no inputs.
        const bodyFocusables = bodyEl ? bodyEl.querySelectorAll(focusableSelector) : [];
        const footerFocusables = footerEl ? footerEl.querySelectorAll(focusableSelector) : [];
        const target = bodyFocusables[0] || footerFocusables[0];
        if (target) setTimeout(() => target.focus(), 0);
    },
    hide: () => {
        const overlayEl = document.getElementById('modalOverlay');
        if (overlayEl) {
            overlayEl.classList.remove('active');
            overlayEl.setAttribute('aria-hidden', 'true');
        }
        if (modal._previouslyFocused && typeof modal._previouslyFocused.focus === 'function') {
            modal._previouslyFocused.focus();
            modal._previouslyFocused = null;
        }
        // Libere le cache snapshot du modal de commande
        if (typeof _commandeModalCache !== 'undefined') _commandeModalCache = null;
        // Une commande dupliquée jamais finalisée (dateLivraison vide) est retirée à la fermeture
        if (typeof _pendingDuplicateId !== 'undefined' && _pendingDuplicateId) {
            const dupId = _pendingDuplicateId;
            _pendingDuplicateId = null;
            const commandes = DB.get('commandes');
            const index = commandes.findIndex(c => c.id === dupId && !c.dateLivraison);
            if (index !== -1) {
                commandes.splice(index, 1);
                DB.set('commandes', commandes);
                showToast('Duplication annulée', 'warning');
                renderCommandes();
            }
        }
    }
};

document.getElementById('modalClose').addEventListener('click', modal.hide);
document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === e.currentTarget) modal.hide();
});

// Close modal on Escape; trap Tab inside modal while open
document.addEventListener('keydown', (e) => {
    const overlayEl = document.getElementById('modalOverlay');
    if (!overlayEl || !overlayEl.classList.contains('active')) return;
    if (e.key === 'Escape') {
        e.preventDefault();
        modal.hide();
        return;
    }
    if (e.key === 'Tab') {
        const focusables = overlayEl.querySelectorAll(
            'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled]), button:not([disabled]), a[href]'
        );
        if (focusables.length === 0) return;
        const first = focusables[0];
        const last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) {
            e.preventDefault();
            last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
            e.preventDefault();
            first.focus();
        }
    }
});

// Navigation
const router = () => {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const page = hash.split('?')[0];
    navigateTo(page);
};

const navigateTo = (page) => {
    document.querySelectorAll('.nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.bottom-nav-item').forEach(el => el.classList.remove('active'));
    document.querySelectorAll(`[data-page="${page}"]`).forEach(el => el.classList.add('active'));
    
    const titles = {
        dashboard: 'Dashboard',
        stock: 'Gestion du stock',
        pointage: 'Pointage',
        commandes: 'Commandes',
        livraisons: 'Livraisons',
        archives: 'Archives',
        production: 'Planificateur de production',
        inventaire: 'Inventaire',
        parametres: 'Paramètres'
    };
    const titleEl = document.getElementById('pageTitle');
    if (titleEl) titleEl.textContent = titles[page] || 'Dashboard';
    
    const views = {
        dashboard: renderDashboard,
        stock: renderStock,
        pointage: renderPointage,
        commandes: renderCommandes,
        livraisons: renderLivraisons,
        archives: renderArchives,
        production: renderProduction,
        inventaire: renderInventaire,
        parametres: renderParametres
    };
    
    const contentEl = document.getElementById('content');
    if (!contentEl) return;
    
    const viewFn = views[page];
    if (typeof viewFn === 'function') {
        viewFn();
    } else {
        renderDashboard();
    }
};

// Render Current View dynamically
const renderCurrentView = () => {
    const hash = window.location.hash.slice(1) || 'dashboard';
    const page = hash.split('?')[0];
    navigateTo(page);
};

// Global Error Handling
window.addEventListener('error', (e) => {
    if (e.message && e.message.includes('ResizeObserver')) return; // Ignore benign browser errors
    showToast(`Erreur système : ${e.message}`, 'error');
});
window.addEventListener('unhandledrejection', (e) => {
    showToast(`Erreur réseau/sync : ${e.reason || 'inconnue'}`, 'error');
});

// Cross-tab synchronization
window.addEventListener('storage', (e) => {
    if (!e.key || !e.key.startsWith('thecol_')) return;
    if (e.key.startsWith('thecol_filter_') || e.key.startsWith('thecol_show_') || e.key === 'thecol_meta') return;
    renderCurrentView();
});

window.addEventListener('hashchange', router);

// Dashboard
const renderDashboard = () => {
    const lots = DB.get('lots') || [];
    const commandes = DB.get('commandes') || [];
    const pointages = DB.get('pointages') || [];
    const employes = DB.get('employees') || [];
    const aromes = DB.get('aromes') || [];
    const formats = DB.get('formats') || [];

    const today = new Date();
    const todayStr = getLocalDateISOString();
    const oneMonthFromNow = new Date();
    oneMonthFromNow.setMonth(oneMonthFromNow.getMonth() + 1);
    const inSevenDays = new Date();
    inSevenDays.setDate(inSevenDays.getDate() + 7);
    const inThreeDays = new Date();
    inThreeDays.setDate(inThreeDays.getDate() + 3);
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const expiries = lots.filter(lot => lot.dlc && new Date(lot.dlc) < today).length;
    const moinsUnMois = lots.filter(lot => {
        if (!lot.dlc) return false;
        const dlc = new Date(lot.dlc);
        return dlc >= today && dlc <= oneMonthFromNow;
    }).length;
    const sellableBottles = lots.filter(lot => lot.dlc && new Date(lot.dlc) >= today).reduce((sum, lot) => sum + (lot.quantite || 0), 0);

    // Stock produit ces 7 derniers jours
    const stockLast7Days = lots
        .filter(lot => lot.dateProduction && new Date(lot.dateProduction) >= sevenDaysAgo)
        .reduce((sum, lot) => sum + (lot.quantite || 0), 0);

    const commandesEnAttente = commandes.filter(c => c.statut === 'en_attente');
    const commandesUrgentes = commandesEnAttente.filter(c => c.dateLivraison && new Date(c.dateLivraison) <= inThreeDays).length;

    const commandesPeriode = commandes.filter(c => c.statut !== 'annulee' && c.statut !== 'livrée');
    const stockDisponible = calculateAvailableStock(lots, today);

    const besoins = {};
    commandesPeriode.forEach(cmd => {
        getItems(cmd).forEach(item => {
            const arome = aromes.find(a => a.id === item.aromeId);
            const format = formats.find(f => f.id === item.formatId);
            const key = `${arome?.nom || ''}-${format?.nom || ''}`;
            if (!besoins[key]) {
                besoins[key] = {
                    aromeId: item.aromeId,
                    formatId: item.formatId,
                    aromeNom: arome?.nom || '',
                    formatNom: format?.nom || '',
                    quantite: 0
                };
            }
            besoins[key].quantite += item.quantite;
        });
    });

    const bouteillesAProduire = Object.entries(besoins).map(([key, b]) => {
        const disponible = stockDisponible[key] || 0;
        const aProduire = Math.max(0, b.quantite - disponible);
        return { ...b, disponible, aProduire };
    }).filter(b => b.aProduire > 0).sort((a, b) => b.aProduire - a.aProduire);

    const totalBouteillesAProduire = bouteillesAProduire.reduce((sum, b) => sum + b.aProduire, 0);

    // Pointage du jour : a-t-on déjà pointé ? (premier pointage du patron / actif)
    const pointagesAujourdhui = pointages.filter(p => p.date === todayStr);
    const heuresAujourdhui = pointagesAujourdhui.reduce((sum, p) => {
        const debutMin = parseHHMM(p.heureDebut);
        const finMin = parseHHMM(p.heureFin);
        if (debutMin === null || finMin === null) return sum;
        const pause = parseInt(p.pause, 10) || 0;
        const minutes = (finMin - debutMin) - pause;
        return sum + (minutes > 0 ? minutes / 60 : 0);
    }, 0);

    // Card hero pointage : on affiche l'heure actuelle + statut
    const currentTime = new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
    const pointageSubtext = pointagesAujourdhui.length === 0
        ? 'Pas encore pointé aujourd\'hui'
        : `${pointagesAujourdhui.length} pointage${pointagesAujourdhui.length > 1 ? 's' : ''} • ${heuresAujourdhui.toFixed(1)}h`;

    // 3 todos dynamiques selon l'état des données
    const todos = [];
    if (commandesUrgentes > 0) {
        todos.push({
            label: `${commandesUrgentes} commande${commandesUrgentes > 1 ? 's' : ''} urgente${commandesUrgentes > 1 ? 's' : ''} (≤ 3 jours)`,
            href: '#commandes',
            done: false
        });
    }
    if (expiries > 0) {
        todos.push({
            label: `${expiries} lot${expiries > 1 ? 's' : ''} expiré${expiries > 1 ? 's' : ''} à retirer`,
            href: '#stock',
            done: false
        });
    }
    if (pointagesAujourdhui.length === 0) {
        todos.push({ label: 'Pointer ton arrivée', href: '#pointage', done: false });
    } else {
        todos.push({ label: 'Pointage du jour enregistré', href: '#pointage', done: true });
    }
    if (totalBouteillesAProduire > 0 && todos.length < 3) {
        todos.push({
            label: `Planifier ${totalBouteillesAProduire} bouteille${totalBouteillesAProduire > 1 ? 's' : ''} à produire`,
            href: '#production',
            done: false
        });
    }
    if (moinsUnMois > 0 && todos.length < 3) {
        todos.push({
            label: `${moinsUnMois} lot${moinsUnMois > 1 ? 's' : ''} DLC < 1 mois`,
            href: '#stock',
            done: false
        });
    }
    while (todos.length < 3) {
        todos.push({ label: 'Tout est en ordre 👌', href: '#dashboard', done: true });
    }
    const top3Todos = todos.slice(0, 3);

    const showAlert = expiries > 0 || moinsUnMois > 0;

    safeRender(`
        <div class="page-header-big">
            <h1>Aujourd'hui</h1>
            <div class="header-subtext">${formatDate(today)}</div>
        </div>

        <div class="card card--hero-dark dash-hero-pointage" style="margin-bottom: 16px;">
            <div class="section-label">POINTAGE</div>
            <div class="dash-hero-time">${currentTime}</div>
            <div class="dash-hero-subtext">${pointageSubtext}</div>
            <a href="#pointage" class="dash-hero-btn">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                ${pointagesAujourdhui.length === 0 ? 'Pointer mon arrivée' : 'Voir mes pointages'}
            </a>
        </div>

        <div class="card" style="margin-bottom: 16px;">
            <div class="card-header" style="margin-bottom: 8px; padding-bottom: 0; border: none;">
                <h3 class="card-title">3 choses à faire</h3>
            </div>
            <div class="dash-todo-list">
                ${top3Todos.map(t => `
                    <a href="${t.href}" class="dash-todo-item ${t.done ? 'done' : ''}">
                        <span class="dash-todo-check"></span>
                        <span class="dash-todo-label">${escapeHtml(t.label)}</span>
                        <span class="dash-todo-arrow">›</span>
                    </a>
                `).join('')}
            </div>
        </div>

        <div class="dash-kpi-grid">
            <a href="#stock" class="dash-kpi-card">
                <div class="dash-kpi-label">Stock vendable</div>
                <div class="dash-kpi-value">${sellableBottles}</div>
                <div class="dash-kpi-sub">${stockLast7Days > 0 ? `↑ +${stockLast7Days} cette semaine` : 'aucune prod cette semaine'}</div>
            </a>
            <a href="#commandes" class="dash-kpi-card">
                <div class="dash-kpi-label">Commandes</div>
                <div class="dash-kpi-value">${commandesEnAttente.length}</div>
                <div class="dash-kpi-sub ${commandesUrgentes > 0 ? 'urgent' : ''}">${commandesUrgentes > 0 ? `${commandesUrgentes} urgente${commandesUrgentes > 1 ? 's' : ''}` : 'en attente'}</div>
            </a>
        </div>

        ${showAlert ? `
            <a href="#stock" class="dash-alert">
                <span class="dash-alert-icon">⚠️</span>
                <div class="dash-alert-text">
                    <strong>Stock à vérifier</strong>
                    ${expiries > 0 ? `${expiries} expiré${expiries > 1 ? 's' : ''}` : ''}${expiries > 0 && moinsUnMois > 0 ? ' • ' : ''}${moinsUnMois > 0 ? `${moinsUnMois} DLC < 1 mois` : ''}
                </div>
                <span class="dash-todo-arrow">›</span>
            </a>
        ` : ''}

        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Bouteilles à produire</h3>
                ${totalBouteillesAProduire > 0 ? `<a href="#production" class="btn btn-sm btn-ghost">Voir tout</a>` : ''}
            </div>
            ${bouteillesAProduire.length === 0 ? '<p style="color: var(--text-light); font-size: var(--font-body);">Tout le stock est disponible ✓</p>' : `
                ${bouteillesAProduire.slice(0, 5).map((b, index, arr) => {
                    const arome = aromes.find(a => a.id === b.aromeId);
                    const format = formats.find(f => f.id === b.formatId);
                    const formatLitres = format?.contenanceCl ? `${(format.contenanceCl / 100).toFixed(2).replace(/\.0+$/, '').replace(/(\.\d*[1-9])0+$/, '$1')}l` : b.formatNom;
                    return `<div class="flex-between" style="padding: 10px 0; ${index < arr.length - 1 ? 'border-bottom: 1px solid var(--border-light);' : ''}">
                        <span style="display: inline-flex; align-items: center; gap: 8px;"><span class="color-dot" style="background: ${arome?.couleur || '#ccc'}; width: 10px; height: 10px; border-radius: 50%; display: inline-block;"></span>${escapeHtml(b.aromeNom)} ${escapeHtml(formatLitres)}</span>
                        <div style="text-align: right;">
                            <div style="font-size: var(--font-caption); color: var(--text-light);">Stock : ${b.disponible}</div>
                            <strong style="color: var(--primary);">À produire : ${b.aProduire}</strong>
                        </div>
                    </div>`;
                }).join('')}
                ${bouteillesAProduire.length > 5 ? `<div style="text-align: center; padding-top: 10px;"><a href="#production" style="color: var(--primary); font-size: var(--font-caption); text-decoration: none;">+ ${bouteillesAProduire.length - 5} autres</a></div>` : ''}
                <div class="flex-between" style="margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border-light);">
                    <strong>Total : ${totalBouteillesAProduire} bt</strong>
                    <a href="#production" class="btn btn-sm btn-primary">Planifier</a>
                </div>
            `}
        </div>
    `);
};

// Stock Management
// Stock — refonte Phase 4
const renderStock = () => {
    const lots = DB.get('lots') || [];
    const aromes = DB.get('aromes') || [];
    const formats = DB.get('formats') || [];

    const today = new Date();

    // Filtres persistés
    const savedQuery  = (DB.getFilter('stockQuery')  || '').toString().toLowerCase().trim();
    const savedArome  = DB.getFilter('stockArome')  || '';
    const savedFormat = DB.getFilter('stockFormat') || '';
    const savedStatut = DB.getFilter('stockStatut') || '';

    // Statut DLC : dates hoistées (utilisées pour chaque lot)
    const statusRefDate = dateOnly(new Date());
    const statusWarnDate = new Date(statusRefDate);
    statusWarnDate.setMonth(statusWarnDate.getMonth() + 1);

    // Calculs globaux
    const sellableBottles = lots
        .filter(lot => lot.dlc && new Date(lot.dlc) >= today)
        .reduce((sum, lot) => sum + (lot.quantite || 0), 0);

    // Calcul vendable par arôme
    const sellableByAroma = {};
    aromes.filter(a => a.actif).forEach(a => { sellableByAroma[a.nom] = 0; });
    lots.forEach(lot => {
        if (!lot.dlc || new Date(lot.dlc) < today) return;
        if (sellableByAroma[lot.arome] !== undefined) {
            sellableByAroma[lot.arome] += (lot.quantite || 0);
        }
    });

    // Filtrer les lots selon les filtres actifs
    const filteredLots = lots.filter(lot => {
        if (savedArome  && lot.arome  !== savedArome)  return false;
        if (savedFormat && lot.format !== savedFormat) return false;
        if (savedStatut) {
            const st = getStatus(lot.dlc, statusRefDate, statusWarnDate);
            if (st !== savedStatut) return false;
        }
        if (savedQuery) {
            const hay = `${lot.id || ''} ${lot.arome || ''} ${lot.format || ''} ${lot.quantite || ''}`.toLowerCase();
            if (!hay.includes(savedQuery)) return false;
        }
        return true;
    }).sort((a, b) => new Date(b.dateProduction || 0) - new Date(a.dateProduction || 0));

    const tileAromas = aromes.filter(a => a.actif);
    const formatsActifs = formats.filter(f => f.actif);

    const aromaTilesHtml = `
        <a href="#stock" class="aroma-tile aroma-all ${!savedArome ? 'active' : ''}" data-arome="">
            <div class="aroma-tile-header"><span class="aroma-tile-dot"></span><span class="aroma-tile-name">Tous</span></div>
            <div class="aroma-tile-value">${sellableBottles}</div>
            <div class="aroma-tile-sub">btl vendables</div>
        </a>
        ${tileAromas.map(a => `
            <a href="#stock" class="aroma-tile ${savedArome === a.nom ? 'active' : ''}" data-arome="${escapeHtml(a.nom)}">
                <div class="aroma-tile-header">
                    <span class="aroma-tile-dot" style="background:${escapeHtml(a.couleur || '#ccc')}"></span>
                    <span class="aroma-tile-name">${escapeHtml(a.nom)}</span>
                </div>
                <div class="aroma-tile-value">${sellableByAroma[a.nom] || 0}</div>
                <div class="aroma-tile-sub">btl vendables</div>
            </a>
        `).join('')}
    `;

    // Pills formats + statuts (data-* pour éviter l'injection via onclick inline)
    const fmtPill = (val, label) => `<button type="button" class="status-pill ${savedFormat === val ? 'active' : ''}" data-format="${escapeHtml(val)}">${escapeHtml(label)}</button>`;
    const statPill = (val, label) => `<button type="button" class="status-pill ${savedStatut === val ? 'active' : ''}" data-statut="${val}">${escapeHtml(label)}</button>`;

    const lotCardsHtml = filteredLots.length === 0
        ? '<div class="commande-empty">Aucun lot ne correspond aux filtres</div>'
        : filteredLots.map(lot => {
            const arome = aromes.find(a => a.nom === lot.arome);
            const status = getStatus(lot.dlc, statusRefDate, statusWarnDate);
            const badgeClass = status === 'expired' ? 'badge-expire' : status === 'warning' ? 'badge-bientot' : 'badge-ok';
            const statusLabel = status === 'expired' ? 'Expiré' : status === 'warning' ? '< 1 mois' : 'OK';
            return `<div class="lot-card lot-status-${status}">
                <div class="lot-card-header">
                    <span class="lot-card-numero">#${escapeHtml(String(lot.id).padStart(6, '0'))}</span>
                    <span class="badge ${badgeClass}">${statusLabel}</span>
                </div>
                <div class="lot-card-aroma">
                    <span class="aroma-tile-dot" style="background:${escapeHtml(arome?.couleur || '#ccc')}"></span>
                    <span class="lot-card-aroma-name">${escapeHtml(lot.arome || '?')}</span>
                    <span class="lot-card-aroma-format">• ${escapeHtml(lot.format || '?')}</span>
                </div>
                <div class="lot-card-meta">
                    <span><strong class="lot-card-qty">${lot.quantite}</strong> bt</span>
                    <span>Prod. <strong>${formatDate(lot.dateProduction)}</strong></span>
                    <span>DLC <strong>${formatDate(lot.dlc)}</strong></span>
                </div>
                <div class="lot-card-actions">
                    ${status !== 'expired' ? `<button class="btn btn-sm btn-success" onclick="showVendreModal('${lot.id}')">Vendre</button>` : ''}
                    <button class="btn btn-sm btn-ghost" onclick="showEditLotModal('${lot.id}')">Modifier</button>
                    <button class="btn btn-sm btn-ghost" style="color: var(--error-fg);" onclick="deleteLot('${lot.id}')">Supprimer</button>
                </div>
            </div>`;
        }).join('');

    const html = `
        <div class="commandes-toolbar">
            <h1>Stock</h1>
            <button class="btn btn-primary btn-sm" onclick="showNouveauLotModal()">+ Lot</button>
        </div>

        <div class="stock-search">
            <svg class="stock-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="search"
                   placeholder="Rechercher un lot, arôme, format…"
                   value="${escapeHtml(savedQuery)}"
                   oninput="onStockSearchInput(this)">
        </div>

        <div class="aroma-tile-grid">
            ${aromaTilesHtml}
        </div>

        ${formatsActifs.length > 0 ? `
            <div class="stock-pills-row">
                <span class="stock-pills-label">Format :</span>
                <button type="button" class="status-pill ${!savedFormat ? 'active' : ''}" data-format="">Tous</button>
                ${formatsActifs.map(f => fmtPill(f.nom, f.nom)).join('')}
            </div>
        ` : ''}

        <div class="stock-pills-row">
            <span class="stock-pills-label">DLC :</span>
            <button type="button" class="status-pill ${!savedStatut ? 'active' : ''}" data-statut="">Tous</button>
            ${statPill('ok', 'OK')}
            ${statPill('warning', '< 1 mois')}
            ${statPill('expired', 'Expiré')}
        </div>

        <div class="commande-section" style="padding: 0; background: transparent; border: none; box-shadow: none;">
            <div class="commande-section-title" style="padding: 0 4px;">Lots récents</div>
            ${lotCardsHtml}
        </div>

        <div class="card" style="margin-top: 16px;">
            <button type="button" class="btn-bare" onclick="toggleHistory()" aria-expanded="false" aria-controls="historyContent" style="width:100%; text-align:left; display:flex; justify-content:space-between; align-items:center;">
                <span><span id="historyArrow" style="font-size:12px;">▶</span> Historique de production</span>
                <span style="font-size: var(--font-caption); color: var(--text-light);">${lots.length} lots</span>
            </button>
            <div id="historyContent" style="display:none;margin-top:12px;">
                <div class="table-container" style="max-height:300px;overflow-y:auto;">
                    <table>
                        <thead>
                            <tr>
                                <th>Lot</th>
                                <th>Date prod.</th>
                                <th>Arôme</th>
                                <th>Format</th>
                                <th>Qté</th>
                                <th>Ajouté le</th>
                                <th></th>
                            </tr>
                        </thead>
                        <tbody>
                            ${renderHistoryTable()}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    `;
    
    safeRender(html);
    document.querySelectorAll('.aroma-tile[data-arome]').forEach(el => {
        el.addEventListener('click', (e) => {
            e.preventDefault();
            toggleStockAromeFilter(el.dataset.arome);
        });
    });
    document.querySelectorAll('[data-format]').forEach(el => {
        el.addEventListener('click', () => toggleStockFormatFilter(el.dataset.format));
    });
    document.querySelectorAll('[data-statut]').forEach(el => {
        el.addEventListener('click', () => toggleStockStatutFilter(el.dataset.statut));
    });
};

// Debounced search handler — one render per typing pause instead of one per keystroke
const onStockSearchInput = debounce((input) => {
    DB.setFilter('stockQuery', input.value);
    renderStock();
}, 150);

// Toggles de filtres Stock (clic sur la pill active = retire le filtre)
const toggleStockAromeFilter = (aromeNom) => {
    const current = DB.getFilter('stockArome') || '';
    DB.setFilter('stockArome', current === aromeNom ? '' : aromeNom);
    renderStock();
};
const toggleStockFormatFilter = (formatNom) => {
    const current = DB.getFilter('stockFormat') || '';
    DB.setFilter('stockFormat', current === formatNom ? '' : formatNom);
    renderStock();
};
const toggleStockStatutFilter = (statut) => {
    const current = DB.getFilter('stockStatut') || '';
    DB.setFilter('stockStatut', current === statut ? '' : statut);
    renderStock();
};

const showNouveauLotModal = () => {
    const aromes = getActive('aromes');
    const formats = getActive('formats');
    const prodDate = getLocalDateISOString();
    const dates = calculateDates(prodDate);
    
    modal.show('Nouveau lot de production', `
        <form id="lotForm">
            <div class="form-row">
                <div class="form-group">
                    <label>Arôme</label>
                    <select name="arome" required>
                        ${aromes.length === 0 ? '<option value="">Aucun arôme disponible</option>' :
                          aromes.map(a => `<option value="${escapeHtml(a.nom)}">${escapeHtml(a.nom)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Format</label>
                    <select name="format" required>
                        ${formats.length === 0 ? '<option value="">Aucun format disponible</option>' :
                          formats.map(f => `<option value="${escapeHtml(f.nom)}">${escapeHtml(f.nom)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Quantité</label>
                    <input type="number" name="quantite" min="1" value="1" required>
                </div>
                <div class="form-group">
                    <label>Date de production</label>
                    <input type="date" name="dateProduction" value="${prodDate}" onchange="updateLotDates()" required>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>DLV (Date limite de vente)</label>
                    <input type="date" name="dlv" value="${dates.dlv}" required>
                </div>
                <div class="form-group">
                    <label>DLC (Date limite de consommation)</label>
                    <input type="date" name="dlc" value="${dates.dlc}" required>
                </div>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="modal.hide()">Annuler</button>
        <button class="btn btn-primary" onclick="saveLot(event)">Créer le lot</button>
    `);
};

const updateLotDates = () => {
    const prodDate = document.querySelector('input[name="dateProduction"]').value;
    if (prodDate) {
        const dates = calculateDates(prodDate);
        document.querySelector('input[name="dlv"]').value = dates.dlv;
        document.querySelector('input[name="dlc"]').value = dates.dlc;
    }
};

const toggleHistory = () => {
    const content = document.getElementById('historyContent');
    const arrow = document.getElementById('historyArrow');
    const btn = arrow?.parentElement;
    const willOpen = content.style.display === 'none';
    if (willOpen) {
        content.style.display = 'block';
        arrow.textContent = '▼';
    } else {
        content.style.display = 'none';
        arrow.textContent = '▶';
    }
    if (btn) btn.setAttribute('aria-expanded', willOpen ? 'true' : 'false');
};

const renderHistoryTable = () => {
    const history = DB.get('history') || [];
    if (history.length === 0) {
        return '<tr><td colspan="7" class="text-center">Aucun historique</td></tr>';
    }
    return history.map(record => {
        const lotNum = record.lotId ? `#${String(record.lotId)}` : 'N/A';
        return `
        <tr>
            <td>${lotNum}</td>
            <td>${formatDate(record.productionDate)}</td>
            <td>${escapeHtml(record.arome)}</td>
            <td>${escapeHtml(record.format)}</td>
            <td style="color:var(--primary);font-weight:bold;">${record.quantity}</td>
            <td>${new Date(record.dateAdded).toLocaleDateString('fr-CH')}</td>
            <td><button class="btn btn-sm btn-danger" onclick="deleteHistoryRecord('${record.id}')">✕</button></td>
        </tr>
    `}).join('');
};

const deleteHistoryRecord = (recordId) => {
    confirmDialog('Supprimer cet enregistrement ?', { danger: true }).then(ok => {
        if (!ok) return;
        const history = DB.get('history') || [];
        const index = history.findIndex(r => r.id === recordId);
        if (index !== -1) {
            history.splice(index, 1);
            DB.set('history', history);
            showToast('Enregistrement supprimé');
            renderStock();
        }
    });
};

const saveLot = (event) => {
    const reenable = disableSaveBtn(event);
    try {
        const form = document.getElementById('lotForm');
        if (!form) return;
        const formData = new FormData(form);
        
        const arome = formData.get('arome');
        const format = formData.get('format');
        const quantite = parseInt(formData.get('quantite'), 10);
        const dateProduction = formData.get('dateProduction');
        const dlv = formData.get('dlv');
        const dlc = formData.get('dlc');
        
        if (!arome || !format || !dateProduction || isNaN(quantite) || quantite <= 0) {
            showToast('Veuillez remplir tous les champs obligatoires', 'error');
            return;
        }
        
        const lots = DB.get('lots');
        const history = DB.get('history') || [];
        
        const existingLot = lots.find(l => 
            l.arome === arome && 
            l.format === format && 
            l.dateProduction === dateProduction
        );
        
        let newId;
        if (existingLot) {
            existingLot.quantite = (existingLot.quantite || 0) + quantite;
            newId = existingLot.id;
        } else {
            let maxNum = 0;
            let hasNumericId = false;
            lots.forEach(l => {
                const num = parseInt(l.id, 10);
                if (!isNaN(num)) {
                    hasNumericId = true;
                    if (num > maxNum) maxNum = num;
                }
            });
            newId = hasNumericId
                ? String(maxNum + 1).padStart(6, '0')
                : generateId();
            
            const lot = {
                id: newId,
                arome,
                format,
                quantite,
                dateProduction,
                dlv,
                dlc
            };
            lots.push(lot);
        }
        
        history.unshift({
            id: `PROD-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
            lotId: newId,
            arome,
            format,
            quantity: quantite,
            productionDate: dateProduction,
            dateAdded: new Date().toISOString()
        });
        
        DB.setMany({ lots: lots, history: history });
        
        modal.hide();
        showToast('Lot créé avec succès');
        renderStock();
    } catch (e) {
        console.error('Error saving lot:', e);
        showToast('Erreur lors de la création du lot', 'error');
    } finally {
        if (reenable) reenable();
    }
};

const deleteLot = (id) => {
    confirmDialog('Êtes-vous sûr de vouloir supprimer ce lot ?', { danger: true }).then(ok => {
        if (!ok) return;
        const lots = DB.get('lots').filter(l => l.id !== id);
        DB.set('lots', lots);
        showToast('Lot supprimé');
        renderStock();
    });
};

const showVendreModal = (lotId) => {
    const lots = DB.get('lots');
    const lot = lots.find(l => l.id === lotId);
    if (!lot) return;
    
    modal.show('Vendre des bouteilles', `
        <form id="vendreForm">
            <div class="form-group">
                <label>Quantité à vendre</label>
                <input type="number" name="quantite" min="1" max="${lot.quantite}" value="1" required>
                <small class="text-muted">Stock disponible: ${lot.quantite}</small>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="modal.hide()">Annuler</button>
        <button class="btn btn-success" onclick="vendreLot('${lotId}')">Vendre</button>
    `);
};

const vendreLot = (lotId) => {
    const quantite = parseInt(document.querySelector('#vendreForm input[name="quantite"]').value, 10);
    const lots = DB.get('lots');
    const lotIndex = lots.findIndex(l => l.id === lotId);

    if (lotIndex === -1) return;

    const lot = lots[lotIndex];
    if (isNaN(quantite) || quantite <= 0) {
        showToast('Quantité invalide', 'error');
        return;
    }
    if (quantite > (lot.quantite || 0)) {
        showToast('Quantité supérieure au stock disponible', 'error');
        return;
    }
    lot.quantite -= quantite;

    if (lot.quantite <= 0) {
        lots.splice(lotIndex, 1);
    }
    
    DB.set('lots', lots);
    modal.hide();
    showToast(`${quantite} bouteille(s) vendu(e)s`);
    renderStock();
};

const showEditLotModal = (lotId) => {
    const lots = DB.get('lots');
    const lot = lots.find(l => l.id === lotId);
    if (!lot) return;
    
    modal.show('Modifier le lot', `
        <form id="editLotForm">
            <div class="form-group">
                <label>Quantité</label>
                <input type="number" name="quantite" value="${lot.quantite}" min="1" required>
            </div>
            <div class="form-group">
                <label>Date de production</label>
                <input type="date" name="dateProduction" value="${lot.dateProduction}" onchange="updateEditLotDates()" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Date limite de vente (DLV)</label>
                    <input type="date" name="dlv" value="${lot.dlv}" required>
                </div>
                <div class="form-group">
                    <label>Date limite de consommation (DLC)</label>
                    <input type="date" name="dlc" value="${lot.dlc}" required>
                </div>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="modal.hide()">Annuler</button>
        <button class="btn btn-primary" onclick="saveEditLot(event, '${lotId}')">Enregistrer</button>
    `);
};

const updateEditLotDates = () => {
    const prodDate = document.querySelector('#editLotForm input[name="dateProduction"]').value;
    if (prodDate) {
        const dates = calculateDates(prodDate);
        document.querySelector('#editLotForm input[name="dlv"]').value = dates.dlv;
        document.querySelector('#editLotForm input[name="dlc"]').value = dates.dlc;
    }
};

const saveEditLot = (event, lotId) => {
    const reenable = disableSaveBtn(event);
    const form = document.getElementById('editLotForm');
    const formData = new FormData(form);
    
    const lots = DB.get('lots');
    const lotIndex = lots.findIndex(l => l.id === lotId);
    
    if (lotIndex !== -1) {
        lots[lotIndex].quantite = parseInt(formData.get('quantite'));
        lots[lotIndex].dateProduction = formData.get('dateProduction');
        lots[lotIndex].dlv = formData.get('dlv');
        lots[lotIndex].dlc = formData.get('dlc');
        DB.set('lots', lots);
        modal.hide();
        showToast('Lot modifié');
        renderStock();
    }
};

// Pointage
// Pointage — single-page (Phase 2 refonte)
// État UI persistant : employé sélectionné pour les boutons rapides Arrivée/Départ
let pointageSelectedEmployeId = null;
let pointageClockInterval = null;

const renderPointage = (_tabIgnored) => {
    // Backward-compat : si renderPointage est appelé avec 'historique'/'stats'/'employes' (anciens onglets),
    // on ignore et on affiche la single-page. Les anciennes fonctionnalités sont accessibles via les modals.
    const pointages = DB.get('pointages') || [];
    const employes = DB.get('employees') || [];
    const today = getLocalDateISOString();

    // Nettoyer l'ancien interval pour ne pas en accumuler
    if (pointageClockInterval) {
        clearInterval(pointageClockInterval);
        pointageClockInterval = null;
    }

    const currentTime = new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
    const dateTxt = new Date().toLocaleDateString('fr-CH', { weekday: 'long', day: 'numeric', month: 'long' });

    const employesActifs = employes.filter(e => e.actif);

    // Auto-sélectionner le premier employé actif si rien n'est sélectionné ou que l'employé sélectionné n'existe plus
    if (!pointageSelectedEmployeId || !employesActifs.some(e => e.id === pointageSelectedEmployeId)) {
        pointageSelectedEmployeId = employesActifs[0]?.id || null;
    }

    // Pointages du jour, indexés par employé pour détecter le "live" (pas de heureFin) ou état du jour
    const pointagesAujourdhui = pointages.filter(p => p.date === today);
    const pointageEnCoursParEmp = {};
    pointagesAujourdhui.forEach(p => {
        if (!p.heureFin) pointageEnCoursParEmp[p.employeId] = p;
    });

    const selectedEmpId = pointageSelectedEmployeId;
    const selectedEmp = employesActifs.find(e => e.id === selectedEmpId);
    const pointageEnCours = selectedEmpId ? pointageEnCoursParEmp[selectedEmpId] : null;
    const dejaArrive = !!pointageEnCours;

    const initiales = (e) => {
        if (!e) return '?';
        const p = (e.prenom || '').trim();
        const n = (e.nom || '').trim();
        return ((p[0] || '') + (n[0] || '')).toUpperCase() || '?';
    };

    // Historique du jour : pointages déjà terminés (avec heureFin), triés par heure de début
    const historiqueJour = pointagesAujourdhui
        .slice()
        .sort((a, b) => (a.heureDebut || '').localeCompare(b.heureDebut || ''));

    safeRender(`
        <div class="page-header-big">
            <h1>Pointage</h1>
        </div>

        <div class="pointage-hero">
            <div class="section-label">${selectedEmp ? escapeHtml(selectedEmp.prenom + ' ' + (selectedEmp.nom || '')) : 'Aucun employé sélectionné'}</div>
            <div class="pointage-clock-big current-time">${currentTime}</div>
            <div class="pointage-date">${escapeHtml(dateTxt)}</div>
            <div class="pointage-actions">
                <button type="button" class="btn btn-arrivee" ${dejaArrive || !selectedEmp ? 'disabled' : ''} onclick="pointageQuickArrivee()">
                    ▶ Arrivée
                </button>
                <button type="button" class="btn btn-depart" ${!dejaArrive ? 'disabled' : ''} onclick="pointageQuickDepart()">
                    ⏹ Départ
                </button>
            </div>
        </div>

        <div class="card">
            <div class="card-header" style="margin-bottom: 12px; padding-bottom: 0; border: none;">
                <h3 class="card-title">Qui pointe ?</h3>
            </div>
            ${employesActifs.length === 0 ? '<p style="color: var(--text-light);">Aucun employé actif. Ajoute-en depuis Paramètres.</p>' : `
                <div class="employee-grid">
                    ${employesActifs.map(e => {
                        const isSelected = e.id === selectedEmpId;
                        const isLive = !!pointageEnCoursParEmp[e.id];
                        return `<a href="#pointage" class="employee-card ${isSelected ? 'selected' : ''}" onclick="event.preventDefault(); pointageSelectEmployee('${e.id}'); return false;">
                            <div class="avatar ${isLive ? 'avatar-live' : ''}">${escapeHtml(initiales(e))}</div>
                            <div>
                                <div class="employee-name">${escapeHtml(e.prenom)} ${escapeHtml(e.nom || '')}</div>
                                <div class="employee-sub">${isLive ? '● en cours' : 'libre'}</div>
                            </div>
                        </a>`;
                    }).join('')}
                </div>
            `}
        </div>

        <div class="card">
            <div class="card-header" style="margin-bottom: 12px; padding-bottom: 0; border: none;">
                <h3 class="card-title">Saisie manuelle</h3>
            </div>
            <form id="quickPointageForm">
                <div class="form-row">
                    <div class="form-group">
                        <label>Employé</label>
                        <select name="employeId" required>
                            ${employesActifs.length === 0 ? '<option value="">Aucun employé</option>' :
                              employesActifs.map(e => `<option value="${e.id}" ${e.id === selectedEmpId ? 'selected' : ''}>${escapeHtml(e.prenom + ' ' + (e.nom || ''))}</option>`).join('')}
                        </select>
                    </div>
                    <div class="form-group">
                        <label>Date</label>
                        <input type="date" name="date" value="${today}" required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Arrivée</label>
                        <input type="time" name="heureDebut" required>
                    </div>
                    <div class="form-group">
                        <label>Départ</label>
                        <input type="time" name="heureFin" required>
                    </div>
                    <div class="form-group">
                        <label>Pause (min)</label>
                        <input type="number" name="pause" value="0" min="0">
                    </div>
                </div>
                <button type="button" class="btn btn-primary" onclick="saveQuickPointage(event)">Enregistrer</button>
            </form>
        </div>

        <div class="card">
            <div class="card-header" style="margin-bottom: 12px; padding-bottom: 0; border: none;">
                <h3 class="card-title">Historique du jour</h3>
                <span style="font-size: var(--font-caption); color: var(--text-light);">${historiqueJour.length} pointage${historiqueJour.length !== 1 ? 's' : ''}</span>
            </div>
            ${historiqueJour.length === 0 ? '<p style="color: var(--text-light); font-size: var(--font-body);">Aucun pointage aujourd\'hui pour l\'instant.</p>' : `
                ${historiqueJour.map(p => {
                    const emp = employes.find(x => x.id === p.employeId);
                    const debutMin = parseHHMM(p.heureDebut);
                    const finMin = parseHHMM(p.heureFin);
                    const pause = parseInt(p.pause, 10) || 0;
                    let totalLabel = '— en cours';
                    if (debutMin !== null && finMin !== null) {
                        const totalMin = (finMin - debutMin) - pause;
                        if (totalMin > 0) {
                            const h = Math.floor(totalMin / 60);
                            const m = totalMin % 60;
                            totalLabel = `${h}h${m > 0 ? ' ' + m + 'min' : ''}`;
                        }
                    }
                    return `<div class="history-row">
                        <div class="avatar avatar-sm">${escapeHtml(initiales(emp))}</div>
                        <div class="history-row-info">
                            <div class="history-row-name">${escapeHtml((emp?.prenom || '') + ' ' + (emp?.nom || ''))}</div>
                            <div class="history-row-times">${escapeHtml(p.heureDebut || '?')} → ${escapeHtml(p.heureFin || '...')}${pause ? ' • pause ' + pause + ' min' : ''}</div>
                        </div>
                        <div class="history-row-total">${totalLabel}</div>
                    </div>`;
                }).join('')}
            `}
        </div>

        <div class="flex gap-4" style="margin-top: 16px; flex-wrap: wrap;">
            <button type="button" class="btn btn-ghost btn-sm" onclick="showPointageStatsModal()">📊 Voir stats</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="showPointageHistoriqueModal()">📅 Historique complet</button>
            <button type="button" class="btn btn-ghost btn-sm" onclick="exportPointageExcel()">📤 Export CSV</button>
        </div>
    `);

    // Update time every second
    pointageClockInterval = setInterval(() => {
        const timeEl = document.querySelector('.pointage-hero .current-time');
        if (timeEl) {
            timeEl.textContent = new Date().toLocaleTimeString('fr-CH', { hour: '2-digit', minute: '2-digit' });
        } else {
            // L'élément n'est plus dans le DOM → l'utilisateur a navigué ailleurs, on arrête
            clearInterval(pointageClockInterval);
            pointageClockInterval = null;
        }
    }, 1000);
};

// Sélectionne un employé pour les boutons rapides Arrivée/Départ
const pointageSelectEmployee = (empId) => {
    pointageSelectedEmployeId = empId;
    renderPointage();
};

// Bouton rapide "Arrivée" : crée un pointage du jour avec heureDebut = maintenant, heureFin vide
const pointageQuickArrivee = () => {
    if (!pointageSelectedEmployeId) {
        showToast('Sélectionne un employé', 'error');
        return;
    }
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    const heureDebut = `${hh}:${mm}`;
    const today = getLocalDateISOString();

    const pointages = DB.get('pointages') || [];
    // Vérifier qu'aucun pointage du jour pour cet employé n'est en cours
    const enCours = pointages.find(p => p.date === today && p.employeId === pointageSelectedEmployeId && !p.heureFin);
    if (enCours) {
        showToast('Pointage déjà en cours pour cet employé', 'error');
        return;
    }

    pointages.push({
        id: generateId(),
        employeId: pointageSelectedEmployeId,
        date: today,
        heureDebut,
        heureFin: '',
        pause: 0
    });
    DB.set('pointages', pointages);
    showToast(`Arrivée pointée à ${heureDebut}`);
    renderPointage();
};

// Bouton rapide "Départ" : complète le pointage en cours du jour pour l'employé sélectionné
const pointageQuickDepart = () => {
    if (!pointageSelectedEmployeId) {
        showToast('Sélectionne un employé', 'error');
        return;
    }
    const today = getLocalDateISOString();
    const pointages = DB.get('pointages') || [];
    const enCours = pointages.find(p => p.date === today && p.employeId === pointageSelectedEmployeId && !p.heureFin);
    if (!enCours) {
        showToast('Aucun pointage en cours pour cet employé', 'error');
        return;
    }
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    enCours.heureFin = `${hh}:${mm}`;
    DB.set('pointages', pointages);
    showToast(`Départ pointé à ${enCours.heureFin}`);
    renderPointage();
};

// Modal stats — réutilise getPointageStats() et le HTML d'origine de l'onglet 'stats'
const showPointageStatsModal = () => {
    const pointages = DB.get('pointages') || [];
    const employes = DB.get('employees') || [];
    const employesActifs = employes.filter(e => e.actif);
    const stats = getPointageStats(pointages, employes);

    modal.show('Statistiques pointage',
        `<div class="form-row" style="margin-bottom: 16px;">
            <div class="form-group">
                <label>Employé</label>
                <select id="statsEmploye" onchange="refreshPointageStatsModal()">
                    <option value="">Tous</option>
                    ${employesActifs.map(e => `<option value="${e.id}">${escapeHtml(e.prenom + ' ' + (e.nom || ''))}</option>`).join('')}
                </select>
            </div>
            <div class="form-group">
                <label>Période</label>
                <select id="statsPeriod" onchange="refreshPointageStatsModal()">
                    <option value="week">Semaine en cours</option>
                    <option value="month">Mois en cours</option>
                    <option value="year">Année en cours</option>
                </select>
            </div>
        </div>
        <div id="statsModalBody">
            <div class="dash-kpi-grid">
                <div class="dash-kpi-card"><div class="dash-kpi-label">Total heures</div><div class="dash-kpi-value">${stats.totalHours}h</div></div>
                <div class="dash-kpi-card"><div class="dash-kpi-label">Jours travaillés</div><div class="dash-kpi-value">${stats.daysWorked}</div></div>
            </div>
            <div class="dash-kpi-card" style="margin-bottom: 16px;"><div class="dash-kpi-label">Moyenne / jour</div><div class="dash-kpi-value">${stats.avgHours}h</div></div>
            ${stats.employeeStats.length > 0 ? `
                <h4 style="margin: 12px 0 8px; font-size: var(--font-body-lg);">Répartition par employé</h4>
                <div class="bar-chart">
                    ${stats.employeeStats.map((emp, i) => `
                        <div class="bar-row">
                            <span class="bar-label">${escapeHtml(emp.name)}</span>
                            <div class="bar-container">
                                <div class="bar" style="width: ${emp.percent}%; background: hsl(${i * 40 + 100}, 35%, 45%);"></div>
                            </div>
                            <span class="bar-value">${emp.hours}h</span>
                        </div>
                    `).join('')}
                </div>` : ''}
        </div>`,
        `<button class="btn btn-secondary" onclick="modal.hide()">Fermer</button>`
    );
};

// Rafraîchit le corps de la modal stats avec les filtres choisis
const refreshPointageStatsModal = () => {
    const employes = DB.get('employees') || [];
    const pointages = DB.get('pointages') || [];
    const stats = getPointageStats(pointages, employes);
    const body = document.getElementById('statsModalBody');
    if (!body) return;
    body.innerHTML = `
        <div class="dash-kpi-grid">
            <div class="dash-kpi-card"><div class="dash-kpi-label">Total heures</div><div class="dash-kpi-value">${stats.totalHours}h</div></div>
            <div class="dash-kpi-card"><div class="dash-kpi-label">Jours travaillés</div><div class="dash-kpi-value">${stats.daysWorked}</div></div>
        </div>
        <div class="dash-kpi-card" style="margin-bottom: 16px;"><div class="dash-kpi-label">Moyenne / jour</div><div class="dash-kpi-value">${stats.avgHours}h</div></div>
        ${stats.employeeStats.length > 0 ? `
            <h4 style="margin: 12px 0 8px; font-size: var(--font-body-lg);">Répartition par employé</h4>
            <div class="bar-chart">
                ${stats.employeeStats.map((emp, i) => `
                    <div class="bar-row">
                        <span class="bar-label">${escapeHtml(emp.name)}</span>
                        <div class="bar-container">
                            <div class="bar" style="width: ${emp.percent}%; background: hsl(${i * 40 + 100}, 35%, 45%);"></div>
                        </div>
                        <span class="bar-value">${emp.hours}h</span>
                    </div>
                `).join('')}
            </div>` : ''}
    `;
};

// Modal historique complet — réutilise renderHistoriqueTable()
const showPointageHistoriqueModal = () => {
    const employes = DB.get('employees') || [];
    const employesActifs = employes.filter(e => e.actif);
    const pointages = DB.get('pointages') || [];

    modal.show('Historique complet',
        `<div class="filters" style="margin-bottom: 12px;">
            <select id="filterEmploye" onchange="refreshPointageHistoriqueModal()">
                <option value="">Tous les employés</option>
                ${employesActifs.map(e => `<option value="${e.id}">${escapeHtml(e.prenom + ' ' + (e.nom || ''))}</option>`).join('')}
            </select>
            <input type="date" id="filterDateFrom" placeholder="Du" onchange="refreshPointageHistoriqueModal()">
            <input type="date" id="filterDateTo" placeholder="Au" onchange="refreshPointageHistoriqueModal()">
        </div>
        <div class="table-container">
            <table>
                <thead>
                    <tr><th>Date</th><th>Employé</th><th>Début</th><th>Fin</th><th>Pause</th><th>Total</th><th></th></tr>
                </thead>
                <tbody id="historiqueModalBody">${renderHistoriqueTable(pointages, employes)}</tbody>
            </table>
        </div>`,
        `<button class="btn btn-secondary" onclick="exportPointageExcel()">Exporter CSV</button>
         <button class="btn btn-primary" onclick="modal.hide()">Fermer</button>`
    );
};

const refreshPointageHistoriqueModal = () => {
    const pointages = DB.get('pointages') || [];
    const employes = DB.get('employees') || [];
    const tbody = document.getElementById('historiqueModalBody');
    if (tbody) tbody.innerHTML = renderHistoriqueTable(pointages, employes);
};

const renderHistoriqueTable = (pointages, employes) => {
    const filterEmploye = document.getElementById('filterEmploye')?.value || '';
    const filterDateFrom = document.getElementById('filterDateFrom')?.value || '';
    const filterDateTo = document.getElementById('filterDateTo')?.value || '';
    
    const filtered = pointages
        .filter(p => {
            if (filterEmploye && p.employeId !== filterEmploye) return false;
            if (filterDateFrom && p.date < filterDateFrom) return false;
            if (filterDateTo && p.date > filterDateTo) return false;
            return true;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (filtered.length === 0) {
        return '<tr><td colspan="7" class="text-center">Aucun pointage</td></tr>';
    }
    
    return filtered.map(p => {
        const emp = employes.find(e => e.id === p.employeId);
        const debutMin = parseHHMM(p.heureDebut);
        const finMin = parseHHMM(p.heureFin);
        let totalMinutes = 0;
        if (debutMin !== null && finMin !== null) {
            totalMinutes = finMin - debutMin - (p.pause || 0);
        }
        const heures = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;

        return `
            <tr>
                <td>${formatDate(p.date)}</td>
                <td>${emp ? escapeHtml(emp.prenom + ' ' + emp.nom) : 'N/A'}</td>
                <td>${escapeHtml(p.heureDebut || '-')}</td>
                <td>${escapeHtml(p.heureFin || '-')}</td>
                <td>${p.pause || 0} min</td>
                <td>${totalMinutes > 0 ? `${heures}h ${mins}min` : '-'}</td>
                <td>
                    <button class="btn btn-sm btn-danger" onclick="deletePointage('${p.id}')">Supprimer</button>
                </td>
            </tr>
        `;
    }).join('');
};

const getMonday = (d) => {
    const dt = new Date(d);
    const day = dt.getDay();
    const diff = dt.getDate() - day + (day === 0 ? -6 : 1);
    return new Date(dt.getFullYear(), dt.getMonth(), diff);
};

const getPointageStats = (pointages, employes) => {
    const statsEmploye = document.getElementById('statsEmploye')?.value || '';
    const statsPeriod = document.getElementById('statsPeriod')?.value || 'week';
    
    const now = new Date();
    let startDate, endDate;
    
    if (statsPeriod === 'week') {
        startDate = getMonday(now);
        endDate = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate() + 6);
    } else if (statsPeriod === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    } else {
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
    }
    
    const formatDateISO = (d) => {
        const cloned = new Date(d.getTime());
        const offset = cloned.getTimezoneOffset();
        cloned.setMinutes(cloned.getMinutes() - offset);
        return cloned.toISOString().split('T')[0];
    };
    
    const startStr = formatDateISO(startDate);
    const endStr = formatDateISO(endDate);
    
    let filtered = pointages.filter(p => p.date >= startStr && p.date <= endStr && p.heureFin);
    
    if (statsEmploye) {
        filtered = filtered.filter(p => p.employeId === statsEmploye);
    }
    
    const totalMinutes = filtered.reduce((acc, p) => {
        const debutMin = parseHHMM(p.heureDebut);
        const finMin = parseHHMM(p.heureFin);
        if (debutMin === null || finMin === null) return acc;
        const diff = finMin - debutMin - (p.pause || 0);
        return acc + (diff > 0 ? diff : 0);
    }, 0);
    
    const totalHours = (totalMinutes / 60).toFixed(1);
    const daysWorked = new Set(filtered.map(p => p.date)).size;
    const avgHours = daysWorked > 0 ? (totalMinutes / 60 / daysWorked).toFixed(1) : 0;
    
    // Employee stats
    const empStats = {};
    filtered.forEach(p => {
        if (!empStats[p.employeId]) empStats[p.employeId] = 0;
        const debutMin = parseHHMM(p.heureDebut);
        const finMin = parseHHMM(p.heureFin);
        if (debutMin === null || finMin === null) return;
        const diff = finMin - debutMin - (p.pause || 0);
        if (diff > 0) empStats[p.employeId] += diff / 60;
    });
    
    const maxHours = Math.max(...Object.values(empStats), 1);
    const employeeStats = Object.entries(empStats).map(([id, hours]) => {
        const emp = employes.find(e => e.id === id);
        return {
            name: emp ? emp.prenom + ' ' + emp.nom : 'Inconnu',
            hours: hours.toFixed(1),
            percent: (hours / maxHours) * 100
        };
    }).sort((a, b) => parseFloat(b.hours) - parseFloat(a.hours));
    
    return { totalHours, daysWorked, avgHours, employeeStats };
};

const saveQuickPointage = (event) => {
    const reenable = disableSaveBtn(event);
    const form = document.getElementById('quickPointageForm');
    const formData = new FormData(form);
    
    const employeId = formData.get('employeId');
    const date = formData.get('date');
    const heureDebut = formData.get('heureDebut');
    const heureFin = formData.get('heureFin');
    const pause = parseInt(formData.get('pause')) || 0;
    
    if (!employeId || !date || !heureDebut || !heureFin) {
        showToast('Veuillez remplir tous les champs', 'error');
        if (reenable) reenable();
        return;
    }
    if (parseHHMM(heureDebut) === null || parseHHMM(heureFin) === null) {
        showToast('Format d\'heure invalide (attendu HH:MM)', 'error');
        if (reenable) reenable();
        return;
    }
    if (parseHHMM(heureFin) <= parseHHMM(heureDebut)) {
        showToast('L\'heure de fin doit être après l\'heure de début', 'error');
        if (reenable) reenable();
        return;
    }

    const pointages = DB.get('pointages') || [];
    const pointage = {
        id: generateId(),
        employeId,
        date,
        heureDebut,
        heureFin,
        pause
    };
    pointages.push(pointage);
    DB.set('pointages', pointages);

    form.reset();
    document.querySelector('#quickPointageForm input[name="date"]').value = getLocalDateISOString();
    showToast('Pointage ajouté');
    renderPointage('pointage');
};

const exportPointageExcel = () => {
    const pointages = DB.get('pointages') || [];
    const employes = DB.get('employees') || [];
    const filterEmploye = document.getElementById('filterEmploye')?.value || '';
    const filterDateFrom = document.getElementById('filterDateFrom')?.value || '';
    const filterDateTo = document.getElementById('filterDateTo')?.value || '';
    
    const filtered = pointages
        .filter(p => {
            if (filterEmploye && p.employeId !== filterEmploye) return false;
            if (filterDateFrom && p.date < filterDateFrom) return false;
            if (filterDateTo && p.date > filterDateTo) return false;
            return true;
        })
        .sort((a, b) => new Date(b.date) - new Date(a.date));
    
    // Create CSV content
    let csv = 'Date,Employé,Début,Fin,Pause,Durée\n';
    
    filtered.forEach(p => {
        const emp = employes.find(e => e.id === p.employeId);
        const empName = emp ? emp.prenom + ' ' + emp.nom : 'N/A';
        
        const debutMin = parseHHMM(p.heureDebut);
        const finMin = parseHHMM(p.heureFin);
        let totalMinutes = 0;
        if (debutMin !== null && finMin !== null) {
            totalMinutes = finMin - debutMin - (p.pause || 0);
        }
        const heures = Math.floor(totalMinutes / 60);
        const mins = totalMinutes % 60;
        const duree = totalMinutes > 0 ? `${heures}h ${mins}min` : '-';
        
        csv += `${p.date},${empName},${p.heureDebut || '-'},${p.heureFin || '-'},${p.pause || 0},${duree}\n`;
    });
    
    // Download CSV
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = `pointages_${getLocalDateISOString()}.csv`;
    link.click();
    
    showToast('Exporté en CSV');
};

const deletePointage = (id) => {
    confirmDialog('Êtes-vous sûr de vouloir supprimer ce pointage ?', { danger: true }).then(ok => {
        if (!ok) return;
        const pointages = DB.get('pointages').filter(p => p.id !== id);
        DB.set('pointages', pointages);
        showToast('Pointage supprimé');
        renderPointage();
    });
};

// =========================================================================
// Phase 3 — Helpers & composants Commandes
// =========================================================================

// Format un montant en CHF format suisse : "CHF 480.–" / "CHF 1'234.50" / "CHF —"
const formatChf = (n) => {
    if (n === null || n === undefined || isNaN(n)) return 'CHF —';
    if (n === 0) return 'CHF 0.–';
    const abs = Math.abs(n);
    const fixed = abs.toFixed(2);
    const isWhole = fixed.endsWith('.00');
    const integerPart = Math.floor(abs).toString().replace(/\B(?=(\d{3})+(?!\d))/g, "'");
    const sign = n < 0 ? '-' : '';
    return isWhole
        ? `CHF ${sign}${integerPart}.–`
        : `CHF ${sign}${integerPart}.${fixed.split('.')[1]}`;
};

// Résout un format pour un item de commande avec matching ULTRA-tolérant :
//   1. f.id === item.formatId (match strict)
//   2. f.nom === item.formatNom si présent (legacy)
//   3. Si item.formatId ressemble à un nom de format ("25cl"), match par nom
//   4. Parse "0.5L" / "33cl" depuis le formatId/nom comme dernier recours
// Retourne { format, source } ou null si introuvable.
const resolveCommandeFormat = (item, formats, lookups = null) => {
    if (!item) return null;
    const lk = lookups || (Array.isArray(formats) ? {
        formatsById: indexById(formats),
        formatsByNom: indexBy(formats, f => f.nom),
        formatsByNorm: indexBy(formats, f => String(f.nom || '').toLowerCase().replace(/\s+/g, ''))
    } : null);
    // 1. match par id (strict)
    let fmt = lk ? lk.formatsById.get(item.formatId) : formats.find(f => f.id === item.formatId);
    if (fmt) return { format: fmt, source: 'id' };
    // 2. match par formatNom (si stocké dans l'item legacy)
    if (item.formatNom) {
        fmt = lk ? lk.formatsByNom.get(item.formatNom) : formats.find(f => f.nom === item.formatNom);
        if (fmt) return { format: fmt, source: 'formatNom' };
    }
    // 3. match par formatId qui ressemblerait à un nom ("25cl", "1L", etc.)
    if (item.formatId) {
        const norm = String(item.formatId).toLowerCase().replace(/\s+/g, '');
        fmt = lk ? lk.formatsByNorm.get(norm) : formats.find(f => String(f.nom || '').toLowerCase().replace(/\s+/g, '') === norm);
        if (fmt) return { format: fmt, source: 'formatId-as-name' };
    }
    return null;
};

// Diagnostic : retourne un objet structuré du calcul de montant pour une commande.
// Utilisé par l'UI ("Pourquoi pas de montant ?") et par window.debugMontants().
// Accepte des lookups (Maps) en option pour eviter les Array.find dans les boucles de rendu.
const diagnoseCommandeMontant = (commande, clients, formats, lookups = null) => {
    const lk = lookups || (Array.isArray(clients) && Array.isArray(formats) ? {
        clientsById: indexById(clients),
        formatsById: indexById(formats),
        formatsByNom: indexBy(formats, f => f.nom),
        formatsByNorm: indexBy(formats, f => String(f.nom || '').toLowerCase().replace(/\s+/g, ''))
    } : null);
    const client = lk ? lk.clientsById.get(commande.clientId) : clients.find(c => c.id === commande.clientId);
    const report = {
        cmdId: commande.id,
        cmdNumero: getCommandeNumero(commande),
        clientId: commande.clientId,
        clientFound: !!client,
        clientLabel: client ? (client.societe || client.nom || '(sans nom)') : '(client introuvable)',
        tarifsCategorie: client ? (client.tarifs || '(vide)') : null,
        items: [],
        total: 0,
        hasPrice: false
    };
    if (!client) return report;
    getItems(commande).forEach((item, idx) => {
        const resolved = resolveCommandeFormat(item, formats, lk);
        const fmt = resolved?.format;
        const key = fmt ? getFormatPriceKey(fmt) : null;
        const rawClient = key ? client[key] : null;
        let priceClient = parseFloat(String(rawClient || '').replace(',', '.'));
        if (isNaN(priceClient)) priceClient = null;
        let pricePreset = null;
        if (key && TARIF_PRESETS[client.tarifs]) {
            pricePreset = parseFloat(TARIF_PRESETS[client.tarifs][key]);
            if (isNaN(pricePreset)) pricePreset = null;
        }
        const priceUsed = (priceClient && priceClient > 0)
            ? priceClient
            : (pricePreset && pricePreset > 0 ? pricePreset : null);
        const ligneTotal = (priceUsed != null) ? priceUsed * (item.quantite || 0) : 0;
        report.items.push({
            idx,
            aromeId: item.aromeId,
            formatId: item.formatId,
            formatFound: !!fmt,
            formatSource: resolved?.source || null,
            formatNom: fmt?.nom || null,
            contenanceCl: fmt?.contenanceCl ?? null,
            priceKey: key,
            priceFromClient: priceClient,
            priceFromPreset: pricePreset,
            priceUsed,
            quantite: item.quantite || 0,
            ligneTotal
        });
        if (priceUsed && priceUsed > 0) {
            report.total += ligneTotal;
            report.hasPrice = true;
        }
    });
    if (!report.hasPrice) report.total = null;
    return report;
};

// Calcule le montant CHF total d'une commande depuis les prix du client.
// Délègue le diagnostic et utilise le résultat — source unique de vérité.
const getCommandeMontant = (commande, clients, formats, lookups = null) => {
    const r = diagnoseCommandeMontant(commande, clients, formats, lookups);
    return r.hasPrice ? r.total : null;
};

// Exposé global pour debug rapide depuis la console Chrome (chrome://inspect)
if (typeof window !== 'undefined') {
    window.debugMontants = () => {
        const cmds = (DB.get('commandes') || []).slice(0, 20);
        const clients = DB.get('clients') || [];
        const formats = DB.get('formats') || [];
        const report = cmds.map(cmd => diagnoseCommandeMontant(cmd, clients, formats));
        try {
            console.table(report.map(r => ({
                cmd: r.cmdNumero, client: r.clientLabel,
                items: r.items.length, total: r.total, hasPrice: r.hasPrice
            })));
        } catch (_) {}
        console.log('[debugMontants] formats in DB:', formats);
        console.log('[debugMontants] full diag:', report);
        return report;
    };
}

// Composant : StepTracker 3 étapes (Créée → Produite → Livrée). Retourne du HTML.
// Annulée → '' (caller affiche une bannière à la place).
const renderStepTracker = (statut) => {
    if (statut === 'annulee') return '';
    const steps = [
        { key: 'creee',    label: 'Créée' },
        { key: 'produite', label: 'Produite' },
        { key: 'livree',   label: 'Livrée' }
    ];
    const currentIdx = statut === 'en_attente' ? 0
                     : statut === 'produite'   ? 1
                     : statut === 'livrée'      ? 2 : 0;
    // Si la commande est livrée, toutes les étapes sont done
    const treatAsDone = statut === 'livrée';
    return `<div class="step-tracker">
        ${steps.map((s, i) => {
            const state = treatAsDone
                ? 'done'
                : (i < currentIdx ? 'done' : i === currentIdx ? 'current' : 'pending');
            const connector = i < steps.length - 1
                ? `<div class="step-connector ${(treatAsDone || i < currentIdx) ? 'done' : ''}"></div>`
                : '';
            return `<div class="step ${state}">
                <div class="step-dot">${state === 'done' ? '✓' : i + 1}</div>
                <div class="step-label">${s.label}</div>
            </div>${connector}`;
        }).join('')}
    </div>`;
};

// État global pour le mini-calendrier : décalage en semaines depuis aujourd'hui
let weekCalendarOffset = 0;
let weekCalendarSelectedDate = ''; // '' = aucun filtre date, sinon date ISO yyyy-mm-dd

// Composant : mini-calendrier semaine (7 jours horizontaux + nav ‹ ›)
const renderWeekCalendar = (commandesByDate) => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const monday = new Date(today);
    const day = (monday.getDay() + 6) % 7; // 0 = lundi
    monday.setDate(monday.getDate() - day + (weekCalendarOffset * 7));

    const days = [];
    for (let i = 0; i < 7; i++) {
        const d = new Date(monday);
        d.setDate(monday.getDate() + i);
        days.push(d);
    }
    const iso = (d) => {
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day2 = String(d.getDate()).padStart(2, '0');
        return `${y}-${m}-${day2}`;
    };
    const todayIso = iso(today);
    const monthLabel = monday.toLocaleDateString('fr-CH', { month: 'long', year: 'numeric' });

    return `<div class="week-calendar-wrap">
        <div class="week-calendar-header">
            <button type="button" class="btn-bare" onclick="changeWeekCalendar(-1)" aria-label="Semaine précédente">‹</button>
            <span class="week-month">${escapeHtml(monthLabel)}</span>
            <button type="button" class="btn-bare" onclick="changeWeekCalendar(1)" aria-label="Semaine suivante">›</button>
        </div>
        <div class="week-calendar">
            ${days.map(d => {
                const dStr = iso(d);
                const isToday = dStr === todayIso;
                const isSelected = dStr === weekCalendarSelectedDate;
                const hasOrders = (commandesByDate[dStr] || 0) > 0;
                const dayLetter = ['L', 'M', 'M', 'J', 'V', 'S', 'D'][(d.getDay() + 6) % 7];
                return `<button type="button" class="week-day ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''}"
                    onclick="selectWeekDay('${dStr}')">
                    <span class="week-day-name">${dayLetter}</span>
                    <span class="week-day-num">${d.getDate()}</span>
                    ${hasOrders ? '<span class="week-day-dot"></span>' : ''}
                </button>`;
            }).join('')}
        </div>
    </div>`;
};

// Globals pour le mini-calendrier
const changeWeekCalendar = (delta) => {
    weekCalendarOffset += delta;
    renderCommandes();
};
const selectWeekDay = (dateStr) => {
    weekCalendarSelectedDate = (weekCalendarSelectedDate === dateStr) ? '' : dateStr;
    renderCommandes();
};

// Commandes — liste refondue (Phase 3)
const renderCommandes = () => {
    const savedFilterStatut = DB.getFilter('statut') || '';
    const showArchives = localStorage.getItem('thecol_show_archives') === 'true';

    const allCommandes = DB.get('commandes') || [];
    const commandesScope = showArchives
        ? allCommandes.filter(c => c.statut === 'livrée')
        : allCommandes.filter(c => c.statut !== 'livrée');
    const clients = DB.get('clients') || [];
    const aromes = DB.get('aromes') || [];
    const formats = DB.get('formats') || [];
    const lookups = {
        clientsById: indexById(clients),
        aromesById: indexById(aromes),
        formatsById: indexById(formats),
        formatsByNom: indexBy(formats, f => f.nom),
        formatsByNorm: indexBy(formats, f => String(f.nom || '').toLowerCase().replace(/\s+/g, ''))
    };

    // Compteurs par statut (avant filtres) pour les pills
    const countByStatut = { en_attente: 0, produite: 0, 'livrée': 0, annulee: 0 };
    commandesScope.forEach(c => { if (countByStatut[c.statut] !== undefined) countByStatut[c.statut]++; });

    // Map "yyyy-mm-dd" → count, pour les dots du mini-calendrier (basé sur dateLivraison)
    const commandesByDate = {};
    commandesScope.forEach(c => {
        if (c.dateLivraison) {
            const k = String(c.dateLivraison).slice(0, 10);
            commandesByDate[k] = (commandesByDate[k] || 0) + 1;
        }
    });

    // Appliquer filtres : pill statut + jour sélectionné dans calendrier (UNIQUEMENT en vue active,
    // pas en archives — sinon le filtre date de la semaine courante exclurait toutes les livrées passées)
    let filtered = commandesScope;
    if (!showArchives) {
        if (savedFilterStatut) filtered = filtered.filter(c => c.statut === savedFilterStatut);
        if (weekCalendarSelectedDate) {
            filtered = filtered.filter(c => String(c.dateLivraison || '').slice(0, 10) === weekCalendarSelectedDate);
        }
    }
    filtered.sort((a, b) => new Date(b.dateCommande) - new Date(a.dateCommande));

    const pillBtn = (key, label) => `
        <button type="button" class="status-pill ${savedFilterStatut === key ? 'active' : ''}"
            onclick="togglePillStatut('${key}')">
            ${label}
            <span class="pill-count">${countByStatut[key] || 0}</span>
        </button>`;

    const cardsHtml = filtered.length === 0
        ? '<div class="commande-empty">Aucune commande</div>'
        : filtered.map(cmd => {
            const client = lookups.clientsById.get(cmd.clientId);
            const clientLabel = client?.societe || client?.nom || 'Client inconnu';
            const safeItems = cmd.items || [];
            const totalItems = safeItems.reduce((sum, i) => sum + (i.quantite || 0), 0);
            const articlesPreview = safeItems.slice(0, 3).map(i => {
                const a = lookups.aromesById.get(i.aromeId);
                const f = lookups.formatsById.get(i.formatId);
                return `${i.quantite}× ${a?.nom || '?'} ${f?.nom || '?'}`;
            }).join(' • ');
            const more = safeItems.length > 3 ? ` • +${safeItems.length - 3}` : '';
            const montant = getCommandeMontant(cmd, clients, formats, lookups);
            const badgeMap = {
                'en_attente': 'badge-en-attente',
                'produite':   'badge-produite',
                'livrée':      'badge-livree',
                'annulee':    'badge-annulee'
            };
            const labelStatut = { 'en_attente': 'en attente', 'produite': 'produite', 'livrée': 'livrée', 'annulee': 'annulée' }[cmd.statut] || cmd.statut;
            const cardClass = `commande-card statut-${cmd.statut === 'livrée' ? 'livree' : cmd.statut}`;
            return `<a href="#commandes" class="${cardClass}" onclick="event.preventDefault(); showCommandeDetails('${cmd.id}'); return false;">
                <div class="commande-card-header">
                    <span class="commande-card-numero">#${escapeHtml(getCommandeNumero(cmd))}</span>
                    <span class="badge ${badgeMap[cmd.statut] || 'badge-default'}">${escapeHtml(labelStatut || '')}</span>
                </div>
                <div class="commande-card-name">${escapeHtml(clientLabel)}</div>
                <div class="commande-card-items">${escapeHtml(articlesPreview + more)} • ${totalItems} bt</div>
                <div class="commande-card-footer">
                    <span class="commande-card-date">Livraison ${formatDate(cmd.dateLivraison)}</span>
                    <span class="commande-card-amount ${montant === null ? 'muted' : ''}">${formatChf(montant)}</span>
                </div>
            </a>`;
        }).join('');

    const html = `
        <div class="commandes-toolbar">
            <h1>${showArchives ? 'Archives' : 'Commandes'}</h1>
            <div class="header-actions" style="display:flex; gap:8px;">
                <button class="btn btn-ghost btn-sm" onclick="toggleArchives()" title="${showArchives ? 'Voir commandes actives' : 'Voir archives'}">
                    ${showArchives ? '← Actives' : 'Archives'}
                </button>
                ${showArchives
                    ? `<button class="btn btn-ghost btn-sm" onclick="exportArchivesExcel()" title="Exporter Excel">📤 Excel</button>`
                    : `<button class="btn btn-primary btn-sm" onclick="showCommandeModal()">+ Créer</button>`}
            </div>
        </div>

        ${!showArchives ? renderWeekCalendar(commandesByDate) : ''}

        ${!showArchives ? `
            <div class="status-pills">
                <button type="button" class="status-pill ${!savedFilterStatut ? 'active' : ''}" onclick="togglePillStatut('')">
                    Toutes
                    <span class="pill-count">${commandesScope.length}</span>
                </button>
                ${pillBtn('en_attente', 'En attente')}
                ${pillBtn('produite', 'Produite')}
                ${pillBtn('annulee', 'Annulée')}
            </div>
        ` : ''}

        ${!showArchives && weekCalendarSelectedDate ? `<div style="display:flex; justify-content:space-between; align-items:center; padding:8px 12px; background: var(--bg-secondary); border-radius: var(--radius-md); margin-bottom: 12px; font-size: var(--font-caption);">
            <span>📅 Filtre : livraisons du ${formatDate(weekCalendarSelectedDate)}</span>
            <button type="button" class="btn-bare" style="color: var(--primary); font-size: var(--font-caption); padding: 0;" onclick="selectWeekDay('${weekCalendarSelectedDate}')">Effacer ✕</button>
        </div>` : ''}

        <div class="commandes-list">
            ${cardsHtml}
        </div>
    `;

    safeRender(html);
};

// Toggle pill statut : clic sur la pill active = retire le filtre
const togglePillStatut = (statut) => {
    const current = DB.getFilter('statut') || '';
    DB.setFilter('statut', current === statut ? '' : statut);
    renderCommandes();
};

// Transitions de statut autorisées pour les commandes. La livraison passe
// uniquement par le flux dédié (showLivraisonBouteillesModal) qui déduit le stock,
// et la restauration d'une commande livrée uniquement par restaurerCommande
// (qui recrédite le stock). Le sélecteur n'expose jamais ces deux flux.
const STATUT_TRANSITIONS = {
    'en_attente': ['en_attente', 'produite', 'annulee'],
    'produite': ['produite', 'livrée', 'annulee'],
    'livrée': ['livrée', 'produite'],
    'annulee': ['annulee']
};
const STATUT_LABELS = { 'en_attente': 'En attente', 'produite': 'Produite', 'livrée': 'Livrée', 'annulee': 'Annulée' };
const isTransitionAllowed = (from, to) => {
    if (!from) return true;
    const allowed = STATUT_TRANSITIONS[from];
    return Array.isArray(allowed) && allowed.includes(to);
};

const showCommandeModal = (id = null) => {
    const clients = getActive('clients');
    const aromes = getActive('aromes');
    const formats = getActive('formats');
    const commandes = DB.get('commandes');

    let commande = null;
    if (id) commande = commandes.find(c => c.id === id);

    if (clients.length === 0 || aromes.length === 0 || formats.length === 0) {
        showToast('Veuillez d\'abord configurer clients, aromes et formats', 'error');
        return;
    }

    // Snapshot pour les handlers du modal (evite les DB.get par touche)
    _commandeModalCache = { clients, formats, aromes, commande };

    const matrixRows = aromes.map(a => {
        const dotColor = a.couleur || '#ccc';
        return `<tr>
            <th scope="row"><span class="matrix-arome"><span class="matrix-dot" style="background:${escapeHtml(dotColor)}"></span>${escapeHtml(a.nom)}</span></th>
            ${formats.map(f => {
                const item = commande?.items?.find(i => i.aromeId === a.id && i.formatId === f.id);
                const qty = item ? item.quantite : '';
                const filled = qty !== '' && qty > 0;
                return `<td>
                    <div class="matrix-cell ${filled ? 'filled' : ''}">
                        <input type="number"
                               name="items[${a.id}][${f.id}]"
                               value="${qty}"
                               min="0"
                               class="item-qty-input"
                               oninput="onMatrixCellInput(this)">
                    </div>
                </td>`;
            }).join('')}
        </tr>`;
    }).join('');

    modal.show(id ? 'Modifier commande' : 'Nouvelle commande', `
        <form id="commandeForm">
            <div class="form-row">
                <div class="form-group">
                    <label>Client</label>
                    <select name="clientId" required onchange="updateCommandeTotalModal()">
                        ${clients.map(c => `<option value="${c.id}" ${commande?.clientId === c.id ? 'selected' : ''}>${escapeHtml(c.societe || c.nom)}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Date de livraison</label>
                    <input type="date" name="dateLivraison" value="${commande?.dateLivraison || ''}" required>
                </div>
            </div>

            <label class="section-label" style="margin-top: 8px;">Articles</label>
            <div class="matrix-wrap">
                <table class="matrix">
                    <thead>
                        <tr>
                            <th></th>
                            ${formats.map(f => `<th>${escapeHtml(f.nom)}</th>`).join('')}
                        </tr>
                    </thead>
                    <tbody>${matrixRows}</tbody>
                </table>
            </div>

            <div class="commande-total" id="commandeTotalRow">
                <div>
                    <div class="commande-total-label">Total</div>
                    <div class="commande-total-sub" id="commandeTotalSub">— bouteilles</div>
                </div>
                <div class="commande-total-value" id="commandeTotalValue">CHF —</div>
            </div>

            <div class="form-group" style="margin-top: 16px;">
                <label>Statut</label>
                <select name="statut">
                    ${(() => {
                        if (commande) {
                            const allowed = (STATUT_TRANSITIONS[commande.statut] || [commande.statut])
                                .filter(s => s !== 'livrée' || commande.statut === 'livrée');
                            return allowed.map(s => `<option value="${s}" ${commande.statut === s ? 'selected' : ''}>${STATUT_LABELS[s] || s}</option>`).join('');
                        }
                        return `<option value="en_attente" selected>${STATUT_LABELS['en_attente']}</option>
                                <option value="produite">${STATUT_LABELS['produite']}</option>`;
                    })()}
                </select>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="modal.hide()">Annuler</button>
        <button class="btn btn-primary" onclick="saveCommande(event, '${id || ''}')">Enregistrer</button>
    `);

    // Recalcul initial du total
    updateCommandeTotalModal();
};

// Met à jour la classe .filled de la cellule et recalcule le total
const onMatrixCellInput = (input) => {
    const cell = input.closest('.matrix-cell');
    if (cell) {
        const val = parseInt(input.value, 10) || 0;
        cell.classList.toggle('filled', val > 0);
    }
    updateCommandeTotalModal();
};

// Recalcule le total CHF + bouteilles dans le modal de création
const updateCommandeTotalModal = () => {
    const form = document.getElementById('commandeForm');
    if (!form) return;
    const clientId = form.querySelector('select[name="clientId"]')?.value;
    // Lecture depuis le cache modal si dispo, sinon fallback DB (defense en profondeur)
    const cache = _commandeModalCache;
    const clients = cache?.clients || DB.get('clients') || [];
    const formats = cache?.formats || DB.get('formats') || [];

    // Construire un objet commande "virtuel" depuis les inputs
    const items = [];
    let totalBouteilles = 0;
    form.querySelectorAll('.item-qty-input').forEach(input => {
        const qty = parseInt(input.value, 10) || 0;
        if (qty > 0) {
            const match = input.name.match(/items\[([^\]]+)\]\[([^\]]+)\]/);
            if (match) {
                items.push({ aromeId: match[1], formatId: match[2], quantite: qty });
                totalBouteilles += qty;
            }
        }
    });
    const tempCmd = { clientId, items };
    const montant = getCommandeMontant(tempCmd, clients, formats);

    const totalValueEl = document.getElementById('commandeTotalValue');
    const totalSubEl = document.getElementById('commandeTotalSub');
    if (totalValueEl) totalValueEl.textContent = formatChf(montant);
    if (totalSubEl) totalSubEl.textContent = `${totalBouteilles} bouteille${totalBouteilles > 1 ? 's' : ''}`;
};

const saveCommande = (event, id) => {
    const reenable = disableSaveBtn(event);
    try {
        const form = document.getElementById('commandeForm');
        if (!form) return;
        const formData = new FormData(form);
        
        const items = [];
        const qtyInputs = document.querySelectorAll('.item-qty-input');
        qtyInputs.forEach(input => {
            const qty = parseInt(input.value, 10) || 0;
            if (qty > 0) {
                const name = input.name;
                const match = name.match(/items\[([^\]]+)\]\[([^\]]+)\]/);
                if (match) {
                    items.push({ aromeId: match[1], formatId: match[2], quantite: qty });
                }
            }
        });
        
        if (items.length === 0) {
            showToast('Ajoutez au moins un article', 'error');
            return;
        }
        
        const statutChoisi = formData.get('statut');
        const commandesExistantes = DB.get('commandes');
        const commandeExistante = id ? commandesExistantes.find(c => c.id === id) : null;
        if (commandeExistante && !isTransitionAllowed(commandeExistante.statut, statutChoisi)) {
            showToast('Transition de statut non autorisée', 'error');
            return;
        }
        if (!commandeExistante && !['en_attente', 'produite'].includes(statutChoisi)) {
            showToast('Statut initial non autorisé', 'error');
            return;
        }
        
        const clientId = formData.get('clientId');
        if (!clientId) {
            showToast('Veuillez sélectionner un client', 'error');
            return;
        }

        const dateLivraison = formData.get('dateLivraison');
        if (!dateLivraison || Number.isNaN(new Date(dateLivraison).getTime())) {
            showToast('Date de livraison invalide', 'error');
            return;
        }

        const commande = {
            id: id || generateId(),
            numero: id ? DB.get('commandes').find(c => c.id === id)?.numero : getNextCommandeNumero(),
            clientId,
            dateCommande: id ? DB.get('commandes').find(c => c.id === id)?.dateCommande : getLocalDateISOString(),
            dateLivraison,
            statut: statutChoisi,
            items
        };

        const commandes = DB.get('commandes');
        if (id) {
            const index = commandes.findIndex(c => c.id === id);
            if (index !== -1) {
                commandes[index] = commande;
            } else {
                commandes.push(commande);
            }
        } else {
            commandes.push(commande);
        }
        DB.set('commandes', commandes);

        // La copie dupliquée est confirmée → on oublie l'id en attente de suppression
        if (_pendingDuplicateId === commande.id) _pendingDuplicateId = null;

        modal.hide();
        showToast('Commande enregistrée');
        renderCommandes();
    } catch (e) {
        console.error('Error saving commande:', e);
        showToast('Erreur lors de l\'enregistrement de la commande', 'error');
    } finally {
        if (reenable) reenable();
    }
};

const editCommande = (id) => showCommandeModal(id);

const updateCommandeStatut = (id, statut) => {
    const commandes = DB.get('commandes');
    const index = commandes.findIndex(c => c.id === id);
    if (index === -1) return;
    const from = commandes[index].statut;
    if (!isTransitionAllowed(from, statut)) {
        console.error(`Transition interdite: ${from} -> ${statut}`);
        showToast('Transition de statut non autorisée', 'error');
        return;
    }
    commandes[index].statut = statut;
    DB.set('commandes', commandes);
    renderCommandes();
};

const restaurerCommande = (id) => {
    const commande = DB.get('commandes').find(c => c.id === id);
    if (!commande) return;
    const lotsUtilises = Array.isArray(commande.lotsUtilises) ? commande.lotsUtilises : [];
    const hasLots = lotsUtilises.length > 0;
    const hasBL = (DB.get('livraisons') || []).some(l => l.commandeId === id);
    const totalRestitue = lotsUtilises.reduce((s, l) => s + (l.quantite || 0), 0);
    let message = 'Restaurer cette commande ? Elle redeviendra "produite".';
    if (hasLots) {
        message = `Restaurer cette commande ? Elle redeviendra "produite" et ${totalRestitue} bouteille(s) seront recréditée(s) au stock.`;
        if (hasBL) {
            message += ' Attention : le BL émis pour cette commande reste en base.';
        }
    }
    confirmDialog(message).then(ok => {
        if (!ok) return;
        if (hasLots) {
            const lots = DB.get('lots') || [];
            lotsUtilises.forEach(entree => {
                const existing = lots.find(l => l.id === entree.lotId);
                if (existing) {
                    existing.quantite = (existing.quantite || 0) + entree.quantite;
                } else {
                    const lot = { arome: entree.arome, format: entree.format, quantite: entree.quantite };
                    if (entree.dateProduction) lot.dateProduction = entree.dateProduction;
                    if (entree.dlc) lot.dlc = entree.dlc;
                    lots.push({ id: entree.lotId || generateId(), ...lot });
                }
            });
            const commandes = DB.get('commandes');
            const cmdIndex = commandes.findIndex(c => c.id === id);
            if (cmdIndex !== -1) {
                commandes[cmdIndex].statut = 'produite';
                delete commandes[cmdIndex].lotsUtilises;
                DB.setMany({ lots: lots, commandes: commandes });
                renderCommandes();
            }
            showToast(`${totalRestitue} bouteille(s) recréditée(s) au stock`);
        } else {
            updateCommandeStatut(id, 'produite');
            showToast('Commande restaurée');
        }
    });
};

const showLivraisonBouteillesModal = (commandeId) => {
    const commandes = DB.get('commandes') || [];
    const lots = DB.get('lots') || [];
    const aromes = DB.get('aromes') || [];
    const formats = DB.get('formats') || [];
    const clients = DB.get('clients') || [];

    const cmd = commandes.find(c => c.id === commandeId);
    if (!cmd) {
        showToast('Commande non trouvée', 'error');
        return;
    }

    const client = clients.find(cl => cl.id === cmd.clientId);
    const clientName = client ? (client.societe || client.nom) : 'N/A';
    const totalItems = (cmd.items || []).reduce((sum, i) => sum + i.quantite, 0);

    const normalize = (s) => (s || '').toString().toLowerCase().trim();

    const sortedLots = [...lots]
        .filter(lot => new Date(lot.dlc || '9999-12-31') >= new Date())
        .sort((a, b) => new Date(a.dateProduction || '1970-01-01') - new Date(b.dateProduction || '1970-01-01'));

    const lignesHtml = getItems(cmd).map(item => {
        const arome = aromes.find(a => a.id === item.aromeId);
        const format = formats.find(f => f.id === item.formatId);
        const aromeNom = arome?.nom || '?';
        const formatNom = format?.nom || '?';
        const aromeNorm = normalize(aromeNom);
        const formatNorm = normalize(formatNom);

        const lotsDisponibles = sortedLots.filter(lot =>
            normalize(lot.arome) === aromeNorm &&
            normalize(lot.format) === formatNorm &&
            lot.quantite > 0
        );

        let autoFilled = [];
        let remaining = item.quantite;
        for (const lot of lotsDisponibles) {
            if (remaining <= 0) break;
            const take = Math.min(lot.quantite, remaining);
            autoFilled.push({ lotId: lot.id, quantite: take });
            remaining -= take;
        }

        const lotsRow = lotsDisponibles.length === 0
            ? `<em class="text-muted">Aucun lot disponible</em>`
            : lotsDisponibles.map(lot => {
                const prefill = autoFilled.find(a => a.lotId === lot.id)?.quantite || 0;
                return `<div class="flex-between" style="padding: 4px 0;">
                    <span style="font-size: 12px;">#${String(lot.id).slice(-6)} — ${escapeHtml(lot.arome)} ${escapeHtml(lot.format)} <em style="color: var(--text-muted);">(Stock: ${lot.quantite})</em></span>
                    <div style="display: flex; align-items: center; gap: 6px;">
                        <input type="number" class="lot-qty-input" data-lot="${lot.id}" data-item="${item.aromeId}|${item.formatId}" value="${prefill}" min="0" max="${lot.quantite}" style="width: 60px;">
                        <span style="font-size: 12px; color: var(--text-muted);">/ ${lot.quantite}</span>
                    </div>
                </div>`;
            }).join('');

        const filledTotal = autoFilled.reduce((s, a) => s + a.quantite, 0);
        const totalId = `item-total-${item.aromeId}-${item.formatId}`.replace(/[^a-zA-Z0-9]/g, '_');

        return `<div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: var(--radius);">
            <div class="flex-between" style="margin-bottom: 8px;">
                <strong>${escapeHtml(aromeNom)} ${escapeHtml(formatNom)}</strong>
                <span style="color: var(--text-muted); font-size: 12px;">${item.quantite} commandées</span>
            </div>
            <div id="${totalId}" class="item-total-display" data-required="${item.quantite}">
                <span style="font-size: 12px;">Alloué: <strong id="${totalId}-count">${filledTotal}</strong> / ${item.quantite}</span>
            </div>
            <div style="margin-top: 8px;">${lotsRow}</div>
        </div>`;
    }).join('');

    const validateAndDeliver = () => {
        const inputs = document.querySelectorAll('.lot-qty-input');
        const allocations = {};
        let hasError = false;

        inputs.forEach(input => {
            if (hasError) return;
            const qty = parseInt(input.value, 10) || 0;
            if (qty <= 0) return;
            const maxQty = parseInt(input.getAttribute('max'), 10) || 0;
            if (qty > maxQty) {
                hasError = true;
                showToast(`Quantité supérieure au stock pour le lot #${String(input.dataset.lot).slice(-6)}`, 'error');
                return;
            }
            const lotId = input.dataset.lot;
            const itemKey = input.dataset.item;
            if (!allocations[itemKey]) allocations[itemKey] = [];
            allocations[itemKey].push({ lotId, quantite: qty });
        });

        if (hasError) return;

        for (const item of getItems(cmd)) {
            const key = `${item.aromeId}|${item.formatId}`;
            const alloue = allocations[key]?.reduce((s, a) => s + a.quantite, 0) || 0;
            if (alloue !== item.quantite) {
                hasError = true;
                const arome = aromes.find(a => a.id === item.aromeId);
                const format = formats.find(f => f.id === item.formatId);
                showToast(`Quantité incorrecte pour ${arome?.nom || '?'} ${format?.nom || '?'}: alloué ${alloue} / ${item.quantite}`, 'error');
                break;
            }
        }

        if (hasError) return;

        let allLots = DB.get('lots') || [];
        const lotsById = indexById(allLots);
        for (const group of Object.values(allocations)) {
            for (const { lotId, quantite } of group) {
                const lot = lotsById.get(lotId);
                if (!lot) {
                    showToast(`Lot introuvable: #${String(lotId).slice(-6)}`, 'error');
                    return;
                }
                if ((lot.quantite || 0) < quantite) {
                    showToast(`Stock insuffisant pour le lot #${String(lotId).slice(-6)}`, 'error');
                    return;
                }
            }
        }
        const lotsUtilises = [];

        Object.values(allocations).forEach(group => {
            group.forEach(({ lotId, quantite }) => {
                if (quantite <= 0) return;
                const lotIndex = allLots.findIndex(l => l.id === lotId);
                if (lotIndex === -1) return;
                const lot = allLots[lotIndex];
                allLots[lotIndex].quantite -= quantite;
                lotsUtilises.push({
                    lotId: lot.id,
                    arome: lot.arome,
                    format: lot.format,
                    quantite
                });
            });
        });

        allLots = allLots.filter(l => l.quantite > 0);

        const cmdIndex = commandes.findIndex(c => c.id === commandeId);
        if (cmdIndex !== -1) {
            commandes[cmdIndex].lotsUtilises = lotsUtilises;
            commandes[cmdIndex].statut = 'livrée';
            DB.setMany({ lots: allLots, commandes: commandes });
            renderCommandes();
        } else {
            DB.set('lots', allLots);
            updateCommandeStatut(commandeId, 'livrée');
        }

        modal.hide();

        confirmDialog('Générer un bulletin de livraison maintenant ?').then(ok => {
            if (!ok) return;
            const livraison = generateBL(commandeId);
            if (livraison) {
                showToast(`BL-${getBLNumero(livraison)} créé`);
                exportBLExcel(livraison.id);
            }
        });

        renderCommandes();
    };

    const computeTotals = () => {
        document.querySelectorAll('.lot-qty-input').forEach(input => {
            const itemKey = input.dataset.item;
            const itemInputs = document.querySelectorAll(`.lot-qty-input[data-item="${itemKey}"]`);
            const total = Array.from(itemInputs).reduce((s, inp) => s + (parseInt(inp.value, 10) || 0), 0);
            const totalId = `item-total-${itemKey.replace('|', '-')}`.replace(/[^a-zA-Z0-9]/g, '_');
            const totalEl = document.getElementById(`${totalId}-count`);
            if (totalEl) totalEl.textContent = total;
        });
    };

    modal.show(`Livrer commande #${getCommandeNumero(cmd)} — ${clientName}`, `
        <div style="max-height: 65vh; overflow-y: auto;">
            <p style="margin-bottom: 16px; font-size: 13px; color: var(--text-muted);">${totalItems} articles au total. Répartissez les bouteilles par lot (FIFO auto-rempli, modifiable).</p>
            ${lignesHtml}
        </div>
    `, `
        <button class="btn btn-secondary" onclick="modal.hide()">Annuler</button>
        <button class="btn btn-success" id="confirm-livraison-btn">Confirmer la livraison</button>
    `, 'large');

    document.querySelectorAll('.lot-qty-input').forEach(input => {
        input.addEventListener('input', computeTotals);
    });

    document.getElementById('confirm-livraison-btn')?.addEventListener('click', validateAndDeliver);
};

const showCommandeDetails = (id) => {
    const commandes = DB.get('commandes');
    const clients = DB.get('clients');
    const aromes = DB.get('aromes');
    const formats = DB.get('formats');

    const commande = commandes.find(c => c.id === id);
    if (!commande) return;

    const client = clients.find(c => c.id === commande.clientId);
    const clientName = client ? (client.societe || client.nom) : 'N/A';
    const totalItems = (commande.items || []).reduce((sum, i) => sum + (i.quantite || 0), 0);
    const montant = getCommandeMontant(commande, clients, formats);

    const badgeMap = {
        'en_attente': 'badge-en-attente',
        'produite':   'badge-produite',
        'livrée':      'badge-livree',
        'annulee':    'badge-annulee'
    };
    const labelStatut = { 'en_attente': 'en attente', 'produite': 'produite', 'livrée': 'livrée', 'annulee': 'annulée' }[commande.statut] || commande.statut;

    // Prochaine action selon statut
    const isAnnulee = commande.statut === 'annulee';
    const isLivree = commande.statut === 'livrée';
    let nextActionHtml = '';
    if (!isAnnulee && !isLivree) {
        if (commande.statut === 'en_attente') {
            nextActionHtml = `<div class="commande-next-action">
                <div class="commande-next-action-text">
                    <div class="commande-next-action-label">Prochaine étape</div>
                    <div class="commande-next-action-title">Marquer comme produite</div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="updateCommandeStatut('${commande.id}', 'produite'); modal.hide();">→ Produire</button>
            </div>`;
        } else if (commande.statut === 'produite') {
            nextActionHtml = `<div class="commande-next-action">
                <div class="commande-next-action-text">
                    <div class="commande-next-action-label">Prochaine étape</div>
                    <div class="commande-next-action-title">Livrer (déduit le stock)</div>
                </div>
                <button class="btn btn-primary btn-sm" onclick="modal.hide(); showLivraisonBouteillesModal('${commande.id}');">→ Livrer</button>
            </div>`;
        }
    }

    // Items
    const articlesHtml = getItems(commande).map(item => {
        const arome = aromes.find(a => a.id === item.aromeId);
        const format = formats.find(f => f.id === item.formatId);
        const dotColor = arome?.couleur || '#ccc';
        return `<div class="commande-article-row">
            <div class="commande-article-name">
                <span class="matrix-dot" style="background:${escapeHtml(dotColor)}"></span>
                <span>${escapeHtml(arome?.nom || '?')} ${escapeHtml(format?.nom || '?')}</span>
            </div>
            <div class="commande-article-qty">${item.quantite} bt</div>
        </div>`;
    }).join('');

    // Lots utilisés (si livrée)
    const lotsHtml = commande.lotsUtilises && commande.lotsUtilises.length > 0
        ? `<div class="commande-section">
            <div class="commande-section-title">Lots utilisés</div>
            ${commande.lotsUtilises.map(lot => `
                <div class="commande-article-row">
                    <div class="commande-article-name">
                        <span>#${String(lot.lotId).slice(-6)} • ${escapeHtml(lot.arome)} ${escapeHtml(lot.format)}</span>
                    </div>
                    <div class="commande-article-qty">${lot.quantite} bt</div>
                </div>
            `).join('')}
        </div>` : '';

    const clientPhone = client?.telephone || '';
    const clientAddress = client?.adresse || '';
    const clientLocation = clientAddress; // si on a une adresse, on l'utilise pour Itinéraire

    modal.show(`Commande #${getCommandeNumero(commande)}`, `
        ${isAnnulee ? `<div class="commande-detail-banner-cancel">⚠ Commande annulée</div>` : ''}

        <div class="commande-detail-hero">
            <div class="commande-detail-hero-row">
                <div>
                    <span class="badge ${badgeMap[commande.statut] || 'badge-default'}">${escapeHtml(labelStatut || '')}</span>
                </div>
                <div style="text-align:right;">
                    <div class="section-label" style="color: var(--text-light);">Total</div>
                </div>
            </div>
            <div class="commande-detail-amount">${formatChf(montant)}</div>
            ${montant === null ? `<button type="button" class="btn-bare" style="color: var(--warning-fg); font-size: var(--font-caption); padding: 4px 0; text-decoration: underline;" onclick="showCommandeMontantDiagModal('${commande.id}')">ℹ️ Pourquoi pas de montant ?</button>` : ''}
            <div class="commande-detail-delivery">${totalItems} bouteille${totalItems > 1 ? 's' : ''} • Livraison ${formatDate(commande.dateLivraison)}</div>
        </div>

        ${renderStepTracker(commande.statut)}

        ${nextActionHtml}

        <div class="commande-section">
            <div class="commande-section-title">Articles</div>
            ${articlesHtml || '<p style="color: var(--text-light); font-size: var(--font-body);">Aucun article</p>'}
        </div>

        <div class="commande-section">
            <div class="commande-section-title">Client</div>
            <div style="font-size: var(--font-body-lg); font-weight: 600; color: var(--text);">${escapeHtml(clientName)}</div>
            ${clientAddress ? `<div style="font-size: var(--font-caption); color: var(--text-light); margin-top: 4px;">${escapeHtml(clientAddress)}</div>` : ''}
            ${(clientPhone || clientAddress) ? `<div class="commande-client-actions">
                ${clientPhone ? `<a href="tel:${escapeHtml(clientPhone)}" class="btn btn-ghost btn-sm">📞 Appeler</a>` : '<span></span>'}
                ${clientAddress ? `<a href="https://maps.google.com/?q=${encodeURIComponent(clientAddress)}" target="_blank" rel="noopener" class="btn btn-ghost btn-sm">🧭 Itinéraire</a>` : '<span></span>'}
            </div>` : ''}
        </div>

        ${lotsHtml}

        <div class="commande-actions-bottom">
            ${!isAnnulee && !isLivree ? `<button class="btn btn-ghost btn-sm" onclick="duplicateCommande('${commande.id}')">⎘ Dupliquer</button>` : ''}
            ${!isAnnulee && !isLivree ? `<button class="btn btn-ghost btn-sm" onclick="modal.hide(); editCommande('${commande.id}');">✎ Modifier</button>` : ''}
            ${!isAnnulee && !isLivree ? `<button class="btn btn-sm" style="background: var(--error-bg); color: var(--error-fg); font-weight: 700;" onclick="confirmAnnulerCommande('${commande.id}')">Annuler la commande</button>` : ''}
            ${isLivree ? `<button class="btn btn-ghost btn-sm" onclick="restaurerCommande('${commande.id}')">↶ Restaurer</button>` : ''}
        </div>
    `, `
        <button class="btn btn-secondary" onclick="modal.hide()">Fermer</button>
    `);
};

// Modal de diagnostic : explique pourquoi le total CHF est "—" pour une commande
const showCommandeMontantDiagModal = (commandeId) => {
    const commandes = DB.get('commandes') || [];
    const clients = DB.get('clients') || [];
    const formats = DB.get('formats') || [];
    const aromes = DB.get('aromes') || [];
    const commande = commandes.find(c => c.id === commandeId);
    if (!commande) return;
    const r = diagnoseCommandeMontant(commande, clients, formats);

    const headerLine = (label, value, ok) => `
        <div style="display:flex; justify-content:space-between; padding: 6px 0; border-bottom: 1px solid var(--border-light); font-size: var(--font-caption);">
            <span style="color: var(--text-light);">${escapeHtml(label)}</span>
            <span style="font-weight: 600; color: ${ok ? 'var(--success-fg)' : 'var(--error-fg)'};">${escapeHtml(value)}</span>
        </div>`;

    const itemRows = r.items.map(it => {
        const arome = aromes.find(a => a.id === it.aromeId);
        const aromeNom = arome?.nom || '(arôme inconnu)';
        const fmtLabel = it.formatFound
            ? `<span style="color: var(--success-fg);">✓ ${escapeHtml(it.formatNom || '')}${it.contenanceCl ? ' (' + it.contenanceCl + ' cl)' : ''}</span>`
            : `<span style="color: var(--error-fg);">✗ format introuvable<br><small style="color: var(--text-light);">formatId: ${escapeHtml(String(it.formatId || ''))}</small></span>`;
        const keyLabel = it.priceKey
            ? `<span style="color: var(--success-fg);">${escapeHtml(it.priceKey)}</span>`
            : `<span style="color: var(--error-fg);">— (mapping inconnu)</span>`;
        const priceSource = it.priceFromClient > 0 ? `${it.priceFromClient.toFixed(2)} CHF (client)`
                          : it.priceFromPreset > 0 ? `${it.priceFromPreset.toFixed(2)} CHF (preset)`
                          : '—';
        const lineColor = it.priceUsed > 0 ? 'var(--success-fg)' : 'var(--error-fg)';
        return `
            <div style="background: var(--bg-secondary); border-radius: var(--radius-md); padding: 10px; margin-bottom: 8px;">
                <div style="font-weight: 700; color: var(--text); margin-bottom: 6px;">${escapeHtml(aromeNom)} × ${it.quantite} bt</div>
                ${headerLine('Format trouvé', '', it.formatFound).replace('<span style="font-weight: 600; color: var(--error-fg);"></span>', fmtLabel).replace('<span style="font-weight: 600; color: var(--success-fg);"></span>', fmtLabel)}
                <div style="display:flex; justify-content:space-between; padding: 4px 0; font-size: var(--font-caption);"><span style="color: var(--text-light);">Format</span>${fmtLabel}</div>
                <div style="display:flex; justify-content:space-between; padding: 4px 0; font-size: var(--font-caption);"><span style="color: var(--text-light);">Clé prix</span>${keyLabel}</div>
                <div style="display:flex; justify-content:space-between; padding: 4px 0; font-size: var(--font-caption);"><span style="color: var(--text-light);">Prix utilisé</span><span style="color: ${lineColor}; font-weight: 600;">${escapeHtml(priceSource)}</span></div>
                <div style="display:flex; justify-content:space-between; padding: 4px 0; font-size: var(--font-caption);"><span style="color: var(--text-light);">Total ligne</span><span style="font-weight: 700; color: ${lineColor};">${it.ligneTotal > 0 ? formatChf(it.ligneTotal) : '—'}</span></div>
            </div>`;
    }).join('');

    const recommendation = !r.clientFound
        ? '<p style="color: var(--error-fg);">⚠ Client introuvable : <code>' + escapeHtml(String(r.clientId)) + '</code></p>'
        : r.items.some(i => !i.formatFound)
            ? '<p style="color: var(--warning-fg);">⚠ Au moins un format de la commande n\'existe plus en DB (renommé/supprimé). Ouvre la commande pour la modifier et resélectionner les formats actuels.</p>'
            : r.items.some(i => !i.priceKey)
                ? '<p style="color: var(--warning-fg);">⚠ Le format de cette commande n\'a pas de prix correspondant (contenance non standard : 25cl/50cl/1L attendus).</p>'
                : r.hasPrice
                    ? ''
                    : '<p style="color: var(--warning-fg);">⚠ Tous les prix sont vides. Configure les prix du client ou applique un preset (Distributeur/Privé).</p>';

    modal.show('Diagnostic Total CHF',
        `<div style="font-size: var(--font-body);">
            <div style="background: var(--white); border-radius: var(--radius-card); padding: 12px; margin-bottom: 12px; border: 1px solid var(--border-light);">
                ${headerLine('Commande', '#' + r.cmdNumero, true)}
                ${headerLine('Client trouvé', r.clientLabel, r.clientFound)}
                ${headerLine('Catégorie tarif', r.tarifsCategorie || '—', !!r.tarifsCategorie && r.tarifsCategorie !== 'custom')}
                ${headerLine('Items', String(r.items.length), r.items.length > 0)}
                ${headerLine('Total calculable', r.hasPrice ? 'Oui' : 'Non', r.hasPrice)}
            </div>
            <div style="margin-bottom: 12px;">${recommendation}</div>
            <h4 style="margin-bottom: 8px; font-size: var(--font-body-lg);">Détail par ligne</h4>
            ${itemRows || '<p style="color: var(--text-light);">Aucun article.</p>'}
        </div>`,
        `<button class="btn btn-secondary" onclick="modal.hide()">Fermer</button>`
    );
};

// Confirme l'annulation puis met à jour le statut
const confirmAnnulerCommande = (id) => {
    confirmDialog('Annuler définitivement cette commande ?', { danger: true, confirmLabel: 'Annuler la commande' }).then(ok => {
        if (!ok) return;
        updateCommandeStatut(id, 'annulee');
        modal.hide();
    });
};

// Duplique une commande : copie items + client, génère un nouvel id et numéro, ouvre modal édition
const duplicateCommande = (id) => {
    const commandes = DB.get('commandes') || [];
    const original = commandes.find(c => c.id === id);
    if (!original) return;
    const copy = {
        id: generateId(),
        numero: getNextCommandeNumero(),
        clientId: original.clientId,
        dateCommande: getLocalDateISOString(),
        dateLivraison: '',
        statut: 'en_attente',
        items: (original.items || []).map(i => ({ ...i }))
    };
    commandes.push(copy);
    DB.set('commandes', commandes);
    modal.hide();
    showToast(`Commande dupliquée → #${copy.numero}`);
    _pendingDuplicateId = copy.id;
    showCommandeModal(copy.id);
};

const toggleArchives = () => {
    const showArchives = localStorage.getItem('thecol_show_archives') === 'true';
    localStorage.setItem('thecol_show_archives', showArchives ? 'false' : 'true');
    // Reset des filtres qui pourraient masquer les archives (filtre date semaine courante,
    // filtre statut 'en_attente' / 'produite' qui exclurait toutes les livrées).
    weekCalendarSelectedDate = '';
    DB.setFilter('statut', '');
    renderCommandes();
};

// Archives
const getArchiveFilteredCommandes = () => {
    const savedFilterYear = DB.getFilter('archive_year');
    const savedFilterClient = DB.getFilter('archive_client');
    return DB.get('commandes').filter(c => {
        if (c.statut !== 'livrée') return false;
        const year = c.dateCommande ? c.dateCommande.substring(0, 4) : '2024';
        const matchesYear = !savedFilterYear || year === savedFilterYear;
        const matchesClient = !savedFilterClient || c.clientId === savedFilterClient;
        return matchesYear && matchesClient;
    });
};

const renderArchives = () => {
    const savedFilterYear = DB.getFilter('archive_year');
    const savedFilterClient = DB.getFilter('archive_client');
    
    const commandes = DB.get('commandes').filter(c => c.statut === 'livrée');
    const clients = DB.get('clients') || [];
    const aromes = DB.get('aromes') || [];
    const formats = DB.get('formats') || [];
    const lookups = {
        clientsById: indexById(clients),
        aromesById: indexById(aromes),
        formatsById: indexById(formats)
    };

    const years = [...new Set(commandes.map(c => c.dateCommande ? c.dateCommande.substring(0, 4) : '2024'))].sort().reverse();

    const filteredCommandes = getArchiveFilteredCommandes();
    
    let html = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Archives des commandes</h3>
                <button class="btn btn-secondary" onclick="exportArchivesExcel()">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    Exporter Excel
                </button>
            </div>
            
            <div class="filters">
                <select id="filterArchiveYear" onchange="DB.setFilter('archive_year', this.value); renderArchives()">
                    <option value="">Toutes les années</option>
                    ${years.map(y => `<option value="${y}" ${savedFilterYear === y ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
                <select id="filterArchiveClient" onchange="DB.setFilter('archive_client', this.value); renderArchives()">
                    <option value="">Tous les clients</option>
                    ${clients.filter(c => c.actif).map(c => `<option value="${c.id}" ${savedFilterClient === c.id ? 'selected' : ''}>${escapeHtml(c.societe || c.nom)}</option>`).join('')}
                </select>
            </div>
            
            <div class="table-container" id="archivesTableContainer">
                <table>
                    <thead>
                        <tr>
                            <th>N°</th>
                            <th>Client</th>
                            <th>Date commande</th>
                            <th>Date livraison</th>
                            <th>Articles</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredCommandes.length === 0 ? '<tr><td colspan="6" class="text-center">Aucune commande archivée</td></tr>' : 
                          filteredCommandes.sort((a, b) => new Date(b.dateCommande) - new Date(a.dateCommande))
                            .map(cmd => {
                                const client = lookups.clientsById.get(cmd.clientId);
                                const safeItems = cmd.items || [];
                                const totalItems = safeItems.reduce((sum, i) => sum + i.quantite, 0);
                                const articlesPreview = safeItems.slice(0, 2).map(i => {
                                    const a = lookups.aromesById.get(i.aromeId);
                                    const f = lookups.formatsById.get(i.formatId);
                                    return escapeHtml(`${i.quantite}x ${a?.nom || '?'} ${f?.nom || '?'}`);
                                }).join(', ');

                                return `
                                    <tr>
                                        <td>${getCommandeNumero(cmd)}</td>
                                        <td>${escapeHtml(client?.societe || client?.nom || 'N/A')}</td>
                                        <td>${formatDate(cmd.dateCommande)}</td>
                                        <td>${formatDate(cmd.dateLivraison)}</td>
                                        <td>${articlesPreview}${safeItems.length > 2 ? '...' : ''} (${totalItems})</td>
                                        <td>
                                            <button class="btn btn-sm btn-secondary" onclick="showCommandeDetails('${cmd.id}')">Détails</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;
    
    safeRender(html);
};

const exportArchivesExcel = async () => {
    const commandes = getArchiveFilteredCommandes();
    const clients = DB.get('clients') || [];
    const aromes = DB.get('aromes') || [];
    const formats = DB.get('formats') || [];

    if (commandes.length === 0) {
        showToast('Aucune commande livrée ne correspond aux filtres', 'error');
        return;
    }
    if (typeof XLSX === 'undefined') {
        showToast('Bibliothèque Excel non chargée', 'error');
        return;
    }

    const data = commandes
        .slice()
        .sort((a, b) => new Date(b.dateLivraison || 0) - new Date(a.dateLivraison || 0))
        .map(cmd => {
            const client = clients.find(c => c.id === cmd.clientId);
            const items = getItems(cmd).map(item => {
                const a = aromes.find(a => a.id === item.aromeId);
                const f = formats.find(f => f.id === item.formatId);
                return `${item.quantite}x ${a?.nom || '?'} ${f?.nom || '?'}`;
            }).join(', ');
            const totalBt = getItems(cmd).reduce((sum, i) => sum + (i.quantite || 0), 0);
            const montant = getCommandeMontant(cmd, clients, formats);

            return {
                'N°': getCommandeNumero(cmd),
                'Client': client?.societe || client?.nom || 'N/A',
                'Catégorie tarif': normalizeTarifKey(client?.tarifs),
                'Date commande': cmd.dateCommande || '',
                'Date livraison': cmd.dateLivraison || '',
                'Articles': items,
                'Total bouteilles': totalBt,
                'Montant CHF': montant !== null ? montant.toFixed(2) : ''
            };
        });

    const fileName = `archives_commandes_${getLocalDateISOString()}.xlsx`;
    const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    let wbout;
    try {
        const wb = XLSX.utils.book_new();
        const ws = XLSX.utils.json_to_sheet(data);
        XLSX.utils.book_append_sheet(wb, ws, 'Archives');
        wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
    } catch (e) {
        console.error('XLSX build failed:', e);
        showToast('Erreur lors de la génération Excel', 'error');
        return;
    }

    const blob = new Blob([wbout], { type: XLSX_MIME });

    // 1) Web Share API (Capacitor WebView Android + navigateurs mobiles modernes)
    //    Permet à l'utilisateur de choisir une destination (Drive, WhatsApp, Email, Téléchargements…)
    try {
        const file = new File([blob], fileName, { type: XLSX_MIME });
        if (navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Archives ThéCol', text: `${commandes.length} commandes livrées` });
            showToast(`Export prêt (${commandes.length} commandes)`);
            return;
        }
    } catch (e) {
        if (e?.name === 'AbortError') {
            // L'utilisateur a annulé le menu de partage — silence, c'est OK
            return;
        }
        console.warn('Share API failed, falling back to download:', e);
    }

    // 2) Fallback : download classique (web desktop ou WebView sans Share API)
    try {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        showToast(`Export téléchargé (${commandes.length} commandes)`);
    } catch (e) {
        console.error('Download fallback failed:', e);
        showToast('Erreur lors du téléchargement', 'error');
    }
};

// Livraisons / Bulletins de Livraison
const getLivraisonByCommandeId = (commandeId, livraisons = null) => {
    const allLivraisons = livraisons || DB.get('livraisons') || [];
    return allLivraisons.find(l => l.commandeId === commandeId) || null;
};

const getCommandesEligibleBL = (commandes = null, livraisons = null) => {
    const allCommandes = commandes || DB.get('commandes') || [];
    const allLivraisons = livraisons || DB.get('livraisons') || [];
    // Set des commandeId ayant deja un BL : O(C+L) au lieu de O(C*L) avec find
    const blCommandeIds = new Set(allLivraisons.map(l => l.commandeId));
    return allCommandes.filter(cmd =>
        (cmd.statut === 'produite' || cmd.statut === 'livrée') &&
        !blCommandeIds.has(cmd.id)
    );
};

const resetLivraisonFilters = () => {
    DB.setFilter('livraison_year', '');
    DB.setFilter('livraison_client', '');
    renderLivraisons();
};

const createBLFromCommande = (commandeId, exportAfterCreate = true) => {
    const existing = getLivraisonByCommandeId(commandeId);
    if (existing) {
        showToast(`BL-${getBLNumero(existing)} existe déjà`, 'warning');
        modal.hide();
        renderLivraisons();
        return existing;
    }

    const livraison = generateBL(commandeId);
    if (!livraison) return null;

    showToast(`BL-${getBLNumero(livraison)} créé`);
    modal.hide();
    renderLivraisons();

    if (exportAfterCreate) {
        exportBLExcel(livraison.id);
    }

    return livraison;
};

const showCreateBLModal = () => {
    const commandes = DB.get('commandes') || [];
    const livraisons = DB.get('livraisons') || [];
    const clients = DB.get('clients') || [];
    const aromes = DB.get('aromes') || [];
    const formats = DB.get('formats') || [];
    const eligibleCommandes = getCommandesEligibleBL(commandes, livraisons)
        .sort((a, b) => new Date(b.dateLivraison || b.dateCommande || 0) - new Date(a.dateLivraison || a.dateCommande || 0));

    const rowsHtml = eligibleCommandes.length === 0
        ? `<tr><td colspan="6" class="text-center">Aucune commande produite ou livrée sans BL</td></tr>`
        : eligibleCommandes.map(cmd => {
            const client = clients.find(c => c.id === cmd.clientId);
            const totalItems = getItems(cmd).reduce((sum, item) => sum + (item.quantite || 0), 0);
            const articlesPreview = getItems(cmd).slice(0, 2).map(item => {
                const a = aromes.find(a => a.id === item.aromeId);
                const f = formats.find(f => f.id === item.formatId);
                return escapeHtml(`${item.quantite}x ${a?.nom || '?'} ${f?.nom || '?'}`);
            }).join(', ');
            const statusLabel = cmd.statut === 'livrée' ? 'livrée' : 'produite';

            return `
                <tr>
                    <td>#${getCommandeNumero(cmd)}</td>
                    <td>${escapeHtml(client?.societe || client?.nom || 'N/A')}</td>
                    <td>${cmd.dateLivraison || cmd.dateCommande ? formatDate(cmd.dateLivraison || cmd.dateCommande) : '-'}</td>
                    <td><span class="badge ${cmd.statut === 'livrée' ? 'badge-livree' : 'badge-produite'}">${statusLabel}</span></td>
                    <td>${articlesPreview}${getItems(cmd).length > 2 ? '...' : ''} (${totalItems})</td>
                    <td>
                        <button class="btn btn-sm btn-primary" onclick="createBLFromCommande('${cmd.id}')">Créer le BL</button>
                    </td>
                </tr>
            `;
        }).join('');

    modal.show('Créer un bulletin de livraison', `
        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>N° Commande</th>
                        <th>Client</th>
                        <th>Date livraison</th>
                        <th>Statut</th>
                        <th>Articles</th>
                        <th>Action</th>
                    </tr>
                </thead>
                <tbody>${rowsHtml}</tbody>
            </table>
        </div>
    `, `
        <button class="btn btn-secondary" onclick="modal.hide()">Fermer</button>
    `, 'large');
};

const renderLivraisons = () => {
    const livraisons = DB.get('livraisons') || [];
    const commandes = DB.get('commandes') || [];
    const clients = DB.get('clients') || [];
    const aromes = DB.get('aromes') || [];
    const formats = DB.get('formats') || [];
    const lookups = {
        clientsById: indexById(clients),
        aromesById: indexById(aromes),
        formatsById: indexById(formats),
        formatsByNom: indexBy(formats, f => f.nom),
        formatsByNorm: indexBy(formats, f => String(f.nom || '').toLowerCase().replace(/\s+/g, '')),
        commandesById: indexById(commandes)
    };

    const savedFilterYear = DB.getFilter('livraison_year');
    const savedFilterClient = DB.getFilter('livraison_client');
    const hasActiveFilters = !!savedFilterYear || !!savedFilterClient;
    
    const years = [...new Set(livraisons.map(l => l.dateBL ? l.dateBL.substring(0, 4) : '2024'))].sort().reverse();
    const livraisonClientIds = new Set(livraisons.map(l => l.clientId).filter(Boolean));
    const clientsForFilter = clients
        .filter(c => c.actif || livraisonClientIds.has(c.id))
        .sort((a, b) => (a.societe || a.nom || '').localeCompare(b.societe || b.nom || '', 'fr-CH'));
    const commandesLivreesSansBL = getCommandesEligibleBL(commandes, livraisons)
        .filter(cmd => cmd.statut === 'livrée')
        .sort((a, b) => new Date(b.dateLivraison || b.dateCommande || 0) - new Date(a.dateLivraison || a.dateCommande || 0));
    
    const filteredLivraisons = livraisons.filter(l => {
        const year = l.dateBL ? l.dateBL.substring(0, 4) : '2024';
        const matchesYear = !savedFilterYear || year === savedFilterYear;
        const matchesClient = !savedFilterClient || l.clientId === savedFilterClient;
        return matchesYear && matchesClient;
    });

    const emptyMessage = livraisons.length === 0
        ? 'Aucun bulletin de livraison créé pour le moment'
        : 'Aucun bulletin ne correspond aux filtres sélectionnés';

    const commandesSansBLHtml = renderLivraisonsSansBLCard(commandesLivreesSansBL, lookups);
    
    let html = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Bulletins de Livraison</h3>
                <div class="header-actions" style="display:flex; gap:8px;">
                    ${hasActiveFilters ? `<button class="btn btn-secondary btn-sm" onclick="resetLivraisonFilters()">Réinitialiser les filtres</button>` : ''}
                    <button class="btn btn-primary btn-sm" onclick="showCreateBLModal()">+ Créer un BL</button>
                </div>
            </div>
            
            <div class="filters">
                <select id="filterLivraisonYear" onchange="DB.setFilter('livraison_year', this.value); renderLivraisons()">
                    <option value="">Toutes les années</option>
                    ${years.map(y => `<option value="${y}" ${savedFilterYear === y ? 'selected' : ''}>${y}</option>`).join('')}
                </select>
                <select id="filterLivraisonClient" onchange="DB.setFilter('livraison_client', this.value); renderLivraisons()">
                    <option value="">Tous les clients</option>
                    ${clientsForFilter.map(c => `<option value="${c.id}" ${savedFilterClient === c.id ? 'selected' : ''}>${escapeHtml(c.societe || c.nom)}${c.actif === false ? ' (inactif)' : ''}</option>`).join('')}
                </select>
            </div>
            
            <div class="table-container" id="livraisonsTableContainer">
                <table>
                    <thead>
                        <tr>
                            <th>N° BL</th>
                            <th>N° Commande</th>
                            <th>Client</th>
                            <th>Date BL</th>
                            <th>Articles</th>
                            <th>Actions</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${filteredLivraisons.length === 0 ? `<tr><td colspan="6" class="text-center">${emptyMessage}</td></tr>` : 
                          filteredLivraisons.sort((a, b) => new Date(b.dateBL) - new Date(a.dateBL))
                            .map(liv => {
                                const commande = lookups.commandesById.get(liv.commandeId);
                                const client = lookups.clientsById.get(liv.clientId);
                                const lignes = Array.isArray(liv.lignes) ? liv.lignes : [];
                                const totalItems = lignes.reduce((sum, l) => sum + l.quantite, 0);
                                const articlesPreview = lignes.slice(0, 2).map(l => {
                                    const a = lookups.aromesById.get(l.aromeId);
                                    const f = lookups.formatsById.get(l.formatId);
                                    return escapeHtml(`${l.quantite}x ${a?.nom || '?'} ${f?.nom || '?'}`);
                                }).join(', ');

                                return `
                                    <tr>
                                        <td>BL-${getBLNumero(liv)}</td>
                                        <td>#${commande ? getCommandeNumero(commande) : liv.commandeId.slice(-5)}</td>
                                        <td>${escapeHtml(client?.societe || client?.nom || 'N/A')}</td>
                                        <td>${formatDate(liv.dateBL)}</td>
                                        <td>${articlesPreview}${lignes.length > 2 ? '...' : ''} (${totalItems})</td>
                                        <td>
                                            <button class="btn btn-sm btn-secondary" onclick="showLivraisonDetails('${liv.id}')">Détails</button>
                                            <button class="btn btn-sm btn-primary" onclick="exportBLExcel('${liv.id}')">Export Excel</button>
                                            <button class="btn btn-sm btn-danger" onclick="deleteLivraison('${liv.id}')">Supprimer</button>
                                        </td>
                                    </tr>
                                `;
                            }).join('')}
                    </tbody>
                </table>
            </div>
        </div>
    `;

    html += commandesSansBLHtml;
    
    safeRender(html);
};

const showLivraisonDetails = (id) => {
    const livraisons = DB.get('livraisons') || [];
    const clients = DB.get('clients') || [];
    const aromes = DB.get('aromes') || [];
    const formats = DB.get('formats') || [];
    const commandes = DB.get('commandes') || [];
    
    const livraison = livraisons.find(l => l.id === id);
    if (!livraison) return;
    
    const client = clients.find(c => c.id === livraison.clientId);
    const commande = commandes.find(c => c.id === livraison.commandeId);
    
    const lignes = Array.isArray(livraison.lignes) ? livraison.lignes : [];
    const lignesHtml = lignes.map(l => {
        const a = aromes.find(a => a.id === l.aromeId);
        const f = formats.find(f => f.id === l.formatId);
        return `<tr>
            <td>${escapeHtml(a?.nom || '?')}</td>
            <td>${escapeHtml(f?.nom || '?')}</td>
            <td>${l.quantite}</td>
        </tr>`;
    }).join('');

    const totalItems = lignes.reduce((sum, l) => sum + l.quantite, 0);

    modal.show(`BL #${getBLNumero(livraison)}`, `
        <div class="commande-details">
            <p><strong>Client:</strong> ${escapeHtml(client?.societe || client?.nom || 'N/A')}</p>
            <p><strong>Date BL:</strong> ${formatDate(livraison.dateBL)}</p>
            <p><strong>N° Commande:</strong> #${commande ? getCommandeNumero(commande) : livraison.commandeId.slice(-5)}</p>
            <p><strong>Total:</strong> ${totalItems} articles</p>
            <table class="details-table">
                <thead>
                    <tr>
                        <th>Arôme</th>
                        <th>Format</th>
                        <th>Quantité</th>
                    </tr>
                </thead>
                <tbody>
                    ${lignesHtml}
                </tbody>
            </table>
        </div>
    `, `
        <button class="btn btn-danger" onclick="deleteLivraison('${id}')">Supprimer</button>
        <button class="btn btn-secondary" onclick="modal.hide()">Fermer</button>
        <button class="btn btn-primary" onclick="exportBLExcel('${id}')">Export Excel</button>
    `);
};

const deleteLivraison = (id) => {
    confirmDialog('Êtes-vous sûr de vouloir supprimer ce bulletin de livraison ?', { danger: true }).then(ok => {
        if (!ok) return;
        const livraisons = DB.get('livraisons').filter(l => l.id !== id);
        DB.set('livraisons', livraisons);
        showToast('Bulletin de livraison supprimé');
        renderLivraisons();
    });
};

const AROME_BL_NAMES = {
    // Canonical name -> ROW_MAP key
    'mures sauvages': 'Mûres Sauvages',
    'mure sauvage': 'Mûres Sauvages',
    'mûres sauvages': 'Mûres Sauvages',
    'mûre sauvage': 'Mûres Sauvages',
    'poire a botzi': 'Poire à Botzi',
    'poire à botzi': 'Poire à Botzi',
    'herbes des alpes': 'Herbes des Alpes',
    'sureau': 'Sureau',
    'hibiscus': 'Hibiscus',
    'coing': 'Coing',
    'edition noel': 'Edition Noël',
    'edition noel': 'Edition Noël',
    'menthe': 'Menthe'
};

const getAromeBLName = (nom) => {
    if (!nom) return nom;
    const lower = nom.toLowerCase().trim();
    const mapped = AROME_BL_NAMES[lower];
    if (mapped) return mapped;
    const base = lower.replace(/s$/, '');
    return AROME_BL_NAMES[base] || nom;
};

const generateBL = (commandeId) => {
    const commandes = DB.get('commandes') || [];
    const aromes = DB.get('aromes') || [];
    const formats = DB.get('formats') || [];
    
    const commande = commandes.find(c => c.id === commandeId);
    if (!commande) {
        showToast('Commande non trouvée', 'error');
        return null;
    }
    
    const existing = getLivraisonByCommandeId(commandeId);
    if (existing) {
        showToast(`BL-${getBLNumero(existing)} existe déjà`, 'warning');
        return null;
    }

    const lignes = getItems(commande).filter(item => item.quantite > 0).map(item => {
        const a = aromes.find(ar => ar.id === item.aromeId);
        const f = formats.find(fmt => fmt.id === item.formatId);
        return {
            aromeId: item.aromeId,
            aromeNom: getAromeBLName(a?.nom) || item.aromeId,
            formatId: item.formatId,
            formatNom: f ? f.contenanceCl + ' cl' : item.formatId,
            quantite: item.quantite
        };
    });
    
    const livraison = {
        id: generateId(),
        numeroBL: getNextBLNumero(),
        commandeId: commandeId,
        clientId: commande.clientId,
        dateBL: getLocalDateISOString(),
        lignes: lignes,
        retours: [],
        facturationMode: '',
        notes: '',
        signatureNom: ''
    };
    
    const livraisons = DB.get('livraisons') || [];
    livraisons.push(livraison);
    DB.set('livraisons', livraisons);
    
    return livraison;
};

const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';

const ROW_MAP = {
    'Poire à Botzi|25 cl': 15,
    'Poire à Botzi|50 cl': 16,
    'Poire à Botzi|100 cl': 17,
    'Mûres Sauvages|25 cl': 21,
    'Mûres Sauvages|50 cl': 22,
    'Mûres Sauvages|100 cl': 23,
    'Herbes des Alpes|25 cl': 24,
    'Herbes des Alpes|50 cl': 25,
    'Herbes des Alpes|100 cl': 26,
    'Menthe|25 cl': 18,
    'Menthe|50 cl': 19,
    'Menthe|100 cl': 20,
    'Hibiscus|25 cl': 27,
    'Hibiscus|50 cl': 28,
    'Hibiscus|100 cl': 29,
    'Sureau|25 cl': 30,
    'Sureau|50 cl': 31,
    'Sureau|100 cl': 32,
    'Coing|25 cl': 33,
    'Coing|50 cl': 34,
    'Coing|100 cl': 35,
    'Edition Noël|25 cl': 36,
    'Edition Noël|50 cl': 37,
    'Edition Noël|100 cl': 38
};

const exportBLExcel = (livraisonId) => {
    const livraisons = DB.get('livraisons') || [];
    const clients = DB.get('clients') || [];
    const formats = DB.get('formats') || [];

    const livraison = livraisons.find(l => l.id === livraisonId);
    if (!livraison) {
        showToast('Livraison non trouvée', 'error');
        return;
    }

    const client = clients.find(c => c.id === livraison.clientId);

    const lignesFiltered = livraison.lignes.filter(l => l.quantite > 0);
    if (lignesFiltered.length === 0) {
        showToast('Aucun article à livrer', 'warning');
        return;
    }

    const merged = {};
    let skippedCount = 0;
    lignesFiltered.forEach(l => {
        const fmt = formats.find(f => f.id === l.formatId);
        if (!fmt) {
            skippedCount++;
            return;
        }
        const fmtLabel = fmt.contenanceCl + ' cl';
        const canonicalArome = getAromeBLName(l.aromeNom || '') || l.aromeNom || '';
        const key = `${canonicalArome}|${fmtLabel}`;
        if (merged[key]) {
            merged[key].quantite += l.quantite;
        } else {
            merged[key] = { aromeNom: l.aromeNom, formatNom: fmtLabel, quantite: l.quantite };
        }
    });

    if (skippedCount > 0) {
        showToast(`${skippedCount} article(s) ignoré(s) — format introuvable`, 'warning');
    }

    const templatePath = 'templates/bl_template.xlsx';
    const xhr = new XMLHttpRequest();
    xhr.open('GET', templatePath, true);
    xhr.responseType = 'arraybuffer';

    xhr.onload = () => {
        if (xhr.status !== 200) {
            showToast('Template non trouvé: ' + templatePath, 'error');
            return;
        }

        JSZip.loadAsync(xhr.response).then(zip => {
            const sheetFile = zip.file('xl/worksheets/sheet1.xml');
            const ssFile = zip.file('xl/sharedStrings.xml');

            if (!sheetFile) {
                showToast('Feuille non trouvée dans le template', 'error');
                return;
            }

            Promise.all([
                sheetFile.async('string'),
                ssFile ? ssFile.async('string') : Promise.resolve(null)
            ]).then(([sheetXml, ssXml]) => {
                let ssStrings = [];
                let ssModified = false;

                if (ssXml) {
                    const ssParser = new DOMParser();
                    const ssDoc = ssParser.parseFromString(ssXml, 'text/xml');
                    if (ssDoc.getElementsByTagName('parsererror').length > 0) {
                        showToast('Erreur lecture des chaînes partagées', 'error');
                        return;
                    }
                    const siEls = ssDoc.getElementsByTagName('si');
                    for (let i = 0; i < siEls.length; i++) {
                        const t = siEls[i].getElementsByTagName('t')[0];
                        ssStrings.push(t ? t.textContent : '');
                    }
                }

                const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
                const parser = new DOMParser();
                const sheetDoc = parser.parseFromString(sheetXml, 'text/xml');

                if (sheetDoc.getElementsByTagName('parsererror').length > 0) {
                    showToast('Erreur parsing du template XML', 'error');
                    return;
                }

                const getOrAddSS = (text) => {
                    let idx = ssStrings.indexOf(text);
                    if (idx === -1) {
                        idx = ssStrings.length;
                        ssStrings.push(text);
                        ssModified = true;
                    }
                    return idx;
                };

                const blNum = `BL-${getBLNumero(livraison)}`;
                const blDate = livraison.dateBL;
                const clientSociete = client ? (client.societe || '') : '';
                const clientContact = client ? (client.nom || '') : '';
                const clientAdresse = client ? (client.adresse || '') : '';
                const clientLocalite = client ? (`${client.npa || ''} ${client.localite || ''}`.trim()) : '';

                const promptNum = (label) => {
                    const raw = prompt(label);
                    if (raw === null) return null;
                    const n = parseInt(raw, 10);
                    return isNaN(n) || n < 0 ? 0 : n;
                };
                const CaisseRow = (label) => promptNum(label);
                const cVerteLivree = CaisseRow('Caisses vertes livrées (IFCO)');
                if (cVerteLivree === null) { showToast('Export annulé', 'warning'); return; }
                const cNoireLivree = CaisseRow('Caisses noires livrées (IFCO)');
                if (cNoireLivree === null) { showToast('Export annulé', 'warning'); return; }

                const setCellTextDom = (cell, text) => {
                    cell.setAttribute('t', 's');
                    const fEls = cell.getElementsByTagName('f');
                    for (let fi = fEls.length - 1; fi >= 0; fi--) fEls[fi].parentNode.removeChild(fEls[fi]);
                    const idx = getOrAddSS(text);
                    let vEl = cell.getElementsByTagName('v')[0];
                    if (!vEl) {
                        vEl = sheetDoc.createElementNS(NS, 'v');
                        cell.appendChild(vEl);
                    }
                    vEl.textContent = idx;
                };

                const setCellValueDom = (cell, value) => {
                    cell.removeAttribute('t');
                    const fEls = cell.getElementsByTagName('f');
                    for (let fi = fEls.length - 1; fi >= 0; fi--) fEls[fi].parentNode.removeChild(fEls[fi]);
                    let vEl = cell.getElementsByTagName('v')[0];
                    if (!vEl) {
                        vEl = sheetDoc.createElementNS(NS, 'v');
                        cell.appendChild(vEl);
                    }
                    vEl.textContent = value;
                };

                const clearCellDom = (cell) => {
                    cell.removeAttribute('t');
                    const fEls = cell.getElementsByTagName('f');
                    for (let fi = fEls.length - 1; fi >= 0; fi--) fEls[fi].parentNode.removeChild(fEls[fi]);
                    let vEl = cell.getElementsByTagName('v')[0];
                    if (vEl) vEl.textContent = '';
                };

                const findCellByRef = (row, ref) => {
                    const cells = row.getElementsByTagName('c');
                    for (let c = 0; c < cells.length; c++) {
                        if (cells[c].getAttribute('r') === ref) return cells[c];
                    }
                    return null;
                };

                const normalize = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
                const itemKeyOf = (m) => {
                    const canon = getAromeBLName(m.aromeNom || '') || m.aromeNom || '';
                    return `${normalize(canon)}|${m.formatNom}`;
                };

                const allRows = sheetDoc.getElementsByTagName('row');
                const matchedKeys = new Set();
                const mergedNormToKey = {};
                Object.values(merged).forEach(m => { mergedNormToKey[itemKeyOf(m)] = m; });

                for (let i = 0; i < allRows.length; i++) {
                    const row = allRows[i];
                    const rowNum = parseInt(row.getAttribute('r'));

                    if (rowNum >= 15 && rowNum <= 38) {
                        const cellA = findCellByRef(row, `A${rowNum}`);
                        if (!cellA) continue;

                        const mapEntry = Object.entries(ROW_MAP).find(([, r]) => r === rowNum);
                        if (!mapEntry) {
                            row.setAttribute('hidden', '1');
                            const vA = cellA.getElementsByTagName('v')[0];
                            if (vA) vA.textContent = '0';
                            const cellB = findCellByRef(row, `B${rowNum}`);
                            if (cellB) setCellTextDom(cellB, ' ');
                            continue;
                        }
                        const [mapKeyForRow, ] = mapEntry;
                        const [mapArome, mapFormat] = mapKeyForRow.split('|');
                        const normArome = normalize(mapArome);
                        const item = mergedNormToKey[`${normArome}|${mapFormat}`];

                        if (item) {
                            setCellValueDom(cellA, item.quantite);
                            row.removeAttribute('hidden');
                            matchedKeys.add(itemKeyOf(item));
                            const cellB = findCellByRef(row, `B${rowNum}`);
                            if (cellB) setCellTextDom(cellB, 'ThéCol - Thé Froid Artisanal');
                        } else {
                            row.setAttribute('hidden', '1');
                            const vA = cellA.getElementsByTagName('v')[0];
                            if (vA) vA.textContent = '0';
                            const cellB = findCellByRef(row, `B${rowNum}`);
                            if (cellB) setCellTextDom(cellB, ' ');
                        }
                    }

                    if (rowNum === 2) {
                        let cellC2 = findCellByRef(row, 'C2');
                        if (!cellC2) {
                            cellC2 = sheetDoc.createElementNS(NS, 'c');
                            cellC2.setAttribute('r', 'C2');
                            row.appendChild(cellC2);
                        }
                        setCellTextDom(cellC2, blNum);
                    }

                    if (rowNum === 5) {
                        const cellF = findCellByRef(row, 'F5');
                        if (cellF) setCellTextDom(cellF, blDate);
                    }

                    if (rowNum === 7) {
                        const cellF = findCellByRef(row, 'F7');
                        if (cellF) setCellTextDom(cellF, clientSociete || ' ');
                    }

                    if (rowNum === 8) {
                        const cellF = findCellByRef(row, 'F8');
                        if (cellF) setCellTextDom(cellF, clientContact || ' ');
                    }

                    if (rowNum === 9) {
                        const cellF = findCellByRef(row, 'F9');
                        if (cellF) setCellTextDom(cellF, clientAdresse || ' ');
                    }

                    if (rowNum === 10) {
                        const cellF = findCellByRef(row, 'F10');
                        if (cellF) setCellTextDom(cellF, clientLocalite || ' ');
                    }

                    if (rowNum === 54) {
                        const cellA = findCellByRef(row, 'A54');
                        if (cellA) setCellTextDom(cellA, clientSociete || ' ');
                    }

                    if (rowNum >= 47 && rowNum <= 49) {
                        const expectedMode = rowNum === 47 ? 'email' : rowNum === 48 ? 'poste' : 'autre';
                        const cellD = findCellByRef(row, `D${rowNum}`);
                        if (cellD) {
                            if (livraison.facturationMode === expectedMode) {
                                setCellTextDom(cellD, 'x');
                            } else {
                                setCellTextDom(cellD, ' ');
                            }
                        }
                    }

                    if (rowNum >= 48 && rowNum <= 51) {
                        const cellA = findCellByRef(row, `A${rowNum}`);
                        if (cellA) {
                            if (rowNum === 48) {
                                setCellValueDom(cellA, cVerteLivree);
                            } else if (rowNum === 49) {
                                setCellValueDom(cellA, cNoireLivree);
                            } else {
                                clearCellDom(cellA);
                            }
                        }
                    }

                    if (rowNum >= 57 && rowNum <= 59) {
                        const clearCols = ['D', 'E', 'F'];
                        clearCols.forEach(col => {
                            const cell = findCellByRef(row, `${col}${rowNum}`);
                            if (cell) {
                                clearCellDom(cell);
                            }
                        });
                    }
                }

                const serialized = new XMLSerializer().serializeToString(sheetDoc);
                const cleaned = serialized
                    .replace(/<ns\d+:/g, '<')
                    .replace(/<\/ns\d+:/g, '</')
                    .replace(/ xmlns:ns\d+="[^"]*"/g, '');
                const newSheetXml = cleaned.startsWith('<?xml')
                    ? cleaned
                    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' + cleaned;

                const unmatched = Object.values(merged).filter(m => !matchedKeys.has(itemKeyOf(m)));
                if (unmatched.length > 0) {
                    const labels = unmatched.slice(0, 3).map(m => `${m.aromeNom} ${m.formatNom} (${m.quantite}x)`).join(', ');
                    const suffix = unmatched.length > 3 ? ` +${unmatched.length - 3}` : '';
                    showToast(`Lignes non reconnues: ${labels}${suffix}`, 'warning');
                }

                if (ssModified) {
                    let ssContent = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';
                    ssContent += `<sst xmlns="${NS}" count="${ssStrings.length}" uniqueCount="${ssStrings.length}">`;
                    ssStrings.forEach(s => {
                        const esc = s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
                        ssContent += `<si><t xml:space="preserve">${esc}</t></si>`;
                    });
                    ssContent += '</sst>';
                    zip.file('xl/sharedStrings.xml', ssContent);
                }

                zip.file('xl/worksheets/sheet1.xml', newSheetXml);

                zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }).then(blob => {
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `BL-${getBLNumero(livraison)}_${livraison.dateBL}.xlsx`;
                    a.click();
                    URL.revokeObjectURL(url);
                    showToast('Bulletin de livraison exporté');
                }).catch(err => {
                    console.error('ZIP gen error:', err);
                    showToast('Erreur génération fichier', 'error');
                });
            }).catch(err => {
                console.error('Parse error:', err);
                showToast('Erreur lecture template', 'error');
            });
        }).catch(err => {
            console.error('JSZip error:', err);
            showToast('Erreur ouverture template', 'error');
        });
    };

    xhr.onerror = () => {
        showToast('Erreur chargement template', 'error');
    };

    xhr.send();
};

let productionPlannerState = null;

// Production Planner
const renderProduction = () => {
    const commandes = DB.get('commandes');
    const aromes = DB.get('aromes');
    const formats = DB.get('formats');
    const recettes = DB.get('recettes');
    const lots = DB.get('lots') || [];
    
    // All non-cancelled, non-delivered orders
    const commandesPeriode = commandes.filter(c => 
        c.statut !== 'annulee' &&
        c.statut !== 'livrée'
    );
    
    const now = new Date();
    const stockDisponible = calculateAvailableStock(lots, now);
    
    // Calculate totals by arome and format (using names from commands)
    const besoins = {};
    
    commandesPeriode.forEach(cmd => {
        (cmd.items || []).forEach(item => {
            const arome = aromes.find(a => a.id === item.aromeId);
            const format = formats.find(f => f.id === item.formatId);
            const key = `${arome?.nom || ''}-${format?.nom || ''}`;
            if (!besoins[key]) {
                besoins[key] = { aromeId: item.aromeId, formatId: item.formatId, aromeNom: arome?.nom || '', formatNom: format?.nom || '', quantite: 0 };
            }
            besoins[key].quantite += item.quantite;
        });
    });
    
    // Calculate production needed (total - available stock)
    const productionNecesaire = {};
    Object.entries(besoins).forEach(([key, b]) => {
        const disponible = stockDisponible[key] || 0;
        const aProduire = Math.max(0, b.quantite - disponible);
        productionNecesaire[key] = { ...b, disponible, aProduire };
    });
    
    // Calculate liters per arome (for production needed only)
    const litresParArome = {};
    Object.values(productionNecesaire).filter(b => b.aProduire > 0).forEach(b => {
        const format = formats.find(f => f.nom === b.formatNom);
        const litres = (format?.contenanceCl || 0) * b.aProduire / 100;
        if (!litresParArome[b.aromeNom]) litresParArome[b.aromeNom] = 0;
        litresParArome[b.aromeNom] += litres;
    });
    
    // Calculate ingredients needed (for total display)
    // Aggregate by name+family to avoid mixing incompatible units (e.g. g vs kg)
    const ingredientsTotal = {};
    Object.entries(litresParArome).forEach(([aromeNom, litres]) => {
        const arome = aromes.find(a => a.nom === aromeNom);
        const recette = recettes.find(r => r.aromeId === arome?.id);
        if (recette) {
            recette.ingredients.forEach(ing => {
                const ingUnit = displayUnit(ing.unite);
                const family = getUnitFamily(ingUnit);
                const key = `${ing.nom}|${family || ingUnit}`;
                let besoin = ing.quantite * litres;
                if (!ingredientsTotal[key]) {
                    ingredientsTotal[key] = { nom: ing.nom, quantite: 0, unite: ingUnit, family };
                }
                if (areUnitsCompatible(ingredientsTotal[key].unite, ingUnit)) {
                    const converted = convertQuantity(besoin, ingUnit, ingredientsTotal[key].unite);
                    besoin = converted !== null ? converted : besoin;
                }
                ingredientsTotal[key].quantite += besoin;
            });
        }
    });
    
    // Calculate cuves per arome (max 25L per cuve)
    const CUVE_MAX = CONSTANTS.CUVE_MAX_L;
    const cuvesParArome = {};
    
    Object.entries(litresParArome).forEach(([aromeNom, litresTotal]) => {
        const nombreCuves = Math.ceil(litresTotal / CUVE_MAX);
        cuvesParArome[aromeNom] = [];
        
        let litresRestants = litresTotal;
        for (let i = 0; i < nombreCuves; i++) {
            const litresCuve = Math.min(litresRestants, CUVE_MAX);
            
            const arome = aromes.find(a => a.nom === aromeNom);
            const recette = recettes.find(r => r.aromeId === arome?.id);
            const ingredientsCuve = [];
            
            if (recette) {
                recette.ingredients.forEach(ing => {
                    ingredientsCuve.push({
                        nom: ing.nom,
                        quantite: (ing.quantite * litresCuve).toFixed(2),
                        unite: ing.unite
                    });
                });
            }
            
            cuvesParArome[aromeNom].push({
                numero: i + 1,
                litres: litresCuve,
                ingredients: ingredientsCuve
            });
            
            litresRestants -= litresCuve;
        }
    });
    
    productionPlannerState = {
        productionNecesaire,
        litresParArome,
        cuvesParArome,
        aromeByNom: new Map(aromes.map(a => [a.nom, a])),
        recetteByAromeId: new Map(recettes.map(r => [r.aromeId, r]))
    };

    // Render results
    const resultHtml = `
        <div class="production-summary">
            <div class="production-item">
                <h4>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/></svg>
                    Bouteilles à produire
                </h4>
                ${Object.values(productionNecesaire).length === 0 ? '<p class="text-muted">Aucune commande</p>' : 
                  Object.values(productionNecesaire).map(b => {
                      const arome = aromes.find(a => a.nom === b.aromeNom);
                      return `<div class="flex-between" style="padding: 8px 0; border-bottom: 1px solid var(--border-light);">
                          <span><span class="color-dot" style="background: ${arome?.couleur || '#ccc'}"></span>${b.aromeNom} ${b.formatNom}</span>
                          <div style="text-align: right;">
                              <div style="font-size: 12px; color: var(--text-muted);">Stock: ${b.disponible} bt</div>
                              <strong>À produire: ${b.aProduire} bt</strong>
                          </div>
                      </div>`;
                  }).join('')}
            </div>
            
            <div class="production-item">
                <h4>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M20.2 7.8l-7.7 7.7-4-4-5.7 5.7"/></svg>
                    Litres à produire (par arôme)
                </h4>
                ${Object.entries(litresParArome).length === 0 ? '<p class="text-muted">Tout le stock est disponible</p>' : 
                  Object.entries(litresParArome).map(([aromeNom, litres]) => {
                      const arome = aromes.find(a => a.nom === aromeNom);
                      return `<div class="flex-between" style="padding: 8px 0; border-bottom: 1px solid var(--border-light);">
                          <span><span class="color-dot" style="background: ${arome?.couleur || '#ccc'}"></span>${escapeHtml(aromeNom)}</span>
                          <strong>${litres.toFixed(1)} L</strong>
                      </div>`;
                  }).join('')}
            </div>
            
            <div class="production-item" style="grid-column: 1 / -1;">
                <h4>
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
                    Production par cuves (max 25L)
                </h4>
                ${Object.entries(cuvesParArome).length === 0 ? '<p class="text-muted">Tout le stock est disponible</p>' : 
                  Object.entries(cuvesParArome).map(([aromeNom, cuves]) => {
                      const arome = aromes.find(a => a.nom === aromeNom);
                      const totalLitres = cuves.reduce((sum, c) => sum + c.litres, 0);
                      return `
                        <div class="cuve-arome">
                          <div class="cuve-header">
                            <span class="color-dot" style="background: ${arome?.couleur || '#ccc'}"></span>
                            <strong>${escapeHtml(aromeNom)}</strong>
                            <span> - ${totalLitres.toFixed(1)}L (${cuves.length} cuve${cuves.length > 1 ? 's' : ''})</span>
                          </div>
                          ${cuves.map((cuve, cuveIndex) => `
                            <div class="cuve-detail" data-arome="${escapeHtml(aromeNom)}" data-cuve-index="${cuveIndex}">
                              <div class="flex-between" style="margin-bottom: 8px;">
                                <div class="cuve-title" style="margin-bottom: 0;">Cuve ${cuve.numero}</div>
                                <button class="btn btn-sm btn-success" onclick="confirmerProduction('${encodeURIComponent(aromeNom)}', ${cuveIndex})">Produite</button>
                              </div>
                              <div class="cuve-slider-row">
                                <input type="range" class="cuve-slider" min="1" max="25" step="0.5" value="${cuve.litres}" data-arome="${escapeHtml(aromeNom)}" data-cuve-index="${cuveIndex}">
                                <span class="cuve-litres-display">${cuve.litres.toFixed(1)}L</span>
                              </div>
                              <ul class="ingredient-list">
                                ${cuve.ingredients.map(ing => `
                                  <li>
                                    <span>${escapeHtml(ing.nom)}</span>
                                    <strong>${ing.quantite} ${displayUnit(ing.unite)}</strong>
                                  </li>
                                `).join('')}
                              </ul>
                            </div>
                          `).join('')}
                        </div>
                      `;
                  }).join('')}
            </div>
        </div>
        
        <div style="margin-top: 24px; padding: 16px; background: var(--bg-secondary); border-radius: var(--radius);">
            <strong>Résumé:</strong> ${commandesPeriode.length} commande(s) à produire - Stock déduit automatiquement
        </div>
    `;
    
    let html = `
        <div class="card">
            <div class="card-header">
                <h3 class="card-title">Planificateur de production</h3>
            </div>
            ${resultHtml}
        </div>
    `;
    
    safeRender(html);
    attacherSliderEvents();
};

const attacherSliderEvents = () => {
    document.querySelectorAll('.cuve-slider').forEach(slider => {
        slider.addEventListener('input', (e) => {
            const aromeNom = e.target.dataset.arome;
            const cuveIndex = parseInt(e.target.dataset.cuveIndex, 10);
            const nouvelleValeur = parseFloat(e.target.value);
            ajusterCuves(aromeNom, cuveIndex, nouvelleValeur);
        });
    });
};

const ajusterCuves = (aromeNom, cuveIndex, nouvelleValeur) => {
    const state = productionPlannerState;
    if (!state || !state.cuvesParArome || !state.cuvesParArome[aromeNom]) return;

    const cuves = state.cuvesParArome[aromeNom];
    if (!cuves || cuves.length === 0) return;

    const autresIndices = cuves.map((_, i) => i).filter(i => i !== cuveIndex);
    if (autresIndices.length === 0) return;

    const totalAvant = cuves.reduce((sum, c) => sum + c.litres, 0);

    cuves[cuveIndex].litres = nouvelleValeur;

    const delta = totalAvant - nouvelleValeur;

    if (Math.abs(delta) < 0.001) {
        mettreAJourSlidersUI(aromeNom);
        return;
    }

    const ajustables = autresIndices.filter(i => {
        if (delta > 0) return cuves[i].litres < 25;
        return cuves[i].litres > 1;
    });

    if (ajustables.length === 0) {
        cuves[cuveIndex].litres = totalAvant - autresIndices.reduce((s, i) => s + cuves[i].litres, 0);
        cuves[cuveIndex].litres = Math.max(1, Math.min(25, Math.round(cuves[cuveIndex].litres * 2) / 2));
        mettreAJourSlidersUI(aromeNom);
        return;
    }

    const totalAjustable = ajustables.reduce((sum, i) => sum + cuves[i].litres, 0);

    if (totalAjustable === 0) {
        const parCuve = delta / ajustables.length;
        ajustables.forEach(i => {
            cuves[i].litres = Math.round((cuves[i].litres + parCuve) * 2) / 2;
            cuves[i].litres = Math.max(1, Math.min(25, cuves[i].litres));
        });
    } else {
        ajustables.forEach((i, idx) => {
            const proportion = cuves[i].litres / totalAjustable;
            let ajustement = delta * proportion;
            ajustement = Math.round(ajustement * 2) / 2;

            let newVal = cuves[i].litres + ajustement;
            newVal = Math.max(1, Math.min(25, newVal));
            newVal = Math.round(newVal * 2) / 2;

            cuves[i].litres = newVal;
        });
    }

    const nouveauTotal = cuves.reduce((sum, c) => sum + c.litres, 0);
    const erreur = Math.round((totalAvant - nouveauTotal) * 2) / 2;

    if (Math.abs(erreur) > 0.001) {
        const correctionIndices = autresIndices.filter(i => {
            if (erreur > 0) return cuves[i].litres < 25;
            return cuves[i].litres > 1;
        });

        if (correctionIndices.length > 0) {
            cuves[correctionIndices[0]].litres = Math.round((cuves[correctionIndices[0]].litres + erreur) * 2) / 2;
            cuves[correctionIndices[0]].litres = Math.max(1, Math.min(25, cuves[correctionIndices[0]].litres));
        } else {
            cuves[cuveIndex].litres = Math.round((cuves[cuveIndex].litres + erreur) * 2) / 2;
            cuves[cuveIndex].litres = Math.max(1, Math.min(25, cuves[cuveIndex].litres));
        }
    }

    const arome = state.aromeByNom.get(aromeNom);
    const recette = arome ? state.recetteByAromeId.get(arome.id) : null;

    cuves.forEach(cuve => {
        cuve.ingredients = calculerIngredientsCuve(recette, cuve.litres);
    });

    mettreAJourSlidersUI(aromeNom);
};

const calculerIngredientsCuve = (recette, litres) => {
    if (!recette || !Array.isArray(recette.ingredients) || litres <= 0) return [];
    return recette.ingredients.map(ing => ({
        nom: ing.nom,
        quantite: parseFloat(((parseFloat(ing.quantite) || 0) * litres).toFixed(2)),
        unite: ing.unite
    }));
};

const mettreAJourSlidersUI = (aromeNom) => {
    const state = productionPlannerState;
    if (!state || !state.cuvesParArome || !state.cuvesParArome[aromeNom]) return;

    const cuves = state.cuvesParArome[aromeNom];

    document.querySelectorAll(`.cuve-slider[data-arome="${aromeNom}"]`).forEach(slider => {
        const idx = parseInt(slider.dataset.cuveIndex, 10);
        const cuve = cuves[idx];
        if (!cuve) return;

        slider.value = cuve.litres;

        const detail = slider.closest('.cuve-detail');
        if (detail) {
            const display = detail.querySelector('.cuve-litres-display');
            if (display) display.textContent = `${cuve.litres.toFixed(1)}L`;

            const titre = detail.querySelector('.cuve-title');
            if (titre) titre.textContent = `Cuve ${cuve.numero} (${cuve.litres.toFixed(1)}L)`;

            const ingList = detail.querySelector('.ingredient-list');
            if (ingList && cuve.ingredients) {
                ingList.innerHTML = cuve.ingredients.map(ing => `
                    <li>
                        <span>${escapeHtml(ing.nom)}</span>
                        <strong>${ing.quantite} ${displayUnit(ing.unite)}</strong>
                    </li>
                `).join('');
            }
        }
    });
};

const normalizeName = (value) => {
    return String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]/g, '');
};

const findInventaireItemByName = (items, nom) => {
    const target = normalizeName(nom);
    return items.find(i => normalizeName(i.nom) === target) || null;
};

const isWaterIngredient = (nom) => {
    const normalized = normalizeName(nom);
    return normalized.includes('eau');
};

const getBottleInventoryItem = (items, format) => {
    if (!format) return null;

    const cl = format.contenanceCl || 0;

    const normalizedInvItems = items.map(item => ({
        item,
        normalized: normalizeName(item.nom)
    }));

    const exactMatch = normalizedInvItems.find(({ normalized }) => {
        const hasNom = format.nom && normalizeName(`Bouteilles vides ${format.nom}`) === normalized;
        const hasCl = cl > 0 && normalizeName(`Bouteilles vides ${cl}cl`) === normalized;
        const hasL = cl > 0 && cl % 100 === 0 && normalizeName(`Bouteilles vides ${cl / 100}L`) === normalized;
        return hasNom || hasCl || hasL;
    });
    if (exactMatch) return exactMatch.item;

    const looseMatch = normalizedInvItems.find(({ normalized }) => {
        if (!normalized.includes('bouteillesvides') && !normalized.includes('bouteille')) return false;
        const numericPart = parseFloat(normalized.replace(/[^0-9.]/g, ''));
        if (!isNaN(numericPart) && numericPart > 0) {
            const inMl = numericPart < 10 ? numericPart * 1000 : numericPart < 100 ? numericPart * 10 : numericPart;
            return Math.abs(inMl - cl * 10) < 1;
        }
        return false;
    });
    if (looseMatch) return looseMatch.item;

    return null;
};

const confirmerProduction = (encodedAromeNom, cuveIndex) => {
    try {
        const aromeNom = decodeURIComponent(encodedAromeNom || '');
        const formats = DB.get('formats') || [];
        const state = productionPlannerState;

        if (!state || !state.cuvesParArome || !state.cuvesParArome[aromeNom]) {
            showToast('Plan de production introuvable, rechargez la page', 'error');
            return;
        }

        const cuve = state.cuvesParArome[aromeNom][cuveIndex];
        if (!cuve) {
            showToast('Cuve introuvable', 'error');
            return;
        }

        const litresTotalArome = state.litresParArome[aromeNom] || 0;
        const ratioCuve = litresTotalArome > 0 ? (cuve.litres / litresTotalArome) : 0;

        const besoinsArome = Object.values(state.productionNecesaire || {}).filter(b => b.aromeNom === aromeNom && b.aProduire > 0);
        const prefillByFormat = {};
        besoinsArome.forEach(b => {
            prefillByFormat[b.formatNom] = Math.max(0, Math.floor((b.aProduire || 0) * ratioCuve));
        });

        const formRows = formats.map(format => {
            const prefill = prefillByFormat[format.nom] || 0;
            return `
                <div class="form-group" style="margin-bottom: 10px;">
                    <label>${escapeHtml(format.nom)}</label>
                    <input type="number" min="0" step="1" name="format_${format.id}" value="${prefill}">
                </div>
            `;
        }).join('');

        modal.show(`Production - ${aromeNom} - Cuve ${cuve.numero}`, `
            <form id="productionCuveForm">
                <div style="margin-bottom: 16px; padding: 12px; background: var(--bg-secondary); border-radius: var(--radius);">
                    <strong>Ingrédients prévus pour cette cuve (${cuve.litres.toFixed(1)}L)</strong>
                    <ul class="ingredient-list" style="margin-top: 8px;">
                        ${cuve.ingredients.map(ing => `
                            <li>
                                <span>${escapeHtml(ing.nom)}</span>
                                <strong>${ing.quantite} ${displayUnit(ing.unite)}</strong>
                            </li>
                        `).join('')}
                    </ul>
                </div>
                <div>
                    <strong>Bouteilles produites (modifiable)</strong>
                    <div style="margin-top: 8px;">
                        ${formRows || '<p class="text-muted">Aucun format actif</p>'}
                    </div>
                </div>
            </form>
        `, `
            <button class="btn btn-secondary" onclick="modal.hide()">Annuler</button>
            <button class="btn btn-success" onclick="validerProduction(event, '${encodeURIComponent(aromeNom)}', ${cuveIndex})">Confirmer la production</button>
        `);
    } catch (e) {
        console.error('Error opening production modal:', e);
        showToast('Erreur ouverture confirmation production', 'error');
    }
};

const validerProduction = (event, encodedAromeNom, cuveIndex) => {
    const reenable = disableSaveBtn(event);
    try {
        const aromeNom = decodeURIComponent(encodedAromeNom || '');
        const state = productionPlannerState;
        const form = document.getElementById('productionCuveForm');
        if (!form || !state || !state.cuvesParArome || !state.cuvesParArome[aromeNom]) {
            showToast('Données de production introuvables', 'error');
            return;
        }

        const cuve = state.cuvesParArome[aromeNom][cuveIndex];
        if (!cuve) {
            showToast('Cuve introuvable', 'error');
            return;
        }

        const formats = DB.get('formats') || [];
        const aromes = DB.get('aromes') || [];
        const recettes = DB.get('recettes') || [];
        const inventaire = DB.get('inventaire') || [];
        const lots = DB.get('lots') || [];
        const history = DB.get('history') || [];

        const producedByFormat = [];
        let totalBouteilles = 0;
        let litresProduit = 0;

        formats.forEach(format => {
            const input = form.querySelector(`input[name="format_${format.id}"]`);
            const quantite = Math.max(0, parseInt(input?.value, 10) || 0);
            if (quantite > 0) {
                producedByFormat.push({ format, quantite });
                totalBouteilles += quantite;
                litresProduit += ((format.contenanceCl || 0) * quantite) / 100;
            }
        });

        if (producedByFormat.length === 0) {
            showToast('Veuillez saisir au moins une quantité produite', 'warning');
            return;
        }

        const arome = aromes.find(a => a.nom === aromeNom);
        const recette = recettes.find(r => r.aromeId === arome?.id);
        const errors = [];
        const deductionTotals = new Map();
        const addDeduction = (item, quantite) => {
            const key = item.id || normalizeName(item.nom);
            const current = deductionTotals.get(key);
            if (current) {
                current.quantite += quantite;
            } else {
                deductionTotals.set(key, { item, quantite });
            }
        };

        if (recette && Array.isArray(recette.ingredients)) {
            recette.ingredients.forEach(ing => {
                if (isWaterIngredient(ing.nom)) return;

                const ingQty = parseFloat(ing.quantite);
                if (Number.isNaN(ingQty)) {
                    errors.push(`Quantité de recette invalide pour ${ing.nom}`);
                    return;
                }
                const baseBesoin = ingQty * litresProduit;
                const besoinMajore = baseBesoin * CONSTANTS.PRODUCTION_LOSS;
                const item = findInventaireItemByName(inventaire, ing.nom);

                if (!item) {
                    errors.push(`Ingrédient absent: ${ing.nom}`);
                    return;
                }

                const ingUnit = displayUnit(ing.unite);
                const invUnit = displayUnit(item.unite);

                if (!areUnitsCompatible(ingUnit, invUnit)) {
                    errors.push(`Unité incompatible pour ${ing.nom} (recette: ${ingUnit}, inventaire: ${invUnit})`);
                    return;
                }

                let besoinInInvUnit = besoinMajore;
                if (ingUnit !== invUnit) {
                    const converted = convertQuantity(besoinMajore, ingUnit, invUnit);
                    if (converted === null) {
                        errors.push(`Conversion impossible pour ${ing.nom}`);
                        return;
                    }
                    besoinInInvUnit = converted;
                }

                addDeduction(item, besoinInInvUnit);
            });
        } else {
            errors.push(`Recette introuvable pour ${aromeNom}`);
        }

        producedByFormat.forEach(({ format, quantite }) => {
            const bottleItem = getBottleInventoryItem(inventaire, format);
            if (!bottleItem) {
                errors.push(`Bouteilles vides absentes pour ${format.nom}`);
            } else {
                addDeduction(bottleItem, quantite);
            }
        });

        const capsulesItem = inventaire.find(item => {
            const n = normalizeName(item.nom);
            return n.includes('capsule') || n.includes('bouchon');
        });
        const capsulesNecessaires = Math.ceil(totalBouteilles * CONSTANTS.CAPSULE_LOSS);
        if (capsulesItem) {
            addDeduction(capsulesItem, capsulesNecessaires);
        } else {
            errors.push('Capsules/bouchons absents de l\'inventaire');
        }

        const deductions = Array.from(deductionTotals.values());
        deductions.forEach(({ item, quantite }) => {
            if ((item.quantite || 0) < quantite) {
                errors.push(`Stock insuffisant: ${item.nom}`);
            }
        });

        if (errors.length > 0) {
            showToast(`Production bloquée: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1})` : ''}`, 'error');
            return;
        }

        deductions.forEach(({ item, quantite }) => {
            item.quantite = Math.round(((item.quantite || 0) - quantite) * 10000) / 10000;
        });

        const dateProduction = getLocalDateISOString();
        const dates = calculateDates(dateProduction);

        producedByFormat.forEach(({ format, quantite }) => {
            const existingLot = lots.find(l =>
                l.arome === aromeNom &&
                l.format === format.nom &&
                l.dateProduction === dateProduction
            );

            let lotId;
            if (existingLot) {
                existingLot.quantite = (existingLot.quantite || 0) + quantite;
                lotId = existingLot.id;
            } else {
                let maxNum = 0;
                lots.forEach(l => {
                    const num = parseInt(l.id, 10);
                    if (!isNaN(num) && num > maxNum) maxNum = num;
                });
                lotId = String(maxNum + 1).padStart(6, '0');

                lots.push({
                    id: lotId,
                    arome: aromeNom,
                    format: format.nom,
                    quantite,
                    dateProduction,
                    dlv: dates.dlv,
                    dlc: dates.dlc
                });
            }

            history.unshift({
                id: `PROD-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
                lotId,
                arome: aromeNom,
                format: format.nom,
                quantity: quantite,
                productionDate: dateProduction,
                dateAdded: new Date().toISOString()
            });
        });

        DB.setMany({ inventaire: inventaire, lots: lots, history: history });

        modal.hide();
        showToast(`Production confirmée: ${totalBouteilles} bouteille(s) ajoutée(s) au stock`);
        renderProduction();
    } catch (e) {
        console.error('Error validating production:', e);
        showToast('Erreur lors de la validation de la production', 'error');
    } finally {
        if (reenable) reenable();
    }
};

// Inventaire
const renderInventaire = () => {
    // Initialize default consumables if list is empty
    const defaultConsommables = [
        { nom: 'Eau', unite: 'L', seuilAlerte: 0 },
        { nom: 'Sucre', unite: 'kg', seuilAlerte: 0 },
        { nom: 'Citron', unite: 'kg', seuilAlerte: 0 },
        { nom: 'Menthe', unite: 'kg', seuilAlerte: 0 },
        { nom: 'Hibiscus', unite: 'kg', seuilAlerte: 0 },
        { nom: 'Mûre sauvage', unite: 'kg', seuilAlerte: 0 },
        { nom: 'Poire à botzi', unite: 'kg', seuilAlerte: 0 },
        { nom: 'Sureau', unite: 'kg', seuilAlerte: 0 },
        { nom: 'Herbes des alpes', unite: 'kg', seuilAlerte: 0 },
        { nom: 'Capsules', unite: 'pcs', seuilAlerte: 0 },
        { nom: 'Étiquettes', unite: 'pcs', seuilAlerte: 0 },
        { nom: 'Bouteilles vides 25cl', unite: 'pcs', seuilAlerte: 0 },
        { nom: 'Bouteilles vides 50cl', unite: 'pcs', seuilAlerte: 0 },
        { nom: 'Bouteilles vides 1L', unite: 'pcs', seuilAlerte: 0 }
    ];
    
    let items = DB.get('inventaire');
    if (items.length === 0) {
        items = defaultConsommables.map(item => ({
            ...item,
            id: generateId(),
            categorie: 'consommable',
            quantite: 0
        }));
        DB.set('inventaire', items);
    }
    
    const consommables = items.filter(i => i.categorie === 'consommable');
    const equipement = items.filter(i => i.categorie === 'equipement');

    // Items en alerte (seuil > 0 et quantite ≤ seuil)
    const alerteCount = items.filter(i => i.seuilAlerte > 0 && i.quantite <= i.seuilAlerte).length;

    const renderInvRow = (item, categorie) => {
        const isAlerte = item.seuilAlerte > 0 && item.quantite <= item.seuilAlerte;
        return `<div class="inv-row">
            <span class="inv-dot ${isAlerte ? 'alert' : ''}"></span>
            <div class="inv-info">
                <div class="inv-name">${escapeHtml(item.nom)}</div>
                ${isAlerte
                    ? `<div class="inv-sub alert">Stock bas — seuil ${item.seuilAlerte} ${escapeHtml(item.unite || '')}</div>`
                    : item.seuilAlerte > 0
                        ? `<div class="inv-sub">Seuil ${item.seuilAlerte} ${escapeHtml(item.unite || '')}</div>`
                        : ''}
            </div>
            <div class="inv-stepper">
                <button class="inv-stepper-btn" onclick="updateInventaireQty('${item.id}', -1)" aria-label="Diminuer">−</button>
                <span class="inv-stepper-qty" id="inv-qty-${item.id}">${item.quantite}<span class="inv-stepper-unit">${escapeHtml(item.unite || '')}</span></span>
                <button class="inv-stepper-btn" onclick="updateInventaireQty('${item.id}', 1)" aria-label="Augmenter">+</button>
            </div>
            <button class="inv-edit-btn" onclick="showInventaireModal('${categorie}', '${item.id}')" aria-label="Modifier" title="Modifier">✎</button>
        </div>`;
    };

    let html = `
        <div class="commandes-toolbar">
            <h1>Inventaire</h1>
            <div style="display:flex; gap:8px;">
                <button class="btn btn-ghost btn-sm" onclick="showInventaireModal('equipement')">+ Équipement</button>
                <button class="btn btn-primary btn-sm" onclick="showInventaireModal('consommable')">+ Consommable</button>
            </div>
        </div>

        ${alerteCount > 0 ? `
            <a href="#inventaire" class="dash-alert" style="margin-bottom: 14px;">
                <span class="dash-alert-icon">⚠️</span>
                <div class="dash-alert-text">
                    <strong>Stock bas</strong>
                    ${alerteCount} article${alerteCount > 1 ? 's' : ''} à recommander
                </div>
            </a>
        ` : ''}

        <div class="inv-section">
            <div class="inv-section-title">
                <h3>Consommables</h3>
                <span style="font-size: var(--font-caption); color: var(--text-light);">${consommables.length}</span>
            </div>
            ${consommables.length === 0
                ? '<p style="color: var(--text-light); font-size: var(--font-body); padding: 8px 0;">Aucun consommable</p>'
                : consommables.map(item => renderInvRow(item, 'consommable')).join('')}
        </div>

        <div class="inv-section">
            <button type="button" class="inv-toggle-header" onclick="toggleEquipementSection()" aria-expanded="false" aria-controls="equipementContent">
                <span>Équipement <span style="font-weight: 400; font-size: var(--font-caption); color: var(--text-light);">• ${equipement.length}</span></span>
                <span class="inv-toggle-arrow" id="equipementToggle">▶</span>
            </button>
            <div class="collapse-content" id="equipementContent" style="margin-top: 8px;">
                ${equipement.length === 0
                    ? '<p style="color: var(--text-light); font-size: var(--font-body); padding: 8px 0;">Aucun équipement</p>'
                    : equipement.map(item => renderInvRow(item, 'equipement')).join('')}
            </div>
        </div>
    `;

    safeRender(html);
};

// Toggle equipement section
const toggleEquipementSection = () => {
    const content = document.getElementById('equipementContent');
    const toggle = document.getElementById('equipementToggle');
    const isOpen = content.classList.toggle('open');
    toggle.textContent = isOpen ? '▼' : '▶';
    toggle.parentElement?.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
};

// Show inventaire modal
const showInventaireModal = (categorie, id = null) => {
    const items = DB.get('inventaire') || [];
    const item = id ? items.find(i => i.id === id) : null;
    
    const unités = ['pcs', 'kg', 'L', 'mL', 'g', 'm', 'caisse(s)'];
    
    modal.show(id ? 'Modifier item' : 'Nouvel item', `
        <form id="inventaireForm">
            <input type="hidden" name="categorie" value="${escapeHtml(categorie)}">
            <div class="form-group">
                <label>Nom</label>
                <input type="text" name="nom" value="${escapeHtml(item?.nom || '')}" required>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Quantité</label>
                    <input type="number" name="quantite" value="${item?.quantite || 0}" min="0" required>
                </div>
                <div class="form-group">
                    <label>Unité</label>
                    <select name="unite" required>
                        ${unités.map(u => `<option value="${u}" ${item?.unite === u ? 'selected' : ''}>${u}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="form-group">
                <label>Seuil d'alerte (stock bas)</label>
                <input type="number" name="seuilAlerte" value="${item?.seuilAlerte || 0}" min="0">
                <small class="text-muted">Alerte quand la quantité est en dessous de ce seuil</small>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="modal.hide()">Annuler</button>
        <button class="btn btn-primary" onclick="saveInventaireItem(event, '${id || ''}')">Enregistrer</button>
    `);
};

// Save inventaire item
const saveInventaireItem = (event, id) => {
    const reenable = disableSaveBtn(event);
    const form = document.getElementById('inventaireForm');
    const formData = new FormData(form);
    
    const item = {
        id: id || generateId(),
        categorie: formData.get('categorie'),
        nom: formData.get('nom'),
        quantite: parseFloat(formData.get('quantite')) || 0,
        unite: displayUnit(formData.get('unite')),
        seuilAlerte: parseFloat(formData.get('seuilAlerte')) || 0
    };
    
    const items = DB.get('inventaire');
    if (id) {
        const index = items.findIndex(i => i.id === id);
        items[index] = item;
    } else {
        items.push(item);
    }
    DB.set('inventaire', items);
    
    modal.hide();
    showToast('Item enregistré');
    renderInventaire();
};

// Update inventaire quantity
const updateInventaireQty = (id, delta) => {
    const items = DB.get('inventaire');
    const item = items.find(i => i.id === id);
    if (!item) return;
    const newQty = Math.max(0, (item.quantite || 0) + delta);
    item.quantite = newQty;

    const qtyEl = document.getElementById('inv-qty-' + id);
    if (qtyEl) qtyEl.firstChild.nodeValue = newQty;

    DB.set('inventaire', items);
};

// Delete inventaire item
const deleteInventaireItem = (id) => {
    confirmDialog('Supprimer cet item ?', { danger: true }).then(ok => {
        if (!ok) return;
        const items = DB.get('inventaire').filter(i => i.id !== id);
        DB.set('inventaire', items);
        showToast('Item supprimé');
        renderInventaire();
    });
};

// Settings
const renderParametres = () => {
    const employes = DB.get('employees') || [];
    const aromes = DB.get('aromes') || [];
    const formats = DB.get('formats') || [];
    const recettes = DB.get('recettes') || [];
    const clients = DB.get('clients') || [];
    
    let html = `
        <div class="settings-grid">
            <div class="settings-card">
                <div class="settings-card-header">
                    <h3>Employés</h3>
                    <button class="btn btn-sm btn-primary" onclick="showEmployeModal()">+ Ajouter</button>
                </div>
                <ul class="settings-list" id="settings-employes-list">
                    ${renderSettingsEmployes()}
                </ul>
            </div>
            
            <div class="settings-card">
                <div class="settings-card-header">
                    <h3>Arômes</h3>
                    <button class="btn btn-sm btn-primary" onclick="showAromeModal()">+ Ajouter</button>
                </div>
                <ul class="settings-list" id="settings-aromes-list">
                    ${renderSettingsAromes()}
                </ul>
            </div>
            
            <div class="settings-card">
                <div class="settings-card-header">
                    <h3>Formats</h3>
                    <button class="btn btn-sm btn-primary" onclick="showFormatModal()">+ Ajouter</button>
                </div>
                <ul class="settings-list" id="settings-formats-list">
                    ${renderSettingsFormats()}
                </ul>
            </div>
            
            <div class="settings-card">
                <div class="settings-card-header">
                    <h3>Recettes</h3>
                    <div style="display: flex; gap: 8px;">
                        <button class="btn btn-sm btn-secondary" onclick="syncRecettesInventaire()">Synchroniser inventaire</button>
                        <button class="btn btn-sm btn-primary" onclick="showRecetteModal()">+ Ajouter</button>
                    </div>
                </div>
                <ul class="settings-list" id="settings-recettes-list">
                    ${renderSettingsRecettes()}
                </ul>
            </div>
            
            <div class="settings-card" style="grid-column: 1 / -1;">
                <div class="settings-card-header">
                    <h3>Clients</h3>
                    <div style="display: flex; gap: 8px; flex-wrap: wrap;">
                        <button class="btn btn-sm btn-secondary" onclick="exportClientsExcel()">Exporter Excel</button>
                        <button class="btn btn-sm btn-secondary" onclick="document.getElementById('importClientsFile').click()">Importer Excel</button>
                        <input type="file" id="importClientsFile" accept=".xlsx,.xls" style="display:none" onchange="importClientsExcel(event)">
                        <button class="btn btn-sm btn-primary" onclick="showClientModal()">+ Ajouter</button>
                        <button class="btn btn-sm btn-danger" onclick="resetClients()">Effacer tout</button>
                    </div>
                </div>
                <ul class="settings-list" id="settings-clients-list">
                    ${renderSettingsClients()}
                </ul>
            </div>
            
            <div class="settings-card" style="grid-column: 1 / -1;">
                <div class="settings-card-header">
                    <h3>Sauvegarde & Restauration</h3>
                </div>
                <div style="display: flex; gap: 12px; flex-wrap: wrap; padding: 12px;">
                    <button class="btn btn-primary" onclick="exportAllData()">💾 Sauvegarder tout (JSON)</button>
                    <button class="btn btn-secondary" onclick="document.getElementById('importDataFile').click()">📂 Restaurer depuis JSON</button>
                    <input type="file" id="importDataFile" accept=".json" style="display:none" onchange="importAllData(event)">
                    <button class="btn btn-ghost btn-sm" onclick="restoreBackupPreSync()">↩ Restaurer le backup de sync</button>
                </div>
                <p class="text-muted" style="font-size: 12px; padding: 0 12px 12px;">
                    La sauvegarde inclut: employés, aromes, formats, recettes, clients, lots, commandes et pointages. Le backup de sync est l'état local précédant la dernière synchronisation cloud.
                </p>
            </div>
            
            ${window.StressTest ? `
            <div class="settings-card" style="grid-column: 1 / -1; border: 2px solid var(--warning);">
                <div class="settings-card-header">
                    <h3>🔧 Outils de développement</h3>
                </div>
                <div style="padding: 12px; display: flex; gap: 12px; flex-wrap: wrap; align-items: center;">
                    <button class="btn btn-warning" onclick="window.StressTest.attachUI(); window.StressTest.run()">Lancer le stress test</button>
                    <span style="font-size: 12px; color: var(--text-light);">Teste la performance, les workflows et la résilience de l'application. Sauvegarde automatique des données.</span>
                </div>
            </div>
            ` : ''}
            
            <div class="settings-card" style="grid-column: 1 / -1; border: 2px solid var(--danger);">
                <div class="settings-card-header">
                    <h3>Réinitialisation</h3>
                </div>
                <div style="padding: 12px;">
                    <button class="btn btn-danger" onclick="resetCounters()">Réinitialiser les compteurs</button>
                    <p style="margin-top: 8px; font-size: 12px; color: var(--text-light);">
                        Remet les numéros de lots et de commandes à 1. Cette action est irréversible.
                    </p>
                </div>
            </div>
        </div>
    `;
    
    safeRender(html);
};

// Sub-renderers des cards Parametres : permettent de re-render uniquement la
// card concernee apres un CRUD, sans reconstruire les 5 cards.
const renderSettingsEmployes = () => {
    const employes = DB.get('employees') || [];
    if (employes.length === 0) return '<li class="settings-item text-muted">Aucun employé</li>';
    return employes.map(e => `
        <li class="settings-item">
            <div class="settings-item-info">
                <span class="color-dot" style="background: var(--primary)"></span>
                <span>${escapeHtml(e.prenom)} ${escapeHtml(e.nom)}</span>
                <span class="badge ${e.actif ? 'badge-success' : 'badge-default'}">${e.actif ? 'Actif' : 'Inactif'}</span>
            </div>
            <div class="settings-item-actions">
                <button class="btn btn-sm btn-secondary" onclick="showEmployeModal('${e.id}')">Modifier</button>
                <button class="btn btn-sm btn-danger" onclick="deleteEmploye('${e.id}')">Supprimer</button>
            </div>
        </li>`).join('');
};

const renderSettingsAromes = () => {
    const aromes = DB.get('aromes') || [];
    if (aromes.length === 0) return '<li class="settings-item text-muted">Aucun arôme</li>';
    return aromes.map(a => `
        <li class="settings-item">
            <div class="settings-item-info">
                <span class="color-dot" style="background: ${escapeHtml(a.couleur || '#ccc')}"></span>
                <span>${escapeHtml(a.nom)}</span>
                <span class="badge ${a.actif ? 'badge-success' : 'badge-default'}">${a.actif ? 'Actif' : 'Inactif'}</span>
            </div>
            <div class="settings-item-actions">
                <button class="btn btn-sm btn-secondary" onclick="showAromeModal('${a.id}')">Modifier</button>
                <button class="btn btn-sm btn-danger" onclick="deleteArome('${a.id}')">Supprimer</button>
            </div>
        </li>`).join('');
};

const renderSettingsFormats = () => {
    const formats = DB.get('formats') || [];
    if (formats.length === 0) return '<li class="settings-item text-muted">Aucun format</li>';
    return formats.map(f => `
        <li class="settings-item">
            <div class="settings-item-info">
                <span>${escapeHtml(f.nom)}</span>
                <span class="text-muted">(${f.contenanceCl} cl)</span>
                <span class="badge ${f.actif ? 'badge-success' : 'badge-default'}">${f.actif ? 'Actif' : 'Inactif'}</span>
            </div>
            <div class="settings-item-actions">
                <button class="btn btn-sm btn-secondary" onclick="showFormatModal('${f.id}')">Modifier</button>
                <button class="btn btn-sm btn-danger" onclick="deleteFormat('${f.id}')">Supprimer</button>
            </div>
        </li>`).join('');
};

const renderSettingsRecettes = () => {
    const recettes = DB.get('recettes') || [];
    const aromesById = indexById(DB.get('aromes') || []);
    if (recettes.length === 0) return '<li class="settings-item text-muted">Aucune recette</li>';
    return recettes.map(r => {
        const arome = aromesById.get(r.aromeId);
        return `
        <li class="settings-item">
            <div class="settings-item-info">
                <span class="color-dot" style="background: ${escapeHtml(arome?.couleur || '#ccc')}"></span>
                <span>${escapeHtml(r.nom)}</span>
                <span class="text-muted">(${r.ingredients.length} ingrédient${r.ingredients.length > 1 ? 's' : ''})</span>
            </div>
            <div class="settings-item-actions">
                <button class="btn btn-sm btn-secondary" onclick="showRecetteModal('${r.id}')">Modifier</button>
                <button class="btn btn-sm btn-danger" onclick="deleteRecette('${r.id}')">Supprimer</button>
            </div>
        </li>`;
    }).join('');
};

const renderSettingsClients = () => {
    const clients = DB.get('clients') || [];
    if (clients.length === 0) return '<li class="settings-item text-muted">Aucun client</li>';
    return clients.map(c => `
        <li class="settings-item">
            <div class="settings-item-info">
                <div><strong>${escapeHtml(c.societe || '')}</strong> ${escapeHtml(c.nom || '')}</div>
                <div class="text-muted" style="font-size:12px;">${escapeHtml(c.adresse || '')} ${escapeHtml(c.npa || '')}</div>
                <span class="badge ${c.actif ? 'badge-success' : 'badge-default'}">${c.actif ? 'Actif' : 'Inactif'}</span>
            </div>
            <div class="settings-item-actions">
                <button class="btn btn-sm btn-secondary" onclick="showClientModal('${c.id}')">Modifier</button>
                <button class="btn btn-sm btn-danger" onclick="deleteClient('${c.id}')">Supprimer</button>
            </div>
        </li>`).join('');
};

// Patch ciblé d'une card Parametres (evite le re-render complet de la page)
const updateSettingsCard = (cardName, html) => {
    const el = document.getElementById('settings-' + cardName + '-list');
    if (el) el.innerHTML = html;
};

// Settings - Counters
const resetCounters = () => {
    const meta = DB._readMeta();
    delete meta.lastCommandeNumero;
    delete meta.lastBLNumero;
    DB._writeMeta(meta);
    showToast('Compteurs réinitialisés : numéros recalculés depuis les données existantes');
};

// Settings - Employes
const showEmployeModal = (id = null) => {
    const employes = DB.get('employees');
    const emp = id ? employes.find(e => e.id === id) : null;
    
    modal.show(id ? 'Modifier employé' : 'Nouvel employé', `
        <form id="employeForm">
            <div class="form-row">
                <div class="form-group">
                    <label>Nom</label>
                    <input type="text" name="nom" value="${escapeHtml(emp?.nom || '')}" required>
                </div>
                <div class="form-group">
                    <label>Prénom</label>
                    <input type="text" name="prenom" value="${escapeHtml(emp?.prenom || '')}" required>
                </div>
            </div>
            <div class="form-row">

                <div class="form-group">
                    <label class="checkbox-label">
                        <input type="checkbox" name="actif" ${emp?.actif !== false ? 'checked' : ''}>
                        Actif
                    </label>
                </div>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="modal.hide()">Annuler</button>
        <button class="btn btn-primary" onclick="saveEmploye(event, '${id || ''}')">Enregistrer</button>
    `);
};

const saveEmploye = (event, id) => {
    const reenable = disableSaveBtn(event);
    const form = document.getElementById('employeForm');
    const formData = new FormData(form);
    
    const employe = {
        id: id || generateId(),
        nom: formData.get('nom'),
        prenom: formData.get('prenom'),
        actif: form.querySelector('input[name="actif"]').checked
    };
    
    const employes = DB.get('employees');
    if (id) {
        const index = employes.findIndex(e => e.id === id);
        employes[index] = employe;
    } else {
        employes.push(employe);
    }
    DB.set('employees', employes);
    
    modal.hide();
    showToast('Employé enregistré');
    updateSettingsCard('employes', renderSettingsEmployes());
};

const deleteEmploye = (id) => {
    const pointages = DB.get('pointages');
    const hasPointages = pointages.some(p => p.employeId === id);
    
    if (hasPointages) {
        showToast('Impossible de supprimer cet employé : il a des pointages enregistrés. Vous pouvez le désactiver à la place.', 'error');
        return;
    }

    confirmDialog('Êtes-vous sûr de vouloir supprimer cet employé ?', { danger: true }).then(ok => {
        if (!ok) return;
        const employes = DB.get('employees').filter(e => e.id !== id);
        DB.set('employees', employes);
        showToast('Employé supprimé');
        updateSettingsCard('employes', renderSettingsEmployes());
    });
};

// Settings - Aromes
const showAromeModal = (id = null) => {
    const aromes = DB.get('aromes');
    const arome = id ? aromes.find(a => a.id === id) : null;
    
    modal.show(id ? 'Modifier arôme' : 'Nouvel arôme', `
        <form id="aromeForm">
            <div class="form-group">
                <label>Nom</label>
                <input type="text" name="nom" value="${escapeHtml(arome?.nom || '')}" required>
            </div>
            <div class="form-group">
                <label>Couleur (code hex)</label>
                <input type="color" name="couleur" value="${escapeHtml(arome?.couleur || '#5D7B3E')}" style="height: 40px; padding: 4px;">
            </div>
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" name="actif" ${arome?.actif !== false ? 'checked' : ''}>
                    Actif
                </label>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="modal.hide()">Annuler</button>
        <button class="btn btn-primary" onclick="saveArome(event, '${id || ''}')">Enregistrer</button>
    `);
};

const saveArome = (event, id) => {
    const reenable = disableSaveBtn(event);
    const form = document.getElementById('aromeForm');
    const formData = new FormData(form);
    
    const arome = {
        id: id || generateId(),
        nom: formData.get('nom'),
        couleur: formData.get('couleur'),
        actif: form.querySelector('input[name="actif"]').checked
    };
    
    const aromes = DB.get('aromes');
    if (id) {
        const index = aromes.findIndex(a => a.id === id);
        aromes[index] = arome;
    } else {
        aromes.push(arome);
    }
    DB.set('aromes', aromes);
    
    modal.hide();
    showToast('Arôme enregistré');
    updateSettingsCard('aromes', renderSettingsAromes());
};

const deleteArome = (id) => {
    const commandes = DB.get('commandes');
    const recettes = DB.get('recettes');
    
    const isUsedInCommandes = commandes.some(c => getItems(c).some(i => i.aromeId === id));
    const isUsedInRecettes = recettes.some(r => r.aromeId === id);
    
    if (isUsedInCommandes || isUsedInRecettes) {
        showToast('Impossible de supprimer cet arôme : il est utilisé dans des commandes ou des recettes. Vous pouvez le désactiver à la place.', 'error');
        return;
    }

    confirmDialog('Êtes-vous sûr de vouloir supprimer cet arôme ?', { danger: true }).then(ok => {
        if (!ok) return;
        const aromes = DB.get('aromes').filter(a => a.id !== id);
        DB.set('aromes', aromes);
        showToast('Arôme supprimé');
        updateSettingsCard('aromes', renderSettingsAromes());
    });
};

// Settings - Formats
const showFormatModal = (id = null) => {
    const formats = DB.get('formats');
    const format = id ? formats.find(f => f.id === id) : null;
    
    modal.show(id ? 'Modifier format' : 'Nouveau format', `
        <form id="formatForm">
            <div class="form-row">
                <div class="form-group">
                    <label>Nom (ex: 50cl, 1L)</label>
                    <input type="text" name="nom" value="${escapeHtml(format?.nom || '')}" required>
                </div>
                <div class="form-group">
                    <label>Contenance (cl)</label>
                    <input type="number" name="contenanceCl" value="${format?.contenanceCl || 50}" min="1" required>
                </div>
            </div>
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" name="actif" ${format?.actif !== false ? 'checked' : ''}>
                    Actif
                </label>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="modal.hide()">Annuler</button>
        <button class="btn btn-primary" onclick="saveFormat(event, '${id || ''}')">Enregistrer</button>
    `);
};

const saveFormat = (event, id) => {
    const reenable = disableSaveBtn(event);
    const form = document.getElementById('formatForm');
    const formData = new FormData(form);
    
    const format = {
        id: id || generateId(),
        nom: formData.get('nom'),
        contenanceCl: parseInt(formData.get('contenanceCl')),
        actif: form.querySelector('input[name="actif"]').checked
    };
    
    const formats = DB.get('formats');
    if (id) {
        const index = formats.findIndex(f => f.id === id);
        formats[index] = format;
    } else {
        formats.push(format);
    }
    DB.set('formats', formats);
    
    modal.hide();
    showToast('Format enregistré');
    updateSettingsCard('formats', renderSettingsFormats());
};

const deleteFormat = (id) => {
    const commandes = DB.get('commandes');
    const isUsedInCommandes = commandes.some(c => getItems(c).some(i => i.formatId === id));
    
    if (isUsedInCommandes) {
        showToast('Impossible de supprimer ce format : il est utilisé dans des commandes. Vous pouvez le désactiver à la place.', 'error');
        return;
    }

    confirmDialog('Êtes-vous sûr de vouloir supprimer ce format ?', { danger: true }).then(ok => {
        if (!ok) return;
        const formats = DB.get('formats').filter(f => f.id !== id);
        DB.set('formats', formats);
        showToast('Format supprimé');
        updateSettingsCard('formats', renderSettingsFormats());
    });
};

// Settings - Recettes
const showRecetteModal = (id = null) => {
    const aromes = DB.get('aromes');
    const recettes = DB.get('recettes');
    const recette = id ? recettes.find(r => r.id === id) : null;
    
    if (aromes.length === 0) {
        showToast('Veuillez d\'abord ajouter des aromes', 'error');
        return;
    }
    
    const inventaire = DB.get('inventaire') || [];
    const consumableNames = inventaire.filter(i => i.categorie === 'consommable').map(i => i.nom);
    const suggestionsId = 'ingredientSuggestions';
    const suggestionsList = consumableNames.length > 0
        ? `<datalist id="${suggestionsId}">${consumableNames.map(n => `<option value="${escapeHtml(n)}">`).join('')}</datalist>`
        : '';

    const ingredientsHtml = recette ? recette.ingredients.map((ing, idx) => `
        <div class="ingredient-row">
            <input type="text" name="ingredients[${idx}][nom]" value="${escapeHtml(ing.nom)}" placeholder="Ingrédient" list="${suggestionsId}" required>
            <input type="number" name="ingredients[${idx}][quantite]" value="${ing.quantite}" placeholder="Qté" step="0.01" required>
            <input type="text" name="ingredients[${idx}][unite]" value="${escapeHtml(displayUnit(ing.unite))}" placeholder="Unité" required>
            <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">×</button>
        </div>
    `).join('') : `<div class="ingredient-row"><input type="text" name="ingredients[0][nom]" placeholder="Ingrédient" list="${suggestionsId}" required><input type="number" name="ingredients[0][quantite]" placeholder="Qté" step="0.01" required><input type="text" name="ingredients[0][unite]" placeholder="Unité" required><button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">×</button></div>`;
    
    // Filter out aromes that already have a recipe (except the one being edited)
    const availableAromes = aromes.filter(a => {
        if (!a.actif) return false;
        if (recette && recette.aromeId === a.id) return true;
        const existingRecipe = recettes.find(r => r.aromeId === a.id);
        return !existingRecipe;
    });
    
    modal.show(id ? 'Modifier recette' : 'Nouvelle recette', `
        <form id="recetteForm">
            <div class="form-group">
                <label>Arôme (recette pour 1 litre)</label>
                <select name="aromeId" required ${id ? 'disabled' : ''}>
                    ${availableAromes.length === 0 && !recette ? '<option value="">Aucun arôme disponible</option>' : 
                      aromes.filter(a => {
                          if (!a.actif) return false;
                          if (recette && recette.aromeId === a.id) return true;
                          const existingRecipe = recettes.find(r => r.aromeId === a.id);
                          return !existingRecipe;
                      }).map(a => `<option value="${a.id}" ${recette?.aromeId === a.id ? 'selected' : ''}>${escapeHtml(a.nom)}</option>`).join('')}
                </select>
                ${id ? '<input type="hidden" name="aromeId" value="' + recette.aromeId + '">' : ''}
            </div>
            <div class="form-group">
                <label>Ingrédients (pour 1 litre de cet arôme)</label>
                ${suggestionsList}
                <div id="ingredientsContainer" style="display: flex; flex-direction: column; gap: 8px;">
                    ${ingredientsHtml}
                </div>
                <button type="button" class="btn btn-sm btn-secondary mt-4" onclick="addIngredient()">+ Ajouter ingrédient</button>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="modal.hide()">Annuler</button>
        <button class="btn btn-primary" onclick="saveRecette(event, '${id || ''}')">Enregistrer</button>
    `);
};

const addIngredient = () => {
    const container = document.getElementById('ingredientsContainer');
    const index = container.querySelectorAll('.ingredient-row').length;

    const div = document.createElement('div');
    div.className = 'ingredient-row';
    div.style.display = 'flex';
    div.style.gap = '8px';
    div.innerHTML = `
        <input type="text" name="ingredients[${index}][nom]" placeholder="Ingrédient" list="ingredientSuggestions" required style="flex: 2;">
        <input type="number" name="ingredients[${index}][quantite]" placeholder="Qté" step="0.01" required style="flex: 1;">
        <input type="text" name="ingredients[${index}][unite]" placeholder="Unité" required style="flex: 1;">
        <button type="button" class="btn btn-sm btn-danger" onclick="this.parentElement.remove()">×</button>
    `;
    container.appendChild(div);
};

const saveRecette = (event, id) => {
    const reenable = disableSaveBtn(event);
    const form = document.getElementById('recetteForm');
    const formData = new FormData(form);
    
    const ingredients = [];
    const invalidUnits = [];
    const rows = document.querySelectorAll('.ingredient-row');
    rows.forEach((row, idx) => {
        const nom = row.querySelector(`input[name="ingredients[${idx}][nom]"]`)?.value || row.querySelector('[name*="nom"]')?.value;
        const quantite = row.querySelector(`input[name="ingredients[${idx}][quantite]"]`)?.value || row.querySelector('[name*="quantite"]')?.value;
        const rawUnite = row.querySelector(`input[name="ingredients[${idx}][unite]"]`)?.value || row.querySelector('[name*="unite"]')?.value;
        
        if (nom && quantite && rawUnite) {
            const unite = displayUnit(rawUnite);
            if (!isValidUnit(unite)) {
                invalidUnits.push(`${nom} (${rawUnite})`);
                return;
            }
            ingredients.push({ nom, quantite: parseFloat(quantite), unite });
        }
    });
    
    if (invalidUnits.length > 0) {
        showToast(`Unité invalide: ${invalidUnits.join(', ')}`, 'error');
        if (reenable) reenable();
        return;
    }

    const inventaire = DB.get('inventaire') || [];
    const missingIngredients = ingredients.filter(ing => {
        if (isWaterIngredient(ing.nom)) return false;
        return !findInventaireItemByName(inventaire, ing.nom);
    });
    if (missingIngredients.length > 0) {
        showToast(`Ingrédient(s) absents de l'inventaire: ${missingIngredients.map(i => i.nom).join(', ')}`, 'warning');
    }
    
    // Get aromeId from select or hidden input
    let aromeId = formData.get('aromeId');
    if (!aromeId) {
        const hiddenInput = form.querySelector('input[name="aromeId"][type="hidden"]');
        aromeId = hiddenInput?.value;
    }
    
    const recettes = DB.get('recettes');
    const arome = DB.get('aromes').find(a => a.id === aromeId);
    
    const recette = {
        id: id || generateId(),
        aromeId: aromeId,
        nom: arome ? arome.nom : 'Recette',
        ingredients
    };
    
    if (id) {
        const index = recettes.findIndex(r => r.id === id);
        recettes[index] = recette;
    } else {
        recettes.push(recette);
    }
    DB.set('recettes', recettes);
    
    modal.hide();
    showToast('Recette enregistrée');
    updateSettingsCard('recettes', renderSettingsRecettes());
};

const deleteRecette = (id) => {
    confirmDialog('Êtes-vous sûr de vouloir supprimer cette recette ?', { danger: true }).then(ok => {
        if (!ok) return;
        const recettes = DB.get('recettes').filter(r => r.id !== id);
        DB.set('recettes', recettes);
        showToast('Recette supprimée');
        updateSettingsCard('recettes', renderSettingsRecettes());
    });
};

const syncRecettesInventaire = () => {
    const recettes = DB.get('recettes') || [];
    const inventaire = DB.get('inventaire') || [];

    const uniqueIngredients = new Map();

    recettes.forEach(recette => {
        (recette.ingredients || []).forEach(ing => {
            if (isWaterIngredient(ing.nom)) return;
            const normalized = normalizeName(ing.nom);
            if (!uniqueIngredients.has(normalized)) {
                uniqueIngredients.set(normalized, { nom: ing.nom, unite: ing.unite || 'pcs' });
            }
        });
    });

    let ajouteCount = 0;

    uniqueIngredients.forEach(({ nom, unite }, normalized) => {
        const existing = findInventaireItemByName(inventaire, nom);
        if (!existing) {
            inventaire.push({
                id: generateId(),
                categorie: 'consommable',
                nom,
                quantite: 0,
                unite,
                seuilAlerte: 0
            });
            ajouteCount++;
        }
    });

    DB.set('inventaire', inventaire);

    if (ajouteCount === 0) {
        showToast('Inventaire déjà synchronisé — aucun ingrédient manquant');
    } else {
        showToast(`${ajouteCount} ingrédient(s) ajouté(s) à l'inventaire`);
        renderInventaire();
    }
};

// Settings - Clients
const showClientModal = (id = null) => {
    const clients = DB.get('clients');
    const client = id ? clients.find(c => c.id === id) : null;
    
    modal.show(id ? 'Modifier client' : 'Nouveau client', `
        <form id="clientForm">
            <div class="form-row">
                <div class="form-group">
                    <label>Société</label>
                    <input type="text" name="societe" value="${escapeHtml(client?.societe || '')}">
                </div>
                <div class="form-group">
                    <label>Prénom & Nom</label>
                    <input type="text" name="nom" value="${escapeHtml(client?.nom || '')}">
                </div>
            </div>
            <div class="form-group">
                <label>Adresse</label>
                <input type="text" name="adresse" value="${escapeHtml(client?.adresse || '')}">
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>NPA & Localité</label>
                    <input type="text" name="npa" value="${escapeHtml(client?.npa || '')}">
                </div>
                <div class="form-group">
                    <label>Catégorie tarif</label>
                    <select name="tarifs" onchange="applyTarifPreset(this)">
                        ${(() => {
                            const cat = normalizeTarifKey(client?.tarifs);
                            return `
                            <option value="custom" ${cat === 'custom' ? 'selected' : ''}>Personnalisé</option>
                            <option value="distributeur" ${cat === 'distributeur' ? 'selected' : ''}>Distributeur (2.25 / 3.80 / 6.–)</option>
                            <option value="prive" ${cat === 'prive' ? 'selected' : ''}>Privé (3.– / 5.– / 8.50)</option>`;
                        })()}
                    </select>
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Prix 25cl</label>
                    <input type="text" name="prix25cl" value="${escapeHtml(client?.prix25cl || '')}" oninput="onPrixInputChange()">
                </div>
                <div class="form-group">
                    <label>Prix 50cl</label>
                    <input type="text" name="prix50cl" value="${escapeHtml(client?.prix50cl || '')}" oninput="onPrixInputChange()">
                </div>
                <div class="form-group">
                    <label>Prix 100cl</label>
                    <input type="text" name="prix100cl" value="${escapeHtml(client?.prix100cl || '')}" oninput="onPrixInputChange()">
                </div>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Mode facturation</label>
                    <input type="text" name="modeFact" value="${escapeHtml(client?.modeFact || '')}">
                </div>
                <div class="form-group">
                    <label>Coordonnées</label>
                    <input type="text" name="coord" value="${escapeHtml(client?.coord || '')}">
                </div>
            </div>
            <div class="form-group">
                <label class="checkbox-label">
                    <input type="checkbox" name="actif" ${client?.actif !== false ? 'checked' : ''}>
                    Actif
                </label>
            </div>
        </form>
    `, `
        <button class="btn btn-secondary" onclick="modal.hide()">Annuler</button>
        <button class="btn btn-primary" onclick="saveClient(event, '${id || ''}')">Enregistrer</button>
    `);
    // Si la catégorie est distributeur/prive mais que les prix sont vides → applique le preset
    // Sécurité runtime (au cas où la migration au boot n'aurait pas tourné)
    setTimeout(applyTarifPresetIfEmpty, 0);
};

const saveClient = (event, id) => {
    const reenable = disableSaveBtn(event);
    const form = document.getElementById('clientForm');
    const formData = new FormData(form);
    
    const client = {
        id: id || generateId(),
        societe: formData.get('societe') || '',
        nom: formData.get('nom') || '',
        adresse: formData.get('adresse') || '',
        npa: formData.get('npa') || '',
        tarifs: formData.get('tarifs') || '',
        prix25cl: formData.get('prix25cl') || '',
        prix50cl: formData.get('prix50cl') || '',
        prix100cl: formData.get('prix100cl') || '',
        modeFact: formData.get('modeFact') || '',
        coord: formData.get('coord') || '',
        actif: form.querySelector('input[name="actif"]').checked
    };
    
    const clients = DB.get('clients');
    if (id) {
        const index = clients.findIndex(c => c.id === id);
        clients[index] = client;
    } else {
        clients.push(client);
    }
    DB.set('clients', clients);
    
    modal.hide();
    showToast('Client enregistré');
    updateSettingsCard('clients', renderSettingsClients());
};

const deleteClient = (id) => {
    const commandes = DB.get('commandes');
    const isUsedInCommandes = commandes.some(c => c.clientId === id);
    
    if (isUsedInCommandes) {
        showToast('Impossible de supprimer ce client : il a des commandes associées. Vous pouvez le désactiver à la place.', 'error');
        return;
    }

    confirmDialog('Êtes-vous sûr de vouloir supprimer ce client ?', { danger: true }).then(ok => {
        if (!ok) return;
        const clients = DB.get('clients').filter(c => c.id !== id);
        DB.set('clients', clients);
        showToast('Client supprimé');
        updateSettingsCard('clients', renderSettingsClients());
    });
};

// Excel: Export/Import Clients
const exportClientsExcel = () => {
  const clients = DB.get('clients') || [];
  const data = clients.map(c => ({
    Société: c.societe || '',
    'Prénom & Nom': c.nom || '',
    Adresse: c.adresse || '',
    'NPA & Localité': c.npa || '',
    Tarifs: c.tarifs || '',
    '25cl': c.prix25cl || '',
    '50cl': c.prix50cl || '',
    '100cl': c.prix100cl || '',
    'Mode facturation': c.modeFact || '',
    Coordonnées: c.coord || '',
    Actif: c.actif ? 'Oui' : 'Non'
  }));
  const ws = XLSX.utils.json_to_sheet(data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Clients');
  const date = new Date().toISOString().split('T')[0];
  XLSX.writeFile(wb, `clients_${date}.xlsx`);
  showToast('Clients exportés (Excel)');
};

const importClientsExcel = (event) => {
  const file = event.target.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = (e) => {
    const data = e.target.result;
    const wb = XLSX.read(data, { type: 'array' });
    const wsName = wb.SheetNames[0];
    const ws = wb.Sheets[wsName];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1 });
    if (!rows || rows.length < 2) {
      showToast('Fichier Excel vide ou invalide', 'error');
      return;
    }
    const headers = rows[0].map(h => String(h).toLowerCase().trim());
    const findIdx = (names) => {
      for (let i = 0; i < names.length; i++) {
        const idx = headers.findIndex(h => h.includes(names[i]));
        if (idx >= 0) return idx;
      }
      return -1;
    };
    const idx = {
      societe: findIdx(['société', 'societe']),
      nom: findIdx(['nom', 'prénom', 'prenom']),
      adresse: findIdx(['adresse']),
      npa: findIdx(['npa', 'localité', 'localite']),
      tarifs: findIdx(['tarif']),
      '25cl': findIdx(['25cl']),
      '50cl': findIdx(['50cl']),
      '100cl': findIdx(['100cl']),
      modeFact: findIdx(['mode', 'facturation']),
      coord: findIdx(['coordonnées', 'coordonnees', 'contact'])
    };
    const newClients = [];
    for (let i = 1; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;
      const getVal = (i) => row[i] !== undefined ? String(row[i]).trim() : '';
      newClients.push({
        id: generateId(),
        societe: idx.societe >= 0 ? getVal(idx.societe) : '',
        nom: idx.nom >= 0 ? getVal(idx.nom) : '',
        adresse: idx.adresse >= 0 ? getVal(idx.adresse) : '',
        npa: idx.npa >= 0 ? getVal(idx.npa) : '',
        tarifs: idx.tarifs >= 0 ? getVal(idx.tarifs) : '',
        prix25cl: idx['25cl'] >= 0 ? getVal(idx['25cl']) : '',
        prix50cl: idx['50cl'] >= 0 ? getVal(idx['50cl']) : '',
        prix100cl: idx['100cl'] >= 0 ? getVal(idx['100cl']) : '',
        modeFact: idx.modeFact >= 0 ? getVal(idx.modeFact) : '',
        coord: idx.coord >= 0 ? getVal(idx.coord) : '',
        actif: true
      });
    }
    if (newClients.length > 0) {
      const clients = DB.get('clients') || [];
      clients.push(...newClients);
      DB.set('clients', clients);
      showToast(`${newClients.length} client(s) importé(s)`);
      renderParametres();
    } else {
      showToast('Aucun client détecté', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
};

// Mobile menu toggle
const openSidebar = () => {
    document.querySelector('.sidebar').classList.add('open');
    document.getElementById('sidebarOverlay')?.classList.add('active');
};

const closeSidebar = () => {
    document.querySelector('.sidebar').classList.remove('open');
    document.getElementById('sidebarOverlay')?.classList.remove('active');
};

document.getElementById('menuToggle')?.addEventListener('click', () => {
    const sidebar = document.querySelector('.sidebar');
    if (sidebar.classList.contains('open')) {
        closeSidebar();
    } else {
        openSidebar();
    }
});

// Close sidebar on overlay tap
document.getElementById('sidebarOverlay')?.addEventListener('click', closeSidebar);

// Close sidebar when navigating on mobile
document.querySelectorAll('.nav-item, .bottom-nav-item').forEach(item => {
    item.addEventListener('click', () => {
        if (window.innerWidth <= 768) closeSidebar();
    });
});

// Reset clients data if corrupted
const resetClients = () => {
    confirmDialog('Voulez-vous effacer tous les clients et recommencer ?', { danger: true, confirmLabel: 'Effacer tout' }).then(ok => {
        if (!ok) return;
        DB.set('clients', []);
        showToast('Clients effacés');
        renderParametres();
    });
};

// Export all data to JSON
const exportAllData = () => {
    const tables = ['employees', 'aromes', 'formats', 'recettes', 'clients', 'lots', 'history', 'commandes', 'pointages', 'inventaire', 'livraisons'];
    const data = {};
    tables.forEach(table => {
        data[table] = DB.get(table) || [];
    });
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().split('T')[0];
    a.href = url;
    a.download = `sauvegarde_${date}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Sauvegarde créée');
};

// Import all data from JSON
const importAllData = (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const data = JSON.parse(e.target.result);
            const tables = ['employees', 'aromes', 'formats', 'recettes', 'clients', 'lots', 'history', 'commandes', 'pointages', 'inventaire', 'livraisons'];
            let count = 0;
            tables.forEach(table => {
                if (data[table] && Array.isArray(data[table])) {
                    DB.set(table, data[table]);
                    count++;
                }
            });
            showToast(`${count} tables restaurées`);
            router();
        } catch(err) {
            showToast('Erreur: fichier invalide', 'error');
        }
    };
    reader.readAsText(file);
    event.target.value = '';
};

// Initialize app
document.addEventListener('DOMContentLoaded', async () => {
    DB.init();
    const waitForFirebase = (timeoutMs = 3000) => new Promise(resolve => {
        const startedAt = Date.now();
        const check = () => {
            if (window.firebaseReady === true) return resolve(true);
            if (window.firebaseReady === false) return resolve(false);
            if (Date.now() - startedAt >= timeoutMs) return resolve(false);
            setTimeout(check, 100);
        };
        check();
    });
    const firebaseAvailable = await waitForFirebase();
    if (firebaseAvailable) await DB.loadFromFirebase(false);
    // Migration silencieuse (post-sync Firebase) : normalise les valeurs legacy de client.tarifs
    migrateClientTarifs();
    router();
});
