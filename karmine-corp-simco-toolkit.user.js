// ==UserScript==
// @name         Karmine Tool (bêta)
// @namespace    https://github.com/Dwakoz
// @version      1.10.0
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
  // outil développé.
  const MENU_ITEMS = [
    {
      id: 'moderators',
      label: 'Modérateurs',
      onSelect: () => openPanel('kc-moderators-panel'),
    },
    {
      id: 'market-events',
      label: 'Événements',
      onSelect: () => {
        openPanel('kc-events-panel');
        refreshMarketEvents();
      },
    },
    {
      id: 'realm-stats',
      label: 'Statistiques du royaume',
      onSelect: () => {
        openPanel('kc-realmstats-panel');
        refreshRealmStats();
      },
    },
    {
      id: 'seasons',
      label: 'Saisons',
      onSelect: () => openPanel('kc-seasons-panel'),
    },
    {
      id: 'market-prices',
      label: 'Prix du marché',
      onSelect: () => {
        openPanel('kc-prices-panel');
        refreshMarketPrices();
      },
    },
    {
      id: 'external-tools',
      label: 'Outils externes',
      onSelect: () => openPanel('kc-externaltools-panel'),
    },
    {
      id: 'options',
      label: 'Options',
      onSelect: () => openPanel('kc-options-panel'),
    },
  ];

  // --- Paramètres persistants ---
  //
  // L'outil est destiné à toute la communauté, pas seulement aux joueurs
  // restaurant : les fonctionnalités spécifiques à un type de business
  // (ex. tag "Ingrédient restaurant") ne doivent s'afficher que si le
  // joueur l'active lui-même dans les Options. Désactivé par défaut.
  const SETTINGS_KEY = 'kc_settings_v1';
  const DEFAULT_SETTINGS = { hasRestaurants: false, colorFilterEnabled: false, colorFilterHue: 0 };

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
    production: [{ name: "Récolte d'automne", emoji: '🎃', dates: '', slug: 'production-seasons', key: 'AutumnHarvest' }],
    retail: [
      { name: 'Ramadan', emoji: '🌙', dates: '18 février – 19 mars', slug: 'retail-seasons', key: 'Ramadan' },
      { name: 'Pâques', emoji: '🐰', dates: '2 avril – 12 avril', slug: 'retail-seasons', key: 'Easter' },
      { name: 'Été', emoji: '🍦', dates: '8 juillet – 29 août', slug: 'retail-seasons', key: 'Summer' },
      { name: 'Halloween', emoji: '🎃', dates: '10 octobre – 5 novembre', slug: 'retail-seasons', key: 'Halloween' },
      { name: 'Noël', emoji: '🎄', dates: '1 décembre – 27 décembre', slug: 'retail-seasons', key: 'Xmas' },
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
    #kc-options-hue-value {
      font-size: 12px;
      color: #EDE6D8;
      min-width: 32px;
      text-align: right;
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
      #kc-toast, #kc-menu-panel, #kc-xp-panel, #kc-moderators-panel, #kc-events-panel, #kc-options-panel, #kc-realmstats-panel, #kc-seasons-panel, #kc-prices-panel, #kc-externaltools-panel {
        transition: opacity 0.3s ease;
        transform: none;
      }
    }
  `;

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
        <p id="kc-toast-title">Bienvenue à bord</p>
        <p id="kc-toast-text">
          Cette extension est développée par Karmine Corp, un joueur de la
          communauté Sim Companies, pour améliorer votre expérience de jeu.
          Retrouvez tous les outils depuis le bouton en haut à droite.
        </p>
      </div>
      <div id="kc-toast-footer">
        <button id="kc-toast-close" type="button">Fermer</button>
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

  function fetchAuthData() {
    return fetch('/api/v3/companies/auth-data/', { credentials: 'same-origin' }).then((res) => res.json());
  }

  // --- Prix du marché (API native market-ticker + noms via SimcoTools) ---

  function fetchMarketTicker(realmId) {
    return fetch(`/api/v3/market-ticker/${realmId}/`, { credentials: 'same-origin' }).then((res) => res.json());
  }

  function formatTickerPrice(price) {
    const decimals = price < 10 ? 3 : 2;
    return price.toLocaleString('fr-FR', { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
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
      body.innerHTML = '<p id="kc-prices-empty">Aucune ressource ne correspond à la recherche.</p>';
      return;
    }
    body.innerHTML = `
      <table class="kc-prices-table">
        <thead>
          <tr>
            <th>Ressource</th>
            <th>Prix</th>
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
                    <a href="${url}" target="_blank" rel="noopener noreferrer">${it.name}</a>
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

  function refreshMarketPrices() {
    const body = document.getElementById('kc-prices-body');
    if (body) body.innerHTML = '<p id="kc-prices-empty">Chargement…</p>';
    if (currentRealmId == null) {
      if (body) body.innerHTML = '<p id="kc-prices-empty">Un instant, en attente des données du jeu…</p>';
      return Promise.resolve();
    }
    return Promise.all([fetchMarketTicker(currentRealmId), fetchResourceNames(currentRealmId)])
      .then(([ticker, resourceNames]) => {
        pricesState.items = ticker.map((it) => ({
          kind: it.kind,
          name: resourceNames[it.kind] || `Ressource #${it.kind}`,
          price: it.price,
          isUp: it.is_up,
        }));
        renderPricesList();
      })
      .catch((err) => {
        console.error('[Karmine Tool] Échec du chargement des prix du marché :', err);
        if (body) body.innerHTML = '<p id="kc-prices-empty">Échec du chargement. Réessaie dans un instant.</p>';
      });
  }

  function createPricesPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-prices-panel';
    panel.setAttribute('role', 'status');
    panel.innerHTML = `
      <span id="kc-prices-status">Karmine Tool — Prix du marché</span>
      <p id="kc-prices-hint">Prix le plus bas actuellement affiché, toutes qualités confondues.</p>
      <div id="kc-prices-controls">
        <input type="text" id="kc-prices-search" placeholder="Rechercher une ressource..." />
        <select id="kc-prices-sort">
          <option value="name_asc">Nom A→Z</option>
          <option value="name_desc">Nom Z→A</option>
          <option value="price_desc">Prix décroissant</option>
          <option value="price_asc">Prix croissant</option>
        </select>
      </div>
      <div id="kc-prices-body">
        <p id="kc-prices-empty">Ouvre ce panneau pour charger les prix.</p>
      </div>
      <div id="kc-prices-footer">
        <button id="kc-prices-refresh" type="button">Actualiser</button>
        <button id="kc-prices-close" type="button">Fermer</button>
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
    try {
      const raw = localStorage.getItem(RECREATIONAL_LEVELS_KEY);
      return raw ? JSON.parse(raw) : {};
    } catch (err) {
      return {};
    }
  }

  function saveRecreationalLevel(index, level) {
    const levels = loadRecreationalLevels();
    levels[index] = level;
    try {
      localStorage.setItem(RECREATIONAL_LEVELS_KEY, JSON.stringify(levels));
    } catch (err) {
      // stockage indisponible : le niveau ne sera pas mémorisé, sans gravité
    }
  }

  function computeInstantXpRate() {
    const dayFormatRegex = /\d+\s*j\s*\d+\s*h/i;
    // Sous la barre d'1h restante, le jeu affiche juste "59m" sans le "h" —
    // il faut accepter ce format en plus de "Xh Ym", sinon ces bâtiments
    // sont invisibles pour le détecteur.
    const shortCycleRegex = /\d+\s*h\s*\d+\s*m|^\s*\d+\s*m\s*$/i;
    const timerRegex = /\d+\s*j\s*\d+\s*h|\d+\s*h\s*\d+\s*m|^\s*\d+\s*m\s*$/i;
    const qualityRegex = /\d[.,]\d/; // note décimale, virgule (FR "10,0") ou point (EN "10.0")
    const all = Array.from(document.querySelectorAll('body *'));
    const timerLeaves = all.filter((el) => el.children.length === 0 && timerRegex.test(el.textContent.trim()));

    const countedContainers = new Set();
    let activeCount = 0;
    let constructionCount = 0;
    let recreationalCount = 0;

    timerLeaves.forEach((el) => {
      let node = el;
      let container = null;
      for (let depth = 0; depth <= 8 && node; depth += 1) {
        const cls = typeof node.className === 'string' ? node.className : '';
        if (cls.includes('test-building')) {
          container = node;
          break;
        }
        node = node.parentElement;
      }
      if (!container || countedContainers.has(container)) return;
      countedContainers.add(container);
      // Le texte propre de la minuterie vient du leaf (le conteneur mélange
      // souvent minuterie + note qualité sans séparateur, ex. "59m10,0100").
      const leafText = el.textContent.trim();
      if (dayFormatRegex.test(leafText)) {
        recreationalCount += 1;
      } else if (shortCycleRegex.test(leafText) && qualityRegex.test(container.textContent)) {
        activeCount += 1;
      } else if (shortCycleRegex.test(leafText)) {
        constructionCount += 1;
      }
    });

    if (countedContainers.size === 0) return null; // pas sur la carte, ou rien détecté

    const storedLevels = loadRecreationalLevels();
    let recreationalXpPerHour = 0;
    for (let i = 0; i < recreationalCount; i += 1) {
      const level = storedLevels[i] || 1; // niveau 1 par défaut tant que non renseigné
      recreationalXpPerHour += level * RECREATIONAL_XP_PER_HOUR_PER_LEVEL;
    }

    const xpPerHour =
      activeCount * ACTIVE_BUILDING_XP_PER_HOUR + constructionCount * CONSTRUCTION_XP_PER_HOUR + recreationalXpPerHour;
    return { activeCount, constructionCount, recreationalCount, xpPerHour };
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

  function refreshXpData() {
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
            at: cached.at,
          });
          return;
        }
        const measuredRate = computeXpRatePerHour(samples);
        renderXpPanel(data.levelInfo, measuredRate ? { xpPerHour: measuredRate, source: 'measured' } : null);
      })
      .catch((err) => {
        console.error('[Karmine Tool] Échec du rafraîchissement XP :', err);
      });
  }

  function renderXpPanel(levelInfo, rateInfo) {
    const panel = document.getElementById('kc-xp-panel');
    if (!panel) return;

    const progressPct = Math.min(100, (levelInfo.experience / levelInfo.experienceToNextLevel) * 100);
    panel.querySelector('#kc-xp-level').textContent = `Niveau ${levelInfo.level} — ${levelInfo.levelName}`;
    panel.querySelector('#kc-xp-fill').style.width = `${progressPct.toFixed(1)}%`;
    panel.querySelector('#kc-xp-progress-text').textContent =
      `${levelInfo.experience.toLocaleString('fr-FR')} / ${levelInfo.experienceToNextLevel.toLocaleString('fr-FR')} XP (${progressPct.toFixed(1)} %)`;

    const rateEl = panel.querySelector('#kc-xp-rate');
    const etaEl = panel.querySelector('#kc-xp-eta');
    const recreationalEl = panel.querySelector('#kc-xp-recreational');
    if (rateInfo) {
      let rateLabel;
      if (rateInfo.source === 'instant' || rateInfo.source === 'cached') {
        const parts = [`${rateInfo.activeCount} actif${rateInfo.activeCount > 1 ? 's' : ''}`];
        if (rateInfo.constructionCount > 0) {
          parts.push(`${rateInfo.constructionCount} en construction`);
        }
        if (rateInfo.recreationalCount > 0) {
          parts.push(`${rateInfo.recreationalCount} récréatif${rateInfo.recreationalCount > 1 ? 's' : ''}`);
        }
        rateLabel = `Vitesse : <span>${rateInfo.xpPerHour.toLocaleString('fr-FR')} XP/h</span> (${parts.join(', ')})`;
        if (rateInfo.source === 'cached') {
          const ageMinutes = Math.round((Date.now() - rateInfo.at) / 60000);
          rateLabel += `<br><span class="kc-xp-stale">dernière vue sur la carte il y a ${ageMinutes} min</span>`;
        }
      } else {
        rateLabel = `Vitesse : <span>${Math.round(rateInfo.xpPerHour).toLocaleString('fr-FR')} XP/h</span> (mesurée)`;
      }
      rateEl.innerHTML = rateLabel;
      const remaining = levelInfo.experienceToNextLevel - levelInfo.experience;
      const etaHours = remaining / rateInfo.xpPerHour;
      etaEl.innerHTML = `Niveau suivant dans <span>${formatDuration(etaHours)}</span>`;
    } else {
      rateEl.textContent = 'Vitesse : indisponible sur cette page';
      etaEl.textContent = 'Va sur l’onglet Carte pour une estimation instantanée de tes bâtiments actifs.';
    }

    // Champs éditables pour le niveau des bâtiments récréatifs — non
    // détectable automatiquement, on le mémorise une fois saisi.
    if (recreationalEl) {
      const count = rateInfo && (rateInfo.source === 'instant' || rateInfo.source === 'cached') ? rateInfo.recreationalCount : 0;
      if (count > 0) {
        const storedLevels = loadRecreationalLevels();
        recreationalEl.innerHTML =
          '<p class="kc-xp-recreational-label">Niveau des bâtiments récréatifs :</p>' +
          Array.from({ length: count })
            .map((_, i) => {
              const level = storedLevels[i] || 1;
              return `
                <label class="kc-xp-recreational-row">
                  <span>Bâtiment récréatif #${i + 1}</span>
                  <input type="number" min="1" step="1" value="${level}" data-recreational-index="${i}" />
                </label>
              `;
            })
            .join('');
        recreationalEl.querySelectorAll('input[data-recreational-index]').forEach((input) => {
          input.addEventListener('change', (e) => {
            const idx = parseInt(e.target.getAttribute('data-recreational-index'), 10);
            const level = Math.max(1, parseInt(e.target.value, 10) || 1);
            saveRecreationalLevel(idx, level);
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
      <span id="kc-xp-status">Karmine Tool — Calculateur XP</span>
      <div id="kc-xp-body">
        <p id="kc-xp-level">Niveau —</p>
        <div id="kc-xp-track"><div id="kc-xp-fill"></div></div>
        <p id="kc-xp-progress-text">—</p>
        <p id="kc-xp-rate">Vitesse : —</p>
        <p id="kc-xp-eta">—</p>
        <div id="kc-xp-recreational"></div>
      </div>
      <div id="kc-xp-footer">
        <button id="kc-xp-refresh" type="button">Actualiser</button>
        <button id="kc-xp-close" type="button">Fermer</button>
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

  const vwapState = { resourceId: null, map: null };

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
      badge.title = `VWAP (7 jours, qualité ${parsed.quality}) : $${vwap.toFixed(3)}`;
      priceCell.appendChild(badge);
    });
  }

  function refreshVwapForResource(resourceId) {
    if (currentRealmId == null) return; // pas encore prêt (le calculateur XP n'a pas fini son premier appel) : on retentera
    fetchVwapMap(currentRealmId, resourceId)
      .then((map) => {
        vwapState.resourceId = resourceId;
        vwapState.map = map;
        applyVwapBadges();
      })
      .catch((err) => console.error('[Karmine Tool] Échec du chargement du VWAP :', err));
  }

  function checkMarketPage() {
    const resourceId = getMarketResourceIdFromUrl();
    if (resourceId == null) return;
    if (resourceId !== vwapState.resourceId) {
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
        onload: (res) => {
          try {
            resolve(JSON.parse(res.responseText));
          } catch (err) {
            reject(err);
          }
        },
        onerror: reject,
        ontimeout: reject,
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
    return fetch(`/api/v3/encyclopedia/events/${realmId}/`, { credentials: 'same-origin' })
      .then((res) => res.json())
      .then((data) => (Array.isArray(data.events) ? data.events : []));
  }

  function formatDaysHoursOnly(totalHours) {
    if (!isFinite(totalHours) || totalHours < 0) return '—';
    const days = Math.floor(totalHours / 24);
    const hrs = Math.floor(totalHours % 24);
    return days > 0 ? `${days}j ${hrs}h` : `${hrs}h`;
  }

  function formatShortDate(dateStr) {
    return new Date(dateStr).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
  }

  function renderEventRow(event, resourceNames) {
    const now = Date.now();
    const untilMs = new Date(event.until).getTime();
    const hoursLeft = (untilMs - now) / 3_600_000;
    const modifier = event.speedModifier;
    const resourceName = resourceNames[event.kind] || `Ressource #${event.kind}`;
    const modifierClass = modifier > 0 ? 'kc-positive' : 'kc-negative';
    const modifierText = `${modifier > 0 ? '+' : ''}${modifier}%`;
    const isIngredient = loadSettings().hasRestaurants && RESTAURANT_INGREDIENT_IDS.has(event.kind);
    return `
      <tr class="kc-event-row">
        <td class="kc-event-resource">${resourceName}${isIngredient ? ' <span class="kc-event-tag">🍽️</span>' : ''}</td>
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
      body.innerHTML = '<p id="kc-events-empty">Aucun événement en cours sur ce realm actuellement.</p>';
      return;
    }
    body.innerHTML = `
      <table class="kc-events-table">
        <thead>
          <tr>
            <th>Ressource</th>
            <th>Modif.</th>
            <th>Jusqu'au</th>
            <th>Depuis</th>
          </tr>
        </thead>
        <tbody>
          ${active.map((e) => renderEventRow(e, resourceNames)).join('')}
        </tbody>
      </table>
    `;
  }

  function refreshMarketEvents() {
    const panel = document.getElementById('kc-events-panel');
    if (panel) {
      panel.querySelector('#kc-events-body').innerHTML = '<p id="kc-events-empty">Chargement…</p>';
    }
    if (currentRealmId == null) {
      if (panel) {
        panel.querySelector('#kc-events-body').innerHTML =
          '<p id="kc-events-empty">Un instant, en attente des données du jeu…</p>';
      }
      return Promise.resolve();
    }
    return Promise.all([fetchMarketEvents(currentRealmId), fetchResourceNames(currentRealmId)])
      .then(([events, resourceNames]) => {
        lastFetchedEvents = events;
        lastResourceNames = resourceNames;
        renderEventsPanel(events, resourceNames);
      })
      .catch((err) => {
        console.error('[Karmine Tool] Échec du chargement des événements marché :', err);
        if (panel) {
          panel.querySelector('#kc-events-body').innerHTML =
            '<p id="kc-events-empty">Échec du chargement. Réessaie dans un instant.</p>';
        }
      });
  }

  function createEventsPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-events-panel';
    panel.setAttribute('role', 'status');
    panel.innerHTML = `
      <span id="kc-events-status">Karmine Tool — Événements</span>
      <div id="kc-events-body">
        <p id="kc-events-empty">Ouvre ce panneau pour charger les événements en cours.</p>
      </div>
      <div id="kc-events-footer">
        <button id="kc-events-refresh" type="button">Actualiser</button>
        <button id="kc-events-close" type="button">Fermer</button>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#kc-events-refresh').addEventListener('click', () => refreshMarketEvents());
    panel.querySelector('#kc-events-close').addEventListener('click', () => closeAllPanels());
  }

  // --- Options ---

  function createOptionsPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-options-panel';
    panel.setAttribute('role', 'status');
    const settings = loadSettings();
    panel.innerHTML = `
      <span id="kc-options-status">Karmine Tool — Options</span>
      <div id="kc-options-body">
        <label class="kc-options-row">
          <input type="checkbox" id="kc-options-restaurants" ${settings.hasRestaurants ? 'checked' : ''} />
          <span>Je possède des restaurants</span>
        </label>
        <p class="kc-options-hint">
          Active certains détails spécifiques aux restaurants (ex. le tag
          "Ingrédient restaurant" dans les Événements). Désactivé, ces
          détails restent masqués — utile si tu joues un autre type de
          business.
        </p>
        <label class="kc-options-row">
          <input type="checkbox" id="kc-options-color-filter" ${settings.colorFilterEnabled ? 'checked' : ''} />
          <span>Filtre de couleur sur le jeu</span>
        </label>
        <div class="kc-options-hue-row">
          <input
            type="range"
            id="kc-options-hue"
            min="0"
            max="360"
            step="1"
            value="${settings.colorFilterHue}"
            ${settings.colorFilterEnabled ? '' : 'disabled'}
          />
          <span id="kc-options-hue-value">${settings.colorFilterHue}°</span>
        </div>
        <p class="kc-options-hint">
          Teinte globale appliquée sur le jeu (pas sur cet outil). Le jeu
          n'ayant pas de palette centralisée, c'est un filtre uniforme
          plutôt qu'un reskin précis — un effet "filtre" plus qu'un vrai
          thème sur-mesure.
        </p>
      </div>
      <div id="kc-options-footer">
        <button id="kc-options-close" type="button">Fermer</button>
      </div>
    `;
    document.body.appendChild(panel);

    panel.querySelector('#kc-options-restaurants').addEventListener('change', (e) => {
      saveSettings({ hasRestaurants: e.target.checked });
      renderEventsPanel(lastFetchedEvents); // ré-affiche instantanément sans nouvel appel réseau
    });

    const hueInput = panel.querySelector('#kc-options-hue');
    const hueValueLabel = panel.querySelector('#kc-options-hue-value');

    panel.querySelector('#kc-options-color-filter').addEventListener('change', (e) => {
      saveSettings({ colorFilterEnabled: e.target.checked });
      hueInput.disabled = !e.target.checked;
      applyColorFilter();
    });
    hueInput.addEventListener('input', (e) => {
      hueValueLabel.textContent = `${e.target.value}°`;
      saveSettings({ colorFilterHue: parseInt(e.target.value, 10) });
      applyColorFilter();
    });

    panel.querySelector('#kc-options-close').addEventListener('click', () => closeAllPanels());
  }

  // --- Statistiques du royaume (API publique SimcoTools) ---

  const PHASE_LABELS = {
    boom: 'Boom',
    expansion: 'Boom',
    normal: 'Normale',
    recession: 'Récession',
  };
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
      list.innerHTML = '<p id="kc-realmstats-empty">Aucun bâtiment ne correspond à la recherche.</p>';
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
              <span class="kc-realmstats-row-name">${b.name}</span>
              <span class="kc-realmstats-row-value">${proportionPct}% (${b.count.toLocaleString('fr-FR')})</span>
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
      totalEl.innerHTML = `<strong>${realmStatsState.totalBuildings.toLocaleString('fr-FR')}</strong> bâtiments au total`;
    }
    if (phaseEl) {
      if (realmStatsState.phase) {
        const key = realmStatsState.phase.toLowerCase();
        phaseEl.textContent = PHASE_LABELS[key] || realmStatsState.phase;
        phaseEl.className = `kc-phase-badge ${PHASE_CLASSES[key] || 'kc-phase-normal'}`;
        phaseEl.style.display = '';
      } else {
        phaseEl.style.display = 'none';
      }
    }
  }

  function refreshRealmStats() {
    const list = document.getElementById('kc-realmstats-list');
    if (list) list.innerHTML = '<p id="kc-realmstats-empty">Chargement…</p>';
    if (currentRealmId == null) {
      if (list) list.innerHTML = '<p id="kc-realmstats-empty">Un instant, en attente des données du jeu…</p>';
      return;
    }
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
        if (list) list.innerHTML = '<p id="kc-realmstats-empty">Échec du chargement. Réessaie dans un instant.</p>';
      });
  }

  function createRealmStatsPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-realmstats-panel';
    panel.setAttribute('role', 'status');
    panel.innerHTML = `
      <span id="kc-realmstats-status">Karmine Tool — Statistiques du royaume</span>
      <div id="kc-realmstats-summary">
        <span id="kc-realmstats-total">—</span>
        <span id="kc-realmstats-phase" class="kc-phase-badge kc-phase-normal" style="display:none"></span>
      </div>
      <div id="kc-realmstats-controls">
        <input type="text" id="kc-realmstats-search" placeholder="Rechercher un bâtiment..." />
        <select id="kc-realmstats-sort">
          <option value="count_desc">Les plus construits</option>
          <option value="count_asc">Les moins construits</option>
          <option value="name_asc">Nom A→Z</option>
          <option value="name_desc">Nom Z→A</option>
        </select>
      </div>
      <div id="kc-realmstats-list">
        <p id="kc-realmstats-empty">Ouvre ce panneau pour charger les statistiques.</p>
      </div>
      <div id="kc-realmstats-footer">
        <button id="kc-realmstats-refresh" type="button">Actualiser</button>
        <button id="kc-realmstats-close" type="button">Fermer</button>
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
    return `
      <a class="kc-season-card" href="${url}" target="_blank" rel="noopener noreferrer">
        <span class="kc-season-emoji">${season.emoji}</span>
        <div class="kc-season-info">
          <span class="kc-season-name">${season.name}</span>
          ${season.dates ? `<span class="kc-season-dates">${season.dates}</span>` : ''}
        </div>
      </a>
    `;
  }

  function createSeasonsPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-seasons-panel';
    panel.setAttribute('role', 'status');
    panel.innerHTML = `
      <span id="kc-seasons-status">Karmine Tool — Saisons</span>
      <div id="kc-seasons-body">
        <p class="kc-seasons-group-title">Production</p>
        ${SEASONS_DATA.production.map(renderSeasonCard).join('')}
        <p class="kc-seasons-group-title">Vente</p>
        ${SEASONS_DATA.retail.map(renderSeasonCard).join('')}
      </div>
      <div id="kc-seasons-footer">
        <button id="kc-seasons-close" type="button">Fermer</button>
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
        <span class="kc-moderator-sub">Voir le profil en jeu</span>
      </a>
    `;
  }

  function createModeratorsPanel() {
    const panel = document.createElement('div');
    panel.id = 'kc-moderators-panel';
    panel.setAttribute('role', 'status');
    panel.innerHTML = `
      <span id="kc-moderators-status">Karmine Tool — Modérateurs FR</span>
      <div id="kc-moderators-body">
        ${MODERATORS_DATA.map(renderModeratorRow).join('')}
      </div>
      <div id="kc-moderators-footer">
        <button id="kc-moderators-close" type="button">Fermer</button>
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
      <span id="kc-externaltools-status">Karmine Tool — Outils externes</span>
      <div id="kc-externaltools-body">
        ${EXTERNAL_TOOLS_DATA.map(renderExternalToolRow).join('')}
      </div>
      <div id="kc-externaltools-footer">
        <button id="kc-externaltools-close" type="button">Fermer</button>
      </div>
    `;
    document.body.appendChild(panel);
    panel.querySelector('#kc-externaltools-close').addEventListener('click', () => closeAllPanels());
  }

  // --- Gestion commune : ouverture exclusive des panneaux ---

  const OVERLAY_PANEL_IDS = ['kc-menu-panel', 'kc-xp-panel', 'kc-moderators-panel', 'kc-events-panel', 'kc-options-panel', 'kc-realmstats-panel', 'kc-seasons-panel', 'kc-prices-panel', 'kc-externaltools-panel'];

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
    btn.setAttribute('aria-label', 'Ouvrir le calculateur XP');
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
    btn.setAttribute('aria-label', 'Ouvrir le menu Karmine Tool');
    btn.setAttribute('aria-expanded', 'false');

    const panel = document.createElement('div');
    panel.id = 'kc-menu-panel';
    panel.innerHTML = `
      <div id="kc-menu-header">Karmine Tool</div>
      <ul id="kc-menu-list"></ul>
    `;

    const list = panel.querySelector('#kc-menu-list');
    MENU_ITEMS.forEach((item) => {
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

  injectStyle();
  createMenu();
  createXpPanel();
  createXpToggleButton();
  createModeratorsPanel();
  createEventsPanel();
  createOptionsPanel();
  applyColorFilter();
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
})();
