if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}

const gameModule = await import('../js/game.js');
const {
  MegaMergeGame, GRID_ROWS, GRID_COLS,
  setGridSize, getBestShots,
} = gameModule;
// GRID_ROWS/GRID_COLS は setGridSize() で書き換わる値なので、切り替え後は
// 分割代入した定数(切り替え前のスナップショット)ではなく gameModule.XXX を直接読むこと。

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
  assert(g.shotsUsed === 0, 'shotsUsed starts at 0 (there is no shot limit to count down from)');
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

// 前後左右で同時に複数一致した場合、優先順位で1個だけ選ぶのではなく全部まとめて一気に合体する
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

// 横に3つ同じ値が並んでいて真ん中を撃つと、3つとも一気に合体する
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

// 十字型(上下左右すべて)が同時に一致すると、4個まとめて一気に合体する
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
  assert(g.score === 4, 'shoot() resolves the hit immediately and scores it');
  assert(g.grid[BOTTOM][3] === 4, 'the grid reflects the resolved hit right away');
  g.quit();
}

// 盤面上のどのマスでも直接タップできる(列の最前面でなくてもよい)
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

// 弾数に上限は無い: shotsUsedがどれだけ大きくても、ショットは拒否されない
{
  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  g.grid = withAnchors(emptyGrid(), [3]);
  g.grid[3][3] = 2;
  g.shotsUsed = 999999; // かつての弾数上限(サイズに応じて58〜130発程度)をはるかに超える値を手動で設定
  g.shoot(3, 3);
  assert(g.shotsUsed === 1000000, 'shoot() keeps incrementing shotsUsed with no ceiling check');
  assert(g.phase === 'playing', 'there is no ammo-out game over; a huge shotsUsed does not end the game');
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

// setGridSize(): 盤面サイズを切り替えると、GRID_ROWS/GRID_COLS/CELL_W/CELL_H が追従する
{
  setGridSize(4, 4);
  assert(gameModule.GRID_ROWS === 4 && gameModule.GRID_COLS === 4, 'setGridSize updates GRID_ROWS/GRID_COLS');
  assert(gameModule.CELL_W > 40, 'a 4x4 board gets noticeably bigger cells than the 6x6 default (~35.7px)');

  const g = new MegaMergeGame(() => {});
  g.start({ skipReady: true });
  assert(g.grid.length === 4 && g.grid[0].length === 4, 'the grid is actually resized to 4x4');
  assert(g.blockCount === 16, 'every cell of the 4x4 board starts occupied');
  assert(g.rows === 4 && g.cols === 4, 'the game instance remembers which size it was started at');
  g.quit();
}

// 自己ベスト(最小ショット数)はサイズごとに個別に記録される
{
  setGridSize(4, 4);
  assert(getBestShots(4, 4) === null, 'no best record exists yet for a freshly-used size');

  let captured = null;
  const g = new MegaMergeGame((inst) => { captured = [...inst.events]; });
  g.start({ skipReady: true });
  g.grid = Array.from({ length: 4 }, () => Array(4).fill(0));
  g.grid[0][0] = 1024; // 撃つと2048に到達してポップ、盤面唯一のブロックなのでクリア
  g.shoot(0, 0);
  assert(g.phase === 'cleared', 'sanity: the 4x4 board clears in a single shot');
  assert(getBestShots(4, 4) === 1, 'clearing in 1 shot sets the 4x4 best record to 1');
  assert(g.bestShots === 1, 'the game instance reflects the new best immediately (no reload needed)');
  assert(captured.includes('newBest'), 'a newBest event fires the first time a size is cleared');
  g.quit();
}

// 自己ベストは「それより少ない」場合だけ更新され、同数や悪化では更新されない
{
  setGridSize(4, 4); // 前のテストで 4x4 の自己ベストは 1 になっている
  let captured = null;
  const g = new MegaMergeGame((inst) => { captured = [...inst.events]; });
  g.start({ skipReady: true });
  g.grid = Array.from({ length: 4 }, () => Array(4).fill(0));
  g.grid[0][0] = 1024;
  g.grid[3][3] = 1024; // 対角の離れた位置に置き、隣接しないので合体せず2発必要になるようにする
  g.shoot(0, 0); // 1発目: 単独直撃で2048に到達しポップ。列0が空になるので水平圧縮が起き、
  // 列3にあったもう一方のブロックは列0へ詰め直される(行は3のまま)。
  g.shoot(3, 0); // 2発目: 詰め直された残る唯一のブロックを直撃、2048に到達しポップして盤面が空になる
  assert(g.phase === 'cleared', 'sanity: this setup clears in exactly 2 shots');
  assert(getBestShots(4, 4) === 1, 'a worse (2-shot) clear does not overwrite the existing 1-shot best');
  assert(!captured.includes('newBest'), 'no newBest event fires when the result does not beat the record');
  g.quit();
}

setGridSize(6, 6); // 既定サイズに戻し、以降このモジュールを再importする他のテストに影響を残さない

console.log('done');
