import { SnakeByteGame, FIELD_W, FIELD_H } from './game.js';
import { drawField } from './render.js';

const game = new SnakeByteGame(onChange);
window.__snakeDebug = game; // devtoolsから状態確認する用(ゲームプレイには影響しない)

const canvas = document.getElementById('gameCanvas');
canvas.width = FIELD_W;
canvas.height = FIELD_H;
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const scoreVal = document.getElementById('scoreVal');
const hiVal = document.getElementById('hiVal');
const lenVal = document.getElementById('lenVal');
const btnUp = document.getElementById('btnUp');
const btnDown = document.getElementById('btnDown');
const btnLeft = document.getElementById('btnLeft');
const btnRight = document.getElementById('btnRight');
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
    if (ev === 'eat') beep(700, 60, 'square', 0.05);
    else if (ev === 'gameOver') beep(90, 600, 'sawtooth', 0.08);
  }
}

function updateHud() {
  scoreVal.textContent = String(game.score).padStart(4, '0');
  hiVal.textContent = String(game.highScore).padStart(4, '0');
  lenVal.textContent = String(game.snake.length);
}

const OVERLAY_TEXT = {
  idle: ['SNAKE BYTE', 'タップしてスタート'],
  ready: ['GET READY', ''],
  paused: ['PAUSE', 'タップで再開'],
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
  if (game.phase === 'paused') { game.resume(); return true; }
  return false;
}

// --- 入力: D-padボタン ---
function bindDir(el, dir) {
  el.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (tryAdvance()) return;
    game.setDirection(dir);
  });
}
bindDir(btnUp, 'up');
bindDir(btnDown, 'down');
bindDir(btnLeft, 'left');
bindDir(btnRight, 'right');

overlay.addEventListener('click', () => { tryAdvance(); });
btnPause.addEventListener('click', () => { game.togglePause(); });
btnSound.addEventListener('click', () => {
  game.toggleSound();
  btnSound.textContent = game.soundOn ? '♪ SOUND' : '♪ MUTE';
});

// --- 入力: キャンバス上のスワイプ ---
let swipeStart = null;
canvas.addEventListener('pointerdown', (e) => {
  swipeStart = { x: e.clientX, y: e.clientY };
  if (tryAdvance()) swipeStart = null;
});
canvas.addEventListener('pointerup', (e) => {
  if (!swipeStart) return;
  const dx = e.clientX - swipeStart.x;
  const dy = e.clientY - swipeStart.y;
  swipeStart = null;
  const SWIPE_THRESHOLD = 16;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return; // タップ扱い(方向変更なし)
  if (Math.abs(dx) > Math.abs(dy)) {
    game.setDirection(dx > 0 ? 'right' : 'left');
  } else {
    game.setDirection(dy > 0 ? 'down' : 'up');
  }
});

// --- キーボード ---
const KEY_DIR = {
  ArrowUp: 'up', w: 'up', W: 'up',
  ArrowDown: 'down', s: 'down', S: 'down',
  ArrowLeft: 'left', a: 'left', A: 'left',
  ArrowRight: 'right', d: 'right', D: 'right',
};
const keyPause = new Set(['p', 'P']);
const keyAdvance = new Set([' ', 'Enter']);

window.addEventListener('keydown', (e) => {
  const dir = KEY_DIR[e.key];
  if (dir) {
    e.preventDefault();
    if (!e.repeat) {
      if (!tryAdvance()) game.setDirection(dir);
    }
    return;
  }
  if (keyAdvance.has(e.key)) { e.preventDefault(); if (!e.repeat) tryAdvance(); return; }
  if (keyPause.has(e.key)) { e.preventDefault(); if (!e.repeat) game.togglePause(); return; }
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
