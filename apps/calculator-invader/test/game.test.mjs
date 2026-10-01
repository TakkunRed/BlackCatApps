if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}

const { InvaderGame, MAX_LANES } = await import('../js/game.js');

function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
}

// AIM cycling: 0..9,n,0..
{
  const g = new InvaderGame(() => {});
  g.start();
  assert(g.aimValue === '0', 'aim starts at 0');
  for (let i = 0; i < 10; i++) g.aim();
  assert(g.aimValue === 'n', 'aim reaches n after 10 presses');
  g.aim();
  assert(g.aimValue === '0', 'aim wraps back to 0');
  g.quit();
}

// 複数レーンに同時に敵が並ぶ(数字が並んで攻めてくる)
{
  const g = new InvaderGame(() => {});
  g.start();
  for (let i = 0; i < g.laneCount; i++) g._tick();
  const occupied = g.field.slice(0, g.laneCount).filter((v) => v !== null).length;
  assert(occupied >= 2, `multiple lanes occupied simultaneously (got ${occupied})`);
  g.quit();
}

// 新しい敵はレーンの一番遠い位置(laneCount-1)に出現する
{
  const g = new InvaderGame(() => {});
  g.start();
  g._tick();
  assert(g.field[g.laneCount - 1] !== null, 'a new invader spawns at the farthest lane after a tick');
  assert(g.field[0] === null, 'the nearest lane is still empty right after the first tick');
  g.quit();
}

// 命中: 狙った数字と同じレーンの敵を倒し、距離に応じた得点が入る(遠いほど高得点)
{
  const g = new InvaderGame(() => {});
  g.start();
  g.field[5] = { value: '7', isUFO: false }; // stage1 最遠レーン(index5) = 60点
  while (g.aimValue !== '7') g.aim();
  const before = g.totalScore;
  g.fire();
  assert(g.totalScore === before + 60, `farthest lane kill scores 60 (got +${g.totalScore - before})`);
  assert(g.field[5] === null, 'destroyed invader is removed from its lane');
  g.quit();
}

// 倒すと、それより自陣に近い敵は1つずつ後退して隙間を詰める(空き枠は自陣側=0番目にできる)
{
  const g = new InvaderGame(() => {});
  g.start();
  g.field[0] = { value: '1', isUFO: false };
  g.field[1] = { value: '2', isUFO: false };
  g.field[3] = { value: '7', isUFO: false }; // これを倒す
  g.field[5] = { value: '9', isUFO: false }; // 倒した敵より遠いので動かない
  while (g.aimValue !== '7') g.aim();
  g.fire();
  assert(g.field[0] === null, 'the frontmost lane opens up after the kill');
  assert(g.field[1]?.value === '1', 'the invader that was closest retreats back by one lane');
  assert(g.field[2]?.value === '2', 'the second-closest invader also retreats back by one lane');
  assert(g.field[3] === null, 'the killed lane itself is empty (nothing was behind it to fill in)');
  assert(g.field[5]?.value === '9', 'invaders farther out than the kill are untouched');
  g.quit();
}

// 近いレーンに同じ数字が複数並んでいる場合、自陣に近い方から優先的に倒す
{
  const g = new InvaderGame(() => {});
  g.start();
  g.field[1] = { value: '4', isUFO: false }; // index1 = 20点
  g.field[4] = { value: '4', isUFO: false }; // index4 = 50点
  while (g.aimValue !== '4') g.aim();
  const before = g.totalScore;
  g.fire();
  assert(g.totalScore === before + 20, 'closest matching lane is destroyed first');
  assert(g.field[1] === null && g.field[4] !== null, 'only the closest match is removed');
  g.quit();
}

// ミス: 狙いが外れていれば敵は残るが、弾数は消費される
{
  const g = new InvaderGame(() => {});
  g.start();
  g.field[2] = { value: '8', isUFO: false };
  while (g.aimValue !== '1') g.aim();
  g.fire();
  assert(g.field[2] !== null, 'mismatched fire does not destroy the invader');
  assert(g.shotsThisRound === 1, 'shot count increments even on a miss');
  g.quit();
}

// 自陣(レーン0)に到達されるとライフが減る
{
  const g = new InvaderGame(() => {});
  g.start();
  const livesBefore = g.lives;
  g.field[0] = { value: '5', isUFO: false };
  g._tick();
  assert(g.lives === livesBefore - 1, 'life decrements when an invader reaches the nearest lane and the field shifts');
  g.quit();
}

// UFOが自陣に到達してもライフは減らない(ボーナス敵のため)
{
  const g = new InvaderGame(() => {});
  g.start();
  const livesBefore = g.lives;
  g.field[0] = { value: 'n', isUFO: true };
  g._tick();
  assert(g.lives === livesBefore, 'a missed UFO does not cost a life');
  g.quit();
}

// ライフが0になるとゲームオーバー
{
  const g = new InvaderGame(() => {});
  g.start();
  g.lives = 1;
  g.field[0] = { value: '5', isUFO: false };
  g._tick();
  assert(g.phase === 'gameOver', 'phase becomes gameOver when lives hit 0');
  g.quit();
}

// 1ラウンドでFIRE30回に達するとゲームオーバー
{
  const g = new InvaderGame(() => {});
  g.start();
  for (let i = 0; i < 30; i++) {
    while (g.aimValue !== 'n') g.aim(); // フィールドに数字しかいないので常にミスさせる
    g.fire();
  }
  assert(g.phase === 'gameOver', '30 shots in a round triggers game over');
  g.quit();
}

// 全滅後、キューも空ならラウンドクリアになる
{
  const g = new InvaderGame(() => {});
  g.start();
  g.queue = [];
  g.pendingBonus = null;
  g.field = new Array(MAX_LANES).fill(null);
  g.field[0] = { value: '9', isUFO: false };
  while (g.aimValue !== '9') g.aim();
  g.fire();
  assert(g.phase === 'roundClear', 'round clears once the queue and field are both empty');
  g.quit();
}

console.log('done');
