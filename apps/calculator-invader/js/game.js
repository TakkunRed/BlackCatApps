// デジタルバトルゲーム(インベーダー)のロジック
// CASIO SL-880 取扱説明書に記載のルールを参考にした再現実装。
// 出典: https://support.casio.jp/storage/pdf/004/SL-880_WA_JA.pdf
//
// 複数のインベーダーが列(レーン)に並んで同時に自陣へ接近してくる。
// field[0] が自陣に一番近いレーン、field[laneCount-1] が一番遠い(出現したばかりの)レーン。

const STAGE_LANES = { 1: 6, 2: 5 };
const MAX_LANES = 6;
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
    this.pendingBonus = null; // UFO出現待ち
    this.field = new Array(MAX_LANES).fill(null); // 自陣に並んで接近してくるインベーダー
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
    this.pendingBonus = null;
    this.roundScore = 0;
    this.shotsThisRound = 0;
    this.sumDestroyedThisRound = 0;
    this.field = new Array(MAX_LANES).fill(null);
    this._clearTimer();
    this.timer = setInterval(() => this._tick(), this._tickInterval());
  }

  _tickInterval() {
    const ms = BASE_TICK_MS - (this.round - 1) * TICK_STEP_MS;
    return Math.max(MIN_TICK_MS, ms);
  }

  _clearTimer() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  _spawnValue() {
    if (this.pendingBonus) {
      const bonus = this.pendingBonus;
      this.pendingBonus = null;
      return bonus;
    }
    if (this.queue.length > 0) {
      return { value: this.queue.shift(), isUFO: false };
    }
    return null;
  }

  _tick() {
    const laneCount = this.laneCount;
    // 自陣に一番近いレーンのインベーダーは、このtickで自陣に到達する
    const breached = this.field[0];
    for (let i = 0; i < laneCount - 1; i++) {
      this.field[i] = this.field[i + 1];
    }
    this.field[laneCount - 1] = this._spawnValue();
    for (let i = laneCount; i < MAX_LANES; i++) this.field[i] = null;

    if (breached && !breached.isUFO) {
      this.lives -= 1;
      if (this.lives <= 0) {
        this._gameOver();
        return;
      }
    }

    this._checkRoundClear();
    this._emit();
  }

  _checkRoundClear() {
    if (this.phase !== 'playing') return;
    const laneCount = this.laneCount;
    const fieldEmpty = this.field.slice(0, laneCount).every((v) => v === null);
    if (this.queue.length === 0 && !this.pendingBonus && fieldEmpty) {
      this._roundClear();
    }
  }

  aim() {
    if (this.phase !== 'playing') return;
    this.aimIndex = (this.aimIndex + 1) % AIM_SEQUENCE.length;
    this._emit();
  }

  fire() {
    if (this.phase !== 'playing') return;
    this.shotsThisRound += 1;

    const laneCount = this.laneCount;
    let hitIndex = -1;
    for (let i = 0; i < laneCount; i++) {
      const occ = this.field[i];
      if (!occ) continue;
      const matches = (occ.isUFO && this.aimValue === 'n') || (!occ.isUFO && occ.value === this.aimValue);
      if (matches) { hitIndex = i; break; }
    }

    if (hitIndex !== -1) {
      const occ = this.field[hitIndex];
      const table = STAGE_SCORE_TABLE[this.stage];
      const points = occ.isUFO ? UFO_BONUS : table[hitIndex];
      this.roundScore += points;
      this.totalScore += points;

      if (!occ.isUFO) {
        this.sumDestroyedThisRound += Number(occ.value);
        if (this.sumDestroyedThisRound > 0 && this.sumDestroyedThisRound % 10 === 0 && !this.pendingBonus && Math.random() < 0.6) {
          this.pendingBonus = { value: 'n', isUFO: true };
          this.sumDestroyedThisRound = 0;
        }
      }

      this.field[hitIndex] = null;
      this._checkRoundClear();
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

export { InvaderGame, AIM_SEQUENCE, MAX_LANES };
