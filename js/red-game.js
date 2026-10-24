/* Canvas presentation and touch controls for the device-only red game demo. */
(() => {
  'use strict';
  const root = document.getElementById('red-preview');
  if (!root || !window.HikariRedModel) return;
  const $ = id => root.querySelector(`#${id}`);
  const arena = $('red-arena');
  const canvas = $('red-canvas');
  const brush = canvas.getContext('2d', { alpha: true });
  const character = $('red-character');
  const hitEffect = document.createElement('div');
  hitEffect.id = 'red-hit-effect';
  hitEffect.hidden = true;
  hitEffect.setAttribute('aria-hidden', 'true');
  arena.append(hitEffect);
  const catchEffect = document.createElement('div');
  catchEffect.id = 'red-catch-effect';
  catchEffect.hidden = true;
  catchEffect.setAttribute('aria-hidden', 'true');
  const catchCore = document.createElement('span');
  catchCore.className = 'red-catch-core';
  catchCore.textContent = '✦';
  catchEffect.append(catchCore);
  for (let i = 0; i < 9; i++) {
    const piece = document.createElement('span');
    piece.className = 'red-catch-particle';
    piece.textContent = i === 3 ? '♥' : i % 3 === 0 ? '✧' : '✦';
    const angle = i / 9 * Math.PI * 2;
    piece.style.setProperty('--dx', `${(Math.cos(angle) * (34 + i % 3 * 8)).toFixed(1)}px`);
    piece.style.setProperty('--dy', `${(Math.sin(angle) * (34 + i % 3 * 8)).toFixed(1)}px`);
    piece.style.setProperty('--delay', `${(i % 3 * .04).toFixed(2)}s`);
    catchEffect.append(piece);
  }
  arena.append(catchEffect);
  catchEffect.addEventListener('animationend', event => {
    if (event.target === catchEffect) catchEffect.hidden = true;
  });
  const celebration = document.createElement('div');
  celebration.id = 'red-celebration';
  celebration.setAttribute('aria-hidden', 'true');
  celebration.hidden = true;
  celebration.innerHTML = '<span class="red-light-orb red-light-one"></span><span class="red-light-orb red-light-two"></span><span class="red-light-orb red-light-three"></span><span class="red-light-core"></span><span class="red-light-trail"></span>';
  // Small, capped set of CSS-only stars and tiny hearts for the four-second ending.
  // They are created only once, not every animation frame.
  for (let i = 0; i < 26; i++) {
    const sparkle = document.createElement('span');
    sparkle.className = 'red-celebration-particle' + (i % 9 === 0 ? ' red-celebration-heart' : '');
    sparkle.textContent = i % 9 === 0 ? '♥' : i % 4 === 0 ? '✧' : '✦';
    const angle = i * 2.3999632297;
    const spread = 42 + (i % 6) * 14;
    sparkle.style.setProperty('--sx', `${(Math.cos(angle) * spread).toFixed(1)}px`);
    sparkle.style.setProperty('--sy', `${(Math.sin(angle) * spread * .8).toFixed(1)}px`);
    sparkle.style.setProperty('--drift', `${((i % 2 ? -1 : 1) * (12 + i % 5 * 6)).toFixed(1)}px`);
    sparkle.style.setProperty('--lift', `${70 + i % 6 * 18}px`);
    sparkle.style.setProperty('--delay', `${(.22 + i % 9 * .18).toFixed(2)}s`);
    sparkle.style.setProperty('--size', `${10 + i % 4 * 3}px`);
    celebration.append(sparkle);
  }
  arena.append(celebration);
  const overlay = $('red-overlay');
  const startPanel = $('red-start-panel');
  const resultPanel = $('red-result-panel');
  const pausePanel = $('red-pause-panel');
  const startButton = $('red-start');
  const pauseButton = $('red-pause');
  const leftButton = $('red-left');
  const rightButton = $('red-right');
  const game = window.HikariRedModel.createGame();
  const sprites = new Map([...$('red-sprite-assets').querySelectorAll('img')].map(image => [image.dataset.yoyo, image]));
  const heldKeys = new Set();
  let entered = false, frameId = 0, lastFrame = 0;
  let assetsReady = false, loading = null;
  let previousStatus = '', previousLives = -1, previousTime = '', previousCollected = -1;
  let celebrating = false, celebrationTimer = 0;
  let bellContext = null;
  function gentleBell(frequency, seconds = .42) {
    // User gesture and the existing music ON/OFF control govern optional effects.
    if (game.state.day !== 2 || document.getElementById('bgm-toggle')?.getAttribute('aria-pressed') !== 'true') return;
    try {
      const AudioEngine = window.AudioContext || window.webkitAudioContext;
      if (!AudioEngine) return;
      if (!bellContext) bellContext = new AudioEngine();
      if (bellContext.state === 'suspended') bellContext.resume().catch(() => {});
      const now = bellContext.currentTime, note = bellContext.createOscillator(), envelope = bellContext.createGain();
      note.type = 'sine';
      note.frequency.setValueAtTime(frequency, now);
      envelope.gain.setValueAtTime(.0001, now);
      envelope.gain.exponentialRampToValueAtTime(.035, now + .025);
      envelope.gain.exponentialRampToValueAtTime(.0001, now + seconds);
      note.connect(envelope); envelope.connect(bellContext.destination);
      note.start(now); note.stop(now + seconds + .02);
    } catch (_) { /* Sound is optional: a blocked audio context never blocks gameplay. */ }
  }
  let pointer = null, pointerOffset = 0;
  let pauseReason = '';

  function stopFrame() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0; lastFrame = 0;
  }
  function releaseControls() {
    heldKeys.clear();
    if (pointer !== null) {
      try { if (arena.hasPointerCapture(pointer)) arena.releasePointerCapture(pointer); } catch (_) { /* Capture may have ended with a canceled gesture. */ }
    }
    pointer = null;
  }
  function showPanel(panel, visible) {
    panel.hidden = !visible;
    panel.setAttribute('aria-hidden', String(!visible));
  }
  function cancelCelebration() {
    if (celebrationTimer) clearTimeout(celebrationTimer);
    celebrationTimer = 0; celebrating = false;
    celebration.hidden = true;
    celebration.classList.remove('active');
  }
  function beginCelebration() {
    cancelCelebration();
    celebrating = true;
    celebration.hidden = false;
    void celebration.offsetWidth;
    celebration.classList.add('active');
    const duration = matchMedia('(prefers-reduced-motion: reduce)').matches ? 800 : 4000;
    celebrationTimer = setTimeout(() => {
      celebrationTimer = 0;
      celebrating = false;
      celebration.hidden = true;
      celebration.classList.remove('active');
      if (entered && game.state.status === 'won' && game.state.day === 2) {
        syncView();
        $('red-overlay-title').tabIndex = -1;
        $('red-overlay-title').focus({ preventScroll: true });
      }
    }, duration);
  }
  function configureDay() {
    const second = game.state.day === 2;
    root.dataset.gameDay = String(game.state.day);
    $('red-light-stat').hidden = !second;
    root.querySelector('.red-preview-title').textContent = second ? 'ひかるヨーヨーをつかまえろ！' : '水風船ヨーヨーよけ';
    startPanel.querySelector('h2').textContent = second ? 'ひかりを 3つ あつめよう！' : `${game.config.duration}びょう よけよう！`;
    if (second) startPanel.querySelector('p').textContent = 'ふつうのヨーヨーはよけて、キラキラ光るヨーヨーを3つキャッチ！';
    else startPanel.querySelector('p').innerHTML = '浴衣の子を、ゆびで左右に動かしてね。<br>ヨーヨーに当たらないように進もう！';
    $('red-start-rules').replaceChildren(second ?
      '3つ集めた瞬間にクリア！ 30秒・ライフ3つ。' :
      `ライフは${game.config.lives}つ。大きいヨーヨーも来るよ。`,
      document.createElement('br'), 'パソコンは左右の矢印キーでも遊べます。');
    $('red-rule-summary').textContent = second ?
      '2日目：ひかるヨーヨー3つでクリア！ 受付の提灯とはまだ連動しません。' :
      `${game.config.duration}秒・ライフ${game.config.lives}つのおためし。受付の提灯との連動はまだありません。`;
  }
  function syncView({ focus = false } = {}) {
    const state = game.state;
    const playing = state.status === 'playing';
    const statusChanged = previousStatus !== state.status;
    const lifeChanged = previousLives !== state.lives;
    const collectedChanged = previousCollected !== state.collected;
    root.dataset.gameState = state.status;
    overlay.hidden = playing || celebrating;
    overlay.setAttribute('aria-hidden', String(playing || celebrating));
    showPanel(startPanel, state.status === 'ready');
    showPanel(pausePanel, state.status === 'paused');
    showPanel(resultPanel, !celebrating && (state.status === 'won' || state.status === 'lost'));
    startButton.disabled = !assetsReady || !brush;
    pauseButton.disabled = !playing;
    leftButton.disabled = rightButton.disabled = !playing;

    const time = state.remaining.toFixed(1);
    if (previousTime !== time) { $('red-time').textContent = time; previousTime = time; }
    if (collectedChanged) {
      $('red-light-stars').textContent = '★'.repeat(state.collected) + '☆'.repeat(window.HikariRedModel.LIGHT_GOAL - state.collected);
      $('red-light-stars').setAttribute('aria-label', `光${state.collected}こ`);
      const stars = $('red-light-stars');
      stars.classList.remove('red-star-bounce');
      if (state.day === 2 && state.collected > 0) {
        void stars.offsetWidth;
        stars.classList.add('red-star-bounce');
      }
      if (state.day === 2 && state.collected > 0 && state.lastCollected) {
        catchEffect.style.left = `${state.lastCollected.x / state.width * 100}%`;
        catchEffect.style.top = `${state.lastCollected.y / state.height * 100}%`;
        catchEffect.classList.remove('pop');
        void catchEffect.offsetWidth;
        catchEffect.hidden = false;
        catchEffect.classList.add('pop');
        gentleBell(650 + state.collected * 92, state.collected === 3 ? .8 : .4);
      }
    }
    if (lifeChanged) {
      $('red-lives').textContent = `${'♥ '.repeat(state.lives)}${'♡ '.repeat(game.config.lives - state.lives)}`.trim();
      $('red-lives').setAttribute('aria-label', `ライフ${state.lives}つ`);
      $('red-lives').dataset.remaining = String(state.lives);
    }
    character.classList.toggle('red-invulnerable', state.invulnerable > 0 && playing);
    character.classList.toggle('red-last-hit', state.status === 'lost');
    // Drive the blink from active game time, so pause/resume freezes it with the game.
    character.style.opacity = state.invulnerable > 0 && playing &&
      Math.floor((game.config.invulnerability - state.invulnerable) / .18) % 2 === 0 ? '.35' : '1';
    character.style.left = `${state.player.x / state.width * 100}%`;
    character.style.width = `${state.player.width / state.width * 100}%`;
    character.style.bottom = `${state.player.bottom / state.height * 100}%`;
    character.style.transform = 'translateX(-50%)';
    hitEffect.hidden = !state.impact || state.hitFeedback <= 0 || (!playing && state.status !== 'lost');
    if (!hitEffect.hidden) {
      const progress = 1 - state.hitFeedback / game.config.hitFeedbackDuration;
      hitEffect.style.left = `${state.impact.x / state.width * 100}%`;
      hitEffect.style.top = `${state.impact.y / state.height * 100}%`;
      hitEffect.style.opacity = String(1 - progress);
      hitEffect.style.transform = `translate(-50%, -50%) scale(${.6 + progress * .8})`;
    }

    if (statusChanged) {
      if (state.status === 'ready') $('red-status').textContent = state.day === 2 ? 'ひかるヨーヨーを3つ集めよう！' : 'スタートを押すと、ヨーヨーよけが始まります。';
      if (playing) $('red-status').textContent = state.day === 2 ? 'ふつうのヨーヨーはよけて、ひかるヨーヨーをキャッチ！' : 'ゆびで浴衣の子を左右に動かして、ヨーヨーをよけよう！';
      if (state.status === 'paused') $('red-status').textContent = 'ゲームをひとやすみ。つづきから再開できます。';
      if (state.status === 'won') {
        $('red-overlay-title').textContent = state.day === 2 ? 'あかい光、みつけた！ ✨' : 'やったー！ クリア！ ✨';
        $('red-overlay-text').textContent = state.day === 2 ?
          '3つの光が ひとつになったよ。ふじさんに 光をとどけよう！' :
          `${game.config.duration}びょう、よけきったよ！ もういちど遊んでもいいよ。`;
        $('red-status').textContent = state.day === 2 ? '赤い光を3つ集めてクリア！' : `${game.config.duration}秒よけきってクリアしました！`;
      }
      if (state.status === 'lost') {
        $('red-overlay-title').textContent = 'もういっかい！';
        $('red-overlay-text').textContent = state.day === 2 && state.lossReason === 'time' ?
          `ひかりは${state.collected}つ！ あとすこし！もういっかい あつめよう！` :
          `${state.elapsed.toFixed(1)}びょう、がんばったね。すぐにもういちど挑戦できるよ！`;
        $('red-status').textContent = state.lossReason === 'time' ?
          '30秒が過ぎました。もういちど光を集めよう！' :
          'ライフがなくなりました。もういっかいボタンで再挑戦できます。';
      }
      if (focus && state.status === 'paused') $('red-resume').focus({ preventScroll: true });
      if (focus && !celebrating && (state.status === 'won' || state.status === 'lost')) {
        $('red-overlay-title').tabIndex = -1;
        $('red-overlay-title').focus({ preventScroll: true });
      }
    } else if (collectedChanged && playing && state.day === 2) {
      $('red-status').textContent = `ひかりを${state.collected}つ集めた！ ${state.collected === 2 ? 'あとひとつ！' : ''}`;
    } else if (lifeChanged && playing) {
      $('red-status').textContent = `ヨーヨーに当たった！ ライフはあと${state.lives}つ。`;
    }
    if (state.status === 'paused') {
      pausePanel.querySelector('p').textContent = pauseReason || 'じゅんびができたら、つづきから遊ぼう。';
    }
    previousStatus = state.status; previousLives = state.lives; previousCollected = state.collected;
  }

  function drawTinyStar(x, y, radius, alpha, rotation) {
    brush.save();
    brush.translate(x, y);
    brush.rotate(rotation);
    brush.globalAlpha = Math.min(.98, Math.max(0, alpha));
    brush.fillStyle = '#fff9db';
    brush.shadowColor = '#ffb8d5';
    brush.shadowBlur = 8;
    brush.beginPath();
    brush.moveTo(0, -radius);
    brush.quadraticCurveTo(radius * .20, -radius * .20, radius, 0);
    brush.quadraticCurveTo(radius * .20, radius * .20, 0, radius);
    brush.quadraticCurveTo(-radius * .20, radius * .20, -radius, 0);
    brush.quadraticCurveTo(-radius * .20, -radius * .20, 0, -radius);
    brush.closePath();
    brush.fill();
    brush.restore();
  }
  function drawGlowingYoyo(ball, yoyo, time) {
    // Canvas effects are visual only: the original PNG, speed and collision stay unchanged.
    const phase = time * 2.8 + yoyo.id * .82;
    const pulse = (Math.sin(phase) + 1) / 2;
    const haloRadius = Math.max(49, ball.radius * 2.55);
    const halo = brush.createRadialGradient(ball.x, ball.y, ball.radius * .5, ball.x, ball.y, haloRadius);
    halo.addColorStop(0, 'rgba(255,243,220,0.15)');
    halo.addColorStop(.42, `rgba(255,197,220,${(.24 + pulse * .14).toFixed(3)})`);
    halo.addColorStop(.73, `rgba(255,151,183,${(.26 + pulse * .16).toFixed(3)})`);
    halo.addColorStop(1, 'rgba(255,151,183,0)');
    brush.fillStyle = halo;
    brush.beginPath();
    brush.arc(ball.x, ball.y, haloRadius, 0, Math.PI * 2);
    brush.fill();
  }
  function drawGlowingDetails(ball, yoyo, time) {
    const phase = time * 2.8 + yoyo.id * .82;
    const pulse = (Math.sin(phase) + 1) / 2;
    brush.save();
    brush.shadowColor = '#ffe7bf';
    brush.shadowBlur = 12 + pulse * 6;
    brush.strokeStyle = `rgba(255,231,186,${(.62 + pulse * .32).toFixed(3)})`;
    brush.lineWidth = 2.2 + pulse * .6;
    brush.beginPath();
    brush.arc(ball.x, ball.y, ball.radius + 4.5, 0, Math.PI * 2);
    brush.stroke();
    brush.setLineDash([2.5, 8]);
    brush.lineWidth = 1.5;
    brush.strokeStyle = `rgba(255,189,225,${(.6 + pulse * .28).toFixed(3)})`;
    brush.beginPath();
    brush.arc(ball.x, ball.y, ball.radius + 10, 0, Math.PI * 2);
    brush.stroke();
    brush.restore();

    // Orbiting four-point sparkles: a handful per balloon, no generated image files.
    for (let i = 0; i < 7; i++) {
      const angle = i * Math.PI * 2 / 7 + phase * .32;
      const distance = ball.radius + 15 + (i % 3) * 6;
      const x = ball.x + Math.cos(angle) * distance;
      const y = ball.y + Math.sin(angle) * distance;
      const twinkle = (Math.sin(phase * 1.5 + i * 1.8) + 1) / 2;
      drawTinyStar(x, y, 3 + twinkle * 3.2, .35 + twinkle * .62, angle);
    }
    // A soft sweep across the rubber-ball surface keeps the original patterns visible.
    drawTinyStar(ball.x - ball.radius * .44, ball.y - ball.radius * .52,
      5 + pulse * 2.5, .44 + pulse * .35, phase * .14);
    brush.save();
    brush.textAlign = 'center';
    brush.textBaseline = 'middle';
    brush.font = 'bold 23px sans-serif';
    brush.lineWidth = 3.5;
    brush.strokeStyle = '#fffce4';
    brush.shadowColor = '#fff2bf';
    brush.shadowBlur = 9;
    brush.strokeText('★', ball.x, ball.y);
    brush.fillStyle = '#f34d69';
    brush.fillText('★', ball.x, ball.y);
    brush.restore();
  }
  function draw() {
    if (!brush) return;
    const state = game.state;
    brush.setTransform(canvas.width / state.width, 0, 0, canvas.height / state.height, 0, 0);
    brush.clearRect(0, 0, state.width, state.height);
    for (const yoyo of state.yoyos) {
      const image = sprites.get(yoyo.type);
      if (!image || !image.complete || !image.naturalWidth) continue;
      const lightBall = yoyo.glowing ? window.HikariRedModel.yoyoBody(yoyo) : null;
      if (lightBall) drawGlowingYoyo(lightBall, yoyo, state.elapsed);
      brush.save(); brush.translate(yoyo.x, yoyo.y); brush.rotate(yoyo.angle);
      brush.drawImage(image, -yoyo.size / 2, -yoyo.size / 2, yoyo.size, yoyo.size);
      brush.restore();
      if (lightBall) drawGlowingDetails(lightBall, yoyo, state.elapsed);
    }
  }
  function resize() {
    const cssWidth = arena.clientWidth, cssHeight = arena.clientHeight;
    if (cssWidth < 1 || cssHeight < 1) return;
    const nextHeight = cssHeight * game.state.width / cssWidth;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(cssWidth * ratio));
    const height = Math.max(1, Math.round(cssHeight * ratio));
    const wasPlaying = game.state.status === 'playing';
    game.resize(nextHeight);
    if (wasPlaying && game.state.status === 'paused') {
      stopFrame(); releaseControls(); pauseReason = '画面の大きさが変わったので、ひとやすみ。じゅんびができたら再開してね。';
    }
    if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    draw(); syncView();
  }
  function animate(now) {
    frameId = 0;
    if (!entered || document.hidden || game.state.status !== 'playing') return;
    const seconds = lastFrame ? Math.max(0, (now - lastFrame) / 1000) : 0;
    lastFrame = now;
    const horizontal = Number(heldKeys.has('ArrowRight')) - Number(heldKeys.has('ArrowLeft'));
    if (horizontal) game.movePlayer(horizontal * 360 * Math.min(seconds, .1));
    game.step(seconds);
    if (game.state.day === 2 && game.state.status === 'won' && !celebrating) beginCelebration();
    draw(); syncView({ focus: true });
    if (game.state.status === 'playing') frameId = requestAnimationFrame(animate);
    else releaseControls();
  }
  function schedule() {
    stopFrame();
    if (entered && !document.hidden && game.state.status === 'playing') frameId = requestAnimationFrame(animate);
  }
  function pause(reason = '') {
    if (game.state.status !== 'playing') return;
    game.pause(); stopFrame(); releaseControls(); pauseReason = reason;
    draw(); syncView({ focus: entered && !document.hidden });
  }
  function start() {
    if (!assetsReady || !brush || !entered || document.hidden) return;
    stopFrame(); releaseControls(); pauseReason = '';
    cancelCelebration(); catchEffect.hidden = true;
    game.start(); draw(); syncView(); arena.focus({ preventScroll: true }); schedule();
  }
  async function prepareAssets() {
    if (loading) return loading;
    assetsReady = false;
    startButton.disabled = true;
    $('red-load-status').textContent = 'ヨーヨーを準備しているよ…';
    loading = (async () => {
      try {
        if (!brush) throw new Error('canvas');
        const images = [...sprites.values(), character];
        if (sprites.size !== window.HikariRedModel.YOYO_TYPES.length) throw new Error('sprite count');
        await Promise.all(images.map(async image => {
          if (image.complete && !image.naturalWidth) image.src = image.src;
          await image.decode();
          if (!image.naturalWidth || !image.naturalHeight) throw new Error('image');
        }));
        assetsReady = true;
        $('red-load-status').textContent = '6種類のヨーヨー、じゅんびOK！';
        startButton.textContent = 'スタート！';
      } catch (_) {
        $('red-load-status').textContent = brush ? '画像を読み込めませんでした。通信を確認して、もう一度試してね。' : 'このブラウザーではゲームを表示できません。別のブラウザーで試してね。';
        startButton.textContent = '画像をもう一度読み込む';
      } finally {
        loading = null;
        syncView();
        if (!assetsReady && brush) startButton.disabled = false;
      }
    })();
    return loading;
  }

  startButton.addEventListener('click', () => { if (!assetsReady) prepareAssets(); else start(); });
  $('red-retry').addEventListener('click', start);
  pauseButton.addEventListener('click', () => pause());
  $('red-resume').addEventListener('click', () => {
    if (!entered || document.hidden || game.state.status !== 'paused') return;
    pauseReason = ''; game.resume(); syncView(); arena.focus({ preventScroll: true }); schedule();
  });
  leftButton.addEventListener('click', () => { if (game.state.status === 'playing') game.movePlayer(-36); });
  rightButton.addEventListener('click', () => { if (game.state.status === 'playing') game.movePlayer(36); });
  function pointerX(event) {
    const box = arena.getBoundingClientRect();
    return (event.clientX - box.left - arena.clientLeft) / arena.clientWidth * game.state.width;
  }
  arena.addEventListener('pointerdown', event => {
    if (game.state.status !== 'playing' || pointer !== null || event.button !== 0) return;
    event.preventDefault(); pointer = event.pointerId; pointerOffset = game.state.player.x - pointerX(event);
    try { arena.setPointerCapture(event.pointerId); } catch (_) { /* Browser cancellation releases control below. */ }
    game.setTargetX(game.state.player.x);
  });
  arena.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer || game.state.status !== 'playing') return;
    event.preventDefault(); game.setTargetX(pointerX(event) + pointerOffset);
  });
  function endPointer(event) {
    if (event.pointerId !== pointer) return;
    try { if (arena.hasPointerCapture(event.pointerId)) arena.releasePointerCapture(event.pointerId); } catch (_) { /* Already released. */ }
    pointer = null;
  }
  ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(event => arena.addEventListener(event, endPointer));
  window.addEventListener('keydown', event => {
    if (!entered || game.state.status !== 'playing' || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { event.preventDefault(); pause(); return; }
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    if (!heldKeys.size) game.setTargetX(game.state.player.x);
    heldKeys.add(event.key);
  });
  window.addEventListener('keyup', event => heldKeys.delete(event.key));
  window.addEventListener('blur', () => pause('画面からはなれたので、ひとやすみ。つづきから再開できます。'));
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) pause('画面からはなれたので、ひとやすみ。つづきから再開できます。');
  });
  if (typeof ResizeObserver !== 'undefined') new ResizeObserver(resize).observe(arena);
  else window.addEventListener('resize', resize);

  window.HikariRedGame = Object.freeze({
    enter(day) {
      const priorDay = game.state.day;
      game.setDay(day);
      if (priorDay !== game.state.day) {
        cancelCelebration(); catchEffect.hidden = true;
        previousStatus = ''; previousLives = -1; previousTime = ''; previousCollected = -1;
      }
      configureDay();
      entered = true; resize(); syncView();
      if (!assetsReady) prepareAssets();
    },
    leave() {
      entered = false;
      cancelCelebration();
      pause(); stopFrame(); releaseControls();
    }
  });
  configureDay();
  resize(); syncView(); prepareAssets();
})();
