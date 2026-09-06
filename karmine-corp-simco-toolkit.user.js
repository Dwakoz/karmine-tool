// ==UserScript==
// @name         Karmine Tool (bêta)
// @namespace    https://github.com/Dwakoz
// @version      1.0.0
// @description  Extension communautaire pour Sim Companies, développée par le joueur Karmine Corp. Calculateur XP, modérateurs FR et plus à venir.
// @author       Karmine Corp
// @match        https://www.simcompanies.com/*
// @match        https://simcompanies.com/*
// @icon         https://www.simcompanies.com/favicon.ico
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  if (window.__kcSimcoToolkitLoaded) return;
  window.__kcSimcoToolkitLoaded = true;

  // Liste des modules du menu. On y ajoutera une entrée à chaque nouvel
  // outil développé.
  const MENU_ITEMS = [
    {
      id: 'moderators',
      label: 'Modérateurs',
      onSelect: () => openPanel('kc-moderators-panel'),
    },
  ];

  // Modérateurs francophones de la communauté — profils en jeu pour les
  // contacter directement en cas de besoin.
  const MODERATORS_DATA = [
    { name: 'Fuego Corp', url: 'https://www.simcompanies.com/fr/company/0/Fuego-Corp/' },
    { name: 'Tools and Co', url: 'https://www.simcompanies.com/fr/company/0/Tools-and-Co/' },
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
    @media (prefers-reduced-motion: reduce) {
      #kc-toast, #kc-menu-panel, #kc-xp-panel, #kc-moderators-panel {
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
    const qualityRegex = /\d,\d/; // note décimale française, ex. "10,0" ou "7,7"
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

  function refreshXpData() {
    return fetchAuthData()
      .then((data) => {
        const samples = recordXpSample(data.levelInfo);
        const instant = computeInstantXpRate();
        if (instant) {
          renderXpPanel(data.levelInfo, {
            xpPerHour: instant.xpPerHour,
            source: 'instant',
            activeCount: instant.activeCount,
            constructionCount: instant.constructionCount,
            recreationalCount: instant.recreationalCount,
          });
        } else {
          const measuredRate = computeXpRatePerHour(samples);
          renderXpPanel(data.levelInfo, measuredRate ? { xpPerHour: measuredRate, source: 'measured' } : null);
        }
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
      if (rateInfo.source === 'instant') {
        const parts = [`${rateInfo.activeCount} actif${rateInfo.activeCount > 1 ? 's' : ''}`];
        if (rateInfo.constructionCount > 0) {
          parts.push(`${rateInfo.constructionCount} en construction`);
        }
        if (rateInfo.recreationalCount > 0) {
          parts.push(`${rateInfo.recreationalCount} récréatif${rateInfo.recreationalCount > 1 ? 's' : ''}`);
        }
        rateLabel = `Vitesse : <span>${rateInfo.xpPerHour.toLocaleString('fr-FR')} XP/h</span> (${parts.join(', ')})`;
      } else {
        rateLabel = `Vitesse : <span>${Math.round(rateInfo.xpPerHour).toLocaleString('fr-FR')} XP/h</span> (mesurée)`;
      }
      rateEl.innerHTML = rateLabel;
      const remaining = levelInfo.experienceToNextLevel - levelInfo.experience;
      const etaHours = remaining / rateInfo.xpPerHour;
      etaEl.innerHTML = `Niveau suivant dans <span>${formatDuration(etaHours)}</span>`;
    } else {
      rateEl.textContent = 'Vitesse : collecte des données en cours…';
      etaEl.textContent = 'Estimation disponible après quelques minutes de jeu.';
    }

    // Champs éditables pour le niveau des bâtiments récréatifs — non
    // détectable automatiquement, on le mémorise une fois saisi.
    if (recreationalEl) {
      const count = rateInfo && rateInfo.source === 'instant' ? rateInfo.recreationalCount : 0;
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

  // --- Gestion commune : ouverture exclusive des panneaux ---

  const OVERLAY_PANEL_IDS = ['kc-menu-panel', 'kc-xp-panel', 'kc-moderators-panel'];

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
})();
