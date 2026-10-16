// ==UserScript==
// @name         Karmine Tool (bêta)
// @namespace    https://github.com/Dwakoz
// @version      1.22.0
// @description  Extension communautaire pour Sim Companies, développée par le joueur Karmine Corp. Calculateur XP, modérateurs FR et plus à venir.
// @author       Karmine Corp
// @match        https://www.simcompanies.com/*
// @match        https://simcompanies.com/*
// @icon         https://www.simcompanies.com/favicon.ico
// @updateURL    https://github.com/Dwakoz/karmine-tool/raw/refs/heads/main/karmine-corp-simco-toolkit.user.js
// @downloadURL  https://github.com/Dwakoz/karmine-tool/raw/refs/heads/main/karmine-corp-simco-toolkit.user.js
// @grant        GM_xmlhttpRequest
// @connect      api.simcotools.com
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.__kcSimcoToolkitLoaded) return;
  window.__kcSimcoToolkitLoaded = true;

  // Rempli après le premier appel réussi à auth-data (voir refreshXpData) et
  // réutilisé par tous les modules ayant besoin du realm — jamais redemandé
  // en boucle, pour respecter la limite d'1 requête/5 min du guide officiel.
  let currentRealmId = null;

  // Liste des modules du menu. On y ajoutera une entrée à chaque nouvel
  // outil développé. Fonction (pas une constante) car les libellés
  // dépendent de la langue choisie — réévalués à chaque reconstruction du
  // menu (au démarrage, et après un changement de langue).
  function getMenuItems() {
    return [
      {
        id: 'moderators',
        label: t('menu.moderators'),
        onSelect: () => openPanel('kc-moderators-panel'),
      },
      {
        id: 'market-events',
        label: t('menu.events'),
        onSelect: () => {
          openPanel('kc-events-panel');
          refreshMarketEvents();
        },
      },
      {
        id: 'realm-stats',
        label: t('menu.realmStats'),
        onSelect: () => {
          openPanel('kc-realmstats-panel');
          refreshRealmStats();
        },
      },
      {
        id: 'seasons',
        label: t('menu.seasons'),
        onSelect: () => openPanel('kc-seasons-panel'),
      },
      {
        id: 'market-prices',
        label: t('menu.prices'),
        onSelect: () => {
          openPanel('kc-prices-panel');
          refreshMarketPrices();
        },
      },
      {
        id: 'external-tools',
        label: t('menu.externalTools'),
        onSelect: () => openPanel('kc-externaltools-panel'),
      },
      {
        id: 'customization',
        label: t('menu.customization'),
        onSelect: () => openPanel('kc-customization-panel'),
      },
      {
        id: 'options',
        label: t('menu.options'),
        onSelect: () => openPanel('kc-options-panel'),
      },
    ];
  }

  // --- Paramètres persistants ---
  //
  // L'outil est destiné à toute la communauté, pas seulement aux joueurs
  // restaurant : les fonctionnalités spécifiques à un type de business
  // (ex. tag "Ingrédient restaurant") ne doivent s'afficher que si le
  // joueur l'active lui-même dans les Options. Désactivé par défaut.
  const SETTINGS_KEY = 'kc_settings_v1';
  const DEFAULT_SETTINGS = {
    language: 'fr',
    hasRestaurants: false,
    colorFilterEnabled: false,
    colorFilterHue: 0,
    faviconEnabled: false,
    chatColorsEnabled: false,
    chatOwnBubbleColor: '#1E749C',
    chatOwnTextColor: '#CCCCCC',
    chatConversationBgColor: '#222222',
    chatOtherBubbleColor: '#333333',
    chatOtherBubbleTextColor: '#F2F2F2',
    chatSenderNameColor: '#777777',
    chatTimestampColor: '#777777',
    chatSectionHeaderColor: '#F2F2F2',
    chatScrollbarColor: '#E8A33D',
    chatInputBgColor: '#333333',
    chatInputTextColor: '#FFFFFF',
    resourceTickerScrollbarColor: '#3C8CB6',
    pageBgColor: '#333333',
    // Opacité (0-100) de chaque couleur ci-dessus — 100 = opaque, comme avant.
    chatOwnBubbleColorAlpha: 100,
    chatOwnTextColorAlpha: 100,
    chatConversationBgColorAlpha: 100,
    chatOtherBubbleColorAlpha: 100,
    chatOtherBubbleTextColorAlpha: 100,
    chatSenderNameColorAlpha: 100,
    chatTimestampColorAlpha: 100,
    chatSectionHeaderColorAlpha: 100,
    chatScrollbarColorAlpha: 100,
    chatInputBgColorAlpha: 100,
    chatInputTextColorAlpha: 100,
    resourceTickerScrollbarColorAlpha: 100,
    pageBgColorAlpha: 100,
    topBarColor: '#222222',
    topBarColorAlpha: 100,
    bottomBarColor: '#222222',
    bottomBarColorAlpha: 100,
    statBarTextColor: '#FFFFFF',
    statBarTextColorAlpha: 100,
    mentionBgColor: '#333333',
    mentionBgColorAlpha: 100,
    activeContactBgColor: '#3C8CB6',
    activeContactBgColorAlpha: 100,
    mentionLinkColor: '#58A8CF',
    mentionLinkColorAlpha: 100,
    hideBuildingOverlay: false,
  };

  function loadSettings() {
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      return raw ? { ...DEFAULT_SETTINGS, ...JSON.parse(raw) } : { ...DEFAULT_SETTINGS };
    } catch (err) {
      return { ...DEFAULT_SETTINGS };
    }
  }

  function saveSettings(patch) {
    const settings = { ...loadSettings(), ...patch };
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    } catch (err) {
      // stockage indisponible : le réglage ne sera pas mémorisé, sans gravité
    }
    return settings;
  }

  // --- Traduction (FR/EN) ---
  //
  // currentLanguage est mis en cache au démarrage (et à chaque changement)
  // plutôt que relu depuis loadSettings() à chaque appel de t() — cette
  // fonction est appelée très souvent (construction de chaque panneau).

  let currentLanguage = 'fr';

  const I18N = {
    fr: {
      'menu.openAria': 'Ouvrir le menu Karmine Tool',
      'xp.openAria': 'Ouvrir le calculateur XP',
      'menu.moderators': 'Modérateurs',
      'menu.events': 'Événements',
      'menu.realmStats': 'Statistiques du royaume',
      'menu.seasons': 'Saisons',
      'menu.prices': 'Prix du marché',
      'menu.externalTools': 'Outils externes',
      'menu.customization': 'Personnalisation',
      'menu.options': 'Options',
      'common.close': 'Fermer',
      'common.refresh': 'Actualiser',
      'common.loading': 'Chargement…',
      'common.waitingGameData': 'Un instant, en attente des données du jeu…',
      'common.loadFailed': 'Échec du chargement. Réessaie dans un instant.',
      'toast.title': 'Bienvenue à bord',
      'toast.text':
        "Cette extension est développée par Karmine Corp, un joueur de la communauté Sim Companies, pour améliorer votre expérience de jeu. Retrouvez tous les outils depuis le bouton en haut à droite.",
      'xp.title': 'Calculateur XP',
      'xp.levelPlaceholder': 'Niveau —',
      'xp.progressPlaceholder': '—',
      'xp.ratePlaceholder': 'Vitesse : —',
      'xp.etaPlaceholder': '—',
      'xp.level': 'Niveau {level} — {levelName}',
      'xp.progress': '{experience} / {experienceToNextLevel} XP ({pct} %)',
      'xp.rateInstant': 'Vitesse : <span>{rate} XP/h</span> ({parts})',
      'xp.rateMeasured': 'Vitesse : <span>{rate} XP/h</span> (mesurée)',
      'xp.staleNote': 'dernière vue sur la carte il y a {minutes} min',
      'xp.etaLine': 'Niveau suivant dans <span>{duration}</span>',
      'xp.unavailable': 'Vitesse : indisponible sur cette page',
      'xp.unavailableHint': "Va sur l'onglet Carte pour une estimation instantanée de tes bâtiments actifs.",
      'xp.active': 'actif',
      'xp.actives': 'actifs',
      'xp.construction': 'en construction',
      'xp.recreational': 'récréatif',
      'xp.recreationals': 'récréatifs',
      'xp.recreationalLevelsLabel': 'Niveau des bâtiments récréatifs :',
      'xp.recreationalFallback': 'Bâtiment récréatif #{index}',
      'events.title': 'Événements',
      'events.openToLoad': 'Ouvre ce panneau pour charger les événements en cours.',
      'events.none': 'Aucun événement en cours sur ce realm actuellement.',
      'events.colResource': 'Ressource',
      'events.colModifier': 'Modif.',
      'events.colUntil': "Jusqu'au",
      'events.colSince': 'Depuis',
      'events.resourceFallback': 'Ressource #{kind}',
      'prices.title': 'Prix du marché',
      'prices.hint': 'Prix le plus bas actuellement affiché, toutes qualités confondues.',
      'prices.searchPlaceholder': 'Rechercher une ressource...',
      'prices.sortNameAsc': 'Nom A→Z',
      'prices.sortNameDesc': 'Nom Z→A',
      'prices.sortPriceDesc': 'Prix décroissant',
      'prices.sortPriceAsc': 'Prix croissant',
      'prices.openToLoad': 'Ouvre ce panneau pour charger les prix.',
      'prices.noMatch': 'Aucune ressource ne correspond à la recherche.',
      'prices.colResource': 'Ressource',
      'prices.colPrice': 'Prix',
      'prices.resourceFallback': 'Ressource #{kind}',
      'realmStats.title': 'Statistiques du royaume',
      'realmStats.total': '{count} bâtiments au total',
      'realmStats.searchPlaceholder': 'Rechercher un bâtiment...',
      'realmStats.sortCountDesc': 'Les plus construits',
      'realmStats.sortCountAsc': 'Les moins construits',
      'realmStats.sortNameAsc': 'Nom A→Z',
      'realmStats.sortNameDesc': 'Nom Z→A',
      'realmStats.openToLoad': 'Ouvre ce panneau pour charger les statistiques.',
      'realmStats.noMatch': 'Aucun bâtiment ne correspond à la recherche.',
      'realmStats.phaseBoom': 'Boom',
      'realmStats.phaseNormal': 'Normale',
      'realmStats.phaseRecession': 'Récession',
      'seasons.title': 'Saisons',
      'seasons.production': 'Production',
      'seasons.retail': 'Vente',
      'seasons.autumnHarvest': "Récolte d'automne",
      'seasons.ramadan': 'Ramadan',
      'seasons.ramadanDates': '18 février – 19 mars',
      'seasons.easter': 'Pâques',
      'seasons.easterDates': '2 avril – 12 avril',
      'seasons.summer': 'Été',
      'seasons.summerDates': '8 juillet – 29 août',
      'seasons.halloween': 'Halloween',
      'seasons.halloweenDates': '10 octobre – 5 novembre',
      'seasons.xmas': 'Noël',
      'seasons.xmasDates': '1 décembre – 27 décembre',
      'moderators.title': 'Modérateurs FR',
      'moderators.viewProfile': 'Voir le profil en jeu',
      'externalTools.title': 'Outils externes',
      'options.title': 'Options',
      'options.restaurants': 'Je possède des restaurants',
      'options.restaurantsHint':
        'Active certains détails spécifiques aux restaurants (ex. le tag "Ingrédient restaurant" dans les Événements). Désactivé, ces détails restent masqués — utile si tu joues un autre type de business.',
      'options.language': 'Langue de l\'outil',
      'options.languageHint': "Change la langue de l'interface de Karmine Tool (pas celle du jeu lui-même).",
      'customization.title': 'Personnalisation',
      'customization.export': 'Exporter mes réglages',
      'customization.import': 'Importer mes réglages',
      'customization.backupHint':
        "Sauvegarde tous tes réglages de personnalisation dans un fichier sur ton ordinateur. Utile si une mise à jour du jeu (ou un nettoyage du navigateur) vide le stockage local — tu pourras les réimporter d'un clic plutôt que tout reconfigurer à la main.",
      'customization.colorFilter': 'Filtre de couleur sur le jeu',
      'customization.colorFilterHint':
        "Teinte globale appliquée sur le jeu (pas sur cet outil). Le jeu n'ayant pas de palette centralisée, c'est un filtre uniforme plutôt qu'un reskin précis — un effet \"filtre\" plus qu'un vrai thème sur-mesure.",
      'customization.favicon': 'Favicon dynamique (niveau)',
      'customization.faviconHint': "Affiche ton niveau actuel directement dans l'icône de l'onglet. Purement cosmétique.",
      'customization.hideBuildingOverlay': 'Masquer le bandeau sur les bâtiments (carte)',
      'customization.hideBuildingOverlayHint':
        "Cache le temps de production restant, la note et le taux d'occupation affichés sur chaque bâtiment de la carte.",
      'customization.chatColors': 'Personnaliser les couleurs du chat',
      'customization.resetColors': 'Réinitialiser les couleurs',
      'customization.chatColorsHint':
        "S'applique uniquement sur la page Chat. Repose sur une classe interne du jeu qui peut changer à une future mise à jour — sans gravité si ça arrive, la personnalisation cesse juste de s'appliquer.",
      'customization.customBg': "Fond d'écran personnalisé (carte)",
      'customization.removeImage': "Retirer l'image",
      'customization.customBgHint':
        "Remplace le fond de la carte par une image de ton choix (max environ 3 Mo). S'appuie sur #page, un identifiant du jeu plutôt qu'une classe générée — plus stable.",
      'chatColor.ownBg': 'Fond — tes messages',
      'chatColor.ownText': 'Texte — tes messages',
      'chatColor.otherBg': 'Fond — messages des autres',
      'chatColor.otherText': 'Texte — messages des autres',
      'chatColor.convBg': 'Fond de la conversation',
      'chatColor.senderName': "Pseudo de l'expéditeur (salons publics)",
      'chatColor.timestamp': 'Horodatage',
      'chatColor.sectionHeader': 'En-têtes de section (Salons/Contacts)',
      'chatColor.inputBg': 'Fond — zone de saisie',
      'chatColor.inputText': 'Texte — zone de saisie',
      'chatColor.tickerScrollbar': 'Barre de défilement — bandeau de ressources',
      'chatColor.pageBg': 'Fond de la page (tout le jeu)',
      'chatColor.topBar': 'Barre du haut',
      'chatColor.bottomBar': 'Barre du bas (Carte/Entrepôt/...)',
      'chatColor.statBarText': 'Texte des barres (argent/XP/simboost)',
      'chatColor.mentionBg': 'Fond — message où tu es cité',
      'chatColor.activeContactBg': 'Fond — salon/contact ouvert',
      'chatColor.mentionLink': 'Liens/mentions (tes messages et ceux des autres)',
      'chatColor.scrollbar': 'Barre de défilement (tout le jeu)',
      'alert.imageTooLarge': 'Image trop lourde (max environ 3 Mo). Choisis une image plus légère.',
      'alert.imageSaveFailed':
        "Échec de l'enregistrement : l'image est trop volumineuse pour le stockage disponible. Essaie une image plus légère.",
      'alert.imageReadFailed': "Échec de la lecture de l'image. Réessaie avec un autre fichier.",
      'alert.importInvalidFile': "Fichier invalide : ce n'est pas un export valide de Karmine Tool.",
      'alert.importNothingFound': 'Aucun réglage reconnu dans ce fichier.',
      'alert.importReadFailed': 'Échec de la lecture du fichier.',
      'vwap.tooltipContract': 'VWAP (7 jours, qualité {quality}) : ${vwap} — voir sur SimcoTools',
      'vwap.tooltipMarket': 'VWAP (7 jours, qualité {quality}) : ${vwap}',
      'common.opacity': 'Opacité',
    },
    en: {
      'menu.openAria': 'Open the Karmine Tool menu',
      'xp.openAria': 'Open the XP calculator',
      'menu.moderators': 'Moderators',
      'menu.events': 'Events',
      'menu.realmStats': 'Realm statistics',
      'menu.seasons': 'Seasons',
      'menu.prices': 'Market prices',
      'menu.externalTools': 'External tools',
      'menu.customization': 'Customization',
      'menu.options': 'Options',
      'common.close': 'Close',
      'common.refresh': 'Refresh',
      'common.loading': 'Loading…',
      'common.waitingGameData': 'One moment, waiting for game data…',
      'common.loadFailed': 'Failed to load. Try again in a moment.',
      'toast.title': 'Welcome aboard',
      'toast.text':
        'This extension is developed by Karmine Corp, a Sim Companies community player, to improve your gaming experience. Find all the tools from the button in the top right corner.',
      'xp.title': 'XP Calculator',
      'xp.levelPlaceholder': 'Level —',
      'xp.progressPlaceholder': '—',
      'xp.ratePlaceholder': 'Speed: —',
      'xp.etaPlaceholder': '—',
      'xp.level': 'Level {level} — {levelName}',
      'xp.progress': '{experience} / {experienceToNextLevel} XP ({pct}%)',
      'xp.rateInstant': 'Speed: <span>{rate} XP/h</span> ({parts})',
      'xp.rateMeasured': 'Speed: <span>{rate} XP/h</span> (measured)',
      'xp.staleNote': 'last seen on the map {minutes} min ago',
      'xp.etaLine': 'Next level in <span>{duration}</span>',
      'xp.unavailable': 'Speed: unavailable on this page',
      'xp.unavailableHint': 'Go to the Map tab for an instant estimate of your active buildings.',
      'xp.active': 'active',
      'xp.actives': 'active',
      'xp.construction': 'under construction',
      'xp.recreational': 'recreational',
      'xp.recreationals': 'recreational',
      'xp.recreationalLevelsLabel': 'Recreational building levels:',
      'xp.recreationalFallback': 'Recreational building #{index}',
      'events.title': 'Events',
      'events.openToLoad': 'Open this panel to load the current events.',
      'events.none': 'No events currently active on this realm.',
      'events.colResource': 'Resource',
      'events.colModifier': 'Mod.',
      'events.colUntil': 'Until',
      'events.colSince': 'Since',
      'events.resourceFallback': 'Resource #{kind}',
      'prices.title': 'Market Prices',
      'prices.hint': 'Currently displayed lowest price, all qualities combined.',
      'prices.searchPlaceholder': 'Search a resource...',
      'prices.sortNameAsc': 'Name A→Z',
      'prices.sortNameDesc': 'Name Z→A',
      'prices.sortPriceDesc': 'Price descending',
      'prices.sortPriceAsc': 'Price ascending',
      'prices.openToLoad': 'Open this panel to load prices.',
      'prices.noMatch': 'No resource matches your search.',
      'prices.colResource': 'Resource',
      'prices.colPrice': 'Price',
      'prices.resourceFallback': 'Resource #{kind}',
      'realmStats.title': 'Realm Statistics',
      'realmStats.total': '{count} buildings total',
      'realmStats.searchPlaceholder': 'Search a building...',
      'realmStats.sortCountDesc': 'Most built',
      'realmStats.sortCountAsc': 'Least built',
      'realmStats.sortNameAsc': 'Name A→Z',
      'realmStats.sortNameDesc': 'Name Z→A',
      'realmStats.openToLoad': 'Open this panel to load statistics.',
      'realmStats.noMatch': 'No building matches your search.',
      'realmStats.phaseBoom': 'Boom',
      'realmStats.phaseNormal': 'Normal',
      'realmStats.phaseRecession': 'Recession',
      'seasons.title': 'Seasons',
      'seasons.production': 'Production',
      'seasons.retail': 'Retail',
      'seasons.autumnHarvest': 'Autumn Harvest',
      'seasons.ramadan': 'Ramadan',
      'seasons.ramadanDates': 'February 18 – March 19',
      'seasons.easter': 'Easter',
      'seasons.easterDates': 'April 2 – April 12',
      'seasons.summer': 'Summer',
      'seasons.summerDates': 'July 8 – August 29',
      'seasons.halloween': 'Halloween',
      'seasons.halloweenDates': 'October 10 – November 5',
      'seasons.xmas': 'Christmas',
      'seasons.xmasDates': 'December 1 – December 27',
      'moderators.title': 'FR Moderators',
      'moderators.viewProfile': 'View in-game profile',
      'externalTools.title': 'External Tools',
      'options.title': 'Options',
      'options.restaurants': 'I own restaurants',
      'options.restaurantsHint':
        'Enables restaurant-specific details (e.g. the "Restaurant ingredient" tag in Events). When disabled, these details stay hidden — useful if you play another type of business.',
      'options.language': 'Tool language',
      'options.languageHint': "Changes the Karmine Tool interface language (not the game's own language).",
      'customization.title': 'Customization',
      'customization.export': 'Export my settings',
      'customization.import': 'Import my settings',
      'customization.backupHint':
        'Backs up all your customization settings to a file on your computer. Useful if a game update (or a browser cleanup) clears local storage — you can re-import them in one click instead of reconfiguring everything by hand.',
      'customization.colorFilter': 'Color filter on the game',
      'customization.colorFilterHint':
        "Global hue applied to the game (not to this tool). Since the game has no centralized color palette, this is a uniform filter rather than a precise reskin — more of a \"filter\" effect than a true custom theme.",
      'customization.favicon': 'Dynamic favicon (level)',
      'customization.faviconHint': 'Displays your current level directly in the tab icon. Purely cosmetic.',
      'customization.hideBuildingOverlay': 'Hide building overlay (map)',
      'customization.hideBuildingOverlayHint':
        'Hides the remaining production time, rating, and occupancy rate shown on each building on the map.',
      'customization.chatColors': 'Customize chat colors',
      'customization.resetColors': 'Reset colors',
      'customization.chatColorsHint':
        "Only applies to the Chat page. Relies on an internal game class that may change in a future update — no big deal if that happens, the customization simply stops applying.",
      'customization.customBg': 'Custom background (map)',
      'customization.removeImage': 'Remove image',
      'customization.customBgHint':
        "Replaces the map background with an image of your choice (max ~3 MB). Relies on #page, a game identifier rather than a generated class — more stable.",
      'chatColor.ownBg': 'Background — your messages',
      'chatColor.ownText': 'Text — your messages',
      'chatColor.otherBg': "Background — others' messages",
      'chatColor.otherText': "Text — others' messages",
      'chatColor.convBg': 'Conversation background',
      'chatColor.senderName': 'Sender name (public rooms)',
      'chatColor.timestamp': 'Timestamp',
      'chatColor.sectionHeader': 'Section headers (Rooms/Contacts)',
      'chatColor.inputBg': 'Background — input box',
      'chatColor.inputText': 'Text — input box',
      'chatColor.tickerScrollbar': 'Scrollbar — resource ticker',
      'chatColor.pageBg': 'Page background (whole game)',
      'chatColor.topBar': 'Top bar',
      'chatColor.bottomBar': 'Bottom bar (Map/Warehouse/...)',
      'chatColor.statBarText': 'Stat bars text (money/XP/simboost)',
      'chatColor.mentionBg': 'Background — message mentioning you',
      'chatColor.activeContactBg': 'Background — open room/contact',
      'chatColor.mentionLink': 'Links/mentions (your messages and others\')',
      'chatColor.scrollbar': 'Scrollbar (whole game)',
      'alert.imageTooLarge': 'Image too large (max ~3 MB). Choose a lighter image.',
      'alert.imageSaveFailed': 'Save failed: the image is too large for the available storage. Try a lighter image.',
      'alert.imageReadFailed': 'Failed to read the image. Try another file.',
      'alert.importInvalidFile': 'Invalid file: this is not a valid Karmine Tool export.',
      'alert.importNothingFound': 'No recognizable settings found in this file.',
      'alert.importReadFailed': 'Failed to read the file.',
      'vwap.tooltipContract': 'VWAP (7-day, quality {quality}): ${vwap} — view on SimcoTools',
      'vwap.tooltipMarket': 'VWAP (7-day, quality {quality}): ${vwap}',
      'common.opacity': 'Opacity',
    },
  };

  function t(key, vars) {
    const dict = I18N[currentLanguage] || I18N.fr;
    let str = dict[key] != null ? dict[key] : I18N.fr[key] != null ? I18N.fr[key] : key;
    if (vars) {
      Object.keys(vars).forEach((k) => {
        str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), vars[k]);
      });
    }
    return str;
  }

  function localeTag() {
    return currentLanguage === 'en' ? 'en-US' : 'fr-FR';
  }

  // --- Filtre de couleur ---
  //
  // Le jeu n'utilise pas de variables CSS centralisées pour ses couleurs
  // (vérifié : aucune trouvée hors Font Awesome), donc reteindre chaque
  // élément un par un serait fragile (classes générées, changent à chaque
  // mise à jour). On applique à la place un filtre CSS global sur le
  // conteneur du jeu (#root) uniquement — jamais sur nos propres panneaux,
  // qui sont ajoutés en dehors de #root.

  function applyColorFilter() {
    const settings = loadSettings();
    let styleEl = document.getElementById('kc-color-filter-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'kc-color-filter-style';
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = settings.colorFilterEnabled
      ? `#root { filter: hue-rotate(${settings.colorFilterHue}deg); }`
      : '';
  }

  // --- Favicon dynamique (niveau) ---
  //
  // Purement cosmétique : affiche ton niveau actuel directement dans
  // l'icône de l'onglet, dessiné à la volée sur un <canvas>. On mémorise
  // le favicon d'origine pour le restaurer proprement si désactivé.
  //
  // Chrome ne rafraîchit pas toujours l'onglet si on se contente de
  // changer le href d'un <link> existant : il faut le supprimer et en
  // recréer un neuf à chaque application pour forcer la mise à jour.

  let originalFaviconHref = null;
  let lastKnownLevel = null;
  let lastAppliedFaviconKey = null; // combine niveau + état d'activation : évite de redessiner le canvas si rien n'a changé depuis le dernier passage (appelé toutes les 5 min)

  function setFaviconHref(href) {
    document.querySelectorAll('link[rel~="icon"]').forEach((el) => el.remove());
    const link = document.createElement('link');
    link.rel = 'icon';
    link.href = href;
    document.head.appendChild(link);
  }

  function applyDynamicFavicon(level) {
    const settings = loadSettings();
    if (originalFaviconHref == null) {
      const existing = document.querySelector('link[rel~="icon"]');
      originalFaviconHref = (existing && existing.href) || '/favicon.ico';
    }

    const key = `${settings.faviconEnabled}:${level}`;
    if (key === lastAppliedFaviconKey) return; // ni le niveau ni l'activation n'ont changé, rien à refaire
    lastAppliedFaviconKey = key;

    if (!settings.faviconEnabled || level == null) {
      setFaviconHref(originalFaviconHref);
      return;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#E8A33D';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#10151F';
    ctx.font = 'bold 15px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(level), 16, 17);
    setFaviconHref(canvas.toDataURL('image/png'));
  }

  // --- Personnalisation des couleurs du chat ---
  //
  // Repéré par inspection manuelle (pas de sélecteur stable type aria-label
  // disponible ici, contrairement au reste du jeu) :
  // - .css-4hxmqy  = bulle de TES messages envoyés (fond + texte)
  // - .css-1h4m491 = bulle des messages des AUTRES joueurs
  // - .css-15aq8s1 = fond de la conversation + pseudo dans le titre
  // - .css-50zrmy  = pseudo de l'expéditeur (au-dessus de chaque message,
  //   dans les salons publics)
  // - .css-12lfnwr = horodatage ("il y a X minutes")
  // - .well-header = en-têtes de section ("SALONS DE CHAT", "CONTACTS") —
  //   celle-ci n'est PAS générée aléatoirement (nom de classe stable,
  //   reliquat Bootstrap), donc plus fiable que les autres.
  // Les classes .css-XXXXX sont générées par le framework du jeu : elles
  // peuvent changer à sa prochaine mise à jour. Sans gravité si ça arrive —
  // la personnalisation cesse juste de s'appliquer, rien ne casse pour
  // autant (contrairement à une refonte de mise en page).

  function hexToRgba(hex, alphaPercent) {
    const clean = (hex || '#000000').replace('#', '');
    const r = parseInt(clean.substring(0, 2), 16) || 0;
    const g = parseInt(clean.substring(2, 4), 16) || 0;
    const b = parseInt(clean.substring(4, 6), 16) || 0;
    const a = Math.max(0, Math.min(100, alphaPercent == null ? 100 : alphaPercent)) / 100;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  function applyChatColors() {
    const settings = loadSettings();
    let styleEl = document.getElementById('kc-chat-colors-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'kc-chat-colors-style';
      document.head.appendChild(styleEl);
    }
    // Chaque couleur est convertie en rgba() avec son opacité propre
    // (0-100, stockée dans un réglage "<clé>Alpha" séparé — les <input
    // type="color"> natifs ne gèrent pas la transparence).
    const c = {};
    CHAT_COLOR_FIELDS.forEach((f) => {
      c[f.settingKey] = hexToRgba(settings[f.settingKey], settings[`${f.settingKey}Alpha`]);
    });
    styleEl.textContent = settings.chatColorsEnabled
      ? `
        .css-4hxmqy { background: ${c.chatOwnBubbleColor} !important; color: ${c.chatOwnTextColor} !important; }
        .css-1h4m491 { background: ${c.chatOtherBubbleColor} !important; color: ${c.chatOtherBubbleTextColor} !important; }
        .css-15aq8s1 { background: ${c.chatConversationBgColor} !important; }
        .css-50zrmy { color: ${c.chatSenderNameColor} !important; }
        .css-12lfnwr { color: ${c.chatTimestampColor} !important; }
        .well-header { color: ${c.chatSectionHeaderColor} !important; }
        textarea[placeholder*="crire ici"] { background: ${c.chatInputBgColor} !important; color: ${c.chatInputTextColor} !important; }
        .css-1k853ki { background: ${c.resourceTickerScrollbarColor} !important; }
        body { background: ${c.pageBgColor} !important; }
        .navbar-fixed-top { background: ${c.topBarColor} !important; }
        .css-15rmbqw { background: ${c.bottomBarColor} !important; }
        .css-1tkqeqv { color: ${c.statBarTextColor} !important; }
        .css-2iawg9 { background: ${c.mentionBgColor} !important; }
        .css-l1ucdn { background: ${c.activeContactBgColor} !important; }
        .css-1h4m491 a { color: ${c.mentionLinkColor} !important; }
        .css-4hxmqy a { color: ${c.mentionLinkColor} !important; }
        #root ::-webkit-scrollbar { width: 10px; height: 10px; }
        #root ::-webkit-scrollbar-track { background: transparent; }
        #root ::-webkit-scrollbar-thumb { background: ${c.chatScrollbarColor} !important; border-radius: 6px; }
      `
      : '';
  }

  // --- Fond d'écran personnalisé (carte) ---
  //
  // Stocké séparément des autres réglages (pas dans SETTINGS_KEY) car une
  // image encodée peut être volumineuse — on ne veut pas risquer de faire
  // échouer la sauvegarde des couleurs du chat si le quota est dépassé.
  // #page est un vrai identifiant du jeu (pas une classe générée), donc
  // plus stable que le reste de nos sélecteurs.

  const CUSTOM_BG_KEY = 'kc_custom_background_v1';
  const CUSTOM_BG_MAX_FILE_SIZE = 3 * 1024 * 1024; // 3 Mo

  function loadCustomBackground() {
    try {
      return localStorage.getItem(CUSTOM_BG_KEY);
    } catch (err) {
      return null;
    }
  }

  function saveCustomBackground(dataUrl) {
    try {
      localStorage.setItem(CUSTOM_BG_KEY, dataUrl);
      return true;
    } catch (err) {
      return false; // quota dépassé : on prévient l'utilisateur plutôt que d'échouer en silence
    }
  }

  function removeCustomBackground() {
    try {
      localStorage.removeItem(CUSTOM_BG_KEY);
    } catch (err) {
      // rien à faire de plus
    }
  }

  function applyCustomBackground() {
    let styleEl = document.getElementById('kc-custom-bg-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'kc-custom-bg-style';
      document.head.appendChild(styleEl);
    }
    const dataUrl = loadCustomBackground();
    styleEl.textContent = dataUrl
      ? `
        #page {
          background-image: url("${dataUrl}") !important;
          background-size: cover !important;
          background-position: center center !important;
          background-repeat: no-repeat !important;
          background-attachment: fixed !important;
        }
      `
      : '';
  }

  function handleCustomBackgroundFile(file, onDone) {
    if (!file) return;
    if (file.size > CUSTOM_BG_MAX_FILE_SIZE) {
      alert(t('alert.imageTooLarge'));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const ok = saveCustomBackground(reader.result);
      if (!ok) {
        alert(t('alert.imageSaveFailed'));
        return;
      }
      applyCustomBackground();
      if (onDone) onDone();
    };
    reader.onerror = () => alert(t('alert.imageReadFailed'));
    reader.readAsDataURL(file);
  }

  // Masque le bloc superposé sur chaque bâtiment de la carte (temps restant
  // de production + note + taux d'occupation). Les trois infos vivent dans
  // le même conteneur généré par le jeu (confirmé par capture d'écran),
  // donc une seule règle CSS suffit à les masquer ensemble.
  function applyMapOverlayVisibility() {
    let styleEl = document.getElementById('kc-map-overlay-style');
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = 'kc-map-overlay-style';
      document.head.appendChild(styleEl);
    }
    const settings = loadSettings();
    styleEl.textContent = settings.hideBuildingOverlay
      ? `
        .css-19nouqw {
          display: none !important;
        }
      `
      : '';
  }

  // Ingrédients de restaurant (kind IDs internes du jeu) — utilisés pour
  // mettre en avant les événements marché qui te concernent directement,
  // uniquement si le joueur a activé "Je possède des restaurants" dans les
  // Options. Sans ça, aucune utilité pour les autres types de joueurs.
  const RESTAURANT_INGREDIENT_IDS = new Set([
    117, 119, 121, 122, 123, 124, 125, 126, 129, 130, 131, 132, 134, 142, 143,
  ]);

  // Données des saisons — confirmées sur la page encyclopédie officielle du
  // jeu (/fr/encyclopedia/{realm}/seasons/), qui ne passe pas par une API
  // mais affiche des dates codées en dur côté client. À remettre à jour à
  // la main d'une année sur l'autre (le Ramadan en particulier suit le
  // calendrier lunaire).
  const SEASONS_DATA = {
    production: [{ nameKey: 'seasons.autumnHarvest', datesKey: null, emoji: '🎃', slug: 'production-seasons', key: 'AutumnHarvest' }],
    retail: [
      { nameKey: 'seasons.ramadan', datesKey: 'seasons.ramadanDates', emoji: '🌙', slug: 'retail-seasons', key: 'Ramadan' },
      { nameKey: 'seasons.easter', datesKey: 'seasons.easterDates', emoji: '🐰', slug: 'retail-seasons', key: 'Easter' },
      { nameKey: 'seasons.summer', datesKey: 'seasons.summerDates', emoji: '🍦', slug: 'retail-seasons', key: 'Summer' },
      { nameKey: 'seasons.halloween', datesKey: 'seasons.halloweenDates', emoji: '🎃', slug: 'retail-seasons', key: 'Halloween' },
      { nameKey: 'seasons.xmas', datesKey: 'seasons.xmasDates', emoji: '🎄', slug: 'retail-seasons', key: 'Xmas' },
    ],
  };

  // Modérateurs francophones de la communauté — profils en jeu pour les
  // contacter directement en cas de besoin.
  const MODERATORS_DATA = [
    { name: 'Fuego Corp', url: 'https://www.simcompanies.com/fr/company/0/Fuego-Corp/' },
    { name: 'Tools and Co', url: 'https://www.simcompanies.com/fr/company/0/Tools-and-Co/' },
  ];

  // Outils externes communautaires — simples liens de référence, pas du code.
  const EXTERNAL_TOOLS_DATA = [
    { name: 'SimcoTools', url: 'https://simcotools.com/fr/' },
    { name: 'Cooper Inc', url: 'https://cooperinc.xyz/' },
  ];

  const STYLE = `
    #kc-xp-toggle {
      position: fixed;
      top: 64px;
      right: 64px;
      height: 20px;
      padding: 0 14px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(232, 163, 61, 0.5);
      border: none;
      border-radius: 8px;
      box-shadow: none;
      color: #FFFFFF;
      font-family: "Roboto Condensed", "Arial Narrow", sans-serif-condensed, sans-serif;
      font-size: 14px;
      font-weight: 400;
      line-height: 20px;
      cursor: pointer;
      z-index: 2147483000;
      transition: background 0.15s ease;
    }
    #kc-xp-toggle:hover {
      background: rgba(232, 163, 61, 0.7);
    }
    #kc-xp-toggle:focus-visible {
      outline: 2px solid #EDE6D8;
      outline-offset: 2px;
    }
    #kc-menu-btn {
      position: fixed;
      top: 64px;
      right: 16px;
      width: 40px;
      height: 40px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #10151F;
      border: 1px solid #3E7C74;
      color: #E8A33D;
      cursor: pointer;
      z-index: 2147483000;
      transition: border-color 0.15s ease, background 0.15s ease;
    }
    #kc-menu-btn:hover {
      background: #1B2436;
      border-color: #E8A33D;
    }
    #kc-menu-btn:focus-visible {
      outline: 2px solid #E8A33D;
      outline-offset: 2px;
    }
    #kc-menu-arrow {
      display: inline-block;
      font-size: 16px;
      line-height: 1;
      transition: transform 0.18s ease;
    }
    #kc-menu-btn.kc-open #kc-menu-arrow {
      transform: rotate(180deg);
    }
    #kc-menu-panel {
      position: fixed;
      top: 108px;
      right: 16px;
      width: 260px;
      background: #10151F;
      color: #EDE6D8;
      border-left: 4px solid #E8A33D;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 2147483000;
      transform-origin: top right;
      transform: scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease;
    }
    #kc-menu-panel.kc-open {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    #kc-menu-header {
      padding: 8px 16px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.02em;
      color: #9FB0C3;
      background: #1B2436;
      border-bottom: 1px solid #3E7C74;
    }
    #kc-menu-list {
      list-style: none;
      margin: 0;
      padding: 4px 0;
    }
    #kc-menu-list li {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      padding: 10px 16px;
      font-size: 13px;
      cursor: pointer;
    }
    #kc-menu-list li:hover {
      background: #1B2436;
    }
    #kc-toast {
      position: fixed;
      right: 24px;
      bottom: 24px;
      width: 340px;
      max-width: calc(100vw - 48px);
      background: #10151F;
      color: #EDE6D8;
      border-left: 4px solid #E8A33D;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 2147483000;
      transform: translateX(140%);
      opacity: 0;
      transition: transform 0.5s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.5s ease;
    }
    #kc-toast.kc-visible {
      transform: translateX(0);
      opacity: 1;
    }
    #kc-toast-status {
      display: block;
      padding: 8px 16px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.02em;
      color: #9FB0C3;
      background: #1B2436;
      border-bottom: 1px solid #3E7C74;
    }
    #kc-toast-body {
      padding: 16px;
    }
    #kc-toast-title {
      margin: 0 0 8px;
      font-size: 16px;
      font-weight: 600;
      color: #EDE6D8;
    }
    #kc-toast-text {
      margin: 0;
      font-size: 13px;
      line-height: 1.5;
      color: #C7D0DB;
    }
    #kc-toast-footer {
      display: flex;
      justify-content: flex-end;
      padding: 0 16px 16px;
    }
    #kc-toast-close {
      appearance: none;
      border: 1px solid #3E7C74;
      background: transparent;
      color: #EDE6D8;
      font-size: 12px;
      padding: 6px 14px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    #kc-toast-close:hover {
      background: #1B2436;
    }
    #kc-toast-close:focus-visible {
      outline: 2px solid #E8A33D;
      outline-offset: 2px;
    }
    #kc-xp-panel {
      position: fixed;
      top: 108px;
      right: 16px;
      width: 300px;
      max-width: calc(100vw - 48px);
      background: #10151F;
      color: #EDE6D8;
      border-left: 4px solid #E8A33D;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 2147483000;
      transform-origin: top right;
      transform: scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease;
    }
    #kc-xp-panel.kc-open {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    #kc-xp-status {
      display: block;
      padding: 8px 16px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.02em;
      color: #9FB0C3;
      background: #1B2436;
      border-bottom: 1px solid #3E7C74;
    }
    #kc-xp-body {
      padding: 16px;
    }
    #kc-xp-level {
      margin: 0 0 12px;
      font-size: 16px;
      font-weight: 600;
    }
    #kc-xp-track {
      height: 6px;
      background: #1B2436;
      border: 1px solid #3E7C74;
      margin-bottom: 6px;
    }
    #kc-xp-fill {
      height: 100%;
      background: #E8A33D;
      width: 0%;
      transition: width 0.4s ease;
    }
    #kc-xp-progress-text {
      margin: 0 0 14px;
      font-size: 12px;
      color: #9FB0C3;
    }
    #kc-xp-rate,
    #kc-xp-eta {
      margin: 0 0 4px;
      font-size: 13px;
      color: #C7D0DB;
    }
    #kc-xp-rate span,
    #kc-xp-eta span {
      color: #EDE6D8;
      font-weight: 600;
    }
    .kc-xp-stale {
      font-size: 11px;
      color: #9FB0C3;
      font-style: italic;
    }
    #kc-xp-recreational:not(:empty) {
      margin-top: 10px;
      padding-top: 10px;
      border-top: 1px solid #1B2436;
    }
    .kc-xp-recreational-label {
      margin: 0 0 6px;
      font-size: 11px;
      color: #9FB0C3;
    }
    .kc-xp-recreational-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-bottom: 6px;
      font-size: 12px;
      color: #C7D0DB;
    }
    .kc-xp-recreational-row input {
      width: 48px;
      background: #1B2436;
      border: 1px solid #3E7C74;
      color: #EDE6D8;
      font-size: 12px;
      padding: 3px 6px;
    }
    #kc-xp-footer {
      display: flex;
      justify-content: space-between;
      padding: 12px 16px 16px;
    }
    #kc-xp-refresh,
    #kc-xp-close {
      appearance: none;
      border: 1px solid #3E7C74;
      background: transparent;
      color: #EDE6D8;
      font-size: 12px;
      padding: 6px 14px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    #kc-xp-refresh:hover,
    #kc-xp-close:hover {
      background: #1B2436;
    }
    #kc-xp-refresh:focus-visible,
    #kc-xp-close:focus-visible {
      outline: 2px solid #E8A33D;
      outline-offset: 2px;
    }
    #kc-moderators-panel {
      position: fixed;
      top: 108px;
      right: 16px;
      width: 280px;
      max-width: calc(100vw - 48px);
      background: #10151F;
      color: #EDE6D8;
      border-left: 4px solid #E8A33D;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 2147483000;
      transform-origin: top right;
      transform: scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease;
    }
    #kc-moderators-panel.kc-open {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    #kc-moderators-status {
      display: block;
      padding: 8px 16px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.02em;
      color: #9FB0C3;
      background: #1B2436;
      border-bottom: 1px solid #3E7C74;
    }
    #kc-moderators-body {
      padding: 4px 0;
    }
    .kc-moderator-row {
      display: flex;
      flex-direction: column;
      gap: 2px;
      padding: 10px 16px;
      color: #EDE6D8;
      text-decoration: none;
      border-bottom: 1px solid #1B2436;
    }
    .kc-moderator-row:last-child {
      border-bottom: none;
    }
    .kc-moderator-row:hover {
      background: #1B2436;
    }
    .kc-moderator-name {
      font-size: 13px;
      font-weight: 600;
    }
    .kc-moderator-sub {
      font-size: 11px;
      color: #9FB0C3;
    }
    #kc-moderators-footer {
      display: flex;
      justify-content: flex-end;
      padding: 8px 16px 16px;
    }
    #kc-moderators-close {
      appearance: none;
      border: 1px solid #3E7C74;
      background: transparent;
      color: #EDE6D8;
      font-size: 12px;
      padding: 6px 14px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    #kc-moderators-close:hover {
      background: #1B2436;
    }
    #kc-moderators-close:focus-visible {
      outline: 2px solid #E8A33D;
      outline-offset: 2px;
    }
    #kc-externaltools-panel {
      position: fixed;
      top: 108px;
      right: 16px;
      width: 280px;
      max-width: calc(100vw - 48px);
      background: #10151F;
      color: #EDE6D8;
      border-left: 4px solid #E8A33D;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 2147483000;
      transform-origin: top right;
      transform: scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease;
    }
    #kc-externaltools-panel.kc-open {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    #kc-externaltools-status {
      display: block;
      padding: 8px 16px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.02em;
      color: #9FB0C3;
      background: #1B2436;
      border-bottom: 1px solid #3E7C74;
    }
    #kc-externaltools-body {
      padding: 4px 0;
    }
    #kc-externaltools-footer {
      display: flex;
      justify-content: flex-end;
      padding: 8px 16px 16px;
    }
    #kc-externaltools-close {
      appearance: none;
      border: 1px solid #3E7C74;
      background: transparent;
      color: #EDE6D8;
      font-size: 12px;
      padding: 6px 14px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    #kc-externaltools-close:hover {
      background: #1B2436;
    }
    #kc-externaltools-close:focus-visible {
      outline: 2px solid #E8A33D;
      outline-offset: 2px;
    }
    #kc-events-panel {
      position: fixed;
      top: 108px;
      right: 16px;
      width: 380px;
      max-width: calc(100vw - 48px);
      max-height: 70vh;
      overflow-y: auto;
      background: #10151F;
      color: #EDE6D8;
      border-left: 4px solid #E8A33D;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 2147483000;
      transform-origin: top right;
      transform: scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease;
    }
    #kc-events-panel.kc-open {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    #kc-events-status {
      display: block;
      padding: 8px 16px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.02em;
      color: #9FB0C3;
      background: #1B2436;
      border-bottom: 1px solid #3E7C74;
      position: sticky;
      top: 0;
    }
    #kc-events-body {
      padding: 4px 8px;
    }
    #kc-events-empty {
      padding: 16px;
      font-size: 12px;
      color: #9FB0C3;
    }
    .kc-events-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .kc-events-table thead th {
      text-align: left;
      padding: 6px 8px;
      font-size: 10px;
      font-weight: 600;
      color: #9FB0C3;
      border-bottom: 1px solid #3E7C74;
      position: sticky;
      top: 0;
      background: #10151F;
    }
    .kc-events-table thead th:not(:first-child) {
      text-align: right;
    }
    .kc-event-row td {
      padding: 7px 8px;
      border-bottom: 1px solid #1B2436;
      white-space: nowrap;
    }
    .kc-event-row:last-child td {
      border-bottom: none;
    }
    .kc-event-resource {
      color: #EDE6D8;
      white-space: normal !important;
    }
    .kc-event-modifier {
      font-weight: 700;
      text-align: right;
    }
    .kc-event-modifier.kc-positive {
      color: #6FBF73;
    }
    .kc-event-modifier.kc-negative {
      color: #E06B6B;
    }
    .kc-event-until,
    .kc-event-since {
      color: #9FB0C3;
      text-align: right;
    }
    .kc-event-tag {
      font-size: 11px;
    }
    #kc-events-footer {
      display: flex;
      justify-content: space-between;
      padding: 8px 16px 16px;
      position: sticky;
      bottom: 0;
      background: #10151F;
    }
    #kc-events-refresh,
    #kc-events-close {
      appearance: none;
      border: 1px solid #3E7C74;
      background: transparent;
      color: #EDE6D8;
      font-size: 12px;
      padding: 6px 14px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    #kc-events-refresh:hover,
    #kc-events-close:hover {
      background: #1B2436;
    }
    #kc-events-refresh:focus-visible,
    #kc-events-close:focus-visible {
      outline: 2px solid #E8A33D;
      outline-offset: 2px;
    }
    #kc-options-panel {
      position: fixed;
      top: 108px;
      right: 16px;
      width: 300px;
      max-width: calc(100vw - 48px);
      background: #10151F;
      color: #EDE6D8;
      border-left: 4px solid #E8A33D;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 2147483000;
      transform-origin: top right;
      transform: scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease;
    }
    #kc-options-panel.kc-open {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    #kc-options-status {
      display: block;
      padding: 8px 16px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.02em;
      color: #9FB0C3;
      background: #1B2436;
      border-bottom: 1px solid #3E7C74;
    }
    #kc-options-body {
      padding: 16px;
    }
    #kc-options-footer {
      display: flex;
      justify-content: flex-end;
      padding: 0 16px 16px;
    }
    #kc-options-close {
      appearance: none;
      border: 1px solid #3E7C74;
      background: transparent;
      color: #EDE6D8;
      font-size: 12px;
      padding: 6px 14px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    #kc-options-close:hover {
      background: #1B2436;
    }
    #kc-options-close:focus-visible {
      outline: 2px solid #E8A33D;
      outline-offset: 2px;
    }
    #kc-customization-panel {
      position: fixed;
      top: 108px;
      right: 16px;
      width: 300px;
      max-width: calc(100vw - 48px);
      max-height: 80vh;
      overflow-y: auto;
      background: #10151F;
      color: #EDE6D8;
      border-left: 4px solid #E8A33D;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 2147483000;
      transform-origin: top right;
      transform: scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease;
    }
    #kc-customization-panel.kc-open {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    #kc-customization-status {
      display: block;
      padding: 8px 16px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.02em;
      color: #9FB0C3;
      background: #1B2436;
      border-bottom: 1px solid #3E7C74;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    #kc-customization-body {
      padding: 16px;
    }
    #kc-customization-backup-row {
      display: flex;
      gap: 8px;
      margin-bottom: 4px;
    }
    #kc-customization-backup-row .kc-options-reset-btn {
      margin-top: 0;
      flex: 1;
      text-align: center;
    }
    #kc-customization-import-label {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      position: relative;
      overflow: hidden;
    }
    #kc-customization-import-label input[type='file'] {
      position: absolute;
      inset: 0;
      opacity: 0;
      cursor: pointer;
    }
    .kc-options-row {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 13px;
      color: #EDE6D8;
      cursor: pointer;
    }
    .kc-options-row input {
      accent-color: #E8A33D;
      width: 15px;
      height: 15px;
      cursor: pointer;
    }
    .kc-options-hint {
      margin: 10px 0 0;
      font-size: 11px;
      line-height: 1.5;
      color: #9FB0C3;
    }
    .kc-options-hue-row {
      display: flex;
      align-items: center;
      gap: 10px;
      margin-top: 8px;
    }
    .kc-options-hue-row input[type='range'] {
      flex: 1;
      accent-color: #E8A33D;
    }
    #kc-customization-hue-value {
      font-size: 12px;
      color: #EDE6D8;
      min-width: 32px;
      text-align: right;
    }
    .kc-options-chat-colors-grid {
      margin-top: 8px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .kc-options-color-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      font-size: 12px;
      color: #C7D0DB;
      cursor: pointer;
    }
    .kc-options-color-row input[type='color'] {
      width: 32px;
      height: 22px;
      padding: 0;
      border: 1px solid #3E7C74;
      background: transparent;
      cursor: pointer;
    }
    .kc-options-color-row input[type='color']:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .kc-options-color-controls {
      display: flex;
      align-items: center;
      gap: 6px;
      flex-shrink: 0;
    }
    .kc-options-alpha-slider {
      width: 50px;
      accent-color: #E8A33D;
      cursor: pointer;
    }
    .kc-options-alpha-slider:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .kc-options-reset-btn {
      appearance: none;
      margin-top: 8px;
      border: 1px solid #3E7C74;
      background: transparent;
      color: #EDE6D8;
      font-size: 11px;
      padding: 5px 10px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    .kc-options-reset-btn:hover:not(:disabled) {
      background: #1B2436;
    }
    .kc-options-reset-btn:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    #kc-customization-footer {
      display: flex;
      justify-content: flex-end;
      padding: 0 16px 16px;
      position: sticky;
      bottom: 0;
      background: #10151F;
    }
    #kc-customization-close {
      appearance: none;
      border: 1px solid #3E7C74;
      background: transparent;
      color: #EDE6D8;
      font-size: 12px;
      padding: 6px 14px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    #kc-customization-close:hover {
      background: #1B2436;
    }
    #kc-customization-close:focus-visible {
      outline: 2px solid #E8A33D;
      outline-offset: 2px;
    }
    .kc-vwap-badge {
      display: inline-block;
      margin-left: 8px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      font-size: 11px;
      font-weight: 600;
      padding: 1px 6px;
      border-radius: 4px;
      white-space: nowrap;
      vertical-align: middle;
      text-decoration: none;
      cursor: pointer;
    }
    .kc-vwap-badge.kc-vwap-cheap {
      color: #6FBF73;
      background: rgba(111, 191, 115, 0.15);
    }
    .kc-vwap-badge.kc-vwap-expensive {
      color: #E06B6B;
      background: rgba(224, 107, 107, 0.15);
    }
    #kc-realmstats-panel {
      position: fixed;
      top: 108px;
      right: 16px;
      width: 320px;
      max-width: calc(100vw - 48px);
      max-height: 75vh;
      overflow-y: auto;
      background: #10151F;
      color: #EDE6D8;
      border-left: 4px solid #E8A33D;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 2147483000;
      transform-origin: top right;
      transform: scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease;
    }
    #kc-realmstats-panel.kc-open {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    #kc-realmstats-status {
      display: block;
      padding: 8px 16px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.02em;
      color: #9FB0C3;
      background: #1B2436;
      border-bottom: 1px solid #3E7C74;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    #kc-realmstats-summary {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 16px 8px;
    }
    #kc-realmstats-total {
      font-size: 13px;
      color: #C7D0DB;
    }
    #kc-realmstats-total strong {
      color: #EDE6D8;
    }
    .kc-phase-badge {
      font-size: 10px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      padding: 2px 8px;
      border-radius: 999px;
    }
    .kc-phase-boom {
      color: #6FBF73;
      background: rgba(111, 191, 115, 0.15);
    }
    .kc-phase-normal {
      color: #E8A33D;
      background: rgba(232, 163, 61, 0.15);
    }
    .kc-phase-recession {
      color: #E06B6B;
      background: rgba(224, 107, 107, 0.15);
    }
    #kc-realmstats-controls {
      display: flex;
      gap: 8px;
      padding: 0 16px 12px;
    }
    #kc-realmstats-search {
      flex: 1;
      background: #1B2436;
      border: 1px solid #3E7C74;
      color: #EDE6D8;
      font-size: 12px;
      padding: 5px 8px;
    }
    #kc-realmstats-sort {
      background: #1B2436;
      border: 1px solid #3E7C74;
      color: #EDE6D8;
      font-size: 12px;
      padding: 5px 4px;
    }
    #kc-realmstats-list {
      padding: 0 16px 16px;
    }
    .kc-realmstats-row {
      margin-bottom: 10px;
    }
    .kc-realmstats-row-top {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      margin-bottom: 4px;
    }
    .kc-realmstats-row-name {
      color: #EDE6D8;
    }
    .kc-realmstats-row-value {
      color: #9FB0C3;
    }
    .kc-realmstats-bar-track {
      height: 6px;
      background: #1B2436;
      border-radius: 3px;
      overflow: hidden;
    }
    .kc-realmstats-bar-fill {
      height: 100%;
      background: #E8A33D;
    }
    #kc-realmstats-empty {
      padding: 16px;
      font-size: 12px;
      color: #9FB0C3;
    }
    #kc-realmstats-footer {
      display: flex;
      justify-content: space-between;
      padding: 8px 16px 16px;
    }
    #kc-realmstats-refresh,
    #kc-realmstats-close {
      appearance: none;
      border: 1px solid #3E7C74;
      background: transparent;
      color: #EDE6D8;
      font-size: 12px;
      padding: 6px 14px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    #kc-realmstats-refresh:hover,
    #kc-realmstats-close:hover {
      background: #1B2436;
    }
    #kc-realmstats-refresh:focus-visible,
    #kc-realmstats-close:focus-visible {
      outline: 2px solid #E8A33D;
      outline-offset: 2px;
    }
    #kc-seasons-panel {
      position: fixed;
      top: 108px;
      right: 16px;
      width: 300px;
      max-width: calc(100vw - 48px);
      max-height: 75vh;
      overflow-y: auto;
      background: #10151F;
      color: #EDE6D8;
      border-left: 4px solid #E8A33D;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 2147483000;
      transform-origin: top right;
      transform: scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease;
    }
    #kc-seasons-panel.kc-open {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    #kc-seasons-status {
      display: block;
      padding: 8px 16px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.02em;
      color: #9FB0C3;
      background: #1B2436;
      border-bottom: 1px solid #3E7C74;
      position: sticky;
      top: 0;
    }
    #kc-seasons-body {
      padding: 12px 16px 4px;
    }
    .kc-seasons-group-title {
      margin: 8px 0 6px;
      font-size: 11px;
      color: #9FB0C3;
    }
    .kc-season-card {
      display: flex;
      align-items: center;
      gap: 10px;
      background: #1B2436;
      border-radius: 4px;
      padding: 10px 12px;
      margin-bottom: 8px;
      text-decoration: none;
      color: inherit;
      transition: background 0.15s ease;
    }
    .kc-season-card:hover {
      background: #24304A;
    }
    .kc-season-emoji {
      font-size: 22px;
      line-height: 1;
    }
    .kc-season-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .kc-season-name {
      font-size: 13px;
      font-weight: 600;
      color: #EDE6D8;
    }
    .kc-season-dates {
      font-size: 11px;
      color: #9FB0C3;
    }
    #kc-seasons-footer {
      display: flex;
      justify-content: flex-end;
      padding: 4px 16px 16px;
    }
    #kc-seasons-close {
      appearance: none;
      border: 1px solid #3E7C74;
      background: transparent;
      color: #EDE6D8;
      font-size: 12px;
      padding: 6px 14px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    #kc-seasons-close:hover {
      background: #1B2436;
    }
    #kc-seasons-close:focus-visible {
      outline: 2px solid #E8A33D;
      outline-offset: 2px;
    }
    #kc-prices-panel {
      position: fixed;
      top: 108px;
      right: 16px;
      width: 300px;
      max-width: calc(100vw - 48px);
      max-height: 75vh;
      overflow-y: auto;
      background: #10151F;
      color: #EDE6D8;
      border-left: 4px solid #E8A33D;
      box-shadow: 0 8px 24px rgba(0, 0, 0, 0.45);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      z-index: 2147483000;
      transform-origin: top right;
      transform: scale(0.96);
      opacity: 0;
      pointer-events: none;
      transition: transform 0.18s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.18s ease;
    }
    #kc-prices-panel.kc-open {
      transform: scale(1);
      opacity: 1;
      pointer-events: auto;
    }
    #kc-prices-status {
      display: block;
      padding: 8px 16px;
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 11px;
      letter-spacing: 0.02em;
      color: #9FB0C3;
      background: #1B2436;
      border-bottom: 1px solid #3E7C74;
      position: sticky;
      top: 0;
      z-index: 1;
    }
    #kc-prices-hint {
      margin: 8px 16px 0;
      font-size: 11px;
      color: #9FB0C3;
    }
    #kc-prices-controls {
      display: flex;
      gap: 8px;
      padding: 10px 16px 8px;
    }
    #kc-prices-search {
      flex: 1;
      background: #1B2436;
      border: 1px solid #3E7C74;
      color: #EDE6D8;
      font-size: 12px;
      padding: 5px 8px;
    }
    #kc-prices-sort {
      background: #1B2436;
      border: 1px solid #3E7C74;
      color: #EDE6D8;
      font-size: 12px;
      padding: 5px 4px;
    }
    #kc-prices-body {
      padding: 0 8px;
    }
    #kc-prices-empty {
      padding: 10px 8px 16px;
      font-size: 12px;
      color: #9FB0C3;
    }
    .kc-prices-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12px;
    }
    .kc-prices-table thead th {
      text-align: left;
      padding: 6px 8px;
      font-size: 10px;
      font-weight: 600;
      color: #9FB0C3;
      border-bottom: 1px solid #3E7C74;
    }
    .kc-prices-table thead th:not(:first-child) {
      text-align: right;
    }
    .kc-prices-table td {
      padding: 6px 8px;
      border-bottom: 1px solid #1B2436;
    }
    .kc-price-resource {
      color: #EDE6D8;
    }
    .kc-price-resource a {
      color: inherit;
      text-decoration: none;
    }
    .kc-price-resource a:hover {
      color: #E8A33D;
      text-decoration: underline;
    }
    .kc-price-value {
      color: #9FB0C3;
      text-align: right;
      white-space: nowrap;
    }
    .kc-price-trend {
      text-align: right;
      font-weight: 700;
    }
    .kc-price-trend.kc-positive {
      color: #6FBF73;
    }
    .kc-price-trend.kc-negative {
      color: #E06B6B;
    }
    #kc-prices-footer {
      display: flex;
      justify-content: space-between;
      padding: 8px 16px 16px;
      position: sticky;
      bottom: 0;
      background: #10151F;
    }
    #kc-prices-refresh,
    #kc-prices-close {
      appearance: none;
      border: 1px solid #3E7C74;
      background: transparent;
      color: #EDE6D8;
      font-size: 12px;
      padding: 6px 14px;
      cursor: pointer;
      transition: background 0.15s ease;
    }
    #kc-prices-refresh:hover,
    #kc-prices-close:hover {
      background: #1B2436;
    }
    #kc-prices-refresh:focus-visible,
    #kc-prices-close:focus-visible {
      outline: 2px solid #E8A33D;
      outline-offset: 2px;
    }
    @media (prefers-reduced-motion: reduce) {
      #kc-toast, #kc-menu-panel, #kc-xp-panel, #kc-moderators-panel, #kc-events-panel, #kc-options-panel, #kc-customization-panel, #kc-realmstats-panel, #kc-seasons-panel, #kc-prices-panel, #kc-externaltools-panel {
        transition: opacity 0.3s ease;
        transform: none;
      }
    }
  `;

  // Échappe tout texte externe (noms de ressources/bâtiments venant de
  // SimcoTools) avant de l'insérer dans du innerHTML. Rien ne prouve que
  // SimcoTools renvoie un jour du contenu piégé, mais insérer du texte
  // tiers sans échappement est une mauvaise pratique par principe — un nom
  // contenant "<script>" ou un attribut d'événement s'exécuterait sinon
  // dans la page du jeu.
  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Un curseur (teinte, opacité) déclenche des dizaines d'événements
  // "input" par seconde pendant qu'on le fait glisser. saveSettings()
  // relit/réécrit tout le blob localStorage à chaque appel — pas la peine
  // de le faire à cette fréquence. L'aperçu visuel (applyChatColors,
  // applyColorFilter) reste instantané à chaque événement ; seule la
  // sauvegarde est différée jusqu'à l'arrêt du glissement.
  function debounce(fn, delayMs) {
    let timeoutId = null;
    return (...args) => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => fn(...args), delayMs);
    };
  }
  const debouncedSaveSettings = debounce(saveSettings, 300);

  function injectStyle() {
    const styleEl = document.createElement('style');
    styleEl.id = 'kc-toolkit-style';
    styleEl.textContent = STYLE;
    document.head.appendChild(styleEl);
  }

  // --- Toast de bienvenue (affiché au premier chargement, puis rejouable via le menu) ---

  function showWelcomeToast() {
    const existing = document.getElementById('kc-toast');
    if (existing) existing.remove();

    const toast = document.createElement('div');
    toast.id = 'kc-toast';
    toast.setAttribute('role', 'status');
    toast.innerHTML = `
      <span id="kc-toast-status">Karmine Tool</span>
      <div id="kc-toast-body">
        <p id="kc-toast-title">${t('toast.title')}</p>
        <p id="kc-toast-text">${t('toast.text')}</p>
      </div>
      <div id="kc-toast-footer">
        <button id="kc-toast-close" type="button">${t('common.close')}</button>
      </div>
    `;
    document.body.appendChild(toast);

    requestAnimationFrame(() => {
      requestAnimationFrame(() => toast.classList.add('kc-visible'));
    });

    document.getElementById('kc-toast-close').addEventListener('click', () => {
      toast.classList.remove('kc-visible');
      setTimeout(() => toast.remove(), 500);
    });
  }

  // --- Calculateur XP ---
  //
  // Principe : on interroge périodiquement l'API auth-data pour relever
  // l'XP courant, on garde un historique local (fenêtre glissante de 12h,
  // remise à zéro si le niveau change), et on en déduit une vitesse
  // moyenne d'XP/heure pour estimer le temps restant avant le niveau
  // suivant. Comme le script ne tourne que pendant que l'onglet est
  // ouvert, la collecte s'interrompt si tu fermes la page.

  const XP_SAMPLE_KEY = 'kc_xp_samples_v1';
  const XP_SAMPLE_MAX_AGE_MS = 12 * 60 * 60 * 1000; // fenêtre de 12h
  const XP_MIN_SPAN_MS = 3 * 60 * 1000; // il faut au moins 3 min d'écart pour une estimation fiable
  const XP_POLL_INTERVAL_MS = 5 * 60 * 1000; // un relevé toutes les 5 min

  function loadXpSamples() {
    try {
      const raw = localStorage.getItem(XP_SAMPLE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch (err) {
      return [];
    }
  }

  function saveXpSamples(samples) {
    try {
      localStorage.setItem(XP_SAMPLE_KEY, JSON.stringify(samples));
    } catch (err) {
      // stockage indisponible (mode privé, quota...) : on continue sans historique
    }
  }

  function recordXpSample(levelInfo) {
    const now = Date.now();
    let samples = loadXpSamples();
    const last = samples[samples.length - 1];
    if (last && last.level !== levelInfo.level) {
      samples = []; // changement de niveau : on repart d'une base propre
    }
    samples.push({ t: now, level: levelInfo.level, xp: levelInfo.experience });
    samples = samples.filter((s) => now - s.t <= XP_SAMPLE_MAX_AGE_MS);
    saveXpSamples(samples);
    return samples;
  }

  function computeXpRatePerHour(samples) {
    if (samples.length < 2) return null;
    const first = samples[0];
    const last = samples[samples.length - 1];
    const elapsedMs = last.t - first.t;
    if (elapsedMs < XP_MIN_SPAN_MS) return null;
    const deltaXp = last.xp - first.xp;
    if (deltaXp <= 0) return null;
    return deltaXp / (elapsedMs / 3_600_000);
  }

  function formatDuration(hours) {
    if (!isFinite(hours) || hours < 0) return '—';
    const totalMinutes = Math.round(hours * 60);
    const days = Math.floor(totalMinutes / 1440);
    const hrs = Math.floor((totalMinutes % 1440) / 60);
    const mins = totalMinutes % 60;
    const parts = [];
    if (days > 0) parts.push(`${days}j`);
    if (days > 0 || hrs > 0) parts.push(`${hrs}h`);
    parts.push(`${mins}m`);
    return parts.join(' ');
  }

  const FETCH_TIMEOUT_MS = 10_000; // au-delà de 10s, on abandonne plutôt que d'attendre indéfiniment

  // Enveloppe commune pour les appels au jeu lui-même (même origine) :
  // délai maximal + vérification du statut HTTP avant de tenter de parser
  // en JSON (une page d'erreur ne parse pas proprement en JSON).
  function fetchJson(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    return fetch(url, { credentials: 'same-origin', signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`Requête échouée (statut ${res.status}) : ${url}`);
        return res.json();
      })
      .finally(() => clearTimeout(timeoutId));
  }

  function fetchAuthData() {
    return fetchJson('/api/v3/companies/auth-data/');
  }

  // --- Badges VWAP sur les contrats entrants ---
  //
  // Sur /headquarters/warehouse/incoming-contracts/, chaque contrat porte un
  // aria-label du type "Contrat entrant, 2000 Samoussa qualité 12, à 1340$
  // par unité, prix total 2680000$, de la part de fannnnnjh" — le nom de la
  // ressource est donné en toutes lettres (pas un ID), donc on le fait
  // correspondre à la liste des noms de ressources (déjà en cache pour les
  // Événements/Prix du marché) pour retrouver l'ID nécessaire au VWAP.

  const CONTRACT_ROW_SELECTOR = 'div[aria-label^="Contrat entrant"]';
  const CONTRACT_ARIA_REGEX = /Contrat entrant,\s*[\d\s]+\s+(.+?)\s+qualité\s*(\d+),\s*à\s*([\d.,]+)\$\s*par unité/i;

  const contractVwapCache = {}; // clé "realmId:resourceId" → { map: qualité→vwap, fetchedAt }
  const CONTRACT_VWAP_MAX_AGE_MS = 10 * 60 * 1000; // au-delà de 10 min, on redemande un VWAP frais
  let resourceKindByNameCache = null;
  let resourceKindByNameCacheRealm = null;

  function ensureResourceKindByName(realmId) {
    if (resourceKindByNameCache && resourceKindByNameCacheRealm === realmId) {
      return Promise.resolve(resourceKindByNameCache);
    }
    return fetchResourceNames(realmId).then((namesByKind) => {
      const byName = {};
      Object.keys(namesByKind).forEach((kind) => {
        byName[namesByKind[kind].trim().toLowerCase()] = parseInt(kind, 10);
      });
      resourceKindByNameCache = byName;
      resourceKindByNameCacheRealm = realmId;
      return byName;
    });
  }

  function parseContractAria(el) {
    const label = el.getAttribute('aria-label') || '';
    const match = label.match(CONTRACT_ARIA_REGEX);
    if (!match) return null;
    return {
      resourceName: match[1].trim(),
      quality: parseInt(match[2], 10),
      unitPrice: parseFloat(match[3].replace(',', '.')),
    };
  }

  function findUnitPriceElement(row, unitPrice) {
    // On cherche l'élément dont le prix affiché correspond à la valeur du
    // prix unitaire déjà extraite de l'aria-label — plus fiable que de
    // chercher un caractère précis, qui peut être coupé entre deux noeuds
    // de texte selon la mise en page. On ne se limite plus aux éléments
    // sans enfants : certaines lignes ont une icône de tendance (flèche)
    // à côté du prix, ce qui en fait un élément non-feuille.
    const candidates = Array.from(row.querySelectorAll('*')).filter((el) => {
      const text = el.textContent.trim();
      return text.length > 0 && text.length < 40;
    });
    let best = null;
    candidates.forEach((el) => {
      const match = el.textContent.trim().match(/\$?\s*([\d\s]+[.,]\d+|\d+)/);
      if (!match) return;
      const normalized = match[1].replace(/\s/g, '').replace(',', '.');
      const num = parseFloat(normalized);
      if (isNaN(num) || Math.abs(num - unitPrice) >= 0.5) return;
      // Parmi les correspondances, on garde la plus spécifique (texte le
      // plus court) pour éviter d'accrocher un conteneur trop large.
      if (!best || el.textContent.trim().length < best.textContent.trim().length) best = el;
    });
    if (!best) {
      console.warn(
        `[Karmine Tool] Aucune correspondance de prix trouvée (attendu ${unitPrice}). Textes candidats :`,
        candidates.map((el) => el.textContent.trim()).filter((t) => t)
      );
    }
    return best;
  }

  const contractVwapFetchesInFlight = new Set(); // évite de relancer un fetch déjà en cours pour la même ressource

  function applyContractVwapBadges(byName) {
    const realmId = currentRealmId == null ? 0 : currentRealmId;
    const rows = document.querySelectorAll(CONTRACT_ROW_SELECTOR);

    // Regroupées par ressource : on ne vérifie/rafraîchit la fraîcheur du
    // cache qu'une fois par ressource, pas une fois par ligne.
    const rowsByCacheKey = new Map();
    rows.forEach((row) => {
      const parsed = parseContractAria(row);
      if (!parsed) return;
      const resourceId = byName[parsed.resourceName.toLowerCase()];
      if (resourceId == null) return; // nom non reconnu dans le cache, on ignore plutôt que de deviner
      const cacheKey = `${realmId}:${resourceId}`;
      if (!rowsByCacheKey.has(cacheKey)) rowsByCacheKey.set(cacheKey, { resourceId, group: [] });
      rowsByCacheKey.get(cacheKey).group.push({ row, parsed });
    });

    rowsByCacheKey.forEach(({ resourceId, group }, cacheKey) => {
      const applyToGroup = (vwapMap, fetchedAt) => {
        group.forEach(({ row, parsed }) => {
          // Déjà rendue avec ces mêmes données : on ne recrée pas le badge
          // à chaque tick de 2s, seulement quand le VWAP a vraiment changé.
          if (row.dataset.kcVwapFetchedAt === String(fetchedAt)) return;
          row.dataset.kcVwapFetchedAt = String(fetchedAt);
          const existingBadge = row.querySelector('.kc-vwap-badge');
          if (existingBadge) existingBadge.remove();

          const vwap = vwapMap[parsed.quality];
          if (vwap == null || vwap <= 0) return;
          const diffPct = ((parsed.unitPrice - vwap) / vwap) * 100;
          if (Math.abs(diffPct) < VWAP_BADGE_THRESHOLD_PCT) return;
          const badge = document.createElement('a');
          badge.href = `https://simcotools.com/fr/market/${realmId}/${resourceId}`;
          badge.target = '_blank';
          badge.rel = 'noopener noreferrer';
          badge.className = `kc-vwap-badge ${diffPct < 0 ? 'kc-vwap-cheap' : 'kc-vwap-expensive'}`;
          badge.textContent = `${diffPct < 0 ? '🟢' : '🔴'} ${diffPct > 0 ? '+' : ''}${diffPct.toFixed(0)}%`;
          badge.title = t('vwap.tooltipContract', { quality: parsed.quality, vwap: vwap.toFixed(3) });
          const anchor = findUnitPriceElement(row, parsed.unitPrice);
          if (anchor) {
            // Positionnement absolu calculé depuis la position réelle du prix
            // à l'écran : la ligne semble utiliser une mise en page grille/
            // flex qui replace tout enfant inséré à la fin, peu importe où on
            // l'insère dans le DOM. On contourne ça en superposant le badge
            // directement aux bonnes coordonnées plutôt que de compter sur
            // l'ordre normal du flux.
            const rowPosition = getComputedStyle(row).position;
            if (rowPosition === 'static') row.style.position = 'relative';
            badge.style.position = 'absolute';
            const anchorRect = anchor.getBoundingClientRect();
            const rowRect = row.getBoundingClientRect();
            badge.style.left = `${Math.round(anchorRect.right - rowRect.left + 6)}px`;
            badge.style.top = `${Math.round(anchorRect.top - rowRect.top + (anchorRect.height - 16) / 2)}px`;
            row.appendChild(badge);
          } else {
            row.appendChild(badge); // repli si le prix n'est pas retrouvé dans le DOM
          }
        });
      };

      const cached = contractVwapCache[cacheKey];
      const isFresh = cached && Date.now() - cached.fetchedAt < CONTRACT_VWAP_MAX_AGE_MS;
      if (isFresh) {
        applyToGroup(cached.map, cached.fetchedAt);
      } else if (!contractVwapFetchesInFlight.has(cacheKey)) {
        contractVwapFetchesInFlight.add(cacheKey);
        fetchVwapMap(realmId, resourceId)
          .then((vwapMap) => {
            const fetchedAt = Date.now();
            contractVwapCache[cacheKey] = { map: vwapMap, fetchedAt };
            applyToGroup(vwapMap, fetchedAt);
          })
          .catch((err) => console.error('[Karmine Tool] Échec du VWAP pour un contrat entrant :', err))
          .finally(() => contractVwapFetchesInFlight.delete(cacheKey));
      }
    });
  }

  function checkIncomingContractsPage() {
    if (!location.pathname.includes('/warehouse/incoming-contracts/')) return;
    if (currentRealmId == null) return; // pas encore prêt : on retentera au prochain cycle
    ensureResourceKindByName(currentRealmId).then((byName) => applyContractVwapBadges(byName));
  }

  // --- Prix du marché (API native market-ticker + noms via SimcoTools) ---

  function fetchMarketTicker(realmId) {
    return fetchJson(`/api/v3/market-ticker/${realmId}/`);
  }

  function formatTickerPrice(price) {
    const decimals = price < 10 ? 3 : 2;
    return price.toLocaleString(localeTag(), { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  const pricesState = { items: [], search: '', sort: 'name_asc' };

  function renderPricesList() {
    const body = document.getElementById('kc-prices-body');
    if (!body) return;
    const search = pricesState.search.trim().toLowerCase();
    let items = pricesState.items.filter((it) => it.name.toLowerCase().includes(search));

    const sorters = {
      name_asc: (a, b) => a.name.localeCompare(b.name),
      name_desc: (a, b) => b.name.localeCompare(a.name),
      price_desc: (a, b) => b.price - a.price,
      price_asc: (a, b) => a.price - b.price,
    };
    items = items.slice().sort(sorters[pricesState.sort] || sorters.name_asc);

    if (items.length === 0) {
      body.innerHTML = `<p id="kc-prices-empty">${t('prices.noMatch')}</p>`;
      return;
    }
    body.innerHTML = `
      <table class="kc-prices-table">
        <thead>
          <tr>
            <th>${t('prices.colResource')}</th>
            <th>${t('prices.colPrice')}</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          ${items
            .map((it) => {
              const realmId = currentRealmId == null ? 0 : currentRealmId;
              const url = `https://simcotools.com/fr/market/${realmId}/${it.kind}`;
              return `
                <tr>
                  <td class="kc-price-resource">
                    <a href="${url}" target="_blank" rel="noopener noreferrer">${escapeHtml(it.name)}</a>
                  </td>
                  <td class="kc-price-value">$${formatTickerPrice(it.price)}</td>
                  <td class="kc-price-trend ${it.isUp ? 'kc-positive' : 'kc-negative'}">${it.isUp ? '↗' : '↘'}</td>
                </tr>
              `;
            })
            .join('')}
        </tbody>
      </table>
    `;
  }

  let pricesRefreshInFlight = false;

  function refreshMarketPrices() {
    if (pricesRefreshInFlight) return Promise.resolve(); // un rafraîchissement est déjà en cours, on ignore ce nouveau clic
    const body = document.getElementById('kc-prices-body');
    if (body) body.innerHTML = `<p id="kc-prices-empty">${t('common.loading')}</p>`;
    if (currentRealmId == null) {
      if (body) body.innerHTML = `<p id="kc-prices-empty">${t('common.waitingGameData')}</p>`;
      return Promise.resolve();
    }
    pricesRefreshInFlight = true;
    return Promise.all([fetchMarketTicker(currentRealmId), fetchResourceNames(currentRealmId)])
      .then(([ticker, resourceNames]) => {
        pricesState.items = ticker.map((it) => ({
          kind: it.kind,
          name: resourceNames[it.kind] || t('prices.resourceFallback', { kind: it.kind }),
          price: it.price,
          isUp: it.is_up,
        }));
        renderPricesList();
      })
      .catch((err) => {
        console.error('[Karmine Tool] Échec du chargement des prix du marché :', err);
        if (body) body.innerHTML = `<p id="kc-prices-empty">${t('common.loadFailed')}</p>`;
      })
      .finally(() => {
        pricesRefreshInFlight = false;
      });
  }

  function createPricesPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-prices-panel';
    panel.setAttribute('role', 'status');
    panel.innerHTML = `
      <span id="kc-prices-status">Karmine Tool — ${t('prices.title')}</span>
      <p id="kc-prices-hint">${t('prices.hint')}</p>
      <div id="kc-prices-controls">
        <input type="text" id="kc-prices-search" placeholder="${t('prices.searchPlaceholder')}" />
        <select id="kc-prices-sort">
          <option value="name_asc">${t('prices.sortNameAsc')}</option>
          <option value="name_desc">${t('prices.sortNameDesc')}</option>
          <option value="price_desc">${t('prices.sortPriceDesc')}</option>
          <option value="price_asc">${t('prices.sortPriceAsc')}</option>
        </select>
      </div>
      <div id="kc-prices-body">
        <p id="kc-prices-empty">${t('prices.openToLoad')}</p>
      </div>
      <div id="kc-prices-footer">
        <button id="kc-prices-refresh" type="button">${t('common.refresh')}</button>
        <button id="kc-prices-close" type="button">${t('common.close')}</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#kc-prices-search').addEventListener('input', (e) => {
      pricesState.search = e.target.value;
      renderPricesList();
    });
    panel.querySelector('#kc-prices-sort').addEventListener('change', (e) => {
      pricesState.sort = e.target.value;
      renderPricesList();
    });
    panel.querySelector('#kc-prices-refresh').addEventListener('click', () => refreshMarketPrices());
    panel.querySelector('#kc-prices-close').addEventListener('click', () => closeAllPanels());
  }

  // --- Estimation instantanée basée sur les bâtiments actifs (DOM) ---
  //
  // Règle du jeu (documentée par la communauté, pas déduite de code tiers) :
  // - bâtiment de production/vente actif : 12 XP/h (repéré par sa note
  //   qualité à virgule, ex. "10,0", à côté de sa minuterie "Xh Ym")
  // - bâtiment en construction/amélioration : ~36,5 XP/h (minuterie
  //   "Xh Ym" mais sans note qualité)
  // - bâtiment récréatif (lac, château, parc) : 40 XP/h × son niveau,
  //   repéré par son format de minuterie en JOURS ("Xj Yh", cycle
  //   d'entretien de 7 jours) — le niveau n'étant affiché nulle part sur
  //   la carte, on le demande une fois à l'utilisateur et on le mémorise.
  const ACTIVE_BUILDING_XP_PER_HOUR = 12;
  const CONSTRUCTION_XP_PER_HOUR = 36.5;
  const RECREATIONAL_XP_PER_HOUR_PER_LEVEL = 40;
  const RECREATIONAL_LEVELS_KEY = 'kc_recreational_levels_v1';

  function loadRecreationalLevels() {
    // Clé = URL du bâtiment (id stable), pas sa position dans la liste.
    try {
      const raw = localStorage.getItem(RECREATIONAL_LEVELS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  function saveRecreationalLevel(id, level) {
    const levels = loadRecreationalLevels();
    levels[id] = level;
    try {
      localStorage.setItem(RECREATIONAL_LEVELS_KEY, JSON.stringify(levels));
    } catch (err) {
      // stockage indisponible : le niveau ne sera pas mémorisé, sans gravité
    }
  }

  function computeInstantXpRate() {
    // Chaque bâtiment porte un aria-label explicite et fiable, peu importe
    // le type de commerce (restaurant, magasin électronique, etc.) :
    // "R1: Ouvert, 2h, 53min" (actif), "R7: Amélioration, 7h, 16min"
    // (construction), "Temple: Entretien, 118h, 54min" (récréatif). On se
    // base uniquement là-dessus — bien plus fiable qu'un repérage visuel
    // (note qualité, format de durée) qui varie selon le type de commerce.
    const containers = Array.from(document.querySelectorAll('[class*="test-building"]'));

    let activeCount = 0;
    let constructionCount = 0;
    let recreationalCount = 0;
    const recreationalBuildings = []; // { id, name } — id = URL du bâtiment (/fr/b/{id}/), stable, pas la position dans la liste

    containers.forEach((container) => {
      const labeledEl = container.querySelector('[aria-label]');
      const actionLabel = labeledEl ? labeledEl.getAttribute('aria-label') || '' : '';
      if (/entretien/i.test(actionLabel)) {
        recreationalCount += 1;
        // Le nom du bâtiment est donné avant le ":" ("Temple: Entretien, ...").
        const nameMatch = actionLabel.match(/^([^:]+):/);
        const name = nameMatch ? nameMatch[1].trim() : t('xp.recreationalFallback', { index: recreationalCount });
        // L'URL du bâtiment (ex. "/fr/b/46896446/") sert d'identifiant stable
        // pour mémoriser son niveau — contrairement à sa position dans la
        // liste, qui peut changer si un bâtiment est ajouté/réordonné.
        const id = container.getAttribute('href') || `sans-id-${recreationalCount}`;
        recreationalBuildings.push({ id, name });
      } else if (/am[ée]lioration/i.test(actionLabel)) {
        constructionCount += 1;
      } else if (/ouvert/i.test(actionLabel)) {
        activeCount += 1;
      }
      // Sinon (aria-label absent ou non reconnu) : bâtiment ignoré plutôt
      // que deviné — mieux vaut un léger sous-comptage qu'une erreur.
    });

    if (containers.length === 0) return null; // pas sur la carte, ou rien détecté

    const storedLevels = loadRecreationalLevels();
    let recreationalXpPerHour = 0;
    recreationalBuildings.forEach((b) => {
      const level = storedLevels[b.id] || 1; // niveau 1 par défaut tant que non renseigné
      recreationalXpPerHour += level * RECREATIONAL_XP_PER_HOUR_PER_LEVEL;
    });

    const xpPerHour =
      activeCount * ACTIVE_BUILDING_XP_PER_HOUR + constructionCount * CONSTRUCTION_XP_PER_HOUR + recreationalXpPerHour;
    return { activeCount, constructionCount, recreationalCount, recreationalBuildings, xpPerHour };
  }

  const LAST_INSTANT_ESTIMATE_KEY = 'kc_last_instant_estimate_v1';
  const LAST_INSTANT_ESTIMATE_MAX_AGE_MS = 3 * 60 * 60 * 1000; // au-delà de 3h, trop périmé pour être affiché

  function saveLastInstantEstimate(instant) {
    try {
      localStorage.setItem(LAST_INSTANT_ESTIMATE_KEY, JSON.stringify({ ...instant, at: Date.now() }));
    } catch (err) {
      // stockage indisponible : pas de cache, sans gravité
    }
  }

  function loadLastInstantEstimate() {
    try {
      const raw = localStorage.getItem(LAST_INSTANT_ESTIMATE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (Date.now() - parsed.at > LAST_INSTANT_ESTIMATE_MAX_AGE_MS) return null;
      return parsed;
    } catch (err) {
      return null;
    }
  }

  let xpRefreshInFlight = false;

  function refreshXpData() {
    if (xpRefreshInFlight) return Promise.resolve(); // un rafraîchissement est déjà en cours, on ignore ce nouveau clic
    xpRefreshInFlight = true;
    return fetchAuthData()
      .then((data) => {
        currentRealmId = data.authCompany.realmId; // réutilisé par le module VWAP, jamais redemandé
        const samples = recordXpSample(data.levelInfo);
        const instant = computeInstantXpRate();
        if (instant) {
          saveLastInstantEstimate(instant);
          renderXpPanel(data.levelInfo, {
            xpPerHour: instant.xpPerHour,
            source: 'instant',
            activeCount: instant.activeCount,
            constructionCount: instant.constructionCount,
            recreationalCount: instant.recreationalCount,
            recreationalBuildings: instant.recreationalBuildings,
          });
          return;
        }
        const cached = loadLastInstantEstimate();
        if (cached) {
          renderXpPanel(data.levelInfo, {
            xpPerHour: cached.xpPerHour,
            source: 'cached',
            activeCount: cached.activeCount,
            constructionCount: cached.constructionCount,
            recreationalCount: cached.recreationalCount,
            recreationalBuildings: cached.recreationalBuildings,
            at: cached.at,
          });
          return;
        }
        const measuredRate = computeXpRatePerHour(samples);
        renderXpPanel(data.levelInfo, measuredRate ? { xpPerHour: measuredRate, source: 'measured' } : null);
      })
      .catch((err) => {
        console.error('[Karmine Tool] Échec du rafraîchissement XP :', err);
      })
      .finally(() => {
        xpRefreshInFlight = false;
      });
  }

  function renderXpPanel(levelInfo, rateInfo) {
    lastKnownLevel = levelInfo.level;
    applyDynamicFavicon(lastKnownLevel);

    const panel = document.getElementById('kc-xp-panel');
    if (!panel) return;
    const locale = localeTag();

    const progressPct = Math.min(100, (levelInfo.experience / levelInfo.experienceToNextLevel) * 100);
    panel.querySelector('#kc-xp-level').textContent = t('xp.level', { level: levelInfo.level, levelName: levelInfo.levelName });
    panel.querySelector('#kc-xp-fill').style.width = `${progressPct.toFixed(1)}%`;
    panel.querySelector('#kc-xp-progress-text').textContent = t('xp.progress', {
      experience: levelInfo.experience.toLocaleString(locale),
      experienceToNextLevel: levelInfo.experienceToNextLevel.toLocaleString(locale),
      pct: progressPct.toFixed(1),
    });

    const rateEl = panel.querySelector('#kc-xp-rate');
    const etaEl = panel.querySelector('#kc-xp-eta');
    const recreationalEl = panel.querySelector('#kc-xp-recreational');
    if (rateInfo) {
      let rateLabel;
      if (rateInfo.source === 'instant' || rateInfo.source === 'cached') {
        const parts = [`${rateInfo.activeCount} ${rateInfo.activeCount > 1 ? t('xp.actives') : t('xp.active')}`];
        if (rateInfo.constructionCount > 0) {
          parts.push(`${rateInfo.constructionCount} ${t('xp.construction')}`);
        }
        if (rateInfo.recreationalCount > 0) {
          parts.push(`${rateInfo.recreationalCount} ${rateInfo.recreationalCount > 1 ? t('xp.recreationals') : t('xp.recreational')}`);
        }
        rateLabel = t('xp.rateInstant', { rate: rateInfo.xpPerHour.toLocaleString(locale), parts: parts.join(', ') });
        if (rateInfo.source === 'cached') {
          const ageMinutes = Math.round((Date.now() - rateInfo.at) / 60000);
          rateLabel += `<br><span class="kc-xp-stale">${t('xp.staleNote', { minutes: ageMinutes })}</span>`;
        }
      } else {
        rateLabel = t('xp.rateMeasured', { rate: Math.round(rateInfo.xpPerHour).toLocaleString(locale) });
      }
      rateEl.innerHTML = rateLabel;
      const remaining = levelInfo.experienceToNextLevel - levelInfo.experience;
      const etaHours = remaining / rateInfo.xpPerHour;
      etaEl.innerHTML = t('xp.etaLine', { duration: formatDuration(etaHours) });
    } else {
      rateEl.textContent = t('xp.unavailable');
      etaEl.textContent = t('xp.unavailableHint');
    }

    // Champs éditables pour le niveau des bâtiments récréatifs — non
    // détectable automatiquement, on le mémorise une fois saisi. Identifiés
    // par l'URL du bâtiment (id stable), pas par leur position dans la
    // liste, qui peut changer si un bâtiment est ajouté/réordonné.
    if (recreationalEl) {
      const count = rateInfo && (rateInfo.source === 'instant' || rateInfo.source === 'cached') ? rateInfo.recreationalCount : 0;
      if (count > 0) {
        const storedLevels = loadRecreationalLevels();
        // Repli pour un ancien format de cache (avant ce correctif) qui
        // n'avait que des noms, pas d'id stable — reste utilisable le temps
        // que le cache expire (3h) sans planter.
        const buildings =
          (rateInfo && rateInfo.recreationalBuildings) ||
          ((rateInfo && rateInfo.recreationalNames) || []).map((name, i) => ({ id: `legacy-${i}`, name }));
        recreationalEl.innerHTML =
          `<p class="kc-xp-recreational-label">${t('xp.recreationalLevelsLabel')}</p>` +
          buildings
            .map((b, i) => {
              const level = storedLevels[b.id] || 1;
              const label = b.name || t('xp.recreationalFallback', { index: i + 1 });
              return `
                <label class="kc-xp-recreational-row">
                  <span>${escapeHtml(label)}</span>
                  <input type="number" min="1" step="1" value="${level}" data-recreational-id="${escapeHtml(b.id)}" />
                </label>
              `;
            })
            .join('');
        recreationalEl.querySelectorAll('input[data-recreational-id]').forEach((input) => {
          input.addEventListener('change', (e) => {
            const id = e.target.getAttribute('data-recreational-id');
            const level = Math.max(1, parseInt(e.target.value, 10) || 1);
            saveRecreationalLevel(id, level);
            refreshXpData();
          });
        });
      } else {
        recreationalEl.innerHTML = '';
      }
    }
  }

  function createXpPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-xp-panel';
    panel.setAttribute('role', 'status');
    panel.innerHTML = `
      <span id="kc-xp-status">Karmine Tool — ${t('xp.title')}</span>
      <div id="kc-xp-body">
        <p id="kc-xp-level">${t('xp.levelPlaceholder')}</p>
        <div id="kc-xp-track"><div id="kc-xp-fill"></div></div>
        <p id="kc-xp-progress-text">${t('xp.progressPlaceholder')}</p>
        <p id="kc-xp-rate">${t('xp.ratePlaceholder')}</p>
        <p id="kc-xp-eta">${t('xp.etaPlaceholder')}</p>
        <div id="kc-xp-recreational"></div>
      </div>
      <div id="kc-xp-footer">
        <button id="kc-xp-refresh" type="button">${t('common.refresh')}</button>
        <button id="kc-xp-close" type="button">${t('common.close')}</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#kc-xp-refresh').addEventListener('click', () => refreshXpData());
    panel.querySelector('#kc-xp-close').addEventListener('click', () => closeAllPanels());
  }

  // --- Badges VWAP sur la Bourse ---
  //
  // Sur une page /market/resource/{id}/, chaque ligne d'annonce porte un
  // attribut aria-label du type "ordre de marché, prix $2,3, quantité 913,
  // qualité 0, offert par l'entreprise X" — un attribut d'accessibilité,
  // donc a priori plus stable qu'une classe CSS générée. On en extrait
  // prix/quantité/qualité sans avoir à déchiffrer l'icône d'étoile.
  //
  // On compare chaque prix au VWAP (prix moyen pondéré, API SimcoTools) de
  // la même qualité, et on affiche un badge si l'écart dépasse ±5%.

  const VWAP_BADGE_THRESHOLD_PCT = 1;
  const MARKET_ROW_SELECTOR = 'tr[aria-label*="ordre de march"]';
  const MARKET_ROW_ARIA_REGEX = /prix\s*\$([\d.,]+),\s*quantité\s*(\d+),\s*qualité\s*(\d+)/i;

  function getMarketResourceIdFromUrl() {
    const match = location.pathname.match(/\/market\/resource\/(\d+)/);
    return match ? parseInt(match[1], 10) : null;
  }

  function parseMarketRowAria(row) {
    const label = row.getAttribute('aria-label') || '';
    const match = label.match(MARKET_ROW_ARIA_REGEX);
    if (!match) return null;
    return {
      price: parseFloat(match[1].replace(',', '.')),
      quantity: parseInt(match[2], 10),
      quality: parseInt(match[3], 10),
    };
  }

  function fetchVwapMap(realmId, resourceId) {
    return gmFetchJson(`https://api.simcotools.com/v1/realms/${realmId}/market/vwaps/${resourceId}`).then((data) => {
      const list = Array.isArray(data) ? data : Array.isArray(data && data.vwaps) ? data.vwaps : [];
      const map = {};
      list.forEach((entry) => {
        const existing = map[entry.quality];
        // on garde la donnée la plus récente si plusieurs entrées pour la même qualité
        if (!existing || new Date(entry.datetime) > new Date(existing.datetime)) {
          map[entry.quality] = entry;
        }
      });
      const vwapByQuality = {};
      Object.keys(map).forEach((q) => {
        vwapByQuality[q] = map[q].vwap;
      });
      return vwapByQuality;
    });
  }

  // État partagé du VWAP affiché — inclut le realm (sinon un résidu d'un
  // autre royaume pourrait fausser l'affichage) et un horodatage (pour
  // rafraîchir périodiquement même si on reste longtemps sur la même
  // ressource, plutôt que de garder un VWAP figé indéfiniment).
  const vwapState = { resourceId: null, realmId: null, map: null, fetchedAt: 0 };
  const VWAP_MAX_AGE_MS = 10 * 60 * 1000; // au-delà de 10 min, on redemande un VWAP frais
  let vwapFetchToken = 0; // évite qu'une réponse arrivée en retard (navigation rapide entre ressources) n'écrase des données plus récentes

  function applyVwapBadges() {
    if (!vwapState.map) return;
    const rows = document.querySelectorAll(MARKET_ROW_SELECTOR);
    rows.forEach((row) => {
      if (row.dataset.kcVwapBadge) return;
      const parsed = parseMarketRowAria(row);
      if (!parsed) return;
      const vwap = vwapState.map[parsed.quality];
      if (vwap == null || vwap <= 0) return;

      const diffPct = ((parsed.price - vwap) / vwap) * 100;
      row.dataset.kcVwapBadge = '1';
      if (Math.abs(diffPct) < VWAP_BADGE_THRESHOLD_PCT) return; // écart trop faible, pas de badge

      const priceCell = row.querySelector('td.css-2qga7i') || row.querySelector('td:last-child');
      if (!priceCell) return;
      const badge = document.createElement('span');
      badge.className = `kc-vwap-badge ${diffPct < 0 ? 'kc-vwap-cheap' : 'kc-vwap-expensive'}`;
      badge.textContent = `${diffPct < 0 ? '🟢' : '🔴'} ${diffPct > 0 ? '+' : ''}${diffPct.toFixed(0)}%`;
      badge.title = t('vwap.tooltipMarket', { quality: parsed.quality, vwap: vwap.toFixed(3) });
      priceCell.appendChild(badge);
    });
  }

  function refreshVwapForResource(resourceId) {
    if (currentRealmId == null) return; // pas encore prêt (le calculateur XP n'a pas fini son premier appel) : on retentera
    const token = ++vwapFetchToken;
    fetchVwapMap(currentRealmId, resourceId)
      .then((map) => {
        if (token !== vwapFetchToken) return; // une navigation plus récente a déjà lancé une autre requête : on ignore cette réponse arrivée en retard
        vwapState.resourceId = resourceId;
        vwapState.realmId = currentRealmId;
        vwapState.map = map;
        vwapState.fetchedAt = Date.now();
        // Nouvelles données : on retire les badges déjà posés pour qu'ils
        // soient recalculés avec le VWAP à jour plutôt que de rester figés.
        document.querySelectorAll(MARKET_ROW_SELECTOR).forEach((row) => {
          delete row.dataset.kcVwapBadge;
          const existingBadge = row.querySelector('.kc-vwap-badge');
          if (existingBadge) existingBadge.remove();
        });
        applyVwapBadges();
      })
      .catch((err) => console.error('[Karmine Tool] Échec du chargement du VWAP :', err));
  }

  function checkMarketPage() {
    const resourceId = getMarketResourceIdFromUrl();
    if (resourceId == null) return;
    const isStale = vwapState.fetchedAt > 0 && Date.now() - vwapState.fetchedAt > VWAP_MAX_AGE_MS;
    if (resourceId !== vwapState.resourceId || currentRealmId !== vwapState.realmId || isStale) {
      refreshVwapForResource(resourceId);
    } else {
      applyVwapBadges(); // réapplique sur d'éventuelles nouvelles lignes (tick de prix, défilement) sans appel réseau
    }
  }

  // --- Événements (API native du jeu) ---
  //
  // api.simcotools.com est un domaine différent de simcompanies.com : un
  // fetch() classique serait bloqué par le CORS du navigateur. On utilise
  // GM_xmlhttpRequest, prévu pour ça par Tampermonkey, pour une API 100%
  // publique et documentée (aucune signature, aucun cookie nécessaire).

  function gmFetchJson(url) {
    return new Promise((resolve, reject) => {
      GM_xmlhttpRequest({
        method: 'GET',
        url,
        headers: { 'Accept-Language': 'fr' },
        timeout: FETCH_TIMEOUT_MS,
        onload: (res) => {
          if (res.status < 200 || res.status >= 300) {
            reject(new Error(`Requête échouée (statut ${res.status}) : ${url}`));
            return;
          }
          try {
            resolve(JSON.parse(res.responseText));
          } catch (err) {
            reject(err);
          }
        },
        onerror: () => reject(new Error(`Échec réseau : ${url}`)),
        ontimeout: () => reject(new Error(`Délai dépassé : ${url}`)),
      });
    });
  }

  // Cache des noms de ressources (id → nom), récupéré une fois via SimcoTools
  // et réutilisé — ce endpoint est simple (id + nom) donc peu de risque du
  // genre de surprises de nommage rencontrées ailleurs.
  let resourceNamesCache = null;
  let resourceNamesCacheRealm = null;

  function fetchResourceNames(realmId) {
    if (resourceNamesCache && resourceNamesCacheRealm === realmId) {
      return Promise.resolve(resourceNamesCache);
    }
    return gmFetchJson(`https://api.simcotools.com/v1/realms/${realmId}/resources?disable_pagination=true`).then((data) => {
      const list = Array.isArray(data) ? data : Array.isArray(data.resources) ? data.resources : [];
      const map = {};
      list.forEach((r) => {
        map[r.id] = r.name;
      });
      resourceNamesCache = map;
      resourceNamesCacheRealm = realmId;
      return map;
    });
  }

  function fetchMarketEvents(realmId) {
    return fetchJson(`/api/v3/encyclopedia/events/${realmId}/`).then((data) => (Array.isArray(data.events) ? data.events : []));
  }

  function formatDaysHoursOnly(totalHours) {
    if (!isFinite(totalHours) || totalHours < 0) return '—';
    const days = Math.floor(totalHours / 24);
    const hrs = Math.floor(totalHours % 24);
    return days > 0 ? `${days}j ${hrs}h` : `${hrs}h`;
  }

  function formatShortDate(dateStr) {
    return new Date(dateStr).toLocaleDateString(localeTag(), { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  function renderEventRow(event, resourceNames) {
    const now = Date.now();
    const untilMs = new Date(event.until).getTime();
    const hoursLeft = (untilMs - now) / 3_600_000;
    const modifier = event.speedModifier;
    const resourceName = resourceNames[event.kind] || t('events.resourceFallback', { kind: event.kind });
    const modifierClass = modifier > 0 ? 'kc-positive' : 'kc-negative';
    const modifierText = `${modifier > 0 ? '+' : ''}${modifier}%`;
    const isIngredient = loadSettings().hasRestaurants && RESTAURANT_INGREDIENT_IDS.has(event.kind);
    return `
      <tr class="kc-event-row">
        <td class="kc-event-resource">${escapeHtml(resourceName)}${isIngredient ? ' <span class="kc-event-tag">🍽️</span>' : ''}</td>
        <td class="kc-event-modifier ${modifierClass}">${modifierText}</td>
        <td class="kc-event-until">${formatDaysHoursOnly(hoursLeft)}</td>
        <td class="kc-event-since">${formatShortDate(event.since)}</td>
      </tr>
    `;
  }

  let lastFetchedEvents = [];
  let lastResourceNames = {};

  function renderEventsPanel(events, resourceNames) {
    const panel = document.getElementById('kc-events-panel');
    if (!panel) return;
    const body = panel.querySelector('#kc-events-body');
    const now = Date.now();
    const active = events
      .filter((e) => new Date(e.until).getTime() > now)
      .sort((a, b) => new Date(b.since) - new Date(a.since));

    if (active.length === 0) {
      body.innerHTML = `<p id="kc-events-empty">${t('events.none')}</p>`;
      return;
    }
    body.innerHTML = `
      <table class="kc-events-table">
        <thead>
          <tr>
            <th>${t('events.colResource')}</th>
            <th>${t('events.colModifier')}</th>
            <th>${t('events.colUntil')}</th>
            <th>${t('events.colSince')}</th>
          </tr>
        </thead>
        <tbody>
          ${active.map((e) => renderEventRow(e, resourceNames)).join('')}
        </tbody>
      </table>
    `;
  }

  let eventsRefreshInFlight = false;

  function refreshMarketEvents() {
    if (eventsRefreshInFlight) return Promise.resolve(); // un rafraîchissement est déjà en cours, on ignore ce nouveau clic
    const panel = document.getElementById('kc-events-panel');
    if (panel) {
      panel.querySelector('#kc-events-body').innerHTML = `<p id="kc-events-empty">${t('common.loading')}</p>`;
    }
    if (currentRealmId == null) {
      if (panel) {
        panel.querySelector('#kc-events-body').innerHTML = `<p id="kc-events-empty">${t('common.waitingGameData')}</p>`;
      }
      return Promise.resolve();
    }
    eventsRefreshInFlight = true;
    return Promise.all([fetchMarketEvents(currentRealmId), fetchResourceNames(currentRealmId)])
      .then(([events, resourceNames]) => {
        lastFetchedEvents = events;
        lastResourceNames = resourceNames;
        renderEventsPanel(events, resourceNames);
      })
      .catch((err) => {
        console.error('[Karmine Tool] Échec du chargement des événements marché :', err);
        if (panel) {
          panel.querySelector('#kc-events-body').innerHTML = `<p id="kc-events-empty">${t('common.loadFailed')}</p>`;
        }
      })
      .finally(() => {
        eventsRefreshInFlight = false;
      });
  }

  function createEventsPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-events-panel';
    panel.setAttribute('role', 'status');
    panel.innerHTML = `
      <span id="kc-events-status">Karmine Tool — ${t('events.title')}</span>
      <div id="kc-events-body">
        <p id="kc-events-empty">${t('events.openToLoad')}</p>
      </div>
      <div id="kc-events-footer">
        <button id="kc-events-refresh" type="button">${t('common.refresh')}</button>
        <button id="kc-events-close" type="button">${t('common.close')}</button>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#kc-events-refresh').addEventListener('click', () => refreshMarketEvents());
    panel.querySelector('#kc-events-close').addEventListener('click', () => closeAllPanels());
  }

  // --- Options ---

  // Liste des couleurs personnalisables du chat — un tableau plutôt que du
  // HTML répété à la main, plus simple à faire évoluer.
  const CHAT_COLOR_FIELDS = [
    { id: 'own-bg', settingKey: 'chatOwnBubbleColor', labelKey: 'chatColor.ownBg' },
    { id: 'own-text', settingKey: 'chatOwnTextColor', labelKey: 'chatColor.ownText' },
    { id: 'other-bg', settingKey: 'chatOtherBubbleColor', labelKey: 'chatColor.otherBg' },
    { id: 'other-text', settingKey: 'chatOtherBubbleTextColor', labelKey: 'chatColor.otherText' },
    { id: 'conv-bg', settingKey: 'chatConversationBgColor', labelKey: 'chatColor.convBg' },
    { id: 'sender-name', settingKey: 'chatSenderNameColor', labelKey: 'chatColor.senderName' },
    { id: 'timestamp', settingKey: 'chatTimestampColor', labelKey: 'chatColor.timestamp' },
    { id: 'section-header', settingKey: 'chatSectionHeaderColor', labelKey: 'chatColor.sectionHeader' },
    { id: 'input-bg', settingKey: 'chatInputBgColor', labelKey: 'chatColor.inputBg' },
    { id: 'input-text', settingKey: 'chatInputTextColor', labelKey: 'chatColor.inputText' },
    { id: 'ticker-scrollbar', settingKey: 'resourceTickerScrollbarColor', labelKey: 'chatColor.tickerScrollbar' },
    { id: 'page-bg', settingKey: 'pageBgColor', labelKey: 'chatColor.pageBg' },
    { id: 'top-bar', settingKey: 'topBarColor', labelKey: 'chatColor.topBar' },
    { id: 'bottom-bar', settingKey: 'bottomBarColor', labelKey: 'chatColor.bottomBar' },
    { id: 'stat-bar-text', settingKey: 'statBarTextColor', labelKey: 'chatColor.statBarText' },
    { id: 'mention-bg', settingKey: 'mentionBgColor', labelKey: 'chatColor.mentionBg' },
    { id: 'active-contact-bg', settingKey: 'activeContactBgColor', labelKey: 'chatColor.activeContactBg' },
    { id: 'mention-link', settingKey: 'mentionLinkColor', labelKey: 'chatColor.mentionLink' },
    { id: 'scrollbar', settingKey: 'chatScrollbarColor', labelKey: 'chatColor.scrollbar' },
  ];

  function createOptionsPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-options-panel';
    panel.setAttribute('role', 'status');
    const settings = loadSettings();
    panel.innerHTML = `
      <span id="kc-options-status">Karmine Tool — ${t('options.title')}</span>
      <div id="kc-options-body">
        <label class="kc-options-row">
          <input type="checkbox" id="kc-options-restaurants" ${settings.hasRestaurants ? 'checked' : ''} />
          <span>${t('options.restaurants')}</span>
        </label>
        <p class="kc-options-hint">${t('options.restaurantsHint')}</p>
        <label class="kc-options-row" style="margin-top:14px;justify-content:space-between;">
          <span>${t('options.language')}</span>
        </label>
        <select id="kc-options-language" style="margin-top:8px;width:100%;">
          <option value="fr" ${settings.language === 'fr' ? 'selected' : ''}>Français</option>
          <option value="en" ${settings.language === 'en' ? 'selected' : ''}>English</option>
        </select>
        <p class="kc-options-hint">${t('options.languageHint')}</p>
      </div>
      <div id="kc-options-footer">
        <button id="kc-options-close" type="button">${t('common.close')}</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#kc-options-restaurants').addEventListener('change', (e) => {
      saveSettings({ hasRestaurants: e.target.checked });
      renderEventsPanel(lastFetchedEvents, lastResourceNames); // ré-affiche instantanément sans nouvel appel réseau
    });

    panel.querySelector('#kc-options-language').addEventListener('change', (e) => {
      saveSettings({ language: e.target.value });
      currentLanguage = e.target.value;
      rebuildAllPanelsForLanguageChange();
    });

    panel.querySelector('#kc-options-close').addEventListener('click', () => closeAllPanels());
  }

  // --- Personnalisation (filtre couleur, favicon, couleurs du chat, fond d'écran) ---

  // Export/import : une mise à jour du jeu (ou un nettoyage du navigateur)
  // peut vider le stockage local et donc tous les réglages de
  // personnalisation d'un coup. On garde ces trois clés volontairement
  // séparées de la logique normale de sauvegarde — c'est une vraie
  // sauvegarde manuelle sur le poste de l'utilisateur, pas juste un
  // rafraîchissement de plus.
  const EXPORT_STORAGE_KEYS = [SETTINGS_KEY, RECREATIONAL_LEVELS_KEY, CUSTOM_BG_KEY];

  function exportCustomizationSettings() {
    const data = {};
    EXPORT_STORAGE_KEYS.forEach((key) => {
      try {
        const value = localStorage.getItem(key);
        if (value != null) data[key] = value;
      } catch (err) {
        // stockage indisponible pour cette clé : on continue avec les autres
      }
    });
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `karmine-tool-reglages-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  function importCustomizationSettingsFile(file, onDone) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      let data;
      try {
        data = JSON.parse(reader.result);
      } catch (err) {
        alert(t('alert.importInvalidFile'));
        return;
      }
      let restoredAny = false;
      EXPORT_STORAGE_KEYS.forEach((key) => {
        if (data[key] == null) return;
        try {
          localStorage.setItem(key, data[key]);
          restoredAny = true;
        } catch (err) {
          // quota dépassé sur cette clé précise : on continue avec les autres
        }
      });
      if (!restoredAny) {
        alert(t('alert.importNothingFound'));
        return;
      }
      applyColorFilter();
      applyChatColors();
      applyCustomBackground();
      applyMapOverlayVisibility();
      applyDynamicFavicon(lastKnownLevel);
      if (onDone) onDone();
    };
    reader.onerror = () => alert(t('alert.importReadFailed'));
    reader.readAsText(file);
  }

  function createCustomizationPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-customization-panel';
    panel.setAttribute('role', 'status');
    const settings = loadSettings();
    const hasCustomBg = !!loadCustomBackground();
    panel.innerHTML = `
      <span id="kc-customization-status">Karmine Tool — ${t('customization.title')}</span>
      <div id="kc-customization-body">
        <div id="kc-customization-backup-row">
          <button id="kc-customization-export" type="button" class="kc-options-reset-btn">${t('customization.export')}</button>
          <label id="kc-customization-import-label" class="kc-options-reset-btn">
            ${t('customization.import')}
            <input type="file" id="kc-customization-import" accept="application/json" />
          </label>
        </div>
        <p class="kc-options-hint">${t('customization.backupHint')}</p>
        <label class="kc-options-row">
          <input type="checkbox" id="kc-customization-color-filter" ${settings.colorFilterEnabled ? 'checked' : ''} />
          <span>${t('customization.colorFilter')}</span>
        </label>
        <div class="kc-options-hue-row">
          <input
            type="range"
            id="kc-customization-hue"
            min="0"
            max="360"
            step="1"
            value="${settings.colorFilterHue}"
            ${settings.colorFilterEnabled ? '' : 'disabled'}
          />
          <span id="kc-customization-hue-value">${settings.colorFilterHue}°</span>
        </div>
        <p class="kc-options-hint">${t('customization.colorFilterHint')}</p>
        <label class="kc-options-row">
          <input type="checkbox" id="kc-customization-favicon" ${settings.faviconEnabled ? 'checked' : ''} />
          <span>${t('customization.favicon')}</span>
        </label>
        <p class="kc-options-hint">${t('customization.faviconHint')}</p>
        <label class="kc-options-row">
          <input type="checkbox" id="kc-customization-building-overlay" ${settings.hideBuildingOverlay ? 'checked' : ''} />
          <span>${t('customization.hideBuildingOverlay')}</span>
        </label>
        <p class="kc-options-hint">${t('customization.hideBuildingOverlayHint')}</p>
        <label class="kc-options-row">
          <input type="checkbox" id="kc-customization-chat-colors" ${settings.chatColorsEnabled ? 'checked' : ''} />
          <span>${t('customization.chatColors')}</span>
        </label>
        <div class="kc-options-chat-colors-grid">
          ${CHAT_COLOR_FIELDS.map(
            (f) => `
              <label class="kc-options-color-row">
                <span>${t(f.labelKey)}</span>
                <span class="kc-options-color-controls">
                  <input
                    type="color"
                    id="kc-customization-chat-${f.id}"
                    data-setting-key="${f.settingKey}"
                    value="${settings[f.settingKey]}"
                    ${settings.chatColorsEnabled ? '' : 'disabled'}
                  />
                  <input
                    type="range"
                    min="0"
                    max="100"
                    step="1"
                    class="kc-options-alpha-slider"
                    data-alpha-key="${f.settingKey}Alpha"
                    value="${settings[`${f.settingKey}Alpha`]}"
                    title="${t('common.opacity')}"
                    ${settings.chatColorsEnabled ? '' : 'disabled'}
                  />
                </span>
              </label>
            `
          ).join('')}
        </div>
        <button id="kc-customization-chat-reset" type="button" class="kc-options-reset-btn" ${settings.chatColorsEnabled ? '' : 'disabled'}>
          ${t('customization.resetColors')}
        </button>
        <p class="kc-options-hint">${t('customization.chatColorsHint')}</p>
        <label class="kc-options-row" style="margin-top:14px;">
          <span>${t('customization.customBg')}</span>
        </label>
        <input type="file" id="kc-customization-bg-file" accept="image/*" style="margin-top:8px;width:100%;font-size:11px;color:#C7D0DB;" />
        <button id="kc-customization-bg-remove" type="button" class="kc-options-reset-btn" ${hasCustomBg ? '' : 'disabled'} style="margin-top:8px;">
          ${t('customization.removeImage')}
        </button>
        <p class="kc-options-hint">${t('customization.customBgHint')}</p>
      </div>
      <div id="kc-customization-footer">
        <button id="kc-customization-close" type="button">${t('common.close')}</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#kc-customization-export').addEventListener('click', () => exportCustomizationSettings());
    panel.querySelector('#kc-customization-import').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      importCustomizationSettingsFile(file, () => {
        // Les valeurs affichées (cases, couleurs, curseurs) datent de la
        // création du panneau : le plus simple et le plus sûr après un
        // import est de reconstruire le panneau à neuf avec les valeurs
        // fraîchement restaurées, plutôt que de mettre à jour chaque champ
        // un par un.
        panel.remove();
        createCustomizationPanel();
        openPanel('kc-customization-panel');
      });
    });

    panel.querySelector('#kc-customization-bg-file').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      handleCustomBackgroundFile(file, () => {
        panel.querySelector('#kc-customization-bg-remove').disabled = false;
      });
    });
    panel.querySelector('#kc-customization-bg-remove').addEventListener('click', () => {
      removeCustomBackground();
      applyCustomBackground();
      panel.querySelector('#kc-customization-bg-remove').disabled = true;
      panel.querySelector('#kc-customization-bg-file').value = '';
    });

    const hueInput = panel.querySelector('#kc-customization-hue');
    const hueValueLabel = panel.querySelector('#kc-customization-hue-value');

    panel.querySelector('#kc-customization-color-filter').addEventListener('change', (e) => {
      saveSettings({ colorFilterEnabled: e.target.checked });
      hueInput.disabled = !e.target.checked;
      applyColorFilter();
    });
    hueInput.addEventListener('input', (e) => {
      hueValueLabel.textContent = `${e.target.value}°`;
      debouncedSaveSettings({ colorFilterHue: parseInt(e.target.value, 10) });
      applyColorFilter();
    });

    panel.querySelector('#kc-customization-favicon').addEventListener('change', (e) => {
      saveSettings({ faviconEnabled: e.target.checked });
      applyDynamicFavicon(lastKnownLevel);
    });

    panel.querySelector('#kc-customization-building-overlay').addEventListener('change', (e) => {
      saveSettings({ hideBuildingOverlay: e.target.checked });
      applyMapOverlayVisibility();
    });

    const chatColorInputs = panel.querySelectorAll('.kc-options-chat-colors-grid input[data-setting-key]');
    const chatAlphaInputs = panel.querySelectorAll('.kc-options-chat-colors-grid input[data-alpha-key]');
    const chatResetBtn = panel.querySelector('#kc-customization-chat-reset');

    panel.querySelector('#kc-customization-chat-colors').addEventListener('change', (e) => {
      saveSettings({ chatColorsEnabled: e.target.checked });
      chatColorInputs.forEach((input) => (input.disabled = !e.target.checked));
      chatAlphaInputs.forEach((input) => (input.disabled = !e.target.checked));
      chatResetBtn.disabled = !e.target.checked;
      applyChatColors();
    });
    chatColorInputs.forEach((input) => {
      input.addEventListener('input', (e) => {
        debouncedSaveSettings({ [e.target.dataset.settingKey]: e.target.value });
        applyChatColors();
      });
    });
    chatAlphaInputs.forEach((input) => {
      input.addEventListener('input', (e) => {
        debouncedSaveSettings({ [e.target.dataset.alphaKey]: parseInt(e.target.value, 10) });
        applyChatColors();
      });
    });
    chatResetBtn.addEventListener('click', () => {
      const defaults = {};
      CHAT_COLOR_FIELDS.forEach((f) => {
        defaults[f.settingKey] = DEFAULT_SETTINGS[f.settingKey];
        defaults[`${f.settingKey}Alpha`] = DEFAULT_SETTINGS[`${f.settingKey}Alpha`];
      });
      saveSettings(defaults);
      chatColorInputs.forEach((input) => {
        input.value = defaults[input.dataset.settingKey];
      });
      chatAlphaInputs.forEach((input) => {
        input.value = defaults[input.dataset.alphaKey];
      });
      applyChatColors();
    });

    panel.querySelector('#kc-customization-close').addEventListener('click', () => closeAllPanels());
  }

  // --- Statistiques du royaume (API publique SimcoTools) ---

  function getPhaseLabels() {
    return {
      boom: t('realmStats.phaseBoom'),
      expansion: t('realmStats.phaseBoom'),
      normal: t('realmStats.phaseNormal'),
      recession: t('realmStats.phaseRecession'),
    };
  }
  const PHASE_CLASSES = {
    boom: 'kc-phase-boom',
    expansion: 'kc-phase-boom',
    normal: 'kc-phase-normal',
    recession: 'kc-phase-recession',
  };

  function fetchRealmBuildingStats(realmId) {
    return gmFetchJson(`https://api.simcotools.com/v1/realms/${realmId}/stats/buildings?disable_pagination=true`);
  }

  function fetchRealmPhase(realmId) {
    return gmFetchJson(`https://api.simcotools.com/v1/realms/${realmId}/phases`).then((data) => {
      // ranges est trié du plus récent au plus ancien : ranges[0] est la
      // période en cours, celle qui contient la date d'aujourd'hui.
      if (Array.isArray(data.ranges) && data.ranges.length > 0) return data.ranges[0].phase;
      return null;
    });
  }

  const realmStatsState = { buildings: [], totalBuildings: 0, phase: null, search: '', sort: 'count_desc' };

  function renderRealmStatsList() {
    const list = document.getElementById('kc-realmstats-list');
    if (!list) return;
    const search = realmStatsState.search.trim().toLowerCase();
    let items = realmStatsState.buildings.filter((b) => b.name.toLowerCase().includes(search));

    const sorters = {
      count_desc: (a, b) => b.count - a.count,
      count_asc: (a, b) => a.count - b.count,
      name_asc: (a, b) => a.name.localeCompare(b.name),
      name_desc: (a, b) => b.name.localeCompare(a.name),
    };
    items = items.slice().sort(sorters[realmStatsState.sort] || sorters.count_desc);

    if (items.length === 0) {
      list.innerHTML = `<p id="kc-realmstats-empty">${t('realmStats.noMatch')}</p>`;
      return;
    }
    const maxCount = Math.max(...items.map((b) => b.count), 1);
    list.innerHTML = items
      .map((b) => {
        const pct = (b.count / maxCount) * 100;
        const proportionPct = (b.proportion * 100).toFixed(1);
        return `
          <div class="kc-realmstats-row">
            <div class="kc-realmstats-row-top">
              <span class="kc-realmstats-row-name">${escapeHtml(b.name)}</span>
              <span class="kc-realmstats-row-value">${proportionPct}% (${b.count.toLocaleString(localeTag())})</span>
            </div>
            <div class="kc-realmstats-bar-track">
              <div class="kc-realmstats-bar-fill" style="width:${pct.toFixed(1)}%"></div>
            </div>
          </div>
        `;
      })
      .join('');
  }

  function renderRealmStatsSummary() {
    const totalEl = document.getElementById('kc-realmstats-total');
    const phaseEl = document.getElementById('kc-realmstats-phase');
    if (totalEl) {
      totalEl.innerHTML = t('realmStats.total', { count: `<strong>${realmStatsState.totalBuildings.toLocaleString(localeTag())}</strong>` });
    }
    if (phaseEl) {
      if (realmStatsState.phase) {
        const key = realmStatsState.phase.toLowerCase();
        const phaseLabels = getPhaseLabels();
        phaseEl.textContent = phaseLabels[key] || realmStatsState.phase;
        phaseEl.className = `kc-phase-badge ${PHASE_CLASSES[key] || 'kc-phase-normal'}`;
        phaseEl.style.display = '';
      } else {
        phaseEl.style.display = 'none';
      }
    }
  }

  let realmStatsRefreshInFlight = false;

  function refreshRealmStats() {
    if (realmStatsRefreshInFlight) return; // un rafraîchissement est déjà en cours, on ignore ce nouveau clic
    const list = document.getElementById('kc-realmstats-list');
    if (list) list.innerHTML = `<p id="kc-realmstats-empty">${t('common.loading')}</p>`;
    if (currentRealmId == null) {
      if (list) list.innerHTML = `<p id="kc-realmstats-empty">${t('common.waitingGameData')}</p>`;
      return;
    }
    realmStatsRefreshInFlight = true;
    Promise.all([fetchRealmBuildingStats(currentRealmId), fetchRealmPhase(currentRealmId)])
      .then(([buildingStats, phase]) => {
        realmStatsState.buildings = buildingStats.buildings || [];
        realmStatsState.totalBuildings = buildingStats.total_buildings ?? buildingStats.totalBuildings ?? 0;
        realmStatsState.phase = phase;
        renderRealmStatsSummary();
        renderRealmStatsList();
      })
      .catch((err) => {
        console.error('[Karmine Tool] Échec du chargement des statistiques du royaume :', err);
        if (list) list.innerHTML = `<p id="kc-realmstats-empty">${t('common.loadFailed')}</p>`;
      })
      .finally(() => {
        realmStatsRefreshInFlight = false;
      });
  }

  function createRealmStatsPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-realmstats-panel';
    panel.setAttribute('role', 'status');
    panel.innerHTML = `
      <span id="kc-realmstats-status">Karmine Tool — ${t('realmStats.title')}</span>
      <div id="kc-realmstats-summary">
        <span id="kc-realmstats-total">—</span>
        <span id="kc-realmstats-phase" class="kc-phase-badge kc-phase-normal" style="display:none"></span>
      </div>
      <div id="kc-realmstats-controls">
        <input type="text" id="kc-realmstats-search" placeholder="${t('realmStats.searchPlaceholder')}" />
        <select id="kc-realmstats-sort">
          <option value="count_desc">${t('realmStats.sortCountDesc')}</option>
          <option value="count_asc">${t('realmStats.sortCountAsc')}</option>
          <option value="name_asc">${t('realmStats.sortNameAsc')}</option>
          <option value="name_desc">${t('realmStats.sortNameDesc')}</option>
        </select>
      </div>
      <div id="kc-realmstats-list">
        <p id="kc-realmstats-empty">${t('realmStats.openToLoad')}</p>
      </div>
      <div id="kc-realmstats-footer">
        <button id="kc-realmstats-refresh" type="button">${t('common.refresh')}</button>
        <button id="kc-realmstats-close" type="button">${t('common.close')}</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#kc-realmstats-search').addEventListener('input', (e) => {
      realmStatsState.search = e.target.value;
      renderRealmStatsList();
    });
    panel.querySelector('#kc-realmstats-sort').addEventListener('change', (e) => {
      realmStatsState.sort = e.target.value;
      renderRealmStatsList();
    });
    panel.querySelector('#kc-realmstats-refresh').addEventListener('click', () => refreshRealmStats());
    panel.querySelector('#kc-realmstats-close').addEventListener('click', () => closeAllPanels());
  }

  // --- Saisons (données statiques, confirmées via l'encyclopédie du jeu) ---

  function renderSeasonCard(season) {
    const realmId = currentRealmId == null ? 0 : currentRealmId;
    const url = `https://www.simcompanies.com/fr/encyclopedia/${realmId}/${season.slug}/${season.key}/`;
    const dates = season.datesKey ? t(season.datesKey) : '';
    return `
      <a class="kc-season-card" href="${url}" target="_blank" rel="noopener noreferrer">
        <span class="kc-season-emoji">${season.emoji}</span>
        <div class="kc-season-info">
          <span class="kc-season-name">${t(season.nameKey)}</span>
          ${dates ? `<span class="kc-season-dates">${dates}</span>` : ''}
        </div>
      </a>
    `;
  }

  function createSeasonsPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-seasons-panel';
    panel.setAttribute('role', 'status');
    panel.innerHTML = `
      <span id="kc-seasons-status">Karmine Tool — ${t('seasons.title')}</span>
      <div id="kc-seasons-body">
        <p class="kc-seasons-group-title">${t('seasons.production')}</p>
        ${SEASONS_DATA.production.map(renderSeasonCard).join('')}
        <p class="kc-seasons-group-title">${t('seasons.retail')}</p>
        ${SEASONS_DATA.retail.map(renderSeasonCard).join('')}
      </div>
      <div id="kc-seasons-footer">
        <button id="kc-seasons-close" type="button">${t('common.close')}</button>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#kc-seasons-close').addEventListener('click', () => closeAllPanels());
  }

  // --- Modérateurs (données statiques) ---

  function renderModeratorRow(mod) {
    return `
      <a class="kc-moderator-row" href="${mod.url}" target="_blank" rel="noopener noreferrer">
        <span class="kc-moderator-name">${mod.name}</span>
        <span class="kc-moderator-sub">${t('moderators.viewProfile')}</span>
      </a>
    `;
  }

  function createModeratorsPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-moderators-panel';
    panel.setAttribute('role', 'status');
    panel.innerHTML = `
      <span id="kc-moderators-status">Karmine Tool — ${t('moderators.title')}</span>
      <div id="kc-moderators-body">
        ${MODERATORS_DATA.map(renderModeratorRow).join('')}
      </div>
      <div id="kc-moderators-footer">
        <button id="kc-moderators-close" type="button">${t('common.close')}</button>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#kc-moderators-close').addEventListener('click', () => closeAllPanels());
  }

  // --- Outils externes (liens communautaires) ---

  function renderExternalToolRow(tool) {
    return `
      <a class="kc-moderator-row" href="${tool.url}" target="_blank" rel="noopener noreferrer">
        <span class="kc-moderator-name">${tool.name}</span>
        <span class="kc-moderator-sub">${tool.url.replace(/^https?:\/\//, '')}</span>
      </a>
    `;
  }

  function createExternalToolsPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-externaltools-panel';
    panel.setAttribute('role', 'status');
    panel.innerHTML = `
      <span id="kc-externaltools-status">Karmine Tool — ${t('externalTools.title')}</span>
      <div id="kc-externaltools-body">
        ${EXTERNAL_TOOLS_DATA.map(renderExternalToolRow).join('')}
      </div>
      <div id="kc-externaltools-footer">
        <button id="kc-externaltools-close" type="button">${t('common.close')}</button>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#kc-externaltools-close').addEventListener('click', () => closeAllPanels());
  }

  // --- Gestion commune : ouverture exclusive des panneaux ---

  const OVERLAY_PANEL_IDS = ['kc-menu-panel', 'kc-xp-panel', 'kc-moderators-panel', 'kc-events-panel', 'kc-options-panel', 'kc-customization-panel', 'kc-realmstats-panel', 'kc-seasons-panel', 'kc-prices-panel', 'kc-externaltools-panel'];

  function closeAllPanels() {
    OVERLAY_PANEL_IDS.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.classList.remove('kc-open');
    });
    const menuBtn = document.getElementById('kc-menu-btn');
    if (menuBtn) {
      menuBtn.classList.remove('kc-open');
      menuBtn.setAttribute('aria-expanded', 'false');
    }
    const xpBtn = document.getElementById('kc-xp-toggle');
    if (xpBtn) xpBtn.setAttribute('aria-expanded', 'false');
  }

  function openPanel(id) {
    const el = document.getElementById(id);
    if (!el) return;
    const wasOpen = el.classList.contains('kc-open');
    closeAllPanels();
    if (!wasOpen) el.classList.add('kc-open');
  }

  function createXpToggleButton() {
    const btn = document.createElement('button');
    btn.id = 'kc-xp-toggle';
    btn.type = 'button';
    btn.textContent = 'XP';
    btn.setAttribute('aria-label', t('xp.openAria'));
    btn.setAttribute('aria-expanded', 'false');
    document.body.appendChild(btn);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = document.getElementById('kc-xp-panel').classList.contains('kc-open');
      openPanel('kc-xp-panel');
      btn.setAttribute('aria-expanded', String(!wasOpen));
      if (!wasOpen) refreshXpData();
    });
  }

  // --- Repositionnement dynamique du bouton XP sous le badge de niveau du jeu ---
  //
  // On ne se fie jamais à une classe CSS générée par leur framework (elle
  // peut changer à chaque mise à jour du jeu) : on repère l'élément par le
  // texte qu'il affiche ("Lv. 50 (84%)"), ce qui est bien plus stable.

  function findLevelBadgeElement() {
    const regex = /Lv\.?\s*\d+\s*\(\s*\d+\s*%\s*\)/;
    const all = Array.from(document.querySelectorAll('body *'));
    const matches = all.filter((el) => regex.test(el.textContent));
    if (matches.length === 0) return null;
    // On garde l'élément le plus "profond" contenant le texte complet,
    // pas ses parents (sinon on récupère tout le bandeau du haut).
    const leafMatches = matches.filter(
      (el) => !Array.from(el.querySelectorAll('*')).some((child) => matches.includes(child))
    );
    return leafMatches[0] || null;
  }

  function positionXpToggleButton() {
    const btn = document.getElementById('kc-xp-toggle');
    if (!btn) return;
    const badge = findLevelBadgeElement();
    if (!badge) return; // le badge n'est pas encore rendu : on garde la position par défaut
    const badgeRect = badge.getBoundingClientRect();
    const btnRect = btn.getBoundingClientRect();
    const centeredLeft = badgeRect.left + badgeRect.width / 2 - btnRect.width / 2;
    btn.style.top = `${Math.round(badgeRect.bottom + 8)}px`;
    btn.style.left = `${Math.round(centeredLeft)}px`;
    btn.style.right = 'auto';
  }

  // --- Bouton + menu déroulant persistant ---

  function createMenu() {
    const btn = document.createElement('button');
    btn.id = 'kc-menu-btn';
    btn.type = 'button';
    btn.innerHTML = '<span id="kc-menu-arrow">▾</span>';
    btn.setAttribute('aria-label', t('menu.openAria'));
    btn.setAttribute('aria-expanded', 'false');

    const panel = document.createElement('div');
    panel.id = 'kc-menu-panel';
    panel.innerHTML = `
      <div id="kc-menu-header">Karmine Tool</div>
      <ul id="kc-menu-list"></ul>
    `;

    const list = panel.querySelector('#kc-menu-list');
    getMenuItems().forEach((item) => {
      const li = document.createElement('li');
      li.textContent = item.label;
      li.addEventListener('click', () => item.onSelect());
      list.appendChild(li);
    });

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const wasOpen = panel.classList.contains('kc-open');
      openPanel('kc-menu-panel');
      btn.classList.toggle('kc-open', !wasOpen);
      btn.setAttribute('aria-expanded', String(!wasOpen));
    });
  }

  // Fermeture commune : clic en dehors de tout panneau/bouton, ou touche Échap
  document.addEventListener('click', (e) => {
    const isInsideOverlay = OVERLAY_PANEL_IDS.some((id) => document.getElementById(id)?.contains(e.target));
    const isTriggerBtn = ['kc-menu-btn', 'kc-xp-toggle'].some((id) => document.getElementById(id) === e.target || document.getElementById(id)?.contains(e.target));
    if (!isInsideOverlay && !isTriggerBtn) closeAllPanels();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeAllPanels();
  });

  // Un changement de langue en cours de session doit se refléter partout :
  // plus simple et plus fiable de retirer tous les panneaux et de les
  // reconstruire à neuf (comme on le fait déjà pour l'import de réglages)
  // que de mettre à jour chaque texte affiché un par un.
  function rebuildAllPanelsForLanguageChange() {
    ['kc-menu-btn', 'kc-menu-panel', 'kc-xp-panel', 'kc-xp-toggle', 'kc-moderators-panel', 'kc-events-panel', 'kc-options-panel', 'kc-customization-panel', 'kc-realmstats-panel', 'kc-seasons-panel', 'kc-prices-panel', 'kc-externaltools-panel'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.remove();
    });

    createMenu();
    createXpPanel();
    createXpToggleButton();
    createModeratorsPanel();
    createEventsPanel();
    createOptionsPanel();
    createCustomizationPanel();
    createRealmStatsPanel();
    createSeasonsPanel();
    createPricesPanel();
    createExternalToolsPanel();

    // Rouvre le panneau Options (c'est de là que vient le changement de
    // langue) pour que le résultat soit visible immédiatement.
    openPanel('kc-options-panel');

    // Redessine les données déjà chargées dans la nouvelle langue plutôt
    // que de forcer un nouvel appel réseau pour rien.
    if (lastFetchedEvents.length > 0) renderEventsPanel(lastFetchedEvents, lastResourceNames);
    if (pricesState.items.length > 0) renderPricesList();
    if (realmStatsState.buildings.length > 0) {
      renderRealmStatsSummary();
      renderRealmStatsList();
    }
    refreshXpData();
  }

  currentLanguage = loadSettings().language || 'fr';

  injectStyle();
  createMenu();
  createXpPanel();
  createXpToggleButton();
  createModeratorsPanel();
  createEventsPanel();
  createOptionsPanel();
  createCustomizationPanel();
  applyColorFilter();
  applyChatColors();
  applyCustomBackground();
  applyMapOverlayVisibility();
  createRealmStatsPanel();
  createSeasonsPanel();
  createPricesPanel();
  createExternalToolsPanel();
  const WELCOME_SHOWN_KEY = 'kc_welcome_shown_v1';
  if (!localStorage.getItem(WELCOME_SHOWN_KEY)) {
    showWelcomeToast();
    try {
      localStorage.setItem(WELCOME_SHOWN_KEY, '1');
    } catch (err) {
      // stockage indisponible : le message pourra réapparaître, sans gravité
    }
  }
  refreshXpData();
  setInterval(refreshXpData, XP_POLL_INTERVAL_MS);

  // Le badge de niveau du jeu peut mettre un instant à s'afficher (rendu
  // React) : on retente le calage à quelques reprises après le chargement.
  [0, 500, 1500, 3000].forEach((delay) => setTimeout(positionXpToggleButton, delay));
  window.addEventListener('resize', positionXpToggleButton);

  // Vérifie l'URL/le DOM toutes les 2s pour la page Bourse — aucun appel
  // réseau tant que la ressource affichée ne change pas.
  setInterval(checkMarketPage, 2000);
  checkMarketPage();

  // Même principe pour les contrats entrants (VWAP par contrat).
  setInterval(checkIncomingContractsPage, 2000);
  checkIncomingContractsPage();
})();
