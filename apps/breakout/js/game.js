// BRICK BLITZ - ロジック本体(描画・DOM非依存、update(dt)で駆動する純粋なゲームステート)
// 1976年の古典的なブロック崩しへのオマージュとして独自実装。
// 特定の商標名・画像は使用していない。

export const FIELD_W = 240;
export const FIELD_H = 280;

export const PADDLE_W = 40;
export const PADDLE_H = 6;
const PADDLE_Y = FIELD_H - 16;
const PADDLE_SPEED = 170; // units/sec (ボタン/キーボード操作時)

export const BALL_SIZE = 4;
const BASE_BALL_SPEED = 100;
const SPEED_STEP = 1.08; // レベルごとの加速率
const MAX_BALL_SPEED = 230;
const MAX_BOUNCE_ANGLE = (62 * Math.PI) / 180; // パドル端で跳ね返る最大角度

const BRICK_ROWS = 6;
const BRICK_COLS = 8;
export const BRICK_GAP = 2;
const BRICK_MARGIN_X = 8;
const BRICK_START_Y = 28;
export const BRICK_W = (FIELD_W - BRICK_MARGIN_X * 2 - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS;
export const BRICK_H = 10;
const ROW_POINTS = [60, 50, 40, 30, 20, 10];

const LIVES_START = 3;
const READY_SCREEN_MS = 1200;

const HIGH_SCORE_KEY = 'brickBlitz.highScore';

class BrickBlitzGame {
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
    this.phase = 'idle'; // idle | ready | playing | paused | levelClear | gameOver
    this.level = 1;
    this.score = 0;
    this.lives = LIVES_START;
    this.events = [];
    this._clearReadyTimer();
    this.paddle = { x: (FIELD_W - PADDLE_W) / 2 };
    this._moveDir = 0;
    this._dragTargetX = null;
    this._setupLevel();
  }

  _setupLevel() {
    this.bricks = [];
    for (let row = 0; row < BRICK_ROWS; row++) {
      for (let col = 0; col < BRICK_COLS; col++) {
        this.bricks.push({
          row, col, alive: true,
          x: BRICK_MARGIN_X + col * (BRICK_W + BRICK_GAP),
          y: BRICK_START_Y + row * (BRICK_H + BRICK_GAP),
          points: ROW_POINTS[row],
        });
      }
    }
    this._attachBall();
  }

  _attachBall() {
    this.ballAttached = true;
    this.ball = {
      x: this.paddle.x + PADDLE_W / 2 - BALL_SIZE / 2,
      y: PADDLE_Y - BALL_SIZE,
      vx: 0,
      vy: 0,
    };
  }

  get aliveBricks() {
    return this.bricks.filter((b) => b.alive);
  }

  get ballSpeed() {
    return Math.min(MAX_BALL_SPEED, BASE_BALL_SPEED * Math.pow(SPEED_STEP, this.level - 1));
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

  continueAfterLevelClear() {
    if (this.phase !== 'levelClear') return;
    this.level += 1;
    this._setupLevel();
    this.phase = 'playing';
    this._emit();
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

  fire() {
    if (this.phase !== 'playing') return;
    if (!this.ballAttached) return;
    this.ballAttached = false;
    const angle = (Math.random() * 0.5 - 0.25); // わずかにランダムな初速角度
    const speed = this.ballSpeed;
    this.ball.vx = speed * Math.sin(angle);
    this.ball.vy = -speed * Math.cos(angle);
    this.events.push('launch');
    this._emit();
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

    this._updatePaddle(dt);
    if (this.ballAttached) {
      this.ball.x = this.paddle.x + PADDLE_W / 2 - BALL_SIZE / 2;
      this.ball.y = PADDLE_Y - BALL_SIZE;
    } else {
      this._updateBall(dt);
    }

    if (this.phase === 'playing' && this.aliveBricks.length === 0) {
      this.phase = 'levelClear';
      this.events.push('levelClear');
    }

    this._emit();
  }

  _updatePaddle(dt) {
    if (this._dragTargetX !== null) {
      this.paddle.x = this._dragTargetX - PADDLE_W / 2;
    } else {
      this.paddle.x += this._moveDir * PADDLE_SPEED * dt;
    }
    this.paddle.x = Math.max(2, Math.min(FIELD_W - PADDLE_W - 2, this.paddle.x));
  }

  _updateBall(dt) {
    const b = this.ball;
    b.x += b.vx * dt;
    b.y += b.vy * dt;

    if (b.x <= 0) { b.x = 0; b.vx = Math.abs(b.vx); this.events.push('wallHit'); }
    else if (b.x + BALL_SIZE >= FIELD_W) { b.x = FIELD_W - BALL_SIZE; b.vx = -Math.abs(b.vx); this.events.push('wallHit'); }
    if (b.y <= 0) { b.y = 0; b.vy = Math.abs(b.vy); this.events.push('wallHit'); }

    // パドル判定
    if (
      b.vy > 0 &&
      b.y + BALL_SIZE >= PADDLE_Y &&
      b.y + BALL_SIZE <= PADDLE_Y + PADDLE_H + 6 &&
      b.x + BALL_SIZE >= this.paddle.x &&
      b.x <= this.paddle.x + PADDLE_W
    ) {
      const hitPos = (b.x + BALL_SIZE / 2 - (this.paddle.x + PADDLE_W / 2)) / (PADDLE_W / 2); // -1..1
      const clamped = Math.max(-1, Math.min(1, hitPos));
      const angle = clamped * MAX_BOUNCE_ANGLE;
      const speed = this.ballSpeed;
      b.vx = speed * Math.sin(angle);
      b.vy = -speed * Math.cos(angle);
      b.y = PADDLE_Y - BALL_SIZE;
      this.events.push('paddleHit');
    }

    this._checkBrickCollision();

    if (b.y > FIELD_H) {
      this._loseLife();
    }
  }

  _checkBrickCollision() {
    const b = this.ball;
    for (const brick of this.bricks) {
      if (!brick.alive) continue;
      if (
        b.x < brick.x + BRICK_W &&
        b.x + BALL_SIZE > brick.x &&
        b.y < brick.y + BRICK_H &&
        b.y + BALL_SIZE > brick.y
      ) {
        brick.alive = false;
        this.score += brick.points;
        this.events.push('brickHit');

        const overlapX = Math.min(b.x + BALL_SIZE - brick.x, brick.x + BRICK_W - b.x);
        const overlapY = Math.min(b.y + BALL_SIZE - brick.y, brick.y + BRICK_H - b.y);
        if (overlapX < overlapY) {
          b.vx = -b.vx;
        } else {
          b.vy = -b.vy;
        }
        break; // 1フレームにつき1ブロックまで
      }
    }
  }

  _loseLife() {
    this.lives -= 1;
    this.events.push('lifeLost');
    if (this.lives <= 0) {
      this._gameOver();
    } else {
      this._attachBall();
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

export { BrickBlitzGame };
