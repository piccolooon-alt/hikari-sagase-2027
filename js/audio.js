/* Shared music control. Add each future game's approved file to this table. */
(() => {
  'use strict';
  const TRACKS = Object.freeze({
    common: Object.freeze({ src: 'assets/audio/four_lights_of_suzuran.mp3', label: 'すずらんの冒険BGM' }),
    red: Object.freeze({ src: 'assets/audio/summer_yoyo_matsuri.mp3', label: '水風船ヨーヨーよけのBGM' }),
    white: null,
    yellow: null,
    blue: null
  });
  const player = document.getElementById('suzuran-bgm');
  const button = document.getElementById('bgm-toggle');
  const store = window.HikariDemoStore;
  const positions = new Map();
  let selected = 'common', muted = store.getMuted(), interacted = false, pendingSeek = null;
  player.volume = .27;
  player.dataset.track = selected;

  function updateControl() {
    const playing = !player.paused && !player.ended;
    button.textContent = playing ? '♫' : '♪';
    button.setAttribute('aria-label', playing ? 'BGMを止める' : 'BGMを再生する');
    button.setAttribute('aria-pressed', String(playing));
    button.title = player.error ? 'BGMを読み込めませんでした。もう一度試してね。' : playing ? '音楽 ON' : '音楽 OFF';
  }
  function play() {
    if (muted || !interacted || !player.paused) return;
    player.play().then(updateControl).catch(updateControl);
  }
  function selectScene(scene) {
    const key = TRACKS[scene] ? scene : 'common';
    if (selected === key) return;
    if (Number.isFinite(player.currentTime)) positions.set(selected, player.currentTime);
    player.pause();
    selected = key;
    const track = TRACKS[key];
    pendingSeek = { src: new URL(track.src, document.baseURI).href, time: positions.get(key) || 0 };
    player.src = track.src;
    player.dataset.track = key;
    player.setAttribute('aria-label', track.label);
    player.load();
    // Called inside the navigation gesture too, so mobile playback stays authorized.
    play();
    updateControl();
  }
  player.addEventListener('loadedmetadata', () => {
    if (!pendingSeek || player.currentSrc !== pendingSeek.src) return;
    const position = pendingSeek;
    pendingSeek = null;
    if (position.time > 0 && Number.isFinite(player.duration) && player.duration > 0) {
      try { player.currentTime = position.time % player.duration; } catch (_) { /* A streaming browser may not allow seeking yet. */ }
    }
  });
  document.addEventListener('click', event => {
    if (document.getElementById('loading').classList.contains('active')) return;
    interacted = true;
    if (!event.target.closest('#bgm-toggle')) play();
  }, true);
  button.addEventListener('click', () => {
    interacted = true;
    muted = !player.paused;
    if (muted) player.pause(); else play();
    store.setMuted(muted);
    updateControl();
  });
  ['play', 'pause', 'error'].forEach(event => player.addEventListener(event, updateControl));
  window.HikariAudio = Object.freeze({ selectScene, tracks: TRACKS });
  updateControl();
})();
