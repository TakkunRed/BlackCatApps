import { MegaMergeGame, FIELD_W, FIELD_H, GRID_ROWS, GRID_COLS, dropColumn, packColumnsLeft } from './game.js';
import { drawField, cellX, cellY } from './render.js';

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
const hiVal = document.getElementById('hiVal');
const shotsVal = document.getElementById('shotsVal');
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
const btnFire = document.getElementById('btnFire');
const btnPause = document.getElementById('btnPause');
const btnSound = document.getElementById('btnSound');

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
    if (ev === 'shoot') beep(500, 50, 'square', 0.04);
    else if (ev === 'hit') beep(320, 60, 'square', 0.04);
    else if (ev === 'miss') beep(180, 40, 'square', 0.025);
    else if (ev === 'merge') {
      const chain = g.lastResolve ? g.lastResolve.chainIndex : 1;
      beep(440 + chain * 120, 90, 'sawtooth', 0.06);
    } else if (ev === 'pop') beep(1000, 220, 'triangle', 0.08);
    else if (ev === 'cleared') beep(700, 500, 'triangle', 0.07);
    else if (ev === 'gameOver') beep(90, 600, 'sawtooth', 0.08);
  }
}

function updateHud() {
  scoreVal.textContent = String(game.score);
  hiVal.textContent = String(game.highScore);
  shotsVal.textContent = String(game.shotsRemaining);
  shotsVal.classList.toggle('danger', game.shotsRemaining <= 20);
}

const OVERLAY_TEXT = {
  idle: ['MEGA MERGE', 'タップしてスタート'],
  ready: ['GET READY', ''],
  paused: ['PAUSE', 'FIREで再開'],
  cleared: ['ALL CLEAR!', 'タップしてもう一度'],
  gameOver: ['OUT OF AMMO', 'タップしてもう一度'],
};

function updateOverlay() {
  if (game.phase === 'playing') {
    overlay.classList.add('hidden');
    return;
  }
  overlay.classList.remove('hidden');
  const [title, sub] = OVERLAY_TEXT[game.phase] || OVERLAY_TEXT.idle;
  overlayTitle.textContent = game.phase === 'ready' ? `HI-SCORE ${game.highScore}` : title;
  if (game.phase === 'cleared' || game.phase === 'gameOver') {
    overlaySub.textContent = `SCORE ${game.score}  (${game.shotsUsed}発使用)\nタップしてもう一度`;
  } else {
    overlaySub.textContent = sub;
  }
}

// --- 合体・重力・列詰めの過程を見せるアニメーション ---
// ロジック(game.js)は即座に最終状態まで計算してしまうので、ここでは
// 「解決前のスナップショット」から出発し、記録されたステップを順番に再生することで
// 連鎖の過程を視覚的に見せる。ゲームの状態そのものには一切手を加えない。
let restGrid = null; // アニメ中でないときの表示用グリッド(常にgame.gridと同期)
let lastSeenResolve = null;
let anim = null;

function cloneGrid(grid) { return grid.map((r) => [...r]); }

const STAGE_DURATIONS = { hit: 150, merge: 190, pop: 240, gravity: 220, shift: 240 };

function startAnimation(g) {
  const stages = [];
  for (const step of g.lastResolveSteps || []) {
    if (step.type === 'hit') stages.push({ kind: 'hit', row: step.row, col: step.col, value: step.value, duration: STAGE_DURATIONS.hit });
    else if (step.type === 'merge') stages.push({ kind: 'merge', from: step.from, at: step.at, value: step.value, duration: STAGE_DURATIONS.merge });
    else if (step.type === 'pop') stages.push({ kind: 'pop', row: step.row, col: step.col, value: step.value, duration: STAGE_DURATIONS.pop });
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
    grid[stage.from.row][stage.from.col] = 0;
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
  const p = ease(Math.min(1, anim.t / stage.duration));
  const skip = new Set();
  const floaters = [];

  if (stage.kind === 'hit') {
    skip.add(`${stage.row},${stage.col}`);
    const scale = 0.7 + 0.3 * p;
    floaters.push({ x: cellX(stage.col), y: cellY(stage.row), value: stage.value, scale, alpha: 1, flash: (1 - p) * 0.6 });
  } else if (stage.kind === 'merge') {
    skip.add(`${stage.at.row},${stage.at.col}`);
    skip.add(`${stage.from.row},${stage.from.col}`);
    // 消える側: 合体先へ吸い込まれるように縮小しながら移動
    const fx = cellX(stage.from.col) + (cellX(stage.at.col) - cellX(stage.from.col)) * p;
    const fy = cellY(stage.from.row) + (cellY(stage.at.row) - cellY(stage.from.row)) * p;
    floaters.push({ x: fx, y: fy, value: anim.grid[stage.from.row][stage.from.col], scale: 1 - p, alpha: 1 - p });
    // 合体先: 新しい数字へパッと切り替わり、一瞬膨らむ
    const scale = p < 0.5 ? 1 + p * 0.4 : 1.2 - (p - 0.5) * 0.4;
    floaters.push({ x: cellX(stage.at.col), y: cellY(stage.at.row), value: stage.value, scale, alpha: 1, flash: (1 - p) * 0.5 });
  } else if (stage.kind === 'pop') {
    skip.add(`${stage.row},${stage.col}`);
    floaters.push({ x: cellX(stage.col), y: cellY(stage.row), value: stage.value, scale: 1 + p * 0.6, alpha: 1 - p, flash: 1 });
  } else if (stage.kind === 'gravity') {
    for (const [colStr, moves] of Object.entries(stage.moves)) {
      const col = Number(colStr);
      for (const m of moves) {
        skip.add(`${m.toRow},${col}`);
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
  }

  // shift段階ではanim.gridの列位置がまだ移動前のままなので、移動元の表示もスキップしておく
  if (stage.kind === 'shift') {
    for (const s of stage.shifts) {
      for (let row = 0; row < GRID_ROWS; row++) skip.add(`${row},${s.fromCol}`);
    }
  }

  return { grid: anim.grid, skip, floaters };
}

function onChange(g) {
  updateHud();
  updateOverlay();
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

// --- 入力: 左右ボタン ---
let heldLeft = false;
let heldRight = false;

function recomputeMoveDir() {
  game.setMoveDir((heldRight ? 1 : 0) - (heldLeft ? 1 : 0));
}

function bindHold(el, onDown, onUp) {
  el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture?.(e.pointerId); onDown(); });
  el.addEventListener('pointerup', onUp);
  el.addEventListener('pointercancel', onUp);
  el.addEventListener('pointerleave', onUp);
}

bindHold(btnLeft, () => { heldLeft = true; recomputeMoveDir(); btnLeft.classList.add('pressed'); },
  () => { heldLeft = false; recomputeMoveDir(); btnLeft.classList.remove('pressed'); });
bindHold(btnRight, () => { heldRight = true; recomputeMoveDir(); btnRight.classList.add('pressed'); },
  () => { heldRight = false; recomputeMoveDir(); btnRight.classList.remove('pressed'); });

let heldFireButton = false;
btnFire.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (tryAdvance()) return;
  heldFireButton = true;
  btnFire.classList.add('pressed');
  if (!anim) game.fire();
});
const releaseFire = () => { heldFireButton = false; btnFire.classList.remove('pressed'); };
btnFire.addEventListener('pointerup', releaseFire);
btnFire.addEventListener('pointercancel', releaseFire);
btnFire.addEventListener('pointerleave', releaseFire);

overlay.addEventListener('click', () => { tryAdvance(); });
btnPause.addEventListener('click', () => { game.togglePause(); });
btnSound.addEventListener('click', () => {
  game.toggleSound();
  btnSound.textContent = game.soundOn ? '♪ SOUND' : '♪ MUTE';
});

// --- 入力: キャンバスを直接ドラッグして自機を操作 ---
let dragging = false;
function canvasXToField(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) * (FIELD_W / rect.width);
}
canvas.addEventListener('pointerdown', (e) => {
  if (tryAdvance()) return;
  dragging = true;
  canvas.setPointerCapture?.(e.pointerId);
  game.setDragTarget(canvasXToField(e.clientX));
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  game.setDragTarget(canvasXToField(e.clientX));
});
const endDrag = () => { dragging = false; game.clearDragTarget(); };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);
canvas.addEventListener('pointerleave', endDrag);

// --- キーボード ---
const keyLeft = new Set(['ArrowLeft', 'a', 'A']);
const keyRight = new Set(['ArrowRight', 'd', 'D']);
const keyFire = new Set([' ', 'Enter']);
const keyPause = new Set(['p', 'P']);

window.addEventListener('keydown', (e) => {
  if (keyLeft.has(e.key)) { e.preventDefault(); if (!e.repeat) { heldLeft = true; recomputeMoveDir(); } return; }
  if (keyRight.has(e.key)) { e.preventDefault(); if (!e.repeat) { heldRight = true; recomputeMoveDir(); } return; }
  if (keyFire.has(e.key)) {
    e.preventDefault();
    if (e.repeat) return;
    if (tryAdvance()) return;
    heldFireButton = true;
    if (!anim) game.fire();
    return;
  }
  if (keyPause.has(e.key)) { e.preventDefault(); if (!e.repeat) game.togglePause(); return; }
});

window.addEventListener('keyup', (e) => {
  if (keyLeft.has(e.key)) { heldLeft = false; recomputeMoveDir(); return; }
  if (keyRight.has(e.key)) { heldRight = false; recomputeMoveDir(); return; }
  if (keyFire.has(e.key)) { heldFireButton = false; return; }
});

// --- ゲームループ ---
let lastT = null;
function loop(t) {
  if (lastT === null) lastT = t;
  let dt = (t - lastT) / 1000;
  lastT = t;
  dt = Math.min(dt, 0.05);

  if (game.phase === 'playing') {
    if (heldFireButton && !anim) game.fire();
    game.update(dt);
  }

  if (anim) {
    advanceAnim(dt * 1000);
    drawField(ctx, game, anim && buildAnimFrame());
  } else {
    drawField(ctx, game);
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
