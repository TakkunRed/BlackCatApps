if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}

const {
  MegaMergeGame, GRID_ROWS, GRID_COLS, SHOT_LIMIT,
  simulateShot, estimateParShots, occupiedCells,
} = await import('../js/game.js');

function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
}

function emptyGrid() {
  return Array.from({ length: GRID_ROWS }, () => Array(GRID_COLS).fill(0));
}

// 指定した列以外にアンカー(無関係な目印ブロック)を置き、それらの列が空にならないようにする。
// これにより「列が完全に空になったら詰める」水平圧縮が、テスト対象の列位置をずらすのを防ぐ。
function withAnchors(grid, keepCols) {
  for (let c = 0; c < GRID_COLS; c++) {
    if (!keepCols.includes(c)) grid[0][c] = 2;
  }
  return grid;
}

const BOTTOM = GRID_ROWS - 1;

// 初期セットアップ
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  assert(g.phase === 'playing', 'start({skipReady:true}) goes straight to playing');
  assert(g.grid.length === GRID_ROWS && g.grid[0].length === GRID_COLS, 'the grid is 6x6');
  assert(g.blockCount === GRID_ROWS * GRID_COLS, 'every cell starts occupied');
  const allPow2 = g.grid.flat().every((v) => v > 0 && (v & (v - 1)) === 0);
  assert(allPow2, 'every seeded value is a power of two');
  assert(g.shotsRemaining === SHOT_LIMIT, 'shotsRemaining starts at the full shot limit');
  assert(typeof g.parTarget === 'number' && g.parTarget > 0, 'parTarget is computed on a fresh board');
  g.quit();
}

// start()はまず ready(最高得点表示)になる
{
  const g = new MegaMergeGame(() => {});
  g.start();
  assert(g.phase === 'ready', 'start() enters the ready/high-score screen first');
  g.quit();
}

// 直撃(連鎖なし): 数字が2倍になり、連鎖ボーナスは乗らない(列に1個しか無いので最下段に落ちる)
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [3]);
  g.grid[3][3] = 2; // 周囲は空なので連鎖しない
  g._resolveHit(3, 3);
  assert(g.grid[BOTTOM][3] === 4, 'a lone hit doubles the value and settles at the bottom of its column');
  assert(g.score === 4, `no-chain score equals the doubled value alone (got ${g.score})`);
  assert(g.lastResolve.chainIndex === 0, 'chainIndex is 0 when nothing merges');
  g.quit();
}

// 1連鎖: 隣接する同じ数字(直撃後の値)と合体してさらに2倍、連鎖ボーナスが乗る
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [3]);
  g.grid[3][3] = 2; // 撃たれて4になる
  g.grid[2][3] = 4; // 上隣: 4と一致するので合体して8になる
  g._resolveHit(3, 3);
  // step0: 4 * 1       = 4
  // step1: 8 * 1.5     = 12
  // 合計 16
  assert(g.grid[2][3] === 0, 'the merged neighbor is consumed (removed from its old spot)');
  assert(g.grid[BOTTOM][3] === 8, 'the single remaining block (now 8) settles at the bottom after gravity');
  assert(g.score === 16, `chained score includes the chain-length bonus (got ${g.score})`);
  assert(g.lastResolve.chainIndex === 1, 'chainIndex is 1 after one merge');
  g.quit();
}

// 直撃前の「元の値」と同じ隣接ブロックも合体できる(v3で追加)
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [3]);
  g.grid[3][3] = 4; // 撃つと8になる
  g.grid[2][3] = 4; // 上隣: 直撃前の"元の値"(4)と同じ → まず合体してから2倍 → 8
  g._resolveHit(3, 3);
  assert(g.lastResolve.chainIndex === 1, 'a neighbor matching the pre-hit original value merges');
  assert(g.lastResolve.finalValue === 8, 'the merge resolves to double the original value');
  assert(g.lastResolveSteps[0].type === 'merge', 'step 0 is itself a merge when the original value matches a neighbor');
  g.quit();
}

// NEW: 前後左右で同時に複数一致した場合、優先順位で1個だけ選ぶのではなく全部まとめて一気に合体する
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [3, 4]);
  g.grid[3][3] = 2; // 撃つマス -> 4になる
  g.grid[2][3] = 4; // 上: 直撃後の値(4)と一致
  g.grid[3][4] = 4; // 右: 直撃後の値(4)と一致(同時に一致する2方向)
  g._resolveHit(3, 3);
  assert(g.lastResolve.chainIndex === 2, 'both simultaneously-matching neighbors merge in the same action (not just one)');
  assert(g.lastResolve.finalValue === 8, 'absorbing both neighbors at once still doubles the value only once per step');
  assert(g.grid.flat().filter((v) => v === 4).length === 0, 'both matching neighbors are consumed, none left as a plain 4');
  // step0(hit,4): 4*1=4
  // step1(merge,2個同時,8): 8*1.5=12, 8*2=16
  // 合計 32
  assert(g.score === 32, `simultaneous absorption scores each merged block individually (got ${g.score})`);
  g.quit();
}

// NEW: 横に3つ同じ値が並んでいて真ん中を撃つと、今度は3つとも一気に合体する(以前は2つまでだった)
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  g.grid[3][1] = 2; // 撃つマス(3つの真ん中)
  g.grid[3][2] = 2; // 右隣
  g.grid[3][0] = 2; // 左隣
  g._resolveHit(3, 1);
  assert(g.lastResolve.chainIndex === 2, 'hitting the middle of three in a row merges both sides at once');
  assert(g.lastResolve.finalValue === 4, 'three 2s merging at once reach 4 (one doubling, all three consumed)');
  assert(g.blockCount === 1, 'all three original blocks are gone, leaving only the merged result');
  g.quit();
}

// NEW: 十字型(上下左右すべて)が同時に一致すると、4個まとめて一気に合体する
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  g.grid[3][3] = 2; // 撃つマス
  g.grid[2][3] = 2; // 上
  g.grid[3][4] = 2; // 右
  g.grid[4][3] = 2; // 下
  g.grid[3][2] = 2; // 左
  g._resolveHit(3, 3);
  assert(g.lastResolve.chainIndex === 4, 'all four neighbors merge simultaneously in a single tap');
  assert(g.lastResolve.finalValue === 4, 'a 4-way simultaneous merge still only doubles the value once');
  assert(g.blockCount === 1, 'only the merged result remains after a full cross-shaped merge');
  // step0(merge,4個同時,4): 4*1=4, 4*1.5=6, 4*2=8, 4*2.5=10 → 合計28
  assert(g.score === 28, `a 4-way simultaneous merge scores every absorbed block (got ${g.score})`);
  g.quit();
}

// 重力: マージで空いたマスには同じ列の上のブロックが落ちてくる
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [2, 3]);
  g.grid[0][2] = 99; // 列2の一番上、撃った列(col3)とは無関係の目印
  g.grid[3][3] = 2;
  g.grid[2][3] = 4; // 合体して消える
  g.grid[0][3] = 7; // さらに上にある別のブロック(マージには関与しないが列3にあるので落ちてくるはず)
  g._resolveHit(3, 3);
  assert(g.grid[BOTTOM][3] === 8, 'the hit block settles at the bottom of its column');
  assert(g.grid[BOTTOM - 1][3] === 7, 'a block further up the same column falls down to sit right above it');
  assert(g.grid[0][2] === 99, 'an untouched column is not affected by gravity from a different column');
  g.quit();
}

// 2048到達でポップして消滅し、ボーナス得点が入る
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  g.grid[3][3] = 512;  // 撃つと1024になる
  g.grid[2][3] = 1024; // 合体すると2048に到達してポップ
  const before = g.score;
  g._resolveHit(3, 3);
  assert(g.blockCount === 0, 'both participating cells are gone once the merge reaches the pop threshold');
  assert(g.score >= before + 500, 'popping awards the pop bonus on top of the merge score');
  assert(g.lastResolve.popped === true, 'lastResolve reports popped: true');
  g.quit();
}

// 盤面が空になるとクリア
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

// shoot(row, col): タップ操作で即座に解決される(移動・飛翔時間は無い)
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [3]);
  g.grid[3][3] = 2;
  g.shoot(3, 3);
  assert(g.shotsUsed === 1, 'shoot() increments shotsUsed');
  assert(g.shotsRemaining === SHOT_LIMIT - 1, 'shotsRemaining decrements along with shotsUsed');
  assert(g.score === 4, 'shoot() resolves the hit immediately and scores it');
  assert(g.grid[BOTTOM][3] === 4, 'the grid reflects the resolved hit right away');
  g.quit();
}

// NEW: 盤面上のどのマスでも直接タップできる(列の最前面でなくてもよい)
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  g.grid[1][0] = 2; // 列0の上の方(最前面ではない)
  g.grid[5][0] = 9; // 同じ列の下(無関係の目印)
  g.shoot(1, 0); // 最前面ではない(1,0)を直接指定してタップ
  assert(g.shotsUsed === 1, 'tapping a non-frontmost cell is accepted');
  assert(g.grid[4][0] === 4, 'the directly-tapped block resolves and falls with gravity afterward');
  assert(g.grid[5][0] === 9, 'the untouched marker stays below it');
  g.quit();
}

// shoot(): 空のマスを指定しても何も起きない
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  g.shoot(3, 0);
  assert(g.shotsUsed === 0, 'shooting an empty cell does not consume a shot');
  g.quit();
}

// shoot(): プレイ中以外は無視される
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [3]);
  g.grid[3][3] = 2;
  g.pause();
  g.shoot(3, 3);
  assert(g.shotsUsed === 0, 'shoot() is ignored while paused');
  assert(g.grid[3][3] === 2, 'the grid is untouched while paused');
  g.quit();
}

// shoot(): 弾切れ後は無視される
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [3]);
  g.grid[3][3] = 2;
  g.shotsUsed = SHOT_LIMIT;
  g.shoot(3, 3);
  assert(g.shotsUsed === SHOT_LIMIT, 'shoot() does not go past the shot limit');
  assert(g.grid[3][3] === 2, 'the grid is untouched once ammo is exhausted');
  g.quit();
}

// 弾数上限に達すると、盤面が残っていてもゲームオーバーになる(shoot()経由の実際の操作で確認)
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  // 消費しても盤面が空にならないよう、隣同士が一致しない値をばらけさせて置く
  for (let c = 0; c < GRID_COLS; c++) g.grid[BOTTOM][c] = 2 << c; // 2,4,8,16,32,64
  g.shotsUsed = SHOT_LIMIT - 1; // 次の1発でちょうど上限に到達する
  g.shoot(BOTTOM, 0);
  assert(g.shotsUsed === SHOT_LIMIT, 'shoot() increments shotsUsed up to the limit');
  assert(g.phase === 'gameOver', 'running out of shots with blocks remaining ends the game');
  g.quit();
}

// _checkAmmoOut() 自体の単体確認(盤面が空でなければgameOverになる)
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.shotsUsed = SHOT_LIMIT;
  g._checkAmmoOut();
  assert(g.phase === 'gameOver', '_checkAmmoOut() ends the game once shotsUsed reaches the limit');
  g.quit();
}

// ゲームオーバーでも、その時点のスコアが新記録なら最高得点が更新される
{
  localStorage.setItem('megaMerge.highScore', '0');
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.score = 321;
  g.shotsUsed = SHOT_LIMIT;
  g._checkAmmoOut();
  assert(g.phase === 'gameOver', 'sanity: the game is over');
  assert(g.highScore === 321, 'a game-over run still counts toward the high score if it is a new record');
  g.quit();
}

// 一時停止/再開
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [3]);
  g.grid[3][3] = 2;
  g.togglePause();
  assert(g.phase === 'paused', 'togglePause() pauses from playing');

  const scoreBefore = g.score;
  g.shoot(3, 3);
  assert(g.score === scoreBefore, 'shoot() is ignored while paused');

  g.togglePause();
  assert(g.phase === 'playing', 'togglePause() resumes from paused');
  g.quit();
}

// 水平圧縮: 列が完全に空になると、右側の列が左へ詰める
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = emptyGrid();
  g.grid[BOTTOM][1] = 1024; // 撃つ列(1)。これ1個だけなので、ポップすると列1は完全に空になる
  g.grid[BOTTOM][3] = 9;    // 列3の目印(値は合体に影響しない適当な数)
  g.grid[BOTTOM][5] = 16;   // 列5の目印
  g._resolveHit(BOTTOM, 1); // 1024→2048でポップ。列1が完全に空になる
  assert(g.lastResolve.popped === true, 'sanity: the hit block popped');
  assert(g.blockCount === 2, 'two marker blocks remain after column 1 pops empty');
  // 圧縮は「空いた列の隣だけ」ではなく、盤面全体を常に隙間なく左詰めし続ける。
  // 残っているのは列3・列5の中身だけなので、左から順に列0・列1に詰まる。
  assert(g.grid[BOTTOM][0] === 9, 'the marker that was in column 3 repacks to column 0');
  assert(g.grid[BOTTOM][1] === 16, 'the marker that was in column 5 repacks to column 1');
  assert(
    g.lastColumnShift.some((s) => s.fromCol === 3 && s.toCol === 0) &&
    g.lastColumnShift.some((s) => s.fromCol === 5 && s.toCol === 1),
    'lastColumnShift records both column moves for animation'
  );
  g.quit();
}

// 水平圧縮: 空になった列が無ければ、列の並びは変わらない
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [3]);
  g.grid[3][3] = 2; // 単独で4になるだけ(列3は空にならない)
  g._resolveHit(3, 3);
  assert(g.lastColumnShift.length === 0, 'no columns move when nothing becomes fully empty');
  g.quit();
}

// アニメーション用の詳細ステップ(lastResolveSteps)が、起きたことを順番どおりに記録している
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [3]);
  g.grid[3][3] = 2;
  g.grid[2][3] = 4; // 上と合体
  g._resolveHit(3, 3);
  const steps = g.lastResolveSteps;
  assert(steps[0].type === 'hit' && steps[0].value === 4, 'step 0 is the initial hit, doubled to 4');
  assert(steps[1].type === 'merge' && steps[1].value === 8, 'step 1 is the merge, reaching 8');
  assert(Array.isArray(steps[1].from) && steps[1].from.length === 1, 'the merge step records an array of consumed cells');
  assert(steps[1].from[0].row === 2 && steps[1].from[0].col === 3, 'the merge step records which cell was consumed');
  g.quit();
}

// 複数同時合体でも、1ステップのfrom配列にまとめて記録される
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [3, 4]);
  g.grid[3][3] = 2;
  g.grid[2][3] = 4; // 上
  g.grid[3][4] = 4; // 右(上と同時に一致)
  g._resolveHit(3, 3);
  const steps = g.lastResolveSteps;
  assert(steps[1].type === 'merge' && steps[1].from.length === 2, 'a single merge step can carry multiple simultaneously-absorbed cells');
  g.quit();
}

// ポップ時もステップに記録される
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [3]);
  g.grid[3][3] = 1024;
  g.grid[2][3] = 1024; // 合体して2048に到達、ポップ
  g._resolveHit(3, 3);
  const last = g.lastResolveSteps[g.lastResolveSteps.length - 1];
  assert(last.type === 'pop' && last.value === 2048, 'the final step records the pop at 2048');
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

// occupiedCells(): 盤面上の空でない全マスを列挙する
{
  const grid = emptyGrid();
  grid[0][0] = 2;
  grid[5][5] = 4;
  const cells = occupiedCells(grid);
  assert(cells.length === 2, 'occupiedCells lists every non-empty cell');
  assert(cells.some((c) => c.row === 0 && c.col === 0) && cells.some((c) => c.row === 5 && c.col === 5), 'occupiedCells reports the correct coordinates');
}

// simulateShot(row, col): 純粋関数で、元のgridを変更しない
{
  const base = emptyGrid();
  base[3][3] = 2;
  const result = simulateShot(base, 3, 3);
  assert(result.finalValue === 4, 'simulateShot resolves the hit on a cloned grid');
  assert(base[3][3] === 2, 'simulateShot does not mutate the grid passed in');
  // 盤面には他に何も無いため、水平圧縮で列3の内容は左詰めの列0に移る。
  assert(result.grid[BOTTOM][0] === 4, 'the returned grid reflects the resolved hit, repacked to the left');
}

// simulateShot(): 空のマスはnullを返す
{
  assert(simulateShot(emptyGrid(), 3, 0) === null, 'simulateShot on an empty cell returns null');
}

// estimateParShots(): 孤立した1マスは、2048に到達するまで同じマスを撃ち続けるしかない(2→4→…→2048は10発)
{
  const grid = emptyGrid();
  grid[BOTTOM][0] = 2;
  assert(estimateParShots(grid) === 10, 'a single isolated block needs exactly 10 doublings to pop (got a different value)');
}

// estimateParShots(): 実際にランダム生成された盤面でも、高速かつ妥当な値を返す
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  const recomputed = estimateParShots(g.grid.map((r) => [...r]));
  assert(g.parTarget === recomputed, 'reset() stores the same par estimate that estimateParShots computes directly');
  assert(g.parTarget < SHOT_LIMIT, 'the par estimate for a typical board is comfortably under the shot limit');
  g.quit();
}

console.log('done');
