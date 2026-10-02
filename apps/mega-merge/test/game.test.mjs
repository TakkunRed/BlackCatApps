if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}

const { MegaMergeGame, GRID_ROWS, GRID_COLS, FIELD_W, PLAYER_W, POP_THRESHOLD, POP_BONUS } = await import('../js/game.js');

function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
}

function emptyGrid() {
  return Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(0));
}

// 初期セットアップ
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  assert(g.phase === 'playing', 'start({skipReady:true}) goes straight to playing');
  assert(g.grid.length === GRID_ROWS && g.grid[0].length === GRID_COLS, 'the grid is 6x6');
  assert(g.blockCount === GRID_ROWS * GRID_COLS, 'every cell starts occupied');
  const allPow2 = g.grid.flat().every((v) => v > 0 && (v & (v - 1)) === 0);
  assert(allPow2, 'every seeded value is a power of two');
  g.quit();
}

// start()はまず ready(最高得点表示)になる
{
  const g = new MegaMergeGame(() => {});
  g.start();
  assert(g.phase === 'ready', 'start() enters the ready/high-score screen first');
  g.quit();
}

// 直撃(連鎖なし): 数字が2倍になり、連鎖ボーナスは乗らない
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  g.grid[3][3] = 2; // 周囲は空なので連鎖しない
  g._resolveHit(3, 3);
  assert(g.grid[3][3] === 4, 'a lone hit doubles the value');
  assert(g.score === 4, `no-chain score equals the doubled value alone (got ${g.score})`);
  assert(g.lastResolve.chainIndex === 0, 'chainIndex is 0 when nothing merges');
  g.quit();
}

// 1連鎖: 隣接する同じ数字と合体してさらに2倍、連鎖ボーナスが乗る
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  g.grid[3][3] = 2; // 撃たれて4になる
  g.grid[2][3] = 4; // 上隣: 4と一致するので合体して8になる
  g._resolveHit(3, 3);
  // step0: 4 * 1       = 4
  // step1: 8 * 1.5     = 12
  // 合計 16
  assert(g.grid[3][3] === 8, 'a single chain merge doubles again to 8');
  assert(g.grid[2][3] === 0, 'the merged neighbor is consumed (removed)');
  assert(g.score === 16, `chained score includes the chain-length bonus (got ${g.score})`);
  assert(g.lastResolve.chainIndex === 1, 'chainIndex is 1 after one merge');
  g.quit();
}

// 隣接探索の優先順: 上→右→下→左
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  g.grid[3][3] = 2;
  g.grid[2][3] = 4; // 上
  g.grid[3][4] = 4; // 右 (上と同値でどちらも対象になり得る状況)
  g._resolveHit(3, 3);
  assert(g.grid[2][3] === 0, 'the neighbor above is consumed first when both match');
  assert(g.grid[3][4] === 4, 'the neighbor to the right is left untouched that turn');
  g.quit();
}

// 多段連鎖: 合体のたびに数字と倍率の両方が伸びていく
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  g.grid[3][3] = 2;  // -> 4
  g.grid[2][3] = 4;  // 上: 4と合体 -> 8
  g.grid[3][2] = 8;  // 左: 8と合体 -> 16 (上はもう消えているので次に優先される候補)
  g._resolveHit(3, 3);
  assert(g.grid[3][3] === 16, 'two chained merges reach 16');
  assert(g.lastResolve.chainIndex === 2, 'chainIndex counts both merges');
  // step0: 4*1=4, step1: 8*1.5=12, step2: 16*2=32 → 合計48
  assert(g.score === 48, `multi-step chain score matches the escalating formula (got ${g.score})`);
  g.quit();
}

// 2048到達でポップして消滅し、ボーナス得点が入る
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  g.grid[3][3] = 1024;
  g.grid[2][3] = 1024; // 合体すると2048に到達
  const before = g.score;
  g._resolveHit(3, 3);
  assert(g.grid[3][3] === 0, 'a block reaching the pop threshold is removed from the board');
  assert(g.score >= before + POP_BONUS, 'popping awards the pop bonus on top of the merge score');
  assert(g.lastResolve.popped === true, 'lastResolve reports popped: true');
  g.quit();
}

// 盤面が空になるとクリア(単独ポップのパターン)
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  g.grid[0][0] = 1024; // 撃つと2048になり、単独でポップする(盤面唯一のブロック)
  g._resolveHit(0, 0);
  assert(g.blockCount === 0, 'the board is empty after the final pop');
  assert(g.phase === 'cleared', 'clearing the whole board moves to the cleared phase');
  g.quit();
}

// 盤面が空になるとクリア(合体してからポップするパターン)
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  g.grid[0][0] = 512;  // 撃つと1024になる
  g.grid[0][1] = 1024; // 右隣: 1024と一致して合体 -> 2048に到達しポップ(両方消える)
  g._resolveHit(0, 0);
  assert(g.blockCount === 0, 'a merge that reaches the threshold clears both participating cells');
  assert(g.phase === 'cleared', 'the board-clear check runs after the merge chain resolves');
  g.quit();
}

// fire(): 同時に1発まで、ショット数がカウントされる
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.fire();
  assert(g.bullet !== null, 'fire() spawns a bullet');
  assert(g.shotsUsed === 1, 'shotsUsed increments');
  const before = g.bullet;
  g.fire();
  assert(g.bullet === before, 'a second fire() while a bullet is active does nothing');
  assert(g.shotsUsed === 1, 'shotsUsed does not increment when the shot is ignored');
  g.quit();
}

// 列が空ならミス: 弾は何にも当たらず画面上端で消える
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid(); // 全列空
  g.fire();
  for (let i = 0; i < 100; i++) g._moveBullet(0.05);
  assert(g.bullet === null, 'a bullet over an empty column disappears without scoring');
  assert(g.score === 0, 'no score is awarded on a miss');
  g.quit();
}

// プレイヤーの移動は画面端でクランプされ、ドラッグで直接追従できる
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.setMoveDir(-1);
  for (let i = 0; i < 200; i++) g.update(0.1);
  assert(g.player.x >= 2, 'player does not move past the left edge');

  g.setDragTarget(150);
  g.update(0.016);
  assert(Math.abs(g.player.x - (150 - PLAYER_W / 2)) < 0.01, 'drag target directly positions the player center');
  g.clearDragTarget();
  g.quit();
}

// 一時停止/再開
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.togglePause();
  assert(g.phase === 'paused', 'togglePause() pauses from playing');

  const scoreBefore = g.score;
  g.fire();
  assert(g.bullet === null, 'fire() is ignored while paused');
  assert(g.score === scoreBefore, 'score is unaffected while paused');

  g.togglePause();
  assert(g.phase === 'playing', 'togglePause() resumes from paused');
  g.quit();
}

// 最高得点はlocalStorageに保存され、次のインスタンスからも読める
{
  localStorage.setItem('megaMerge.highScore', '0');
  const g1 = new MegaMergeGame(() => {});
  g1.start({ skipReady: true });
  g1.grid = emptyGrid();
  g1.grid[0][0] = 1024;
  g1._resolveHit(0, 0);
  const recorded = g1.highScore;
  assert(recorded > 0, 'highScore updates on reaching a new record (via board clear)');

  const g2 = new MegaMergeGame(() => {});
  assert(g2.highScore === recorded, 'a fresh instance reads the persisted highScore back');
  g1.quit();
}

console.log('done');
