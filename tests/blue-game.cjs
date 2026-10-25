/* Offline tests for hands-on recipes, multiple customers and two festival days. */
const assert = require('node:assert/strict');
const { createGame, ITEMS, CUSTOMERS, ACTIONS, RECIPES, RULES } = require('../js/blue-game-model.js');
let passed = 0;
function run(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function advance(game, seconds) {
  let remaining = seconds;
  while (remaining > 0) { const d = Math.min(.05, remaining); game.step(d); remaining -= d; }
}
function seeded(seed) {
  let x=seed>>>0;
  return () => {x=(Math.imul(x,1664525)+1013904223)>>>0;return x/4294967296;};
}
function makeFood(game) {
  const id=game.currentItem();
  assert.ok(id);
  for(const action of RECIPES[id]) {
    assert.equal(game.expectedAction(),action);
    assert.equal(game.state.choices.length,4);
    assert.equal(new Set(game.state.choices).size,4);
    assert.ok(game.state.choices.includes(action));
    game.chooseItem(action);
  }
}
run('the four foods and five different festival customers are defined',()=>{
  assert.deepEqual(ITEMS.map(i=>i.label),['かき氷','りんご飴','チョコバナナ','わたあめ']);
  assert.equal(CUSTOMERS.length,5);
  assert.ok(CUSTOMERS.some(i=>i.label==='中学生の女の子'));
  assert.equal(RULES[1].perOrder,1);assert.equal(RULES[2].perOrder,2);
  assert.ok(ACTIONS.some(x=>x.id==='serve'));
});
run('shaved ice is assembled in bowl, ice, syrup, spoon and serving order',()=>{
  assert.deepEqual(RECIPES.ice,['bowl','ice','syrup','spoon','serve']);
  for(const item of ITEMS) assert.equal(RECIPES[item.id].at(-1),'serve');
});
run('three customers can be served on day one',()=>{
  const g=createGame({random:seeded(19)});g.start();
  for(let round=0;round<RULES[1].goal;round++){
    assert.equal(g.state.order.length,1);
    makeFood(g);
    if(round<RULES[1].goal-1)advance(g,.7);
  }
  assert.equal(g.state.status,'won');assert.equal(g.state.completed,RULES[1].goal);
});
run('two distinct food orders each for two customers on day two',()=>{
  const g=createGame({random:seeded(11)});g.setDay(2);g.start();
  for(let round=0;round<RULES[2].goal;round++){
    assert.equal(g.state.order.length,2);
    assert.notEqual(g.state.order[0],g.state.order[1]);
    makeFood(g);assert.equal(g.state.selected.length,1);
    makeFood(g);
    if(round<RULES[2].goal-1)advance(g,.7);
  }
  assert.equal(g.state.status,'won');assert.equal(g.state.completed,RULES[2].goal);
});
run('different customers arrive in successive rounds',()=>{
  const g=createGame({random:()=>0});g.start();
  const first=g.state.customer.id;makeFood(g);advance(g,.7);
  assert.notEqual(first,g.state.customer.id);
  assert.equal(g.state.customer.label,'男の子');
});
run('wrong ingredient costs a life without restarting the already assembled item',()=>{
  const g=createGame({random:seeded(5)});g.start();
  const wrong=g.state.choices.find(x=>x!==g.expectedAction());
  g.chooseItem(wrong);
  assert.equal(g.state.lives,2);assert.equal(g.state.stage,0);
  g.chooseItem(g.expectedAction());assert.equal(g.state.stage,1);
  const wrong2=g.state.choices.find(x=>x!==g.expectedAction());
  g.chooseItem(wrong2);assert.equal(g.state.stage,1);assert.equal(g.state.lives,1);
  g.chooseItem(wrong2);assert.equal(g.state.status,'lost');
});
run('pause prevents time moving and game can resume',()=>{
  const g=createGame({random:seeded(7)});g.start();
  g.chooseItem(g.expectedAction());const stage=g.state.stage,remaining=g.state.remaining;
  g.pause();advance(g,10);
  assert.equal(g.state.remaining,remaining);assert.equal(g.state.stage,stage);
  g.resume();advance(g,.5);
  assert.ok(g.state.remaining<remaining);
});
run('timeout and restart reset orders, progress, lives and stage',()=>{
  const g=createGame({random:seeded(4)});g.setDay(2);g.start();
  advance(g,RULES[2].duration);
  assert.equal(g.state.status,'lost');assert.equal(g.state.remaining,0);
  g.start();assert.equal(g.state.status,'playing');
  assert.equal(g.state.remaining,RULES[2].duration);
  assert.equal(g.state.stage,0);assert.equal(g.state.completed,0);
  assert.equal(g.state.lives,3);assert.equal(g.state.order.length,2);
});
run('interlude prevents double delivery',()=>{
  const g=createGame({random:seeded(8)});g.start();
  makeFood(g);const count=g.state.completed;
  g.chooseItem('serve');assert.equal(g.state.completed,count);
  assert.equal(g.state.lives,3);
});
console.log(passed + ' blue-recipe scenarios passed.');
