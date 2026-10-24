(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const store = window.HikariDemoStore;
  const colors = ['red', 'blue', 'yellow', 'white'];
  const names = ['あか', 'あお', 'きいろ', 'しろ'];
  const paint = ['#ff697d', '#5cb8ff', '#ffd35e', '#f3f2ff'];
  const stamps = ['✨', '💕', '🎉', '🌟'];
  const screens = [...document.querySelectorAll('.screen')];
  const routes = { howto: 'howtopage', red: 'red-preview' };
  const routeFor = id => id === 'howtopage' ? 'howto' : id === 'red-preview' ? 'red' : id;
  let day = new URLSearchParams(location.search).get('day') === '2' ? 2 : 1;
  let activeLightColor = 'red';
  let hintTabColor = 'red';
  let hintBookReturn = 'home';
  let howtoFrom = 'welcome';
  let demoHints = [];
  let shopEntries = [];
  let found = [];
  let modalReturn = null;
  const textLength = value => Array.from(value).length;
  const routeState = () => ({ light: activeLightColor, hintTabColor, hintBookReturn, howtoFrom });

  function loadDay() {
    const hints = store.read(day, 'hints', []);
    demoHints = Array.isArray(hints) ? hints.filter(x => x && colors.includes(x.color) && typeof x.text === 'string' && textLength(x.text) <= 60).slice(-60) : [];
    const shops = store.read(day, 'shops', []);
    shopEntries = Array.isArray(shops) ? shops.filter(x => x && typeof x.name === 'string' && typeof x.comment === 'string' && stamps.includes(x.stamp) && textLength(x.name) <= 30 && textLength(x.comment) <= 60).map(x => ({ name: x.name, stamp: x.stamp, comment: x.comment })).slice(-25) : [];
    const savedFound = store.read(day, 'found', []);
    found = Array.isArray(savedFound) ? savedFound.filter(x => colors.includes(x)) : [];
    document.querySelectorAll('[data-day-label]').forEach(el => { el.textContent = `${day}日目のぼうけん`; });
    $('hint-day').value = String(day);
    document.querySelectorAll('[data-orb]').forEach((el, i) => {
      const isFound = found.includes(colors[i]);
      el.classList.toggle('found', isFound);
      el.querySelector('.orb-status').textContent = isFound ? 'みつけた！' : 'さがし中';
      el.setAttribute('aria-label', `${names[i]}の光、${isFound ? 'みつけた！' : 'さがし中'}`);
    });
  }

  function show(id, { historyMode = 'push', focus = true } = {}) {
    if (!screens.some(el => el.id === id)) id = 'home';
    const previous = document.querySelector('.screen.active')?.id;
    if (previous === 'red-preview' && id !== previous) window.HikariRedGame.leave();
    closeModal(false);
    screens.forEach(el => {
      const active = el.id === id;
      el.classList.toggle('active', active);
      el.setAttribute('aria-hidden', String(!active));
      el.inert = !active;
    });
    document.querySelector('.app').dataset.screen = id;
    window.HikariAudio.selectScene(id === 'red-preview' ? 'red' : 'common');
    if (id === 'red-preview' && previous !== id) window.HikariRedGame.enter(day);
    $('bgm-toggle').hidden = id === 'loading';
    if (historyMode !== 'none' && id !== 'loading') {
      const url = new URL(location.href);
      url.hash = routeFor(id);
      const method = historyMode === 'replace' || url.href === location.href ? 'replaceState' : 'pushState';
      history[method](routeState(), '', url);
    }
    if (focus && id !== 'loading') {
      const target = $(id).querySelector('h1,h2,button');
      if (target) {
        if (target.tagName !== 'BUTTON') target.tabIndex = -1;
        target.focus({ preventScroll: true });
      }
    }
  }

  function openModal(title, paragraphs) {
    modalReturn = document.activeElement;
    $('modal-title').textContent = title;
    $('modal-body').replaceChildren(...paragraphs.map(text => {
      const p = document.createElement('p'); p.textContent = text; return p;
    }));
    document.querySelector('.screen.active').inert = true;
    $('modalwrap').classList.add('open');
    $('close-modal').focus();
  }
  function closeModal(restoreFocus = true) {
    if (!$('modalwrap').classList.contains('open')) return;
    $('modalwrap').classList.remove('open');
    const active = document.querySelector('.screen.active');
    if (active) active.inert = false;
    if (restoreFocus && modalReturn) modalReturn.focus({ preventScroll: true });
  }
  $('close-modal').addEventListener('click', () => closeModal());
  $('modalwrap').addEventListener('click', e => { if (e.target === $('modalwrap')) closeModal(); });
  document.addEventListener('keydown', e => {
    if ($('modalwrap').classList.contains('open')) {
      if (e.key === 'Escape') closeModal();
      if (e.key === 'Tab') { e.preventDefault(); $('close-modal').focus(); }
    }
  });

  function renderDiscovered(color) {
    const i = colors.indexOf(color);
    if (i < 0) return;
    activeLightColor = color;
    $('found-orb').style.background = `radial-gradient(circle at 33% 27%,#fff 0%,color-mix(in srgb,${paint[i]} 45%,white 55%) 28%,${paint[i]} 67%,color-mix(in srgb,${paint[i]} 65%,black 35%))`;
    $('found-orb').style.boxShadow = `0 0 22px ${paint[i]},0 0 65px ${paint[i]}9a`;
    $('found-name').textContent = `${names[i]}の光`;
    $('found-play').textContent = color === 'red' ? 'ヨーヨーよけであそぶ ›' : 'ミニゲームについて ›';
  }
  function discover(color) {
    const i = colors.indexOf(color);
    if (i < 0) return;
    if (!found.includes(color)) { found.push(color); store.write(day, 'found', found); }
    const el = document.querySelector(`[data-orb="${i}"]`);
    el.classList.add('found');
    el.querySelector('.orb-status').textContent = 'みつけた！';
    el.setAttribute('aria-label', `${names[i]}の光、みつけた！`);
    renderDiscovered(color);
    show('discovered');
  }
  $('btn-start').addEventListener('click', () => show('home'));
  $('home-qr-scan').addEventListener('click', () => show('scan'));
  $('scan-back').addEventListener('click', () => show('home'));
  $('scan-demo').addEventListener('click', () => discover('red'));
  document.querySelectorAll('[data-demo-color]').forEach(el => el.addEventListener('click', () => discover(el.dataset.demoColor)));
  document.querySelectorAll('[data-orb]').forEach((el, i) => el.addEventListener('click', () => {
    if (found.includes(colors[i])) discover(colors[i]);
    else openModal(`${names[i]}の光`, ['公園で光をさがそう！', 'この確認版では「光のQRをよみとる」のテストボタンから発見を試せるよ。']);
  }));
  $('found-home').addEventListener('click', () => show('home'));
  $('found-play').addEventListener('click', () => {
    if (activeLightColor === 'red') show('red-preview');
    else openModal('ミニゲームはこれから', ['青・黄・白のゲーム内容は、これから相談して決めます。', '今はクリアや提灯の点灯はありません。']);
  });

  function openPostHint() {
    $('hint-input').value = '';
    $('hint-count').textContent = '0 / 60';
    $('hint-submit').disabled = true;
    $('hint-error').textContent = '';
    const i = colors.indexOf(activeLightColor);
    $('hint-color-orb').style.setProperty('--hint-color', paint[i]);
    $('hint-color-name').textContent = `${names[i]}の光`;
    show('posthint');
  }
  function renderHintBook() {
    document.querySelectorAll('[data-hint-tab]').forEach(el => {
      const active = el.dataset.hintTab === hintTabColor;
      el.classList.toggle('active', active); el.setAttribute('aria-pressed', String(active));
    });
    const entries = demoHints.filter(x => x.color === hintTabColor).slice().reverse();
    const nodes = entries.map(entry => {
      const el = document.createElement('div'); el.className = 'hint-book-entry'; el.textContent = `✦ ${entry.text}`; return el;
    });
    if (!nodes.length) {
      const empty = document.createElement('div'); empty.className = 'hint-book-empty';
      empty.textContent = 'まだヒントがないよ。\n最初の発見者になれるかも！'; empty.style.whiteSpace = 'pre-line'; nodes.push(empty);
    }
    $('hintbook-list').replaceChildren(...nodes);
  }
  function openHintBook(from = 'home') {
    hintBookReturn = from; hintTabColor = from === 'hintsent' ? activeLightColor : 'red';
    renderHintBook(); show('hintbook');
  }
  $('found-hint').addEventListener('click', openPostHint);
  ['hint-back', 'hint-skip', 'hint-after-found'].forEach(id => $(id).addEventListener('click', () => show('discovered')));
  $('hint-input').addEventListener('input', () => {
    const length = textLength($('hint-input').value);
    $('hint-count').textContent = `${length} / 60`;
    $('hint-submit').disabled = textLength($('hint-input').value.trim()) < 2 || length > 60;
    $('hint-error').textContent = '';
  });
  $('hint-submit').addEventListener('click', () => {
    const value = $('hint-input').value.trim();
    if (textLength(value) < 2 || textLength(value) > 60) { $('hint-error').textContent = '2〜60文字でヒントを書いてね。'; return; }
    demoHints.push({ color: activeLightColor, text: value }); demoHints = demoHints.slice(-60);
    const saved = store.write(day, 'hints', demoHints);
    $('hint-written').textContent = `「${value}」`;
    $('hintsent').querySelector('.hint-demo-warning').textContent = saved ? '※ このヒントは今のスマホ内だけのテスト記録です。' : '※ 保存が使えないため、この画面を閉じると記録は消えます。';
    show('hintsent');
  });
  $('hint-openbook').addEventListener('click', () => openHintBook('hintsent'));
  $('home-hintbook').addEventListener('click', () => openHintBook());
  document.querySelectorAll('[data-hint-tab]').forEach(el => el.addEventListener('click', () => { hintTabColor = el.dataset.hintTab; renderHintBook(); }));
  $('hintbook-back').addEventListener('click', () => show(hintBookReturn));
  $('hint-day').addEventListener('change', () => {
    day = Number($('hint-day').value) === 2 ? 2 : 1;
    loadDay(); hintBookReturn = 'home'; renderHintBook();
    const url = new URL(location.href); url.searchParams.set('day', String(day)); history.replaceState(routeState(), '', url);
  });

  function openHowTo() {
    howtoFrom = document.querySelector('.screen.active').id === 'home' ? 'home' : 'welcome';
    show('howtopage'); document.querySelector('#howtopage .howto-scroll').scrollTop = 0;
    $('howto-finish').textContent = howtoFrom === 'welcome' ? 'ぼうけんをはじめる！ ›' : 'ホームにもどる ›';
  }
  document.querySelectorAll('[data-open-howto]').forEach(el => el.addEventListener('click', openHowTo));
  $('howto-back').addEventListener('click', () => show(howtoFrom));
  $('howto-finish').addEventListener('click', () => show('home'));

  function renderShops() {
    const nodes = [...shopEntries].reverse().map((post, reverseIndex) => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'shop-card';
      button.setAttribute('aria-label', `${post.name} のおすすめを見る`);
      const stamp = document.createElement('span'); stamp.className = 'shop-card-icon'; stamp.textContent = post.stamp;
      const copy = document.createElement('span'); copy.className = 'shop-card-copy';
      const name = document.createElement('span'); name.className = 'shop-card-name'; name.textContent = post.name;
      const comment = document.createElement('span'); comment.className = 'shop-card-text'; comment.textContent = post.comment;
      const chevron = document.createElement('span'); chevron.className = 'shop-card-chevron'; chevron.textContent = '›'; chevron.setAttribute('aria-hidden', 'true');
      copy.append(name, comment); button.append(stamp, copy, chevron);
      button.addEventListener('click', () => openShopDetail(shopEntries.length - 1 - reverseIndex)); return button;
    });
    if (!nodes.length) {
      const empty = document.createElement('div'); empty.className = 'shop-empty';
      empty.textContent = '🏮 まだおすすめがないよ。\n最初のおすすめをのこしてみよう！'; empty.style.whiteSpace = 'pre-line'; nodes.push(empty);
    }
    $('shop-list').replaceChildren(...nodes);
  }
  function openShops(justSent = false) {
    renderShops(); show('shops'); $('shops-scroll').scrollTop = 0; $('shop-toast').classList.toggle('visible', justSent);
  }
  function updateShopSubmit() {
    const name = $('shop-name').value.trim(), comment = $('shop-comment').value.trim();
    $('shop-charcount').textContent = `${textLength($('shop-comment').value)} / 60`;
    $('shop-submit').disabled = !name || !comment || textLength(name) > 30 || textLength(comment) > 60 || !document.querySelector('[name="shop-stamp"]:checked');
    $('shop-error').textContent = '';
  }
  function openShopCompose() {
    $('shop-name').value = ''; $('shop-comment').value = '';
    document.querySelector('[name="shop-stamp"][value="✨"]').checked = true;
    updateShopSubmit(); show('shopcompose'); $('shopcompose-scroll').scrollTop = 0;
  }
  function openShopDetail(index) {
    const post = shopEntries[index]; if (!post) return;
    $('shop-detail-stamp').textContent = post.stamp;
    $('shop-detail-name').textContent = post.name;
    $('shop-detail-comment').textContent = post.comment; show('shopdetail');
  }
  $('home-shops').addEventListener('click', () => openShops());
  ['shops-back', 'shops-home'].forEach(id => $(id).addEventListener('click', () => show('home')));
  $('shop-open-compose').addEventListener('click', openShopCompose);
  ['shopcompose-back', 'shop-compose-cancel', 'shopdetail-back', 'shopdetail-back-bottom'].forEach(id => $(id).addEventListener('click', () => openShops()));
  ['shop-name', 'shop-comment'].forEach(id => $(id).addEventListener('input', updateShopSubmit));
  document.querySelectorAll('[name="shop-stamp"]').forEach(el => el.addEventListener('change', updateShopSubmit));
  $('shop-submit').addEventListener('click', () => {
    updateShopSubmit(); if ($('shop-submit').disabled) return;
    const name = $('shop-name').value.trim().replace(/\s+/g, ' '), comment = $('shop-comment').value.trim();
    const stamp = document.querySelector('[name="shop-stamp"]:checked').value;
    shopEntries.push({ name, stamp, comment }); shopEntries = shopEntries.slice(-25);
    const saved = store.write(day, 'shops', shopEntries);
    $('shop-toast').textContent = saved ? '✨ おすすめをのこしたよ！（このスマホ内だけ）' : '✨ おすすめをのこしたよ！（画面を閉じると消えます）';
    openShops(true);
  });

  // Game controls live in red-game.js; the app keeps its existing routes and shared BGM.
  $('red-preview-back').addEventListener('click', () => {
    if (found.includes('red')) discover('red'); else show('home');
  });

  function restoreRoute(historyMode = 'none') {
    const hash = location.hash.slice(1), id = routes[hash] || hash;
    const state = history.state || {};
    activeLightColor = colors.includes(state.light) ? state.light : 'red';
    hintTabColor = colors.includes(state.hintTabColor) ? state.hintTabColor : 'red';
    hintBookReturn = state.hintBookReturn === 'hintsent' && $('hint-written').textContent ? 'hintsent' : 'home';
    howtoFrom = state.howtoFrom === 'home' ? 'home' : 'welcome';
    const requestedDay = new URLSearchParams(location.search).get('day') === '2' ? 2 : 1;
    if (requestedDay !== day) { day = requestedDay; loadDay(); }
    // Visiting a URL/history entry renders the view without recording a new discovery.
    if (id === 'discovered' || id === 'posthint') renderDiscovered(activeLightColor);
    if (id === 'posthint') { openPostHint(); return; }
    if (id === 'hintbook') renderHintBook();
    if (id === 'shops') renderShops();
    if (id === 'shopcompose') { openShopCompose(); return; }
    // A detail/result route without its in-memory context returns to the relevant list.
    show(id === 'shopdetail' ? 'shops' : id === 'hintsent' ? 'hintbook' : id || 'welcome', { historyMode });
    if (id === 'shopdetail') renderShops();
    if (id === 'hintsent') renderHintBook();
  }
  window.addEventListener('popstate', () => restoreRoute());
  loadDay();
  if (location.hash) restoreRoute('replace');
  else {
    show('loading', { historyMode: 'none', focus: false });
    const minimum = new Promise(resolve => setTimeout(resolve, 2300));
    const artwork = Promise.allSettled([...document.querySelectorAll('#welcome img')].map(img => img.decode()));
    Promise.all([minimum, Promise.race([artwork, new Promise(resolve => setTimeout(resolve, 6000))])]).then(() => {
      if ($('loading').classList.contains('active')) show('welcome', { historyMode: 'replace' });
    });
  }
})();
