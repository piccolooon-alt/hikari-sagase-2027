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
    blue: Object.freeze({ cx: .473, cy: .625, r: .33 }),
    green: Object.freeze({ cx: .458, cy: .632, r: .319 }),
    pink: Object.freeze({ cx: .477, cy: .628, r: .323 }),
    purple: Object.freeze({ cx: .458, cy: .637, r: .319 }),
    red: Object.freeze({ cx: .442, cy: .615, r: .328 }),
    yellow: Object.freeze({ cx: .468, cy: .633, r: .317 })
  });
  // Opaque runs from approved_yukata_character.png alpha (BOX resize to 72 × 96, keep >= 224).
  // Each row contains [left, right) pairs: hair, head, sleeves, torso and legs,
  // preserving the transparent gaps between them. The approved PNG is unchanged.
  const PLAYER_MASK_WIDTH = 72, PLAYER_MASK_HEIGHT = 96;
  const PLAYER_MASK = Object.freeze([
    [], [], [41,43,44,45], [36,47], [35,48,51,52], [34,53], [34,55], [33,57],
    [33,58], [33,58], [31,32,33,59], [32,61], [32,60], [32,60], [32,61], [32,61],
    [30,62], [30,31,34,60], [34,60], [33,60], [31,32,33,34,35,61], [26,27,36,62], [26,27,37,59,61,64], [26,27,31,32,37,58,62,64],
    [36,37,38,57,60,61,64,65], [39,57,60,61,65,66], [29,30,34,35,41,56,60,61,65,66], [28,29,34,35,43,55,65,66], [42,53], [42,51,64,65], [31,32,39,53,62,63], [30,35,38,54],
    [30,36,37,55], [25,28,30,55], [24,56,64,65], [20,21,24,56,64,67], [17,19,21,59,63,67], [19,59,63,67], [19,59,63,67], [15,66],
    [19,64], [18,19,23,64], [22,65], [22,65], [21,65], [21,65], [14,65], [11,65],
    [10,65], [9,51,52,65], [7,51,54,65], [6,52,54,65], [6,53,55,66], [5,10,13,23,25,54,56,66], [5,7,17,20,27,55,57,66], [27,55,57,67],
    [27,67], [29,67], [32,50,54,67], [32,49,55,67], [24,28,33,50,56,67], [23,29,30,51,57,67], [22,52,59,66], [22,54,61,66],
    [22,55,63,65], [21,56,63,65], [20,28,30,57], [20,27,30,58], [20,26,29,58], [20,26,29,59], [20,25,29,60], [22,24,30,60],
    [30,61], [33,61], [34,61], [34,62], [34,61], [33,60], [33,38,41,58], [32,37,42,56],
    [32,36,42,55], [31,35,42,55], [30,34,42,49,52,54], [29,33,44,47], [28,33], [27,33], [27,34], [27,34],
    [27,35], [28,35], [29,35], [29,36], [29,36], [30,35], [32,34], [],
  ].map(row => Object.freeze(row)));
  const DEFAULT_CONFIG = Object.freeze({
    duration: 30, lives: 3, height: 480,
    playerWidth: 100, playerSpeed: 520,
    invulnerability: 1.1, hitFeedbackDuration: .24,
    firstSpawnDelay: .7, spawnIntervalStart: 2.0, spawnIntervalEnd: 1.3,
    largeProbability: .18, maxObjects: 14,
    speedMin: 100, speedMax: 140, largeSpeedFactor: .75,
    normalSizeMin: 76, normalSizeMax: 86, largeSizeMin: 116, largeSizeMax: 126,
    minimumLeadTime: 1.6
  });
  const WIDTH = 360;
  const LIGHT_GOAL = 3;
  // Day 2: replace some regular hazards with glowing catchable balloons; never add extra hazards.
  const GLOW_SPAWNS = new Set([0, 2, 4, 6, 8, 11, 14, 16]);
  const DIRECTIONS = ['top', 'diagonal-left', 'left', 'right', 'diagonal-right'];
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

  function yoyoBody(yoyo) {
    const shape = YOYO_BODIES[yoyo.type] || YOYO_BODIES.red;
    const dx = (shape.cx - .5) * yoyo.size, dy = (shape.cy - .5) * yoyo.size;
    const angle = yoyo.angle || 0, cos = Math.cos(angle), sin = Math.sin(angle);
    return { x: yoyo.x + dx * cos - dy * sin, y: yoyo.y + dx * sin + dy * cos, radius: shape.r * yoyo.size };
  }
  function playerContact(player, ball) {
    const left = player.x - player.width / 2, top = player.top;
    if (ball.x + ball.radius < left || ball.x - ball.radius > left + player.width ||
        ball.y + ball.radius < top || ball.y - ball.radius > top + player.height) return null;
    const cellWidth = player.width / PLAYER_MASK_WIDTH, cellHeight = player.height / PLAYER_MASK_HEIGHT;
    const firstRow = Math.max(0, Math.floor((ball.y - ball.radius - top) / cellHeight));
    const lastRow = Math.min(PLAYER_MASK_HEIGHT - 1, Math.floor((ball.y + ball.radius - top) / cellHeight));
    let contact = null, nearest = Infinity;
    for (let row = firstRow; row <= lastRow; row++) {
      const spans = PLAYER_MASK[row];
      const y = clamp(ball.y, top + row * cellHeight, top + (row + 1) * cellHeight);
      for (let i = 0; i < spans.length; i += 2) {
        const x = clamp(ball.x, left + spans[i] * cellWidth, left + spans[i + 1] * cellWidth);
        const distance = (ball.x - x) ** 2 + (ball.y - y) ** 2;
        if (distance < ball.radius ** 2 && distance < nearest) { contact = { x, y }; nearest = distance; }
      }
    }
    return contact;
  }
  function validate(config) {
    for (const key of Object.keys(DEFAULT_CONFIG)) {
      if (!Number.isFinite(config[key]) || config[key] < 0) throw new RangeError(`Invalid red-game config: ${key}`);
    }
    for (const key of ['duration', 'playerWidth', 'playerSpeed', 'spawnIntervalStart', 'spawnIntervalEnd', 'speedMin', 'speedMax', 'normalSizeMin', 'normalSizeMax', 'largeSizeMin', 'largeSizeMax', 'largeSpeedFactor']) {
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
      day: 1, elapsed: 0, remaining: config.duration, lives: config.lives,
      collected: 0, collectFeedback: 0, lastCollected: null, lossReason: null, winReason: null,
      invulnerable: 0, hitFeedback: 0, impact: null, spawned: 0, yoyos: [],
      player: { x: WIDTH / 2, width: config.playerWidth, height: config.playerWidth * 4 / 3, bottom: 0, top: 0, y: 0 }
    };
    let targetX = WIDTH / 2, spawnIn = config.firstSpawnDelay, nextId = 0;
    let typeBag = [], directionBag = [], lastType = null, lastDirection = null;

    function playerGeometry() {
      state.player.bottom = state.height * .04;
      state.player.top = state.height - state.player.bottom - state.player.height;
      state.player.y = state.player.top + state.player.height * .52;
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
      const type = nextType();
      const glowing = state.day === 2 && GLOW_SPAWNS.has(state.spawned);
      const direction = glowing ? 'top' : nextDirection();
      const large = !glowing && rand() < config.largeProbability;
      const size = glowing ? 94 : large ? range(config.largeSizeMin, config.largeSizeMax) : range(config.normalSizeMin, config.normalSizeMax);
      const speed = glowing ? config.speedMin * .94 : range(config.speedMin, config.speedMax) * (large ? config.largeSpeedFactor : 1);
      let x, y, aimX;
      if (glowing) {
        // Easy-to-read vertical approach: no sudden sideways movement into the girl.
        x = range(100, 260); y = -size * .34; aimX = x;
      } else if (direction === 'left' || direction === 'right') {
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
      const collisionBand = state.player.top - shape.r * size - maxBodyOffset;
      // This bound holds even at the nearest side of the player's horizontal lane.
      // Short arenas slow the entire trajectory rather than introducing surprise side hits.
      if (config.minimumLeadTime > 0 && vy > 0) {
        const scale = clamp((collisionBand - y) / (vy * config.minimumLeadTime), .01, 1);
        vx *= scale; vy *= scale;
      }
      state.yoyos.push({ id: nextId++, type, direction, large, glowing, x, y, size, vx, vy, angle: range(-.18, .18), spin: range(-.24, .24), age: 0 });
      state.spawned++;
    }
    function reset() {
      state.status = 'ready'; state.elapsed = 0; state.remaining = config.duration;
      state.lives = config.lives; state.invulnerable = 0; state.hitFeedback = 0; state.impact = null;
      state.collected = 0; state.collectFeedback = 0; state.lastCollected = null;
      state.lossReason = null; state.winReason = null;
      state.spawned = 0; state.yoyos.length = 0; nextId = 0;
      typeBag = []; directionBag = []; lastType = null; lastDirection = null;
      targetX = state.player.x = WIDTH / 2; spawnIn = config.firstSpawnDelay;
      return state;
    }
    function start() { reset(); state.status = 'playing'; return state; }
    function setDay(day) {
      const chosen = day === 2 ? 2 : 1;
      if (state.day !== chosen) { state.day = chosen; reset(); }
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
      state.collectFeedback = Math.max(0, state.collectFeedback - dt);
      const bound = limits(), maxMove = config.playerSpeed * dt;
      state.player.x = clamp(state.player.x + clamp(targetX - state.player.x, -maxMove, maxMove), bound.min, bound.max);
      spawnIn -= dt;
      if (spawnIn <= 0) {
        spawn();
        const progress = clamp(state.elapsed / config.duration, 0, 1);
        spawnIn += config.spawnIntervalStart + (config.spawnIntervalEnd - config.spawnIntervalStart) * progress;
      }
      for (let i = state.yoyos.length - 1; i >= 0; i--) {
        const yoyo = state.yoyos[i];
        yoyo.x += yoyo.vx * dt; yoyo.y += yoyo.vy * dt;
        yoyo.angle += yoyo.spin * dt; yoyo.age += dt;
        const ball = yoyoBody(yoyo);
        const contact = (yoyo.glowing || state.invulnerable === 0) ?
          playerContact(state.player, yoyo.glowing ? { ...ball, radius: ball.radius * 1.18 } : ball) : null;
        if (contact) {
          state.yoyos.splice(i, 1);
          if (yoyo.glowing) {
            state.collected++;
            state.lastCollected = { x: ball.x, y: ball.y };
            state.collectFeedback = .65;
            if (state.collected >= LIGHT_GOAL) {
              state.status = 'won'; state.winReason = 'light'; return;
            }
          } else {
            state.lives--;
            state.invulnerable = config.invulnerability;
            state.hitFeedback = config.hitFeedbackDuration; state.impact = contact;
            if (state.lives <= 0) { state.status = 'lost'; state.lossReason = 'lives'; return; }
          }
          continue;
        }
        const margin = yoyo.size * .75;
        if (yoyo.x < -margin || yoyo.x > WIDTH + margin || yoyo.y > state.height + margin || yoyo.y < -margin) state.yoyos.splice(i, 1);
      }
      if (state.remaining <= 1e-9) {
        state.elapsed = config.duration; state.remaining = 0;
        state.status = state.day === 1 ? 'won' : 'lost';
        if (state.day === 1) state.winReason = 'survived';
        else state.lossReason = 'time';
      }
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
    return { state, config, start, setDay, step, pause, resume, setTargetX, movePlayer, resize };
  }
  return Object.freeze({ DEFAULT_CONFIG, LIGHT_GOAL, YOYO_TYPES, YOYO_BODIES, createGame, yoyoBody, playerContact });
});
