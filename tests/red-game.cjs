/* Deterministic game simulations and collision fixtures; no browser or external service. */
const assert = require('node:assert/strict');
const { createGame, YOYO_TYPES, yoyoBody, playerContact } = require('../js/red-game-model.js');

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
function hitFixture(game, localX = .54, localY = .52, angle = 0) {
  const player = game.state.player;
  const yoyo = { id: -1, type: 'blue', x: 0, y: 0, size: 80, vx: 0, vy: 0, angle, spin: 0, age: 3, large: false, direction: 'top' };
  const body = yoyoBody(yoyo);
  yoyo.x += player.x + (localX - .5) * player.width - body.x;
  yoyo.y += player.top + localY * player.height - body.y;
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

run('head, torso, sleeves and legs collide at their visible source-image positions', () => {
  for (const [part, x, y] of [['head', .66, .20], ['torso', .64, .47], ['sleeve', .32, .50], ['leg', .43, .88]]) {
    for (const angle of [-.6, 0, .6]) {
      const game = createGame({ config: { firstSpawnDelay: 60 } }); game.start();
      hitFixture(game, x, y, angle); game.step(1 / 60);
      assert.equal(game.state.lives, 2, `${part}: rotated rubber ball overlaps visible body`);
      assert.ok(game.state.impact && game.state.hitFeedback > 0);
    }
  }
});

run('transparent corners/gaps and the trailing string do not count as a body hit', () => {
  const game = createGame({ config: { firstSpawnDelay: 60 } }); game.start();
  const player = game.state.player;
  for (const [x, y] of [[.10, .08], [.04, .90], [.98, .90]]) {
    // A small probe isolates genuine transparent spaces from nearby opaque limbs.
    assert.equal(playerContact(player, { x: player.x + (x - .5) * player.width,
      y: player.top + y * player.height, radius: 2 }), null);
  }
  const transparent = hitFixture(game, .02, .03);
  game.step(1 / 60);
  assert.equal(game.state.lives, 3, 'a normal-size ball in the transparent upper-left image box is safe');
  assert.ok(game.state.yoyos.includes(transparent));
  game.state.yoyos.length = 0;
  const string = hitFixture(game, .44, 1.25);
  assert.ok(string.y - string.size / 2 < player.top + player.height, 'the full PNG box reaches the feet');
  game.step(1 / 60);
  assert.equal(game.state.lives, 3, 'only the string reaches the girl; rubber ball is below her');
  game.state.yoyos.length = 0;
  hitFixture(game); game.step(1 / 60);
  assert.equal(game.state.lives, 2, 'the rubber body itself still causes a hit');
});

run('invulnerability lasts 1.1 seconds and simultaneous overlaps cost exactly one heart', () => {
  const game = createGame({ config: { firstSpawnDelay: 60 } }); game.start();
  hitFixture(game); hitFixture(game); game.step(1 / 120);
  assert.equal(game.state.lives, 2);
  assert.equal(game.state.invulnerable, 1.1);
  advance(game, 1.09);
  assert.equal(game.state.lives, 2);
  advance(game, .02);
  assert.equal(game.state.lives, 1);
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
          assert.ok(body.y + body.radius < game.state.player.top, `${height}px ${initial.direction} must allow at least 1.5s to react`);
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


run('gentler defaults reduce incoming hazards without changing the 30-second three-heart challenge', () => {
  const tuned = createGame({ random: random(2027), config: { lives: 1000 } });
  const previous = createGame({
    random: random(2027),
    config: { lives: 1000, spawnIntervalStart: 1.18, spawnIntervalEnd: .64, speedMin: 112, speedMax: 160 }
  });
  assert.equal(tuned.config.duration, 30);
  assert.equal(tuned.config.speedMin, 100);
  assert.equal(tuned.config.speedMax, 140);
  assert.equal(tuned.config.lives, previous.config.lives);
  assert.equal(tuned.config.invulnerability, previous.config.invulnerability);
  assert.equal(tuned.config.largeProbability, previous.config.largeProbability);
  tuned.start(); previous.start();
  advance(tuned, 30); advance(previous, 30);
  assert.equal(tuned.state.status, 'won');
  assert.equal(previous.state.status, 'won');
  assert.ok(tuned.state.spawned < previous.state.spawned, 'fewer yoyos should appear in a normal round');
});


console.log(`${passed} red-game model scenarios passed.`);
