/* Blue light: a hands-on shop. Follow a recipe, then hand it to a random customer. */
(() => {
  'use strict';
  const root = document.getElementById('blue-preview');
  if (!root || !window.HikariBlueModel) return;
  const model = window.HikariBlueModel, game = model.createGame();
  const $ = id => root.querySelector('#' + id);
  const buttons = [...root.querySelectorAll('[data-blue-item]')];
  const byItem = new Map(model.ITEMS.map(item => [item.id, item]));
  const byAction = new Map(model.ACTIONS.map(action => [action.id, action]));
  const overlay = $('blue-overlay'), startPanel = $('blue-start-panel');
  const pausePanel = $('blue-pause-panel'), resultPanel = $('blue-result-panel');
  let entered = false, frameId = 0, lastFrame = 0, visualKey = '';
  function stopFrame() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0; lastFrame = 0;
  }
  function renderRecipe() {
    const s = game.state;
    const key = [s.day, s.customer?.id, s.order.join(), s.selected.join(), s.stage, s.choices.join()].join('|');
    if (key === visualKey) return;
    visualKey = key;
    $('blue-customer-avatar').textContent = s.customer?.emoji || '🧒';
    $('blue-customer-avatar').setAttribute('aria-label', s.customer?.label || 'おきゃくさん');
    const nodes = [];
    s.order.forEach((id, index) => {
      const item = byItem.get(id);
      if (index) {
        const plus = document.createElement('span'); plus.className = 'blue-order-divider';
        plus.textContent = '＋'; plus.setAttribute('aria-hidden', 'true'); nodes.push(plus);
      }
      const node = document.createElement('span');
      node.className = 'blue-order-item' + (index < s.selected.length ? ' done' : '');
      node.textContent = item.emoji;
      node.setAttribute('aria-label', item.label + (index < s.selected.length ? ' 完了' : ''));
      nodes.push(node);
    });
    $('blue-order').replaceChildren(...nodes);
    const names = s.order.map(id => byItem.get(id).label);
    $('blue-order-hint').textContent = names.length ?
      s.customer.label + '「' + names.join('と') + 'ください！」' : 'おきゃくさんをまっているよ';
    const itemId = game.currentItem();
    const current = itemId && byItem.get(itemId);
    const recipe = itemId && model.RECIPES[itemId];
    const finished = recipe ? recipe.slice(0, s.stage).map(id => byAction.get(id).emoji).join(' ') : '';
    $('blue-prep-status').textContent = current ?
      current.emoji + '  ' + (finished || 'これからつくるよ') : 'できあがり！ ✨';
    $('blue-prep-instruction').textContent = current ?
      'つぎの どうぐや ざいりょうをえらぼう（' + (s.stage + 1) + ' / ' + recipe.length + '）' :
      'おきゃくさんに わたせたよ！';
    buttons.forEach((button, index) => {
      const id = s.choices[index], a = byAction.get(id);
      button.dataset.blueItem = id || '';
      button.querySelector('.blue-food-icon').textContent = a?.emoji || '✨';
      button.querySelector('.blue-action-label').textContent = a?.label || 'じゅんびちゅう';
      button.setAttribute('aria-label', a?.label || 'じゅんびちゅう');
    });
  }
  function configureDay() {
    const day = game.state.day, rule = model.RULES[day];
    root.dataset.gameDay = String(day);
    root.querySelector('.blue-demo-badge').textContent = '🔵 ' + day + '日目のおためし';
    $('blue-start-heading').textContent = day === 2 ? 'おみせやさんは大いそがし！' : 'ちゅうもんをつくろう！';
    $('blue-start-description').textContent = day === 2 ?
      'おきゃくさんの2つの品物を、材料から順番につくって渡そう！' :
      '注文された品物を、材料からつくって、おきゃくさんに渡そう！';
    $('blue-start-rules').textContent = rule.duration + 'びょう・ライフ3つ・' + rule.goal + 'くみのおきゃくさん';
    $('blue-game-note').textContent = day + '日目のおためし。デザインとイラストはあとで決めるよ。';
  }
  function sync({ focus = false } = {}) {
    const s = game.state, rule = model.RULES[s.day], playing = s.status === 'playing';
    root.dataset.gameState = s.status;
    startPanel.hidden = s.status !== 'ready';
    pausePanel.hidden = s.status !== 'paused';
    resultPanel.hidden = s.status !== 'won' && s.status !== 'lost';
    overlay.hidden = playing;
    overlay.setAttribute('aria-hidden', String(playing));
    $('blue-time').textContent = s.remaining.toFixed(1);
    $('blue-score').textContent = s.completed + ' / ' + rule.goal;
    $('blue-lives').textContent = '♥ '.repeat(s.lives).trim() + ' ♡'.repeat(rule.lives - s.lives);
    $('blue-lives').setAttribute('aria-label', 'ライフ' + s.lives + 'つ');
    $('blue-pause').disabled = !playing;
    renderRecipe();
    buttons.forEach(button => {
      button.disabled = !playing || s.interlude > 0 || !button.dataset.blueItem;
      button.classList.remove('blue-selected');
      button.setAttribute('aria-pressed', 'false');
    });
    $('blue-feedback').textContent = s.feedbackTime > 0 && playing ? s.feedback : '';
    $('blue-feedback').dataset.kind = s.feedbackKind;
    if (s.status === 'won') {
      $('blue-result-title').textContent = 'やったー！ おみせやさん名人！ ✨';
      $('blue-result-text').textContent = rule.goal + 'くみのおきゃくさんに、できたてを渡せたよ！';
      $('blue-result-ornament').textContent = '💙 ✨ 🎉 ✨ 💙';
    } else if (s.status === 'lost') {
      $('blue-result-title').textContent = 'もういっかい！ 🍧';
      $('blue-result-text').textContent = s.lives <= 0 ?
        'おしい！ つぎは じゅんばんをよく見てね！' :
        'じかんぎれ！ ' + s.completed + 'くみできたよ。またあそぼう！';
      $('blue-result-ornament').textContent = '🍧 🍎 🍌';
    }
    if (focus && s.status === 'paused') $('blue-resume').focus({ preventScroll: true });
    if (focus && ['won', 'lost'].includes(s.status)) {
      $('blue-result-title').tabIndex = -1;
      $('blue-result-title').focus({ preventScroll: true });
    }
  }
  function loop(now) {
    frameId = 0;
    if (!entered || document.hidden || game.state.status !== 'playing') return;
    const elapsed = lastFrame ? Math.max(0, Math.min(.1, (now - lastFrame) / 1000)) : 0;
    lastFrame = now;
    game.step(elapsed); sync();
    if (game.state.status === 'playing') frameId = requestAnimationFrame(loop);
    else sync({ focus: true });
  }
  function schedule() {
    stopFrame();
    if (entered && !document.hidden && game.state.status === 'playing') frameId = requestAnimationFrame(loop);
  }
  function start() {
    if (!entered || document.hidden) return;
    stopFrame(); game.start(); visualKey = ''; sync(); schedule();
  }
  function pause() {
    if (game.state.status !== 'playing') return;
    game.pause(); stopFrame(); sync({ focus: entered && !document.hidden });
  }
  function choose(button) {
    if (!entered || document.hidden || button.disabled) return;
    game.chooseItem(button.dataset.blueItem);
    sync({ focus: true });
  }
  buttons.forEach(button => button.addEventListener('click', () => choose(button)));
  $('blue-start').addEventListener('click', start);
  $('blue-retry').addEventListener('click', start);
  $('blue-pause').addEventListener('click', pause);
  $('blue-resume').addEventListener('click', () => {
    if (!entered || document.hidden || game.state.status !== 'paused') return;
    game.resume(); sync(); schedule();
  });
  window.addEventListener('keydown', event => {
    if (!entered || document.hidden || event.altKey || event.ctrlKey || event.metaKey) return;
    if (event.key === 'Escape') {
      if (game.state.status === 'playing') { event.preventDefault(); pause(); }
      return;
    }
    if (game.state.status !== 'playing' || !['1', '2', '3', '4'].includes(event.key)) return;
    event.preventDefault();
    choose(buttons[Number(event.key) - 1]);
  });
  window.addEventListener('blur', () => { if (entered) pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && entered) pause(); });
  window.HikariBlueGame = Object.freeze({
    enter(day) { game.setDay(day); configureDay(); entered = true; visualKey = ''; sync(); },
    leave() { entered = false; pause(); stopFrame(); }
  });
  configureDay(); sync();
})();
