import {
  MegaMergeGame, FIELD_W, FIELD_H, GRID_ROWS, GRID_COLS, GRID_MARGIN_X, GRID_TOP_Y, CELL_W, CELL_H, CELL_GAP,
  SHOT_LIMIT, dropColumn, packColumnsLeft, cellX, cellY, frontmostRow, setGridSize, getBestShots,
} from './game.js';
import { drawField } from './render.js';

const game = new MegaMergeGame(onChange);
window.__mmDebug = game; // devtoolsから状態確認する用(ゲームプレイには影響しない)

const canvas = document.getElementById('gameCanvas');
canvas.width = FIELD_W;
canvas.height = FIELD_H;
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const scoreVal = document.getElementById('scoreVal');
const targetVal = document.getElementById('targetVal');
const shotsVal = document.getElementById('shotsVal');
const btnPause = document.getElementById('btnPause');
const btnSound = document.getElementById('btnSound');
const sizeButtons = Array.from(document.querySelectorAll('.size-btn'));

let audioCtx = null;
function beep(freq, durationMs, type = 'square', gainVal = 0.05) {
  if (!game.soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = gainVal;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durationMs / 1000);
    osc.stop(audioCtx.currentTime + durationMs / 1000);
  } catch (_) { /* no-op */ }
}

function playEvents(events, g) {
  for (const ev of events) {
    if (ev === 'shoot') beep(500, 40, 'square', 0.03);
    else if (ev === 'hit') beep(320, 60, 'square', 0.04);
    else if (ev === 'merge') {
      const chain = g.lastResolve ? g.lastResolve.chainIndex : 1;
      beep(440 + chain * 120, 90, 'sawtooth', 0.06);
    } else if (ev === 'pop') beep(1000, 220, 'triangle', 0.08);
    else if (ev === 'cleared') beep(700, 500, 'triangle', 0.07);
    else if (ev === 'newBest') { beep(700, 300, 'triangle', 0.07); beep(1050, 400, 'triangle', 0.08); }
    else if (ev === 'gameOver') beep(90, 600, 'sawtooth', 0.08);
  }
}

function updateHud() {
  scoreVal.textContent = String(game.score);
  targetVal.textContent = game.parTarget != null ? String(game.parTarget) : '--';
  shotsVal.textContent = `${game.shotsUsed}/${SHOT_LIMIT}`;
  const overTarget = game.parTarget != null && game.shotsUsed > game.parTarget;
  shotsVal.classList.toggle('over-target', overTarget);
  shotsVal.classList.toggle('danger', game.shotsRemaining <= Math.round(SHOT_LIMIT * 0.15));
}

function refreshSizeButtons() {
  for (const btn of sizeButtons) {
    const rows = Number(btn.dataset.rows);
    const cols = Number(btn.dataset.cols);
    const best = getBestShots(rows, cols);
    btn.querySelector('.size-best').textContent = best != null ? `BEST ${best}` : '--';
    btn.classList.toggle('active', rows === GRID_ROWS && cols === GRID_COLS);
  }
}

const OVERLAY_TEXT = {
  idle: ['MEGA MERGE', 'タップしてスタート'],
  ready: ['GET READY', ''],
  paused: ['PAUSE', 'タップで再開'],
  cleared: ['ALL CLEAR!', ''],
  gameOver: ['OUT OF AMMO', 'タップしてもう一度'],
};

function updateOverlay() {
  if (game.phase === 'playing') {
    overlay.classList.add('hidden');
    return;
  }
  overlay.classList.remove('hidden');
  const [title, sub] = OVERLAY_TEXT[game.phase] || OVERLAY_TEXT.idle;
  const isNewBest = game.events && game.events.includes('newBest');
  overlayTitle.textContent = game.phase === 'ready'
    ? `HI-SCORE ${game.highScore}`
    : (game.phase === 'cleared' && isNewBest ? 'NEW BEST!!' : title);
  if (game.phase === 'cleared') {
    const beat = game.parTarget != null && game.shotsUsed <= game.parTarget;
    const diff = game.parTarget != null ? Math.abs(game.shotsUsed - game.parTarget) : null;
    const line2 = game.parTarget == null
      ? ''
      : beat
        ? `TARGET ${game.parTarget}発 達成!(${diff}発の余裕)`
        : `TARGET ${game.parTarget}発(あと${diff}発及ばず)`;
    const line3 = `${game.rows}×${game.cols} 自己ベスト: ${game.bestShots}発${isNewBest ? ' (更新!)' : ''}`;
    overlaySub.textContent = `SCORE ${game.score}  (${game.shotsUsed}発使用)\n${line2}\n${line3}\nタップしてもう一度`;
  } else if (game.phase === 'gameOver') {
    overlaySub.textContent = `SCORE ${game.score}  (${game.shotsUsed}発使用)\nタップしてもう一度`;
  } else {
    overlaySub.textContent = sub;
  }
}

function onChange(g) {
  updateHud();
  updateOverlay();
  refreshSizeButtons();
  if (g.events && g.events.length) playEvents(g.events, g);

  if (g.lastResolve && g.lastResolve !== lastSeenResolve) {
    lastSeenResolve = g.lastResolve;
    startAnimation(g);
  } else if (!anim) {
    restGrid = cloneGrid(g.grid);
  }
}

function tryAdvance() {
  if (!game.active || game.phase === 'cleared' || game.phase === 'gameOver') { game.start(); return true; }
  if (game.phase === 'paused') { game.resume(); return true; }
  return false;
}

// --- 合体・重力・列詰めの過程を見せるアニメーション ---
// ロジック(game.js)は即座に最終状態まで計算してしまうので、ここでは
// 「解決前のスナップショット」から出発し、記録されたステップを順番に再生することで
// 連鎖の過程を視覚的に見せる。ゲームの状態そのものには一切手を加えない。
let restGrid = null; // アニメ中でないときの表示用グリッド(常にgame.gridと同期)
let lastSeenResolve = null;
let anim = null;

function cloneGrid(grid) { return grid.map((r) => [...r]); }

// v5: 「連続合体したのか分からない」「もっとゆっくり、インパクトを付けて」という指摘を受け、
// (1) 各段階の表示時間を全体的に延ばし、(2) 連鎖(同じ一撃の中で合体がさらに合体を呼ぶ)が
// 2回目以降に入るたびに一拍の間(pauseステージ)を置いて、各合体がそれぞれ独立した出来事として
// 見えるようにし、(3) 「CHAIN 2」「×3」のようなラベルをその場に浮かせて明示するようにした。
const STAGE_DURATIONS = { hit: 190, merge: 280, pop: 320, gravity: 260, shift: 280, chainPause: 130 };

function startAnimation(g) {
  const stages = [];
  let mergeStepIndex = 0;
  for (const step of g.lastResolveSteps || []) {
    if (step.type === 'hit') {
      stages.push({ kind: 'hit', row: step.row, col: step.col, value: step.value, duration: STAGE_DURATIONS.hit });
    } else if (step.type === 'merge') {
      mergeStepIndex += 1;
      if (mergeStepIndex >= 2) {
        // 2回目以降の合体(=連鎖)の直前に一拍置いて、前の合体と混ざって見えないようにする。
        stages.push({ kind: 'pause', duration: STAGE_DURATIONS.chainPause });
      }
      // 同時に吸収したブロックが多いほど、連鎖が深いほど、しっかり見えるよう長めに見せる。
      const duration = STAGE_DURATIONS.merge + Math.max(0, step.from.length - 1) * 80 + (mergeStepIndex - 1) * 60;
      stages.push({ kind: 'merge', from: step.from, at: step.at, value: step.value, duration, chainStep: mergeStepIndex });
    } else if (step.type === 'pop') {
      stages.push({ kind: 'pop', row: step.row, col: step.col, value: step.value, duration: STAGE_DURATIONS.pop });
    }
  }
  if (g.lastGravityMoves && Object.keys(g.lastGravityMoves).length) {
    stages.push({ kind: 'gravity', moves: g.lastGravityMoves, duration: STAGE_DURATIONS.gravity });
  }
  if (g.lastColumnShift && g.lastColumnShift.length) {
    stages.push({ kind: 'shift', shifts: g.lastColumnShift, duration: STAGE_DURATIONS.shift });
  }
  if (!stages.length || !restGrid) return;

  anim = { stages, index: 0, t: 0, grid: cloneGrid(restGrid) };
}

// 1段階が完了した時点のグリッドを確定させる(見た目の「結果」を次の段階の出発点にする)
function applyStageEnd(grid, stage) {
  if (stage.kind === 'hit') {
    grid[stage.row][stage.col] = stage.value;
  } else if (stage.kind === 'merge') {
    for (const f of stage.from) grid[f.row][f.col] = 0;
    grid[stage.at.row][stage.at.col] = stage.value;
  } else if (stage.kind === 'pop') {
    grid[stage.row][stage.col] = 0;
  } else if (stage.kind === 'gravity') {
    for (const col of Object.keys(stage.moves)) dropColumn(grid, Number(col), GRID_ROWS);
  } else if (stage.kind === 'shift') {
    const { grid: packed } = packColumnsLeft(grid, GRID_ROWS, GRID_COLS);
    for (let r = 0; r < GRID_ROWS; r++) for (let c = 0; c < GRID_COLS; c++) grid[r][c] = packed[r][c];
  }
}

function advanceAnim(dtMs) {
  if (!anim) return;
  anim.t += dtMs;
  const stage = anim.stages[anim.index];
  if (anim.t < stage.duration) return;
  applyStageEnd(anim.grid, stage);
  anim.index += 1;
  anim.t = 0;
  if (anim.index >= anim.stages.length) {
    restGrid = cloneGrid(game.grid);
    anim = null;
  }
}

function ease(p) { return 1 - Math.pow(1 - p, 2); } // easeOutQuad

// 現在のアニメーション段階から、描画用の(グリッド上書き・スキップ対象・フローター)を組み立てる
function buildAnimFrame() {
  const stage = anim.stages[anim.index];
  const rawP = Math.min(1, anim.t / stage.duration);
  const p = ease(rawP);
  const skip = new Set();
  const floaters = [];
  let chainLabel = null;

  if (stage.kind === 'hit') {
    skip.add(`${stage.row},${stage.col}`);
    const scale = 0.7 + 0.3 * p;
    floaters.push({ x: cellX(stage.col), y: cellY(stage.row), value: stage.value, scale, alpha: 1, flash: (1 - p) * 0.6 });
  } else if (stage.kind === 'merge') {
    // 前後左右で同時に一致したブロックは全部同時に(一気に)中心へ飛び込んでいく演出。
    // 隣接マス分の移動距離はもともと短いので、縮小・フェードは終盤に一気に効かせて
    // (p^3)、「ほぼ原寸のまま飛び込んで直前でスッと消える」見え方にして視認性を上げる。
    skip.add(`${stage.at.row},${stage.at.col}`);
    // 中心ブロック(弾むパンチ演出)を先に描き、飛び込んでくるブロックは後から描く。
    // 逆順だと、終盤に中心が大きく膨らんだときに飛び込み中のブロックが下に隠れてしまう。
    const punch = 0.4 + Math.max(0, stage.from.length - 1) * 0.18; // 同時吸収が多いほど大きく弾む
    const scale = p < 0.5 ? 1 + p * punch : (1 + punch / 2) - (p - 0.5) * punch;
    const flashBoost = Math.min(1, 0.5 + (stage.from.length - 1) * 0.15);
    floaters.push({ x: cellX(stage.at.col), y: cellY(stage.at.row), value: stage.value, scale, alpha: 1, flash: (1 - p) * flashBoost });

    const shrink = 1 - p * p * p;
    for (const f of stage.from) {
      skip.add(`${f.row},${f.col}`);
      const fx = cellX(f.col) + (cellX(stage.at.col) - cellX(f.col)) * p;
      const fy = cellY(f.row) + (cellY(stage.at.row) - cellY(f.row)) * p;
      floaters.push({ x: fx, y: fy, value: anim.grid[f.row][f.col], scale: shrink, alpha: shrink });
    }

    // 「連続合体した」「一気に合体した」ことを一目で分かるように、CHAIN/×N ラベルを浮かせる。
    if (stage.chainStep >= 2 || stage.from.length >= 2) {
      const parts = [];
      if (stage.chainStep >= 2) parts.push(`CHAIN ${stage.chainStep}`);
      if (stage.from.length >= 2) parts.push(`×${stage.from.length}`);
      const fadeIn = Math.min(1, rawP / 0.25);
      const fadeOut = rawP > 0.7 ? Math.max(0, 1 - (rawP - 0.7) / 0.3) : 1;
      const riseP = ease(Math.min(1, rawP / 0.3));
      chainLabel = {
        text: parts.join('  '),
        x: cellX(stage.at.col) + CELL_W / 2,
        y: cellY(stage.at.row) - 6 - riseP * 10,
        alpha: Math.min(fadeIn, fadeOut),
        scale: 0.85 + riseP * 0.25,
      };
    }
  } else if (stage.kind === 'pop') {
    skip.add(`${stage.row},${stage.col}`);
    floaters.push({ x: cellX(stage.col), y: cellY(stage.row), value: stage.value, scale: 1 + p * 0.6, alpha: 1 - p, flash: 1 });
  } else if (stage.kind === 'gravity') {
    for (const [colStr, moves] of Object.entries(stage.moves)) {
      const col = Number(colStr);
      for (const m of moves) {
        skip.add(`${m.toRow},${col}`);
        skip.add(`${m.fromRow},${col}`); // 移動元にも静止画が残らないようにする
        const y = cellY(m.fromRow) + (cellY(m.toRow) - cellY(m.fromRow)) * p;
        floaters.push({ x: cellX(col), y, value: m.value, scale: 1, alpha: 1 });
      }
    }
  } else if (stage.kind === 'shift') {
    for (const s of stage.shifts) {
      for (let row = 0; row < GRID_ROWS; row++) {
        const v = anim.grid[row][s.fromCol];
        if (!v) continue;
        skip.add(`${row},${s.toCol}`);
        const x = cellX(s.fromCol) + (cellX(s.toCol) - cellX(s.fromCol)) * p;
        floaters.push({ x, y: cellY(row), value: v, scale: 1, alpha: 1 });
      }
    }
    for (const s of stage.shifts) {
      for (let row = 0; row < GRID_ROWS; row++) skip.add(`${row},${s.fromCol}`);
    }
  }

  return { grid: anim.grid, skip, floaters, chainLabel };
}

// --- 入力: 盤面上のどのブロックでも直接タップ/クリックすると即座に解決する ---
function xToColumn(x) {
  const col = Math.floor((x - GRID_MARGIN_X) / (CELL_W + CELL_GAP));
  if (col < 0 || col >= GRID_COLS) return null;
  return col;
}
function yToRow(y) {
  const row = Math.floor((y - GRID_TOP_Y) / (CELL_H + CELL_GAP));
  if (row < 0 || row >= GRID_ROWS) return null;
  return row;
}
function clientXToField(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) * (FIELD_W / rect.width);
}
function clientYToField(clientY) {
  const rect = canvas.getBoundingClientRect();
  return (clientY - rect.top) * (FIELD_H / rect.height);
}
function eventToCell(e) {
  const col = xToColumn(clientXToField(e.clientX));
  const row = yToRow(clientYToField(e.clientY));
  if (col === null || row === null) return null;
  return { row, col };
}

let hoverCell = null;

canvas.addEventListener('pointerdown', (e) => {
  if (tryAdvance()) return;
  if (anim) return; // アニメーション再生中は次の入力を受け付けない
  const cell = eventToCell(e);
  if (cell) game.shoot(cell.row, cell.col);
});
canvas.addEventListener('pointermove', (e) => {
  hoverCell = eventToCell(e);
});
canvas.addEventListener('pointerleave', () => { hoverCell = null; });

overlay.addEventListener('click', () => { tryAdvance(); });
btnPause.addEventListener('click', () => { game.togglePause(); });
btnSound.addEventListener('click', () => {
  game.toggleSound();
  btnSound.textContent = game.soundOn ? '♪ SOUND' : '♪ MUTE';
});

// --- 盤面サイズの選択: 4×4 / 5×5 / 6×6。サイズごとに自己ベスト(最小ショット数)を記録する ---
for (const btn of sizeButtons) {
  btn.addEventListener('click', () => {
    if (anim) return; // アニメーション再生中の切り替えは状態がずれるので無視する
    const rows = Number(btn.dataset.rows);
    const cols = Number(btn.dataset.cols);
    if (rows === GRID_ROWS && cols === GRID_COLS && game.active) return;
    setGridSize(rows, cols);
    refreshSizeButtons();
    game.start();
  });
}
refreshSizeButtons();

// --- キーボード: 数字キー1〜6でその列の一番手前のブロックを撃つ、Pで一時停止 ---
window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (tryAdvance()) return;
  if (e.key >= '1' && e.key <= String(GRID_COLS)) {
    if (!anim) {
      const col = Number(e.key) - 1;
      const row = frontmostRow(game.grid, col);
      if (row !== -1) game.shoot(row, col);
    }
    return;
  }
  if (e.key === 'p' || e.key === 'P') { game.togglePause(); return; }
});

// --- 描画ループ(入力に対する即時解決なので、常時のゲームロジック更新は不要) ---
let lastT = null;
function loop(t) {
  if (lastT === null) lastT = t;
  const dt = Math.min((t - lastT) / 1000, 0.05);
  lastT = t;

  if (anim) {
    advanceAnim(dt * 1000);
    drawField(ctx, game, anim && buildAnimFrame(), hoverCell);
  } else {
    drawField(ctx, game, null, hoverCell);
  }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

updateHud();
updateOverlay();

if ('serviceWorker' in navigator) {
  let reloadedForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (reloadedForUpdate) return;
    reloadedForUpdate = true;
    window.location.reload();
  });
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
