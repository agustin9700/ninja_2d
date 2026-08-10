const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const readJson = relative => JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'));
const manifest = readJson('prototype/assets/asset_manifest.json');
const timelines = [
  readJson('prototype/assets/idle_animation.json'),
  readJson('prototype/assets/crouch_animation.json'),
  readJson('prototype/assets/run_animation.json'),
  readJson('prototype/assets/jump_animation.json'),
  readJson('prototype/assets/attack_animation.json'),
  readJson('prototype/assets/hit_animation.json'),
  readJson('prototype/assets/death_animation.json')
];
const parts = new Map(manifest.parts.map(part => [part.partName, part]));
const aliases = manifest.partAliases || {};
const equipmentBindings = Array.isArray(manifest.equipmentBindings) ? manifest.equipmentBindings : [];
const suppressedLinkages = new Set(manifest.suppressedLinkages || []);
const resolvePartName = linkageName => aliases[linkageName] || linkageName;
const alignmentExcluded = new Set([
  ...equipmentBindings.map(binding => binding.partName),
  ...Object.values(aliases)
]);
const identity = () => ({ a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0 });
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;

function matrix(value) {
  if (!value) return identity();
  return { a: number(value.a, 1), b: number(value.b), c: number(value.c), d: number(value.d, 1), tx: number(value.tx), ty: number(value.ty) };
}

function multiply(parent, child) {
  return {
    a: parent.a * child.a + parent.c * child.b,
    b: parent.b * child.a + parent.d * child.b,
    c: parent.a * child.c + parent.c * child.d,
    d: parent.b * child.c + parent.d * child.d,
    tx: parent.a * child.tx + parent.c * child.ty + parent.tx,
    ty: parent.b * child.tx + parent.d * child.ty + parent.ty
  };
}

function point(transform, x, y) {
  return { x: transform.a * x + transform.c * y + transform.tx, y: transform.b * x + transform.d * y + transform.ty };
}

function sourceBounds(part) {
  if (part.boundsBeforeScale) return part.boundsBeforeScale;
  const scale = number(part.rasterPixelsPerSourceUnit ?? part.scaleFactor ?? manifest.raster?.scaleFactor, 1);
  const registration = part.registrationPx || part.pivot;
  return { left: -registration.x / scale, top: -registration.y / scale, right: (part.exportWidth - registration.x) / scale, bottom: (part.exportHeight - registration.y) / scale };
}

function activeFrame(layer, frameNumber) {
  return (layer.frames || []).filter(frame => frameNumber >= number(frame.index) && frameNumber < number(frame.index) + Math.max(1, number(frame.duration, 1))).at(-1) || null;
}

function commands(timeline, frameNumber, prefix = identity()) {
  const result = [];
  for (const layer of timeline.layers || []) {
    if (layer.visible === false || layer.layerType === 'folder') continue;
    const frame = activeFrame(layer, frameNumber);
    if (!frame) continue;
    for (const element of frame.elements || []) {
      const partName = resolvePartName(element.linkageName);
      if (element.visible === false || suppressedLinkages.has(element.linkageName) || !partName || !parts.has(partName)) continue;
      result.push({ partName, part: parts.get(partName), matrix: multiply(prefix, matrix(element.matrix)) });
    }
  }
  return result;
}

function withEquipment(list, timeline, frameNumber) {
  const result = [...list];
  for (const binding of equipmentBindings) {
    if (binding.useTimelineInstanceWhenAvailable && result.some(command => command.partName === binding.partName)) continue;
    const anchorIndex = result.findIndex(command => command.partName === resolvePartName(binding.anchorPart));
    if (anchorIndex < 0 || !parts.has(binding.partName)) continue;
    const anchor = result[anchorIndex];
    const command = {
      partName: binding.partName,
      part: parts.get(binding.partName),
      matrix: multiply(anchor.matrix, matrix(binding.localMatrix)),
      syntheticId: `${timeline.id}/equipment:${binding.partName}/frame:${frameNumber}`
    };
    if (binding.drawOrder === 'behind_character') result.unshift(command);
    else if (binding.drawOrder === 'after_anchor') result.splice(anchorIndex + 1, 0, command);
    else result.splice(anchorIndex, 0, command);
  }
  return result;
}

function commandBounds(command) {
  const source = sourceBounds(command.part);
  const points = [
    point(command.matrix, source.left, source.top),
    point(command.matrix, source.right, source.top),
    point(command.matrix, source.right, source.bottom),
    point(command.matrix, source.left, source.bottom)
  ];
  return {
    left: Math.min(...points.map(value => value.x)), top: Math.min(...points.map(value => value.y)),
    right: Math.max(...points.map(value => value.x)), bottom: Math.max(...points.map(value => value.y))
  };
}

function bounds(list) {
  assert.ok(list.length > 0, 'timeline has no renderable commands');
  const values = list.map(commandBounds);
  return {
    left: Math.min(...values.map(value => value.left)), top: Math.min(...values.map(value => value.top)),
    right: Math.max(...values.map(value => value.right)), bottom: Math.max(...values.map(value => value.bottom))
  };
}

function frameCount(timeline) {
  const computed = Math.max(1, ...timeline.layers.flatMap(layer => layer.frames || []).map(frame => number(frame.index) + Math.max(1, number(frame.duration, 1))));
  assert.equal(number(timeline.frameCount), computed, `${timeline.id}: declared duration differs from keyframes`);
  return computed;
}

for (const name of ['weapon', 'back_item', 'hair']) {
  assert.ok(parts.has(name), `missing integrated part: ${name}`);
  assert.ok(fs.existsSync(path.join(root, 'prototype/assets', parts.get(name).png)), `missing PNG for ${name}`);
}
assert.equal(resolvePartName('head'), 'face', 'head alias must resolve to face');
for (const binding of equipmentBindings) {
  assert.ok(parts.has(binding.partName), `binding part missing: ${binding.partName}`);
  assert.ok(binding.anchorPart, `binding anchor missing: ${binding.partName}`);
  assert.ok(binding.localMatrix, `binding matrix missing: ${binding.partName}`);
}

const baseTimeline = manifest.timeline;
const baseBounds = bounds(commands(baseTimeline, 0).filter(command => !alignmentExcluded.has(command.partName)));
const baseAnchor = { x: (baseBounds.left + baseBounds.right) / 2, y: baseBounds.bottom };
const prepared = timelines.map(timeline => {
  const totalFrames = frameCount(timeline);
  const rootMatrix = matrix(timeline.rootMatrix);
  const firstBounds = bounds(commands(timeline, 0, rootMatrix).filter(command => !alignmentExcluded.has(command.partName)));
  const firstAnchor = { x: (firstBounds.left + firstBounds.right) / 2, y: firstBounds.bottom };
  const alignment = { ...identity(), tx: baseAnchor.x - firstAnchor.x, ty: baseAnchor.y - firstAnchor.y };
  return { timeline, totalFrames, alignment, runtimeMatrix: multiply(alignment, rootMatrix) };
});

const playbackCommands = withEquipment(commands(baseTimeline, 0), baseTimeline, 0);
for (const item of prepared) {
  const directions = item.timeline.id === 'run' ? [1, -1] : [1];
  for (let frame = 0; frame < item.totalFrames; frame++) {
    for (const direction of directions) {
      const facing = direction === -1 ? { a: -1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } : identity();
      playbackCommands.push(...withEquipment(commands(item.timeline, frame, multiply(facing, item.runtimeMatrix)), item.timeline, frame));
    }
  }
}
const cameraBounds = bounds(playbackCommands);
const scale = Math.min(4, (1000 - 220) / (cameraBounds.right - cameraBounds.left), (700 - 100) / (cameraBounds.bottom - cameraBounds.top));
const origin = {
  x: 500 - ((cameraBounds.left + cameraBounds.right) / 2) * scale,
  y: 350 - ((cameraBounds.top + cameraBounds.bottom) / 2) * scale
};

for (const item of prepared) {
  const { timeline, totalFrames, alignment, runtimeMatrix } = item;
  const directions = timeline.id === 'run' ? [1, -1] : [1];
  let minimumCommands = Infinity;

  for (let frame = 0; frame < totalFrames; frame++) {
    for (const direction of directions) {
      const facing = direction === -1 ? { a: -1, b: 0, c: 0, d: 1, tx: 0, ty: 0 } : identity();
      const list = withEquipment(commands(timeline, frame, multiply(facing, runtimeMatrix)), timeline, frame);
      minimumCommands = Math.min(minimumCommands, list.length);
      const value = bounds(list);
      const screen = {
        left: origin.x + value.left * scale, top: origin.y + value.top * scale,
        right: origin.x + value.right * scale, bottom: origin.y + value.bottom * scale
      };
      assert.ok(screen.left >= 0 && screen.top >= 0 && screen.right <= 1000 && screen.bottom <= 700,
        `${timeline.id}: frame ${frame}, direction ${direction} is outside the canvas: ${JSON.stringify(screen)}`);
    }
  }

  assert.ok(minimumCommands >= 17, `${timeline.id}: expected at least 17 renderable character/equipment parts, got ${minimumCommands}`);
  const missing = (timeline.dependencies || []).filter(name => !suppressedLinkages.has(name) && !parts.has(resolvePartName(name)));
  console.log(`${timeline.id}: PASS — ${totalFrames} frames, ${minimumCommands}+ parts, alignment=(${alignment.tx.toFixed(2)}, ${alignment.ty.toFixed(2)}), missing=[${missing.join(', ')}]`);
}
