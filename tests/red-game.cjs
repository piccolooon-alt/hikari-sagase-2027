/* Deterministic game simulations and collision fixtures; no browser or external service. */
const assert = require('node:assert/strict');
const { createGame, YOYO_TYPES, yoyoBody, playerBody } = require('../js/red-game-model.js');

let passed = 0;
function run(name, check) { check(); passed++; console.log(`PASS ${name}`); }
function random(seed) {
  let value = seed >>> 0;
  return () => { value = (Math.imul(value, 1664525) + 1013904223) >>> 0; return value / 4294967296; };
}
function advance(game, seconds) {
  let remaining = seconds;
  while (remaining > 1e-9 && game.state.status === 'playing') {
    const step = Math.min(.05, remaining); game.step(step); remaining -= step;
  }
}
function hitFixture(game, offsetX = 0, offsetY = 0) {
  const player = playerBody(game.state.player);
  const yoyo = { id: -1, type: 'blue', x: 0, y: 0, size: 80, vx: 0, vy: 0, angle: 0, spin: 0, age: 3, large: false, direction: 'top' };
  const body = yoyoBody(yoyo);
  yoyo.x += player.x - body.x + offsetX;
  yoyo.y += player.y - body.y + offsetY;
  game.state.yoyos.push(yoyo);
  return yoyo;
}

run('default round finishes at 30 seconds; duration and lives are configurable', () => {
  const game = createGame({ config: { firstSpawnDelay: 60 } });
  game.start();
  assert.equal(game.state.lives, 3);
  advance(game, 29.9);
  assert.equal(game.state.status, 'playing');
  assert.ok(game.state.remaining > 0);
  advance(game, .1);
  assert.equal(game.state.status, 'won');
  assert.equal(game.state.remaining, 0);
  assert.equal(game.state.elapsed, 30);
  const shortRound = createGame({ config: { duration: 2, lives: 1, firstSpawnDelay: 5 } });
  shortRound.start(); advance(shortRound, 2);
  assert.equal(shortRound.state.status, 'won');
  assert.equal(shortRound.state.lives, 1);
});

run('three body hits cause loss; hit grace prevents a damage cascade; retry resets the round', () => {
  const game = createGame({ config: { firstSpawnDelay: 60 } });
  game.start(); hitFixture(game); game.step(1 / 60);
  assert.equal(game.state.lives, 2);
  assert.ok(game.state.invulnerable > 0);
  hitFixture(game); game.step(.1);
  assert.equal(game.state.lives, 2, 'overlapping hazards cannot immediately take another life');
  game.state.yoyos.length = 0;
  advance(game, 1.2); hitFixture(game); game.step(1 / 60);
  assert.equal(game.state.lives, 1);
  game.state.yoyos.length = 0;
  advance(game, 1.2); hitFixture(game); game.step(1 / 60);
  assert.equal(game.state.status, 'lost');
  assert.equal(game.state.lives, 0);
  const elapsed = game.state.elapsed;
  game.step(.1); assert.equal(game.state.elapsed, elapsed, 'the result screen has no running timer');
  game.start();
  assert.equal(game.state.status, 'playing');
  assert.equal(game.state.remaining, 30);
  assert.equal(game.state.lives, 3);
  assert.equal(game.state.yoyos.length, 0);
  assert.equal(game.state.player.x, 180);
});

run('collision excludes the string/transparent area and forgiving edges', () => {
  const game = createGame({ config: { firstSpawnDelay: 60 } }); game.start();
  const string = hitFixture(game, 0, 45);
  const player = playerBody(game.state.player);
  assert.ok(string.y - string.size / 2 < player.y && string.y + string.size / 2 > player.y, 'the full square overlaps the player');
  game.step(1 / 60);
  assert.equal(game.state.lives, 3, 'the string part of the square is not a hit target');
  game.state.yoyos.length = 0;
  hitFixture(game, 49, 0); game.step(1 / 60);
  assert.equal(game.state.lives, 3, 'loose image-edge overlap does not count as a body hit');
  game.state.yoyos.length = 0;
  hitFixture(game); game.step(1 / 60);
  assert.equal(game.state.lives, 2, 'the rubber body itself still causes a hit');
});

run('all six sprites cycle without adjacent repeats; directions vary; large yoyos are uncommon and slower', () => {
  const game = createGame({ random: random(0x5a6a2027), config: { duration: 5000, lives: 10000 } });
  game.start();
  const records = [], seen = new Set();
  while (records.length < 1200 && game.state.status === 'playing') {
    game.step(.1);
    for (const yoyo of game.state.yoyos) if (!seen.has(yoyo.id)) {
      seen.add(yoyo.id); records.push({ ...yoyo });
    }
  }
  assert.equal(records.length, 1200);
  assert.deepEqual(new Set(records.map(yoyo => yoyo.type)), new Set(YOYO_TYPES));
  for (let i = 1; i < records.length; i++) assert.notEqual(records[i].type, records[i - 1].type, 'no adjacent repeat, including bag boundaries');
  for (let i = 0; i + 6 <= records.length; i += 6) assert.equal(new Set(records.slice(i, i + 6).map(yoyo => yoyo.type)).size, 6);
  assert.deepEqual(new Set(records.map(yoyo => yoyo.direction)), new Set(['top', 'left', 'right', 'diagonal-left', 'diagonal-right']));
  const large = records.filter(yoyo => yoyo.large), normal = records.filter(yoyo => !yoyo.large);
  const proportion = large.length / records.length;
  assert.ok(proportion >= .15 && proportion <= .20, `large-yoyo sample proportion ${proportion}`);
  const meanSpeed = objects => objects.reduce((sum, yoyo) => sum + Math.hypot(yoyo.vx, yoyo.vy), 0) / objects.length;
  assert.ok(meanSpeed(large) < meanSpeed(normal), 'larger hazards give more time to react');
  assert.ok(Math.min(...large.map(yoyo => yoyo.size)) > Math.max(...normal.map(yoyo => yoyo.size)));
  console.log(`  sampled ${records.length} spawns; ${large.length} large (${(proportion * 100).toFixed(1)}%)`);
});

run('every direction provides visible approach time before reaching the collision band, even in a short arena', () => {
  for (const height of [240, 480, 900]) {
    const game = createGame({ random: random(height + 2027), config: { height, duration: 100, lives: 1000 } }); game.start();
    const seen = new Set();
    while (seen.size < 40 && game.state.status === 'playing') {
      game.step(.1);
      for (const yoyo of game.state.yoyos) if (!seen.has(yoyo.id)) {
        seen.add(yoyo.id);
        const initial = { ...yoyo, x: yoyo.x - yoyo.vx * yoyo.age, y: yoyo.y - yoyo.vy * yoyo.age, angle: yoyo.angle - yoyo.spin * yoyo.age };
        assert.ok(initial.y <= height * .3 + 1e-7, 'no hazard appears in the lower player band');
        assert.ok(initial.vy > 0, 'no surprise hazard rises from below');
        for (let time = 0; time <= 1.5; time += .05) {
          const body = yoyoBody({ ...initial, x: initial.x + initial.vx * time, y: initial.y + initial.vy * time, angle: initial.angle + initial.spin * time });
          assert.ok(body.y + body.radius < game.state.player.y - game.state.player.radius, `${height}px ${initial.direction} must allow at least 1.5s to react`);
        }
      }
    }
    assert.equal(seen.size, 40);
  }
});

run('spawn frequency rises later in the round', () => {
  const game = createGame({ random: random(77), config: { lives: 100 } }); game.start();
  const spawnedAt = [], seen = new Set();
  while (game.state.status === 'playing') {
    game.step(.05);
    for (const yoyo of game.state.yoyos) if (!seen.has(yoyo.id)) { seen.add(yoyo.id); spawnedAt.push(game.state.elapsed - yoyo.age); }
  }
  assert.equal(game.state.status, 'won');
  assert.ok(spawnedAt.filter(time => time >= 20).length > spawnedAt.filter(time => time < 10).length);
});

run('pause freezes time and hazards; resize pauses safely; the player stays inside the arena', () => {
  const game = createGame({ random: random(3) }); game.start(); advance(game, 1.5);
  game.pause(); const before = JSON.stringify(game.state);
  game.step(.1); assert.equal(JSON.stringify(game.state), before);
  game.resume(); game.setTargetX(-10000); advance(game, .5);
  assert.ok(game.state.player.x - game.state.player.width / 2 >= 0);
  game.setTargetX(10000); advance(game, 1);
  assert.ok(game.state.player.x + game.state.player.width / 2 <= 360);
  const remaining = game.state.remaining;
  game.resize(700);
  assert.equal(game.state.status, 'paused');
  assert.equal(game.state.remaining, remaining);
  assert.ok(game.state.invulnerable > 0, 'orientation changes grant reaction time before resuming');
});

run('active hazards are capped and offscreen objects are removed', () => {
  const game = createGame({ random: random(11), config: { duration: 100, lives: 1000, spawnIntervalStart: .01, spawnIntervalEnd: .01 } }); game.start();
  let maximum = 0;
  for (let i = 0; i < 300; i++) { game.step(.05); maximum = Math.max(maximum, game.state.yoyos.length); assert.ok(game.state.yoyos.length <= game.config.maxObjects); }
  assert.equal(maximum, game.config.maxObjects, 'the stress simulation reaches the configured cap');
  const object = game.state.yoyos[0]; assert.ok(object);
  object.y = game.state.height + 1000;
  game.step(1 / 60);
  assert.ok(!game.state.yoyos.some(yoyo => yoyo.id === object.id), 'departed hazards do not accumulate');
});

console.log(`${passed} red-game model scenarios passed.`);
