import { buildSegmentDisplay, renderToSegments } from './segmentDisplay.js';
import { Calculator } from './calculator.js';
import { InvaderGame } from './game.js';

const calc = new Calculator();
const game = new InvaderGame(renderGame);

const mainDigits = buildSegmentDisplay(document.getElementById('mainDisplay'), 10, true);
const aimDigits = buildSegmentDisplay(document.getElementById('aimDisplay'), 1);
const lifeDigits = buildSegmentDisplay(document.getElementById('lifeDisplay'), 1);

const statusRow = document.getElementById('statusRow');
const laneInvader = document.getElementById('laneInvader');
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
  renderToSegments(mainDigits, calc.displayValue);
  statusRow.classList.remove('visible');
  laneInvader.classList.remove('visible');
  subLeft.textContent = '0';
  subRight.textContent = 'CALC';
}

function renderGame(g) {
  if (!g.active) {
    renderCalc();
    return;
  }

  statusRow.classList.add('visible');
  renderToSegments(aimDigits, g.aimValue);
  renderToSegments(lifeDigits, String(Math.max(0, g.lives)));

  if (g.current) {
    laneInvader.classList.add('visible');
    // lane: laneCount(出現/遠い) -> 1(自陣直前) を 92%(右端)->4%(自陣側) にマッピング
    const progress = (g.current.lane - 1) / (g.laneCount - 1);
    const leftPct = 4 + progress * 88;
    laneInvader.style.left = `${leftPct}%`;
  } else {
    laneInvader.classList.remove('visible');
  }

  if (g.phase === 'playing') {
    renderToSegments(mainDigits, String(g.totalScore));
    subLeft.textContent = `${g.stage}-${g.round}`;
    subRight.textContent = `SHOT ${g.shotsThisRound}/30`;
  } else if (g.phase === 'roundClear') {
    renderToSegments(mainDigits, String(g.roundScore));
    subLeft.textContent = `${g.stage}-${g.round} CLEAR`;
    subRight.textContent = 'FIREで次のラウンドへ';
    beep(880, 120);
  } else if (g.phase === 'gameOver') {
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
  if (key >= '0' && key <= '9') { calc.inputDigit(key); renderCalc(); return; }
  if (key === '.') { calc.inputDot(); renderCalc(); return; }
  if (key === '%') { calc.percent(); renderCalc(); return; }
  if (key === '=') { calc.equals(); renderCalc(); return; }
  if (['+', '-', '×', '÷'].includes(key)) { calc.inputOperator(key); renderCalc(); return; }
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
  '+': '+', '-': '-', '*': '×', 'x': '×', '/': '÷', '=': '=', 'Enter': '=',
  '.': '.', '%': '%', 'Backspace': 'AC', 'Escape': 'AC', 'g': 'GAME', 'G': 'GAME',
};
window.addEventListener('keydown', (e) => {
  const mapped = KEY_MAP[e.key];
  if (mapped) {
    e.preventDefault();
    routeKey(mapped);
  }
});

renderCalc();

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  });
}
