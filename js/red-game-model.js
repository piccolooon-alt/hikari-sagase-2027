/* Pure, device-only demo rules. This module never reads storage or contacts a service. */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HikariRedModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const YOYO_TYPES = Object.freeze(['red', 'blue', 'yellow', 'green', 'purple', 'pink']);
  // Rubber-ball circles measured within the supplied 600px PNGs; strings are not hit targets.
  const YOYO_BODIES = Object.freeze({
    blue: Object.freeze({ cx: .473, cy: .625, r: .28 }),
    green: Object.freeze({ cx: .458, cy: .632, r: .28 }),
    pink: Object.freeze({ cx: .477, cy: .628, r: .29 }),
    purple: Object.freeze({ cx: .458, cy: .637, r: .28 }),
    red: Object.freeze({ cx: .442, cy: .615, r: .28 }),
    yellow: Object.freeze({ cx: .468, cy: .633, r: .275 })
  });
  const DEFAULT_CONFIG = Object.freeze({
    duration: 30, lives: 3, height: 480,
    playerWidth: 100, playerRadius: 16, playerSpeed: 520,
    invulnerability: 1.1, hitFeedbackDuration: .24,
    firstSpawnDelay: .7, spawnIntervalStart: 1.18, spawnIntervalEnd: .64,
    largeProbability: .18, maxObjects: 14,
    speedMin: 112, speedMax: 160, largeSpeedFactor: .75,
    normalSizeMin: 76, normalSizeMax: 86, largeSizeMin: 116, largeSizeMax: 126,
    minimumLeadTime: 1.6
  });
  const WIDTH = 360;
  const DIRECTIONS = ['top', 'diagonal-left', 'left', 'right', 'diagonal-right'];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function yoyoBody(yoyo) {
    const shape = YOYO_BODIES[yoyo.type] || YOYO_BODIES.red;
    const dx = (shape.cx - .5) * yoyo.size, dy = (shape.cy - .5) * yoyo.size;
    const angle = yoyo.angle || 0, cos = Math.cos(angle), sin = Math.sin(angle);
    return { x: yoyo.x + dx * cos - dy * sin, y: yoyo.y + dx * sin + dy * cos, radius: shape.r * yoyo.size };
  }
  function playerBody(player) {
    return { x: player.x + player.width * .04, y: player.y, radius: player.radius };
  }
  function validate(config) {
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (!Number.isFinite(config[key]) || config[key] < 0) throw new RangeError(`Invalid red-game config: ${key}`);
    }
    for (const key of ['duration', 'playerWidth', 'playerRadius', 'playerSpeed', 'spawnIntervalStart', 'spawnIntervalEnd', 'speedMin', 'speedMax', 'normalSizeMin', 'normalSizeMax', 'largeSizeMin', 'largeSizeMax', 'largeSpeedFactor']) {
      if (config[key] === 0) throw new RangeError(`Red-game config must be positive: ${key}`);
    }
    if (!Number.isInteger(config.lives) || config.lives < 1 || !Number.isInteger(config.maxObjects) || config.maxObjects < 1) throw new RangeError('Lives and object cap must be positive integers');
    if (config.height < 240 || config.playerWidth > WIDTH / 2 || config.largeProbability > 1 || config.largeSpeedFactor > 1) throw new RangeError('Red-game config exceeds the supported playfield');
    if (config.speedMin > config.speedMax || config.normalSizeMin > config.normalSizeMax || config.largeSizeMin > config.largeSizeMax) throw new RangeError('Red-game min/max config is reversed');
  }

  function createGame({ config: overrides = {}, random = Math.random } = {}) {
    const config = Object.freeze(Object.assign({}, DEFAULT_CONFIG, overrides));
    validate(config);
    if (typeof random !== 'function') throw new TypeError('random must be a function');
    const rand = () => { const value = random(); return Number.isFinite(value) ? clamp(value, 0, 1 - Number.EPSILON) : .5; };
    const range = (min, max) => min + (max - min) * rand();
    const state = {
      status: 'ready', width: WIDTH, height: config.height,
      elapsed: 0, remaining: config.duration, lives: config.lives,
      invulnerable: 0, hitFeedback: 0, spawned: 0, yoyos: [],
      player: { x: WIDTH / 2, width: config.playerWidth, height: config.playerWidth * 4 / 3, radius: config.playerRadius, bottom: 0, y: 0 }
    };
    let targetX = WIDTH / 2, spawnIn = config.firstSpawnDelay, nextId = 0;
    let typeBag = [], directionBag = [], lastType = null, lastDirection = null;

    function playerGeometry() {
      state.player.bottom = state.height * .04;
      state.player.y = state.height - state.player.bottom - state.player.height * .48;
    }
    playerGeometry();
    function limits() { return { min: state.player.width / 2, max: WIDTH - state.player.width / 2 }; }
    function shuffled(values, previous) {
      const bag = values.slice();
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1)); [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      // Bags are consumed from the end; avoid a repeat at the boundary too.
      if (bag[bag.length - 1] === previous) [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
      return bag;
    }
    function nextType() {
      if (!typeBag.length) typeBag = shuffled(YOYO_TYPES, lastType);
      lastType = typeBag.pop(); return lastType;
    }
    function nextDirection() {
      if (!directionBag.length) directionBag = shuffled(DIRECTIONS, lastDirection);
      lastDirection = directionBag.pop(); return lastDirection;
    }
    function spawn() {
      if (state.yoyos.length >= config.maxObjects) return;
      const type = nextType(), direction = nextDirection(), large = rand() < config.largeProbability;
      const size = large ? range(config.largeSizeMin, config.largeSizeMax) : range(config.normalSizeMin, config.normalSizeMax);
      const speed = range(config.speedMin, config.speedMax) * (large ? config.largeSpeedFactor : 1);
      let x, y, aimX;
      if (direction === 'left' || direction === 'right') {
        x = direction === 'left' ? -size * .55 : WIDTH + size * .55;
        const top = state.height * .08;
        y = range(top, Math.max(top, Math.min(state.height * .30, state.player.y - 150)));
        aimX = direction === 'left' ? range(130, 280) : range(80, 230);
      } else {
        y = -size * .55;
        if (direction === 'diagonal-left') { x = range(235, 310); aimX = range(60, 170); }
        else if (direction === 'diagonal-right') { x = range(50, 125); aimX = range(190, 300); }
        else { x = range(60, 300); aimX = clamp(x + range(-45, 45), 55, 305); }
      }
      const dx = aimX - x, dy = state.player.y - y, distance = Math.hypot(dx, dy);
      let vx = dx / distance * speed, vy = dy / distance * speed;
      const shape = YOYO_BODIES[type];
      const maxBodyOffset = Math.hypot(shape.cx - .5, shape.cy - .5) * size;
      const collisionBand = state.player.y - state.player.radius - shape.r * size - maxBodyOffset;
      // This bound holds even at the nearest side of the player's horizontal lane.
      // Short arenas slow the entire trajectory rather than introducing surprise side hits.
      if (config.minimumLeadTime > 0 && vy > 0) {
        const scale = clamp((collisionBand - y) / (vy * config.minimumLeadTime), .01, 1);
        vx *= scale; vy *= scale;
      }
      state.yoyos.push({ id: nextId++, type, direction, large, x, y, size, vx, vy, angle: range(-.18, .18), spin: range(-.24, .24), age: 0 });
      state.spawned++;
    }
    function start() {
      state.status = 'playing'; state.elapsed = 0; state.remaining = config.duration;
      state.lives = config.lives; state.invulnerable = 0; state.hitFeedback = 0;
      state.spawned = 0; state.yoyos.length = 0; nextId = 0;
      typeBag = []; directionBag = []; lastType = null; lastDirection = null;
      targetX = state.player.x = WIDTH / 2; spawnIn = config.firstSpawnDelay;
      return state;
    }
    function pause() { if (state.status === 'playing') state.status = 'paused'; return state; }
    function resume() { if (state.status === 'paused') state.status = 'playing'; return state; }
    function setTargetX(x) {
      if (Number.isFinite(x)) { const bound = limits(); targetX = clamp(x, bound.min, bound.max); }
      return state;
    }
    function movePlayer(delta) { if (Number.isFinite(delta)) setTargetX(targetX + delta); return state; }
    function tick(dt) {
      state.elapsed = Math.min(config.duration, state.elapsed + dt);
      state.remaining = Math.max(0, config.duration - state.elapsed);
      state.invulnerable = Math.max(0, state.invulnerable - dt);
      state.hitFeedback = Math.max(0, state.hitFeedback - dt);
      const bound = limits(), maxMove = config.playerSpeed * dt;
      state.player.x = clamp(state.player.x + clamp(targetX - state.player.x, -maxMove, maxMove), bound.min, bound.max);
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        const progress = clamp(state.elapsed / config.duration, 0, 1);
        spawnIn += config.spawnIntervalStart + (config.spawnIntervalEnd - config.spawnIntervalStart) * progress;
      }
      const player = playerBody(state.player);
      for (let i = state.yoyos.length - 1; i >= 0; i--) {
        const yoyo = state.yoyos[i];
        yoyo.x += yoyo.vx * dt; yoyo.y += yoyo.vy * dt;
        yoyo.angle += yoyo.spin * dt; yoyo.age += dt;
        const body = yoyoBody(yoyo), dx = body.x - player.x, dy = body.y - player.y;
        if (state.invulnerable === 0 && dx * dx + dy * dy < (body.radius + player.radius) ** 2) {
          state.yoyos.splice(i, 1); state.lives--;
          state.invulnerable = config.invulnerability; state.hitFeedback = config.hitFeedbackDuration;
          if (state.lives <= 0) { state.status = 'lost'; return; }
          continue;
        }
        const margin = yoyo.size * .75;
        if (yoyo.x < -margin || yoyo.x > WIDTH + margin || yoyo.y > state.height + margin || yoyo.y < -margin) state.yoyos.splice(i, 1);
      }
      if (state.remaining <= 1e-9) { state.elapsed = config.duration; state.remaining = 0; state.status = 'won'; }
    }
    function step(seconds) {
      if (state.status !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return state;
      // A stalled frame is at most 0.1s of active play, partitioned to prevent tunneling.
      // Hidden-tab/background time belongs to pause(), never to the game timer.
      let remaining = Math.min(seconds, .1, state.remaining);
      while (remaining > 1e-10 && state.status === 'playing') {
        const dt = Math.min(remaining, 1 / 120); tick(dt); remaining -= dt;
      }
      return state;
    }
    function resize(height) {
      if (!Number.isFinite(height) || height <= 0) return state;
      const next = clamp(height, 240, 1200), ratio = next / state.height;
      if (Math.abs(next - state.height) < .01) return state;
      pause(); state.height = next; playerGeometry();
      for (const yoyo of state.yoyos) { yoyo.y *= ratio; yoyo.vy *= ratio; }
      // Resume gets the same grace as a hit so orientation changes cannot cause an instant collision.
      state.invulnerable = Math.max(state.invulnerable, config.invulnerability);
      return state;
    }
    return { state, config, start, step, pause, resume, setTargetX, movePlayer, resize };
  }
  return Object.freeze({ DEFAULT_CONFIG, YOYO_TYPES, YOYO_BODIES, createGame, yoyoBody, playerBody });
});
