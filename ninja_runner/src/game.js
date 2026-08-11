(function () {
  'use strict';

  const background = document.getElementById('background');
  const bg = background.getContext('2d');
  const fx = document.getElementById('fx');
  const ctx = fx.getContext('2d');
  const W = fx.width;
  const H = fx.height;

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
    attackMinX: 555,
    attackMaxX: 700,
    startSpeed: 375,
    maxSpeed: 720,
    startSpawnDelay: 1.28,
    minSpawnDelay: 0.68,
    jumpMs: 900,
    attackMs: 700,
    hitMs: 535,
    deathMs: 650,
    strikeStartMs: 135,
    strikeEndMs: 455,
    remotePoseDelayMs: 90,
    raceLength: 800
  });

  const elements = {
    lives: document.getElementById('lives'),
    score: document.getElementById('score'),
    combo: document.getElementById('combo'),
    toast: document.getElementById('toast'),
    startScreen: document.getElementById('startScreen'),
    gameOverScreen: document.getElementById('gameOverScreen'),
    startBtn: document.getElementById('startBtn'),
    startLabel: document.getElementById('startLabel'),
    loadStatus: document.getElementById('loadStatus'),
    networkStatus: document.getElementById('networkStatus'),
    networkLabel: document.getElementById('networkLabel'),
    latencyHud: document.getElementById('latencyHud'),
    latencyLabel: document.getElementById('latencyLabel'),
    enemyKunaiToggle: document.getElementById('enemyKunaiToggle'),
    enemyKunaiLabel: document.getElementById('enemyKunaiLabel'),
    playerNameInput: document.getElementById('playerNameInput'),
    playerNameHud: document.getElementById('playerNameHud'),
    retryBtn: document.getElementById('retryBtn'),
    finalScore: document.getElementById('finalScore'),
    bestScore: document.getElementById('bestScoreLabel'),
    resultEyebrow: document.getElementById('resultEyebrow'),
    gameOverTitle: document.getElementById('gameOverTitle'),
    playerProgress: document.getElementById('playerProgress'),
    rivalProgress: document.getElementById('rivalProgress'),
    playerMeters: document.getElementById('playerMeters'),
    rivalMeters: document.getElementById('rivalMeters'),
    rivalName: document.getElementById('rivalName'),
    reset: document.getElementById('reset'),
    status: document.getElementById('status'),
    btnJump: document.getElementById('btnJump'),
    btnDuck: document.getElementById('btnDuck'),
    btnAttack: document.getElementById('btnAttack')
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
    kunais: [],
    particles: [],
    explosions: [],
    enemyKunaisVisible: true,
    playerName: 'Ninja',
    rivalPlayerName: 'Rival',
    matchMode: 'bot',
    matchmaking: false,
    rivalTargetMeters: 0,
    remoteKunais: [],
    remoteExplosions: [],
    remoteReceivedAt: 0,
    remoteSpeed: CONFIG.startSpeed,
    remoteLives: 3,
    remotePoseQueue: [],
    networkRtt: null,
    networkSendClock: 0,
    networkFinishedSent: false,
    matchStartTimer: 0,
    countdownTimer: 0,
    outfitRegistry: null,
    loadout: { clothing: 'classic', hair: 'classic', weapon: 'classic', back: 'classic' },
    rivalLoadout: { clothing: 'set_186_0', hair: 'hair_83_0', weapon: 'weapon_182', back: 'back_item_351' },
    rival: {
      mode: 'run',
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
      actionStarted: 0,
      until: 0,
      duckHeld: false,
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
    getViews: () => {
      const leadOffset = rivalLeadOffset();
      return [
        {
          role: 'rival',
          x: CONFIG.playerX + leadOffset,
          y: CONFIG.rivalGroundY,
          scale: .54,
          frameOffset: 7,
          loadout: game.rivalLoadout,
          animation: { mode: game.rival.mode, startedAt: game.rival.actionStarted }
        },
        {
          role: 'player',
          x: CONFIG.playerX,
          y: CONFIG.playerGroundY,
          scale: .64,
          loadout: game.loadout
        }
      ];
    }
  };

  let toastTimer = 0;
  let autoStartRequested = new URLSearchParams(location.search).get('autostart') === '1';

  function formatScore(value) {
    return Math.max(0, Math.floor(value)).toString().padStart(6, '0');
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

  function renderHud() {
    elements.playerNameHud.textContent = game.playerName;
    elements.rivalName.textContent = game.rivalPlayerName;
    elements.lives.replaceChildren();
    for (let index = 0; index < 3; index += 1) {
      const life = document.createElement('span');
      life.className = index < game.lives ? 'life' : 'life lost';
      life.setAttribute('aria-hidden', 'true');
      elements.lives.appendChild(life);
    }
    elements.lives.setAttribute('aria-label', `${game.lives} ${game.lives === 1 ? 'vida' : 'vidas'}`);
    elements.score.textContent = formatScore(game.score);
    elements.combo.textContent = game.combo >= 2 ? `COMBO ×${game.combo}` : '';
    const playerRatio = Math.min(1, game.playerMeters / CONFIG.raceLength);
    const rivalRatio = Math.min(1, game.rivalMeters / CONFIG.raceLength);
    elements.playerProgress.style.width = `${playerRatio * 100}%`;
    elements.rivalProgress.style.width = `${rivalRatio * 100}%`;
    elements.playerMeters.textContent = `${Math.floor(game.playerMeters)}m`;
    elements.rivalMeters.textContent = `${Math.floor(game.rivalMeters)}m`;
    renderLatency();
  }

  function renderLatency() {
    const visible = isOnlineRace() && game.running && Number.isFinite(game.networkRtt);
    elements.latencyHud.hidden = !visible;
    if (!visible) return;
    const rtt = Math.max(0, Math.round(game.networkRtt));
    elements.latencyLabel.textContent = `${rtt} MS`;
    elements.latencyHud.dataset.quality = rtt < 90 ? 'good' : (rtt < 180 ? 'fair' : 'poor');
    elements.latencyHud.setAttribute('aria-label', `Latencia ${rtt} milisegundos`);
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

  function award(base, label) {
    game.combo += 1;
    const multiplier = Math.min(5, 1 + Math.floor((game.combo - 1) / 3));
    game.score += base * multiplier;
    game.playerMeters = Math.min(CONFIG.raceLength, game.playerMeters + base / 28);
    renderHud();
    if (game.combo > 1) showToast(`${label} · ×${game.combo}`);
  }

  function doJump() {
    if (!game.running || game.player.mode !== 'run') return false;
    press('w');
    setPlayerMode('jump', CONFIG.jumpMs);
    return true;
  }

  function duckStart() {
    if (!game.running || game.player.duckHeld || game.player.mode !== 'run') return false;
    game.player.duckHeld = true;
    press('s');
    setPlayerMode('duck', 0);
    return true;
  }

  function duckEnd() {
    if (!game.player.duckHeld) return;
    game.player.duckHeld = false;
    release('s');
    if (game.player.mode === 'duck') setPlayerMode('run', 0);
  }

  function doAttack() {
    if (!game.running || !['run', 'duck'].includes(game.player.mode)) return false;
    if (game.player.duckHeld) duckEnd();
    press('j');
    setPlayerMode('attack', CONFIG.attackMs);
    return true;
  }

  function tickPlayer(now) {
    if (!game.player.until || now < game.player.until) return;
    if (['jump', 'attack', 'hit'].includes(game.player.mode)) setPlayerMode('run', 0, now);
  }

  function rivalLeadOffset() {
    return clamp((game.rivalMeters - game.playerMeters) * 1.35, -72, 72);
  }

  function setRivalMode(mode, duration, now = performance.now()) {
    game.rival.mode = mode;
    game.rival.actionStarted = now;
    game.rival.until = duration ? now + duration : 0;
  }

  function tickRival(now) {
    if (isOnlineRace()) return;
    if (game.rival.until && now >= game.rival.until) setRivalMode('run', 0, now);

    const target = game.kunais
      .filter(kunai => kunai.lane === 'rival' && !kunai.dead && !kunai.resolved)
      .sort((a, b) => a.x - b.x)[0];
    if (!target) {
      game.rival.targetKunaiId = null;
      game.rival.plannedAction = null;
      return;
    }

    if (game.rival.targetKunaiId !== target.id) {
      game.rival.targetKunaiId = target.id;
      game.rival.decisions += 1;
      const deliberateMistake = game.rival.decisions % 8 === 0;
      game.rival.plannedAction = deliberateMistake
        ? 'miss'
        : (game.rival.decisions % 3 === 0 ? 'attack' : (target.height === 'low' ? 'jump' : 'duck'));
    }

    if (game.rival.mode !== 'run') return;
    const combatX = CONFIG.combatX + rivalLeadOffset();
    const distance = target.x - combatX;
    if (game.rival.plannedAction === 'attack' && distance < 220) {
      setRivalMode('attack', CONFIG.attackMs, now);
    } else if (game.rival.plannedAction === 'jump' && distance < 145) {
      setRivalMode('jump', CONFIG.jumpMs, now);
    } else if (game.rival.plannedAction === 'duck' && distance < 135) {
      setRivalMode('duck', 720, now);
    }
  }

  function spawnKunai(height = Math.random() < .5 ? 'high' : 'low', x = CONFIG.spawnX, lane = 'player') {
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
      phase: Math.random() * Math.PI * 2,
      resolved: false,
      dead: false
    };
    game.kunais.push(kunai);
    if (normalizedLane === 'player' && isOnlineRace() && game.running) {
      window.NinjaNetwork?.sendKunaiSpawn({
        id: String(kunai.id),
        x: kunai.x,
        height: kunai.height,
        phase: kunai.phase,
        resolved: false
      });
    }
    return kunai;
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
      spawnExplosion(clamp(kunai.x - 5, attackMinX, attackMaxX), kunai.y, 'rival');
      return;
    }

    const crossedRival = kunai.previousX > hitX && kunai.x <= hitX;
    if (!crossedRival || kunai.resolved) return;
    const dodged = (kunai.height === 'low' && game.rival.mode === 'jump') ||
      (kunai.height === 'high' && game.rival.mode === 'duck');

    if (dodged) {
      kunai.resolved = true;
      game.rivalMeters = Math.min(CONFIG.raceLength, game.rivalMeters + 3.2);
    } else if (now >= game.rival.invulnerableUntil) {
      kunai.dead = true;
      game.rival.hits += 1;
      game.rivalMeters = Math.max(0, game.rivalMeters - 14);
      game.rival.invulnerableUntil = now + CONFIG.hitMs + 520;
      setRivalMode('hit', CONFIG.hitMs, now);
    } else {
      kunai.resolved = true;
    }
  }

  function takeHit(now) {
    if (now < game.player.invulnerableUntil || game.over) return false;
    duckEnd();
    press('g');
    game.combo = 0;
    game.lives -= 1;
    game.playerMeters = Math.max(0, game.playerMeters - 18);
    game.player.invulnerableUntil = now + CONFIG.hitMs + 620;
    setPlayerMode('hit', CONFIG.hitMs, now);
    renderHud();
    showToast('IMPACTO');

    if (game.lives <= 0) {
      if (isOnlineRace() && !game.networkFinishedSent) {
        game.networkFinishedSent = true;
        window.NinjaNetwork?.finish('knockout');
      }
      game.over = true;
      game.running = false;
      game.outcome = 'knockout';
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
      if (kunai.lane === 'rival') {
        resolveRivalKunai(kunai, now);
        continue;
      }

      if (strikeLive && kunai.x >= CONFIG.attackMinX && kunai.x <= CONFIG.attackMaxX) {
        kunai.dead = true;
        kunai.resolved = true;
        const contactX = Math.max(CONFIG.attackMinX, Math.min(CONFIG.attackMaxX, kunai.x - 5));
        spawnExplosion(contactX, kunai.y, 'player');
        award(150, 'CORTE PERFECTO');
        continue;
      }

      const crossedPlayer = kunai.previousX > CONFIG.hitX && kunai.x <= CONFIG.hitX;
      if (!crossedPlayer || kunai.resolved) continue;

      const dodged = (kunai.height === 'low' && game.player.mode === 'jump') ||
        (kunai.height === 'high' && game.player.mode === 'duck');

      if (dodged) {
        kunai.resolved = true;
        award(100, 'ESQUIVA');
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

  function spawnExplosion(x, y, lane = 'player') {
    game.explosions.push({ x, y, lane, age: 0, duration: .42 });
    const colors = lane === 'rival'
      ? ['#ffffff', '#dcc5ff', '#a675ff', '#6943c7']
      : ['#fff8d6', '#ffd45f', '#ff923d', '#ff3f4f'];
    for (let index = 0; index < 26; index += 1) {
      const angle = (Math.PI * 2 * index / 26) + (Math.random() - .5) * .24;
      const speed = 110 + Math.random() * 360;
      const life = .22 + Math.random() * .34;
      game.particles.push({
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
    for (let index = 0; index < 5; index += 1) {
      game.particles.push({
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

  function updateEffects(dt) {
    for (const particle of game.particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= Math.pow(.035, dt);
      particle.vy += 260 * dt;
      particle.life -= dt;
    }
    game.particles = game.particles.filter(particle => particle.life > 0);
    for (const explosion of game.explosions) explosion.age += dt;
    game.explosions = game.explosions.filter(explosion => explosion.age < explosion.duration);
  }

  function updateDifficulty(dt) {
    game.elapsed += dt;
    game.distance += game.speed * dt;
    game.playerMeters = Math.min(CONFIG.raceLength, game.playerMeters + game.speed * dt / 31);
    if (isOnlineRace()) {
      const smoothing = Math.min(1, dt * 12);
      game.rivalMeters += (game.rivalTargetMeters - game.rivalMeters) * smoothing;
    } else {
      game.rivalMeters = Math.min(CONFIG.raceLength,
        game.rivalMeters + (11.75 + Math.sin(game.elapsed * .72) * .7) * dt);
    }
    game.speed = Math.min(CONFIG.maxSpeed, CONFIG.startSpeed + game.elapsed * 7.2);
    game.spawnDelay = Math.max(CONFIG.minSpawnDelay, CONFIG.startSpawnDelay - game.elapsed * .0085);
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
    renderHud();

    if (isOnlineRace() && !game.over && game.playerMeters >= CONFIG.raceLength &&
        !game.networkFinishedSent) {
      game.networkFinishedSent = true;
      if (!window.NinjaNetwork?.finish('finish')) fallBackToBot('CONEXIÓN PERDIDA · CONTINÚA EL BOT');
    } else if (!isOnlineRace() && !game.over &&
        (game.playerMeters >= CONFIG.raceLength || game.rivalMeters >= CONFIG.raceLength)) {
      game.outcome = game.playerMeters >= game.rivalMeters ? 'victory' : 'race-loss';
      game.over = true;
      game.running = false;
      setRunnerAutoRun(false);
      setTimeout(showGameOver, 260);
    }
  }

  function drawWorld() {
    bg.clearRect(0, 0, W, H);
    const sky = bg.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, '#111a2c');
    sky.addColorStop(.5, '#0d1220');
    sky.addColorStop(1, '#07090e');
    bg.fillStyle = sky;
    bg.fillRect(0, 0, W, H);

    const glow = bg.createRadialGradient(785, 106, 5, 785, 106, 145);
    glow.addColorStop(0, 'rgba(235,239,255,.15)');
    glow.addColorStop(1, 'rgba(235,239,255,0)');
    bg.fillStyle = glow;
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
      const laneGradient = bg.createLinearGradient(0, top, 0, groundY + 18);
      laneGradient.addColorStop(0, laneIndex ? 'rgba(12,16,25,.84)' : 'rgba(18,20,34,.78)');
      laneGradient.addColorStop(1, laneIndex ? 'rgba(8,11,18,.97)' : 'rgba(10,12,22,.94)');
      bg.fillStyle = laneGradient;
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

    drawLane(145, CONFIG.rivalGroundY, '#9a70ff', 'RIVAL', game.rivalMeters * 30, 0);
    drawLane(CONFIG.laneDividerY, CONFIG.playerGroundY, '#ff4655', 'VOS', game.distance, 1);

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

    const trail = ctx.createLinearGradient(18, 0, 112, 0);
    trail.addColorStop(0, rivalKunai ? 'rgba(180,135,255,.68)' : 'rgba(210,221,244,.32)');
    trail.addColorStop(1, rivalKunai ? 'rgba(132,75,255,0)' : 'rgba(210,221,244,0)');
    ctx.strokeStyle = trail;
    ctx.lineWidth = rivalKunai ? 4 : 3;
    ctx.beginPath();
    ctx.moveTo(20, 0);
    ctx.lineTo(112, 0);
    ctx.stroke();

    ctx.shadowColor = rivalKunai ? 'rgba(166,117,255,.9)' : 'rgba(180,205,255,.35)';
    ctx.shadowBlur = rivalKunai ? 16 : 9;
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
      ctx.shadowBlur = 22;
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

    drawArc(game.player, CONFIG.combatX - 24, 522, 118, '#fff8db', '#ff8848', 6);
    drawArc(game.rival, CONFIG.combatX + rivalLeadOffset() - 22, 301, 96, '#f6efff', '#9a70ff', 5);
  }

  function visibleRemoteExplosions(now) {
    if (!isOnlineRace()) return [];
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
      ctx.beginPath();
      ctx.arc(0, 0, 68 * ease + 5, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = Math.max(0, 1 - progress);
      ctx.strokeStyle = explosion.lane === 'rival' ? '#e5d4ff' : '#fff3a3';
      ctx.lineWidth = 4 * (1 - progress) + 1;
      ctx.beginPath();
      ctx.arc(0, 0, 24 + ease * 58, 0, Math.PI * 2);
      ctx.stroke();
      for (let ray = 0; ray < 10; ray += 1) {
        const angle = ray * Math.PI / 5;
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
    if (!isOnlineRace() || !game.enemyKunaisVisible) return [];
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
    const kunai = {
      id,
      x: clamp(Number(value.x) || CONFIG.spawnX, -120, 1200),
      height: value.height === 'high' ? 'high' : 'low',
      phase: Number.isFinite(Number(value.phase)) ? Number(value.phase) : 0,
      resolved: Boolean(value.resolved)
    };
    const existingIndex = game.remoteKunais.findIndex(item => item.id === id);
    if (existingIndex >= 0) game.remoteKunais[existingIndex] = kunai;
    else game.remoteKunais.push(kunai);
    game.remoteReceivedAt = performance.now();
  }

  function buildOnlineState(now) {
    return {
      name: game.playerName,
      meters: game.playerMeters,
      mode: game.player.mode,
      actionAge: Math.max(0, now - game.player.actionStarted),
      lives: game.lives,
      score: game.score,
      speed: game.speed,
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
    game.rivalTargetMeters = clamp(Number(state.meters) || 0, 0, CONFIG.raceLength);
    game.remoteLives = clamp(Math.round(Number(state.lives) || 0), 0, 3);
    game.remoteSpeed = clamp(Number(state.speed) || CONFIG.startSpeed, 0, CONFIG.maxSpeed);
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

  function drawFrame(now = performance.now()) {
    drawWorld();
    ctx.clearRect(0, 0, W, H);
    for (const kunai of game.kunais) {
      if (kunai.lane !== 'rival' || game.enemyKunaisVisible) drawKunai(kunai);
    }
    for (const kunai of visibleRemoteKunais(now)) drawKunai(kunai);
    drawSlash(now);
    drawExplosions(now);
    drawParticles();
  }

  function loop(now) {
    if (!game.running) return;
    const dt = game.lastTime ? Math.min(.05, Math.max(0, (now - game.lastTime) / 1000)) : 0;
    game.lastTime = now;
    tickPlayer(now);
    tickRival(now);
    tickRemotePose(now);
    updateDifficulty(dt);
    updateKunais(dt, now);
    updateEffects(dt);
    sendOnlineState(dt, now);
    drawFrame(now);
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

  function showGameOver() {
    saveBest(game.score);
    if (game.outcome === 'victory') {
      elements.resultEyebrow.textContent = 'PRIMER LUGAR · ' + game.playerName.toUpperCase();
      elements.gameOverTitle.textContent = 'GANASTE';
    } else if (game.outcome === 'race-loss') {
      elements.resultEyebrow.textContent = game.rivalPlayerName.toUpperCase() + ' LLEGÓ PRIMERO';
      elements.gameOverTitle.textContent = 'SEGUNDO PUESTO';
    } else {
      elements.resultEyebrow.textContent = 'FUERA DE CARRERA';
      elements.gameOverTitle.textContent = 'GAME OVER';
    }
    elements.finalScore.textContent = formatScore(game.score);
    elements.bestScore.textContent = `Mejor puntaje: ${formatScore(getBest())}`;
    elements.enemyKunaiToggle.hidden = true;
    elements.latencyHud.hidden = true;
    elements.gameOverScreen.classList.remove('hidden');
  }

  function resetState() {
    clearTimeout(game.matchStartTimer);
    clearInterval(game.countdownTimer);
    game.matchStartTimer = 0;
    game.countdownTimer = 0;
    game.running = false;
    game.over = false;
    game.matchmaking = false;
    game.matchMode = 'bot';
    game.score = 0;
    game.combo = 0;
    game.lives = 3;
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
    game.kunais = [];
    game.particles = [];
    game.explosions = [];
    game.rivalTargetMeters = 0;
    game.remoteKunais = [];
    game.remoteExplosions = [];
    game.remoteReceivedAt = 0;
    game.remoteSpeed = CONFIG.startSpeed;
    game.remoteLives = 3;
    game.remotePoseQueue = [];
    game.networkSendClock = 0;
    game.networkFinishedSent = false;
    game.player.duckHeld = false;
    game.player.invulnerableUntil = 0;
    game.rival.mode = 'run';
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
  }

  function launchGame(mode = 'bot') {
    if (!game.ready || game.running) return;
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
    if (!isOnlineRace()) game.rivalPlayerName = 'BOT';
    elements.rivalName.textContent = game.rivalPlayerName;
    setNetworkStatus(isOnlineRace() ? 'matched' : 'online',
      isOnlineRace() ? 'RIVAL CONECTADO · TIEMPO REAL' : 'SIN RIVAL · JUGÁS CONTRA EL BOT');
    elements.startLabel.textContent = 'BUSCAR RIVAL';
    setLobbyLocked(false);
    elements.startScreen.classList.add('hidden');
    elements.gameOverScreen.classList.add('hidden');
    elements.enemyKunaiToggle.hidden = false;
    renderHud();
    game.running = true;
    setRunnerAutoRun(true);
    renderLatency();
    drawFrame();
    requestAnimationFrame(loop);
  }

  function requestRace() {
    if (!game.ready || game.running || game.matchmaking) return;
    setPlayerName(elements.playerNameInput.value);
    elements.gameOverScreen.classList.add('hidden');
    elements.startScreen.classList.remove('hidden');
    game.matchMode = 'matchmaking';
    game.matchmaking = true;
    setLobbyLocked(true);
    elements.startLabel.textContent = 'BUSCANDO…';
    setNetworkStatus('searching', 'BUSCANDO OTRA PERSONA · SI NO, ENTRA EL BOT');
    const queued = window.NinjaNetwork?.queue({ name: game.playerName, loadout: game.loadout });
    if (!queued) launchGame('bot');
  }

  function returnToLobby() {
    window.NinjaNetwork?.leave();
    resetState();
    setRunnerAutoRun(false);
    setLobbyLocked(false);
    elements.gameOverScreen.classList.add('hidden');
    elements.startScreen.classList.remove('hidden');
    elements.enemyKunaiToggle.hidden = true;
    elements.latencyHud.hidden = true;
    elements.startLabel.textContent = 'BUSCAR RIVAL';
    const network = window.NinjaNetwork?.snapshot();
    setNetworkStatus(network?.connected ? 'online' : 'offline', network?.connected
      ? 'SERVIDOR ONLINE · MATCHMAKING DISPONIBLE'
      : 'SERVIDOR SIN CONEXIÓN · MODO BOT DISPONIBLE');
    renderHud();
    drawFrame();
  }

  function beginOnlineCountdown(detail) {
    if (!game.matchmaking) return;
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

    const startAt = Number(detail.localStartAt) || Date.now() + 1200;
    const updateCountdown = () => {
      const remaining = Math.max(0, startAt - Date.now());
      elements.startLabel.textContent = remaining > 0
        ? 'LARGAMOS EN ' + Math.max(1, Math.ceil(remaining / 1000))
        : '¡YA!';
    };
    updateCountdown();
    game.countdownTimer = setInterval(updateCountdown, 150);
    game.matchStartTimer = setTimeout(() => {
      clearInterval(game.countdownTimer);
      game.countdownTimer = 0;
      launchGame('online');
    }, Math.max(0, startAt - Date.now()));
  }

  function fallBackToBot(message = 'EL RIVAL SE FUE · CONTINÚA EL BOT') {
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
    game.rivalPlayerName = 'BOT';
    elements.rivalName.textContent = game.rivalPlayerName;
    setNetworkStatus('online', 'MODO BOT · CARRERA CONTINÚA');
    renderLatency();
    showToast(message);
  }

  function finishOnlineRace(detail) {
    if (!isOnlineRace()) return;
    game.outcome = detail.won ? 'victory' : (detail.reason === 'knockout' ? 'knockout' : 'race-loss');
    game.over = true;
    game.running = false;
    setRunnerAutoRun(false);
    release('s');
    setNetworkStatus('online', detail.won ? 'VICTORIA ONLINE' : 'DERROTA ONLINE');
    setTimeout(showGameOver, 220);
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
    const rivalChoice = options.find(option => option.id !== next.id) || options[0];
    game.rivalLoadout[slot] = rivalChoice.id;
    renderLoadout();
    showToast(`${slot.toUpperCase()}: ${next.label}`);
  }

  function handleNetworkEvent(event) {
    const detail = event.detail || {};
    if (detail.type === 'connected' || detail.type === 'ready') {
      if (!game.running && !game.matchmaking) {
        setNetworkStatus('online', 'SERVIDOR ONLINE · MATCHMAKING DISPONIBLE');
        if (game.ready) elements.startLabel.textContent = 'BUSCAR RIVAL';
      }
    } else if (detail.type === 'searching') {
      if (game.matchmaking) setNetworkStatus('searching', 'BUSCANDO OTRA PERSONA · SI NO, ENTRA EL BOT');
    } else if (detail.type === 'match-found') {
      beginOnlineCountdown(detail);
    } else if (detail.type === 'bot-fallback') {
      if (game.matchMode === 'matchmaking') launchGame('bot');
    } else if (detail.type === 'opponent-state') {
      applyRemoteState(detail.state);
    } else if (detail.type === 'opponent-kunai-spawn') {
      applyRemoteKunaiSpawn(detail.kunai);
    } else if (detail.type === 'latency') {
      game.networkRtt = Number.isFinite(Number(detail.rtt)) ? Number(detail.rtt) : null;
      renderLatency();
    } else if (detail.type === 'match-finished') {
      finishOnlineRace(detail);
    } else if (detail.type === 'opponent-left') {
      fallBackToBot('EL RIVAL SE DESCONECTÓ · ENTRA EL BOT');
    } else if (detail.type === 'disconnected') {
      if (game.matchMode === 'matchmaking' || isOnlineRace()) {
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
    elements.startLabel.textContent = 'BUSCAR RIVAL';
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
    elements.retryBtn.addEventListener('click', returnToLobby);
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

    window.addEventListener('keydown', event => {
      if (!game.running || event.repeat) return;
      const key = event.key.toLowerCase();
      if (['w', 's', 'j', 'arrowup', 'arrowdown', ' '].includes(key)) event.preventDefault();
      if (key === 'w' || key === 'arrowup') doJump();
      else if (key === 's' || key === 'arrowdown') duckStart();
      else if (key === 'j' || key === ' ') doAttack();
    });

    window.addEventListener('keyup', event => {
      const key = event.key.toLowerCase();
      if (key === 's' || key === 'arrowdown') {
        event.preventDefault();
        duckEnd();
      }
    });

    window.addEventListener('blur', duckEnd);
    document.addEventListener('visibilitychange', () => { game.lastTime = performance.now(); });

    elements.btnJump.addEventListener('pointerdown', event => { event.preventDefault(); doJump(); });
    elements.btnAttack.addEventListener('pointerdown', event => { event.preventDefault(); doAttack(); });
    elements.btnDuck.addEventListener('pointerdown', event => {
      event.preventDefault();
      elements.btnDuck.setPointerCapture?.(event.pointerId);
      duckStart();
    });
    for (const eventName of ['pointerup', 'pointercancel', 'lostpointercapture']) {
      elements.btnDuck.addEventListener(eventName, duckEnd);
    }
  }

  window.addEventListener('ninja-runtime-ready', event => markReady(event.detail));
  window.addEventListener('ninja-runtime-error', markLoadError);
  window.addEventListener('ninja-network', handleNetworkEvent);

  bindInputs();
  resetState();
  setPlayerName(game.playerName, false);
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
    duckStart,
    duckEnd,
    spawnKunai,
    setPlayerName,
    setEnemyKunaisVisible,
    toggleEnemyKunais: () => setEnemyKunaisVisible(!game.enemyKunaisVisible),
    snapshot: () => ({
      ready: game.ready,
      running: game.running,
      over: game.over,
      matchMode: game.matchMode,
      matchmaking: game.matchmaking,
      playerName: game.playerName,
      rivalPlayerName: game.rivalPlayerName,
      enemyKunaisVisible: game.enemyKunaisVisible,
      score: game.score,
      combo: game.combo,
      lives: game.lives,
      speed: game.speed,
      playerMeters: game.playerMeters,
      rivalMeters: game.rivalMeters,
      rivalMode: game.rival.mode,
      rivalHits: game.rival.hits,
      rivalPlan: game.rival.plannedAction,
      rivalDecisions: game.rival.decisions,
      outcome: game.outcome,
      loadout: { ...game.loadout },
      rivalLoadout: { ...game.rivalLoadout },
      playerMode: game.player.mode,
      remoteLives: game.remoteLives,
      remoteKunais: game.remoteKunais.map(kunai => ({ ...kunai })),
      network: window.NinjaNetwork?.snapshot() || { status: 'offline', connected: false },
      kunais: game.kunais.map(({ id, x, y, height, lane, resolved }) => ({ id, x, y, height, lane, resolved })),
      explosions: game.explosions.length,
      explosionLanes: game.explosions.map(explosion => explosion.lane)
    })
  });
})();
