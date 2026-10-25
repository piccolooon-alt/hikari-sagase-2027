/* Blue stall: children make the food and hand it to one of five random customers. */
(function(root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HikariBlueModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const ITEMS = Object.freeze([
    { id: 'ice', label: 'かき氷', emoji: '🍧' },
    { id: 'apple', label: 'りんご飴', emoji: '🍎' },
    { id: 'banana', label: 'チョコバナナ', emoji: '🍌' },
    { id: 'candy', label: 'わたあめ', emoji: '☁️' }
  ].map(Object.freeze));
  // Illustrations will be chosen later; these are temporary customer avatars.
  const CUSTOMERS = Object.freeze([
    { id: 'girl', label: '女の子', emoji: '👧' },
    { id: 'boy', label: '男の子', emoji: '👦' },
    { id: 'teen-girl', label: '中学生の女の子', emoji: '👩' },
    { id: 'teen-boy', label: '中学生の男の子', emoji: '🧑' },
    { id: 'grandma', label: 'おばあさん', emoji: '👵' }
  ].map(Object.freeze));
  const ACTIONS = Object.freeze([
    { id: 'bowl', label: 'うつわ', emoji: '🥣' },
    { id: 'ice', label: 'ふわふわの氷', emoji: '🧊' },
    { id: 'syrup', label: 'シロップ', emoji: '🍓' },
    { id: 'spoon', label: 'スプーン', emoji: '🥄' },
    { id: 'apple', label: 'りんご', emoji: '🍎' },
    { id: 'banana', label: 'バナナ', emoji: '🍌' },
    { id: 'stick', label: 'ぼう', emoji: '🥢' },
    { id: 'coating', label: 'あめをつける', emoji: '🍯' },
    { id: 'chocolate', label: 'チョコをかける', emoji: '🍫' },
    { id: 'sprinkles', label: 'トッピング', emoji: '✨' },
    { id: 'sugar', label: 'ザラメ', emoji: '🍬' },
    { id: 'spin', label: 'くるくるまわす', emoji: '🌀' },
    { id: 'wrap', label: 'つつむ', emoji: '🎀' },
    { id: 'serve', label: 'おわたし', emoji: '🙌' }
  ].map(Object.freeze));
  const RECIPES = Object.freeze({
    ice: Object.freeze(['bowl', 'ice', 'syrup', 'spoon', 'serve']),
    apple: Object.freeze(['apple', 'stick', 'coating', 'wrap', 'serve']),
    banana: Object.freeze(['banana', 'stick', 'chocolate', 'sprinkles', 'serve']),
    candy: Object.freeze(['stick', 'sugar', 'spin', 'wrap', 'serve'])
  });
  const RULES = Object.freeze({
    1: Object.freeze({ duration: 45, lives: 3, goal: 3, perOrder: 1 }),
    2: Object.freeze({ duration: 65, lives: 3, goal: 2, perOrder: 2 })
  });
  const find = (array, id) => array.find(entry => entry.id === id);
  const pick = (random, length) => Math.max(0, Math.min(length - 1, Math.floor(random() * length)));
  function createGame({ random = Math.random } = {}) {
    const state = {
      day: 1, status: 'ready', elapsed: 0, remaining: RULES[1].duration,
      lives: 3, completed: 0, order: [], selected: [], customer: null,
      stage: 0, choices: [], interlude: 0, feedbackTime: 0,
      feedback: '', feedbackKind: ''
    };
    let lastCustomer = '', lastOrder = '';
    function currentItem() { return state.order[state.selected.length] || null; }
    function expectedAction() {
      const item = currentItem();
      return item ? RECIPES[item][state.stage] : null;
    }
    function chooseChoices() {
      const correct = expectedAction();
      if (!correct) { state.choices = []; return; }
      // Three plausible distractions, never duplicates, with the correct action in a changing position.
      const others = ACTIONS.map(action => action.id).filter(id => id !== correct && id !== 'serve');
      const picks = [];
      while (picks.length < 3) {
        const index = pick(random, others.length);
        picks.push(others.splice(index, 1)[0]);
      }
      picks.splice(pick(random, 4), 0, correct);
      state.choices = picks;
    }
    function newCustomer() {
      const available = CUSTOMERS.filter(person => person.id !== lastCustomer);
      state.customer = available[pick(random, available.length)];
      lastCustomer = state.customer.id;
      const options = ITEMS.map(item => item.id);
      let next = [];
      for (let attempt = 0; attempt < 6; attempt++) {
        const pool = options.slice();
        next = [];
        for (let i = 0; i < RULES[state.day].perOrder; i++) {
          next.push(pool.splice(pick(random, pool.length), 1)[0]);
        }
        if (next.join('|') !== lastOrder) break;
      }
      lastOrder = next.join('|');
      state.order = next;
      state.selected = [];
      state.stage = 0;
      chooseChoices();
    }
    function reset() {
      const rules = RULES[state.day];
      state.status = 'ready'; state.elapsed = 0; state.remaining = rules.duration;
      state.lives = rules.lives; state.completed = 0; state.order = [];
      state.selected = []; state.customer = null; state.stage = 0;
      state.choices = []; state.interlude = 0; state.feedbackTime = 0;
      state.feedback = ''; state.feedbackKind = '';
      lastCustomer = ''; lastOrder = '';
      return state;
    }
    function setDay(day) {
      const next = day === 2 ? 2 : 1;
      if (state.day !== next) { state.day = next; reset(); }
      return state;
    }
    function start() { reset(); newCustomer(); state.status = 'playing'; return state; }
    function pause() { if (state.status === 'playing') state.status = 'paused'; return state; }
    function resume() { if (state.status === 'paused') state.status = 'playing'; return state; }
    function chooseItem(actionId) {
      if (state.status !== 'playing' || state.interlude > 0 || !state.choices.includes(actionId)) return state;
      if (actionId !== expectedAction()) {
        state.lives -= 1;
        state.feedback = 'おしい！ つぎに使うものをえらぼう';
        state.feedbackKind = 'wrong'; state.feedbackTime = 1;
        if (state.lives <= 0) { state.status = 'lost'; state.feedback = 'また挑戦してね！'; }
        return state;
      }
      const finished = actionId === 'serve';
      state.feedback = finished ? 'はい、どうぞ！ ✨' : 'できてきたよ！ ✨';
      state.feedbackKind = finished ? 'served' : 'right';
      state.feedbackTime = .85;
      if (finished) {
        state.selected.push(currentItem());
        state.stage = 0;
        if (state.selected.length >= state.order.length) {
          state.completed += 1;
          if (state.completed >= RULES[state.day].goal) {
            state.status = 'won'; state.choices = []; return state;
          }
          state.interlude = .65;
          state.choices = [];
          return state;
        }
      } else {
        state.stage += 1;
      }
      chooseChoices();
      return state;
    }
    function step(seconds) {
      if (state.status !== 'playing' || !Number.isFinite(seconds) || seconds <= 0) return state;
      const delta = Math.min(.1, seconds, state.remaining);
      state.elapsed += delta;
      state.remaining = Math.max(0, RULES[state.day].duration - state.elapsed);
      state.feedbackTime = Math.max(0, state.feedbackTime - delta);
      if (state.interlude > 0) {
        state.interlude = Math.max(0, state.interlude - delta);
        if (state.interlude === 0) newCustomer();
      }
      if (state.remaining <= 1e-8) {
        state.remaining = 0; state.status = 'lost';
        state.feedback = 'じかんぎれ！ またあそぼう';
      }
      return state;
    }
    return { state, start, setDay, pause, resume, chooseItem, step, currentItem, expectedAction };
  }
  return Object.freeze({ ITEMS, CUSTOMERS, ACTIONS, RECIPES, RULES, createGame });
});
