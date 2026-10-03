// MEGA MERGE - ロジック本体(描画・DOM非依存、update(dt)で駆動する純粋なゲームステート)
// オリジナルのパズル。ブロック崩しのように並んだ「2の累乗」ブロックを列ごとにタップして倍にし、
// 上下左右の隣接ブロックと同じ数字なら合体してさらに倍になる。
// 合体の連鎖が長いほど得点ボーナスが大きくなる。2048に到達したブロックはポップして消滅する。
//
// v1(降下なし・弾数無制限)は「同じマスを撃ち続ければ必ず勝てる」ため、
// プレイヤーの選択がほぼ結果に影響しないことがシミュレーションで判明した。
// v2ではマージ/ポップで空いたマスに同じ列のブロックが重力で落ちてくるようにし、
// 弾数にも上限(130発)を設けた。
// v2.1では、合体の過程をアニメーションで見せるようにし、列が完全に空になったら
// 左右の列を詰める水平圧縮を追加した(終盤に隣接の機会が失われないようにするため)。
// v3では、以下3点を見直した:
//   1) 「下の1マスしか対象にならないなら、わざわざ弾を飛ばす意味がない」という指摘を受け、
//      自機・弾を廃止し、列をタップ/クリックした瞬間に即解決するシンプルな操作に変更した。
//   2) 「同じ数字を3つ並べても2つしか合体しない」という指摘を受け、直撃前の元の値でも
//      隣接マッチできるようにし、今まで合体できなかった「同じ値同士の隣接」も合体できるようにした。
//   3) 盤面から「クリアに必要な目安ショット数(TARGET)」をビームサーチで見積もり、
//      それを下回ることを目標にできるようにした(厳密な最短手数の証明は計算量的に非現実的なため、
//      あくまで強い見積もり値として扱う)。
// v4では、さらに2点見直した:
//   1) 「ブロックのどこでもタップできるように」という要望を受け、列の最前面だけでなく
//      盤面上の任意のブロックを直接タップして撃てるようにした(shoot(col) → shoot(row, col))。
//   2) 「前後左右で同じものが揃ったら一気に合体させたい」という要望を受け、優先順位に従って
//      隣接1個だけを選んで消費する方式から、その時点の値と一致する隣接ブロックを(複数あれば)
//      同時に全部まとめて吸収する方式に変更した。スコアは吸収した個数ぶん個別に連鎖ボーナスが
//      積み上がるので、一気に合体するほど見た目も得点もダイナミックになる。

export const FIELD_W = 240;
export const FIELD_H = 280;

export const GRID_ROWS = 6;
export const GRID_COLS = 6;
export const GRID_MARGIN_X = 8;
export const GRID_TOP_Y = 18;
export const CELL_GAP = 2;
export const CELL_W = (FIELD_W - GRID_MARGIN_X * 2 - CELL_GAP * (GRID_COLS - 1)) / GRID_COLS;
export const CELL_H = 38;

const POP_THRESHOLD = 2048;
const POP_BONUS = 500;
const CHAIN_MULT_STEP = 0.5; // 連鎖1回ごとに乗率+0.5
const SHOT_LIMIT = 130; // シミュレーションで調整した弾数上限

const SEED_VALUES = [2, 2, 2, 4, 4, 8]; // 初期盤面の重み付き候補値

const READY_SCREEN_MS = 1200;
const HIGH_SCORE_KEY = 'megaMerge.highScore';

// 隣接探索の優先順: 上→右→下→左
const NEIGHBOR_ORDER = [
  { dr: -1, dc: 0 },
  { dr: 0, dc: 1 },
  { dr: 1, dc: 0 },
  { dr: 0, dc: -1 },
];

export function cellX(col) {
  return GRID_MARGIN_X + col * (CELL_W + CELL_GAP);
}
export function cellY(row) {
  return GRID_TOP_Y + row * (CELL_H + CELL_GAP);
}

// ============================================================
// 純粋関数群: ゲーム本体(即時反映)・app.js側のアニメーション(段階的に再現)・
// ソルバー(先読みシミュレーション)の3者から同じロジックを使うため、
// グリッド操作をクラスの外に切り出している。クラスのthisや副作用には一切依存しない。
// ============================================================

// 指定した列の中身を下詰めにする。戻り値は実際に動いたブロックの移動一覧。
function dropColumn(grid, col, rows) {
  const before = [];
  for (let row = 0; row < rows; row++) before.push(grid[row][col]);

  const values = before.filter((v) => v);
  for (let row = 0; row < rows; row++) grid[row][col] = 0;
  let writeRow = rows - 1;
  for (let i = values.length - 1; i >= 0; i--) {
    grid[writeRow][col] = values[i];
    writeRow -= 1;
  }

  const moves = [];
  const srcRowsInOrder = [];
  for (let row = 0; row < rows; row++) if (before[row]) srcRowsInOrder.push(row);
  const destRow = rows - values.length;
  for (let i = 0; i < values.length; i++) {
    const from = srcRowsInOrder[i];
    const to = destRow + i;
    if (from !== to) moves.push({ value: values[i], fromRow: from, toRow: to });
  }
  return moves;
}

// 完全に空の列を詰め、非空の列を元の左右順を保ったまま左詰めにする。
function packColumnsLeft(grid, rows, cols) {
  const nonEmptyCols = [];
  for (let c = 0; c < cols; c++) {
    let hasBlock = false;
    for (let r = 0; r < rows; r++) if (grid[r][c]) { hasBlock = true; break; }
    if (hasBlock) nonEmptyCols.push(c);
  }

  const newGrid = Array.from({ length: rows }, () => Array(cols).fill(0));
  const shifts = [];
  nonEmptyCols.forEach((fromCol, i) => {
    const toCol = i;
    for (let r = 0; r < rows; r++) newGrid[r][toCol] = grid[r][fromCol];
    if (fromCol !== toCol) shifts.push({ fromCol, toCol });
  });

  return { grid: newGrid, shifts };
}

function frontmostRow(grid, col) {
  for (let row = GRID_ROWS - 1; row >= 0; row--) if (grid[row][col]) return row;
  return -1;
}

function occupiedColumns(grid) {
  const cols = [];
  for (let c = 0; c < GRID_COLS; c++) if (frontmostRow(grid, c) !== -1) cols.push(c);
  return cols;
}

// 盤面上の空でないセル全部を列挙する。どのマスでもタップできるため、
// ソルバーはこの一覧全体を候補として先読みする。
function occupiedCells(grid) {
  const cells = [];
  for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) if (grid[r][c]) cells.push({ row: r, col: c });
  return cells;
}

function countBlocks(grid) {
  let n = 0;
  for (const row of grid) for (const v of row) if (v) n++;
  return n;
}

function multiplierForChain(chainIndex) {
  return 1 + chainIndex * CHAIN_MULT_STEP;
}

/**
 * 1マスへの着弾(直撃)を解決する純粋関数。渡されたgridを直接書き換え、
 * 何が起きたかの詳細(steps)・連鎖回数(合計吸収数)・最終値・ポップしたか・得点を返す。
 * 連鎖判定は「直撃前の元の値」と「直撃後に倍になった値」の両方を順に試す:
 *   例: 隣が自分と同じ値(元の値)なら、まずそれと合体してから2倍になる。
 *   その後は(今までと同じく)倍になった値と一致する隣接ブロックを探し続ける。
 * 「前後左右」のうち複数が同時に同じ値と一致していた場合は、優先順位で1個だけ選ぶのではなく
 * 一致したもの全部をその場で同時に吸収する(一気に合体する、ダイナミックな見た目にするため)。
 * これにより、今まで合体できなかった「同じ値同士の隣接」や「3方向以上の同時一致」も合体できる
 * ようになった。
 */
function resolveHitPure(grid, row, col) {
  const origValue = grid[row][col];
  let value = origValue;
  let chainCount = 0; // 吸収した総数(スコア計算の連鎖番号にも使う)
  const touchedCols = new Set([col]);
  const steps = [];

  function findAllMatches(target) {
    const matches = [];
    for (const { dr, dc } of NEIGHBOR_ORDER) {
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
      if (grid[nr][nc] === target) matches.push({ row: nr, col: nc });
    }
    return matches;
  }

  // ステップ0(直撃): 元の値と同じ隣接ブロックが(複数あれば)全部まとめて吸収してから2倍、
  // 無ければ(従来どおり)単純に2倍するだけ。
  const firstMatches = findAllMatches(origValue);
  for (const m of firstMatches) {
    grid[m.row][m.col] = 0;
    touchedCols.add(m.col);
  }
  value = origValue * 2;
  steps.push(
    firstMatches.length
      ? { type: 'merge', from: firstMatches, at: { row, col }, value }
      : { type: 'hit', row, col, value }
  );
  chainCount += firstMatches.length;

  // 以降の連鎖: 直撃後の値(2倍・4倍…)と同じ隣接ブロックを、見つかる限りまとめて吸収し続ける。
  for (;;) {
    const matches = findAllMatches(value);
    if (!matches.length) break;
    for (const m of matches) {
      grid[m.row][m.col] = 0;
      touchedCols.add(m.col);
    }
    value *= 2;
    steps.push({ type: 'merge', from: matches, at: { row, col }, value });
    chainCount += matches.length;
  }

  // 得点: 同時に複数吸収しても「見送られた」感が出ないよう、吸収したブロック1個ごとに
  // 連鎖番号を1つずつ進めながら加点する(3個同時吸収は3個を順番に合体させたのと同じ得点になる)。
  let scoreGained = 0;
  let chainCursor = 0;
  for (const step of steps) {
    const count = step.type === 'merge' ? step.from.length : 1;
    for (let i = 0; i < count; i++) {
      scoreGained += step.value * multiplierForChain(chainCursor);
      chainCursor += 1;
    }
  }

  const chainIndex = chainCount;
  let popped = false;
  if (value >= POP_THRESHOLD) {
    grid[row][col] = 0;
    scoreGained += POP_BONUS;
    popped = true;
    steps.push({ type: 'pop', row, col, value });
  } else {
    grid[row][col] = value;
  }

  const gravityMoves = {};
  for (const c of touchedCols) {
    const moves = dropColumn(grid, c, GRID_ROWS);
    if (moves.length) gravityMoves[c] = moves;
  }

  const { grid: packed, shifts: columnShift } = packColumnsLeft(grid, GRID_ROWS, GRID_COLS);
  if (columnShift.length) {
    for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) grid[r][c] = packed[r][c];
  }

  return { chainIndex, finalValue: value, popped, scoreGained, steps, gravityMoves, columnShift };
}

/**
 * 盤面上の(row,col)マスをタップしたら何が起きるかを試す純粋関数(グリッドのクローンに対して実行)。
 * そのマスが空なら null を返す。ソルバー・何手か先読みしたい用途向け。
 */
function simulateShot(grid, row, col) {
  if (!grid[row][col]) return null;
  const g = grid.map((r) => [...r]);
  const result = resolveHitPure(g, row, col);
  return { grid: g, ...result };
}

/**
 * ビームサーチで「この盤面をクリアするのに必要そうなショット数」の目安を見積もる。
 * どのマスでもタップできる前提で、盤面上の空でない全マスを候補として先読みする。
 * 厳密な最短手数の証明ではなく、強い目安(TARGET)として扱うこと。
 */
function estimateParShots(initialGrid, { beamWidth = 40, maxDepth = 220 } = {}) {
  let beam = [{ grid: initialGrid.map((r) => [...r]), shots: 0 }];
  for (let depth = 0; depth < maxDepth; depth++) {
    const next = [];
    for (const state of beam) {
      for (const cell of occupiedCells(state.grid)) {
        const result = simulateShot(state.grid, cell.row, cell.col);
        if (!result) continue;
        const shots = state.shots + 1;
        if (countBlocks(result.grid) === 0) return shots;
        next.push({ grid: result.grid, shots, heuristic: countBlocks(result.grid) });
      }
    }
    if (next.length === 0) return null;
    next.sort((a, b) => a.heuristic - b.heuristic);
    beam = next.slice(0, beamWidth);
  }
  return null; // maxDepth内にクリア手順が見つからなかった(非常に稀)
}

class MegaMergeGame {
  constructor(onChange) {
    this.onChange = onChange || (() => {});
    this.soundOn = true;
    this.highScore = Number(localStorage.getItem(HIGH_SCORE_KEY) || 0);
    this._readyTimer = null;
    this.events = [];
    this.reset();
  }

  reset() {
    this.active = false;
    this.phase = 'idle'; // idle | ready | playing | paused | cleared | gameOver
    this.score = 0;
    this.shotsUsed = 0;
    this.events = [];
    this._clearReadyTimer();
    this._setupGrid();
    this.parTarget = estimateParShots(this.grid);
  }

  _setupGrid() {
    this.grid = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      const r = [];
      for (let col = 0; col < GRID_COLS; col++) {
        r.push(SEED_VALUES[Math.floor(Math.random() * SEED_VALUES.length)]);
      }
      this.grid.push(r);
    }
  }

  get blockCount() {
    return countBlocks(this.grid);
  }

  get shotsRemaining() {
    return Math.max(0, SHOT_LIMIT - this.shotsUsed);
  }

  start({ skipReady = false } = {}) {
    this.reset();
    this.active = true;
    if (skipReady) {
      this.phase = 'playing';
      this._emit();
      return;
    }
    this.phase = 'ready';
    this._emit();
    this._readyTimer = setTimeout(() => {
      this._readyTimer = null;
      this.phase = 'playing';
      this._emit();
    }, READY_SCREEN_MS);
  }

  quit() {
    this._clearReadyTimer();
    this.active = false;
    this.phase = 'idle';
    this._emit();
  }

  pause() {
    if (this.phase !== 'playing') return;
    this.phase = 'paused';
    this._emit();
  }

  resume() {
    if (this.phase !== 'paused') return;
    this.phase = 'playing';
    this._emit();
  }

  togglePause() {
    if (this.phase === 'playing') this.pause();
    else if (this.phase === 'paused') this.resume();
  }

  toggleSound() {
    this.soundOn = !this.soundOn;
    this._emit();
  }

  _clearReadyTimer() {
    if (this._readyTimer) {
      clearTimeout(this._readyTimer);
      this._readyTimer = null;
    }
  }

  // 盤面上の任意のマスをタップ/クリックしたときの唯一の操作。即座に解決する(移動・飛翔時間は無い)。
  shoot(row, col) {
    if (this.phase !== 'playing') return;
    if (this.shotsUsed >= SHOT_LIMIT) return; // 弾切れ(通常は直前の着弾解決時にgameOverになっている)
    if (!this.grid[row][col]) return; // 空のマス
    this.shotsUsed += 1;
    this.events.push('shoot');
    this._resolveHit(row, col);
  }

  _resolveHit(row, col) {
    const result = resolveHitPure(this.grid, row, col);

    this.score += result.scoreGained;
    this.events.push(result.chainIndex > 0 ? 'merge' : 'hit');
    if (result.popped) this.events.push('pop');
    this.lastResolve = {
      row, col, finalValue: result.finalValue, chainIndex: result.chainIndex,
      scoreGained: result.scoreGained, popped: result.popped,
    };
    this.lastResolveSteps = result.steps;
    this.lastGravityMoves = result.gravityMoves;
    this.lastColumnShift = result.columnShift;

    if (this.blockCount === 0) {
      this._cleared();
    } else {
      this._checkAmmoOut();
    }
    this._emit();
  }

  _checkAmmoOut() {
    if (this.phase === 'playing' && this.shotsUsed >= SHOT_LIMIT) {
      this._gameOver();
    }
  }

  _cleared() {
    this.phase = 'cleared';
    this.events.push('cleared');
    this._saveHighScoreIfRecord();
  }

  _gameOver() {
    this.phase = 'gameOver';
    this.events.push('gameOver');
    this._saveHighScoreIfRecord();
  }

  _saveHighScoreIfRecord() {
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore));
    }
  }

  _emit() {
    this.onChange(this);
    this.events = [];
  }
}

export {
  MegaMergeGame, POP_THRESHOLD, POP_BONUS, SHOT_LIMIT,
  dropColumn, packColumnsLeft, resolveHitPure, simulateShot, estimateParShots,
  frontmostRow, occupiedColumns, occupiedCells, countBlocks,
};
