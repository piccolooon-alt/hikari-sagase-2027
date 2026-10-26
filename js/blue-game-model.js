/* Blue stall: recipes and rules from the approved standalone trial. No shared storage. */
(function(root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HikariBlueModel = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function() {
  'use strict';
  const ITEMS = Object.freeze([
    { id: 'cotton', label: 'わたあめ', emoji: '☁️' },
    { id: 'ice', label: 'いちごのかき氷', emoji: '🍧' },
    { id: 'yakisoba', label: 'やきそば', emoji: '🥡' },
    { id: 'frank', label: 'フランクフルト', emoji: '🌭' },
    { id: 'potato', label: 'トルネードポテト', emoji: '🥔' }
  ].map(Object.freeze));
  const ASSET_ROOT = 'assets/blue-game/';
  const CUSTOMERS = Object.freeze([
    { id: 'girl', label: '赤い浴衣の女の子', image: ASSET_ROOT + 'girl.webp' },
    { id: 'boy', label: '黒い甚平の男の子', image: ASSET_ROOT + 'boy.webp' },
    { id: 'gyaru', label: 'コギャルな女子中学生', image: ASSET_ROOT + 'gyaru.webp' },
    { id: 'teen', label: '大人しめな男子中学生', image: ASSET_ROOT + 'teen.webp' }
  ].map(Object.freeze));
  const STEPS = {
    cotton: [['stick', '棒'], ['sugar', 'ザラメ'], ['spin', 'くるくる回す'], ['finish', 'ふわふわ完成']],
    ice: [['bowl', '器'], ['shaved', 'ふわふわの氷'], ['syrup', 'いちごシロップ'], ['spoon', 'スプーン']],
    yakisoba: [['noodles', 'めん'], ['cabbage', 'キャベツ'], ['pan', 'ソースで焼く'], ['tray', '皿に盛り付け'], ['topping', 'トッピング']],
    frank: [['stick', '棒'], ['sausage', 'ウインナー'], ['grill', 'こんがり焼く'], ['ketchup', 'ケチャップ']],
    potato: [['stick', '棒'], ['potato', 'じゃがいも'], ['fry', 'カラッと揚げる'], ['salt', 'お塩をふる']]
  };
  const imageFor = (food, step) => ASSET_ROOT + food + '_' + step + '.webp';
  const ACTIONS = Object.freeze(Object.entries(STEPS).flatMap(([food, steps]) =>
    steps.map(([step, label]) => Object.freeze({ id: food + '/' + step, label, image: imageFor(food, step) }))
  ).concat(Object.freeze({ id: 'serve', label: 'おわたし' })));
  const RECIPES = Object.freeze(Object.fromEntries(Object.entries(STEPS).map(([food, steps]) =>
    [food, Object.freeze(steps.map(([step]) => food + '/' + step).concat('serve'))]
  )));
  const RULES = Object.freeze({
    1: Object.freeze({ duration: 65, lives: 3, goal: 3, perOrder: 1 }),
    2: Object.freeze({ duration: 95, lives: 3, goal: 2, perOrder: 2 })
  });
  const find = (array, id) => array.find(entry => entry.id === id);
  function workImage(food, stage) {
    if (!RECIPES[food] || stage <= 0) return null;
    if (stage >= RECIPES[food].length - 1) return imageFor(food, 'finish');
    return find(ACTIONS, RECIPES[food][stage - 1]).image;
  }
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
      const correctLabel = find(ACTIONS, correct).label;
      // A repeated label such as 棒 must never appear as both a right and a wrong answer.
      const others = [...new Map(ACTIONS.filter(action => action.id !== 'serve' &&
        action.label !== correctLabel).map(action => [action.label, action.id])).values()];
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
      const delta = Math.min(seconds, state.remaining);
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
  return Object.freeze({ ITEMS, CUSTOMERS, ACTIONS, RECIPES, RULES, ASSET_ROOT, imageFor, workImage, createGame });
});
