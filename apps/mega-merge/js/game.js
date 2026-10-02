// MEGA MERGE - ロジック本体(描画・DOM非依存、update(dt)で駆動する純粋なゲームステート)
// オリジナルのパズル×シューティング。ブロック崩しのように並んだ「2の累乗」ブロックを
// 下から撃って2倍にし、上下左右の隣接ブロックと同じ数字なら合体してさらに倍になる。
// 合体の連鎖が長いほど得点ボーナスが大きくなる。2048に到達したブロックはポップして消滅する。
//
// v1(降下なし・弾数無制限)は「同じ列を撃ち続ければ必ず勝てる」ため、
// プレイヤーの選択がほぼ結果に影響しないことがシミュレーションで判明した
// (先読み戦略でもランダムと数%しか差が出なかった)。
// v2ではマージ/ポップで空いたマスに同じ列のブロックが重力で落ちてくるようにし、
// どの列を撃つかで盤面が実際に作り変わる戦略性を持たせた上で、弾数に上限を設けている
// (先読み戦略の平均105発・ランダムは平均161発とシミュレーションで実力差を確認し、
//  上限130発で先読み成功率95%・ランダム成功率6%になるよう調整)。

export const FIELD_W = 240;
export const FIELD_H = 280;

export const GRID_ROWS = 6;
export const GRID_COLS = 6;
const GRID_MARGIN_X = 8;
const GRID_TOP_Y = 10;
export const CELL_GAP = 2;
export const CELL_W = (FIELD_W - GRID_MARGIN_X * 2 - CELL_GAP * (GRID_COLS - 1)) / GRID_COLS;
export const CELL_H = 30;

export const PLAYER_W = 18;
export const PLAYER_H = 8;
const PLAYER_Y = FIELD_H - 16;
const PLAYER_SPEED = 170;

export const BULLET_W = 2;
export const BULLET_H = 8;
const BULLET_SPEED = 260;

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

function cellX(col) {
  return GRID_MARGIN_X + col * (CELL_W + CELL_GAP);
}
function cellY(row) {
  return GRID_TOP_Y + row * (CELL_H + CELL_GAP);
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
    this.player = { x: (FIELD_W - PLAYER_W) / 2 };
    this._moveDir = 0;
    this._dragTargetX = null;
    this.bullet = null;
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
    let n = 0;
    for (const row of this.grid) for (const v of row) if (v) n++;
    return n;
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

  setMoveDir(dir) {
    this._moveDir = dir; // -1 | 0 | 1
  }

  setDragTarget(x) {
    this._dragTargetX = x;
  }

  clearDragTarget() {
    this._dragTargetX = null;
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

  fire() {
    if (this.phase !== 'playing') return;
    if (this.bullet) return; // 同時1発まで
    if (this.shotsUsed >= SHOT_LIMIT) return; // 弾切れ(通常は直前の着弾解決時にgameOverになっている)
    this.bullet = {
      x: this.player.x + PLAYER_W / 2 - BULLET_W / 2,
      y: PLAYER_Y - BULLET_H,
    };
    this.shotsUsed += 1;
    this.events.push('shoot');
    this._emit();
  }

  update(dt) {
    if (this.phase !== 'playing') return;
    this._updatePlayer(dt);
    this._moveBullet(dt);
    this._emit();
  }

  _updatePlayer(dt) {
    if (this._dragTargetX !== null) {
      this.player.x = this._dragTargetX - PLAYER_W / 2;
    } else {
      this.player.x += this._moveDir * PLAYER_SPEED * dt;
    }
    this.player.x = Math.max(2, Math.min(FIELD_W - PLAYER_W - 2, this.player.x));
  }

  _moveBullet(dt) {
    if (!this.bullet) return;
    this.bullet.y -= BULLET_SPEED * dt;
    if (this.bullet.y < 0) {
      this.bullet = null;
      this.events.push('miss');
      this._checkAmmoOut();
      return;
    }
    const col = Math.floor((this.bullet.x + BULLET_W / 2 - GRID_MARGIN_X) / (CELL_W + CELL_GAP));
    if (col < 0 || col >= GRID_COLS) return;
    // この列の中で一番下(自陣に近い)側から、弾のy位置に重なる最初のブロックを探す
    for (let row = GRID_ROWS - 1; row >= 0; row--) {
      if (!this.grid[row][col]) continue;
      const by = cellY(row);
      if (this.bullet.y <= by + CELL_H) {
        this.bullet = null;
        this._resolveHit(row, col);
        return;
      }
      break; // この列で一番下のブロックより下に弾があるのに当たっていない = まだ到達前
    }
  }

  _resolveHit(row, col) {
    let value = this.grid[row][col] * 2;
    let chainIndex = 0;
    let scoreGained = value * this._multiplier(0);
    const touchedCols = new Set([col]);

    for (;;) {
      let mergedAt = null;
      for (const { dr, dc } of NEIGHBOR_ORDER) {
        const nr = row + dr, nc = col + dc;
        if (nr < 0 || nr >= GRID_ROWS || nc < 0 || nc >= GRID_COLS) continue;
        if (this.grid[nr][nc] === value) { mergedAt = { nr, nc }; break; }
      }
      if (!mergedAt) break;
      this.grid[mergedAt.nr][mergedAt.nc] = 0;
      touchedCols.add(mergedAt.nc);
      chainIndex += 1;
      value *= 2;
      scoreGained += value * this._multiplier(chainIndex);
    }

    let popped = false;
    if (value >= POP_THRESHOLD) {
      this.grid[row][col] = 0;
      scoreGained += POP_BONUS;
      popped = true;
      this.events.push('pop');
    } else {
      this.grid[row][col] = value;
    }

    // 合体やポップで空いたマスには、同じ列の上のブロックが重力で落ちてくる。
    // これにより「どの列を撃つか」が実際に盤面の並びを作り変えるようになる。
    for (const c of touchedCols) this._applyGravity(c);

    this.score += scoreGained;
    this.events.push(chainIndex > 0 ? 'merge' : 'hit');
    this.lastResolve = { row, col, finalValue: value, chainIndex, scoreGained, popped };

    if (this.blockCount === 0) {
      this._cleared();
    } else {
      this._checkAmmoOut();
    }
  }

  _applyGravity(col) {
    const values = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      if (this.grid[row][col]) values.push(this.grid[row][col]);
    }
    for (let row = 0; row < GRID_ROWS; row++) this.grid[row][col] = 0;
    let writeRow = GRID_ROWS - 1;
    for (let i = values.length - 1; i >= 0; i--) {
      this.grid[writeRow][col] = values[i];
      writeRow -= 1;
    }
  }

  _checkAmmoOut() {
    if (this.phase === 'playing' && this.shotsUsed >= SHOT_LIMIT) {
      this._gameOver();
    }
  }

  _multiplier(chainIndex) {
    return 1 + chainIndex * CHAIN_MULT_STEP;
  }

  _cleared() {
    this.phase = 'cleared';
    this.events.push('cleared');
    this._saveHighScoreIfRecord();
  }

  _gameOver() {
    this.phase = 'gameOver';
    this.bullet = null;
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

export { MegaMergeGame, POP_THRESHOLD, POP_BONUS, SHOT_LIMIT };
