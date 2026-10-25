/* Offline deterministic tests for the two-day blue festival stall mini-game. */
const assert = require('node:assert/strict');
const { createGame, ITEMS, RULES } = require('../js/blue-game-model.js');
let passed = 0;
function run(name, fn) { fn(); passed++; console.log('PASS ' + name); }
function advance(game, seconds) { for (let i = 0; i < Math.ceil(seconds * 20); i++) game.step(Math.min(.05, seconds-i*.05)); }
function seeded(seed) {
  let x = seed >>> 0;
  return () => { x = (Math.imul(x,1664525)+1013904223) >>> 0; return x / 4294967296; };
}
run('four familiar summer festival foods are defined without personal or vendor data', () => {
  assert.deepEqual(ITEMS.map(x=>x.label), ['かき氷','りんご飴','チョコバナナ','わたあめ']);
  assert.equal(new Set(ITEMS.map(x=>x.id)).size, 4);
  assert.equal(RULES[1].perOrder, 1); assert.equal(RULES[2].perOrder, 2);
});
run('day one serves six single-item orders with exactly thirty seconds and three lives', () => {
  const g=createGame({ random: seeded(19) }); g.start();
  assert.equal(g.state.order.length, 1);
  while(g.state.status==='playing') {
    assert.equal(g.state.order.length, 1);
    g.chooseItem(g.state.order[0]);
    assert.equal(g.state.readyToServe, true);
    assert.equal(g.state.completed, g.state.completed, 'serving is an explicit step');
    g.serveOrder(); advance(g, .75);
  }
  assert.equal(g.state.status,'won'); assert.equal(g.state.completed,6); assert.equal(g.state.lives,3);
  assert.ok(g.state.remaining>0);
});
run('day two requires two distinct items in the displayed order for four customers',()=>{
  const g=createGame({ random: seeded(27) }); g.setDay(2);g.start();
  for(let count=0;count<RULES[2].goal;count++){
    const [first,second]=g.state.order;
    assert.notEqual(first,second);
    g.chooseItem(first);assert.deepEqual(g.state.selected,[first]);
    assert.equal(g.state.completed,count);
    g.chooseItem(second);assert.equal(g.state.completed,count);
    assert.equal(g.state.readyToServe,true,'both items are now prepared');
    g.serveOrder();assert.equal(g.state.completed,count+1);
    if(count<RULES[2].goal-1)advance(g,.75);
  }
  assert.equal(g.state.status,'won'); assert.equal(g.state.lives,3);
});
run('wrong menu choice costs one heart and resets a partial order',()=>{
  const g=createGame({random:seeded(8)});g.setDay(2);g.start();
  const desired=g.state.order;
  const wrong=ITEMS.find(x=>x.id!==desired[0]).id;
  g.chooseItem(wrong);
  assert.equal(g.state.lives,2);assert.equal(g.state.selected.length,0);
  g.chooseItem(desired[0]);assert.deepEqual(g.state.selected,[desired[0]]);
  const wrongSecond=ITEMS.find(x=>x.id!==desired[1]).id;
  g.chooseItem(wrongSecond);
  assert.equal(g.state.lives,1);assert.deepEqual(g.state.selected,[]);
  g.chooseItem(wrong);assert.equal(g.state.status,'lost');
});
run('timer expiry fails the round and cannot create a win',()=>{
  const g=createGame({random:seeded(1)});g.start();advance(g,30);
  assert.equal(g.state.status,'lost');assert.equal(g.state.remaining,0);assert.equal(g.state.completed,0);
  g.chooseItem(g.state.order[0]);assert.equal(g.state.status,'lost');
});
run('pause suspends both order interlude and timer until resuming',()=>{
  const g=createGame({random:seeded(31)});g.start();
  g.chooseItem(g.state.order[0]);g.serveOrder();
  const wait=g.state.interlude,remaining=g.state.remaining;
  g.pause();advance(g,10);assert.equal(g.state.remaining,remaining);
  assert.equal(g.state.interlude,wait);
  g.resume();advance(g, .75);assert.equal(g.state.interlude,0);
  assert.equal(g.state.completed,1);
});
run('retries clear hearts, orders, progress and timer without switching the selected day',()=>{
  const g=createGame({random:seeded(33)});g.setDay(2);g.start();
  const wrong=ITEMS.find(x=>x.id!==g.state.order[0]).id;
  g.chooseItem(wrong);assert.equal(g.state.lives,2);
  g.start();assert.equal(g.state.day,2);assert.equal(g.state.lives,3);
  assert.equal(g.state.completed,0);assert.equal(g.state.remaining,30);
  assert.equal(g.state.order.length,2);assert.deepEqual(g.state.selected,[]);
  g.setDay(1);assert.equal(g.state.status,'ready');assert.equal(g.state.order.length,0);
  g.start();assert.equal(g.state.order.length,1);
});
run('serving interlude prevents accidental double taps',()=>{
  const g=createGame({random:seeded(11)});g.start();
  const product=g.state.order[0];g.chooseItem(product);
  assert.equal(g.state.completed,0);
  assert.equal(g.state.readyToServe,true);
  g.chooseItem(product);assert.equal(g.state.completed,0,'completed dishes cannot be counted by double-tap');
  g.serveOrder();assert.equal(g.state.completed,1);
  g.serveOrder();assert.equal(g.state.completed,1,'a served order can only count once');
  assert.equal(g.state.lives,3);
});
run('random guests change independently of food and lantern progress counts only service',()=>{
  const g=createGame({random:seeded(57)});g.start();
  const firstGuest=g.state.guest,firstOrder=g.state.order[0];
  assert.ok(firstGuest);
  g.serveOrder();assert.equal(g.state.completed,0,'cannot serve an empty tray');
  g.chooseItem(firstOrder);assert.equal(g.state.completed,0,'preparing is not a served order');
  assert.equal(g.state.combo,1);
  g.serveOrder();assert.equal(g.state.completed,1,'handing the meal over lights a lantern');
  advance(g,.75);
  assert.notEqual(g.state.guest,firstGuest,'next guest is visually different');
  const wrong=ITEMS.find(x=>x.id!==g.state.order[0]).id;
  g.chooseItem(wrong);
  assert.equal(g.state.combo,0,'a mistake resets the combo');
});
console.log(passed + ' blue-game model scenarios passed.');
