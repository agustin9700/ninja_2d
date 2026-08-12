const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d', { alpha: true, desynchronized: true });

const state = {
  manifest: null,
  timeline: null,
  idleTimeline: null,         // timeline cargado desde idle_animation.json
  crouchTimeline: null,       // timeline cargado desde crouch_animation.json
  runTimeline: null,          // timeline cargado desde run_animation.json
  jumpTimeline: null,         // timeline cargado desde jump_animation.json
  attackTimeline: null,       // timeline cargado desde attack_animation.json
  hitTimeline: null,          // timeline cargado desde hit_animation.json
  deathTimeline: null,        // timeline cargado desde death_animation.json
  parts: new Map(),
  images: new Map(),
  outfitRegistry: null,
  outfitPacks: new Map(),
  characterAnchorStage: { x: 0, y: 0 },
  commands: [],
  frame: 0,
  scale: 3,
  ox: 0,
  oy: 0,
  origin: { x: canvas.width / 2, y: canvas.height / 2 },
  loaded: false,
  selectedId: null,
  loadWarnings: [],
  debug: {
    bones: false,
    pivots: false,
    bounds: false,
    hierarchy: false,
    transforms: false,
    layers: false
  }
};

const appearanceCache = new Map();
const suppressionCache = new Map();
const runnerCommandCache = new WeakMap();
const timelineMetricsCache = new WeakMap();

// ----- Animación de agacharse -----
const anim = {
  active: false,       // ¿S está presionada?
  frame: 0,            // frame actual dentro del crouchTimeline
  lastTime: 0,         // timestamp del último avance de frame
  holding: false       // si el personaje llegó al último frame y lo mantiene
};

// ----- Animación de correr -----
const runAnim = {
  active: false,       // ¿A o D está presionada?
  dir: 1,              // 1 = derecha (D), -1 = izquierda (A)
  frame: 0,
  lastTime: 0
};

// ----- Animación de salto -----
const jumpAnim = {
  active: false,
  frame: 0,
  lastTime: 0
};

// ----- Animación inicial / reposo -----
// ----- Animacion de ataque con espada -----
const attackAnim = {
  active: false,
  frame: 0,
  lastTime: 0
};

// ----- Animacion de golpe recibido -----
const hitAnim = {
  active: false,
  frame: 0,
  lastTime: 0
};

// ----- Animacion de muerte -----
const deathAnim = {
  active: false,
  frame: 0,
  lastTime: 0,
  holding: false
};

const idleAnim = {
  frame: 0,
  lastTime: 0
};

const pressedKeys = new Set();
let lastRunDirection = 1;
const runnerMode = document.body?.dataset.mode === 'runner';
let runnerAutoRunActive = false;

const identity = () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
const finite = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const round = value => Math.round(finite(value) * 10000) / 10000;

function setStatus(message) {
  document.getElementById('status').textContent = message;
}

function normalizeMatrix(matrix, element = {}) {
  if (matrix) {
    return {
      a: finite(matrix.a, 1), b: finite(matrix.b),
      c: finite(matrix.c), d: finite(matrix.d, 1),
      tx: finite(matrix.tx), ty: finite(matrix.ty)
    };
  }
  return { ...identity(), tx: finite(element.x), ty: finite(element.y) };
}

function multiplyMatrices(parent, child) {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty
  };
}

function translationMatrix(tx, ty) {
  return { ...identity(), tx: finite(tx), ty: finite(ty) };
}

function timelineFrameCount(timeline) {
  const cacheable = timeline && (typeof timeline === 'object' || typeof timeline === 'function');
  const cached = cacheable ? timelineMetricsCache.get(timeline)?.frameCount : undefined;
  if (Number.isFinite(cached)) return cached;
  const computed = (timeline?.layers || []).reduce((maximum, layer) => {
    return (layer.frames || []).reduce((layerMaximum, frame) => {
      return Math.max(layerMaximum, finite(frame.index) + Math.max(1, finite(frame.duration, 1)));
    }, maximum);
  }, 1);
  const frameCount = Math.max(1, finite(timeline?.frameCount, 0), computed);
  if (cacheable) {
    timelineMetricsCache.set(timeline, {
      ...timelineMetricsCache.get(timeline),
      frameCount
    });
  }
  return frameCount;
}

function timelineFrameRate(timeline) {
  const cacheable = timeline && (typeof timeline === 'object' || typeof timeline === 'function');
  const cached = cacheable ? timelineMetricsCache.get(timeline)?.frameRate : undefined;
  if (Number.isFinite(cached)) return cached;
  const frameRate = Math.max(1, finite(timeline?.frameRate, 30));
  if (cacheable) {
    timelineMetricsCache.set(timeline, {
      ...timelineMetricsCache.get(timeline),
      frameRate
    });
  }
  return frameRate;
}

function transformPoint(matrix, x, y) {
  return {
    x: matrix.a * x + matrix.c * y + matrix.tx,
    y: matrix.b * x + matrix.d * y + matrix.ty
  };
}

function inversePoint(matrix, x, y) {
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  if (Math.abs(determinant) < 1e-12) return null;
  const dx = x - matrix.tx;
  const dy = y - matrix.ty;
  return {
    x: (matrix.d * dx - matrix.c * dy) / determinant,
    y: (-matrix.b * dx + matrix.a * dy) / determinant
  };
}

function matrixDetails(matrix) {
  const scaleX = Math.hypot(matrix.a, matrix.b);
  const determinant = matrix.a * matrix.d - matrix.b * matrix.c;
  return {
    rotation: Math.atan2(matrix.b, matrix.a) * 180 / Math.PI,
    scaleX,
    scaleY: scaleX === 0 ? 0 : determinant / scaleX,
    determinant
  };
}

function normalizeParts(parts) {
  if (Array.isArray(parts)) return parts;
  return Object.values(parts || {});
}

async function loadImage(path) {
  const image = await new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = 'async';
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`No se pudo cargar ${path}`));
    image.src = path;
  });
  if (typeof createImageBitmap !== 'function') return image;
  try {
    return await createImageBitmap(image, { premultiplyAlpha: 'premultiply' });
  } catch (_) {
    return image;
  }
}

function clonePart(part) {
  return JSON.parse(JSON.stringify(part));
}

function correctPartRegistration(part) {
  const bounds = part.boundsBeforeScale;
  if (!bounds) return part;
  const rasterScale = finite(part.rasterPixelsPerSourceUnit ?? part.scaleFactor, 1);
  const margin = finite(part.margin, 2);
  const x = margin - finite(bounds.left) * rasterScale;
  const y = margin - finite(bounds.top) * rasterScale;
  part.registrationPx = { x, y };
  part.pivot = {
    x,
    y,
    normalizedX: x / Math.max(1, finite(part.exportWidth, 1)),
    normalizedYTop: y / Math.max(1, finite(part.exportHeight, 1)),
    normalizedYUp: 1 - y / Math.max(1, finite(part.exportHeight, 1))
  };
  return part;
}

async function loadOutfitPacks() {
  state.outfitRegistry = null;
  state.outfitPacks.clear();
  appearanceCache.clear();
  suppressionCache.clear();
  if (document.body?.dataset.mode !== 'runner') return;

  const response = await fetch('assets/outfits.json');
  if (!response.ok) throw new Error('No se encontró assets/outfits.json');
  const registry = await response.json();
  const jobs = [];

  for (const [slot, options] of Object.entries(registry.slots || {})) {
    for (const option of options || []) {
      if (!option.manifest) continue;
      jobs.push((async () => {
        const manifestResponse = await fetch(option.manifest);
        if (!manifestResponse.ok) throw new Error(`No se encontró ${option.manifest}`);
        const manifest = await manifestResponse.json();
        const allowed = new Set(option.parts || []);
        const pack = new Map();

        await Promise.all(normalizeParts(manifest.parts)
          .filter(sourcePart => allowed.has(sourcePart.partName || sourcePart.linkageName))
          .map(async sourcePart => {
            const partName = sourcePart.partName || sourcePart.linkageName;
            const part = clonePart(sourcePart);
            if (option.correctRegistration) correctPartRegistration(part);
            const imagePath = `${option.basePath || ''}${part.png}`;
            pack.set(partName, { part, image: await loadImage(imagePath) });
          }));

        const missing = [...allowed].filter(partName => !pack.has(partName));
        if (missing.length) throw new Error(`${option.id}: faltan piezas ${missing.join(', ')}`);
        state.outfitPacks.set(`${slot}:${option.id}`, pack);
      })());
    }
  }

  await Promise.all(jobs);
  state.outfitRegistry = registry;
  appearanceCache.clear();
  suppressionCache.clear();
}

function loadoutCacheKey(loadout) {
  if (!loadout) return 'base';
  return `${loadout.clothing || 'classic'}|${loadout.hair || 'classic'}|` +
    `${loadout.weapon || 'classic'}|${loadout.back || 'classic'}`;
}

function appearanceFor(partName, loadout) {
  const cacheKey = `${loadoutCacheKey(loadout)}:${partName}`;
  if (appearanceCache.has(cacheKey)) return appearanceCache.get(cacheKey);
  let appearance = null;
  if (loadout) {
    for (const slot of ['clothing', 'hair', 'weapon', 'back']) {
      const optionId = loadout[slot];
      if (!optionId || optionId === 'classic') continue;
      const record = state.outfitPacks.get(`${slot}:${optionId}`)?.get(partName);
      if (record) {
        appearance = record;
        break;
      }
    }
  }
  appearance ||= { part: state.parts.get(partName), image: state.images.get(partName) };
  appearanceCache.set(cacheKey, appearance);
  return appearance;
}

function isPartSuppressedByLoadout(partName, loadout) {
  if (!partName || !loadout || !state.outfitRegistry) return false;
  const cacheKey = `${loadoutCacheKey(loadout)}:${partName}`;
  if (suppressionCache.has(cacheKey)) return suppressionCache.get(cacheKey);
  let suppressed = false;
  for (const [slot, options] of Object.entries(state.outfitRegistry.slots || {})) {
    const optionId = loadout[slot];
    if (!optionId) continue;
    const option = (options || []).find(candidate => candidate.id === optionId);
    if (option?.suppressParts?.includes(partName)) {
      suppressed = true;
      break;
    }
  }
  suppressionCache.set(cacheKey, suppressed);
  return suppressed;
}

function resolvePartName(linkageName) {
  return state.manifest?.partAliases?.[linkageName] || linkageName;
}

function equipmentBindings() {
  return Array.isArray(state.manifest?.equipmentBindings) ? state.manifest.equipmentBindings : [];
}

function isSuppressedLinkage(linkageName) {
  return (state.manifest?.suppressedLinkages || []).includes(linkageName);
}

function alignmentExcludedPartNames() {
  return new Set([
    ...equipmentBindings().map(binding => binding.partName),
    ...Object.values(state.manifest?.partAliases || {})
  ]);
}

function resolveTimeline(manifest) {
  if (manifest.timeline?.layers) return manifest.timeline;
  const timelines = manifest.source?.documentTimelines || [];
  const wantedId = manifest.source?.defaultTimelineId;
  return timelines.find(timeline => timeline.id === wantedId) || timelines[0] || null;
}

function activeFrame(layer, frameNumber) {
  let result = null;
  for (const frame of layer.frames || []) {
    const start = finite(frame.index);
    const end = start + Math.max(1, finite(frame.duration, 1));
    if (frameNumber >= start && frameNumber < end) result = frame;
  }
  return result;
}

// Devuelve el timeline activo según la animación en curso
function activeTimeline() {
  if (deathAnim.active && state.deathTimeline) return state.deathTimeline;
  if (hitAnim.active && state.hitTimeline) return state.hitTimeline;
  if (attackAnim.active && state.attackTimeline) return state.attackTimeline;
  if (jumpAnim.active && state.jumpTimeline) return state.jumpTimeline;
  if (anim.active && state.crouchTimeline) return state.crouchTimeline;
  if (runAnim.active && state.runTimeline) return state.runTimeline;
  return state.idleTimeline || state.timeline;
}

// Devuelve el frame number activo
function activeFrameNumber() {
  if (deathAnim.active && state.deathTimeline) return deathAnim.frame;
  if (hitAnim.active && state.hitTimeline) return hitAnim.frame;
  if (attackAnim.active && state.attackTimeline) return attackAnim.frame;
  if (jumpAnim.active && state.jumpTimeline) return jumpAnim.frame;
  if (anim.active && state.crouchTimeline) return anim.frame;
  if (runAnim.active && state.runTimeline) return runAnim.frame;
  return state.idleTimeline ? idleAnim.frame : state.frame;
}

function commandsForTimeline(timeline, frameNumber, options = {}) {
  const commands = [];
  const layers = timeline?.layers || [];
  const requireImages = options.requireImages !== false;
  let matrixPrefix = normalizeMatrix(options.matrixPrefix || timeline?._runtimeMatrix || identity());
  if (options.facing === -1) {
    matrixPrefix = multiplyMatrices({ a: -1, b: 0, c: 0, d: 1, tx: 0, ty: 0 }, matrixPrefix);
  }

  // XFL/Animate stores layer index 0 at the front. Canvas paints front last.
  for (let layerIndex = layers.length - 1; layerIndex >= 0; layerIndex--) {
    const layer = layers[layerIndex];
    if (layer.visible === false || layer.layerType === 'folder') continue;
    const frame = activeFrame(layer, frameNumber);
    if (!frame) continue;

    for (const element of frame.elements || []) {
      const sourcePartName = element.linkageName;
      if (isSuppressedLinkage(sourcePartName)) continue;
      const partName = resolvePartName(sourcePartName);
      if (element.visible === false || !partName || !state.parts.has(partName)) continue;
      if (requireImages && !state.images.has(partName)) continue;
      commands.push({
        id: element.id || `${timeline.id || 'timeline'}/layer:${layerIndex}/frame:${frame.index}/element:${element.index || 0}`,
        partName,
        layer,
        layerIndex,
        frame,
        element,
        matrix: multiplyMatrices(matrixPrefix, normalizeMatrix(element.matrix, element)),
        parent: timeline.id || timeline.name || 'document timeline'
      });
    }
  }

  return commands;
}

function withEquipmentCommands(commands, timeline, frameNumber) {
  const result = [...commands];
  for (const binding of equipmentBindings()) {
    const partName = binding.partName;
    if (!partName || !state.parts.has(partName) || !state.images.has(partName)) continue;
    if (binding.useTimelineInstanceWhenAvailable && result.some(command => command.partName === partName)) continue;

    const anchorName = resolvePartName(binding.anchorPart);
    const anchorIndex = result.findIndex(command => command.partName === anchorName);
    if (anchorIndex < 0) continue;
    const anchor = result[anchorIndex];
    const command = {
      id: `${timeline?.id || 'timeline'}/equipment:${partName}/frame:${frameNumber}`,
      partName,
      layer: anchor.layer,
      layerIndex: anchor.layerIndex,
      frame: anchor.frame,
      element: {
        linkageName: partName,
        name: `socket:${binding.anchorPart}`,
        visible: true,
        colorAlphaPercent: 100
      },
      matrix: multiplyMatrices(anchor.matrix, normalizeMatrix(binding.localMatrix)),
      parent: `socket:${binding.anchorPart}`
    };

    if (binding.drawOrder === 'behind_character') {
      result.unshift(command);
    } else if (binding.drawOrder === 'after_anchor') {
      result.splice(anchorIndex + 1, 0, command);
    } else {
      result.splice(anchorIndex, 0, command);
    }
  }
  return result;
}

function cachedRunnerCommands(timeline, frameNumber, facing) {
  if (!timeline) return [];
  let timelineCache = runnerCommandCache.get(timeline);
  if (!timelineCache) {
    timelineCache = new Map();
    runnerCommandCache.set(timeline, timelineCache);
  }
  const frame = Math.max(0, Math.floor(finite(frameNumber)));
  const key = `${facing}:${frame}`;
  if (!timelineCache.has(key)) {
    timelineCache.set(key, withEquipmentCommands(
      commandsForTimeline(timeline, frame, { facing }), timeline, frame));
  }
  return timelineCache.get(key);
}

function buildCommands() {
  const timeline = activeTimeline();
  // The exported artwork faces left. Keep every action facing the direction
  // chosen by the runner (not only the run cycle), so jump/attack/hit do not
  // visibly flip back for a frame. In game terms D/right maps to a mirrored
  // timeline and A/left maps to the source orientation.
  const facing = lastRunDirection === 1 ? -1 : 1;
  const frameNumber = activeFrameNumber();
  const commands = cachedRunnerCommands(timeline, frameNumber, facing);
  state.commands = commands;
  if (state.selectedId && !commands.some(command => command.id === state.selectedId)) {
    state.selectedId = null;
  }
}

function sourceBounds(part) {
  const bounds = part.boundsBeforeScale;
  if (bounds) {
    return {
      left: finite(bounds.left), top: finite(bounds.top),
      right: finite(bounds.right), bottom: finite(bounds.bottom)
    };
  }

  const rasterScale = finite(part.rasterPixelsPerSourceUnit ?? part.scaleFactor ?? state.manifest?.raster?.scaleFactor, 1);
  const registration = part.registrationPx || part.pivot || { x: part.exportWidth / 2, y: part.exportHeight / 2 };
  return {
    left: -finite(registration.x) / rasterScale,
    top: -finite(registration.y) / rasterScale,
    right: (finite(part.exportWidth) - finite(registration.x)) / rasterScale,
    bottom: (finite(part.exportHeight) - finite(registration.y)) / rasterScale
  };
}

function transformedBounds(command) {
  const bounds = sourceBounds(state.parts.get(command.partName));
  const points = [
    transformPoint(command.matrix, bounds.left, bounds.top),
    transformPoint(command.matrix, bounds.right, bounds.top),
    transformPoint(command.matrix, bounds.right, bounds.bottom),
    transformPoint(command.matrix, bounds.left, bounds.bottom)
  ];
  return {
    left: Math.min(...points.map(point => point.x)),
    top: Math.min(...points.map(point => point.y)),
    right: Math.max(...points.map(point => point.x)),
    bottom: Math.max(...points.map(point => point.y))
  };
}

function boundsForCommands(commands) {
  if (!commands.length) return null;
  const all = commands.map(transformedBounds);
  return {
    left: Math.min(...all.map(item => item.left)),
    top: Math.min(...all.map(item => item.top)),
    right: Math.max(...all.map(item => item.right)),
    bottom: Math.max(...all.map(item => item.bottom))
  };
}

function bottomCenter(bounds) {
  return { x: (bounds.left + bounds.right) / 2, y: bounds.bottom };
}

function prepareTimelineTransforms() {
  if (!state.timeline) return;
  state.timeline._runtimeMatrix = identity();
  const alignmentExcluded = alignmentExcludedPartNames();
  const baseBounds = boundsForCommands(commandsForTimeline(state.timeline, 0, {
    requireImages: false,
    matrixPrefix: identity()
  }).filter(command => !alignmentExcluded.has(command.partName)));
  if (!baseBounds) return;
  const targetAnchor = bottomCenter(baseBounds);
  state.characterAnchorStage = targetAnchor;

  for (const timeline of [state.idleTimeline, state.crouchTimeline, state.runTimeline, state.jumpTimeline, state.attackTimeline, state.hitTimeline, state.deathTimeline].filter(Boolean)) {
    const rootMatrix = normalizeMatrix(timeline.rootMatrix);
    const sourceBounds = boundsForCommands(commandsForTimeline(timeline, 0, {
      requireImages: false,
      matrixPrefix: rootMatrix
    }));
    if (!sourceBounds) {
      timeline._runtimeMatrix = rootMatrix;
      continue;
    }
    const sourceAnchor = bottomCenter(sourceBounds);
    const alignment = translationMatrix(targetAnchor.x - sourceAnchor.x, targetAnchor.y - sourceAnchor.y);
    timeline._runtimeMatrix = multiplyMatrices(alignment, rootMatrix);
    timeline._alignmentOffset = { tx: alignment.tx, ty: alignment.ty };
  }
}

function playbackBounds() {
  const commands = withEquipmentCommands(commandsForTimeline(state.timeline, 0), state.timeline, 0);
  for (const timeline of [state.idleTimeline, state.crouchTimeline, state.runTimeline, state.jumpTimeline, state.attackTimeline, state.hitTimeline, state.deathTimeline].filter(Boolean)) {
    // All timelines can now inherit the current facing direction.
    const directions = [1, -1];
    for (let frame = 0; frame < timelineFrameCount(timeline); frame++) {
      for (const facing of directions) {
        commands.push(...withEquipmentCommands(commandsForTimeline(timeline, frame, { facing }), timeline, frame));
      }
    }
  }
  return boundsForCommands(commands);
}

function fitPoseToCanvas() {
  buildCommands();
  if (!state.commands.length) return;

  const bounds = playbackBounds() || boundsForCommands(state.commands);
  const width = Math.max(1, bounds.right - bounds.left);
  const height = Math.max(1, bounds.bottom - bounds.top);
  state.scale = Math.min(4, (canvas.width - 220) / width, (canvas.height - 100) / height);
  state.origin = {
    x: canvas.width / 2 - ((bounds.left + bounds.right) / 2) * state.scale,
    y: canvas.height / 2 - ((bounds.top + bounds.bottom) / 2) * state.scale
  };
  state.ox = 0;
  state.oy = 0;
}

function stageToScreen(point) {
  return {
    x: state.origin.x + state.ox + point.x * state.scale,
    y: state.origin.y + state.oy + point.y * state.scale
  };
}

function screenToStage(point) {
  return {
    x: (point.x - state.origin.x - state.ox) / state.scale,
    y: (point.y - state.origin.y - state.oy) / state.scale
  };
}

function applyStageTransform() {
  ctx.translate(state.origin.x + state.ox, state.origin.y + state.oy);
  ctx.scale(state.scale, state.scale);
}

function applyElementMatrix(matrix) {
  ctx.transform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.tx, matrix.ty);
}

function drawPart(command, view = null) {
  if (isPartSuppressedByLoadout(command.partName, view?.loadout)) return;
  const appearance = appearanceFor(command.partName, view?.loadout);
  const image = appearance.image;
  const part = appearance.part;
  if (!image || !part) return;
  const registration = part.registrationPx || part.pivot || { x: image.width / 2, y: image.height / 2 };
  const rasterScale = finite(part.rasterPixelsPerSourceUnit ?? part.scaleFactor ?? state.manifest.raster?.scaleFactor, 1);

  ctx.save();
  if (view) {
    const sourceAnchor = stageToScreen(state.characterAnchorStage);
    const viewScale = finite(view.scale, 1);
    ctx.translate(finite(view.x, sourceAnchor.x), finite(view.y, sourceAnchor.y));
    ctx.scale(viewScale, viewScale);
    ctx.translate(-sourceAnchor.x, -sourceAnchor.y);
  }
  applyStageTransform();
  applyElementMatrix(command.matrix);
  ctx.globalAlpha = Math.max(0, Math.min(1,
    finite(command.element.colorAlphaPercent, 100) / 100 * finite(view?.opacity, 1)));

  // The PNG is measured in raster pixels; the matrix is measured in Animate source units.
  ctx.scale(1 / rasterScale, 1 / rasterScale);
  ctx.drawImage(image, -finite(registration.x), -finite(registration.y));
  ctx.restore();
}

function drawLocalDebug(command, isSelected) {
  const part = state.parts.get(command.partName);
  const bounds = sourceBounds(part);

  ctx.save();
  applyStageTransform();
  applyElementMatrix(command.matrix);
  ctx.lineWidth = (isSelected ? 2 : 1) / state.scale;

  if (state.debug.bounds || isSelected) {
    ctx.strokeStyle = isSelected ? '#ffdb4d' : '#38d8ff99';
    ctx.strokeRect(bounds.left, bounds.top, bounds.right - bounds.left, bounds.bottom - bounds.top);
  }

  if (state.debug.pivots || isSelected) {
    const radius = (isSelected ? 6 : 4) / state.scale;
    ctx.strokeStyle = isSelected ? '#ffdb4d' : '#ff4f64';
    ctx.beginPath();
    ctx.moveTo(-radius, 0);
    ctx.lineTo(radius, 0);
    ctx.moveTo(0, -radius);
    ctx.lineTo(0, radius);
    ctx.stroke();
  }
  ctx.restore();

  const pivot = stageToScreen(transformPoint(command.matrix, 0, 0));
  if (state.debug.layers) {
    ctx.fillStyle = '#e8edf7';
    ctx.font = '11px ui-monospace, Consolas, monospace';
    ctx.fillText(`#${command.layerIndex} ${command.partName}`, pivot.x + 7, pivot.y - 7);
  }

  if (state.debug.transforms) {
    const matrix = command.matrix;
    ctx.fillStyle = '#75f0b0';
    ctx.font = '10px ui-monospace, Consolas, monospace';
    ctx.fillText(`[${round(matrix.a)} ${round(matrix.c)} ${round(matrix.tx)}]`, pivot.x + 7, pivot.y + 8);
    ctx.fillText(`[${round(matrix.b)} ${round(matrix.d)} ${round(matrix.ty)}]`, pivot.x + 7, pivot.y + 20);
  }

  if (state.debug.hierarchy) {
    const root = stageToScreen({ x: 0, y: 0 });
    ctx.strokeStyle = '#a576ff55';
    ctx.setLineDash([3, 5]);
    ctx.beginPath();
    ctx.moveTo(root.x, root.y);
    ctx.lineTo(pivot.x, pivot.y);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}

function drawGrid() {
  if (document.body?.dataset.mode === 'runner') return;
  ctx.save();
  ctx.strokeStyle = '#ffffff10';
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
  }
  ctx.restore();
}

function drawStageOrigin() {
  if (document.body?.dataset.mode === 'runner') return;
  const origin = stageToScreen({ x: 0, y: 0 });
  ctx.save();
  ctx.strokeStyle = '#ff4f64';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(origin.x - 8, origin.y); ctx.lineTo(origin.x + 8, origin.y);
  ctx.moveTo(origin.x, origin.y - 8); ctx.lineTo(origin.x, origin.y + 8);
  ctx.stroke();
  ctx.restore();
}

function drawNoBonesNotice() {
  if (!state.debug.bones) return;
  ctx.save();
  ctx.fillStyle = '#ffcf66';
  ctx.font = '12px Arial, sans-serif';
  ctx.fillText('El XFL fuente no contiene bones anatómicos; las piezas de esta pose son hermanas.', 18, canvas.height - 18);
  ctx.restore();
}

// ---- Indicador de animación en pantalla ----
function drawAnimIndicator() {
  if (document.body?.dataset.mode === 'runner') return;
  // Muerte
  if (deathAnim.active && state.deathTimeline) {
    const frameCount = timelineFrameCount(state.deathTimeline);
    drawBadge(
      deathAnim.holding ? `MUERTO  [${deathAnim.frame + 1}/${frameCount}]` : `MURIENDO  [${deathAnim.frame + 1}/${frameCount}]`,
      '#341313',
      '#ff4d4d',
      deathAnim.frame / Math.max(1, frameCount - 1)
    );
  }

  // Golpe recibido
  if (hitAnim.active && state.hitTimeline) {
    const frameCount = timelineFrameCount(state.hitTimeline);
    drawBadge(
      `GOLPEADO  [${hitAnim.frame + 1}/${frameCount}]`,
      '#332612',
      '#ffd166',
      hitAnim.frame / Math.max(1, frameCount - 1)
    );
  }

  // Espadazo
  if (attackAnim.active && state.attackTimeline) {
    const frameCount = timelineFrameCount(state.attackTimeline);
    drawBadge(
      `ESPADAZO  [${attackAnim.frame + 1}/${frameCount}]`,
      '#3a2018',
      '#ff9f43',
      attackAnim.frame / Math.max(1, frameCount - 1)
    );
  }

  // Salto
  if (jumpAnim.active && state.jumpTimeline) {
    const frameCount = timelineFrameCount(state.jumpTimeline);
    drawBadge(
      `SALTANDO  [${jumpAnim.frame + 1}/${frameCount}]`,
      '#30203a',
      '#e58cff',
      jumpAnim.frame / Math.max(1, frameCount - 1)
    );
  }

  // Agacharse
  if (anim.active && state.crouchTimeline) {
    const frameCount = timelineFrameCount(state.crouchTimeline);
    const progress = anim.frame / Math.max(1, frameCount - 1);
    drawBadge(
      anim.holding ? `AGACHADO  [${anim.frame + 1}/${frameCount}]` : `AGACHANDO…  [${anim.frame + 1}/${frameCount}]`,
      anim.holding ? '#1a3a1a' : '#1a2a3a',
      anim.holding ? '#4cff6e' : '#4cb8ff',
      progress
    );
  }

  // Correr
  if (runAnim.active && state.runTimeline) {
    const frameCount = timelineFrameCount(state.runTimeline);
    const progress = runAnim.frame / Math.max(1, frameCount - 1);
    const dirLabel = runAnim.dir === 1 ? '→ CORRIENDO' : '← CORRIENDO';
    drawBadge(
      `${dirLabel}  [${runAnim.frame + 1}/${frameCount}]`,
      '#1a1a3a',
      '#ffcc44',
      progress
    );
  }
}

function drawBadge(label, bgColor, fgColor, progress) {
  ctx.save();
  ctx.font = 'bold 13px Inter, Arial, sans-serif';
  const tw = ctx.measureText(label).width;
  const bx = 12, by = 12, bw = tw + 20, bh = 28, br = 7;

  ctx.beginPath();
  ctx.roundRect(bx, by, bw, bh, br);
  ctx.fillStyle = bgColor;
  ctx.fill();
  ctx.strokeStyle = fgColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.fillStyle = fgColor;
  ctx.fillText(label, bx + 10, by + 19);

  // Barra de progreso
  const barX = bx, barY = by + bh + 4, barW = bw, barH = 4;
  ctx.fillStyle = '#ffffff15';
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW, barH, 2);
  ctx.fill();
  ctx.fillStyle = fgColor;
  ctx.beginPath();
  ctx.roundRect(barX, barY, barW * Math.max(0, Math.min(1, progress)), barH, 2);
  ctx.fill();

  ctx.restore();
}

// ---- Avance de frames de la animación ----
function updateAnim(now) {
  // Muerte: se reproduce una vez y conserva el ultimo frame.
  if (deathAnim.active && state.deathTimeline) {
    if (!deathAnim.holding) {
      const frameCount = timelineFrameCount(state.deathTimeline);
      const frameDuration = 1000 / timelineFrameRate(state.deathTimeline);
      const elapsed = now - deathAnim.lastTime;
      if (elapsed >= frameDuration) {
        const elapsedFrames = Math.floor(elapsed / frameDuration);
        deathAnim.lastTime += elapsedFrames * frameDuration;
        deathAnim.frame += elapsedFrames;
        if (deathAnim.frame >= frameCount) {
          deathAnim.frame = frameCount - 1;
          deathAnim.holding = true;
        }
      }
    }
    return;
  }

  // Golpe recibido: se reproduce una vez y devuelve el control.
  if (hitAnim.active && state.hitTimeline) {
    const frameCount = timelineFrameCount(state.hitTimeline);
    const frameDuration = 1000 / timelineFrameRate(state.hitTimeline);
    const elapsed = now - hitAnim.lastTime;
    if (elapsed >= frameDuration) {
      const elapsedFrames = Math.floor(elapsed / frameDuration);
      hitAnim.lastTime += elapsedFrames * frameDuration;
      hitAnim.frame += elapsedFrames;
      if (hitAnim.frame >= frameCount) {
        hitAnim.active = false;
        hitAnim.frame = 0;
        syncAnimationInput(now);
      }
    }
    return;
  }

  // Espadazo: se reproduce una vez y vuelve al estado indicado por el teclado.
  if (attackAnim.active && state.attackTimeline) {
    const frameCount = timelineFrameCount(state.attackTimeline);
    const frameDuration = 1000 / timelineFrameRate(state.attackTimeline);
    const elapsed = now - attackAnim.lastTime;
    if (elapsed >= frameDuration) {
      const elapsedFrames = Math.floor(elapsed / frameDuration);
      attackAnim.lastTime += elapsedFrames * frameDuration;
      attackAnim.frame += elapsedFrames;
      if (attackAnim.frame >= frameCount) {
        attackAnim.active = false;
        attackAnim.frame = 0;
        syncAnimationInput(now);
      }
    }
    return;
  }

  // Salto: se reproduce una vez completa y vuelve al estado indicado por el teclado.
  if (jumpAnim.active && state.jumpTimeline) {
    const frameCount = timelineFrameCount(state.jumpTimeline);
    const frameDuration = 1000 / timelineFrameRate(state.jumpTimeline);
    const elapsed = now - jumpAnim.lastTime;
    if (elapsed >= frameDuration) {
      const elapsedFrames = Math.floor(elapsed / frameDuration);
      jumpAnim.lastTime += elapsedFrames * frameDuration;
      jumpAnim.frame += elapsedFrames;
      if (jumpAnim.frame >= frameCount) {
        jumpAnim.active = false;
        jumpAnim.frame = 0;
        syncAnimationInput(now);
      }
    }
    return;
  }

  // Agacharse: avanza hasta el último y se queda
  if (anim.active && state.crouchTimeline) {
    const frameCount = timelineFrameCount(state.crouchTimeline);
    const frameDuration = 1000 / timelineFrameRate(state.crouchTimeline);
    const elapsed = now - anim.lastTime;
    if (!anim.holding && elapsed >= frameDuration) {
      const elapsedFrames = Math.floor(elapsed / frameDuration);
      anim.lastTime += elapsedFrames * frameDuration;
      anim.frame += elapsedFrames;
      if (anim.frame >= frameCount) {
        anim.frame = frameCount - 1;
        anim.holding = true;
      }
    }
  }

  // Correr: loopea continuamente mientras D esté presionado
  if (runAnim.active && state.runTimeline) {
    const frameCount = timelineFrameCount(state.runTimeline);
    const frameDuration = 1000 / timelineFrameRate(state.runTimeline);
    const elapsed = now - runAnim.lastTime;
    if (elapsed >= frameDuration) {
      const elapsedFrames = Math.floor(elapsed / frameDuration);
      runAnim.lastTime += elapsedFrames * frameDuration;
      runAnim.frame = (runAnim.frame + elapsedFrames) % frameCount;
    }
  }

  // Reposo: loopea solamente cuando no hay otra acción activa.
  if (!anim.active && !runAnim.active && state.idleTimeline) {
    const frameCount = timelineFrameCount(state.idleTimeline);
    const frameDuration = 1000 / timelineFrameRate(state.idleTimeline);
    if (now - idleAnim.lastTime >= frameDuration) {
      idleAnim.lastTime = now;
      idleAnim.frame = (idleAnim.frame + 1) % frameCount;
    }
  }
}

function render(now = 0) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  if (!state.loaded) {
    ctx.fillStyle = '#ffffffaa';
    ctx.font = '20px Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Cargando asset_manifest.json', canvas.width / 2, canvas.height / 2);
    ctx.textAlign = 'left';
    requestAnimationFrame(render);
    return;
  }

  updateAnim(now);
  buildCommands();
  const runnerScene = document.body?.dataset.mode === 'runner' ? window.NinjaRunnerScene : null;
  const views = runnerScene?.getViews?.(now);
  if (Array.isArray(views) && views.length) {
    for (const view of views.sort((a, b) => finite(a.y) - finite(b.y))) {
      let commands = state.commands;
      if (view.role === 'rival') commands = commandsForRunnerView(view, now);
      for (const command of commands) drawPart(command, view);
    }
  } else {
    for (const command of state.commands) drawPart(command);
    for (const command of state.commands) drawLocalDebug(command, command.id === state.selectedId);
  }
  drawStageOrigin();
  drawNoBonesNotice();
  drawAnimIndicator();
  requestAnimationFrame(render);
}

function timelineLinkageNames(timeline) {
  return new Set((timeline?.layers || [])
    .flatMap(layer => layer.frames || [])
    .flatMap(frame => frame.elements || [])
    .map(element => element.linkageName)
    .filter(Boolean));
}

function commandsForRunnerView(view, now) {
  const animation = view.animation || {};
  const mode = animation.mode || 'run';
  const timelineByMode = {
    idle: state.idleTimeline,
    run: state.runTimeline,
    jump: state.jumpTimeline,
    duck: state.crouchTimeline,
    attack: state.attackTimeline,
    hit: state.hitTimeline,
    dead: state.deathTimeline
  };
  const timeline = timelineByMode[mode] || state.runTimeline || state.idleTimeline;
  if (!timeline) return state.commands;

  const frameCount = timelineFrameCount(timeline);
  const frameDuration = 1000 / timelineFrameRate(timeline);
  const elapsed = Math.max(0, now - finite(animation.startedAt, now));
  const elapsedFrames = Math.floor(elapsed / frameDuration) +
    (mode === 'run' ? finite(view.frameOffset) : 0);
  const loops = mode === 'run' || mode === 'idle';
  const frame = loops ? elapsedFrames % frameCount : Math.min(frameCount - 1, elapsedFrames);

  return cachedRunnerCommands(timeline, frame, -1);
}

async function loadOptionalTimeline(path, label) {
  try {
    const response = await fetch(path);
    if (!response.ok) throw new Error(`${path} no encontrado`);
    const timeline = await response.json();
    console.log(`${label} cargada: ${timelineFrameCount(timeline)} frames, ${timeline.layers?.length || 0} capas`);
    return timeline;
  } catch (error) {
    console.warn(`${label} deshabilitada:`, error);
    state.loadWarnings.push(`${label}: ${error.message}`);
    return null;
  }
}

function validationSummary(manifest, timeline, loadedParts) {
  const layers = timeline?.layers || [];
  const elements = layers.flatMap(layer => layer.frames || []).flatMap(frame => frame.elements || []);
  const linked = elements.filter(element => element.linkageName && state.parts.has(resolvePartName(element.linkageName)));
  const missingMatrices = linked.filter(element => !element.matrix).length;
  const warnings = [];

  if (layers.length <= 1 && linked.length <= 1) warnings.push('timeline incompleto o capturado después de limpiar el stage');
  if (missingMatrices) warnings.push(`${missingMatrices} instancias sin matriz`);
  if (manifest.rendering?.authoritativeTransform !== 'element.matrix') warnings.push('manifest legacy: se aplicó compatibilidad');
  if (finite(manifest.stats?.errors) > 0) {
    const failedParts = (manifest.stats?.errorDetails || []).map(item => item.partName).filter(Boolean);
    warnings.push(`${manifest.stats.errors} error(es) durante la exportación${failedParts.length ? `: ${failedParts.join(', ')}` : ''}`);
  }
  warnings.push(...state.loadWarnings);

  const animationNames = new Set([
    ...timelineLinkageNames(state.idleTimeline),
    ...timelineLinkageNames(state.crouchTimeline),
    ...timelineLinkageNames(state.runTimeline),
    ...timelineLinkageNames(state.jumpTimeline),
    ...timelineLinkageNames(state.attackTimeline),
    ...timelineLinkageNames(state.hitTimeline),
    ...timelineLinkageNames(state.deathTimeline)
  ]);
  const missingAnimationParts = [...animationNames].filter(name => !isSuppressedLinkage(name) && !state.parts.has(resolvePartName(name))).sort();
  if (missingAnimationParts.length) warnings.push(`piezas de animación sin asset: ${missingAnimationParts.join(', ')}`);
  const unnamedInstances = finite(state.idleTimeline?.stats?.unnamedInstances) + finite(state.crouchTimeline?.stats?.unnamedInstances) + finite(state.runTimeline?.stats?.unnamedInstances) + finite(state.jumpTimeline?.stats?.unnamedInstances) + finite(state.attackTimeline?.stats?.unnamedInstances) + finite(state.hitTimeline?.stats?.unnamedInstances) + finite(state.deathTimeline?.stats?.unnamedInstances);
  if (unnamedInstances) warnings.push(`${unnamedInstances} instancia(s) de animación sin linkage`);

  return [
    `Manifest: ${manifest.outputName}`,
    `Versión: ${manifest.manifestVersion || 'legacy'}`,
    `Timeline: ${timeline?.name || timeline?.id || 'sin nombre'}`,
    `Capas / instancias: ${layers.length} / ${linked.length}`,
    `PNG cargados: ${loadedParts}`,
    `Frames inicial / agacharse / correr / salto / espadazo / golpeado / muerte: ${state.idleTimeline ? timelineFrameCount(state.idleTimeline) : 0} / ${state.crouchTimeline ? timelineFrameCount(state.crouchTimeline) : 0} / ${state.runTimeline ? timelineFrameCount(state.runTimeline) : 0} / ${state.jumpTimeline ? timelineFrameCount(state.jumpTimeline) : 0} / ${state.attackTimeline ? timelineFrameCount(state.attackTimeline) : 0} / ${state.hitTimeline ? timelineFrameCount(state.hitTimeline) : 0} / ${state.deathTimeline ? timelineFrameCount(state.deathTimeline) : 0}`,
    `Matrices faltantes: ${missingMatrices}`,
    warnings.length ? `Avisos: ${warnings.join('; ')}` : 'Validación estructural: OK'
  ].join('\n');
}

async function loadManifest() {
  try {
    state.loaded = false;
    state.loadWarnings = [];
    setStatus('Cargando manifest y PNG…');
    const response = await fetch('assets/asset_manifest.json');
    if (!response.ok) throw new Error('No se encontró assets/asset_manifest.json');
    const manifest = await response.json();
    const timeline = resolveTimeline(manifest);
    if (!timeline?.layers) throw new Error('El manifest no contiene un timeline de documento utilizable.');
    const [idleTimeline, crouchTimeline, runTimeline, jumpTimeline, attackTimeline, hitTimeline, deathTimeline] = await Promise.all([
      loadOptionalTimeline('assets/idle_animation.json', 'Animación inicial'),
      loadOptionalTimeline('assets/crouch_animation.json', 'Animación agacharse'),
      loadOptionalTimeline('assets/run_animation.json', 'Animación correr'),
      loadOptionalTimeline('assets/jump_animation.json', 'Animación salto'),
      loadOptionalTimeline('assets/attack_animation.json', 'Animación espadazo'),
      loadOptionalTimeline('assets/hit_animation.json', 'Animación golpeado'),
      loadOptionalTimeline('assets/death_animation.json', 'Animación muerte')
    ]);

    state.manifest = manifest;
    state.timeline = timeline;
    state.idleTimeline = idleTimeline;
    state.crouchTimeline = crouchTimeline;
    state.runTimeline = runTimeline;
    state.jumpTimeline = jumpTimeline;
    state.attackTimeline = attackTimeline;
    state.hitTimeline = hitTimeline;
    state.deathTimeline = deathTimeline;
    state.parts = new Map(normalizeParts(manifest.parts).map(part => [part.partName || part.linkageName, part]));
    state.images.clear();

    const requestedNames = new Set([
      ...timelineLinkageNames(timeline),
      ...timelineLinkageNames(idleTimeline),
      ...timelineLinkageNames(crouchTimeline),
      ...timelineLinkageNames(runTimeline),
      ...timelineLinkageNames(jumpTimeline),
      ...timelineLinkageNames(attackTimeline),
      ...timelineLinkageNames(hitTimeline),
      ...timelineLinkageNames(deathTimeline)
    ]);
    const requestedPartNames = new Set([...requestedNames].filter(name => !isSuppressedLinkage(name)).map(resolvePartName));
    for (const binding of equipmentBindings()) requestedPartNames.add(binding.partName);
    const requiredNames = [...requestedPartNames].filter(name => state.parts.has(name));

    await Promise.all(requiredNames.map(async name => {
      const part = state.parts.get(name);
      state.images.set(name, await loadImage(`assets/${part.png}`));
    }));
    await loadOutfitPacks();

    state.frame = 0;
    idleAnim.frame = 0;
    idleAnim.lastTime = performance.now();
    attackAnim.active = false;
    attackAnim.frame = 0;
    attackAnim.lastTime = performance.now();
    hitAnim.active = false;
    hitAnim.frame = 0;
    hitAnim.lastTime = performance.now();
    deathAnim.active = false;
    deathAnim.frame = 0;
    deathAnim.lastTime = performance.now();
    deathAnim.holding = false;
    state.selectedId = null;
    prepareTimelineTransforms();
    fitPoseToCanvas();
    state.loaded = true;
    syncUI();
    updateInspector();
    updateKeyBadge();
    setStatus(validationSummary(manifest, timeline, state.images.size));
    window.NinjaOutfitRegistry = state.outfitRegistry;
    document.documentElement.dataset.ninjaRuntime = 'ready';
    window.dispatchEvent(new CustomEvent('ninja-runtime-ready', {
      detail: {
        loadedParts: state.images.size,
        outfitPacks: state.outfitPacks.size,
        outfitRegistry: state.outfitRegistry
      }
    }));
  } catch (error) {
    state.loaded = false;
    document.documentElement.dataset.ninjaRuntime = 'error';
    setStatus(`${error.message}\n\nVerificá asset_manifest.json y los PNG dentro de assets/.`);
    window.dispatchEvent(new CustomEvent('ninja-runtime-error', {
      detail: { message: error.message }
    }));
  }
}

function updateKeyBadge() {
  const badge = document.getElementById('crouchBadge');
  if (!badge) return;
  const hasS = !!state.crouchTimeline;
  const hasRun = !!state.runTimeline;
  const hasJump = !!state.jumpTimeline;
  const hasAttack = !!state.attackTimeline;
  const hasHit = !!state.hitTimeline;
  const hasDeath = !!state.deathTimeline;
  if (!hasS && !hasRun && !hasJump && !hasAttack && !hasHit && !hasDeath) {
    badge.textContent = '⚠ Animaciones no cargadas';
    badge.style.color = '#ff6b6b';
    badge.style.borderColor = '#ff6b6b44';
  } else {
    const parts = [];
    if (hasS) parts.push('↓ S = Agacharse');
    if (hasRun) parts.push('← A / D → = Correr');
    if (hasJump) parts.push('↑ W = Saltar');
    if (hasAttack) parts.push('⚔ J = Espadazo');
    if (hasHit) parts.push('G = Golpeado');
    if (hasDeath) parts.push('M = Muerte');
    badge.textContent = parts.join('  ·  ');
    badge.style.color = '#4cff6e';
    badge.style.borderColor = '#4cff6e44';
  }
}

function selectedCommand() {
  return state.commands.find(command => command.id === state.selectedId) || null;
}

function updateInspector() {
  const inspector = document.getElementById('inspector');
  const command = selectedCommand();
  if (!command) {
    inspector.textContent = 'Seleccioná una pieza en el canvas.';
    return;
  }

  const part = state.parts.get(command.partName);
  const matrix = command.matrix;
  const details = matrixDetails(matrix);
  const registration = part.registrationPx || part.pivot;
  inspector.textContent = [
    `name: ${command.partName}`,
    `symbol: ${command.element.libraryItemName}`,
    `parent: ${command.parent}`,
    `layer: ${command.layerIndex} (${command.layer.name})`,
    `frame: ${command.frame.index}`,
    `matrix:`,
    `  a=${round(matrix.a)}  c=${round(matrix.c)}  tx=${round(matrix.tx)}`,
    `  b=${round(matrix.b)}  d=${round(matrix.d)}  ty=${round(matrix.ty)}`,
    `rotation: ${round(details.rotation)}°`,
    `scale: ${round(details.scaleX)}, ${round(details.scaleY)}`,
    `determinant: ${round(details.determinant)}`,
    `registrationPx: ${round(registration?.x)}, ${round(registration?.y)}`,
    `rasterScale: ${round(part.rasterPixelsPerSourceUnit ?? part.scaleFactor ?? state.manifest.raster?.scaleFactor ?? 1)}`,
    `boundsSource: ${JSON.stringify(sourceBounds(part))}`
  ].join('\n');
}

function canvasPoint(event) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (event.clientX - rect.left) * canvas.width / rect.width,
    y: (event.clientY - rect.top) * canvas.height / rect.height
  };
}

canvas.addEventListener('click', event => {
  if (!state.loaded) return;
  const stagePoint = screenToStage(canvasPoint(event));
  let hit = null;

  // Commands are painted back-to-front, so inspect them front-to-back for picking.
  for (let index = state.commands.length - 1; index >= 0; index--) {
    const command = state.commands[index];
    const local = inversePoint(command.matrix, stagePoint.x, stagePoint.y);
    if (!local) continue;
    const bounds = sourceBounds(state.parts.get(command.partName));
    if (local.x >= bounds.left && local.x <= bounds.right && local.y >= bounds.top && local.y <= bounds.bottom) {
      hit = command;
      break;
    }
  }

  state.selectedId = hit?.id || null;
  updateInspector();
});

// ---- Teclado: S para agacharse, A/D para correr ----
function syncAnimationInput(now = performance.now()) {
  if (deathAnim.active || hitAnim.active || jumpAnim.active || attackAnim.active) return;
  const wantsCrouch = pressedKeys.has('s') && state.crouchTimeline && state.loaded;
  if (wantsCrouch) {
    runAnim.active = false;
    if (!anim.active) {
      anim.active = true;
      anim.frame = 0;
      anim.holding = false;
      anim.lastTime = now;
    }
    return;
  }

  anim.active = false;
  anim.frame = 0;
  anim.holding = false;
  const wantsLeft = !runnerMode && pressedKeys.has('a');
  const wantsRight = runnerMode ? runnerAutoRunActive : pressedKeys.has('d');
  const wantsRun = state.runTimeline && state.loaded && (wantsLeft || wantsRight);
  if (!wantsRun) {
    runAnim.active = false;
    runAnim.frame = 0;
    return;
  }

  const direction = runnerMode ? 1 :
    (wantsLeft && wantsRight ? lastRunDirection : (wantsRight ? 1 : -1));
  if (!runAnim.active) {
    runAnim.frame = 0;
    runAnim.lastTime = now;
  }
  runAnim.active = true;
  runAnim.dir = direction;
}

function setRunnerAutoRun(active, now = performance.now()) {
  if (!runnerMode) return false;
  runnerAutoRunActive = Boolean(active);
  pressedKeys.delete('a');
  pressedKeys.delete('d');
  if (!runnerAutoRunActive) {
    runAnim.active = false;
    runAnim.frame = 0;
  }
  syncAnimationInput(now);
  return runnerAutoRunActive;
}

window.NinjaRunnerAnimation = Object.freeze({
  setAutoRun: setRunnerAutoRun,
  snapshot: () => ({
    active: runnerAutoRunActive,
    running: runAnim.active,
    direction: runAnim.dir
  })
});

document.addEventListener('keydown', event => {
  const key = event.key.toLowerCase();
  if (!['a', 'd', 's', 'w', 'j', 'g', 'm'].includes(key)) return;
  event.preventDefault();
  if (runnerMode && (key === 'a' || key === 'd')) return;
  if (runnerMode && document.body?.dataset.gameType === 'flow' &&
      (key === 'w' || key === 's')) return;
  if (key === 'm') {
    if (event.repeat || deathAnim.active || !state.deathTimeline || !state.loaded) return;
    pressedKeys.clear();
    anim.active = false;
    runAnim.active = false;
    jumpAnim.active = false;
    attackAnim.active = false;
    hitAnim.active = false;
    deathAnim.active = true;
    deathAnim.frame = 0;
    deathAnim.lastTime = performance.now();
    deathAnim.holding = false;
    return;
  }
  if (key === 'g') {
    if (event.repeat || deathAnim.active || hitAnim.active || !state.hitTimeline || !state.loaded) return;
    anim.active = false;
    runAnim.active = false;
    jumpAnim.active = false;
    attackAnim.active = false;
    hitAnim.active = true;
    hitAnim.frame = 0;
    hitAnim.lastTime = performance.now();
    return;
  }
  if (key === 'j') {
    if (event.repeat || deathAnim.active || hitAnim.active || attackAnim.active || jumpAnim.active || !state.attackTimeline || !state.loaded) return;
    anim.active = false;
    runAnim.active = false;
    attackAnim.active = true;
    attackAnim.frame = 0;
    attackAnim.lastTime = performance.now();
    return;
  }
  if (key === 'w') {
    if (event.repeat || deathAnim.active || hitAnim.active || attackAnim.active || !state.jumpTimeline || !state.loaded) return;
    anim.active = false;
    runAnim.active = false;
    jumpAnim.active = true;
    jumpAnim.frame = 0;
    jumpAnim.lastTime = performance.now();
    return;
  }
  pressedKeys.add(key);
  if (key === 'a' || key === 'd') lastRunDirection = key === 'd' ? 1 : -1;
  syncAnimationInput();
});

document.addEventListener('keyup', event => {
  const key = event.key.toLowerCase();
  if (!['a', 'd', 's', 'w', 'j', 'g', 'm'].includes(key)) return;
  event.preventDefault();
  if (runnerMode && (key === 'a' || key === 'd')) return;
  if (runnerMode && document.body?.dataset.gameType === 'flow' &&
      (key === 'w' || key === 's')) return;
  if (key === 'w' || key === 'j' || key === 'g' || key === 'm') return;
  pressedKeys.delete(key);
  syncAnimationInput();
});

window.addEventListener('blur', () => {
  pressedKeys.clear();
  jumpAnim.active = false;
  jumpAnim.frame = 0;
  attackAnim.active = false;
  attackAnim.frame = 0;
  hitAnim.active = false;
  hitAnim.frame = 0;
  syncAnimationInput();
});

document.getElementById('loadBtn').addEventListener('click', loadManifest);
document.getElementById('reset').addEventListener('click', () => {
  pressedKeys.clear();
  state.frame = 0;
  idleAnim.frame = 0;
  idleAnim.lastTime = performance.now();
  state.selectedId = null;
  anim.active = false;
  anim.frame = 0;
  anim.holding = false;
  runAnim.active = false;
  runAnim.frame = 0;
  jumpAnim.active = false;
  jumpAnim.frame = 0;
  attackAnim.active = false;
  attackAnim.frame = 0;
  hitAnim.active = false;
  hitAnim.frame = 0;
  deathAnim.active = false;
  deathAnim.frame = 0;
  deathAnim.holding = false;
  fitPoseToCanvas();
  syncUI();
  updateInspector();
});
document.getElementById('scale').addEventListener('input', event => {
  state.scale = finite(event.target.value, 1);
  syncUI();
});
document.getElementById('ox').addEventListener('input', event => {
  state.ox = finite(event.target.value);
  syncUI();
});
document.getElementById('oy').addEventListener('input', event => {
  state.oy = finite(event.target.value);
  syncUI();
});

for (const checkbox of document.querySelectorAll('[data-debug]')) {
  checkbox.addEventListener('change', event => {
    state.debug[event.target.dataset.debug] = event.target.checked;
  });
}

function syncUI() {
  document.getElementById('scale').value = state.scale;
  document.getElementById('ox').value = state.ox;
  document.getElementById('oy').value = state.oy;
  document.getElementById('scaleValue').textContent = state.scale.toFixed(2);
  document.getElementById('oxValue').textContent = Math.round(state.ox);
  document.getElementById('oyValue').textContent = Math.round(state.oy);
}

syncUI();
loadManifest();
requestAnimationFrame(render);
