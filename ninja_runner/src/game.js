(function () {
  'use strict';

  const background = document.getElementById('background');
  const bg = background.getContext('2d', { alpha: false, desynchronized: true });
  const fx = document.getElementById('fx');
  const ctx = fx.getContext('2d', { alpha: true, desynchronized: true });
  const W = fx.width;
  const H = fx.height;
  const prefersReducedMotion = Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
  const mobileVisualBudget = Boolean(window.matchMedia?.('(pointer: coarse)').matches ||
    window.matchMedia?.('(max-width: 600px)').matches);
  const touchCapable = Boolean(window.matchMedia?.('(pointer: coarse)').matches || navigator.maxTouchPoints > 0);
  const queryParams = new URLSearchParams(window.location.search);
  const qaMode = queryParams.get('qa') === '1';
  const perfEnabled = queryParams.get('perf') === '1';
  const visualProfile = {
    name: mobileVisualBudget ? 'mobile' : 'desktop',
    tier: mobileVisualBudget ? 'balanced' : 'high',
    targetFps: mobileVisualBudget ? 30 : 60,
    glow: !mobileVisualBudget && !prefersReducedMotion,
    particleLimit: prefersReducedMotion ? 24 : (mobileVisualBudget ? 48 : 160),
    explosionLimit: mobileVisualBudget ? 4 : 10,
    explosionRays: mobileVisualBudget ? 4 : 10,
    backgroundFps: mobileVisualBudget ? 20 : 60
  };
  let targetFrameMs = 1000 / visualProfile.targetFps;
  let lastVisualFrameAt = -Infinity;
  let nextBackgroundFrameAt = -Infinity;

  const CONFIG = Object.freeze({
    playerX: 420,
    combatX: 520,
    playerGroundY: 620,
    rivalGroundY: 382,
    laneDividerY: 402,
    highY: 475,
    lowY: 566,
    rivalHighY: 252,
    rivalLowY: 344,
    groundY: 620,
    spawnX: 1060,
    hitX: 520,
    attackMinX: 525,
    attackMaxX: 700,
    startSpeed: 375,
    maxSpeed: 720,
    startSpawnDelay: 1.28,
    minSpawnDelay: 0.68,
    jumpMs: 900,
    attackMs: 700,
    hitMs: 535,
    deathMs: 650,
    strikeStartMs: 55,
    strikeEndMs: 455,
    remotePoseDelayMs: 90,
    laneSwitchMs: 240,
    laneSwitchCooldownMs: 380,
    duoPatternDelay: 3.45,
    duoDecisionMs: 1250,
    duoResponseGapMs: 1050,
    ultimateWindowMs: 2600,
    teamRescueCost: 35,
    teamRescueGraceMs: 1300,
    flowLength: 1200,
    flowMinY: 260,
    flowMaxY: 610,
    flowMoveSpeed: 350,
    flowMinX: 270,
    flowMaxX: 780,
    flowHorizontalSpeed: 300,
    flowMaxSpeed: 520,
    flowPatternDelay: 3.1,
    flowMaxProjectiles: 8,
    flowHitRadius: 43,
    flowSeparation: 84,
    flowSwordStart: 2,
    competitiveSwordStart: 5,
    flowSwordMax: 8,
    flowSwordPickup: 2,
    fullLifeSwordPickup: 1,
    shieldDurationMs: 10000,
    raceLength: 800
  });

  function linearPaint(y0, y1, stops) {
    const gradient = bg.createLinearGradient(0, y0, 0, y1);
    for (const [offset, color] of stops) gradient.addColorStop(offset, color);
    return gradient;
  }

  const raceGlowPaint = bg.createRadialGradient(785, 106, 5, 785, 106, 145);
  raceGlowPaint.addColorStop(0, 'rgba(235,239,255,.15)');
  raceGlowPaint.addColorStop(1, 'rgba(235,239,255,0)');
  const WORLD_PAINTS = Object.freeze({
    flowSky: linearPaint(0, 190, [[0, '#101b24'], [1, '#2c3c38']]),
    flowWall: linearPaint(78, 182, [[0, '#6d715e'], [1, '#373b33']]),
    flowEarth: linearPaint(145, 640, [[0, '#77715b'], [.45, '#5c5848'], [1, '#32332e']]),
    raceSky: linearPaint(0, H, [[0, '#111a2c'], [.5, '#0d1220'], [1, '#07090e']]),
    raceGlow: raceGlowPaint,
    rivalLane: linearPaint(145, CONFIG.rivalGroundY + 18, [
      [0, 'rgba(18,20,34,.78)'], [1, 'rgba(10,12,22,.94)']
    ]),
    playerLane: linearPaint(CONFIG.laneDividerY, CONFIG.playerGroundY + 18, [
      [0, 'rgba(12,16,25,.84)'], [1, 'rgba(8,11,18,.97)']
    ])
  });

  const elements = {
    lives: document.getElementById('lives'),
    score: document.getElementById('score'),
    combo: document.getElementById('combo'),
    toast: document.getElementById('toast'),
    gameViewport: document.getElementById('gameViewport'),
    raceCountdown: document.getElementById('raceCountdown'),
    countdownCaption: document.getElementById('countdownCaption'),
    countdownValue: document.getElementById('countdownValue'),
    startScreen: document.getElementById('startScreen'),
    gameOverScreen: document.getElementById('gameOverScreen'),
    startBtn: document.getElementById('startBtn'),
    startLabel: document.getElementById('startLabel'),
    loadStatus: document.getElementById('loadStatus'),
    networkStatus: document.getElementById('networkStatus'),
    networkLabel: document.getElementById('networkLabel'),
    latencyHud: document.getElementById('latencyHud'),
    latencyLabel: document.getElementById('latencyLabel'),
    duoHud: document.getElementById('duoHud'),
    flowHud: document.getElementById('flowHud'),
    flowBuffs: document.getElementById('flowBuffs'),
    flowSwordCounter: document.getElementById('flowSwordCounter'),
    flowSwordCount: document.getElementById('flowSwordCount'),
    flowRivalSwordCount: document.getElementById('flowRivalSwordCount'),
    flowGuide: document.getElementById('flowGuide'),
    syncProgress: document.getElementById('syncProgress'),
    syncValue: document.getElementById('syncValue'),
    duoPrompt: document.getElementById('duoPrompt'),
    enemyKunaiToggle: document.getElementById('enemyKunaiToggle'),
    enemyKunaiLabel: document.getElementById('enemyKunaiLabel'),
    playerNameInput: document.getElementById('playerNameInput'),
    playerNameHud: document.getElementById('playerNameHud'),
    retryBtn: document.getElementById('retryBtn'),
    lobbyBtn: document.getElementById('lobbyBtn'),
    finalScore: document.getElementById('finalScore'),
    bestScore: document.getElementById('bestScoreLabel'),
    resultEyebrow: document.getElementById('resultEyebrow'),
    gameOverTitle: document.getElementById('gameOverTitle'),
    resultPlayerName: document.getElementById('resultPlayerName'),
    resultRivalName: document.getElementById('resultRivalName'),
    resultConnector: document.querySelector('.result-competitors span'),
    resultStats: document.getElementById('resultStats'),
    playerProgress: document.getElementById('playerProgress'),
    rivalProgress: document.getElementById('rivalProgress'),
    playerMeters: document.getElementById('playerMeters'),
    rivalMeters: document.getElementById('rivalMeters'),
    rivalName: document.getElementById('rivalName'),
    reset: document.getElementById('reset'),
    status: document.getElementById('status'),
    btnJump: document.getElementById('btnJump'),
    btnDuck: document.getElementById('btnDuck'),
    btnAttack: document.getElementById('btnAttack'),
    btnAttackLabel: document.querySelector('#btnAttack strong'),
    btnBack: document.getElementById('btnBack'),
    btnForward: document.getElementById('btnForward'),
    flowJoystick: document.getElementById('flowJoystick'),
    flowJoystickBase: document.getElementById('flowJoystickBase'),
    flowJoystickKnob: document.getElementById('flowJoystickKnob'),
    btnLane: document.getElementById('btnLane'),
    btnLaneLabel: document.getElementById('btnLaneLabel'),
    btnJumpLabel: document.getElementById('btnJumpLabel'),
    btnDuckLabel: document.getElementById('btnDuckLabel'),
    keyboardUpLabel: document.getElementById('keyboardUpLabel'),
    keyboardUpHint: document.getElementById('keyboardUpHint'),
    keyboardDownLabel: document.getElementById('keyboardDownLabel'),
    keyboardDownHint: document.getElementById('keyboardDownHint'),
    mobileControlsCopy: document.getElementById('mobileControlsCopy'),
    flowHorizontalControl: document.querySelector('.flow-horizontal-control'),
    keyboardAttackHint: document.querySelector('.control-card.featured small'),
    modeDescription: document.querySelector('.start-panel > p'),
    modeCards: [...document.querySelectorAll('.mode-card[data-game-type]')],
    laneControl: document.querySelector('.lane-control')
  };

  const game = {
    ready: false,
    running: false,
    over: false,
    score: 0,
    combo: 0,
    lives: 3,
    elapsed: 0,
    distance: 0,
    playerMeters: 0,
    rivalMeters: 0,
    outcome: 'defeat',
    speed: CONFIG.startSpeed,
    spawnClock: .82,
    rivalSpawnClock: 1.15,
    spawnDelay: CONFIG.startSpawnDelay,
    lastTime: 0,
    nextKunaiId: 1,
    nextDuoObjectId: 1,
    kunais: [],
    pickups: [],
    linkedCores: [],
    particles: [],
    explosions: [],
    enemyKunaisVisible: true,
    playerName: 'Ninja',
    rivalPlayerName: 'Rival',
    gameType: 'competitive',
    duoHost: false,
    duoPatternClock: 2.2,
    duoPatternIndex: 0,
    duoPatternLast: '',
    duoPatternSeen: { route: 0, mirror: 0, core: 0, support: 0 },
    duoCue: null,
    duoCueUntil: 0,
    teamRescueUntil: 0,
    syncMeter: 0,
    ultimateFlashUntil: 0,
    ultimateArmUntil: 0,
    ultimateArmedByRemote: false,
    lastAttackAt: 0,
    flowY: 520,
    flowMove: 0,
    flowX: 604,
    flowMoveX: 0,
    rivalFlowY: 400,
    rivalFlowTargetY: 400,
    rivalFlowX: 436,
    rivalFlowTargetX: 436,
    flowSwordCharges: 2,
    rivalSwordCharges: 2,
    rivalFlowDecisionAt: 0,
    flowPatternClock: 2.2,
    flowPatternLast: '',
    flowPatternIndex: 0,
    flowCue: '',
    flowCueUntil: 0,
    flowProjectiles: [],
    flowPickups: [],
    flowActorNotices: [],
    flowBlastUntil: 0,
    flowBlastRole: 'player',
    matchMode: 'bot',
    matchmaking: false,
    countingDown: false,
    rivalTargetMeters: 0,
    remoteKunais: [],
    remoteExplosions: [],
    remoteReceivedAt: 0,
    remoteSpeed: CONFIG.startSpeed,
    remoteLives: 3,
    remotePoseQueue: [],
    networkRtt: null,
    networkSendClock: 0,
    hudRenderClock: 0,
    networkFinishedSent: false,
    matchStartTimer: 0,
    countdownTimer: 0,
    countdownHideTimer: 0,
    stats: { dodges: 0, cuts: 0, attacks: 0, hitsReceived: 0, maxCombo: 0 },
    rivalStats: { score: 0, meters: 0, dodges: 0, cuts: 0, attacks: 0, hitsReceived: 0, maxCombo: 0, durationMs: 0 },
    finalOpponentStats: null,
    outfitRegistry: null,
    loadout: { clothing: 'classic', hair: 'classic', weapon: 'classic', back: 'classic' },
    rivalLoadout: { clothing: 'set_186_0', hair: 'hair_83_0', weapon: 'weapon_182', back: 'classic' },
    rival: {
      mode: 'run',
      lane: 'rival',
      previousLane: 'rival',
      laneChangedAt: 0,
      laneCooldownUntil: 0,
      shield: false,
      shieldUntil: 0,
      actionStarted: 0,
      until: 0,
      invulnerableUntil: 0,
      targetKunaiId: null,
      plannedAction: null,
      decisions: 0,
      hits: 0
    },
    player: {
      mode: 'run',
      lane: 'player',
      previousLane: 'player',
      laneChangedAt: 0,
      laneCooldownUntil: 0,
      shield: false,
      shieldUntil: 0,
      actionStarted: 0,
      until: 0,
      duckHeld: false,
      duckInputHeld: false,
      invulnerableUntil: 0
    }
  };

  try {
    const savedEnemyKunaiPreference = localStorage.getItem('ninja_runner_enemy_kunais_visible_v2');
    game.enemyKunaisVisible = savedEnemyKunaiPreference === null || savedEnemyKunaiPreference === '1';
    game.playerName = localStorage.getItem('ninja_runner_player_name_v1') || 'Ninja';
  } catch (_) { /* Storage can be unavailable in privacy mode. */ }

  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  const isOnlineRace = () => game.matchMode === 'online';
  const isDuoMode = () => game.gameType === 'duo';
  const isFlowMode = () => game.gameType === 'flow';
  const isCoopMode = () => isDuoMode() || isFlowMode();

  const QUALITY_PRESETS = Object.freeze({
    high: { particleLimit: 64, explosionLimit: 5, explosionRays: 5, backgroundFps: 30 },
    balanced: { particleLimit: 48, explosionLimit: 4, explosionRays: 4, backgroundFps: 20 },
    low: { particleLimit: 28, explosionLimit: 3, explosionRays: 3, backgroundFps: 15 }
  });
  const qualityOrder = ['low', 'balanced', 'high'];
  const performanceState = {
    enabled: perfEnabled,
    fps: 0,
    frameMs: 0,
    p95FrameMs: 0,
    updateMs: 0,
    backgroundMs: 0,
    characterMs: 0,
    effectsMs: 0,
    droppedFrames: 0,
    longFrames: 0,
    backgroundFps: visualProfile.backgroundFps,
    poseCache: { entries: 0, pixels: 0, hits: 0, misses: 0, hitRate: 0 },
    windowStartedAt: performance.now(),
    windowFrames: 0,
    samples: [],
    badWindows: 0,
    goodWindows: 0,
    lastRenderedAt: 0
  };
  let perfHud = null;

  function average(items, key) {
    if (!items.length) return 0;
    return items.reduce((total, item) => total + (Number(item[key]) || 0), 0) / items.length;
  }

  function percentile(items, key, ratio) {
    if (!items.length) return 0;
    const values = items.map(item => Number(item[key]) || 0).sort((a, b) => a - b);
    return values[Math.min(values.length - 1, Math.floor(values.length * ratio))];
  }

  function applyQualityTier(tier) {
    if (!mobileVisualBudget || !QUALITY_PRESETS[tier] || visualProfile.tier === tier) return false;
    Object.assign(visualProfile, QUALITY_PRESETS[tier], { tier });
    targetFrameMs = 1000 / visualProfile.targetFps;
    nextBackgroundFrameAt = -Infinity;
    if (game.particles.length > visualProfile.particleLimit) {
      game.particles.splice(0, game.particles.length - visualProfile.particleLimit);
    }
    performanceState.backgroundFps = visualProfile.backgroundFps;
    return true;
  }

  function updateAdaptiveQuality() {
    if (!mobileVisualBudget || performanceState.windowFrames < 8) return;
    const overloaded = performanceState.fps < visualProfile.targetFps * .86 ||
      performanceState.p95FrameMs > targetFrameMs * .86;
    const comfortable = performanceState.fps >= visualProfile.targetFps * .96 &&
      performanceState.p95FrameMs < targetFrameMs * .58;
    performanceState.badWindows = overloaded ? performanceState.badWindows + 1 : 0;
    performanceState.goodWindows = comfortable ? performanceState.goodWindows + 1 : 0;
    const currentIndex = qualityOrder.indexOf(visualProfile.tier);
    if (performanceState.badWindows >= 2 && currentIndex > 0) {
      applyQualityTier(qualityOrder[currentIndex - 1]);
      performanceState.badWindows = 0;
      performanceState.goodWindows = 0;
    } else if (performanceState.goodWindows >= 7 && currentIndex < qualityOrder.length - 1) {
      applyQualityTier(qualityOrder[currentIndex + 1]);
      performanceState.badWindows = 0;
      performanceState.goodWindows = 0;
    }
  }

  function renderPerformanceHud() {
    if (!perfEnabled) return;
    if (!perfHud) {
      perfHud = document.createElement('output');
      perfHud.id = 'perfHud';
      perfHud.setAttribute('aria-label', 'Rendimiento del juego');
      document.getElementById('stageBox')?.append(perfHud);
    }
    const cache = performanceState.poseCache || {};
    perfHud.textContent = [
      `FPS ${performanceState.fps.toFixed(1)}  P95 ${performanceState.p95FrameMs.toFixed(1)}ms`,
      `LOG ${performanceState.updateMs.toFixed(1)}  BG ${performanceState.backgroundMs.toFixed(1)}  ` +
        `NINJAS ${performanceState.characterMs.toFixed(1)}  FX ${performanceState.effectsMs.toFixed(1)}`,
      `${visualProfile.tier.toUpperCase()}  BG ${visualProfile.backgroundFps}fps  ` +
        `POSES ${Math.round((cache.hitRate || 0) * 100)}%/${cache.entries || 0}`
    ].join('\n');
  }

  function finishPerformanceWindow(now) {
    const elapsed = Math.max(1, now - performanceState.windowStartedAt);
    const samples = performanceState.samples;
    performanceState.fps = performanceState.windowFrames * 1000 / elapsed;
    performanceState.frameMs = average(samples, 'totalMs');
    performanceState.p95FrameMs = percentile(samples, 'totalMs', .95);
    performanceState.updateMs = average(samples, 'updateMs');
    performanceState.backgroundMs = average(samples, 'backgroundMs');
    performanceState.characterMs = average(samples, 'characterMs');
    performanceState.effectsMs = average(samples, 'effectsMs');
    updateAdaptiveQuality();
    renderPerformanceHud();
    performanceState.windowStartedAt = now;
    performanceState.windowFrames = 0;
    performanceState.samples = [];
  }

  function recordPerformance(now, updateMs, timings) {
    const interval = performanceState.lastRenderedAt ? now - performanceState.lastRenderedAt : targetFrameMs;
    performanceState.lastRenderedAt = now;
    performanceState.windowFrames += 1;
    performanceState.samples.push({ updateMs, ...timings });
    if (interval > targetFrameMs * 1.55) performanceState.droppedFrames += 1;
    if (timings.totalMs > 50) performanceState.longFrames += 1;
    if (timings.poseCache) performanceState.poseCache = { ...timings.poseCache };
    if (now - performanceState.windowStartedAt >= 1000) finishPerformanceWindow(now);
  }

  function performanceSnapshot() {
    return {
      enabled: performanceState.enabled,
      fps: performanceState.fps,
      frameMs: performanceState.frameMs,
      p95FrameMs: performanceState.p95FrameMs,
      updateMs: performanceState.updateMs,
      backgroundMs: performanceState.backgroundMs,
      characterMs: performanceState.characterMs,
      effectsMs: performanceState.effectsMs,
      droppedFrames: performanceState.droppedFrames,
      longFrames: performanceState.longFrames,
      poseCache: { ...performanceState.poseCache }
    };
  }

  const lifeNodes = Array.from({ length: 3 }, () => {
    const life = document.createElement('span');
    life.className = 'life';
    life.setAttribute('aria-hidden', 'true');
    return life;
  });
  elements.lives.replaceChildren(...lifeNodes);

  function setTextIfChanged(element, value) {
    if (!element) return;
    const next = String(value);
    if (element.textContent !== next) element.textContent = next;
  }

  function setAttributeIfChanged(element, name, value) {
    if (!element) return;
    const next = String(value);
    if (element.getAttribute(name) !== next) element.setAttribute(name, next);
  }

  function setHiddenIfChanged(element, hidden) {
    if (element && element.hidden !== Boolean(hidden)) element.hidden = Boolean(hidden);
  }

  function setWidthIfChanged(element, width) {
    if (element && element.style.width !== width) element.style.width = width;
  }

  function laneGroundY(lane) {
    return lane === 'rival' ? CONFIG.rivalGroundY : CONFIG.playerGroundY;
  }

  function laneScale(lane, role) {
    if (lane === 'rival') return role === 'player' ? .56 : .54;
    return role === 'rival' ? .62 : .64;
  }

  function formationOffset(role) {
    if (!isDuoMode() || game.player.lane !== game.rival.lane) return 0;
    return role === 'player' ? 60 : -60;
  }

  function laneThreats(lane) {
    return game.kunais.filter(kunai => kunai.lane === lane && !kunai.dead &&
      !kunai.resolved && kunai.x > CONFIG.hitX && kunai.x < CONFIG.spawnX + 60)
      .sort((a, b) => a.x - b.x);
  }

  function laneThreatCount(lane) {
    return laneThreats(lane).length;
  }

  function laneThreatState(lane) {
    const threats = laneThreats(lane);
    if (!threats.length) return { count: 0, level: 0, label: 'LIBRE', nextMs: Infinity };
    const nextMs = Math.max(0, (threats[0].x - CONFIG.hitX) / Math.max(1, game.speed) * 1000);
    const urgent = threats.filter(kunai =>
      (kunai.x - CONFIG.hitX) / Math.max(1, game.speed) * 1000 <= 1500).length;
    const level = nextMs < 720 || urgent >= 3 ? 3 : (nextMs < 1350 || urgent >= 2 ? 2 : 1);
    return {
      count: urgent,
      level,
      nextMs,
      label: level === 3 ? 'AHORA' : (level === 2 ? 'ATENCION' : 'PREPARATE')
    };
  }

  function actorGroundY(actor, now = performance.now()) {
    if (isFlowMode()) return actor === game.player ? game.flowY : game.rivalFlowY;
    if (!isDuoMode() || !actor.laneChangedAt) return laneGroundY(actor.lane);
    const progress = clamp((now - actor.laneChangedAt) / CONFIG.laneSwitchMs, 0, 1);
    const eased = progress * progress * (3 - 2 * progress);
    return laneGroundY(actor.previousLane) +
      (laneGroundY(actor.lane) - laneGroundY(actor.previousLane)) * eased;
  }

  function actorCollisionLane(actor, now = performance.now()) {
    if (!actor.laneChangedAt || now - actor.laneChangedAt >= CONFIG.laneSwitchMs * .5) return actor.lane;
    return actor.previousLane;
  }

  function normalizePlayerName(value, fallback = 'Ninja') {
    const characters = Array.from(String(value || '').normalize('NFKC'))
      .filter(character => {
        const code = character.codePointAt(0);
        return code >= 32 && code !== 127 && character !== '<' && character !== '>';
      })
      .slice(0, 18);
    return characters.join('').trim().split(' ').filter(Boolean).join(' ') || fallback;
  }

  window.NinjaRunnerScene = {
    ownsStageRendering: () => game.running,
    getViews: () => {
      if (isFlowMode()) {
        return [
          {
            role: 'rival',
            x: flowActorViewX('rival'),
            y: game.rivalFlowY,
            scale: .6,
            frameOffset: 7,
            loadout: game.rivalLoadout,
            animation: { mode: game.rival.mode, startedAt: game.rival.actionStarted }
          },
          {
            role: 'player',
            x: flowActorViewX('player'),
            y: game.flowY,
            scale: .64,
            loadout: game.loadout
          }
        ];
      }
      const leadOffset = rivalLeadOffset();
      return [
        {
          role: 'rival',
          x: CONFIG.playerX + leadOffset + formationOffset('rival'),
          y: actorGroundY(game.rival),
          scale: laneScale(game.rival.lane, 'rival'),
          frameOffset: 7,
          loadout: game.rivalLoadout,
          animation: { mode: game.rival.mode, startedAt: game.rival.actionStarted }
        },
        {
          role: 'player',
          x: CONFIG.playerX + formationOffset('player'),
          y: actorGroundY(game.player),
          scale: laneScale(game.player.lane, 'player'),
          loadout: game.loadout
        }
      ];
    }
  };

  let toastTimer = 0;
  const startupParameters = new URLSearchParams(location.search);
  let autoStartRequested = startupParameters.get('autostart') === '1';
  const requestedMode = startupParameters.get('mode');
  const requestedGameType = ['duo', 'flow'].includes(requestedMode) ? 'flow' : 'competitive';

  function formatScore(value) {
    return Math.max(0, Math.floor(value)).toString().padStart(6, '0');
  }

  function displayedScore() {
    return game.score + ((isDuoMode() || isFlowMode())
      ? Math.max(0, Number(game.rivalStats.score) || 0) : 0);
  }

  function press(key) {
    document.dispatchEvent(new KeyboardEvent('keydown', { key }));
  }

  function release(key) {
    document.dispatchEvent(new KeyboardEvent('keyup', { key }));
  }

  function setRunnerAutoRun(active) {
    return window.NinjaRunnerAnimation?.setAutoRun(Boolean(active)) || false;
  }

  function setPlayerMode(mode, duration, now = performance.now()) {
    game.player.mode = mode;
    game.player.actionStarted = now;
    game.player.until = duration ? now + duration : 0;
  }

  function shieldRemainingMs(actor, now = performance.now()) {
    if (!actor?.shield) return 0;
    return Math.max(0, Number(actor.shieldUntil) - now);
  }

  function shieldSeconds(actor, now = performance.now()) {
    return Math.ceil(shieldRemainingMs(actor, now) / 1000);
  }

  function grantShield(actor, now = performance.now()) {
    actor.shield = true;
    actor.shieldUntil = now + CONFIG.shieldDurationMs;
  }

  function consumeShield(actor) {
    actor.shield = false;
    actor.shieldUntil = 0;
  }

  function updateShieldTimers(now) {
    let changed = false;
    for (const [role, actor] of [['player', game.player], ['rival', game.rival]]) {
      if (!actor.shield || now < actor.shieldUntil) continue;
      consumeShield(actor);
      changed = true;
      if (isFlowMode()) {
        showFlowActorNotice(role, 'GUARD TERMINO', role === 'player' ? '#75f7ef' : '#d5b4ff');
      }
    }
    if (changed) renderHud();
  }

  function renderHud() {
    setTextIfChanged(elements.playerNameHud, game.playerName);
    setTextIfChanged(elements.rivalName, game.rivalPlayerName);
    for (let index = 0; index < lifeNodes.length; index += 1) {
      lifeNodes[index].classList.toggle('lost', index >= game.lives);
    }
    setAttributeIfChanged(elements.lives, 'aria-label',
      `${game.lives} ${game.lives === 1 ? 'vida' : 'vidas'}`);
    setTextIfChanged(elements.score, formatScore(displayedScore()));
    setTextIfChanged(elements.combo, game.combo >= 2 ? `COMBO ×${game.combo}` : '');
    const playerRatio = Math.min(1, game.playerMeters / (isFlowMode() ? CONFIG.flowLength : CONFIG.raceLength));
    const rivalRatio = Math.min(1, game.rivalMeters /
      (isFlowMode() ? CONFIG.flowLength : CONFIG.raceLength));
    setWidthIfChanged(elements.playerProgress, `${(playerRatio * 100).toFixed(1)}%`);
    setWidthIfChanged(elements.rivalProgress, `${(rivalRatio * 100).toFixed(1)}%`);
    setTextIfChanged(elements.playerMeters, `${Math.floor(game.playerMeters)}m`);
    setTextIfChanged(elements.rivalMeters, `${Math.floor(game.rivalMeters)}m`);
    renderDuoHud();
    renderFlowHud();
    renderLatency();
  }

  function renderDuoHud() {
    const visible = isDuoMode() && (game.running || game.countingDown);
    setHiddenIfChanged(elements.duoHud, !visible);
    if (!visible) return;
    const value = Math.round(clamp(game.syncMeter, 0, 100));
    setWidthIfChanged(elements.syncProgress, `${value}%`);
    setTextIfChanged(elements.syncValue, `${value}%`);
    elements.duoHud.classList.toggle('ready', value >= 100);
    elements.duoHud.classList.toggle('rescue-ready', value >= CONFIG.teamRescueCost);
    const cueActive = game.duoCue && performance.now() < game.duoCueUntil;
    const rescueReady = value >= CONFIG.teamRescueCost && Math.min(game.lives, game.remoteLives) <= 1;
    let prompt = `VIDAS ${game.lives}/3 + ${game.remoteLives}/3`;
    if (value >= 100 && performance.now() < game.ultimateArmUntil) {
      prompt = 'RESPONDAN CON UN ATAQUE';
    } else if (cueActive) {
      prompt = `${game.duoCue.cue}${game.duoCue.plan ? ` - ${game.duoCue.plan}` : ''}`;
    } else if (value >= 100) {
      prompt = 'ATAQUEN JUNTOS PARA TORMENTA GEMELA';
    } else if (rescueReady) {
      prompt = `RESCATE AUTOMATICO LISTO - ${CONFIG.teamRescueCost}%`;
    } else if (game.player.shield) {
      prompt = `GUARD ACTIVO ${shieldSeconds(game.player)}s`;
    }
    setTextIfChanged(elements.duoPrompt, prompt);
  }

  function renderFlowHud() {
    const visible = isFlowMode() && (game.running || game.countingDown);
    const swordVisible = game.running || game.countingDown;
    const swordMax = isFlowMode() ? CONFIG.flowSwordMax : CONFIG.competitiveSwordStart;
    setHiddenIfChanged(elements.flowHud, !visible);
    setHiddenIfChanged(elements.flowSwordCounter, !swordVisible);
    const charges = clamp(game.flowSwordCharges, 0, swordMax);
    setTextIfChanged(elements.flowSwordCount, charges);
    setTextIfChanged(elements.flowRivalSwordCount,
      `${isFlowMode() ? 'COMP' : 'RIVAL'} ${game.rivalSwordCharges}`);
    setAttributeIfChanged(elements.flowSwordCounter, 'data-empty', charges <= 0);
    setAttributeIfChanged(elements.flowSwordCounter, 'aria-label',
      `${charges} espadazos disponibles; ${isFlowMode() ? 'companero' : 'rival'} ${game.rivalSwordCharges}`);
    setTextIfChanged(elements.btnAttackLabel, `Espada ${charges}`);
    setAttributeIfChanged(elements.btnAttack, 'data-empty', charges <= 0);
    if (!visible) return;
    const active = [];
    const now = performance.now();
    if (game.player.shield) active.push(`GUARD VOS ${shieldSeconds(game.player, now)}s`);
    if (game.rival.shield) active.push(`GUARD COMP ${shieldSeconds(game.rival, now)}s`);
    const buffs = active.length ? active.join(' + ') : 'SIN GUARD';
    setTextIfChanged(elements.flowBuffs,
      `VIDAS ${game.lives}+${game.remoteLives} · ESPADAS V${charges}/C${game.rivalSwordCharges} · ${buffs}`);
  }

  function renderLatency() {
    const visible = isOnlineRace() && game.running && Number.isFinite(game.networkRtt);
    setHiddenIfChanged(elements.latencyHud, !visible);
    if (!visible) return;
    const rtt = Math.max(0, Math.round(game.networkRtt));
    setTextIfChanged(elements.latencyLabel, `${rtt} MS`);
    setAttributeIfChanged(elements.latencyHud, 'data-quality',
      rtt < 90 ? 'good' : (rtt < 180 ? 'fair' : 'poor'));
    setAttributeIfChanged(elements.latencyHud, 'aria-label', `Latencia ${rtt} milisegundos`);
  }

  function showToast(message) {
    clearTimeout(toastTimer);
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    toastTimer = setTimeout(() => elements.toast.classList.remove('show'), 620);
  }

  function renderEnemyKunaiToggle() {
    const visible = game.enemyKunaisVisible;
    elements.enemyKunaiToggle.setAttribute('aria-pressed', String(visible));
    elements.enemyKunaiToggle.setAttribute('aria-label',
      visible ? 'Ocultar los kunais del rival' : 'Mostrar los kunais del rival');
    elements.enemyKunaiLabel.textContent = visible ? 'ACTIVADOS' : 'OCULTOS';
  }

  function setEnemyKunaisVisible(visible, announce = true) {
    game.enemyKunaisVisible = Boolean(visible);
    try {
      localStorage.setItem('ninja_runner_enemy_kunais_visible_v2',
        game.enemyKunaisVisible ? '1' : '0');
    } catch (_) { /* Storage can be unavailable in privacy mode. */ }
    renderEnemyKunaiToggle();
    drawFrame();
    if (announce) showToast(game.enemyKunaisVisible ? 'KUNAIS RIVAL VISIBLES' : 'KUNAIS RIVAL OCULTOS');
    return game.enemyKunaisVisible;
  }

  function setPlayerName(value, persist = true) {
    game.playerName = normalizePlayerName(value);
    elements.playerNameInput.value = game.playerName;
    elements.playerNameHud.textContent = game.playerName;
    if (persist) {
      try {
        localStorage.setItem('ninja_runner_player_name_v1', game.playerName);
      } catch (_) { /* Storage can be unavailable in privacy mode. */ }
    }
    return game.playerName;
  }

  function renderGameType() {
    const duo = isDuoMode();
    const flow = isFlowMode();
    document.body.dataset.gameType = game.gameType;
    for (const card of elements.modeCards) {
      const selected = card.dataset.gameType === game.gameType;
      card.classList.toggle('selected', selected);
      card.setAttribute('aria-checked', String(selected));
    }
    elements.laneControl.hidden = !duo;
    elements.flowHorizontalControl.hidden = !flow;
    elements.btnLane.hidden = !duo || (!game.running && !game.countingDown);
    elements.btnBack.hidden = !flow;
    elements.btnForward.hidden = !flow;
    renderTouchScheme();
    if (elements.btnLaneLabel) {
      elements.btnLaneLabel.textContent = game.player.lane === 'player' ? 'Ir arriba' : 'Ir abajo';
    }
    elements.flowGuide.hidden = !flow;
    if (!flow) elements.flowGuide.open = false;
    elements.btnJumpLabel.textContent = flow ? 'Subir' : 'Saltar';
    elements.btnDuckLabel.textContent = flow ? 'Bajar' : 'Agacharse';
    elements.keyboardUpLabel.textContent = flow ? 'Subir' : 'Saltar';
    elements.keyboardUpHint.textContent = flow ? 'Mantener' : 'Kunai bajo';
    elements.keyboardDownLabel.textContent = flow ? 'Bajar' : 'Agacharse';
    elements.keyboardDownHint.textContent = flow ? 'Mantener' : 'Kunai alto';
    elements.keyboardAttackHint.textContent = flow ? 'Consume 1 carga; busca FILOS' : '5 cargas por carrera';
    elements.mobileControlsCopy.textContent = flow
      ? 'Movete libremente con el joystick y atacá con el botón de espada.'
      : 'Saltá, agachate y atacá con los botones en pantalla. Tenés 5 espadazos.';
    if (!game.running && !game.countingDown && !game.matchmaking) {
      const connected = Boolean(window.NinjaNetwork?.snapshot().connected);
      setNetworkStatus(connected ? 'online' : 'offline', flow
        ? 'BUSCA COMPANERO - SI NO, ENTRA EL BOT'
        : (connected ? 'SERVIDOR ONLINE · MATCHMAKING DISPONIBLE'
          : 'SERVIDOR SIN CONEXION · MODO BOT DISPONIBLE'));
    }
    if (flow) {
      elements.modeDescription.textContent =
        'Duo cooperativo: muevanse libremente, cubranse y capturen buffs hasta completar juntos el recorrido.';
      elements.startLabel.textContent = game.matchmaking ? 'BUSCANDO...' : 'BUSCAR COMPANERO';
      return;
    }
    elements.modeDescription.textContent = duo
      ? 'Elijan entre una ruta segura y otra con mejores recompensas. Ayudense, carguen Sincronia y lleguen juntos a la meta.'
      : 'Compet\u00ed en tiempo real contra otra persona. Si nadie se conecta, la carrera empieza autom\u00e1ticamente contra el bot.';
    elements.startLabel.textContent = game.matchmaking
      ? 'BUSCANDO...'
      : (duo ? 'BUSCAR COMPA\u00d1ERO' : 'BUSCAR RIVAL');
  }

  function setGameType(value) {
    if (game.running || game.matchmaking || game.countingDown) return false;
    game.gameType = ['duo', 'flow'].includes(value) ? 'flow' : 'competitive';
    game.player.lane = 'player';
    game.rival.lane = 'rival';
    renderGameType();
    drawFrame();
    return true;
  }

  function setPlayerLane(lane) {
    if (!isDuoMode() || !game.running || !['run', 'duck'].includes(game.player.mode)) return false;
    const now = performance.now();
    if (now < game.player.laneCooldownUntil) return false;
    const nextLane = lane === 'rival' ? 'rival' : 'player';
    if (game.player.lane === nextLane) return false;
    if (game.player.duckHeld) duckEnd();
    game.player.previousLane = game.player.lane;
    game.player.lane = nextLane;
    game.player.laneChangedAt = now;
    game.player.laneCooldownUntil = now + CONFIG.laneSwitchCooldownMs;
    if (elements.btnLaneLabel) {
      elements.btnLaneLabel.textContent = nextLane === 'player' ? 'Ir arriba' : 'Ir abajo';
    }
    showToast(nextLane === 'rival' ? 'CARRIL SUPERIOR' : 'CARRIL INFERIOR');
    return true;
  }

  function setRivalLane(lane, now = performance.now()) {
    const nextLane = lane === 'rival' ? 'rival' : 'player';
    if (game.rival.lane === nextLane || now < game.rival.laneCooldownUntil) return false;
    game.rival.previousLane = game.rival.lane;
    game.rival.lane = nextLane;
    game.rival.laneChangedAt = now;
    game.rival.laneCooldownUntil = now + CONFIG.laneSwitchCooldownMs;
    return true;
  }

  function switchPlayerLane() {
    return setPlayerLane(game.player.lane === 'player' ? 'rival' : 'player');
  }

  function addSync(amount, broadcast = true) {
    if (!isDuoMode() || !Number.isFinite(Number(amount))) return;
    const previous = game.syncMeter;
    game.syncMeter = clamp(game.syncMeter + Number(amount), 0, 100);
    if (broadcast && isOnlineRace()) window.NinjaNetwork?.sendDuoEvent({ kind: 'sync', amount });
    if (previous < 100 && game.syncMeter >= 100) {
      game.duoPatternClock = Math.max(game.duoPatternClock, 3.1);
      showToast('TORMENTA GEMELA LISTA');
    }
    renderDuoHud();
  }

  function activateDuoUltimate(broadcast = true) {
    if (!isDuoMode() || game.syncMeter < 100) return false;
    game.syncMeter = 0;
    game.ultimateArmUntil = 0;
    game.ultimateArmedByRemote = false;
    grantShield(game.player);
    game.ultimateFlashUntil = performance.now() + 850;
    for (const kunai of game.kunais) {
      if (!kunai.dead && kunai.x > CONFIG.hitX - 20) {
        kunai.dead = true;
        spawnExplosion(kunai.x, kunai.y, kunai.lane);
      }
    }
    for (const core of game.linkedCores) core.resolved = true;
    if (broadcast && isOnlineRace()) window.NinjaNetwork?.sendDuoEvent({ kind: 'ultimate' });
    if (!isOnlineRace() || game.duoHost) game.score += 500;
    showToast('TORMENTA GEMELA');
    renderDuoHud();
    return true;
  }

  function award(base, label) {
    game.combo += 1;
    game.stats.maxCombo = Math.max(game.stats.maxCombo, game.combo);
    const multiplier = Math.min(5, 1 + Math.floor((game.combo - 1) / 3));
    game.score += base * multiplier;
    if (!isFlowMode()) game.playerMeters = Math.min(CONFIG.raceLength, game.playerMeters + base / 28);
    renderHud();
    if (game.combo > 1) showToast(`${label} · ×${game.combo}`);
  }

  function doJump() {
    if (isFlowMode()) return false;
    if (!game.running || game.player.mode !== 'run') return false;
    press('w');
    setPlayerMode('jump', CONFIG.jumpMs);
    return true;
  }

  function duckStart() {
    if (isFlowMode()) return false;
    game.player.duckInputHeld = true;
    if (!game.running || game.player.duckHeld || game.player.mode !== 'run') return false;
    game.player.duckHeld = true;
    press('s');
    setPlayerMode('duck', 0);
    return true;
  }

  function duckEnd(releaseInput = true) {
    if (releaseInput) game.player.duckInputHeld = false;
    if (!game.player.duckHeld) return;
    game.player.duckHeld = false;
    release('s');
    if (game.player.mode === 'duck') setPlayerMode('run', 0);
  }

  function doAttack() {
    if (!game.running || !['run', 'duck'].includes(game.player.mode)) return false;
    if (game.flowSwordCharges <= 0) {
      if (isFlowMode()) showFlowActorNotice('player', 'SIN ESPADAZOS', '#ffcf63');
      showToast(isFlowMode() ? 'SIN ESPADAZOS - BUSCA FILOS +2' : 'SIN ESPADAZOS');
      renderFlowHud();
      return false;
    }
    if (game.player.duckHeld) duckEnd(false);
    const now = performance.now();
    press('j');
    setPlayerMode('attack', CONFIG.attackMs, now);
    game.flowSwordCharges = Math.max(0, game.flowSwordCharges - 1);
    game.stats.attacks += 1;
    game.lastAttackAt = now;
    renderFlowHud();
    if (game.syncMeter >= 100) {
      game.ultimateArmUntil = now + CONFIG.ultimateWindowMs;
      if (isOnlineRace()) {
        window.NinjaNetwork?.sendDuoEvent({ kind: 'ultimate-ready' });
        if (game.duoHost && game.ultimateArmedByRemote) activateDuoUltimate();
        else showToast(game.duoHost ? 'TORMENTA PREPARADA - ESPERANDO AL COMPANERO' :
          'RESPUESTA ENVIADA - SINCRONIZANDO TORMENTA');
      } else {
        if (game.ultimateArmedByRemote) activateDuoUltimate(false);
        else {
          game.ultimateArmedByRemote = true;
          setTimeout(() => {
            if (game.running && game.syncMeter >= 100 && performance.now() < game.ultimateArmUntil) {
              setRivalMode('attack', CONFIG.attackMs);
              activateDuoUltimate(false);
            }
          }, 480);
        }
      }
      renderDuoHud();
    }
    return true;
  }

  function tickPlayer(now) {
    if (!game.player.until || now < game.player.until) return;
    if (!['jump', 'attack', 'hit'].includes(game.player.mode)) return;
    if (game.player.mode === 'attack' && game.player.duckInputHeld) {
      game.player.duckHeld = true;
      press('s');
      setPlayerMode('duck', 0, now);
    } else {
      setPlayerMode('run', 0, now);
    }
  }

  function rivalLeadOffset() {
    return clamp((game.rivalMeters - game.playerMeters) * 1.35, -72, 72);
  }

  function setRivalMode(mode, duration, now = performance.now()) {
    game.rival.mode = mode;
    game.rival.actionStarted = now;
    game.rival.until = duration ? now + duration : 0;
  }

  function flowRivalCenterY() {
    return game.rivalFlowY - 74;
  }

  function flowActorHitX(role = 'player') {
    return role === 'rival' ? game.rivalFlowX : game.flowX;
  }

  function flowActorViewX(role = 'player') {
    return flowActorHitX(role) - (CONFIG.hitX - CONFIG.playerX);
  }

  function flowActorFxX(role = 'player') {
    return flowActorHitX(role) - 24;
  }

  function flowProjectileSpeed(now = performance.now()) {
    return game.speed;
  }

  function predictFlowProjectileY(projectile, targetX, speed = flowProjectileSpeed()) {
    if (!projectile || !Number.isFinite(projectile.y) || !Number.isFinite(projectile.vy)) return 350;
    const travelSeconds = Math.max(0, (projectile.x - targetX) / Math.max(1, speed));
    const minimum = 185;
    const maximum = 545;
    const span = maximum - minimum;
    const cycle = span * 2;
    const raw = projectile.y + projectile.vy * travelSeconds - minimum;
    const wrapped = ((raw % cycle) + cycle) % cycle;
    return minimum + (wrapped <= span ? wrapped : cycle - wrapped);
  }

  function tickFlowBot(now) {
    if (qaMode) return;
    if (game.rival.until && now >= game.rival.until) setRivalMode('run', 0, now);
    if (now >= game.rivalFlowDecisionAt) {
      game.rivalFlowDecisionAt = now + 230;
      const pickup = game.flowPickups
        .filter(item => !item.collected && item.x > flowActorHitX('rival') + 80 &&
          item.x < flowActorHitX('rival') + 440)
        .sort((a, b) => a.x - b.x)[0];
      const threats = game.flowProjectiles.filter(item =>
        !item.dead && item.x > flowActorHitX('rival') + 20 &&
        item.x < flowActorHitX('rival') + 440);
      const candidates = [205, 265, 325, 385, 445, 505, 535];
      const projectileSpeed = flowProjectileSpeed(now);
      const rivalHitX = flowActorHitX('rival');
      let bestY = flowRivalCenterY();
      let bestScore = -Infinity;
      for (const candidate of candidates) {
        const clearance = threats.length
          ? Math.min(...threats.map(item =>
            Math.abs(predictFlowProjectileY(item, rivalHitX, projectileSpeed) - candidate)))
          : 150;
        const needsBlades = pickup?.kind === 'blade' && game.rivalSwordCharges <= 3;
        const needsLife = pickup?.kind === 'life' && game.remoteLives < 3;
        const reward = pickup
          ? Math.max(0, 130 - Math.abs(pickup.y - candidate)) *
            (needsLife ? 1.85 : (needsBlades ? 1.55 : .8))
          : 0;
        const travel = Math.abs(flowRivalCenterY() - candidate) * .16;
        const score = clearance + reward - travel;
        if (score > bestScore) {
          bestScore = score;
          bestY = candidate;
        }
      }
      game.rivalFlowTargetY = clamp(bestY + 74, CONFIG.flowMinY, CONFIG.flowMaxY);
      // El Escudo nunca arrastra ni reposiciona al companero. El bot conserva
      // su propia trayectoria y la cobertura solo nace de una alineacion real.
      game.rivalFlowTargetX = CONFIG.hitX - CONFIG.flowSeparation;
    }
    if (game.rival.mode !== 'run' || game.rivalSwordCharges <= 0) return;
    const rivalHitX = flowActorHitX('rival');
    const target = game.flowProjectiles.find(item =>
      !item.dead && item.x >= rivalHitX + 5 &&
      item.x <= rivalHitX + 225 &&
      Math.abs(item.y - flowRivalCenterY()) <= 68);
    if (target) {
      game.rivalSwordCharges = Math.max(0, game.rivalSwordCharges - 1);
      game.rivalStats.attacks += 1;
      setRivalMode('attack', CONFIG.attackMs, now);
      renderFlowHud();
    }
  }

  function tickRival(now) {
    if (isOnlineRace()) return;
    if (isFlowMode()) {
      tickFlowBot(now);
      return;
    }
    if (game.rival.until && now >= game.rival.until) setRivalMode('run', 0, now);

    const encounterCueActive = game.duoCue && now < game.duoCueUntil;
    if (isDuoMode() && game.syncMeter >= 100 && game.rival.mode === 'run' &&
        now >= game.ultimateArmUntil && !encounterCueActive) {
      game.ultimateArmedByRemote = true;
      game.ultimateArmUntil = now + CONFIG.ultimateWindowMs;
      game.rivalStats.attacks += 1;
      setRivalMode('attack', CONFIG.attackMs, now);
      showToast('TU COMPANERO PREPARO LA TORMENTA - ATACA');
      renderDuoHud();
      return;
    }

    const usefulPickup = isDuoMode() ? game.pickups
      .filter(pickup => !pickup.collected && pickup.x > CONFIG.hitX && pickup.x < CONFIG.spawnX + 350)
      .sort((a, b) => a.x - b.x)[0] : null;
    if (usefulPickup && usefulPickup.lane !== game.rival.lane &&
        laneThreatCount(usefulPickup.lane) <= laneThreatCount(game.rival.lane)) {
      setRivalLane(usefulPickup.lane, now);
    }

    const targetCore = isDuoMode() ? game.linkedCores
      .filter(core => !core.resolved && core.lane === game.rival.lane)
      .sort((a, b) => a.x - b.x)[0] : null;
    if (targetCore && game.rival.mode === 'run' &&
        targetCore.x - (CONFIG.combatX + rivalLeadOffset()) < 220) {
      game.rivalStats.attacks += 1;
      setRivalMode('attack', CONFIG.attackMs, now);
      return;
    }

    const target = game.kunais
      .filter(kunai => kunai.lane === actorCollisionLane(game.rival, now) && !kunai.dead && !kunai.resolved)
      .sort((a, b) => a.x - b.x)[0];
    if (!target) {
      game.rival.targetKunaiId = null;
      game.rival.plannedAction = null;
      return;
    }

    if (game.rival.targetKunaiId !== target.id) {
      game.rival.targetKunaiId = target.id;
      game.rival.decisions += 1;
      const deliberateMistake = game.elapsed > 12 && Math.random() < .08;
      const otherLane = game.rival.lane === 'rival' ? 'player' : 'rival';
      const saferRoute = laneThreatCount(otherLane) + 1 < laneThreatCount(game.rival.lane);
      game.rival.plannedAction = isDuoMode() && (saferRoute || game.rival.decisions % 4 === 0)
        ? 'switch'
        : deliberateMistake
        ? 'miss'
        : (game.rivalSwordCharges > 0 && game.rival.decisions % 3 === 0
          ? 'attack' : (target.height === 'low' ? 'jump' : 'duck'));
    }

    if (game.rival.mode !== 'run') return;
    const combatX = CONFIG.combatX + rivalLeadOffset();
    const distance = target.x - combatX;
    if (game.rival.plannedAction === 'switch' && distance < 205) {
      setRivalLane(game.rival.lane === 'rival' ? 'player' : 'rival', now);
      game.rival.targetKunaiId = null;
      game.rival.plannedAction = null;
    } else if (game.rival.plannedAction === 'attack' && distance < 220) {
      game.rivalSwordCharges = Math.max(0, game.rivalSwordCharges - 1);
      game.rivalStats.attacks += 1;
      setRivalMode('attack', CONFIG.attackMs, now);
      renderFlowHud();
    } else if (game.rival.plannedAction === 'jump' && distance < 145) {
      setRivalMode('jump', CONFIG.jumpMs, now);
    } else if (game.rival.plannedAction === 'duck' && distance < 135) {
      setRivalMode('duck', 720, now);
    }
  }

  function spawnKunai(height = Math.random() < .5 ? 'high' : 'low', x = CONFIG.spawnX,
      lane = 'player', options = {}) {
    const normalizedHeight = height === 'high' ? 'high' : 'low';
    const normalizedLane = lane === 'rival' ? 'rival' : 'player';
    const kunai = {
      id: game.nextKunaiId++,
      x,
      previousX: x,
      y: normalizedLane === 'rival'
        ? (normalizedHeight === 'high' ? CONFIG.rivalHighY : CONFIG.rivalLowY)
        : (normalizedHeight === 'high' ? CONFIG.highY : CONFIG.lowY),
      height: normalizedHeight,
      lane: normalizedLane,
      linkId: options.linkId ? String(options.linkId) : '',
      phase: Math.random() * Math.PI * 2,
      resolved: false,
      dead: false
    };
    game.kunais.push(kunai);
    if ((normalizedLane === 'player' || isDuoMode()) && isOnlineRace() && game.running) {
      window.NinjaNetwork?.sendKunaiSpawn({
        id: String(kunai.id),
        x: kunai.x,
        height: kunai.height,
        lane: kunai.lane,
        linkId: kunai.linkId,
        phase: kunai.phase,
        resolved: false
      });
    }
    return kunai;
  }

  function nextDuoId(prefix) {
    return `${prefix}-${game.nextDuoObjectId++}`;
  }

  function spawnPickup(kind, lane, x = CONFIG.spawnX, id = nextDuoId('pickup'), broadcast = true) {
    const pickup = {
      id: String(id),
      kind: ['shield', 'medkit'].includes(kind) ? kind : 'sync',
      lane: lane === 'rival' ? 'rival' : 'player',
      x: Number(x) || CONFIG.spawnX,
      previousX: Number(x) || CONFIG.spawnX,
      collected: false,
      phase: Math.random() * Math.PI * 2
    };
    if (!game.pickups.some(item => item.id === pickup.id)) game.pickups.push(pickup);
    if (broadcast && isOnlineRace()) window.NinjaNetwork?.sendDuoEvent({
      kind: 'pickup-spawn',
      id: pickup.id,
      pickupKind: pickup.kind,
      lane: pickup.lane,
      x: pickup.x,
      phase: pickup.phase
    });
    return pickup;
  }

  function spawnLinkedCore(lane, targetLane, x = CONFIG.spawnX, id = nextDuoId('core'), broadcast = true) {
    const core = {
      id: String(id),
      lane: lane === 'rival' ? 'rival' : 'player',
      targetLane: targetLane === 'rival' ? 'rival' : 'player',
      x: Number(x) || CONFIG.spawnX,
      previousX: Number(x) || CONFIG.spawnX,
      resolved: false,
      phase: Math.random() * Math.PI * 2
    };
    if (!game.linkedCores.some(item => item.id === core.id)) game.linkedCores.push(core);
    if (broadcast && isOnlineRace()) window.NinjaNetwork?.sendDuoEvent({
      kind: 'core-spawn',
      id: core.id,
      lane: core.lane,
      targetLane: core.targetLane,
      x: core.x,
      phase: core.phase
    });
    return core;
  }

  function setDuoCue(cue, rewardLane, dangerLane, plan = '', broadcast = true) {
    game.duoCue = {
      cue: String(cue || 'PREPARENSE'),
      rewardLane: rewardLane === 'rival' ? 'rival' : 'player',
      dangerLane: dangerLane === 'rival' ? 'rival' : 'player',
      plan: String(plan || '')
    };
    game.duoCueUntil = performance.now() + CONFIG.duoDecisionMs;
    if (broadcast && isOnlineRace()) window.NinjaNetwork?.sendDuoEvent({
      kind: 'pattern-cue',
      cue: game.duoCue.cue,
      plan: game.duoCue.plan,
      lane: game.duoCue.rewardLane,
      targetLane: game.duoCue.dangerLane
    });
  }

  function chooseDuoPattern() {
    const progress = clamp(Math.max(game.playerMeters, game.rivalMeters) / CONFIG.raceLength, 0, 1);
    const pool = progress < .22
      ? ['route', 'mirror', 'support']
      : (progress < .68
        ? ['route', 'mirror', 'support', 'core', 'core']
        : ['route', 'mirror', 'core', 'core', 'support']);
    const choices = pool.filter(name => name !== game.duoPatternLast);
    const pattern = choices[Math.floor(Math.random() * choices.length)] || pool[0];
    const firstVisit = !game.duoPatternSeen[pattern];
    game.duoPatternSeen[pattern] += 1;
    game.duoPatternLast = pattern;
    game.duoPatternIndex += 1;
    return { pattern, progress, firstVisit };
  }

  function spawnDuoPattern() {
    const { pattern, progress, firstVisit } = chooseDuoPattern();
    const dangerLane = Math.random() < .5 ? 'rival' : 'player';
    const safeLane = dangerLane === 'rival' ? 'player' : 'rival';
    const responseSeconds = (CONFIG.duoResponseGapMs - progress * 120) / 1000;
    const spacing = game.speed * responseSeconds;
    const baseX = CONFIG.spawnX + 30;

    if (pattern === 'route') {
      setDuoCue('ELIJAN LA RUTA', dangerLane, dangerLane,
        firstVisit ? 'SEGURO O RIESGO + S' : 'AGACHAR > SALTAR > S');
      spawnKunai('high', baseX, dangerLane);
      if (!firstVisit) {
        spawnKunai('low', baseX + spacing, dangerLane);
        spawnKunai('high', baseX + spacing * .55, safeLane);
      }
      spawnPickup('sync', dangerLane, baseX + spacing * 1.45);
    } else if (pattern === 'mirror') {
      setDuoCue('ACCIONES EN PAREJA', safeLane, dangerLane,
        firstVisit ? 'AMBOS: AGACHAR' : 'AMBOS: AGACHAR > UNO SALTA');
      spawnKunai('high', baseX, 'rival');
      spawnKunai('high', baseX, 'player');
      if (!firstVisit) spawnKunai('low', baseX + spacing * 1.2, safeLane);
    } else if (pattern === 'core') {
      setDuoCue('PROTECCION CRUZADA', safeLane, dangerLane, 'UNO ATACA > EL OTRO AVANZA');
      const coreId = nextDuoId('core');
      spawnLinkedCore(safeLane, dangerLane, baseX, coreId);
      spawnKunai('high', baseX + spacing * .9, dangerLane, { linkId: coreId });
      if (!firstVisit) spawnKunai('high', baseX + spacing * 1.65, dangerLane, { linkId: coreId });
    } else {
      setDuoCue('APOYO DE EQUIPO', safeLane, dangerLane,
        firstVisit ? 'CAMBIAR > RECOGER' : 'CAMBIAR > RECOGER > SALTAR');
      spawnPickup(game.lives < 3 || game.remoteLives < 3 ? 'medkit' : 'shield', safeLane, baseX);
      spawnKunai('high', baseX + spacing * .55, dangerLane);
      if (!firstVisit) spawnKunai('low', baseX + spacing * 1.35, safeLane);
    }
  }

  function setFlowMove(direction) {
    if (!isFlowMode() || !game.running) return false;
    game.flowMove = clamp(Number(direction) || 0, -1, 1);
    return true;
  }

  function setFlowMoveX(direction) {
    if (!isFlowMode() || !game.running) return false;
    game.flowMoveX = clamp(Number(direction) || 0, -1, 1);
    return true;
  }

  function setFlowVector(x, y) {
    let nextX = clamp(Number(x) || 0, -1, 1);
    let nextY = clamp(Number(y) || 0, -1, 1);
    const magnitude = Math.hypot(nextX, nextY);
    if (magnitude > 1) {
      nextX /= magnitude;
      nextY /= magnitude;
    }
    if (!isFlowMode() || !game.running) return false;
    game.flowMoveX = nextX;
    game.flowMove = nextY;
    return true;
  }

  const flowJoystickState = {
    pointerId: null,
    centerX: 0,
    centerY: 0,
    travel: 42,
    active: false
  };

  function resetFlowJoystick() {
    flowJoystickState.pointerId = null;
    flowJoystickState.active = false;
    game.flowMove = 0;
    game.flowMoveX = 0;
    elements.flowJoystick?.classList.remove('is-active');
    if (elements.flowJoystickBase) {
      elements.flowJoystickBase.style.removeProperty('left');
      elements.flowJoystickBase.style.removeProperty('top');
    }
    if (elements.flowJoystickKnob) {
      elements.flowJoystickKnob.style.transform = 'translate3d(0, 0, 0)';
    }
  }

  function renderTouchScheme() {
    const available = isFlowMode() && touchCapable;
    elements.flowJoystick.hidden = !available;
    resetFlowJoystick();
  }

  function updateFlowJoystick(event) {
    if (event.pointerId !== flowJoystickState.pointerId) return;
    const dx = event.clientX - flowJoystickState.centerX;
    const dy = event.clientY - flowJoystickState.centerY;
    const distance = Math.hypot(dx, dy);
    const scale = distance > flowJoystickState.travel
      ? flowJoystickState.travel / distance : 1;
    const visualX = dx * scale;
    const visualY = dy * scale;
    elements.flowJoystickKnob.style.transform =
      `translate3d(${visualX.toFixed(1)}px, ${visualY.toFixed(1)}px, 0)`;

    const rawMagnitude = Math.min(1, distance / flowJoystickState.travel);
    const deadzone = .15;
    if (rawMagnitude <= deadzone || distance === 0) {
      setFlowVector(0, 0);
      return;
    }
    const response = (rawMagnitude - deadzone) / (1 - deadzone);
    setFlowVector((dx / distance) * response, (dy / distance) * response);
  }

  function beginFlowJoystick(event) {
    if (!isFlowMode() || flowJoystickState.pointerId !== null) return;
    event.preventDefault();
    const bounds = elements.flowJoystick.getBoundingClientRect();
    const diameter = elements.flowJoystickBase.offsetWidth || 132;
    const edge = diameter * .5;
    const localX = clamp(event.clientX - bounds.left, edge, Math.max(edge, bounds.width - edge));
    const localY = clamp(event.clientY - bounds.top, edge, Math.max(edge, bounds.height - edge));
    flowJoystickState.pointerId = event.pointerId;
    flowJoystickState.centerX = bounds.left + localX;
    flowJoystickState.centerY = bounds.top + localY;
    flowJoystickState.travel = diameter * .32;
    flowJoystickState.active = true;
    elements.flowJoystickBase.style.left = `${localX}px`;
    elements.flowJoystickBase.style.top = `${localY}px`;
    elements.flowJoystick.classList.add('is-active');
    const capturedCenterX = flowJoystickState.centerX;
    const capturedCenterY = flowJoystickState.centerY;
    try { elements.flowJoystick.setPointerCapture?.(event.pointerId); } catch (_) { /* Synthetic input. */ }
    flowJoystickState.centerX = capturedCenterX;
    flowJoystickState.centerY = capturedCenterY;
    updateFlowJoystick(event);
  }

  function endFlowJoystick(event) {
    if (event && event.pointerId !== flowJoystickState.pointerId) return;
    resetFlowJoystick();
  }

  function testFlowJoystick(pointerId, startX, startY, endX, endY) {
    const previousCapture = elements.flowJoystick.setPointerCapture;
    elements.flowJoystick.setPointerCapture = undefined;
    try {
      beginFlowJoystick({ pointerId, clientX: startX, clientY: startY, preventDefault() {} });
      flowJoystickState.centerX = startX;
      flowJoystickState.centerY = startY;
      updateFlowJoystick({ pointerId, clientX: endX, clientY: endY });
    } finally {
      elements.flowJoystick.setPointerCapture = previousCapture;
    }
  }

  function flowPlayerCenterY() {
    return game.flowY - 76;
  }

  function spawnFlowProjectile(kind = 'white', x = CONFIG.spawnX, y = 350, vy = 0,
      id = '', broadcast = true) {
    if (game.flowProjectiles.filter(item => !item.dead).length >= CONFIG.flowMaxProjectiles) {
      return null;
    }
    const projectile = {
      id: id || nextDuoId('flow-kunai'),
      kind: kind === 'violet' ? 'violet' : 'white',
      x: Number(x) || CONFIG.spawnX,
      previousX: Number(x) || CONFIG.spawnX,
      y: clamp(Number(y) || 350, 185, 545),
      vy: clamp(Number(vy) || 0, -95, 95),
      phase: Math.random() * Math.PI * 2,
      resolved: false,
      rivalResolved: false,
      dead: false
    };
    game.flowProjectiles.push(projectile);
    if (broadcast && isOnlineRace() && game.duoHost) {
      window.NinjaNetwork?.sendDuoEvent({
        kind: 'flow-projectile',
        id: projectile.id,
        projectileKind: projectile.kind,
        x: projectile.x,
        y: projectile.y,
        vy: projectile.vy,
        phase: projectile.phase
      });
    }
    return projectile;
  }

  function spawnFlowPickup(kind, x = CONFIG.spawnX + 180, y = 350,
      id = '', broadcast = true) {
    const allowed = ['shield', 'blast', 'blade', 'life'];
    const pickup = {
      id: id || nextDuoId('flow-buff'),
      kind: allowed.includes(kind) ? kind : 'shield',
      x: Number(x) || CONFIG.spawnX + 180,
      previousX: Number(x) || CONFIG.spawnX + 180,
      y: clamp(Number(y) || 350, 195, 535),
      phase: Math.random() * Math.PI * 2,
      collected: false
    };
    game.flowPickups.push(pickup);
    if (broadcast && isOnlineRace() && game.duoHost) {
      window.NinjaNetwork?.sendDuoEvent({
        kind: 'flow-pickup',
        id: pickup.id,
        pickupKind: pickup.kind,
        x: pickup.x,
        y: pickup.y,
        phase: pickup.phase
      });
    }
    return pickup;
  }

  function flowProjectileKind(progress, index = 0) {
    const roll = Math.random();
    if (roll < .3 || (progress > .7 && index % 4 === 0)) return 'violet';
    return 'white';
  }

  function chooseFlowBuff() {
    const roll = Math.random();
    const teamNeedsLife = game.lives < 3 || game.remoteLives < 3;
    if (teamNeedsLife && roll < .3) return 'life';
    if (roll < .55) return 'shield';
    if (roll < .86) return 'blade';
    return 'blast';
  }

  function spawnFlowPattern() {
    const progress = clamp(game.playerMeters / CONFIG.flowLength, 0, 1);
    const pool = progress < .28
      ? ['wall', 'diagonal', 'wall', 'diagonal']
      : (progress < .68
        ? ['wall', 'diagonal', 'pinch', 'serpent', 'crossfire']
        : ['diagonal', 'pinch', 'serpent', 'crossfire', 'serpent']);
    const choices = pool.filter(name => name !== game.flowPatternLast);
    const pattern = choices[Math.floor(Math.random() * choices.length)] || pool[0];
    game.flowPatternLast = pattern;
    game.flowPatternIndex += 1;
    const baseX = CONFIG.spawnX + 80;
    let rewardY = 350;

    if (pattern === 'wall') {
      const gapY = 235 + Math.random() * 260;
      rewardY = gapY;
      for (let y = 195, index = 0; y <= 535; y += 58, index += 1) {
        if (Math.abs(y - gapY) < 105) continue;
        spawnFlowProjectile(flowProjectileKind(progress, index), baseX, y);
      }
      game.flowCue = 'BUSCA EL HUECO';
    } else if (pattern === 'diagonal') {
      const ascending = Math.random() < .5;
      for (let index = 0; index < 6; index += 1) {
        const y = ascending ? 205 + index * 62 : 515 - index * 62;
        spawnFlowProjectile(flowProjectileKind(progress, index), baseX + index * 78, y);
      }
      rewardY = ascending ? 500 : 220;
      game.flowCue = ascending ? 'ACOMPANA LA SUBIDA' : 'ACOMPANA LA BAJADA';
    } else if (pattern === 'pinch') {
      for (const y of [195, 250, 480, 535]) spawnFlowProjectile(flowProjectileKind(progress), baseX, y);
      for (const y of [210, 520]) spawnFlowProjectile(flowProjectileKind(progress), baseX + 245, y);
      rewardY = 365;
      game.flowCue = 'MANTENE EL CENTRO';
    } else if (pattern === 'serpent') {
      for (let index = 0; index < 7; index += 1) {
        const y = 360 + Math.sin(index * 1.18) * 145;
        spawnFlowProjectile(flowProjectileKind(progress, index), baseX + index * 76, y);
      }
      rewardY = 360 + Math.sin(3 * 1.18 + Math.PI) * 118;
      game.flowCue = 'LEE LA SERPIENTE';
    } else {
      for (let index = 0; index < 6; index += 1) {
        const fromTop = index % 2 === 0;
        spawnFlowProjectile(flowProjectileKind(progress, index), baseX + index * 82,
          fromTop ? 205 : 525, fromTop ? 82 : -82);
      }
      rewardY = 360;
      game.flowCue = 'CRUCEN Y CUBRANSE';
    }

    game.flowCueUntil = performance.now() + 2000;
    if (isOnlineRace() && game.duoHost) {
      window.NinjaNetwork?.sendDuoEvent({ kind: 'pattern-cue', cue: game.flowCue });
    }
    if (game.flowPatternIndex === 1 || game.flowPatternIndex % 2 === 0) {
      spawnFlowPickup(chooseFlowBuff(), baseX + 190, rewardY);
    }
  }

  function awardFlow(base, label) {
    game.combo += 1;
    game.stats.maxCombo = Math.max(game.stats.maxCombo, game.combo);
    const multiplier = Math.min(5, 1 + Math.floor((game.combo - 1) / 4));
    game.score += base * multiplier;
    if (game.combo > 1 && (game.combo % 3 === 0 || label !== 'ESQUIVA')) {
      showToast(`${label} - RACHA x${game.combo}`);
    }
  }

  function showFlowActorNotice(role, text, color) {
    const normalizedRole = role === 'rival' ? 'rival' : 'player';
    game.flowActorNotices = game.flowActorNotices.filter(notice => notice.role !== normalizedRole);
    game.flowActorNotices.push({
      role: normalizedRole,
      text: String(text || '').slice(0, 34),
      color: color || (normalizedRole === 'player' ? '#8af8ef' : '#d6b7ff'),
      until: performance.now() + 1250
    });
  }

  function applyFlowBuff(kind, now, collector = 'player', awardPickup = true) {
    if (!['shield', 'blast', 'blade', 'life'].includes(kind)) return false;
    const role = collector === 'rival' ? 'rival' : 'player';
    const actor = role === 'rival' ? game.rival : game.player;
    const owner = role === 'player' ? 'VOS' : 'TU COMPANERO';
    let bonus = 120;
    if (kind === 'shield') {
      grantShield(actor, now);
      showFlowActorNotice(role, '+ GUARD 10s', role === 'player' ? '#75f7ef' : '#d5b4ff');
      showToast(`${owner} RECOGIO GUARD - 10 SEGUNDOS`);
    } else if (kind === 'life') {
      const key = role === 'player' ? 'lives' : 'remoteLives';
      const before = game[key];
      game[key] = Math.min(3, before + 1);
      const gained = game[key] - before;
      bonus += gained * 90;
      if (gained) {
        showFlowActorNotice(role, '+1 VIDA', '#ff7583');
        showToast(`${owner} RECUPERO 1 VIDA`);
      } else {
        const swordKey = role === 'player' ? 'flowSwordCharges' : 'rivalSwordCharges';
        const swordsBefore = game[swordKey];
        game[swordKey] = Math.min(CONFIG.flowSwordMax,
          swordsBefore + CONFIG.fullLifeSwordPickup);
        const swordsGained = game[swordKey] - swordsBefore;
        bonus += swordsGained * 35;
        showFlowActorNotice(role, swordsGained ? '+1 ESPADAZO' : 'VIDA Y ESPADAS LLENAS',
          swordsGained ? '#ffcf63' : '#ff9da8');
        showToast(swordsGained
          ? `${owner}: VIDA LLENA - +1 ESPADAZO`
          : `${owner} YA TIENE VIDA Y ESPADAS LLENAS`);
      }
    } else if (kind === 'blade') {
      const key = role === 'player' ? 'flowSwordCharges' : 'rivalSwordCharges';
      const before = game[key];
      game[key] = Math.min(CONFIG.flowSwordMax, before + CONFIG.flowSwordPickup);
      const gained = game[key] - before;
      bonus += gained * 35;
      showFlowActorNotice(role, gained ? `+${gained} ESPADAZOS` : 'ESPADAS LLENAS', '#ffcf63');
      showToast(gained ? `${owner} RECARGO ${gained} ESPADAZOS` : `${owner} YA TIENE 8 ESPADAZOS`);
    } else {
      let destroyed = 0;
      for (const projectile of game.flowProjectiles) {
        if (projectile.dead) continue;
        projectile.dead = true;
        projectile.resolved = true;
        projectile.rivalResolved = true;
        destroyed += 1;
        if (projectile.x > -60 && projectile.x < W + 120) {
          spawnExplosion(projectile.x, projectile.y, role);
        }
      }
      bonus += destroyed * 45;
      game.flowBlastUntil = now + 720;
      game.flowBlastRole = role;
      showFlowActorNotice(role, 'EXPLOSION TOTAL', '#ffd56a');
      showToast(`${owner} ACTIVO EXPLOSION TOTAL - ${destroyed} KUNAIS`);
    }
    if (awardPickup) {
      if (role === 'player') game.score += bonus;
      else game.rivalStats.score += bonus;
    }
    renderHud();
    return true;
  }

  function collectFlowPickup(pickup, now, collector = 'player') {
    pickup.collected = true;
    applyFlowBuff(pickup.kind, now, collector);
    if (isOnlineRace()) {
      window.NinjaNetwork?.sendDuoEvent({
        kind: 'flow-pickup-collected',
        id: pickup.id,
        pickupKind: pickup.kind,
        collector: 'player'
      });
    }
  }

  function updateFlowObjects(dt, now) {
    const projectileSpeed = flowProjectileSpeed(now);
    const strikeLive = attackIsLive(now);
    const previousPlayerHitX = flowActorHitX('player');
    const previousRivalHitX = flowActorHitX('rival');
    game.flowY = clamp(game.flowY + game.flowMove * CONFIG.flowMoveSpeed * dt,
      CONFIG.flowMinY, CONFIG.flowMaxY);
    game.flowX = clamp(game.flowX + game.flowMoveX * CONFIG.flowHorizontalSpeed * dt,
      CONFIG.flowMinX, CONFIG.flowMaxX);
    if (isOnlineRace()) {
      game.rivalFlowY += (game.rivalFlowTargetY - game.rivalFlowY) * Math.min(1, dt * 11);
      game.rivalFlowX += (game.rivalFlowTargetX - game.rivalFlowX) * Math.min(1, dt * 11);
    } else {
      const step = CONFIG.flowMoveSpeed * .86 * dt;
      game.rivalFlowY += clamp(game.rivalFlowTargetY - game.rivalFlowY, -step, step);
      const horizontalStep = CONFIG.flowHorizontalSpeed * .82 * dt;
      game.rivalFlowX += clamp(game.rivalFlowTargetX - game.rivalFlowX,
        -horizontalStep, horizontalStep);
    }
    game.rivalFlowY = clamp(game.rivalFlowY, CONFIG.flowMinY, CONFIG.flowMaxY);
    game.rivalFlowX = clamp(game.rivalFlowX, CONFIG.flowMinX, CONFIG.flowMaxX);
    const centerY = flowPlayerCenterY();
    const rivalCenterY = flowRivalCenterY();
    const playerHitX = flowActorHitX('player');
    const rivalHitX = flowActorHitX('rival');
    const rivalStrikeLive = !isOnlineRace() && rivalAttackIsLive(now);

    for (const projectile of game.flowProjectiles) {
      projectile.previousX = projectile.x;
      projectile.x -= projectileSpeed * dt;
      projectile.y += projectile.vy * dt;
      if (projectile.y < 185 || projectile.y > 545) {
        projectile.y = clamp(projectile.y, 185, 545);
        projectile.vy *= -1;
      }
      if (projectile.dead) continue;
      const rivalStrike = rivalStrikeLive &&
        projectile.x >= rivalHitX + 5 &&
        projectile.x <= rivalHitX + 180 &&
        Math.abs(projectile.y - rivalCenterY) <= 68;
      const inStrike = strikeLive &&
        projectile.x >= playerHitX + 5 &&
        projectile.x <= playerHitX + 180 &&
        Math.abs(projectile.y - centerY) <= 72;
      const cutter = inStrike && rivalStrike
        ? (playerHitX >= rivalHitX ? 'player' : 'rival')
        : (inStrike ? 'player' : (rivalStrike ? 'rival' : ''));
      if (cutter) {
        projectile.dead = true;
        projectile.resolved = true;
        projectile.rivalResolved = true;
        spawnExplosion(projectile.x, projectile.y, cutter);
        if (cutter === 'player') {
          game.stats.cuts += 1;
          awardFlow(projectile.kind === 'violet' ? 180 : 120, 'CORTE');
        } else {
          game.rivalStats.cuts += 1;
          game.rivalStats.score += projectile.kind === 'violet' ? 180 : 120;
        }
        if (isOnlineRace()) {
          window.NinjaNetwork?.sendDuoEvent({ kind: 'flow-resolved', id: projectile.id });
        }
        continue;
      }
      const crossings = [{
        role: 'player', x: playerHitX, previousX: previousPlayerHitX, y: centerY
      }];
      if (!isOnlineRace()) crossings.push({
        role: 'rival', x: rivalHitX, previousX: previousRivalHitX, y: rivalCenterY
      });
      crossings.sort((a, b) => b.x - a.x);
      for (const crossing of crossings) {
        if (projectile.dead) break;
        const resolvedKey = crossing.role === 'player' ? 'resolved' : 'rivalResolved';
        const crossed = projectile.previousX > crossing.previousX && projectile.x <= crossing.x;
        if (!crossed || projectile[resolvedKey]) continue;
        if (Math.abs(projectile.y - crossing.y) > CONFIG.flowHitRadius) {
          projectile[resolvedKey] = true;
          if (crossing.role === 'player') {
            game.stats.dodges += 1;
            awardFlow(45, 'ESQUIVA');
          } else {
            game.rivalStats.dodges += 1;
            game.rivalStats.score += 45;
          }
          continue;
        }
        const crossingActor = crossing.role === 'player' ? game.player : game.rival;
        if (now < crossingActor.invulnerableUntil) {
          projectile[resolvedKey] = true;
          continue;
        }
        projectile.dead = true;
        projectile[resolvedKey] = true;
        if (crossing.role === 'player') {
          if (takeHit(now)) game.combo = 0;
          continue;
        }
        spawnExplosion(rivalHitX, rivalCenterY, 'rival');
        if (now < game.rival.invulnerableUntil) continue;
        if (game.rival.shield) {
          consumeShield(game.rival);
          game.rival.invulnerableUntil = now + 520;
          showFlowActorNotice('rival', 'GUARD BLOQUEO', '#d5b4ff');
          showToast('EL GUARD DE TU COMPANERO BLOQUEO EL KUNAI');
        } else {
          game.remoteLives = Math.max(0, game.remoteLives - 1);
          game.rivalStats.hitsReceived += 1;
          game.rival.invulnerableUntil = now + CONFIG.hitMs + 620;
          setRivalMode('hit', CONFIG.hitMs, now);
          showFlowActorNotice('rival', '-1 VIDA', '#ff7b91');
          showToast('UN KUNAI GOLPEO A TU COMPANERO');
        }
      }
    }

    for (const pickup of game.flowPickups) {
      pickup.previousX = pickup.x;
      pickup.x -= projectileSpeed * .88 * dt;
      const collectors = [{
        role: 'player', x: playerHitX, previousX: previousPlayerHitX, y: centerY
      }];
      if (!isOnlineRace()) collectors.push({
        role: 'rival', x: rivalHitX, previousX: previousRivalHitX, y: rivalCenterY
      });
      collectors.sort((a, b) => b.x - a.x);
      for (const collector of collectors) {
        if (pickup.collected) break;
        if (pickup.previousX > collector.previousX && pickup.x <= collector.x &&
            Math.abs(pickup.y - collector.y) <= 58) {
          collectFlowPickup(pickup, now, collector.role);
        }
      }
    }
    if (!isOnlineRace() && game.remoteLives <= 0 && !game.over) {
      game.outcome = 'flow-defeat';
      game.over = true;
      game.running = false;
      setRunnerAutoRun(false);
      setRivalMode('dead', 0, now);
      showToast('TU COMPANERO QUEDO FUERA');
      setTimeout(showGameOver, CONFIG.deathMs);
    }
    game.flowProjectiles = game.flowProjectiles.filter(item => !item.dead && item.x > -100);
    game.flowPickups = game.flowPickups.filter(item => !item.collected && item.x > -100);
  }

  function attackIsLive(now) {
    if (game.player.mode !== 'attack') return false;
    const age = now - game.player.actionStarted;
    return age >= CONFIG.strikeStartMs && age <= CONFIG.strikeEndMs;
  }

  function rivalAttackIsLive(now) {
    if (game.rival.mode !== 'attack') return false;
    const age = now - game.rival.actionStarted;
    return age >= CONFIG.strikeStartMs && age <= CONFIG.strikeEndMs;
  }

  function resolveRivalKunai(kunai, now) {
    const hitX = CONFIG.combatX + rivalLeadOffset();
    const attackMinX = hitX + 35;
    const attackMaxX = hitX + 180;

    if (rivalAttackIsLive(now) && kunai.x >= attackMinX && kunai.x <= attackMaxX) {
      kunai.dead = true;
      kunai.resolved = true;
      game.rivalMeters = Math.min(CONFIG.raceLength, game.rivalMeters + 5.5);
      game.rivalStats.cuts += 1;
      game.rivalStats.score += 150;
      game.rivalStats.currentCombo += 1;
      game.rivalStats.maxCombo = Math.max(game.rivalStats.maxCombo, game.rivalStats.currentCombo);
      spawnExplosion(clamp(kunai.x - 5, attackMinX, attackMaxX), kunai.y, 'rival');
      if (isDuoMode()) addSync(4);
      return;
    }

    const crossedRival = kunai.previousX > hitX && kunai.x <= hitX;
    if (!crossedRival || kunai.resolved) return;
    const dodged = (kunai.height === 'low' && game.rival.mode === 'jump') ||
      (kunai.height === 'high' && game.rival.mode === 'duck');

    if (dodged) {
      kunai.resolved = true;
      game.rivalMeters = Math.min(CONFIG.raceLength, game.rivalMeters + 3.2);
      game.rivalStats.dodges += 1;
      game.rivalStats.score += 100;
      game.rivalStats.currentCombo += 1;
      game.rivalStats.maxCombo = Math.max(game.rivalStats.maxCombo, game.rivalStats.currentCombo);
      if (isDuoMode()) addSync(3);
    } else if (now >= game.rival.invulnerableUntil) {
      kunai.dead = true;
      if (isDuoMode() && game.rival.shield) {
        consumeShield(game.rival);
        game.rival.invulnerableUntil = now + 520;
        spawnExplosion(hitX, actorGroundY(game.rival, now) - 70, game.rival.lane);
        showToast('EL ESCUDO CUBRIO A TU COMPANERO');
        renderDuoHud();
        return;
      }
      game.rival.hits += 1;
      game.rivalStats.hitsReceived += 1;
      game.rivalStats.currentCombo = 0;
      game.rivalMeters = Math.max(0, game.rivalMeters - 18);
      if (isDuoMode()) game.remoteLives = Math.max(0, game.remoteLives - 1);
      game.rival.invulnerableUntil = now + CONFIG.hitMs + 520;
      setRivalMode('hit', CONFIG.hitMs, now);
      if (isDuoMode() && game.remoteLives <= 0 && tryTeamRescue('rival', now)) return;
      if (isDuoMode() && game.remoteLives <= 0) {
        game.over = true;
        game.running = false;
        game.outcome = 'team-defeat';
        setRunnerAutoRun(false);
        setRivalMode('dead', 0, now);
        showToast('TU COMPANERO QUEDO FUERA');
        setTimeout(showGameOver, CONFIG.deathMs);
      }
    } else {
      kunai.resolved = true;
    }
  }

  function takeHit(now) {
    if (now < game.player.invulnerableUntil || game.over) return false;
    if ((isDuoMode() || isFlowMode()) && game.player.shield) {
      consumeShield(game.player);
      game.player.invulnerableUntil = now + 520;
      spawnExplosion(isFlowMode() ? flowActorHitX('player') : CONFIG.hitX,
        isFlowMode() ? flowPlayerCenterY() : actorGroundY(game.player, now) - 70,
        game.player.lane);
      if (isFlowMode()) {
        showFlowActorNotice('player', 'GUARD BLOQUEO', '#75f7ef');
        showToast('TU GUARD BLOQUEO EL KUNAI');
      } else {
        showToast('ESCUDO ACTIVADO');
      }
      if (isDuoMode()) renderDuoHud();
      else renderFlowHud();
      return true;
    }
    duckEnd();
    press('g');
    game.combo = 0;
    game.lives -= 1;
    game.stats.hitsReceived += 1;
    game.playerMeters = Math.max(0, game.playerMeters - 18);
    game.player.invulnerableUntil = now + CONFIG.hitMs + 620;
    setPlayerMode('hit', CONFIG.hitMs, now);
    renderHud();
    game.rivalSwordCharges = clamp(Math.round(Number(state.flowSwordCharges) || 0),
      0, isFlowMode() ? CONFIG.flowSwordMax : CONFIG.competitiveSwordStart);
    if (isFlowMode()) {
      showFlowActorNotice('player', '-1 VIDA', '#ff5967');
      showToast('UN KUNAI TE GOLPEO');
    } else {
      showToast('IMPACTO');
    }

    if (game.lives <= 0) {
      if (tryTeamRescue('player', now)) return true;
      if (isOnlineRace() && !game.networkFinishedSent) {
        game.networkFinishedSent = true;
        window.NinjaNetwork?.finish('knockout', currentStats());
      }
      game.over = true;
      game.running = false;
      game.outcome = isFlowMode() ? 'flow-defeat' : (isDuoMode() ? 'team-defeat' : 'knockout');
      setRunnerAutoRun(false);
      setPlayerMode('dead', 0, now);
      press('m');
      setTimeout(showGameOver, CONFIG.deathMs);
    }
    return true;
  }

  function resolveKunaiCollisions(now) {
    const strikeLive = attackIsLive(now);
    for (const kunai of game.kunais) {
      if (kunai.dead) continue;
      if (isDuoMode() && kunai.lane !== actorCollisionLane(game.player, now)) {
        if (!isOnlineRace() && kunai.lane === actorCollisionLane(game.rival, now)) resolveRivalKunai(kunai, now);
        continue;
      }
      if (!isDuoMode() && kunai.lane === 'rival') {
        resolveRivalKunai(kunai, now);
        continue;
      }

      if (strikeLive && kunai.x >= CONFIG.attackMinX && kunai.x <= CONFIG.attackMaxX) {
        kunai.dead = true;
        kunai.resolved = true;
        const contactX = Math.max(CONFIG.attackMinX, Math.min(CONFIG.attackMaxX, kunai.x - 5));
        spawnExplosion(contactX, kunai.y, 'player');
        game.stats.cuts += 1;
        award(150, 'CORTE PERFECTO');
        if (isDuoMode()) addSync(5);
        continue;
      }

      const crossedPlayer = kunai.previousX > CONFIG.hitX && kunai.x <= CONFIG.hitX;
      if (!crossedPlayer || kunai.resolved) continue;

      const dodged = (kunai.height === 'low' && game.player.mode === 'jump') ||
        (kunai.height === 'high' && game.player.mode === 'duck');

      if (dodged) {
        kunai.resolved = true;
        game.stats.dodges += 1;
        award(100, 'ESQUIVA');
        if (isDuoMode()) addSync(4);
      } else if (takeHit(now)) {
        kunai.dead = true;
      } else {
        kunai.resolved = true;
      }
    }
  }

  function updateKunais(dt, now) {
    for (const kunai of game.kunais) {
      kunai.previousX = kunai.x;
      kunai.x -= game.speed * dt;
    }
    resolveKunaiCollisions(now);
    game.kunais = game.kunais.filter(kunai => !kunai.dead && kunai.x > -80);
  }

  function pickupY(pickup) {
    const ground = laneGroundY(pickup.lane);
    return ground - (pickup.kind === 'sync' ? 82 : 100);
  }

  function useMedkit(collector) {
    const playerNeedsHelp = game.lives < 3;
    const companionNeedsHelp = game.remoteLives < 3;
    if (!playerNeedsHelp && !companionNeedsHelp) {
      addSync(6);
      showToast('EQUIPO SANO - SINCRONIA +6');
      return;
    }

    const healPlayer = playerNeedsHelp && (!companionNeedsHelp || game.lives < game.remoteLives ||
      (game.lives === game.remoteLives && collector === 'player'));
    if (healPlayer) {
      game.lives = Math.min(3, game.lives + 1);
      showToast(collector === 'player' ? 'BOTIQUIN USADO' : 'TU COMPANERO TE CURO');
      return;
    }

    game.remoteLives = Math.min(3, game.remoteLives + 1);
    if (isOnlineRace()) window.NinjaNetwork?.sendDuoEvent({ kind: 'heal' });
    showToast('CURACION PARA TU COMPANERO');
  }

  function clearRescueWindow(lane) {
    for (const kunai of game.kunais) {
      if (!kunai.dead && kunai.lane === lane &&
          kunai.x >= CONFIG.hitX - 45 && kunai.x <= CONFIG.hitX + 280) {
        kunai.dead = true;
        spawnExplosion(kunai.x, kunai.y, lane);
      }
    }
  }

  function tryTeamRescue(target, now = performance.now(), broadcast = true) {
    if (!isDuoMode() || game.syncMeter < CONFIG.teamRescueCost ||
        now < game.teamRescueUntil) return false;
    const actor = target === 'rival' ? game.rival : game.player;
    const lane = actorCollisionLane(actor, now);
    game.syncMeter = Math.max(0, game.syncMeter - CONFIG.teamRescueCost);
    game.teamRescueUntil = now + CONFIG.teamRescueGraceMs;
    game.duoPatternClock = Math.max(game.duoPatternClock, 2.8);
    clearRescueWindow(lane);
    if (target === 'rival') {
      game.remoteLives = 1;
      game.rival.invulnerableUntil = now + 1650;
    } else {
      game.lives = 1;
      game.player.invulnerableUntil = now + 1650;
    }
    if (broadcast && isOnlineRace()) {
      window.NinjaNetwork?.sendDuoEvent({ kind: 'team-rescue', lane });
    }
    showToast(target === 'rival' ? 'RESCATE GEMELO - COMPANERO A SALVO' : 'RESCATE GEMELO - SEGUIS EN CARRERA');
    renderHud();
    return true;
  }

  function applyRemoteTeamRescue(lane) {
    const now = performance.now();
    const alreadyPaid = now < game.teamRescueUntil;
    if (!alreadyPaid) game.syncMeter = Math.max(0, game.syncMeter - CONFIG.teamRescueCost);
    game.teamRescueUntil = Math.max(game.teamRescueUntil, now + CONFIG.teamRescueGraceMs);
    game.duoPatternClock = Math.max(game.duoPatternClock, 2.8);
    game.remoteLives = 1;
    game.rival.invulnerableUntil = now + 1650;
    clearRescueWindow(lane === 'rival' ? 'rival' : 'player');
    showToast('TU COMPANERO FUE RESCATADO');
    renderHud();
  }

  function collectPickup(pickup, collector = 'player') {
    if (pickup.collected) return;
    pickup.collected = true;
    if (pickup.kind === 'sync') {
      addSync(18);
      showToast('SINCRONIA +18');
    } else if (pickup.kind === 'shield') {
      grantShield(collector === 'player' ? game.player : game.rival);
      showToast(collector === 'player' ? 'ESCUDO NINJA' : 'EL BOT CUBRE AL EQUIPO');
    } else {
      useMedkit(collector);
    }
    if (isOnlineRace()) window.NinjaNetwork?.sendDuoEvent({ kind: 'pickup-collected', id: pickup.id });
    renderHud();
  }

  function resolveLinkedCore(core, broadcast = true) {
    if (!core || core.resolved) return false;
    core.resolved = true;
    for (const kunai of game.kunais) {
      if (kunai.linkId === core.id && !kunai.dead) {
        kunai.dead = true;
        spawnExplosion(kunai.x, kunai.y, kunai.lane);
      }
    }
    spawnExplosion(core.x, laneGroundY(core.lane) - 82, core.lane);
    const now = performance.now();
    if (actorCollisionLane(game.player, now) === core.targetLane) grantShield(game.player, now);
    if (!isOnlineRace() && actorCollisionLane(game.rival, now) === core.targetLane) {
      grantShield(game.rival, now);
    }
    if (broadcast) {
      addSync(24);
      if (isOnlineRace()) window.NinjaNetwork?.sendDuoEvent({ kind: 'core-resolved', id: core.id });
      showToast('PROTECCION CRUZADA +24 - ESCUDO');
    }
    return true;
  }

  function updateDuoObjects(dt, now) {
    if (!isDuoMode()) return;
    const rivalHitX = CONFIG.combatX + rivalLeadOffset();
    for (const pickup of game.pickups) {
      pickup.previousX = pickup.x;
      pickup.x -= game.speed * dt;
      if (!pickup.collected && pickup.lane === actorCollisionLane(game.player, now) &&
          pickup.previousX > CONFIG.hitX && pickup.x <= CONFIG.hitX) {
        collectPickup(pickup, 'player');
      } else if (!isOnlineRace() && !pickup.collected && pickup.lane === actorCollisionLane(game.rival, now) &&
          pickup.previousX > rivalHitX && pickup.x <= rivalHitX) {
        collectPickup(pickup, 'rival');
      }
    }

    for (const core of game.linkedCores) {
      core.previousX = core.x;
      core.x -= game.speed * dt;
      if (core.resolved) continue;
      if (core.lane === actorCollisionLane(game.player, now) && attackIsLive(now) &&
          core.x >= CONFIG.attackMinX && core.x <= CONFIG.attackMaxX) {
        resolveLinkedCore(core);
      } else if (!isOnlineRace() && core.lane === actorCollisionLane(game.rival, now) && rivalAttackIsLive(now) &&
          core.x >= rivalHitX + 35 && core.x <= rivalHitX + 180) {
        resolveLinkedCore(core);
      }
    }
    game.pickups = game.pickups.filter(pickup => !pickup.collected && pickup.x > -80);
    game.linkedCores = game.linkedCores.filter(core => !core.resolved && core.x > -80);
  }

  function spawnExplosion(x, y, lane = 'player') {
    if (game.explosions.length >= visualProfile.explosionLimit) game.explosions.shift();
    game.explosions.push({ x, y, lane, age: 0, duration: .42 });
    const colors = lane === 'rival'
      ? ['#ffffff', '#dcc5ff', '#a675ff', '#6943c7']
      : ['#fff8d6', '#ffd45f', '#ff923d', '#ff3f4f'];
    const burstCount = prefersReducedMotion ? 8 : (mobileVisualBudget ? 12 : 26);
    for (let index = 0; index < burstCount; index += 1) {
      const angle = (Math.PI * 2 * index / burstCount) + (Math.random() - .5) * .24;
      const speed = 110 + Math.random() * 360;
      const life = .22 + Math.random() * .34;
      pushParticle({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        maxLife: life,
        size: 1.5 + Math.random() * 4,
        color: colors[index % colors.length]
      });
    }
    for (let index = 0; index < (prefersReducedMotion ? 1 : (mobileVisualBudget ? 3 : 5)); index += 1) {
      pushParticle({
        x,
        y,
        vx: 80 + Math.random() * 160,
        vy: (Math.random() - .5) * 190,
        life: .35,
        maxLife: .35,
        size: 3,
        color: '#9ba5ba'
      });
    }
  }

  function pushParticle(particle) {
    if (game.particles.length >= visualProfile.particleLimit) return false;
    game.particles.push(particle);
    return true;
  }

  function compactInPlace(items, keep) {
    let writeIndex = 0;
    for (let readIndex = 0; readIndex < items.length; readIndex += 1) {
      const item = items[readIndex];
      if (keep(item)) items[writeIndex++] = item;
    }
    items.length = writeIndex;
  }

  function updateEffects(dt) {
    for (const particle of game.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(.035, dt);
      particle.vy += 260 * dt;
      particle.life -= dt;
    }
    compactInPlace(game.particles, particle => particle.life > 0);
    for (const explosion of game.explosions) explosion.age += dt;
    compactInPlace(game.explosions, explosion => explosion.age < explosion.duration);
  }

  function updateRunHud(dt) {
    game.hudRenderClock -= dt;
    if (game.hudRenderClock > 0) return;
    game.hudRenderClock = .1;
    renderHud();
  }

  function updateDifficulty(dt) {
    game.elapsed += dt;
    game.distance += game.speed * dt;
    const distanceGoal = isFlowMode() ? CONFIG.flowLength : CONFIG.raceLength;
    game.playerMeters = Math.min(distanceGoal, game.playerMeters + game.speed * dt / 31);
    if (isFlowMode()) {
      if (isOnlineRace()) {
        game.rivalMeters += (game.rivalTargetMeters - game.rivalMeters) * Math.min(1, dt * 12);
      } else {
        game.rivalMeters = Math.min(CONFIG.flowLength,
          game.rivalMeters + game.speed * dt / 31);
        game.rivalStats.meters = game.rivalMeters;
        game.rivalStats.durationMs = game.elapsed * 1000;
      }
      game.speed = Math.min(CONFIG.flowMaxSpeed, CONFIG.startSpeed + game.elapsed * 4.1);
      const controlsFlowHazards = !qaMode && (!isOnlineRace() || game.duoHost);
      if (controlsFlowHazards) game.flowPatternClock -= dt;
      if (controlsFlowHazards && game.flowPatternClock <= 0) {
        spawnFlowPattern();
        const progress = clamp(game.playerMeters / CONFIG.flowLength, 0, 1);
        game.flowPatternClock = CONFIG.flowPatternDelay - progress * .38;
      }
      updateRunHud(dt);
      if (isOnlineRace() && !game.over && game.playerMeters >= CONFIG.flowLength &&
          !game.networkFinishedSent) {
        game.networkFinishedSent = true;
        if (!window.NinjaNetwork?.finish('finish', currentStats())) {
          fallBackToBot('CONEXION PERDIDA - CONTINUA EL BOT');
        }
      } else if (!isOnlineRace() && !game.over &&
          game.playerMeters >= CONFIG.flowLength && game.rivalMeters >= CONFIG.flowLength) {
        game.outcome = 'flow-complete';
        game.over = true;
        game.running = false;
        setRunnerAutoRun(false);
        setTimeout(showGameOver, 260);
      }
      return;
    }
    if (isOnlineRace()) {
      const smoothing = Math.min(1, dt * 12);
      game.rivalMeters += (game.rivalTargetMeters - game.rivalMeters) * smoothing;
    } else {
      game.rivalMeters = Math.min(CONFIG.raceLength,
        game.rivalMeters + (11.75 + Math.sin(game.elapsed * .72) * .7) * dt);
      game.rivalStats.meters = game.rivalMeters;
      game.rivalStats.durationMs = game.elapsed * 1000;
    }
    game.speed = Math.min(CONFIG.maxSpeed, CONFIG.startSpeed + game.elapsed * 7.2);
    game.spawnDelay = Math.max(CONFIG.minSpawnDelay, CONFIG.startSpawnDelay - game.elapsed * .0085);
    const controlsDuoHazards = !isOnlineRace() || game.duoHost;
    if (isDuoMode()) {
      if (controlsDuoHazards) game.duoPatternClock -= dt;
      if (controlsDuoHazards && game.duoPatternClock <= 0) {
        spawnDuoPattern();
        const progress = clamp(Math.max(game.playerMeters, game.rivalMeters) / CONFIG.raceLength, 0, 1);
        game.duoPatternClock = CONFIG.duoPatternDelay - progress * .3;
      }
    } else if (!qaMode) {
      game.spawnClock -= dt;
      if (game.spawnClock <= 0) {
        spawnKunai(undefined, CONFIG.spawnX, 'player');
        game.spawnClock = game.spawnDelay * (.88 + Math.random() * .26);
      }
      if (!isOnlineRace()) {
        game.rivalSpawnClock -= dt;
        if (game.rivalSpawnClock <= 0) {
          spawnKunai(undefined, CONFIG.spawnX, 'rival');
          game.rivalSpawnClock = game.spawnDelay * (1.02 + Math.random() * .28);
        }
      }
    }
    updateRunHud(dt);

    if (isOnlineRace() && !game.over && game.playerMeters >= CONFIG.raceLength &&
        !game.networkFinishedSent) {
      game.networkFinishedSent = true;
      if (!window.NinjaNetwork?.finish('finish', currentStats())) {
        fallBackToBot('CONEXIÓN PERDIDA · CONTINÚA EL BOT');
      }
    } else if (!isOnlineRace() && !game.over && (isDuoMode()
        ? (game.playerMeters >= CONFIG.raceLength && game.rivalMeters >= CONFIG.raceLength)
        : (game.playerMeters >= CONFIG.raceLength || game.rivalMeters >= CONFIG.raceLength))) {
      game.outcome = isDuoMode()
        ? 'team-victory'
        : (game.playerMeters >= game.rivalMeters ? 'victory' : 'race-loss');
      game.over = true;
      game.running = false;
      setRunnerAutoRun(false);
      setTimeout(showGameOver, 260);
    }
  }

  function drawFlowWorld() {
    bg.clearRect(0, 0, W, H);
    const motionDistance = prefersReducedMotion ? 0 : game.distance;
    bg.fillStyle = WORLD_PAINTS.flowSky;
    bg.fillRect(0, 0, W, H);

    const forestOffset = -((motionDistance * .02) % 170);
    for (let x = forestOffset - 170, index = 0; x < W + 170; x += 92, index += 1) {
      const crownY = 55 + (index % 3) * 13;
      bg.fillStyle = index % 2 ? '#172c25' : '#1d372b';
      bg.beginPath();
      bg.arc(x, crownY, 68, 0, Math.PI * 2);
      bg.arc(x + 44, crownY + 18, 56, 0, Math.PI * 2);
      bg.fill();
      bg.fillStyle = '#101b18';
      bg.fillRect(x + 13, crownY + 28, 14, 95);
    }

    bg.fillStyle = WORLD_PAINTS.flowWall;
    bg.fillRect(0, 78, W, 108);
    bg.fillStyle = '#211c17';
    bg.fillRect(0, 82, W, 9);
    bg.fillRect(0, 112, W, 7);
    const wallOffset = -((motionDistance * .055) % 132);
    for (let x = wallOffset - 132; x < W + 132; x += 132) {
      bg.fillStyle = 'rgba(18,20,17,.28)';
      bg.fillRect(x, 90, 7, 96);
      bg.strokeStyle = 'rgba(212,207,168,.16)';
      bg.lineWidth = 2;
      bg.beginPath();
      bg.moveTo(x + 46, 126);
      bg.lineTo(x + 35, 144);
      bg.lineTo(x + 53, 163);
      bg.stroke();
    }

    bg.fillStyle = WORLD_PAINTS.flowEarth;
    bg.fillRect(0, 145, W, 495);

    bg.save();
    bg.beginPath();
    bg.rect(0, 145, W, 495);
    bg.clip();
    /* Las juntas de las baldosas retroceden en X: son la referencia principal
       de velocidad. Las filas horizontales quedan ancladas para que la camara
       no parezca subir o bajar. */
    const tileOffset = -((motionDistance * .46) % 180);
    for (let x = tileOffset - 360; x < W + 360; x += 180) {
      bg.strokeStyle = 'rgba(31,30,25,.24)';
      bg.lineWidth = 4;
      bg.beginPath();
      bg.moveTo(x, 640);
      bg.lineTo(x + 330, 145);
      bg.stroke();
      bg.strokeStyle = 'rgba(218,198,142,.075)';
      bg.lineWidth = 1;
      bg.beginPath();
      bg.moveTo(x + 12, 640);
      bg.lineTo(x + 342, 145);
      bg.stroke();
      bg.strokeStyle = 'rgba(229,207,146,.085)';
      bg.lineWidth = 2;
      bg.beginPath();
      bg.moveTo(x + 28, 566);
      bg.lineTo(x + 106, 566);
      bg.stroke();
    }
    for (let y = 205; y < 620; y += 72) {
      bg.strokeStyle = 'rgba(35,34,29,.18)';
      bg.beginPath();
      bg.moveTo(0, y);
      bg.lineTo(W, y);
      bg.stroke();
    }
    const decalOffset = -((motionDistance * .22) % 280);
    for (let x = decalOffset - 140; x < W + 180; x += 280) {
      const y = 245 + ((x / 70) % 4 + 4) % 4 * 82;
      bg.fillStyle = 'rgba(39,43,34,.22)';
      bg.beginPath();
      bg.ellipse(x, y, 46, 11, -.14, 0, Math.PI * 2);
      bg.fill();
      bg.strokeStyle = 'rgba(194,180,128,.09)';
      bg.beginPath();
      bg.arc(x + 22, y - 20, 25, .35, 2.5);
      bg.stroke();
    }
    bg.restore();

    for (const y of [151, 620]) {
      bg.fillStyle = '#232a22';
      bg.fillRect(0, y, W, y === 151 ? 8 : 12);
      const grassOffset = -((motionDistance * .12) % 74);
      for (let x = grassOffset - 74; x < W + 74; x += 74) {
        bg.strokeStyle = y === 151 ? '#475b3c' : '#313e2f';
        bg.lineWidth = 2;
        bg.beginPath();
        bg.moveTo(x, y);
        bg.lineTo(x - 6, y - 13);
        bg.moveTo(x + 4, y);
        bg.lineTo(x + 10, y - 17);
        bg.stroke();
      }
    }
    const dustOffset = -((motionDistance * .68) % 210);
    bg.strokeStyle = 'rgba(236,221,175,.17)';
    bg.lineWidth = 2;
    for (let x = dustOffset, index = 0; x < W + 210; x += 210, index += 1) {
      const y = 245 + (index % 5) * 73;
      const length = 58 + (index % 3) * 22;
      bg.beginPath();
      bg.moveTo(x, y);
      bg.lineTo(x + length, y);
      bg.stroke();
    }

    bg.fillStyle = 'rgba(245,231,190,.78)';
    bg.font = '900 12px ui-monospace, Consolas, monospace';
    bg.textAlign = 'left';
    bg.fillText('PATIO DE ENTRENAMIENTO // DUO COOPERATIVO', 30, 139);
    if (game.flowCue && performance.now() < game.flowCueUntil) {
      const alpha = clamp((game.flowCueUntil - performance.now()) / 420, 0, 1);
      bg.globalAlpha = Math.min(1, .35 + alpha);
      bg.fillStyle = '#ffe3a0';
      bg.font = '900 17px ui-monospace, Consolas, monospace';
      bg.textAlign = 'right';
      bg.fillText(game.flowCue, W - 28, 126);
      bg.globalAlpha = 1;
    }
  }

  function drawWorld() {
    if (isFlowMode()) {
      drawFlowWorld();
      return;
    }
    bg.clearRect(0, 0, W, H);
    bg.fillStyle = WORLD_PAINTS.raceSky;
    bg.fillRect(0, 0, W, H);

    bg.fillStyle = WORLD_PAINTS.raceGlow;
    bg.fillRect(620, 0, 330, 270);
    bg.fillStyle = 'rgba(221,228,248,.1)';
    bg.beginPath();
    bg.arc(785, 106, 38, 0, Math.PI * 2);
    bg.fill();

    const farOffset = -((game.distance * .035) % 240);
    bg.fillStyle = '#101625';
    for (let x = farOffset - 240; x < W + 240; x += 240) {
      bg.beginPath();
      bg.moveTo(x, 315);
      bg.lineTo(x + 105, 175);
      bg.lineTo(x + 235, 315);
      bg.closePath();
      bg.fill();
    }

    const drawLane = (top, groundY, accent, label, distance, laneIndex) => {
      bg.fillStyle = laneIndex ? WORLD_PAINTS.playerLane : WORLD_PAINTS.rivalLane;
      bg.fillRect(0, top, W, groundY - top + 19);

      const buildingOffset = -((distance * .12) % 168);
      bg.fillStyle = laneIndex ? '#090d15' : '#0b0e19';
      for (let x = buildingOffset - 168; x < W + 168; x += 168) {
        const variant = Math.abs(Math.floor(x / 168)) % 3;
        const height = 42 + variant * 15;
        bg.fillRect(x, groundY - height, 130, height);
        bg.fillRect(x + 20, groundY - height - 11, 38, 11);
        bg.fillStyle = laneIndex ? 'rgba(255,190,92,.09)' : 'rgba(163,122,255,.1)';
        for (let wx = x + 16; wx < x + 115; wx += 25) bg.fillRect(wx, groundY - height + 16, 4, 9);
        bg.fillStyle = laneIndex ? '#090d15' : '#0b0e19';
      }

      bg.fillStyle = `${accent}12`;
      bg.fillRect(0, groundY - 3, W, 21);
      bg.strokeStyle = `${accent}88`;
      bg.lineWidth = 2;
      bg.beginPath();
      bg.moveTo(0, groundY);
      bg.lineTo(W, groundY);
      bg.stroke();

      const stripeOffset = -((distance * 1.1) % 92);
      bg.strokeStyle = 'rgba(206,216,235,.11)';
      bg.lineWidth = 2;
      for (let x = stripeOffset - 92; x < W + 92; x += 92) {
        bg.beginPath();
        bg.moveTo(x + 55, groundY + 13);
        bg.lineTo(x, groundY + 27);
        bg.stroke();
      }

      bg.fillStyle = `${accent}cc`;
      bg.font = '900 10px Inter, Arial, sans-serif';
      bg.fillText(label, 25, top + 24);
      bg.fillStyle = 'rgba(255,255,255,.28)';
      bg.font = '700 9px ui-monospace, Consolas, monospace';
      bg.fillText('CORREDOR →', 25, top + 39);
    };

    drawLane(145, CONFIG.rivalGroundY, '#9a70ff', isDuoMode() ? 'CARRIL 1' : 'RIVAL', game.rivalMeters * 30, 0);
    drawLane(CONFIG.laneDividerY, CONFIG.playerGroundY, '#ff4655', isDuoMode() ? 'CARRIL 2' : 'VOS', game.distance, 1);

    if (isDuoMode() && game.running) {
      const drawPressure = (lane, y) => {
        const threat = laneThreatState(lane);
        const level = threat.level;
        bg.save();
        bg.fillStyle = level === 3 ? 'rgba(255,55,73,.86)' :
          (level === 2 ? 'rgba(255,174,74,.76)' :
            (level === 1 ? 'rgba(137,111,255,.7)' : 'rgba(80,211,150,.62)'));
        bg.fillRect(W - 128, y - 17, 104, 24);
        bg.fillStyle = '#fff';
        bg.font = '900 9px ui-monospace, Consolas, monospace';
        bg.fillText(`${threat.label}${threat.count ? ` ${threat.count}` : ''}`, W - 118, y);
        bg.restore();
      };
      drawPressure('rival', 187);
      drawPressure('player', 445);

      if (game.duoCue && performance.now() < game.duoCueUntil) {
        const remaining = clamp((game.duoCueUntil - performance.now()) / CONFIG.duoDecisionMs, 0, 1);
        const rewardTop = game.duoCue.rewardLane === 'rival' ? 145 : CONFIG.laneDividerY;
        const rewardBottom = game.duoCue.rewardLane === 'rival' ? CONFIG.rivalGroundY + 18 : CONFIG.playerGroundY + 18;
        const dangerTop = game.duoCue.dangerLane === 'rival' ? 145 : CONFIG.laneDividerY;
        const dangerBottom = game.duoCue.dangerLane === 'rival' ? CONFIG.rivalGroundY + 18 : CONFIG.playerGroundY + 18;
        bg.save();
        bg.fillStyle = `rgba(166,117,255,${.06 + remaining * .08})`;
        bg.fillRect(W - 245, rewardTop, 245, rewardBottom - rewardTop);
        bg.strokeStyle = `rgba(217,190,255,${.35 + remaining * .5})`;
        bg.lineWidth = 4;
        bg.strokeRect(3, rewardTop + 3, W - 6, rewardBottom - rewardTop - 6);
        if (game.duoCue.dangerLane !== game.duoCue.rewardLane) {
          bg.strokeStyle = `rgba(255,93,111,${.25 + remaining * .4})`;
          bg.lineWidth = 2;
          bg.strokeRect(6, dangerTop + 6, W - 12, dangerBottom - dangerTop - 12);
        }
        bg.fillStyle = '#f4eaff';
        bg.font = '900 13px ui-monospace, Consolas, monospace';
        bg.textAlign = 'right';
        bg.fillText(game.duoCue.cue, W - 28, rewardTop + 55);
        bg.fillStyle = '#bda4ff';
        bg.font = '800 9px ui-monospace, Consolas, monospace';
        bg.fillText(game.duoCue.plan || 'RUTA MARCADA', W - 28, rewardTop + 72);
        bg.restore();
      }
    }

    bg.fillStyle = '#06080e';
    bg.fillRect(0, CONFIG.rivalGroundY + 20, W, CONFIG.laneDividerY - CONFIG.rivalGroundY - 20);
    bg.fillStyle = 'rgba(255,255,255,.055)';
    bg.fillRect(0, CONFIG.laneDividerY - 1, W, 1);

    bg.strokeStyle = 'rgba(255,255,255,.04)';
    bg.lineWidth = 1;
    const windOffset = -((game.distance * .7) % 310);
    for (let index = 0; index < 4; index += 1) {
      const x = windOffset + index * 310;
      bg.beginPath();
      bg.moveTo(x, 210);
      bg.lineTo(x + 135, 210);
      bg.moveTo(x + 70, 490);
      bg.lineTo(x + 205, 490);
      bg.stroke();
    }
  }

  function drawKunai(kunai) {
    const phase = Number.isFinite(kunai.phase) ? kunai.phase : 0;
    const rivalKunai = kunai.lane === 'rival';
    const bob = Math.sin(game.elapsed * 10 + phase) * 2;
    ctx.save();
    ctx.translate(kunai.x, kunai.y + bob);
    const laneScale = rivalKunai ? .9 : 1;
    ctx.scale(laneScale, laneScale);
    ctx.rotate(-.035 + Math.sin(game.elapsed * 7 + phase) * .018);

    if (visualProfile.glow) {
      const trail = ctx.createLinearGradient(18, 0, 112, 0);
      trail.addColorStop(0, rivalKunai ? 'rgba(180,135,255,.68)' : 'rgba(210,221,244,.32)');
      trail.addColorStop(1, rivalKunai ? 'rgba(132,75,255,0)' : 'rgba(210,221,244,0)');
      ctx.strokeStyle = trail;
    } else {
      ctx.strokeStyle = rivalKunai ? 'rgba(180,135,255,.48)' : 'rgba(210,221,244,.25)';
    }
    ctx.lineWidth = rivalKunai ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(112, 0);
    ctx.stroke();

    ctx.shadowColor = rivalKunai ? 'rgba(166,117,255,.9)' : 'rgba(180,205,255,.35)';
    ctx.shadowBlur = visualProfile.glow ? (rivalKunai ? 16 : 9) : 0;
    ctx.fillStyle = '#dce3ef';
    ctx.beginPath();
    ctx.moveTo(-32, 0);
    ctx.lineTo(-7, -8);
    ctx.lineTo(7, 0);
    ctx.lineTo(-7, 8);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#70798c';
    ctx.fillRect(5, -4, 26, 8);
    ctx.fillStyle = rivalKunai ? '#9a70ff' : '#d94a54';
    ctx.fillRect(12, -5, 5, 10);
    ctx.strokeStyle = '#9da7b9';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(35, 0, 8, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function drawSlash(now) {
    const drawArc = (actor, centerX, centerY, radius, primary, glowColor, width) => {
      if (actor.mode !== 'attack') return;
      const age = now - actor.actionStarted;
      if (age < CONFIG.strikeStartMs - 70 || age > CONFIG.strikeEndMs + 80) return;
      const progress = clamp((age - CONFIG.strikeStartMs + 70) /
        (CONFIG.strikeEndMs - CONFIG.strikeStartMs + 150), 0, 1);
      const alpha = Math.sin(progress * Math.PI);

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = alpha * .78;
      ctx.lineCap = 'round';
      ctx.shadowColor = primary;
      ctx.shadowBlur = visualProfile.glow ? 22 : 0;
      ctx.strokeStyle = primary;
      ctx.lineWidth = width;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, -1.13, .66);
      ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = alpha * .35;
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = width * 2.65;
      ctx.stroke();
      ctx.restore();
    };

    if (isFlowMode()) {
      drawArc(game.player, flowActorFxX('player'), flowPlayerCenterY(), 105,
        '#fff8db', '#ff8848', 6);
      drawArc(game.rival, flowActorFxX('rival'), flowRivalCenterY(), 102,
        '#f6efff', '#9a70ff', 6);
      return;
    }
    const playerTopLane = game.player.lane === 'rival';
    const rivalTopLane = game.rival.lane === 'rival';
    drawArc(game.player, CONFIG.combatX - 24, playerTopLane ? 301 : 522,
      playerTopLane ? 96 : 118, '#fff8db', '#ff8848', playerTopLane ? 5 : 6);
    drawArc(game.rival, CONFIG.combatX + rivalLeadOffset() - 22, rivalTopLane ? 301 : 522,
      rivalTopLane ? 96 : 118, '#f6efff', '#9a70ff', rivalTopLane ? 5 : 6);
  }

  function visibleRemoteExplosions(now) {
    if (!isOnlineRace() || isDuoMode()) return [];
    const elapsed = clamp((now - game.remoteReceivedAt) / 1000, 0, .3);
    return game.remoteExplosions
      .map(explosion => ({
        ...explosion,
        age: explosion.age + elapsed,
        duration: .42,
        lane: 'rival'
      }))
      .filter(explosion => explosion.age < explosion.duration);
  }

  function drawExplosions(now) {
    const explosions = game.explosions.concat(visibleRemoteExplosions(now));
    for (const explosion of explosions) {
      const progress = explosion.age / explosion.duration;
      const ease = 1 - Math.pow(1 - Math.min(1, progress), 3);
      ctx.save();
      ctx.translate(explosion.x, explosion.y);
      ctx.globalCompositeOperation = 'screen';

      if (visualProfile.glow) {
        const flash = ctx.createRadialGradient(0, 0, 0, 0, 0, 62 * ease + 5);
        flash.addColorStop(0, `rgba(255,255,236,${1 - progress})`);
        if (explosion.lane === 'rival') {
          flash.addColorStop(.18, `rgba(210,178,255,${.95 - progress * .8})`);
          flash.addColorStop(.55, `rgba(132,80,255,${.64 - progress * .58})`);
          flash.addColorStop(1, 'rgba(92,44,190,0)');
        } else {
          flash.addColorStop(.18, `rgba(255,210,73,${.95 - progress * .8})`);
          flash.addColorStop(.55, `rgba(255,69,50,${.64 - progress * .58})`);
          flash.addColorStop(1, 'rgba(255,49,34,0)');
        }
        ctx.fillStyle = flash;
      } else {
        const alpha = Math.max(0, .72 - progress * .65);
        ctx.fillStyle = explosion.lane === 'rival'
          ? `rgba(166,117,255,${alpha})`
          : `rgba(255,146,61,${alpha})`;
      }
      ctx.beginPath();
      ctx.arc(0, 0, 68 * ease + 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.strokeStyle = explosion.lane === 'rival' ? '#e5d4ff' : '#fff3a3';
      ctx.lineWidth = 4 * (1 - progress) + 1;
      ctx.beginPath();
      ctx.arc(0, 0, 24 + ease * 58, 0, Math.PI * 2);
      ctx.stroke();
      for (let ray = 0; ray < visualProfile.explosionRays; ray += 1) {
        const angle = ray * Math.PI * 2 / visualProfile.explosionRays;
        const inner = 16 + ease * 18;
        const outer = 34 + ease * 75;
        ctx.beginPath();
        ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
        ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function drawParticles() {
    for (const particle of game.particles) {
      const alpha = Math.max(0, particle.life / particle.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particle.color;
      ctx.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2,
        particle.size * (1 + alpha), particle.size);
    }
    ctx.globalAlpha = 1;
  }

  function visibleRemoteKunais(now) {
    if (!isOnlineRace() || !game.enemyKunaisVisible || isDuoMode()) return [];
    const elapsed = clamp((now - game.remoteReceivedAt) / 1000, 0, .24);
    return game.remoteKunais.map(kunai => ({
      ...kunai,
      x: kunai.x - game.remoteSpeed * elapsed,
      y: kunai.height === 'high' ? CONFIG.rivalHighY : CONFIG.rivalLowY,
      lane: 'rival'
    })).filter(kunai => kunai.x > -80);
  }

  function applyRemoteKunaiSpawn(value) {
    if (!isOnlineRace() || !value || typeof value !== 'object') return;
    const id = String(value.id || '');
    if (!id) return;
    const lane = value.lane === 'rival' ? 'rival' : 'player';
    if (isDuoMode()) {
      if (game.duoHost || game.kunais.some(item => String(item.id) === id && item.lane === lane)) return;
      const height = value.height === 'high' ? 'high' : 'low';
      const x = clamp(Number(value.x) || CONFIG.spawnX, -120, 1900);
      game.kunais.push({
        id,
        x,
        previousX: x,
        y: lane === 'rival'
          ? (height === 'high' ? CONFIG.rivalHighY : CONFIG.rivalLowY)
          : (height === 'high' ? CONFIG.highY : CONFIG.lowY),
        height,
        lane,
        linkId: String(value.linkId || ''),
        phase: Number.isFinite(Number(value.phase)) ? Number(value.phase) : 0,
        resolved: Boolean(value.resolved),
        dead: false
      });
      return;
    }
    const kunai = {
      id,
      x: clamp(Number(value.x) || CONFIG.spawnX, -120, 1900),
      height: value.height === 'high' ? 'high' : 'low',
      phase: Number.isFinite(Number(value.phase)) ? Number(value.phase) : 0,
      resolved: Boolean(value.resolved)
    };
    const existingIndex = game.remoteKunais.findIndex(item => item.id === id);
    if (existingIndex >= 0) game.remoteKunais[existingIndex] = kunai;
    else game.remoteKunais.push(kunai);
    game.remoteReceivedAt = performance.now();
  }

  function applyDuoEvent(value) {
    if (!isOnlineRace() || (!isDuoMode() && !isFlowMode()) ||
        !value || typeof value !== 'object') return;
    const kind = String(value.kind || '');
    if (isFlowMode()) {
      const transitSeconds = clamp((Number(game.networkRtt) || 0) / 2000, 0, .16);
      if (kind === 'flow-projectile' && !game.duoHost) {
        const projectileX = clamp((Number(value.x) || CONFIG.spawnX) -
          game.speed * transitSeconds, -120, 1900);
        const projectileY = clamp((Number(value.y) || 350) +
          (Number(value.vy) || 0) * transitSeconds, 185, 545);
        const projectile = spawnFlowProjectile(value.projectileKind,
          projectileX,
          projectileY,
          clamp(Number(value.vy) || 0, -95, 95), String(value.id || ''), false);
        if (projectile) projectile.phase = Number(value.phase) || 0;
      } else if (kind === 'flow-pickup' && !game.duoHost) {
        const pickup = spawnFlowPickup(value.pickupKind,
          clamp((Number(value.x) || CONFIG.spawnX) -
            game.speed * transitSeconds * .88, -120, 1900),
          clamp(Number(value.y) || 350, 195, 535), String(value.id || ''), false);
        pickup.phase = Number(value.phase) || 0;
      } else if (kind === 'flow-resolved') {
        const projectile = game.flowProjectiles.find(item => item.id === String(value.id || ''));
        if (projectile) projectile.dead = true;
      } else if (kind === 'flow-pickup-collected') {
        const pickup = game.flowPickups.find(item => item.id === String(value.id || ''));
        if (!pickup || pickup.collected) return;
        pickup.collected = true;
        applyFlowBuff(value.pickupKind, performance.now(), 'rival', false);
      } else if (kind === 'pattern-cue') {
        game.flowCue = String(value.cue || '').slice(0, 48);
        game.flowCueUntil = performance.now() + 2000;
      }
      return;
    }
    if (kind === 'pickup-spawn') {
      spawnPickup(value.pickupKind, value.lane, clamp(Number(value.x) || CONFIG.spawnX, -120, 1900),
        value.id, false).phase = Number(value.phase) || 0;
    } else if (kind === 'core-spawn') {
      spawnLinkedCore(value.lane, value.targetLane,
        clamp(Number(value.x) || CONFIG.spawnX, -120, 1900), value.id, false).phase = Number(value.phase) || 0;
    } else if (kind === 'pickup-collected') {
      const pickup = game.pickups.find(item => item.id === String(value.id || ''));
      if (pickup) pickup.collected = true;
    } else if (kind === 'core-resolved') {
      resolveLinkedCore(game.linkedCores.find(item => item.id === String(value.id || '')), false);
    } else if (kind === 'sync') {
      addSync(clamp(Number(value.amount) || 0, 0, 30), false);
    } else if (kind === 'pattern-cue') {
      setDuoCue(value.cue, value.lane, value.targetLane, value.plan, false);
    } else if (kind === 'team-rescue') {
      applyRemoteTeamRescue(value.lane);
    } else if (kind === 'ultimate-ready') {
      if (game.syncMeter < 100) return;
      const now = performance.now();
      if (game.duoHost && now - game.lastAttackAt <= CONFIG.ultimateWindowMs) {
        activateDuoUltimate();
      } else {
        game.ultimateArmedByRemote = true;
        game.ultimateArmUntil = now + CONFIG.ultimateWindowMs;
        showToast(game.duoHost ? 'TU COMPANERO PREPARO LA TORMENTA - ATACA' :
          'TORMENTA PREPARADA - RESPONDE CON ATAQUE');
        renderDuoHud();
      }
    } else if (kind === 'heal') {
      game.lives = Math.min(3, game.lives + 1);
      showToast('TU COMPANERO TE CURO');
      renderHud();
    } else if (kind === 'ultimate') {
      if (performance.now() < game.ultimateFlashUntil) return;
      game.syncMeter = 100;
      activateDuoUltimate(false);
    }
  }

  function buildOnlineState(now) {
    return {
      name: game.playerName,
      meters: game.playerMeters,
      mode: game.player.mode,
      lane: game.player.lane,
      flowY: game.flowY,
      flowX: game.flowX,
      flowSwordCharges: game.flowSwordCharges,
      shield: game.player.shield,
      shieldMs: shieldRemainingMs(game.player, now),
      actionAge: Math.max(0, now - game.player.actionStarted),
      lives: game.lives,
      score: game.score,
      speed: game.speed,
      stats: currentStats(),
      loadout: { ...game.loadout },
      kunais: game.kunais
        .filter(kunai => kunai.lane === 'player' && !kunai.dead)
        .slice(-12)
        .map(kunai => ({
          id: String(kunai.id),
          x: kunai.x,
          height: kunai.height,
          phase: kunai.phase,
          resolved: kunai.resolved
        })),
      explosions: game.explosions
        .filter(explosion => explosion.lane === 'player')
        .map(explosion => ({ x: explosion.x, y: explosion.y, age: explosion.age }))
    };
  }

  function sendOnlineState(dt, now) {
    if (!isOnlineRace()) return;
    game.networkSendClock -= dt;
    if (game.networkSendClock > 0) return;
    game.networkSendClock = 1 / 15;
    window.NinjaNetwork?.sendState(buildOnlineState(now));
  }

  function applyRemoteState(state) {
    if (!isOnlineRace() || !state || typeof state !== 'object') return;
    const now = performance.now();
    const hadRemoteState = game.remoteReceivedAt > 0;
    const previousRemoteLives = game.remoteLives;
    const previousRemoteShield = game.rival.shield;
    const previousRemoteShieldMs = shieldRemainingMs(game.rival, now);
    const allowedModes = new Set(['run', 'jump', 'duck', 'attack', 'hit', 'dead']);
    const nextMode = allowedModes.has(state.mode) ? state.mode : 'run';
    const actionStarted = now - clamp(Number(state.actionAge) || 0, 0, 3000);
    const pendingPose = game.remotePoseQueue.at(-1);
    const lastMode = pendingPose?.mode || game.rival.mode;
    if (lastMode !== nextMode) {
      game.remotePoseQueue.push({
        mode: nextMode,
        actionStarted,
        applyAt: now + CONFIG.remotePoseDelayMs
      });
      if (game.remotePoseQueue.length > 5) game.remotePoseQueue.shift();
    } else if (pendingPose?.mode === nextMode) {
      pendingPose.actionStarted = actionStarted;
    }
    game.rivalTargetMeters = clamp(Number(state.meters) || 0, 0,
      isFlowMode() ? CONFIG.flowLength : CONFIG.raceLength);
    if (isDuoMode()) setRivalLane(state.lane === 'player' ? 'player' : 'rival', now);
    if (isFlowMode()) {
      game.rivalFlowTargetY = clamp(Number(state.flowY) || 400,
        CONFIG.flowMinY, CONFIG.flowMaxY);
      game.rivalFlowTargetX = clamp(Number(state.flowX) ||
        (CONFIG.hitX - CONFIG.flowSeparation), CONFIG.flowMinX, CONFIG.flowMaxX);
    }
    const remoteShieldMs = clamp(Number(state.shieldMs) || 0, 0, CONFIG.shieldDurationMs);
    game.rival.shield = (isDuoMode() || isFlowMode()) && Boolean(state.shield) && remoteShieldMs > 0;
    game.rival.shieldUntil = game.rival.shield ? now + remoteShieldMs : 0;
    game.remoteLives = clamp(Math.round(Number(state.lives) || 0), 0, 3);
    if (isFlowMode() && game.running && hadRemoteState) {
      if (game.remoteLives < previousRemoteLives) {
        showFlowActorNotice('rival', '-1 VIDA', '#ff7b91');
        showToast('UN KUNAI GOLPEO A TU COMPANERO');
      } else if (previousRemoteShield && !game.rival.shield) {
        if (previousRemoteShieldMs > 300) {
          showFlowActorNotice('rival', 'GUARD BLOQUEO', '#d5b4ff');
          showToast('EL GUARD DE TU COMPANERO BLOQUEO EL KUNAI');
        } else {
          showFlowActorNotice('rival', 'GUARD TERMINO', '#d5b4ff');
        }
      }
    }
    game.remoteSpeed = clamp(Number(state.speed) || CONFIG.startSpeed, 0, CONFIG.maxSpeed);
    game.rivalStats = normalizeStats(state.stats, {
      score: Number(state.score) || 0,
      meters: Number(state.meters) || 0
    });
    game.remoteReceivedAt = now;
    game.remoteKunais = Array.isArray(state.kunais) ? state.kunais.map(kunai => ({
      id: String(kunai.id),
      x: clamp(Number(kunai.x) || 0, -120, 1200),
      height: kunai.height === 'high' ? 'high' : 'low',
      phase: Number.isFinite(Number(kunai.phase)) ? Number(kunai.phase) : 0,
      resolved: Boolean(kunai.resolved)
    })) : [];
    game.remoteExplosions = Array.isArray(state.explosions) ? state.explosions.map(explosion => ({
      x: clamp(Number(explosion.x) || 0, -100, 1100),
      y: Number(explosion.y) > 520 ? CONFIG.rivalLowY : CONFIG.rivalHighY,
      age: clamp(Number(explosion.age) || 0, 0, .42)
    })) : [];

    for (const slot of ['clothing', 'hair', 'weapon', 'back']) {
      const optionId = state.loadout?.[slot];
      const valid = game.outfitRegistry?.slots?.[slot]?.some(option => option.id === optionId);
      if (valid) game.rivalLoadout[slot] = optionId;
    }
    renderHud();
  }

  function tickRemotePose(now) {
    if (!isOnlineRace()) return;
    while (game.remotePoseQueue[0]?.applyAt <= now) {
      const pose = game.remotePoseQueue.shift();
      game.rival.mode = pose.mode;
      game.rival.actionStarted = pose.actionStarted;
      game.rival.until = 0;
    }
  }

  let flowBoundsCache = { left: 0, right: W, checkedAt: 0 };

  function flowVisibleWorldBounds(now = performance.now()) {
    if (now - flowBoundsCache.checkedAt < 500) return flowBoundsCache;
    const viewportRect = elements.gameViewport?.getBoundingClientRect();
    const canvasRect = fx.getBoundingClientRect();
    if (!viewportRect || !canvasRect.width) return flowBoundsCache;
    flowBoundsCache = {
      left: clamp((viewportRect.left - canvasRect.left) / canvasRect.width * W, 0, W),
      right: clamp((viewportRect.right - canvasRect.left) / canvasRect.width * W, 0, W),
      checkedAt: now
    };
    return flowBoundsCache;
  }

  function flowGuardState() {
    const playerX = flowActorHitX('player');
    const rivalX = flowActorHitX('rival');
    const frontRole = playerX >= rivalX ? 'player' : 'rival';
    const backRole = frontRole === 'player' ? 'rival' : 'player';
    const frontActor = frontRole === 'player' ? game.player : game.rival;
    const verticalGap = Math.abs(flowPlayerCenterY() - flowRivalCenterY());
    return {
      frontRole,
      backRole,
      active: Boolean(frontActor.shield && Math.abs(playerX - rivalX) >= 20 &&
        verticalGap <= CONFIG.flowHitRadius * 2),
      verticalGap
    };
  }

  function drawFlowThreatGuides(now) {
    const speed = flowProjectileSpeed(now);
    const centerY = flowPlayerCenterY();
    const playerHitX = flowActorHitX('player');
    const bounds = flowVisibleWorldBounds(now);
    const threats = game.flowProjectiles
      .filter(projectile => !projectile.dead && projectile.x > playerHitX)
      .map(projectile => ({
        projectile,
        predictedY: predictFlowProjectileY(projectile, playerHitX, speed),
        seconds: (projectile.x - playerHitX) / Math.max(1, speed)
      }))
      .filter(threat => Math.abs(threat.predictedY - centerY) <= CONFIG.flowHitRadius + 16)
      .sort((a, b) => a.seconds - b.seconds)
      .slice(0, 2);

    for (const threat of threats) {
      const imminent = threat.seconds <= .45;
      const color = imminent ? '#ff5967' : '#ffd45f';
      const startX = clamp(threat.projectile.x, playerHitX + 20, bounds.right - 28);
      ctx.save();
      ctx.globalAlpha = imminent ? .9 : .58;
      ctx.strokeStyle = color;
      ctx.fillStyle = color;
      ctx.lineWidth = imminent ? 3 : 2;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(startX, threat.projectile.y);
      ctx.lineTo(playerHitX, threat.predictedY);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.ellipse(playerHitX, centerY, 24, CONFIG.flowHitRadius, 0, 0, Math.PI * 2);
      ctx.stroke();
      if (threat.projectile.x > bounds.right) {
        const edgeX = bounds.right - 20;
        ctx.beginPath();
        ctx.moveTo(edgeX - 14, threat.projectile.y - 12);
        ctx.lineTo(edgeX, threat.projectile.y);
        ctx.lineTo(edgeX - 14, threat.projectile.y + 12);
        ctx.closePath();
        ctx.fill();
        ctx.font = '900 10px ui-monospace, Consolas, monospace';
        ctx.textAlign = 'right';
        ctx.fillText(`${Math.max(.1, threat.seconds).toFixed(1)}s`, edgeX - 19, threat.projectile.y + 4);
      }
      ctx.restore();
    }

    const drawLifeBadge = (x, y, lives) => {
      const count = clamp(Math.round(Number(lives) || 0), 0, 3);
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(5,8,13,.82)';
      ctx.strokeStyle = 'rgba(255,105,119,.58)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(x - 24, y - 10, 48, 20);
      ctx.strokeRect(x - 24, y - 10, 48, 20);
      ctx.save();
      ctx.translate(x - 12, y);
      ctx.rotate(Math.PI / 4);
      ctx.fillStyle = count > 0 ? '#ff4658' : '#5a2931';
      ctx.shadowColor = '#ff4658';
      ctx.shadowBlur = visualProfile.glow && count > 0 ? 8 : 0;
      ctx.fillRect(-5, -5, 10, 10);
      ctx.restore();
      ctx.fillStyle = '#fff4f5';
      ctx.font = '900 12px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(count), x + 8, y + .5);
      ctx.restore();
    };

    const drawSwordBadge = (x, y, charges) => {
      const count = clamp(Math.round(Number(charges) || 0), 0, CONFIG.flowSwordMax);
      const accent = count > 0 ? '#ffcf63' : '#756847';
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(5,8,13,.82)';
      ctx.strokeStyle = count > 0 ? 'rgba(255,207,99,.68)' : 'rgba(117,104,71,.5)';
      ctx.lineWidth = 1.5;
      ctx.fillRect(x - 24, y - 10, 48, 20);
      ctx.strokeRect(x - 24, y - 10, 48, 20);
      ctx.strokeStyle = accent;
      ctx.lineWidth = 2.5;
      ctx.lineCap = 'round';
      ctx.shadowColor = accent;
      ctx.shadowBlur = visualProfile.glow && count > 0 ? 6 : 0;
      ctx.beginPath();
      ctx.moveTo(x - 17, y + 6);
      ctx.lineTo(x - 7, y - 5);
      ctx.moveTo(x - 17, y - 3);
      ctx.lineTo(x - 8, y + 6);
      ctx.stroke();
      ctx.fillStyle = count > 0 ? '#fff5d5' : '#aaa083';
      ctx.font = '900 12px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(count), x + 8, y + .5);
      ctx.restore();
    };

    ctx.save();
    ctx.fillStyle = '#8af8ef';
    ctx.shadowColor = '#35d9cf';
    ctx.shadowBlur = visualProfile.glow ? 8 : 0;
    ctx.font = '900 10px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    const playerX = flowActorFxX('player');
    drawSwordBadge(playerX, centerY - 143, game.flowSwordCharges);
    drawLifeBadge(playerX, centerY - 119, game.lives);
    ctx.fillText('VOS', playerX, centerY - 92);
    ctx.beginPath();
    ctx.moveTo(playerX - 5, centerY - 84);
    ctx.lineTo(playerX + 5, centerY - 84);
    ctx.lineTo(playerX, centerY - 77);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    const rivalX = flowActorFxX('rival');
    const rivalY = flowRivalCenterY();
    drawSwordBadge(rivalX, rivalY - 143, game.rivalSwordCharges);
    drawLifeBadge(rivalX, rivalY - 119, game.remoteLives);
    ctx.save();
    ctx.fillStyle = '#d6b7ff';
    ctx.shadowColor = '#9a70ff';
    ctx.shadowBlur = visualProfile.glow ? 8 : 0;
    ctx.font = '900 9px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('COMP', rivalX, rivalY - 92);
    ctx.beginPath();
    ctx.moveTo(rivalX - 5, rivalY - 84);
    ctx.lineTo(rivalX + 5, rivalY - 84);
    ctx.lineTo(rivalX, rivalY - 77);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFlowShieldGlow(role, now) {
    const player = role !== 'rival';
    const x = flowActorFxX(player ? 'player' : 'rival');
    const y = player ? flowPlayerCenterY() : flowRivalCenterY();
    const accent = player ? '#64fff4' : '#c99cff';
    const actor = player ? game.player : game.rival;
    const remaining = shieldRemainingMs(actor, now);
    const seconds = Math.max(1, Math.ceil(remaining / 1000));
    const ratio = clamp(remaining / CONFIG.shieldDurationMs, 0, 1);
    const pulse = 1 + Math.sin(now * .009 + (player ? 0 : 1.7)) * .07;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    if (visualProfile.glow) {
      const aura = ctx.createRadialGradient(x, y, 12, x, y, 96 * pulse);
      aura.addColorStop(0, player ? 'rgba(90,255,239,.34)' : 'rgba(196,137,255,.32)');
      aura.addColorStop(.52, player ? 'rgba(52,220,210,.13)' : 'rgba(157,91,231,.13)');
      aura.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = aura;
      ctx.fillRect(x - 110, y - 120, 220, 240);
    }
    ctx.strokeStyle = accent;
    ctx.lineWidth = 4;
    ctx.shadowColor = accent;
    ctx.shadowBlur = visualProfile.glow ? 26 : 0;
    ctx.beginPath();
    ctx.ellipse(x, y, 56 * pulse, 88 * pulse, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.globalAlpha = .82;
    ctx.lineWidth = 7;
    ctx.beginPath();
    ctx.arc(x, y, 70 * pulse, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.font = '900 12px ui-monospace, Consolas, monospace';
    ctx.textAlign = 'left';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(4,7,12,.92)';
    ctx.fillStyle = accent;
    ctx.shadowColor = accent;
    ctx.shadowBlur = visualProfile.glow ? 10 : 0;
    const timer = `GUARD ${seconds}s`;
    ctx.strokeText(timer, x + 50, y - 62);
    ctx.fillText(timer, x + 50, y - 62);
    ctx.strokeStyle = accent;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(x + 41, y - 66, 11, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * ratio);
    ctx.stroke();
    ctx.restore();
  }

  function drawFlowStatusEffects(now) {
    if (now < game.flowBlastUntil) {
      const alpha = clamp((game.flowBlastUntil - now) / 720, 0, 1);
      const originX = flowActorHitX(game.flowBlastRole);
      const originY = game.flowBlastRole === 'rival' ? flowRivalCenterY() : flowPlayerCenterY();
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = alpha * .7;
      if (visualProfile.glow) {
        const flash = ctx.createRadialGradient(originX, originY, 20, originX, originY, 620);
        flash.addColorStop(0, 'rgba(255,255,220,.95)');
        flash.addColorStop(.2, 'rgba(255,205,74,.62)');
        flash.addColorStop(1, 'rgba(255,70,40,0)');
        ctx.fillStyle = flash;
      } else {
        ctx.fillStyle = `rgba(255,154,55,${alpha * .22})`;
      }
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }

    game.flowActorNotices = game.flowActorNotices.filter(notice => notice.until > now);
    for (const notice of game.flowActorNotices) {
      const player = notice.role !== 'rival';
      const x = flowActorFxX(player ? 'player' : 'rival');
      const y = (player ? flowPlayerCenterY() : flowRivalCenterY()) - 174;
      const alpha = clamp((notice.until - now) / 260, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, .45 + alpha);
      ctx.font = '900 13px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(4,7,12,.9)';
      ctx.strokeText(notice.text, x, y);
      ctx.fillStyle = notice.color;
      ctx.shadowColor = notice.color;
      ctx.shadowBlur = visualProfile.glow ? 12 : 0;
      ctx.fillText(notice.text, x, y);
      ctx.restore();
    }
  }

  function drawFlowObjects(now) {
    if (!isFlowMode()) return;
    drawFlowThreatGuides(now);
    for (const projectile of game.flowProjectiles) {
      const palette = projectile.kind === 'violet'
        ? ['#c894ff', '#442064']
        : ['#edf7ff', '#68798d'];
      ctx.save();
      ctx.translate(projectile.x, projectile.y);
      ctx.rotate(Math.sin(game.elapsed * 6 + projectile.phase) * .08);
      ctx.shadowColor = palette[0];
      ctx.shadowBlur = visualProfile.glow ? 11 : 0;
      const trailY = -projectile.vy / Math.max(1, flowProjectileSpeed(now)) * 120;
      ctx.save();
      ctx.globalAlpha = .42;
      ctx.strokeStyle = palette[0];
      ctx.lineWidth = 3;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(20, 0);
      ctx.lineTo(132, trailY);
      ctx.stroke();
      ctx.restore();
      ctx.fillStyle = palette[0];
      ctx.beginPath();
      ctx.moveTo(-28, 0);
      ctx.lineTo(-5, -8);
      ctx.lineTo(8, 0);
      ctx.lineTo(-5, 8);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = palette[1];
      ctx.fillRect(5, -4, 25, 8);
      ctx.strokeStyle = palette[0];
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(35, 0, 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const buffStyle = {
      shield: ['#65e9ff', '#123d5e', 'O', 'GUARD'],
      blast: ['#ffd35e', '#7a2714', 'X', 'EXPLOSION'],
      blade: ['#ffc95f', '#57360f', '+2', 'FILOS'],
      life: ['#ff6575', '#641927', '+1', 'VIDA']
    };
    for (const pickup of game.flowPickups) {
      if (pickup.collected) continue;
      const [accent, fill, symbol, label] = buffStyle[pickup.kind] || buffStyle.shield;
      const y = pickup.y + Math.sin(game.elapsed * 7 + pickup.phase) * 5;
      ctx.save();
      ctx.translate(pickup.x, y);
      ctx.rotate(game.elapsed * .75);
      ctx.shadowColor = accent;
      ctx.shadowBlur = visualProfile.glow ? 22 : 0;
      ctx.fillStyle = fill;
      ctx.strokeStyle = accent;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -23);
      ctx.lineTo(23, 0);
      ctx.lineTo(0, 23);
      ctx.lineTo(-23, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-game.elapsed * .75);
      ctx.fillStyle = '#fff';
      ctx.font = '900 17px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(symbol, 0, 6);
      ctx.fillStyle = accent;
      ctx.font = '900 9px ui-monospace, Consolas, monospace';
      ctx.fillText(label, 0, 39);
      ctx.restore();
    }

    if (game.player.shield) drawFlowShieldGlow('player', now);
    if (game.rival.shield) drawFlowShieldGlow('rival', now);

    if (game.flowMove) {
      ctx.save();
      ctx.globalAlpha = .72;
      ctx.fillStyle = '#8af8ef';
      ctx.font = '900 24px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(game.flowMove < 0 ? '^' : 'v', flowActorFxX('player') - 50,
        flowPlayerCenterY() + (game.flowMove < 0 ? -58 : 68));
      ctx.restore();
    }
    if (game.flowMoveX) {
      ctx.save();
      ctx.globalAlpha = .82;
      ctx.fillStyle = '#8af8ef';
      ctx.font = '900 26px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(game.flowMoveX < 0 ? '<' : '>', flowActorFxX('player'),
        flowPlayerCenterY() + 72);
      ctx.restore();
    }
    drawFlowStatusEffects(now);
  }

  function drawDuoObjects(now) {
    if (!isDuoMode()) return;
    for (const core of game.linkedCores) {
      if (core.resolved) continue;
      const y = laneGroundY(core.lane) - 84;
      const pulse = 1 + Math.sin(game.elapsed * 8 + core.phase) * .08;
      const linked = game.kunais.find(kunai => kunai.linkId === core.id && !kunai.dead);
      if (linked) {
        ctx.save();
        ctx.strokeStyle = 'rgba(255,77,108,.48)';
        ctx.lineWidth = 3;
        ctx.setLineDash([9, 7]);
        ctx.beginPath();
        ctx.moveTo(core.x, y);
        ctx.lineTo(linked.x, linked.y);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.translate(core.x, y);
      ctx.scale(pulse, pulse);
      ctx.shadowColor = '#ff3f6b';
      ctx.shadowBlur = visualProfile.glow ? 22 : 0;
      ctx.fillStyle = '#4c1024';
      ctx.strokeStyle = '#ff6b87';
      ctx.lineWidth = 4;
      ctx.beginPath();
      for (let point = 0; point < 6; point += 1) {
        const angle = -Math.PI / 2 + point * Math.PI / 3;
        const px = Math.cos(angle) * 25;
        const py = Math.sin(angle) * 25;
        if (!point) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = '900 12px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('CORE', 0, 4);
      ctx.restore();
    }

    for (const pickup of game.pickups) {
      if (pickup.collected) continue;
      const y = pickupY(pickup) + Math.sin(game.elapsed * 7 + pickup.phase) * 6;
      const colors = pickup.kind === 'shield'
        ? ['#68dfff', '#123f66']
        : (pickup.kind === 'medkit' ? ['#72f5a1', '#14502d'] : ['#d5a5ff', '#4b2480']);
      ctx.save();
      ctx.translate(pickup.x, y);
      ctx.rotate(game.elapsed * .9);
      ctx.shadowColor = colors[0];
      ctx.shadowBlur = visualProfile.glow ? 20 : 0;
      ctx.fillStyle = colors[1];
      ctx.strokeStyle = colors[0];
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(0, -22);
      ctx.lineTo(22, 0);
      ctx.lineTo(0, 22);
      ctx.lineTo(-22, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.rotate(-game.elapsed * .9);
      ctx.fillStyle = '#fff';
      ctx.font = '900 16px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(pickup.kind === 'shield' ? 'O' : (pickup.kind === 'medkit' ? '+' : 'S'), 0, 6);
      ctx.fillStyle = colors[0];
      ctx.font = '900 9px ui-monospace, Consolas, monospace';
      ctx.fillText(pickup.kind === 'shield' ? 'ESCUDO' : (pickup.kind === 'medkit' ? 'CURAR' : 'SYNC'), 0, 39);
      ctx.restore();
    }

    if (game.player.shield) {
      ctx.save();
      ctx.strokeStyle = 'rgba(105,224,255,.9)';
      ctx.fillStyle = 'rgba(65,190,255,.08)';
      ctx.lineWidth = 4;
      ctx.shadowColor = '#62dfff';
      ctx.shadowBlur = visualProfile.glow ? 18 : 0;
      ctx.beginPath();
      ctx.ellipse(CONFIG.playerX, actorGroundY(game.player, now) - 82, 52, 88, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    if (game.rival.shield) {
      ctx.save();
      ctx.strokeStyle = 'rgba(196,161,255,.86)';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#a675ff';
      ctx.shadowBlur = visualProfile.glow ? 15 : 0;
      ctx.beginPath();
      ctx.ellipse(CONFIG.playerX + rivalLeadOffset(), actorGroundY(game.rival, now) - 78,
        48, 82, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const rivalLaneAge = now - game.rival.laneChangedAt;
    if (game.rival.laneChangedAt && rivalLaneAge >= 0 && rivalLaneAge < CONFIG.laneSwitchMs) {
      const y = actorGroundY(game.rival, now) - 165;
      ctx.save();
      ctx.fillStyle = '#d5bdff';
      ctx.font = '900 22px ui-monospace, Consolas, monospace';
      ctx.textAlign = 'center';
      ctx.fillText(game.rival.lane === 'rival' ? '↑' : '↓',
        CONFIG.playerX + rivalLeadOffset() + formationOffset('rival'), y);
      ctx.restore();
    }

    if (now < game.ultimateFlashUntil) {
      const alpha = (game.ultimateFlashUntil - now) / 850;
      ctx.fillStyle = `rgba(202,163,255,${alpha * .22})`;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function drawFrame(now = performance.now()) {
    const frameStartedAt = performance.now();
    let backgroundMs = 0;
    let backgroundRendered = false;
    const backgroundFrameMs = 1000 / Math.max(1, visualProfile.backgroundFps);
    if (!game.running || now >= nextBackgroundFrameAt - 1) {
      const backgroundStartedAt = performance.now();
      drawWorld();
      backgroundMs = performance.now() - backgroundStartedAt;
      backgroundRendered = true;
      if (game.running) {
        if (!Number.isFinite(nextBackgroundFrameAt) || nextBackgroundFrameAt === -Infinity) {
          nextBackgroundFrameAt = now + backgroundFrameMs;
        } else {
          do nextBackgroundFrameAt += backgroundFrameMs;
          while (nextBackgroundFrameAt <= now);
        }
      }
    }
    const characterStartedAt = performance.now();
    const runtimeStats = window.NinjaRuntimeRenderFrame?.(now) || {};
    const characterMs = performance.now() - characterStartedAt;
    const effectsStartedAt = performance.now();
    ctx.clearRect(0, 0, W, H);
    if (isFlowMode()) {
      drawFlowObjects(now);
    } else {
      for (const kunai of game.kunais) {
        if (isDuoMode() || kunai.lane !== 'rival' || game.enemyKunaisVisible) drawKunai(kunai);
      }
      for (const kunai of visibleRemoteKunais(now)) drawKunai(kunai);
      drawDuoObjects(now);
    }
    drawSlash(now);
    drawExplosions(now);
    drawParticles();
    const effectsMs = performance.now() - effectsStartedAt;
    return {
      totalMs: performance.now() - frameStartedAt,
      backgroundMs,
      backgroundRendered,
      characterMs,
      effectsMs,
      rasterDraws: runtimeStats.rasterDraws || 0,
      poseHits: runtimeStats.poseHits || 0,
      poseMisses: runtimeStats.poseMisses || 0,
      poseCache: runtimeStats.poseCache || window.NinjaRuntimePerformance?.snapshot?.()
    };
  }

  function loop(now) {
    if (!game.running) return;
    const updateStartedAt = performance.now();
    const dt = game.lastTime ? Math.min(.05, Math.max(0, (now - game.lastTime) / 1000)) : 0;
    game.lastTime = now;
    updateShieldTimers(now);
    tickPlayer(now);
    tickRival(now);
    tickRemotePose(now);
    updateDifficulty(dt);
    if (isFlowMode()) updateFlowObjects(dt, now);
    else {
      updateKunais(dt, now);
      updateDuoObjects(dt, now);
    }
    updateEffects(dt);
    sendOnlineState(dt, now);
    const updateMs = performance.now() - updateStartedAt;
    if (now - lastVisualFrameAt >= targetFrameMs - 1) {
      lastVisualFrameAt = now;
      recordPerformance(now, updateMs, drawFrame(now));
    }
    if (game.running) requestAnimationFrame(loop);
  }

  const BEST_KEY = 'ninja_runner_best_v2';

  function getBest() {
    try { return Number(localStorage.getItem(BEST_KEY) || 0); } catch (_) { return 0; }
  }

  function saveBest(score) {
    try {
      if (score > getBest()) localStorage.setItem(BEST_KEY, String(score));
    } catch (_) { /* Storage can be unavailable in privacy mode. */ }
  }

  function normalizeStats(value, fallback = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const number = (key, defaultValue = 0) => Math.max(0,
      Number.isFinite(Number(source[key])) ? Number(source[key]) : Number(fallback[key]) || defaultValue);
    return {
      score: Math.round(number('score')),
      meters: Math.min(isFlowMode() ? CONFIG.flowLength : CONFIG.raceLength, number('meters')),
      dodges: Math.round(number('dodges')),
      cuts: Math.round(number('cuts')),
      attacks: Math.round(number('attacks')),
      hitsReceived: Math.round(number('hitsReceived')),
      maxCombo: Math.round(number('maxCombo')),
      durationMs: Math.round(number('durationMs')),
      currentCombo: Math.round(number('currentCombo'))
    };
  }

  function currentStats() {
    return normalizeStats({
      ...game.stats,
      score: game.score,
      meters: game.playerMeters,
      durationMs: game.elapsed * 1000
    });
  }

  function formatDuration(milliseconds) {
    const totalSeconds = Math.max(0, Math.round(Number(milliseconds) / 1000));
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = String(totalSeconds % 60).padStart(2, '0');
    return minutes + ':' + seconds;
  }

  function renderResultStats() {
    const player = currentStats();
    const rival = normalizeStats(game.finalOpponentStats || game.rivalStats, {
      meters: game.rivalMeters,
      hitsReceived: game.rival.hits,
      durationMs: game.elapsed * 1000
    });
    const precision = stats => stats.attacks > 0 ? Math.round(stats.cuts / stats.attacks * 100) + '%' : '—';
    const metrics = [
      ['PUNTAJE', formatScore(player.score), rival.score ? formatScore(rival.score) : '—'],
      ['DISTANCIA', Math.round(player.meters) + ' m', Math.round(rival.meters) + ' m'],
      ['ESQUIVAS', player.dodges, rival.dodges],
      ['CORTES', player.cuts, rival.cuts],
      ['IMPACTOS', player.hitsReceived, rival.hitsReceived],
      ['PRECISIÓN', precision(player), precision(rival)],
      ['MEJOR RACHA', '×' + player.maxCombo, '×' + rival.maxCombo],
      ['TIEMPO', formatDuration(player.durationMs), formatDuration(rival.durationMs)]
    ];
    elements.resultPlayerName.textContent = game.playerName.toUpperCase();
    elements.resultRivalName.textContent = game.rivalPlayerName.toUpperCase();
    elements.resultConnector.textContent = (isDuoMode() || isFlowMode()) ? 'Y' : 'VS';
    elements.resultStats.replaceChildren();
    for (const [label, playerValue, rivalValue] of metrics) {
      const row = document.createElement('div');
      row.className = 'result-stat-row';
      for (const value of [playerValue, label, rivalValue]) {
        const cell = document.createElement('span');
        cell.textContent = String(value);
        row.appendChild(cell);
      }
      elements.resultStats.appendChild(row);
    }
  }

  function showGameOver() {
    saveBest(displayedScore());
    if (game.outcome === 'flow-complete') {
      elements.resultEyebrow.textContent = 'RECORRIDO COMPLETADO EN EQUIPO';
      elements.gameOverTitle.textContent = 'MISION DUO COMPLETADA';
    } else if (game.outcome === 'flow-defeat') {
      elements.resultEyebrow.textContent = 'EL EQUIPO QUEDO FUERA';
      elements.gameOverTitle.textContent = 'INTENTALO DE NUEVO';
    } else if (game.outcome === 'team-victory') {
      elements.resultEyebrow.textContent = 'MISION CUMPLIDA EN EQUIPO';
      elements.gameOverTitle.textContent = 'LLEGARON JUNTOS';
    } else if (game.outcome === 'team-defeat') {
      elements.resultEyebrow.textContent = 'EL EQUIPO QUEDO FUERA';
      elements.gameOverTitle.textContent = 'INTENTEN DE NUEVO';
    } else if (game.outcome === 'victory') {
      elements.resultEyebrow.textContent = 'PRIMER LUGAR · ' + game.playerName.toUpperCase();
      elements.gameOverTitle.textContent = 'GANASTE';
    } else if (game.outcome === 'race-loss') {
      elements.resultEyebrow.textContent = game.rivalPlayerName.toUpperCase() + ' LLEGÓ PRIMERO';
      elements.gameOverTitle.textContent = 'SEGUNDO PUESTO';
    } else {
      elements.resultEyebrow.textContent = 'FUERA DE CARRERA';
      elements.gameOverTitle.textContent = 'GAME OVER';
    }
    elements.finalScore.textContent = formatScore(displayedScore());
    elements.bestScore.textContent = `Mejor puntaje: ${formatScore(getBest())}`;
    renderResultStats();
    const canRematch = isOnlineRace() && window.NinjaNetwork?.snapshot().canRematch;
    elements.retryBtn.disabled = false;
    elements.retryBtn.firstChild.textContent = canRematch
      ? (isCoopMode() ? 'JUGAR DE NUEVO ' : 'PEDIR REVANCHA ')
      : (isOnlineRace()
        ? (isCoopMode() ? 'BUSCAR OTRO COMPANERO ' : 'BUSCAR OTRO RIVAL ')
        : (isFlowMode() ? 'VOLVER AL DUO ' : 'CORRER DE NUEVO '));
    elements.enemyKunaiToggle.hidden = true;
    elements.latencyHud.hidden = true;
    elements.duoHud.hidden = true;
    elements.flowHud.hidden = true;
    elements.gameOverScreen.classList.remove('hidden');
  }

  function resetState() {
    clearTimeout(game.matchStartTimer);
    clearInterval(game.countdownTimer);
    clearTimeout(game.countdownHideTimer);
    game.matchStartTimer = 0;
    game.countdownTimer = 0;
    game.countdownHideTimer = 0;
    game.countingDown = false;
    elements.raceCountdown.hidden = true;
    elements.raceCountdown.classList.remove('go');
    game.running = false;
    game.over = false;
    game.matchmaking = false;
    game.matchMode = 'bot';
    game.score = 0;
    game.combo = 0;
    game.lives = isFlowMode() ? 2 : 3;
    game.elapsed = 0;
    game.distance = 0;
    game.playerMeters = 0;
    game.rivalMeters = 0;
    game.outcome = 'defeat';
    game.speed = CONFIG.startSpeed;
    game.spawnClock = .82;
    game.rivalSpawnClock = 1.15;
    game.spawnDelay = CONFIG.startSpawnDelay;
    game.lastTime = 0;
    lastVisualFrameAt = -Infinity;
    nextBackgroundFrameAt = -Infinity;
    performanceState.windowStartedAt = performance.now();
    performanceState.windowFrames = 0;
    performanceState.samples = [];
    performanceState.lastRenderedAt = 0;
    game.nextDuoObjectId = 1;
    game.kunais = [];
    game.pickups = [];
    game.linkedCores = [];
    game.particles = [];
    game.explosions = [];
    game.rivalTargetMeters = 0;
    game.remoteKunais = [];
    game.remoteExplosions = [];
    game.remoteReceivedAt = 0;
    game.remoteSpeed = CONFIG.startSpeed;
    game.remoteLives = isFlowMode() ? 2 : 3;
    game.remotePoseQueue = [];
    game.networkSendClock = 0;
    game.hudRenderClock = 0;
    game.networkFinishedSent = false;
    game.duoHost = false;
    game.duoPatternClock = 2.2;
    game.duoPatternIndex = 0;
    game.duoPatternLast = '';
    game.duoPatternSeen = { route: 0, mirror: 0, core: 0, support: 0 };
    game.duoCue = null;
    game.duoCueUntil = 0;
    game.flowY = 520;
    game.flowMove = 0;
    game.flowX = CONFIG.hitX + CONFIG.flowSeparation;
    game.flowMoveX = 0;
    game.rivalFlowY = 400;
    game.rivalFlowTargetY = 400;
    game.rivalFlowX = CONFIG.hitX - CONFIG.flowSeparation;
    game.rivalFlowTargetX = game.rivalFlowX;
    game.flowSwordCharges = isFlowMode() ? CONFIG.flowSwordStart : CONFIG.competitiveSwordStart;
    game.rivalSwordCharges = isFlowMode() ? CONFIG.flowSwordStart : CONFIG.competitiveSwordStart;
    game.rivalFlowDecisionAt = 0;
    game.flowPatternClock = 2.2;
    game.flowPatternLast = '';
    game.flowPatternIndex = 0;
    game.flowCue = '';
    game.flowCueUntil = 0;
    game.flowProjectiles = [];
    game.flowPickups = [];
    game.flowActorNotices = [];
    game.flowBlastUntil = 0;
    game.flowBlastRole = 'player';
    game.teamRescueUntil = 0;
    game.syncMeter = 0;
    game.ultimateFlashUntil = 0;
    game.ultimateArmUntil = 0;
    game.ultimateArmedByRemote = false;
    game.lastAttackAt = 0;
    game.stats = { dodges: 0, cuts: 0, attacks: 0, hitsReceived: 0, maxCombo: 0 };
    game.rivalStats = normalizeStats({});
    game.finalOpponentStats = null;
    game.rivalLoadout.back = 'classic';
    game.player.duckHeld = false;
    game.player.duckInputHeld = false;
    game.player.invulnerableUntil = 0;
    game.player.lane = 'player';
    game.player.previousLane = 'player';
    game.player.laneChangedAt = 0;
    game.player.laneCooldownUntil = 0;
    game.player.shield = false;
    game.player.shieldUntil = 0;
    game.rival.mode = 'idle';
    game.rival.lane = 'rival';
    game.rival.previousLane = 'rival';
    game.rival.laneChangedAt = 0;
    game.rival.laneCooldownUntil = 0;
    game.rival.shield = false;
    game.rival.shieldUntil = 0;
    game.rival.actionStarted = performance.now();
    game.rival.until = 0;
    game.rival.invulnerableUntil = 0;
    game.rival.targetKunaiId = null;
    game.rival.plannedAction = null;
    game.rival.decisions = 0;
    game.rival.hits = 0;
    setPlayerMode('run', 0);
  }

  function setNetworkStatus(state, label) {
    elements.networkStatus.dataset.state = state;
    elements.networkLabel.textContent = label;
  }

  function setLobbyLocked(locked) {
    elements.startBtn.disabled = locked || !game.ready;
    elements.playerNameInput.disabled = locked;
    for (const card of document.querySelectorAll('.loadout-card[data-slot]')) card.disabled = locked;
    for (const card of elements.modeCards) card.disabled = locked;
  }

  function prepareGame(mode = 'bot') {
    if (!game.ready || game.running || game.countingDown) return false;
    const previousMode = game.matchMode;
    if (mode === 'bot' && previousMode === 'matchmaking') window.NinjaNetwork?.leave();
    setRunnerAutoRun(false);
    release('a');
    release('d');
    release('s');
    elements.reset.click();
    resetState();
    game.matchMode = mode === 'online' ? 'online' : 'bot';
    game.rivalTargetMeters = 0;
    if (!isOnlineRace()) game.rivalPlayerName = isCoopMode() ? 'COMPA\u00d1ERO BOT' : 'BOT';
    elements.rivalName.textContent = game.rivalPlayerName;
    setNetworkStatus(isOnlineRace() ? 'matched' : 'online',
      isOnlineRace() ? 'RIVAL CONECTADO · TIEMPO REAL' : 'SIN RIVAL · JUGÁS CONTRA EL BOT');
    if (isCoopMode()) setNetworkStatus(isOnlineRace() ? 'matched' : 'online', isOnlineRace()
      ? 'COMPA\u00d1ERO CONECTADO - TIEMPO REAL'
      : 'SIN COMPA\u00d1ERO - ENTRA EL BOT');
    elements.startLabel.textContent = isCoopMode() ? 'BUSCAR COMPA\u00d1ERO' : 'BUSCAR RIVAL';
    setLobbyLocked(true);
    elements.startScreen.classList.add('hidden');
    elements.gameOverScreen.classList.add('hidden');
    elements.enemyKunaiToggle.hidden = true;
    renderHud();
    renderLatency();
    drawFrame();
    return true;
  }

  function startPreparedRace() {
    if (!game.countingDown) return;
    clearInterval(game.countdownTimer);
    game.countdownTimer = 0;
    game.matchStartTimer = 0;
    game.countingDown = false;
    game.running = true;
    game.lastTime = 0;
    setPlayerMode('run', 0);
    setRivalMode('run', 0);
    elements.countdownCaption.textContent = 'CORRÉ';
    elements.countdownValue.textContent = '¡YA!';
    elements.raceCountdown.classList.add('go');
    elements.enemyKunaiToggle.hidden = isDuoMode() || isFlowMode();
    elements.btnLane.hidden = !isDuoMode();
    setLobbyLocked(false);
    setRunnerAutoRun(true);
    renderLatency();
    requestAnimationFrame(loop);
    game.countdownHideTimer = setTimeout(() => {
      elements.raceCountdown.hidden = true;
      elements.raceCountdown.classList.remove('go');
      game.countdownHideTimer = 0;
    }, 560);
  }

  function scheduleRaceCountdown(mode = 'bot', startAt = Date.now() + 3200) {
    if (!prepareGame(mode)) return false;
    game.countingDown = true;
    renderGameType();
    renderHud();
    elements.raceCountdown.hidden = false;
    elements.raceCountdown.classList.remove('go');
    elements.countdownCaption.textContent = isOnlineRace() ? 'SALIDA SINCRONIZADA' : 'PREPARATE';
    const updateCountdown = () => {
      const remaining = Math.max(0, startAt - Date.now());
      elements.countdownValue.textContent = String(Math.min(3, Math.max(1, Math.ceil(remaining / 1000))));
    };
    updateCountdown();
    game.countdownTimer = setInterval(updateCountdown, 80);
    game.matchStartTimer = setTimeout(startPreparedRace, Math.max(0, startAt - Date.now()));
    return true;
  }

  function launchGame(mode = 'bot') {
    return scheduleRaceCountdown(mode);
  }

  function requestRace() {
    if (!game.ready || game.running || game.matchmaking || game.countingDown) return;
    setPlayerName(elements.playerNameInput.value);
    elements.gameOverScreen.classList.add('hidden');
    elements.startScreen.classList.remove('hidden');
    game.matchMode = 'matchmaking';
    game.matchmaking = true;
    setLobbyLocked(true);
    elements.startLabel.textContent = 'BUSCANDO…';
    setNetworkStatus('searching', 'BUSCANDO OTRA PERSONA · SI NO, ENTRA EL BOT');
    if (isCoopMode()) setNetworkStatus('searching', 'BUSCANDO COMPA\u00d1ERO - SI NO, ENTRA EL BOT');
    const queued = window.NinjaNetwork?.queue({
      name: game.playerName,
      loadout: game.loadout,
      gameType: game.gameType
    });
    if (!queued) launchGame('bot');
  }

  function retryRace() {
    if (game.countingDown || game.running) return;
    const network = window.NinjaNetwork?.snapshot();
    if (isOnlineRace() && network?.canRematch) {
      game.matchmaking = true;
      elements.retryBtn.disabled = true;
      elements.retryBtn.firstChild.textContent = 'ESPERANDO AL RIVAL ';
      setNetworkStatus('matched', 'REVANCHA SOLICITADA · ESPERANDO AL RIVAL');
      if (!window.NinjaNetwork?.rematch()) {
        game.matchmaking = false;
        elements.retryBtn.disabled = false;
        elements.retryBtn.firstChild.textContent = 'BUSCAR OTRO RIVAL ';
      }
      return;
    }
    if (isOnlineRace()) {
      returnToLobby();
      requestRace();
      return;
    }
    launchGame('bot');
  }

  function returnToLobby() {
    window.NinjaNetwork?.leave();
    resetState();
    setRunnerAutoRun(false);
    setLobbyLocked(false);
    elements.gameOverScreen.classList.add('hidden');
    elements.startScreen.classList.remove('hidden');
    elements.enemyKunaiToggle.hidden = true;
    elements.btnLane.hidden = true;
    elements.latencyHud.hidden = true;
    elements.raceCountdown.hidden = true;
    elements.startLabel.textContent = isCoopMode() ? 'BUSCAR COMPA\u00d1ERO' : 'BUSCAR RIVAL';
    const network = window.NinjaNetwork?.snapshot();
    setNetworkStatus(network?.connected ? 'online' : 'offline', network?.connected
      ? 'SERVIDOR ONLINE · MATCHMAKING DISPONIBLE'
      : 'SERVIDOR SIN CONEXIÓN · MODO BOT DISPONIBLE');
    renderHud();
    drawFrame();
  }

  function beginOnlineCountdown(detail) {
    if (!game.matchmaking) return;
    const duoHost = Boolean(detail.duoHost);
    game.gameType = ['duo', 'flow'].includes(detail.gameType) ? 'flow' : 'competitive';
    renderGameType();
    game.matchMode = 'online';
    game.matchmaking = false;
    game.playerName = normalizePlayerName(detail.playerName || game.playerName);
    game.rivalPlayerName = normalizePlayerName(detail.opponentName, 'Rival');
    elements.playerNameInput.value = game.playerName;
    renderHud();
    for (const slot of ['clothing', 'hair', 'weapon', 'back']) {
      const optionId = detail.opponentLoadout?.[slot];
      const valid = game.outfitRegistry?.slots?.[slot]?.some(option => option.id === optionId);
      if (valid) game.rivalLoadout[slot] = optionId;
    }
    setLobbyLocked(true);
    setNetworkStatus('matched', 'RIVAL ENCONTRADO · PREPARATE');
    if (isCoopMode()) setNetworkStatus('matched', 'COMPA\u00d1ERO ENCONTRADO - PREPARENSE');

    const startAt = Number(detail.localStartAt) || Date.now() + 3200;
    scheduleRaceCountdown('online', startAt);
    game.duoHost = duoHost;
    if (isFlowMode()) {
      game.flowX = CONFIG.hitX + (duoHost ? CONFIG.flowSeparation : -CONFIG.flowSeparation);
      game.rivalFlowX = CONFIG.hitX + (duoHost ? -CONFIG.flowSeparation : CONFIG.flowSeparation);
      game.rivalFlowTargetX = game.rivalFlowX;
      drawFrame();
    }
  }

  function fallBackToBot(message = 'EL RIVAL SE FUE · CONTINÚA EL BOT') {
    if (game.countingDown) {
      clearTimeout(game.matchStartTimer);
      clearInterval(game.countdownTimer);
      game.matchStartTimer = 0;
      game.countdownTimer = 0;
      game.countingDown = false;
      elements.raceCountdown.hidden = true;
    }
    if (game.matchMode === 'matchmaking' || (isOnlineRace() && !game.running)) {
      game.matchmaking = false;
      launchGame('bot');
      return;
    }
    if (!isOnlineRace()) return;
    game.matchMode = 'bot';
    game.networkFinishedSent = false;
    game.remoteKunais = [];
    game.remoteExplosions = [];
    game.remotePoseQueue = [];
    game.rivalTargetMeters = game.rivalMeters;
    game.rivalSpawnClock = .55;
    game.rival.targetKunaiId = null;
    game.rival.plannedAction = null;
    setRivalMode('run', 0);
    game.rivalPlayerName = isCoopMode() ? 'COMPA\u00d1ERO BOT' : 'BOT';
    elements.rivalName.textContent = game.rivalPlayerName;
    setNetworkStatus('online', 'MODO BOT · CARRERA CONTINÚA');
    renderLatency();
    showToast(message);
  }

  function finishOnlineRace(detail) {
    if (!isOnlineRace()) return;
    game.finalOpponentStats = normalizeStats(detail.opponentStats || game.rivalStats);
    game.outcome = isFlowMode()
      ? (detail.success ? 'flow-complete' : 'flow-defeat')
      : isDuoMode()
      ? (detail.success ? 'team-victory' : 'team-defeat')
      : (detail.won ? 'victory' : (detail.reason === 'knockout' ? 'knockout' : 'race-loss'));
    game.over = true;
    game.running = false;
    setRunnerAutoRun(false);
    release('s');
    setNetworkStatus('online', isCoopMode()
      ? (detail.success ? 'MISION COOPERATIVA CUMPLIDA' : 'MISION COOPERATIVA FALLIDA')
      : (detail.won ? 'VICTORIA ONLINE' : 'DERROTA ONLINE'));
    setTimeout(showGameOver, game.player.mode === 'dead' ? CONFIG.deathMs : 220);
  }

  function renderLoadout() {
    if (!game.outfitRegistry) return;
    for (const card of document.querySelectorAll('.loadout-card[data-slot]')) {
      const slot = card.dataset.slot;
      const options = game.outfitRegistry.slots?.[slot] || [];
      const option = options.find(item => item.id === game.loadout[slot]) || options[0];
      if (!option) continue;
      const image = card.querySelector('img');
      const name = card.querySelector('strong');
      image.src = option.icon;
      image.alt = option.label;
      name.textContent = option.label;
      card.classList.toggle('alternate', option.id !== 'classic');
    }
  }

  function cycleLoadout(slot) {
    if (!game.outfitRegistry || game.running || game.matchmaking) return;
    const options = game.outfitRegistry.slots?.[slot] || [];
    if (options.length < 2) return;
    const currentIndex = Math.max(0, options.findIndex(option => option.id === game.loadout[slot]));
    const next = options[(currentIndex + 1) % options.length];
    game.loadout[slot] = next.id;
    const rivalChoice = slot === 'back'
      ? (options.find(option => option.id === 'classic') || options[0])
      : (options.find(option => option.id !== next.id) || options[0]);
    game.rivalLoadout[slot] = rivalChoice.id;
    renderLoadout();
    showToast(`${slot.toUpperCase()}: ${next.label}`);
  }

  function handleNetworkEvent(event) {
    const detail = event.detail || {};
    if (detail.type === 'connected' || detail.type === 'ready') {
      if (!game.running && !game.matchmaking) {
        setNetworkStatus('online', 'SERVIDOR ONLINE · MATCHMAKING DISPONIBLE');
        if (game.ready) elements.startLabel.textContent =
          isCoopMode() ? 'BUSCAR COMPA\u00d1ERO' : 'BUSCAR RIVAL';
      }
    } else if (detail.type === 'searching') {
      if (game.matchmaking) setNetworkStatus('searching', isCoopMode()
        ? 'BUSCANDO COMPA\u00d1ERO - SI NO, ENTRA EL BOT'
        : 'BUSCANDO OTRA PERSONA - SI NO, ENTRA EL BOT');
    } else if (detail.type === 'match-found') {
      beginOnlineCountdown(detail);
    } else if (detail.type === 'bot-fallback') {
      if (game.matchMode === 'matchmaking') launchGame('bot');
    } else if (detail.type === 'opponent-state') {
      applyRemoteState(detail.state);
    } else if (detail.type === 'opponent-kunai-spawn') {
      applyRemoteKunaiSpawn(detail.kunai);
    } else if (detail.type === 'opponent-duo-event') {
      applyDuoEvent(detail.event);
    } else if (detail.type === 'latency') {
      game.networkRtt = Number.isFinite(Number(detail.rtt)) ? Number(detail.rtt) : null;
      renderLatency();
    } else if (detail.type === 'match-finished') {
      finishOnlineRace(detail);
    } else if (detail.type === 'rematch-status') {
      if (!game.over) return;
      const ownId = window.NinjaNetwork?.snapshot().clientId;
      if (detail.requestedBy !== ownId && !game.matchmaking) {
        elements.retryBtn.disabled = false;
        elements.retryBtn.firstChild.textContent = 'ACEPTAR REVANCHA ';
        setNetworkStatus('matched', 'EL RIVAL QUIERE REVANCHA');
      }
    } else if (detail.type === 'opponent-left' || detail.type === 'rematch-expired') {
      if (game.over) {
        game.matchmaking = false;
        elements.retryBtn.disabled = false;
        elements.retryBtn.firstChild.textContent = 'BUSCAR OTRO RIVAL ';
        setNetworkStatus('online', detail.type === 'rematch-expired'
          ? 'LA SALA DE REVANCHA EXPIRÓ'
          : 'EL RIVAL VOLVIÓ AL LOBBY');
        showToast(detail.type === 'rematch-expired' ? 'BUSCÁ UN NUEVO RIVAL' : 'EL RIVAL SALIÓ DE LA SALA');
      } else {
        fallBackToBot('EL RIVAL SE DESCONECTÓ · ENTRA EL BOT');
      }
    } else if (detail.type === 'disconnected') {
      if (game.over && isOnlineRace()) {
        game.matchmaking = false;
        elements.retryBtn.disabled = false;
        elements.retryBtn.firstChild.textContent = 'BUSCAR OTRO RIVAL ';
        setNetworkStatus('offline', 'SIN CONEXIÓN · REVANCHA NO DISPONIBLE');
      } else if (game.matchMode === 'matchmaking' || isOnlineRace()) {
        fallBackToBot('SIN CONEXIÓN · ENTRA EL BOT');
      } else if (!game.running) {
        setNetworkStatus('offline', 'SERVIDOR SIN CONEXIÓN · MODO BOT DISPONIBLE');
      }
    } else if ((detail.type === 'connecting' || detail.type === 'queue-pending') && !game.running) {
      setNetworkStatus('connecting', 'CONECTANDO AL SERVIDOR…');
    } else if (detail.type === 'connection-error' && !game.running) {
      setNetworkStatus('offline', 'REINTENTANDO CONEXIÓN…');
    }
  }

  function markReady(detail = {}) {
    if (game.ready) return;
    game.ready = true;
    elements.startBtn.disabled = false;
    elements.startLabel.textContent = isCoopMode() ? 'BUSCAR COMPA\u00d1ERO' : 'BUSCAR RIVAL';
    const count = detail.loadedParts || 21;
    game.outfitRegistry = detail.outfitRegistry || window.NinjaOutfitRegistry || game.outfitRegistry;
    renderLoadout();
    elements.loadStatus.textContent = `${count} piezas, ${detail.outfitPacks || 4} variantes y 7 animaciones listas`;
    if (autoStartRequested) {
      autoStartRequested = false;
      setTimeout(() => launchGame('bot'), 80);
    }
  }

  function markLoadError(event) {
    elements.startBtn.disabled = true;
    elements.startLabel.textContent = 'ERROR DE CARGA';
    elements.loadStatus.textContent = event.detail?.message || 'No se pudieron cargar los assets';
  }

  function bindInputs() {
    elements.startBtn.addEventListener('click', requestRace);
    elements.retryBtn.addEventListener('click', retryRace);
    elements.lobbyBtn.addEventListener('click', returnToLobby);
    elements.enemyKunaiToggle.addEventListener('click', () => {
      setEnemyKunaisVisible(!game.enemyKunaisVisible);
    });
    elements.playerNameInput.addEventListener('change', () => {
      setPlayerName(elements.playerNameInput.value);
    });
    elements.playerNameInput.addEventListener('blur', () => {
      setPlayerName(elements.playerNameInput.value);
    });
    elements.playerNameInput.addEventListener('keydown', event => {
      if (event.key === 'Enter') {
        event.preventDefault();
        elements.playerNameInput.blur();
      }
    });
    for (const card of document.querySelectorAll('.loadout-card[data-slot]')) {
      card.addEventListener('click', () => cycleLoadout(card.dataset.slot));
    }
    for (const card of elements.modeCards) {
      card.addEventListener('click', () => setGameType(card.dataset.gameType));
    }

    window.addEventListener('keydown', event => {
      if (!game.running || event.repeat) return;
      const key = event.key.toLowerCase();
      if (['w', 's', 'j', 'a', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) {
        event.preventDefault();
      }
      if (isFlowMode()) {
        if (key === 'w' || key === 'arrowup') setFlowMove(-1);
        else if (key === 's' || key === 'arrowdown') setFlowMove(1);
        else if (key === 'a' || key === 'arrowleft') setFlowMoveX(-1);
        else if (key === 'd' || key === 'arrowright') setFlowMoveX(1);
        else if (key === 'j' || key === ' ') doAttack();
        return;
      }
      if (key === 'w' || key === 'arrowup') doJump();
      else if (key === 's' || key === 'arrowdown') duckStart();
      else if (key === 'j' || key === ' ') doAttack();
      else if (key === 'a' || key === 'arrowleft') setPlayerLane('rival');
      else if (key === 'd' || key === 'arrowright') setPlayerLane('player');
    });

    window.addEventListener('keyup', event => {
      const key = event.key.toLowerCase();
      if (isFlowMode() && (key === 'w' || key === 'arrowup') && game.flowMove < 0) {
        event.preventDefault();
        setFlowMove(0);
        return;
      }
      if (isFlowMode() && (key === 's' || key === 'arrowdown') && game.flowMove > 0) {
        event.preventDefault();
        setFlowMove(0);
        return;
      }
      if (isFlowMode() && (key === 'a' || key === 'arrowleft') && game.flowMoveX < 0) {
        event.preventDefault();
        setFlowMoveX(0);
        return;
      }
      if (isFlowMode() && (key === 'd' || key === 'arrowright') && game.flowMoveX > 0) {
        event.preventDefault();
        setFlowMoveX(0);
        return;
      }
      if (key === 's' || key === 'arrowdown') {
        event.preventDefault();
        duckEnd();
      }
    });

    window.addEventListener('blur', () => {
      duckEnd();
      resetFlowJoystick();
    });
    document.addEventListener('visibilitychange', () => {
      game.lastTime = performance.now();
      if (document.hidden) resetFlowJoystick();
    });
    window.addEventListener('resize', resetFlowJoystick, { passive: true });

    elements.flowJoystick.addEventListener('pointerdown', beginFlowJoystick);
    elements.flowJoystick.addEventListener('pointermove', event => {
      if (event.pointerId !== flowJoystickState.pointerId) return;
      event.preventDefault();
      updateFlowJoystick(event);
    });
    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      elements.flowJoystick.addEventListener(eventName, endFlowJoystick);
    }

    elements.btnJump.addEventListener('pointerdown', event => {
      event.preventDefault();
      if (isFlowMode()) {
        elements.btnJump.setPointerCapture?.(event.pointerId);
        setFlowMove(-1);
      } else doJump();
    });
    elements.btnAttack.addEventListener('pointerdown', event => { event.preventDefault(); doAttack(); });
    elements.btnBack.addEventListener('pointerdown', event => {
      event.preventDefault();
      elements.btnBack.setPointerCapture?.(event.pointerId);
      setFlowMoveX(-1);
    });
    elements.btnForward.addEventListener('pointerdown', event => {
      event.preventDefault();
      elements.btnForward.setPointerCapture?.(event.pointerId);
      setFlowMoveX(1);
    });
    elements.btnLane.addEventListener('pointerdown', event => { event.preventDefault(); switchPlayerLane(); });
    elements.btnDuck.addEventListener('pointerdown', event => {
      event.preventDefault();
      elements.btnDuck.setPointerCapture?.(event.pointerId);
      if (isFlowMode()) setFlowMove(1);
      else duckStart();
    });
    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      elements.btnJump.addEventListener(eventName, () => {
        if (isFlowMode() && game.flowMove < 0) setFlowMove(0);
      });
      elements.btnDuck.addEventListener(eventName, () => {
        if (isFlowMode()) {
          if (game.flowMove > 0) setFlowMove(0);
        } else duckEnd();
      });
      elements.btnBack.addEventListener(eventName, () => {
        if (isFlowMode() && game.flowMoveX < 0) setFlowMoveX(0);
      });
      elements.btnForward.addEventListener(eventName, () => {
        if (isFlowMode() && game.flowMoveX > 0) setFlowMoveX(0);
      });
    }
  }

  window.addEventListener('ninja-runtime-ready', event => markReady(event.detail));
  window.addEventListener('ninja-runtime-error', markLoadError);
  window.addEventListener('ninja-network', handleNetworkEvent);

  bindInputs();
  resetState();
  setPlayerName(game.playerName, false);
  setGameType(requestedGameType);
  renderHud();
  renderEnemyKunaiToggle();
  drawFrame();
  const initialNetwork = window.NinjaNetwork?.snapshot();
  if (initialNetwork?.connected) setNetworkStatus('online', 'SERVIDOR ONLINE · MATCHMAKING DISPONIBLE');
  else setNetworkStatus('connecting', 'CONECTANDO AL SERVIDOR…');

  if (document.documentElement.dataset.ninjaRuntime === 'ready') markReady();
  else if (document.documentElement.dataset.ninjaRuntime === 'error') {
    markLoadError({ detail: { message: elements.status.textContent } });
  }

  window.__ninjaRunner = Object.freeze({
    start: requestRace,
    startBot: () => launchGame('bot'),
    startOnline: requestRace,
    jump: doJump,
    attack: doAttack,
    setFlowMove,
    setFlowMoveX,
    setFlowVector,
    ...(qaMode ? {
      beginFlowJoystick: testFlowJoystick,
      updateFlowJoystick: (pointerId, clientX, clientY) => updateFlowJoystick({
        pointerId, clientX, clientY
      }),
      endFlowJoystick: pointerId => endFlowJoystick({ pointerId })
    } : {}),
    duckStart,
    duckEnd,
    setGameType,
    setPlayerLane,
    switchLane: switchPlayerLane,
    spawnKunai,
    spawnPickup,
    spawnDuoPattern,
    spawnFlowProjectile,
    spawnFlowPickup,
    spawnFlowPattern,
    setPlayerName,
    setEnemyKunaisVisible,
    toggleEnemyKunais: () => setEnemyKunaisVisible(!game.enemyKunaisVisible),
    snapshot: () => ({
      ready: game.ready,
      running: game.running,
      over: game.over,
      countingDown: game.countingDown,
      matchMode: game.matchMode,
      gameType: game.gameType,
      duoHost: game.duoHost,
      syncMeter: game.syncMeter,
      duoPatternLast: game.duoPatternLast,
      duoPatternSeen: { ...game.duoPatternSeen },
      duoCue: game.duoCue ? { ...game.duoCue } : null,
      duoCueActive: Boolean(game.duoCue && performance.now() < game.duoCueUntil),
      flowY: game.flowY,
      rivalFlowY: game.rivalFlowY,
      flowX: game.flowX,
      rivalFlowX: game.rivalFlowX,
      flowPlayerHitX: flowActorHitX('player'),
      flowRivalHitX: flowActorHitX('rival'),
      flowMove: game.flowMove,
      flowMoveX: game.flowMoveX,
      flowJoystickActive: flowJoystickState.active,
      flowTileOffset: -(((prefersReducedMotion ? 0 : game.distance) * .46) % 180),
      flowSwordCharges: game.flowSwordCharges,
      rivalSwordCharges: game.rivalSwordCharges,
      flowGuard: { ...flowGuardState() },
      flowPatternLast: game.flowPatternLast,
      flowPatternIndex: game.flowPatternIndex,
      flowCue: game.flowCue,
      flowProjectiles: game.flowProjectiles.map(item => ({ ...item })),
      flowPickups: game.flowPickups.map(item => ({ ...item })),
      flowActorNotices: game.flowActorNotices.map(item => ({ ...item })),
      flowBlastUntil: game.flowBlastUntil,
      flowBlastRole: game.flowBlastRole,
      teamRescueReady: game.syncMeter >= CONFIG.teamRescueCost,
      matchmaking: game.matchmaking,
      playerName: game.playerName,
      rivalPlayerName: game.rivalPlayerName,
      enemyKunaisVisible: game.enemyKunaisVisible,
      visualProfile: { ...visualProfile },
      performance: performanceSnapshot(),
      score: game.score,
      combo: game.combo,
      lives: game.lives,
      speed: game.speed,
      playerMeters: game.playerMeters,
      rivalMeters: game.rivalMeters,
      rivalMode: game.rival.mode,
      rivalHits: game.rival.hits,
      stats: currentStats(),
      rivalStats: { ...game.rivalStats },
      rivalPlan: game.rival.plannedAction,
      rivalDecisions: game.rival.decisions,
      outcome: game.outcome,
      loadout: { ...game.loadout },
      rivalLoadout: { ...game.rivalLoadout },
      playerMode: game.player.mode,
      playerLane: game.player.lane,
      rivalLane: game.rival.lane,
      playerShield: game.player.shield,
      rivalShield: game.rival.shield,
      playerShieldRemainingMs: shieldRemainingMs(game.player),
      rivalShieldRemainingMs: shieldRemainingMs(game.rival),
      flowLifeLabels: { player: game.lives, rival: game.remoteLives },
      playerInvulnerableUntil: game.player.invulnerableUntil,
      rivalInvulnerableUntil: game.rival.invulnerableUntil,
      remoteLives: game.remoteLives,
      remoteKunais: game.remoteKunais.map(kunai => ({ ...kunai })),
      network: window.NinjaNetwork?.snapshot() || { status: 'offline', connected: false },
      kunais: game.kunais.map(({ id, x, y, height, lane, resolved }) => ({ id, x, y, height, lane, resolved })),
      pickups: game.pickups.map(({ id, kind, lane, x }) => ({ id, kind, lane, x })),
      linkedCores: game.linkedCores.map(({ id, lane, targetLane, x }) => ({ id, lane, targetLane, x })),
      explosions: game.explosions.length,
      explosionLanes: game.explosions.map(explosion => explosion.lane)
    })
  });
})();
