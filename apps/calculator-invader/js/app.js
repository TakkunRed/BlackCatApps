import { buildSegmentDisplay, renderToSegments } from './segmentDisplay.js';
import { Calculator } from './calculator.js';
import { InvaderGame, MAX_LANES } from './game.js';

const calc = new Calculator();
const game = new InvaderGame(renderGame);

const mainDigits = buildSegmentDisplay(document.getElementById('mainDisplay'), 8, true);
const lineupDigits = buildSegmentDisplay(document.getElementById('lineupDisplay'), MAX_LANES);
const aimDigits = buildSegmentDisplay(document.getElementById('aimDisplay'), 1);
const lifeDigits = buildSegmentDisplay(document.getElementById('lifeDisplay'), 1);

const statusRow = document.getElementById('statusRow');
const mainRow = document.getElementById('mainRow');
const subLeft = document.getElementById('subLeft');
const subRight = document.getElementById('subRight');

let audioCtx = null;
function beep(freq, durationMs, type = 'square') {
  if (!game.soundOn) return;
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    gain.gain.value = 0.05;
    osc.connect(gain).connect(audioCtx.destination);
    osc.start();
    gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + durationMs / 1000);
    osc.stop(audioCtx.currentTime + durationMs / 1000);
  } catch (_) { /* no-op: audio unavailable */ }
}

function renderCalc() {
  mainRow.classList.remove('game-mode');
  renderToSegments(mainDigits, calc.displayValue);
  statusRow.classList.remove('visible');
  subLeft.textContent = '0';
  subRight.textContent = 'CALC';
}

function playInvaderSpawn(isUFO) {
  if (isUFO) {
    beep(520, 50, 'sawtooth');
    setTimeout(() => beep(720, 60, 'sawtooth'), 55);
    setTimeout(() => beep(520, 70, 'sawtooth'), 115);
  } else {
    beep(220, 55, 'square');
    setTimeout(() => beep(150, 80, 'square'), 55);
  }
}

function renderLineup(g) {
  for (let i = 0; i < MAX_LANES; i++) {
    const occ = i < g.laneCount ? g.field[i] : null;
    renderToSegments([lineupDigits[i]], occ ? occ.value : ' ');
  }
}

function renderGame(g) {
  if (!g.active) {
    renderCalc();
    return;
  }

  statusRow.classList.add('visible');
  renderToSegments(aimDigits, g.aimValue);
  renderToSegments(lifeDigits, String(Math.max(0, g.lives)));

  if (g.justSpawned) {
    playInvaderSpawn(g.justSpawned.isUFO);
    g.justSpawned = null;
  }

  if (g.phase === 'ready') {
    mainRow.classList.remove('game-mode');
    renderToSegments(mainDigits, String(g.highScore));
    subLeft.textContent = '';
    subRight.textContent = 'HI SCORE';
  } else if (g.phase === 'playing') {
    mainRow.classList.add('game-mode');
    renderLineup(g);
    subLeft.textContent = `${g.stage}-${g.round}`;
    subRight.textContent = `SHOT ${g.shotsThisRound}/30`;
  } else if (g.phase === 'paused') {
    mainRow.classList.add('game-mode');
    renderLineup(g);
    subLeft.textContent = 'PAUSE';
    subRight.textContent = '= で再開';
  } else if (g.phase === 'roundClear') {
    mainRow.classList.remove('game-mode');
    renderToSegments(mainDigits, String(g.roundScore));
    subLeft.textContent = `${g.stage}-${g.round} CLEAR`;
    subRight.textContent = 'FIREで次のラウンドへ';
    beep(880, 120);
  } else if (g.phase === 'gameOver') {
    mainRow.classList.remove('game-mode');
    renderToSegments(mainDigits, String(g.totalScore));
    subLeft.textContent = `${g.stage}-${g.round} END`;
    subRight.textContent = `HI ${g.highScore}`;
  }
}

function playFeedback(prevTotal, prevLives, g) {
  if (g.phase === 'gameOver') {
    beep(120, 400, 'sawtooth');
    return;
  }
  if (g.lives < prevLives) {
    beep(180, 250, 'sawtooth');
    return;
  }
  if (g.totalScore > prevTotal) {
    beep(660, 70);
  }
}

function routeKey(key) {
  if (game.active) {
    handleGameKey(key);
  } else {
    handleCalcKey(key);
  }
}

function handleCalcKey(key) {
  if (key === 'GAME') {
    game.start();
    return;
  }
  if (key === 'AC') { calc.allClear(); renderCalc(); return; }
  if (key === 'C') { calc.clearEntry(); renderCalc(); return; }
  if (key >= '0' && key <= '9') { calc.inputDigit(key); renderCalc(); return; }
  if (key === '.') { calc.inputDot(); renderCalc(); return; }
  if (key === '%') { calc.percent(); renderCalc(); return; }
  if (key === '=') { calc.equals(); renderCalc(); return; }
  if (['+', '-', '×', '÷'].includes(key)) { calc.inputOperator(key); renderCalc(); return; }
  if (key === 'SIGN') { calc.toggleSign(); renderCalc(); return; }
  if (key === 'SQRT') { calc.sqrt(); renderCalc(); return; }
  if (key === 'MC') { calc.memoryClear(); renderCalc(); return; }
  if (key === 'MR') { calc.memoryRecall(); renderCalc(); return; }
  if (key === 'MPLUS') { calc.memoryAdd(); renderCalc(); return; }
  if (key === 'MMINUS') { calc.memorySubtract(); renderCalc(); return; }
  if (key === 'TAX_INCL') { calc.taxInclusive(); renderCalc(); return; }
  if (key === 'TAX_EXCL') { calc.taxExclusive(); renderCalc(); return; }
}

function handleGameKey(key) {
  const prevTotal = game.totalScore;
  const prevLives = game.lives;

  if (key === 'AC') {
    game.quit();
    renderCalc();
    return;
  }
  if (key === 'GAME') {
    game.quit();
    renderCalc();
    return;
  }
  if (key === '%') {
    game.toggleSound();
    return;
  }
  if (key === 'PAUSE' || (key === '=' && (game.phase === 'playing' || game.phase === 'paused'))) {
    game.togglePause();
    return;
  }

  if (game.phase === 'roundClear') {
    if (key === '+' || key === '.' || key === '=') {
      game.continueAfterRoundClear();
    }
    return;
  }

  if (game.phase === 'gameOver') {
    if (key === '+' || key === '.' || key === '=') {
      game.start();
    }
    return;
  }

  if (game.phase === 'playing') {
    if (key === '.') { game.aim(); beep(320, 30); return; }
    if (key === '+') {
      game.fire();
      playFeedback(prevTotal, prevLives, game);
      return;
    }
  }
}

document.querySelectorAll('.key').forEach((btn) => {
  btn.addEventListener('click', () => routeKey(btn.dataset.key));
});

const KEY_MAP = {
  '0': '0', '1': '1', '2': '2', '3': '3', '4': '4', '5': '5', '6': '6', '7': '7', '8': '8', '9': '9',
  '+': '+', '-': '-', '*': '×', 'x': '×', 'X': '×', '/': '÷', '=': '=', 'Enter': '=',
  '.': '.', 'a': '.', 'A': '.', // AIM: •キー(ピリオド)、またはAキー
  ' ': '+', // FIRE: +キー、またはスペースキー(連打しやすいように)
  '%': '%', 'Backspace': 'AC', 'Escape': 'AC', 'c': 'C', 'C': 'C',
  'g': 'GAME', 'G': 'GAME', 's': 'SQRT', 'S': 'SQRT', 'p': 'PAUSE', 'P': 'PAUSE',
};
window.addEventListener('keydown', (e) => {
  const mapped = KEY_MAP[e.key];
  if (mapped) {
    e.preventDefault();
    if (e.repeat) return; // キー押しっぱなしでの自動連射を防止(実機の1回押し=1回操作に合わせる)
    routeKey(mapped);
  }
});

renderCalc();

if ('serviceWorker' in navigator) {
  // 新しいService Workerが制御を引き継いだら、古いキャッシュを見せ続けないよう1回だけ自動リロードする
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
