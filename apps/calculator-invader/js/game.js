// デジタルバトルゲーム(インベーダー)のロジック
// CASIO SL-880 取扱説明書に記載のルールを参考にした再現実装。
// 出典: https://support.casio.jp/storage/pdf/004/SL-880_WA_JA.pdf

const STAGE_LANES = { 1: 6, 2: 5 };
const STAGE_SCORE_TABLE = {
  1: [10, 20, 30, 40, 50, 60],
  2: [20, 40, 60, 80, 100],
};
const UFO_BONUS = 300;
const INVADERS_PER_ROUND = 16;
const MAX_SHOTS_PER_ROUND = 30;
const START_LIVES = 3;
const BASE_TICK_MS = 1100;
const MIN_TICK_MS = 420;
const TICK_STEP_MS = 70;
const HIGH_SCORE_KEY = 'calculatorInvader.highScore';

const AIM_SEQUENCE = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'n'];

class InvaderGame {
  constructor(onChange) {
    this.onChange = onChange || (() => {});
    this.timer = null;
    this.soundOn = true;
    this.highScore = Number(localStorage.getItem(HIGH_SCORE_KEY) || 0);
    this.reset();
  }

  reset() {
    this.active = false;
    this.phase = 'idle'; // idle | playing | roundClear | gameOver
    this.stage = 1;
    this.round = 1;
    this.lives = START_LIVES;
    this.totalScore = 0;
    this.roundScore = 0;
    this.shotsThisRound = 0;
    this.sumDestroyedThisRound = 0;
    this.aimIndex = 0;
    this.queue = [];
    this.current = null; // { value: '0'-'9', lane, isUFO }
    this._clearTimer();
  }

  get laneCount() {
    return STAGE_LANES[this.stage];
  }

  get aimValue() {
    return AIM_SEQUENCE[this.aimIndex];
  }

  start() {
    this.reset();
    this.active = true;
    this.phase = 'playing';
    this._startRound();
    this._emit();
  }

  quit() {
    this._clearTimer();
    this.active = false;
    this.phase = 'idle';
    this._emit();
  }

  _startRound() {
    this.queue = Array.from({ length: INVADERS_PER_ROUND }, () => String(Math.floor(Math.random() * 10)));
    this.roundScore = 0;
    this.shotsThisRound = 0;
    this.sumDestroyedThisRound = 0;
    this._spawnNext();
  }

  _tickInterval() {
    const ms = BASE_TICK_MS - (this.round - 1) * TICK_STEP_MS;
    return Math.max(MIN_TICK_MS, ms);
  }

  _spawnNext(forceUfo = false) {
    this._clearTimer();
    if (!forceUfo && this.queue.length === 0) {
      this._roundClear();
      return;
    }
    if (forceUfo) {
      this.current = { value: 'n', lane: this.laneCount, isUFO: true };
    } else {
      const value = this.queue.shift();
      this.current = { value, lane: this.laneCount, isUFO: false };
    }
    this.timer = setInterval(() => this._tick(), this._tickInterval());
  }

  _clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  _tick() {
    if (!this.current) return;
    this.current.lane -= 1;
    if (this.current.lane <= 0) {
      this._clearTimer();
      this.lives -= 1;
      this.current = null;
      if (this.lives <= 0) {
        this._gameOver();
      } else {
        this._spawnNext();
      }
    }
    this._emit();
  }

  aim() {
    if (this.phase !== 'playing') return;
    this.aimIndex = (this.aimIndex + 1) % AIM_SEQUENCE.length;
    this._emit();
  }

  fire() {
    if (this.phase !== 'playing' || !this.current) return;
    this.shotsThisRound += 1;

    const hit =
      (this.current.isUFO && this.aimValue === 'n') ||
      (!this.current.isUFO && this.aimValue === this.current.value);

    if (hit) {
      const lane = this.current.lane;
      const table = STAGE_SCORE_TABLE[this.stage];
      const points = this.current.isUFO ? UFO_BONUS : table[Math.min(lane, table.length) - 1] || table[0];
      this.roundScore += points;
      this.totalScore += points;

      if (!this.current.isUFO) {
        this.sumDestroyedThisRound += Number(this.current.value);
      }

      this._clearTimer();
      this.current = null;

      const shouldSpawnUfo =
        !this.current &&
        this.sumDestroyedThisRound > 0 &&
        this.sumDestroyedThisRound % 10 === 0 &&
        Math.random() < 0.6;

      if (shouldSpawnUfo) {
        this.sumDestroyedThisRound = 0; // 連続UFO出現を防ぐ
        this._spawnNext(true);
      } else {
        this._spawnNext();
      }
    }

    if (this.shotsThisRound >= MAX_SHOTS_PER_ROUND && this.phase === 'playing') {
      this._gameOver();
      return;
    }

    this._emit();
  }

  _roundClear() {
    this._clearTimer();
    this.phase = 'roundClear';
    this._emit();
  }

  continueAfterRoundClear() {
    if (this.phase !== 'roundClear') return;
    this.round += 1;
    if (this.round > 9) {
      this.round = 1;
      this.stage = this.stage === 1 ? 2 : 1;
    }
    this.phase = 'playing';
    this.aimIndex = 0;
    this._startRound();
    this._emit();
  }

  _gameOver() {
    this._clearTimer();
    this.phase = 'gameOver';
    this.current = null;
    if (this.totalScore > this.highScore) {
      this.highScore = this.totalScore;
      localStorage.setItem(HIGH_SCORE_KEY, String(this.highScore));
    }
    this._emit();
  }

  toggleSound() {
    this.soundOn = !this.soundOn;
    this._emit();
  }

  _emit() {
    this.onChange(this);
  }
}

export { InvaderGame, AIM_SEQUENCE };
