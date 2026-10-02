// GALAXY SIEGE - ロジック本体(描画・DOM非依存、update(dt)で駆動する純粋なゲームステート)
// 1978年の古典的な固定画面シューティングへのオマージュとして独自実装。
// 元ネタの特定の商標・スプライト画像は使用せず、挙動の再現と独自のピクセルアートで構成している。

export const FIELD_W = 240;
export const FIELD_H = 280;

const GRID_ROWS = 5;
const GRID_COLS = 8;
export const ALIEN_W = 16;
export const ALIEN_H = 10;
const GAP_X = 8;
const GAP_Y = 10;
const FORMATION_TOTAL_W = GRID_COLS * ALIEN_W + (GRID_COLS - 1) * GAP_X;
const FORMATION_START_X = (FIELD_W - FORMATION_TOTAL_W) / 2;
const FORMATION_START_Y = 24;
const ROW_SPACING = ALIEN_H + GAP_Y;

const ALIEN_POINTS_BY_ROW = [30, 20, 20, 10, 10];
const ALIEN_TYPE_BY_ROW = ['squid', 'crab', 'crab', 'octopus', 'octopus'];

export const PLAYER_W = 16;
export const PLAYER_H = 10;
const PLAYER_Y = FIELD_H - 20;
const PLAYER_SPEED = 110; // units/sec

export const BULLET_W = 2;
export const BULLET_H = 8;
const PLAYER_BULLET_SPEED = 220;
const ALIEN_BULLET_SPEED = 100;

export const SHIELD_COLS = 10;
export const SHIELD_ROWS = 6;
export const SHIELD_BLOCK = 3;
const SHIELD_W = SHIELD_COLS * SHIELD_BLOCK;
const SHIELD_Y = FIELD_H - 70;
const SHIELD_COUNT = 4;
// 1=ブロックあり, 0=最初から空(古典的な砦シルエット: ドーム状の上部+下部中央にアーチ状の開口部)
const SHIELD_TEMPLATE = [
  '0001111000',
  '0011111100',
  '0111111110',
  '1111111111',
  '1111111111',
  '1110000111',
];

const INVASION_LINE_Y = SHIELD_Y + SHIELD_ROWS * SHIELD_BLOCK + 6; // ここまで来たら即ゲームオーバー

const LIVES_START = 3;
const READY_SCREEN_MS = 1200;
const WAVE_CLEAR_RESUME_KEYS = null; // (app.js側でキー判定するため未使用)
const RESPAWN_INVULN_MS = 1200;

const BASE_STEP_INTERVAL = 0.9; // 秒。生存数が減るほど短くなる
const MIN_STEP_INTERVAL = 0.08;
const STEP_X = 6;
const STEP_Y = 8;

const UFO_W = 18;
const UFO_H = 8;
const UFO_SPEED = 46;
const UFO_POINTS = [50, 100, 150, 300];

const HIGH_SCORE_KEY = 'galaxySiege.highScore';

function makeShield(x) {
  const cells = [];
  for (let r = 0; r < SHIELD_ROWS; r++) {
    for (let c = 0; c < SHIELD_COLS; c++) {
      cells.push(SHIELD_TEMPLATE[r][c] === '1');
    }
  }
  return { x, y: SHIELD_Y, cells };
}

function shieldIndex(col, row) {
  return row * SHIELD_COLS + col;
}

class GalaxySiegeGame {
  constructor(onChange) {
    this.onChange = onChange || (() => {});
    this.soundOn = true;
    this.highScore = Number(localStorage.getItem(HIGH_SCORE_KEY) || 0);
    this._readyTimer = null;
    this.events = []; // 直近のupdateで発生した効果音トリガー等(app.js側が消費する)
    this.reset();
  }

  reset() {
    this.active = false;
    this.phase = 'idle'; // idle | ready | playing | paused | waveClear | gameOver
    this.wave = 1;
    this.score = 0;
    this.lives = LIVES_START;
    this.events = [];
    this._clearReadyTimer();
    this._setupWave(true);
  }

  _setupWave(resetPlayer) {
    this.aliens = [];
    for (let row = 0; row < GRID_ROWS; row++) {
      for (let col = 0; col < GRID_COLS; col++) {
        this.aliens.push({
          row, col, alive: true,
          x: FORMATION_START_X + col * (ALIEN_W + GAP_X),
          y: FORMATION_START_Y + row * ROW_SPACING,
          type: ALIEN_TYPE_BY_ROW[row],
          points: ALIEN_POINTS_BY_ROW[row],
        });
      }
    }
    this.formationDir = 1;
    this.stepTimer = 0;
    this.animFrame = 0;
    this.pendingDrop = false;

    this.shields = [];
    const spacing = (FIELD_W - SHIELD_COUNT * SHIELD_W) / (SHIELD_COUNT + 1);
    for (let i = 0; i < SHIELD_COUNT; i++) {
      this.shields.push(makeShield(spacing + i * (SHIELD_W + spacing)));
    }

    this.playerBullet = null;
    this.alienBullets = [];
    this.alienShootTimer = 1.2;

    this.ufo = null;
    this.ufoTimer = 8 + Math.random() * 10;

    if (resetPlayer) {
      this.player = { x: (FIELD_W - PLAYER_W) / 2, cooldown: 0, invuln: 0 };
    } else if (this.player) {
      this.player.x = (FIELD_W - PLAYER_W) / 2;
      this.player.invuln = RESPAWN_INVULN_MS / 1000;
    }
  }

  get aliveAliens() {
    return this.aliens.filter((a) => a.alive);
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

  continueAfterWaveClear() {
    if (this.phase !== 'waveClear') return;
    this.wave += 1;
    this._setupWave(false);
    this.phase = 'playing';
    this._emit();
  }

  setMoveDir(dir) {
    // dir: -1 | 0 | 1 (左/停止/右)。update()で毎フレーム呼ぶ想定
    this._moveDir = dir;
  }

  fire() {
    if (this.phase !== 'playing') return;
    if (this.playerBullet) return; // 実機同様、自機弾は同時に1発まで
    this.playerBullet = {
      x: this.player.x + PLAYER_W / 2 - BULLET_W / 2,
      y: PLAYER_Y - BULLET_H,
    };
    this.events.push('playerShoot');
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

    this._updatePlayer(dt);
    this._updateFormation(dt);
    this._updateBullets(dt);
    this._updateUfo(dt);
    this._checkCollisions();
    this._checkInvasion();

    if (this.phase === 'playing' && this.aliveAliens.length === 0) {
      this.phase = 'waveClear';
      this.events.push('waveClear');
    }

    this._emit();
  }

  _updatePlayer(dt) {
    const dir = this._moveDir || 0;
    this.player.x += dir * PLAYER_SPEED * dt;
    this.player.x = Math.max(4, Math.min(FIELD_W - PLAYER_W - 4, this.player.x));
    if (this.player.invuln > 0) this.player.invuln = Math.max(0, this.player.invuln - dt);
    if (this.player.cooldown > 0) this.player.cooldown = Math.max(0, this.player.cooldown - dt);
  }

  _updateFormation(dt) {
    const alive = this.aliveAliens;
    if (alive.length === 0) return;
    const total = GRID_ROWS * GRID_COLS;
    const speedFactor = total / alive.length; // 残り数が減るほど速くなる
    const interval = Math.max(MIN_STEP_INTERVAL, BASE_STEP_INTERVAL / speedFactor / (1 + (this.wave - 1) * 0.15));

    this.stepTimer += dt;
    if (this.stepTimer < interval) return;
    this.stepTimer = 0;
    this.animFrame = this.animFrame === 0 ? 1 : 0;

    if (this.pendingDrop) {
      alive.forEach((a) => { a.y += STEP_Y; });
      this.pendingDrop = false;
      this.events.push('formationStep');
      return;
    }

    let minX = Infinity, maxX = -Infinity;
    for (const a of alive) {
      minX = Math.min(minX, a.x);
      maxX = Math.max(maxX, a.x + ALIEN_W);
    }
    const nextMinX = minX + this.formationDir * STEP_X;
    const nextMaxX = maxX + this.formationDir * STEP_X;

    if (nextMinX < 4 || nextMaxX > FIELD_W - 4) {
      this.formationDir *= -1;
      this.pendingDrop = true;
    } else {
      alive.forEach((a) => { a.x += this.formationDir * STEP_X; });
    }
    this.events.push('formationStep');
  }

  _updateBullets(dt) {
    if (this.playerBullet) {
      this.playerBullet.y -= PLAYER_BULLET_SPEED * dt;
      if (this.playerBullet.y + BULLET_H < 0) this.playerBullet = null;
    }

    this.alienShootTimer -= dt;
    if (this.alienShootTimer <= 0) {
      this._spawnAlienBullet();
      const alive = this.aliveAliens.length || 1;
      const base = Math.max(0.35, 1.6 - this.wave * 0.08);
      this.alienShootTimer = base * (24 / Math.max(6, alive)) * (0.6 + Math.random() * 0.8);
    }

    for (const b of this.alienBullets) {
      b.y += ALIEN_BULLET_SPEED * dt;
    }
    this.alienBullets = this.alienBullets.filter((b) => b.y < FIELD_H);
  }

  _spawnAlienBullet() {
    // 各列で自陣に一番近い(y最大の)生存インベーダーから撃つ
    const byCol = new Map();
    for (const a of this.aliens) {
      if (!a.alive) continue;
      const cur = byCol.get(a.col);
      if (!cur || a.y > cur.y) byCol.set(a.col, a);
    }
    const shooters = Array.from(byCol.values());
    if (shooters.length === 0) return;
    const shooter = shooters[Math.floor(Math.random() * shooters.length)];
    this.alienBullets.push({
      x: shooter.x + ALIEN_W / 2 - BULLET_W / 2,
      y: shooter.y + ALIEN_H,
    });
  }

  _updateUfo(dt) {
    if (this.ufo) {
      this.ufo.x += this.ufo.dir * UFO_SPEED * dt;
      if (this.ufo.x < -UFO_W - 4 || this.ufo.x > FIELD_W + 4) this.ufo = null;
      return;
    }
    this.ufoTimer -= dt;
    if (this.ufoTimer <= 0) {
      const dir = Math.random() < 0.5 ? 1 : -1;
      this.ufo = { x: dir === 1 ? -UFO_W : FIELD_W, y: 10, dir, w: UFO_W, h: UFO_H };
      this.ufoTimer = 14 + Math.random() * 10;
      this.events.push('ufoAppear');
    }
  }

  _rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  _checkCollisions() {
    // 自機弾 vs インベーダー
    if (this.playerBullet) {
      for (const a of this.aliens) {
        if (!a.alive) continue;
        if (this._rectsOverlap(this.playerBullet.x, this.playerBullet.y, BULLET_W, BULLET_H, a.x, a.y, ALIEN_W, ALIEN_H)) {
          a.alive = false;
          this.score += a.points;
          this.playerBullet = null;
          this.events.push('alienKilled');
          break;
        }
      }
    }

    // 自機弾 vs UFO
    if (this.playerBullet && this.ufo) {
      if (this._rectsOverlap(this.playerBullet.x, this.playerBullet.y, BULLET_W, BULLET_H, this.ufo.x, this.ufo.y, this.ufo.w, this.ufo.h)) {
        const pts = UFO_POINTS[Math.floor(Math.random() * UFO_POINTS.length)];
        this.score += pts;
        this.lastUfoPoints = pts;
        this.ufo = null;
        this.playerBullet = null;
        this.events.push('ufoKilled');
      }
    }

    // 自機弾 vs シールド
    if (this.playerBullet) {
      if (this._hitShield(this.playerBullet.x, this.playerBullet.y, BULLET_W, BULLET_H)) {
        this.playerBullet = null;
      }
    }

    // 敵弾 vs シールド / 自機
    this.alienBullets = this.alienBullets.filter((b) => {
      if (this._hitShield(b.x, b.y, BULLET_W, BULLET_H)) return false;
      if (this.player.invuln <= 0 && this._rectsOverlap(b.x, b.y, BULLET_W, BULLET_H, this.player.x, PLAYER_Y, PLAYER_W, PLAYER_H)) {
        this._playerHit();
        return false;
      }
      return true;
    });
  }

  _hitShield(x, y, w, h) {
    for (const shield of this.shields) {
      if (x + w < shield.x || x > shield.x + SHIELD_COLS * SHIELD_BLOCK) continue;
      if (y + h < shield.y || y > shield.y + SHIELD_ROWS * SHIELD_BLOCK) continue;
      const col = Math.floor((x + w / 2 - shield.x) / SHIELD_BLOCK);
      const row = Math.floor((y + h / 2 - shield.y) / SHIELD_BLOCK);
      if (col < 0 || col >= SHIELD_COLS || row < 0 || row >= SHIELD_ROWS) continue;
      if (!shield.cells[shieldIndex(col, row)]) continue;
      // 命中点周辺を少し削る(クレーター状の浸食)
      const neighbors = [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]];
      for (const [dc, dr] of neighbors) {
        const c = col + dc, r = row + dr;
        if (c >= 0 && c < SHIELD_COLS && r >= 0 && r < SHIELD_ROWS) {
          shield.cells[shieldIndex(c, r)] = false;
        }
      }
      this.events.push('shieldHit');
      return true;
    }
    return false;
  }

  _playerHit() {
    this.lives -= 1;
    this.events.push('playerHit');
    if (this.lives <= 0) {
      this._gameOver();
    } else {
      this.player.x = (FIELD_W - PLAYER_W) / 2;
      this.player.invuln = RESPAWN_INVULN_MS / 1000;
    }
  }

  _checkInvasion() {
    if (this.phase !== 'playing') return;
    for (const a of this.aliens) {
      if (a.alive && a.y + ALIEN_H >= INVASION_LINE_Y) {
        this._gameOver();
        return;
      }
    }
  }

  _gameOver() {
    this.phase = 'gameOver';
    this.playerBullet = null;
    this.events.push('gameOver');
    if (this.score > this.highScore) {
      this.highScore = this.score;
      localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore));
    }
  }

  _emit() {
    this.onChange(this);
    this.events = []; // 読み取り済みのイベントは次回に持ち越さない(消費型)
  }
}

export { GalaxySiegeGame, INVASION_LINE_Y, SHIELD_Y };
