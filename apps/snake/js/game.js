// SNAKE BYTE - ロジック本体(描画・DOM非依存、update(dt)で駆動する純粋なゲームステート)
// 古典的なスネークゲームへのオマージュとして独自実装。

export const FIELD_W = 240;
export const FIELD_H = 280;
export const CELL = 10;
export const GRID_COLS = FIELD_W / CELL; // 24
export const GRID_ROWS = FIELD_H / CELL; // 28

const BASE_INTERVAL = 0.15; // 秒
const MIN_INTERVAL = 0.075;
const INTERVAL_STEP_PER_FOOD = 0.003;

const START_LENGTH = 4;
const READY_SCREEN_MS = 1200;
const POINTS_PER_FOOD = 10;

const HIGH_SCORE_KEY = 'snakeByte.highScore';

const DIRS = {
  up: { dx: 0, dy: -1 },
  down: { dx: 0, dy: 1 },
  left: { dx: -1, dy: 0 },
  right: { dx: 1, dy: 0 },
};

function isOpposite(a, b) {
  return a.dx === -b.dx && a.dy === -b.dy;
}

class SnakeByteGame {
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
    this.phase = 'idle'; // idle | ready | playing | paused | gameOver
    this.score = 0;
    this.foodEaten = 0;
    this.events = [];
    this._clearReadyTimer();
    this._tickTimer = 0;

    const startX = Math.floor(GRID_COLS / 2);
    const startY = Math.floor(GRID_ROWS / 2);
    this.snake = [];
    for (let i = 0; i < START_LENGTH; i++) {
      this.snake.push({ x: startX - i, y: startY });
    }
    this.dir = DIRS.right;
    this.nextDir = DIRS.right;
    this.food = null;
    this._spawnFood();
  }

  get tickInterval() {
    return Math.max(MIN_INTERVAL, BASE_INTERVAL - this.foodEaten * INTERVAL_STEP_PER_FOOD);
  }

  _spawnFood() {
    const occupied = new Set(this.snake.map((s) => `${s.x},${s.y}`));
    const freeCells = GRID_COLS * GRID_ROWS - occupied.size;
    if (freeCells <= 0) {
      this.food = null; // 盤面を埋め尽くした(事実上のクリア)
      return;
    }
    let x, y;
    do {
      x = Math.floor(Math.random() * GRID_COLS);
      y = Math.floor(Math.random() * GRID_ROWS);
    } while (occupied.has(`${x},${y}`));
    this.food = { x, y };
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

  setDirection(name) {
    const d = DIRS[name];
    if (!d) return;
    if (isOpposite(d, this.dir)) return; // 自分の体へ即Uターンはできない
    this.nextDir = d;
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

  update(dt) {
    if (this.phase !== 'playing') return;
    this._tickTimer += dt;
    const interval = this.tickInterval;
    let stepped = false;
    while (this._tickTimer >= interval && this.phase === 'playing') {
      this._tickTimer -= interval;
      this._step();
      stepped = true;
    }
    if (stepped) this._emit();
  }

  _step() {
    this.dir = this.nextDir;
    const head = this.snake[0];
    const newHead = { x: head.x + this.dir.dx, y: head.y + this.dir.dy };

    if (newHead.x < 0 || newHead.x >= GRID_COLS || newHead.y < 0 || newHead.y >= GRID_ROWS) {
      this._gameOver();
      return;
    }

    const ateFood = this.food && newHead.x === this.food.x && newHead.y === this.food.y;
    const bodyToCheck = ateFood ? this.snake : this.snake.slice(0, -1); // 食べない時は尻尾が動くので衝突対象から除く
    if (bodyToCheck.some((s) => s.x === newHead.x && s.y === newHead.y)) {
      this._gameOver();
      return;
    }

    this.snake.unshift(newHead);
    if (ateFood) {
      this.score += POINTS_PER_FOOD;
      this.foodEaten += 1;
      this.events.push('eat');
      this._spawnFood();
    } else {
      this.snake.pop();
    }
  }

  _gameOver() {
    this.phase = 'gameOver';
    this.events.push('gameOver');
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

export { SnakeByteGame };
