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
  const preloaded = [];
  function preloadAssets() {
    if (preloaded.length) return;
    const sources = new Set([
      ...model.CUSTOMERS.map(person => person.image),
      ...model.ACTIONS.map(action => action.image).filter(Boolean),
      ...model.ITEMS.map(item => model.imageFor(item.id, 'finish'))
    ]);
    sources.forEach(src => { const image = new Image(); image.src = src; preloaded.push(image); });
  }
  function stopFrame() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0; lastFrame = 0;
  }
  function renderRecipe() {
    const s = game.state;
    const key = [s.day, s.customer?.id, s.order.join(), s.selected.join(), s.stage, s.choices.join()].join('|');
    if (key === visualKey) return;
    visualKey = key;
    const avatar = $('blue-customer-avatar');
    avatar.hidden = !s.customer;
    if (s.customer) avatar.src = s.customer.image;
    // The customer's appearance is conveyed by the artwork; do not show internal character descriptions.
    avatar.alt = 'おきゃくさん';
    const nodes = [];
    s.order.forEach((id, index) => {
      const item = byItem.get(id);
      if (index) {
        const plus = document.createElement('span'); plus.className = 'blue-order-divider';
        plus.textContent = '＋'; plus.setAttribute('aria-hidden', 'true'); nodes.push(plus);
      }
      const node = document.createElement('span');
      node.className = 'blue-order-item' + (index < s.selected.length ? ' done' : index === s.selected.length ? ' current' : '');
      node.textContent = item.label;
      node.setAttribute('aria-label', item.label + (index < s.selected.length ? ' 完了' : ''));
      nodes.push(node);
    });
    $('blue-order').replaceChildren(...nodes);
    $('blue-order-hint').textContent = s.order.length ?
      (s.selected.length === s.order.length ? 'ありがとう！' : 'ください！') : 'なにをつくろうかな？';
    const itemId = game.currentItem();
    const current = itemId && byItem.get(itemId);
    const recipe = itemId && model.RECIPES[itemId];
    $('blue-prep-status').textContent = current ?
      current.emoji + ' ' + current.label + ' をつくろう' : s.customer ? 'はい、どうぞ！ ✨' : '🍳 ちょうりだい';
    $('blue-prep-instruction').textContent = current ?
      (game.expectedAction() === 'serve' ? 'できあがり！おわたししよう ✨' :
        'つぎの材料をえらぼう　' + (s.stage + 1) + ' / ' + recipe.length) :
      s.customer ? 'おきゃくさんに わたせたよ！' : 'つぎに使うものをえらぼう';
    const work = $('blue-work-image'), image = itemId && model.workImage(itemId, s.stage);
    work.hidden = !image;
    if (image) {
      work.src = image;
      work.alt = current.label + '：' + byAction.get(recipe[s.stage - 1]).label + 'までできたよ';
    }
    $('blue-progress').setAttribute('aria-label', current ? s.stage + ' / ' + recipe.length + ' 工程完了' : '調理前');
    $('blue-progress').replaceChildren(...(recipe || []).map((action, index) => {
      const dot = document.createElement('span');
      dot.textContent = index < s.stage ? '●' : '○';
      dot.className = index < s.stage ? 'done' : '';
      dot.setAttribute('aria-hidden', 'true');
      dot.title = byAction.get(action).label;
      return dot;
    }));
    buttons.forEach((button, index) => {
      const id = s.choices[index], a = byAction.get(id);
      button.dataset.blueItem = id || '';
      const icon = button.querySelector('.blue-food-icon');
      if (a) icon.src = id === 'serve' ? model.imageFor(itemId, 'finish') : a.image;
      button.querySelector('.blue-action-label').textContent = a?.label || 'じゅんびちゅう';
      button.setAttribute('aria-label', a?.label || 'じゅんびちゅう');
    });
  }
  function configureDay() {
    const day = game.state.day, rule = model.RULES[day];
    root.dataset.gameDay = String(day);
    root.querySelector('.blue-demo-badge').textContent = '🔵 ' + day + '日目';
    $('blue-start-heading').textContent = day === 2 ? 'おみせやさんは大いそがし！' : 'おみせやさんに なろう！';
    $('blue-start-description').textContent = day === 2 ?
      'おきゃくさんの2つの品物を、材料から順番につくって渡そう！' :
      '注文された品物を、材料からつくって、おきゃくさんに渡そう！';
    $('blue-start-rules').textContent = rule.duration + 'びょう・ライフ3つ・' + rule.goal + 'くみのおきゃくさん';
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
      $('blue-result-ornament').textContent = '🍧 🎪 💙';
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
    const elapsed = lastFrame ? Math.max(0, (now - lastFrame) / 1000) : 0;
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
    const stage = game.state.stage, selected = game.state.selected.length;
    game.chooseItem(button.dataset.blueItem);
    sync({ focus: true });
    if (stage !== game.state.stage || selected !== game.state.selected.length) {
      const work = $('blue-work-image');
      work.classList.remove('pop');
      void work.offsetWidth;
      work.classList.add('pop');
    }
  }
  buttons.forEach(button => button.addEventListener('click', () => choose(button)));
  $('blue-start').addEventListener('click', start);
  $('blue-retry').addEventListener('click', start);
  $('blue-restart').addEventListener('click', start);
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
    enter(day) { game.setDay(day); configureDay(); entered = true; preloadAssets(); visualKey = ''; sync(); },
    leave() { entered = false; pause(); stopFrame(); }
  });
  configureDay(); sync();
})();
