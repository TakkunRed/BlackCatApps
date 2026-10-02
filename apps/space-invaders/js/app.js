import { GalaxySiegeGame, FIELD_W, FIELD_H } from './game.js';
import { drawField } from './render.js';

const game = new GalaxySiegeGame(onChange);
window.__gsDebug = game; // devtoolsから状態確認する用(ゲームプレイには影響しない)

const canvas = document.getElementById('gameCanvas');
canvas.width = FIELD_W;
canvas.height = FIELD_H;
const ctx = canvas.getContext('2d');

const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlayTitle');
const overlaySub = document.getElementById('overlaySub');
const scoreVal = document.getElementById('scoreVal');
const hiVal = document.getElementById('hiVal');
const waveVal = document.getElementById('waveVal');
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
    if (ev === 'playerShoot') beep(620, 50, 'square', 0.04);
    else if (ev === 'alienKilled') beep(140, 90, 'sawtooth', 0.06);
    else if (ev === 'playerHit') beep(100, 350, 'sawtooth', 0.08);
    else if (ev === 'shieldHit') beep(220, 30, 'square', 0.03);
    else if (ev === 'ufoAppear') beep(880, 200, 'sine', 0.03);
    else if (ev === 'ufoKilled') beep(960, 180, 'square', 0.07);
    else if (ev === 'waveClear') beep(700, 400, 'triangle', 0.06);
    else if (ev === 'gameOver') beep(90, 600, 'sawtooth', 0.08);
  }
}

function updateHud() {
  scoreVal.textContent = String(game.score).padStart(4, '0');
  hiVal.textContent = String(game.highScore).padStart(4, '0');
  waveVal.textContent = String(game.wave);
  livesRow.innerHTML = '';
  for (let i = 0; i < Math.max(0, game.lives); i++) {
    const s = document.createElement('span');
    livesRow.appendChild(s);
  }
}

const OVERLAY_TEXT = {
  idle: ['GALAXY SIEGE', 'タップしてスタート'],
  ready: ['GET READY', ''],
  paused: ['PAUSE', 'FIREで再開'],
  waveClear: ['WAVE CLEAR', 'FIREで次のウェーブへ'],
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
  if (game.phase === 'waveClear') { game.continueAfterWaveClear(); return true; }
  if (game.phase === 'paused') { game.resume(); return true; }
  return false;
}

// --- 入力: 左右移動 ---
let heldLeft = false;
let heldRight = false;
let heldFireButton = false;

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

btnFire.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  if (tryAdvance()) return;
  heldFireButton = true;
  btnFire.classList.add('pressed');
  game.fire();
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
    game.fire();
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
  dt = Math.min(dt, 0.05); // タブが非アクティブだった場合などの大ジャンプを防ぐ

  if (game.phase === 'playing') {
    if (heldFireButton) game.fire();
    game.update(dt);
  }
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
