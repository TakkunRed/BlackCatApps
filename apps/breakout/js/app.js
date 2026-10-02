import { BrickBlitzGame, FIELD_W, FIELD_H } from './game.js';
import { drawField } from './render.js';

const game = new BrickBlitzGame(onChange);
window.__bbDebug = game; // devtoolsから状態確認する用(ゲームプレイには影響しない)

const canvas = document.getElementById('gameCanvas');
canvas.width = FIELD_W;
canvas.height = FIELD_H;
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const scoreVal = document.getElementById('scoreVal');
const hiVal = document.getElementById('hiVal');
const levelVal = document.getElementById('levelVal');
const livesRow = document.getElementById('livesRow');
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

function playEvents(events) {
  for (const ev of events) {
    if (ev === 'launch') beep(500, 60, 'square', 0.04);
    else if (ev === 'wallHit') beep(300, 30, 'square', 0.03);
    else if (ev === 'paddleHit') beep(380, 40, 'square', 0.04);
    else if (ev === 'brickHit') beep(620, 70, 'sawtooth', 0.06);
    else if (ev === 'lifeLost') beep(120, 350, 'sawtooth', 0.08);
    else if (ev === 'levelClear') beep(700, 400, 'triangle', 0.06);
    else if (ev === 'gameOver') beep(90, 600, 'sawtooth', 0.08);
  }
}

function updateHud() {
  scoreVal.textContent = String(game.score).padStart(4, '0');
  hiVal.textContent = String(game.highScore).padStart(4, '0');
  levelVal.textContent = String(game.level);
  livesRow.innerHTML = '';
  for (let i = 0; i < Math.max(0, game.lives); i++) {
    livesRow.appendChild(document.createElement('span'));
  }
}

const OVERLAY_TEXT = {
  idle: ['BRICK BLITZ', 'タップしてスタート'],
  ready: ['GET READY', ''],
  paused: ['PAUSE', 'FIREで再開'],
  levelClear: ['LEVEL CLEAR', 'FIREで次のレベルへ'],
  gameOver: ['GAME OVER', 'タップしてリトライ'],
};

function updateOverlay() {
  if (game.phase === 'playing') {
    overlay.classList.add('hidden');
    return;
  }
  overlay.classList.remove('hidden');
  const [title, sub] = OVERLAY_TEXT[game.phase] || OVERLAY_TEXT.idle;
  overlayTitle.textContent = game.phase === 'ready' ? `HI-SCORE ${game.highScore}` : title;
  overlaySub.textContent = game.phase === 'gameOver'
    ? `SCORE ${game.score}  (HI ${game.highScore})\nタップしてリトライ`
    : sub;
}

function onChange(g) {
  updateHud();
  updateOverlay();
  if (g.events && g.events.length) playEvents(g.events);
}

function tryAdvance() {
  if (!game.active || game.phase === 'gameOver') { game.start(); return true; }
  if (game.phase === 'levelClear') { game.continueAfterLevelClear(); return true; }
  if (game.phase === 'paused') { game.resume(); return true; }
  if (game.phase === 'playing' && game.ballAttached) { game.fire(); return true; }
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

btnFire.addEventListener('click', () => { tryAdvance(); });
overlay.addEventListener('click', () => { tryAdvance(); });

btnPause.addEventListener('click', () => { game.togglePause(); });
btnSound.addEventListener('click', () => {
  game.toggleSound();
  btnSound.textContent = game.soundOn ? '♪ SOUND' : '♪ MUTE';
});

// --- 入力: キャンバスを直接ドラッグしてパドルを操作 ---
let dragging = false;
function canvasXToField(clientX) {
  const rect = canvas.getBoundingClientRect();
  return (clientX - rect.left) * (FIELD_W / rect.width);
}
canvas.addEventListener('pointerdown', (e) => {
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
  if (keyFire.has(e.key)) { e.preventDefault(); if (!e.repeat) tryAdvance(); return; }
  if (keyPause.has(e.key)) { e.preventDefault(); if (!e.repeat) game.togglePause(); return; }
});

window.addEventListener('keyup', (e) => {
  if (keyLeft.has(e.key)) { heldLeft = false; recomputeMoveDir(); return; }
  if (keyRight.has(e.key)) { heldRight = false; recomputeMoveDir(); return; }
});

// --- ゲームループ ---
let lastT = null;
function loop(t) {
  if (lastT === null) lastT = t;
  let dt = (t - lastT) / 1000;
  lastT = t;
  dt = Math.min(dt, 0.05);

  if (game.phase === 'playing') game.update(dt);
  drawField(ctx, game);
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
