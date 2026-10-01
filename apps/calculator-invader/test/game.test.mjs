if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}

const { InvaderGame } = await import('../js/game.js');

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

// Firing with matching aim destroys the invader and scores by lane (farther = more points)
{
  const g = new InvaderGame(() => {});
  g.start();
  const firstValue = g.current.value; // stage1 lane=6 spawn
  const laneAtSpawn = g.current.lane;
  assert(laneAtSpawn === 6, 'stage1 invaders spawn at lane 6');

  // aim を合わせる
  while (g.aimValue !== firstValue) g.aim();
  const beforeScore = g.totalScore;
  g.fire();
  assert(g.totalScore === beforeScore + 60, `farthest kill (lane6) scores 60 (got +${g.totalScore - beforeScore})`);
  g.quit();
}

// Missing a shot does not destroy the invader but still counts toward the 30-shot cap
{
  const g = new InvaderGame(() => {});
  g.start();
  const wrongAim = g.current.value === '0' ? '1' : '0';
  const idx = ['0','1','2','3','4','5','6','7','8','9','n'].indexOf(wrongAim);
  g.aimIndex = idx;
  const currentBefore = g.current;
  g.fire();
  assert(g.current === currentBefore, 'mismatched fire does not destroy invader');
  assert(g.shotsThisRound === 1, 'shot count increments even on a miss');
  g.quit();
}

// Life lost when invader reaches the camp (lane hits 0)
{
  const g = new InvaderGame(() => {});
  g.start();
  const livesBefore = g.lives;
  g.current.lane = 1; // 次のtickで0になる想定なので手動で境界確認
  g._tick();
  assert(g.lives === livesBefore - 1, 'life decrements when invader reaches lane 0');
  g.quit();
}

// Game over when lives reach 0
{
  const g = new InvaderGame(() => {});
  g.start();
  g.lives = 1;
  g.current.lane = 1;
  g._tick();
  assert(g.phase === 'gameOver', 'phase becomes gameOver when lives hit 0');
  g.quit();
}

// 30-shot cap ends the game
{
  const g = new InvaderGame(() => {});
  g.start();
  for (let i = 0; i < 30; i++) {
    // 絶対に外れる値を選んで撃ち続ける
    const wrongAim = g.current && g.current.value === '0' ? '1' : '0';
    const idx = ['0','1','2','3','4','5','6','7','8','9','n'].indexOf(wrongAim);
    g.aimIndex = idx;
    g.fire();
  }
  assert(g.phase === 'gameOver', '30 misses in a round triggers game over');
  g.quit();
}

console.log('done');
