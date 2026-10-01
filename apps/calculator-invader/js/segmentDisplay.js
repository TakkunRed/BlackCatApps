// 7セグメント風ディスプレイの描画ユーティリティ
// セグメント名: a(上) b(右上) c(右下) d(下) e(左下) f(左上) g(中央)

const SEGMENT_MAP = {
  '0': 'abcdef',
  '1': 'bc',
  '2': 'abged',
  '3': 'abgcd',
  '4': 'fgbc',
  '5': 'afgcd',
  '6': 'afgedc',
  '7': 'abc',
  '8': 'abcdefg',
  '9': 'abcfgd',
  '-': 'g',
  ' ': '',
  '': '',
  'E': 'afged',
  'n': 'ceg',
  'u': 'ecd',
  'L': 'def',
  'o': 'cdeg',
  'C': 'afed',
  'S': 'afgcd',
};

const ALL_SEGMENTS = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

/**
 * 1桁分の7セグメントdigit要素を生成する
 * @param {boolean} withDot 小数点を持たせるか
 */
function createDigitElement(withDot = false) {
  const digit = document.createElement('div');
  digit.className = 'seg-digit';
  ALL_SEGMENTS.forEach((seg) => {
    const span = document.createElement('span');
    span.className = `seg seg-${seg}`;
    digit.appendChild(span);
  });
  if (withDot) {
    const dp = document.createElement('span');
    dp.className = 'seg seg-dp';
    digit.appendChild(dp);
  }
  return digit;
}

/**
 * 指定桁数の7セグメント表示器をcontainer内に構築する
 */
function buildSegmentDisplay(container, digitCount, withDots = false) {
  container.innerHTML = '';
  container.classList.add('seg-display');
  const digits = [];
  for (let i = 0; i < digitCount; i++) {
    const el = createDigitElement(withDots);
    container.appendChild(el);
    digits.push(el);
  }
  return digits;
}

/**
 * 文字列(数字/記号)を右詰めで7セグ表示器に反映する
 * 小数点は直前の桁に結合して表示する
 * @param {HTMLElement[]} digitElements createDigitElement等で作った要素配列
 * @param {string} text
 */
function renderToSegments(digitElements, text) {
  const chars = [];
  for (const ch of String(text)) {
    if (ch === '.' && chars.length > 0) {
      chars[chars.length - 1].dot = true;
    } else {
      chars.push({ ch, dot: false });
    }
  }
  const count = digitElements.length;
  const padded = new Array(Math.max(0, count - chars.length)).fill({ ch: ' ', dot: false }).concat(chars);
  const sliced = padded.slice(padded.length - count);

  sliced.forEach((item, idx) => {
    const el = digitElements[idx];
    const segs = SEGMENT_MAP[item.ch] ?? '';
    ALL_SEGMENTS.forEach((seg) => {
      const span = el.querySelector(`.seg-${seg}`);
      if (span) span.classList.toggle('on', segs.includes(seg));
    });
    const dp = el.querySelector('.seg-dp');
    if (dp) dp.classList.toggle('on', !!item.dot);
  });
}

export { buildSegmentDisplay, renderToSegments, createDigitElement };
