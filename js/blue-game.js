/* Blue-light mini-game: lightweight DOM presentation and phone-friendly controls. */
(() => {
  'use strict';
  const root = document.getElementById('blue-preview');
  if (!root || !window.HikariBlueModel) return;
  const model = window.HikariBlueModel;
  const game = model.createGame();
  const $ = id => root.querySelector('#' + id);
  const buttons = [...root.querySelectorAll('[data-blue-item]')];
  const itemById = new Map(model.ITEMS.map(item => [item.id, item]));
  const guestById = new Map(model.GUESTS.map(guest => [guest.id, guest]));
  const orderBox = $('blue-order');
  const overlay = $('blue-overlay');
  const startPanel = $('blue-start-panel'), pausePanel = $('blue-pause-panel'), resultPanel = $('blue-result-panel');
  let entered = false, frameId = 0, lastFrame = 0;
  let renderOrderKey = '', renderTrayKey = '', renderGuestKey = '', renderLanternKey = '';
  let audioContext = null;
  function sound(kind) {
    // As in the 2026 festival, little game sounds reward a tap or a serving.
    // They respect the existing common BGM control and never block play.
    if (document.getElementById('bgm-toggle')?.getAttribute('aria-pressed') !== 'true') return;
    try {
      const Engine = window.AudioContext || window.webkitAudioContext;
      if (!Engine) return;
      if (!audioContext) audioContext = new Engine();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
      const frequencies = { pick: 660, ready: 840, serve: 1040, miss: 220 };
      const now = audioContext.currentTime;
      const oscillator = audioContext.createOscillator(), volume = audioContext.createGain();
      oscillator.type = kind === 'miss' ? 'triangle' : 'sine';
      oscillator.frequency.setValueAtTime(frequencies[kind] || 660, now);
      if (kind === 'serve') oscillator.frequency.exponentialRampToValueAtTime(1320, now + .16);
      const length = kind === 'serve' ? .23 : .12;
      volume.gain.setValueAtTime(.0001, now);
      volume.gain.exponentialRampToValueAtTime(.032, now + .014);
      volume.gain.exponentialRampToValueAtTime(.0001, now + length);
      oscillator.connect(volume); volume.connect(audioContext.destination);
      oscillator.start(now); oscillator.stop(now + length + .02);
    } catch (_) { /* Audio is optional. */ }
  }
  function stopFrame() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0; lastFrame = 0;
  }
  function showPanel(element, show) { element.hidden = !show; }
  function refreshOrder() {
    const state = game.state, key = state.order.join(':') + '|' + state.selected.join(':');
    if (key === renderOrderKey) return;
    renderOrderKey = key;
    const nodes = [];
    state.order.forEach((id, index) => {
      if (index && state.day === 2) {
        const arrow = document.createElement('span');
        arrow.textContent = '→'; arrow.className = 'blue-order-divider'; arrow.setAttribute('aria-hidden', 'true');
        nodes.push(arrow);
      }
      const span = document.createElement('span');
      span.className = 'blue-order-item' + (index < state.selected.length ? ' done' : '');
      span.textContent = itemById.get(id).emoji;
      span.setAttribute('aria-label', itemById.get(id).label + (index < state.selected.length ? ' 完了' : ''));
      nodes.push(span);
    });
    orderBox.replaceChildren(...nodes);
    const items = state.order.map(id => itemById.get(id).label);
    $('blue-order-hint').textContent = state.order.length ?
      (state.day === 2 ? items.join(' → ') + ' のじゅんばんで！' : items[0] + ' をタップ！') :
      'ちゅうもんを よく見てね！';
  }
  function refreshExtras() {
    const state = game.state, rules = model.RULES[state.day];
    const trayKey = state.order.join(':') + '|' + state.selected.join(':') + '|' + state.readyToServe;
    if (renderTrayKey !== trayKey) {
      renderTrayKey = trayKey;
      const tray = $('blue-tray');
      tray.replaceChildren();
      if (!state.selected.length) {
        tray.textContent = '✨ ここでじゅんび！';
        tray.classList.remove('blue-tray-ready');
      } else {
        for (const id of state.selected) {
          const item = document.createElement('span');
          item.className = 'blue-tray-food';
          item.textContent = itemById.get(id).emoji;
          item.setAttribute('role', 'img');
          item.setAttribute('aria-label', itemById.get(id).label);
          tray.append(item);
        }
        tray.classList.toggle('blue-tray-ready', state.readyToServe);
      }
    }
    if (renderGuestKey !== state.guest) {
      renderGuestKey = state.guest;
      const guest = guestById.get(state.guest) || model.GUESTS[0];
      $('blue-guest-emoji').textContent = guest.emoji;
      $('blue-guest-name').textContent = guest.label + ' のちゅうもん';
      $('blue-guest-line').textContent = guest.phrase;
      $('blue-guest-emoji').classList.remove('blue-guest-pop');
      void $('blue-guest-emoji').offsetWidth;
      $('blue-guest-emoji').classList.add('blue-guest-pop');
    }
    const lanternKey = state.day + '|' + state.completed;
    if (renderLanternKey !== lanternKey) {
      renderLanternKey = lanternKey;
      const row = $('blue-lantern-progress');
      const lamps = [];
      for (let i = 0; i < rules.goal; i++) {
        const lamp = document.createElement('span');
        lamp.className = 'blue-mini-lantern' + (i < state.completed ? ' lit' : '');
        lamp.textContent = '🏮';
        lamps.push(lamp);
      }
      row.replaceChildren(...lamps);
    }
    $('blue-combo').textContent = String(state.combo);
    $('blue-serve').disabled = state.status !== 'playing' || !state.readyToServe || state.interlude > 0;
    $('blue-serve').classList.toggle('blue-serve-ready', !($('blue-serve').disabled));
  }
  function configureDay() {
    const day = game.state.day;
    root.dataset.gameDay = String(day);
    root.querySelector('.blue-demo-badge').textContent = '🔵 ' + day + '日目のおためし';
    $('blue-start-heading').textContent = day === 2 ? 'おみせやさんは大いそがし！' : 'ちゅうもんをそろえよう！';
    $('blue-start-description').textContent = day === 2 ?
      '2つの品物を、注文された順番でタップしよう！' :
      'おきゃくさんの注文を見て、ぴったりの商品をタップしよう！';
    $('blue-game-note').textContent = '青の光・' + day + '日目のおためし。おすすめのお店や受付との連動はまだありません。';
  }
  function sync({ focus = false } = {}) {
    const state = game.state, rules = model.RULES[state.day];
    root.dataset.gameState = state.status;
    const playing = state.status === 'playing';
    showPanel(startPanel, state.status === 'ready');
    showPanel(pausePanel, state.status === 'paused');
    showPanel(resultPanel, state.status === 'won' || state.status === 'lost');
    overlay.hidden = playing;
    overlay.setAttribute('aria-hidden', String(playing));
    $('blue-time').textContent = state.remaining.toFixed(1);
    $('blue-score').textContent = state.completed + ' / ' + rules.goal;
    $('blue-lives').textContent = '♥ '.repeat(state.lives).trim() + ' ♡'.repeat(rules.lives - state.lives);
    $('blue-lives').setAttribute('aria-label', 'ライフ' + state.lives + 'つ');
    $('blue-pause').disabled = !playing;
    buttons.forEach(button => {
      button.disabled = !playing || state.interlude > 0 || state.readyToServe;
      button.classList.toggle('blue-selected', state.selected.includes(button.dataset.blueItem));
      button.setAttribute('aria-pressed', String(state.selected.includes(button.dataset.blueItem)));
    });
    $('blue-feedback').textContent = state.feedbackTime > 0 && playing ? state.feedback : '';
    $('blue-feedback').dataset.kind = state.feedbackKind;
    refreshOrder();
    refreshExtras();
    if (state.status === 'won') {
      $('blue-result-title').textContent = 'やったー！ おみせやさん名人！ ✨';
      $('blue-result-text').textContent = rules.goal + 'くみの注文をおわたしできたよ！ さいこうコンボ ' + state.bestCombo + '！ 青い光、みつけた！';
      $('blue-result-ornament').textContent = '💙 ✨ 🎉 ✨ 💙';
    } else if (state.status === 'lost') {
      $('blue-result-title').textContent = 'もういっかい！ 🍧';
      $('blue-result-text').textContent = state.lives <= 0 ?
        'おしい！ ライフがなくなっちゃった。もういちど挑戦しよう！' :
        'じかんぎれ！ ' + state.completed + 'くみの注文ができたよ。もういっかい！';
      $('blue-result-ornament').textContent = '🍧 🍎 🍌';
    }
    if (focus && state.status === 'paused') $('blue-resume').focus({ preventScroll: true });
    if (focus && (state.status === 'won' || state.status === 'lost')) { $('blue-result-title').tabIndex = -1; $('blue-result-title').focus({ preventScroll: true }); }
  }
  function loop(now) {
    frameId = 0;
    if (!entered || document.hidden || game.state.status !== 'playing') return;
    const elapsed = lastFrame ? Math.max(0, Math.min(.1, (now - lastFrame) / 1000)) : 0;
    lastFrame = now;
    game.step(elapsed);
    sync();
    if (game.state.status === 'playing') frameId = requestAnimationFrame(loop);
    else sync({ focus: true });
  }
  function schedule() {
    stopFrame();
    if (entered && !document.hidden && game.state.status === 'playing') frameId = requestAnimationFrame(loop);
  }
  function start() {
    if (!entered || document.hidden) return;
    stopFrame(); game.start(); renderOrderKey = ''; renderTrayKey = ''; renderGuestKey = ''; renderLanternKey = ''; sync(); schedule();
  }
  function pause() {
    if (game.state.status !== 'playing') return;
    game.pause(); stopFrame(); sync({ focus: entered && !document.hidden });
  }
  function chooseFromButton(id) {
    if (!entered || document.hidden) return;
    const before = game.state.selected.length, livesBefore = game.state.lives;
    game.chooseItem(id);
    if (game.state.lives < livesBefore) sound('miss');
    else if (game.state.selected.length > before) sound(game.state.readyToServe ? 'ready' : 'pick');
    sync({ focus: true });
  }
  buttons.forEach(button => button.addEventListener('click', () => chooseFromButton(button.dataset.blueItem)));
  $('blue-serve').addEventListener('click', () => {
    if (!entered || document.hidden) return;
    const previousCompleted = game.state.completed;
    game.serveOrder();
    if (game.state.completed > previousCompleted) sound('serve');
    sync({ focus: true });
  });
  $('blue-start').addEventListener('click', start);
  $('blue-retry').addEventListener('click', start);
  $('blue-pause').addEventListener('click', pause);
  $('blue-resume').addEventListener('click', () => {
    if (!entered || document.hidden || game.state.status !== 'paused') return;
    game.resume(); sync(); schedule();
  });
  window.addEventListener('keydown', event => {
    if (!entered || document.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') { if (game.state.status === 'playing') { event.preventDefault(); pause(); } return; }
    if (game.state.status !== 'playing') return;
    if (event.key === 'Enter' && game.state.readyToServe) {
      event.preventDefault(); game.serveOrder(); sound('serve'); sync({ focus: true }); return;
    }
    if (!['1','2','3','4'].includes(event.key)) return;
    event.preventDefault();
    chooseFromButton(buttons[Number(event.key)-1].dataset.blueItem);
  });
  window.addEventListener('blur', () => { if (entered) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && entered) pause(); });
  window.HikariBlueGame = Object.freeze({
    enter(day) {
      game.setDay(day);
      configureDay(); entered = true;
      renderOrderKey = ''; renderTrayKey = ''; renderGuestKey = ''; renderLanternKey = '';
      sync();
    },
    leave() {
      entered = false; pause(); stopFrame();
    }
  });
  configureDay(); sync();
})();
