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
  const orderBox = $('blue-order');
  const overlay = $('blue-overlay');
  const startPanel = $('blue-start-panel'), pausePanel = $('blue-pause-panel'), resultPanel = $('blue-result-panel');
  let entered = false, frameId = 0, lastFrame = 0, renderOrderKey = '';
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
  function configureDay() {
    const day = game.state.day;
    root.dataset.gameDay = String(day);
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
      button.disabled = !playing || state.interlude > 0;
      button.classList.toggle('blue-selected', state.selected.includes(button.dataset.blueItem));
      button.setAttribute('aria-pressed', String(state.selected.includes(button.dataset.blueItem)));
    });
    $('blue-feedback').textContent = state.feedbackTime > 0 && playing ? state.feedback : '';
    $('blue-feedback').dataset.kind = state.feedbackKind;
    refreshOrder();
    if (state.status === 'won') {
      $('blue-result-title').textContent = 'やったー！ おみせやさん名人！ ✨';
      $('blue-result-text').textContent = rules.goal + 'くみの注文がそろったよ！ 青い光、みつけた！';
      $('blue-result-ornament').textContent = '💙 ✨ 🎉 ✨ 💙';
    } else if (state.status === 'lost') {
      $('blue-result-title').textContent = 'もういっかい！ 🍧';
      $('blue-result-text').textContent = state.lives <= 0 ?
        'おしい！ ライフがなくなっちゃった。もういちど挑戦しよう！' :
        'じかんぎれ！ ' + state.completed + 'くみの注文ができたよ。もういっかい！';
      $('blue-result-ornament').textContent = '🍧 🍎 🍌';
    }
    if (focus && state.status === 'paused') $('blue-resume').focus({ preventScroll: true });
    if (focus && (state.status === 'won' || state.status === 'lost')) $('blue-result-title').focus({ preventScroll: true });
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
    stopFrame(); game.start(); renderOrderKey = ''; sync(); schedule();
  }
  function pause() {
    if (game.state.status !== 'playing') return;
    game.pause(); stopFrame(); sync({ focus: entered && !document.hidden });
  }
  buttons.forEach(button => button.addEventListener('click', () => {
    if (!entered || document.hidden) return;
    game.chooseItem(button.dataset.blueItem);
    sync({ focus: true });
  }));
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
    if (game.state.status !== 'playing' || !['1','2','3','4'].includes(event.key)) return;
    event.preventDefault();
    game.chooseItem(buttons[Number(event.key)-1].dataset.blueItem);
    sync({ focus: true });
  });
  window.addEventListener('blur', () => { if (entered) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && entered) pause(); });
  window.HikariBlueGame = Object.freeze({
    enter(day) {
      game.setDay(day);
      configureDay(); entered = true; renderOrderKey = ''; sync();
    },
    leave() {
      entered = false; pause(); stopFrame();
    }
  });
  configureDay(); sync();
})();
