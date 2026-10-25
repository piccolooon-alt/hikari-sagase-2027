/* Pure, offline blue stall-game rules; no storage, location, requests or tracking. */
(function(root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HikariBlueModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const ITEMS = Object.freeze([
    Object.freeze({ id: 'ice', label: 'かき氷', emoji: '🍧' }),
    Object.freeze({ id: 'apple', label: 'りんご飴', emoji: '🍎' }),
    Object.freeze({ id: 'banana', label: 'チョコバナナ', emoji: '🍌' }),
    Object.freeze({ id: 'candy', label: 'わたあめ', emoji: '☁️' })
  ]);
  const RULES = Object.freeze({
    1: Object.freeze({ duration: 30, lives: 3, goal: 6, perOrder: 1 }),
    2: Object.freeze({ duration: 30, lives: 3, goal: 4, perOrder: 2 })
  });
  function createGame({ random = Math.random } = {}) {
    const state = {
      day: 1, status: 'ready', elapsed: 0, remaining: RULES[1].duration,
      lives: RULES[1].lives, completed: 0, order: [], selected: [],
      interlude: 0, feedbackTime: 0, feedback: '', feedbackKind: ''
    };
    let previousOrder = '';
    const options = ITEMS.map(item => item.id);
    function choose() {
      const count = RULES[state.day].perOrder;
      let result = [];
      for (let attempt = 0; attempt < 8; attempt++) {
        const pool = options.slice();
        result = [];
        for (let i = 0; i < count; i++) {
          const index = Math.max(0, Math.min(pool.length - 1, Math.floor(random() * pool.length)));
          result.push(pool.splice(index, 1)[0]);
        }
        if (result.join(',') !== previousOrder) break;
      }
      previousOrder = result.join(',');
      state.order = result;
      state.selected = [];
    }
    function reset() {
      const rules = RULES[state.day];
      state.status = 'ready'; state.elapsed = 0; state.remaining = rules.duration;
      state.lives = rules.lives; state.completed = 0;
      state.order = []; state.selected = []; state.interlude = 0;
      state.feedback = ''; state.feedbackKind = ''; state.feedbackTime = 0;
      previousOrder = '';
      return state;
    }
    function setDay(day) {
      const next = day === 2 ? 2 : 1;
      if (state.day !== next) { state.day = next; reset(); }
      return state;
    }
    function start() { reset(); choose(); state.status = 'playing'; return state; }
    function pause() { if (state.status === 'playing') state.status = 'paused'; return state; }
    function resume() { if (state.status === 'paused') state.status = 'playing'; return state; }
    function chooseItem(id) {
      if (state.status !== 'playing' || state.interlude > 0 || !options.includes(id)) return state;
      const expected = state.order[state.selected.length];
      if (id !== expected) {
        state.lives--;
        state.selected = [];
        state.feedback = 'おしい！ もういちど注文を見てね'; state.feedbackKind = 'wrong';
        state.feedbackTime = .8;
        if (state.lives <= 0) { state.status = 'lost'; state.feedback = 'また挑戦してね！'; }
        return state;
      }
      state.selected.push(id);
      state.feedback = 'そのちょうし！ ✨'; state.feedbackKind = 'right'; state.feedbackTime = .55;
      if (state.selected.length >= state.order.length) {
        state.completed++;
        state.feedback = 'おまたせしました！ ✨'; state.feedbackKind = 'served'; state.feedbackTime = .75;
        if (state.completed >= RULES[state.day].goal) {
          state.status = 'won'; state.interlude = 0; return state;
        }
        state.interlude = .7;
      }
      return state;
    }
    function step(seconds) {
      if (state.status !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return state;
      const elapsed = Math.min(seconds, .1, state.remaining);
      state.elapsed += elapsed;
      state.remaining = Math.max(0, RULES[state.day].duration - state.elapsed);
      state.feedbackTime = Math.max(0, state.feedbackTime - elapsed);
      if (state.interlude > 0) {
        state.interlude = Math.max(0, state.interlude - elapsed);
        if (state.interlude === 0) choose();
      }
      if (state.remaining <= 1e-9) {
        state.remaining = 0; state.status = 'lost'; state.feedback = 'じかんぎれ！ もういちど遊ぼう';
      }
      return state;
    }
    return { state, start, setDay, pause, resume, chooseItem, step };
  }
  return Object.freeze({ ITEMS, RULES, createGame });
});
