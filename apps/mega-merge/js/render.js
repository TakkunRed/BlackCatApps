import {
  FIELD_W, FIELD_H, GRID_ROWS, GRID_COLS, CELL_W, CELL_H,
  cellX, cellY,
} from './game.js';

const COLORS = {
  bg: '#05080a',
  textDark: '#1c1d1f',
  textLight: '#eafaf0',
  flash: '#ffffff',
  cellHover: 'rgba(167, 139, 250, 0.3)',
  chainLabel: '#ffd34d',
};

function valueColor(v) {
  const exp = Math.round(Math.log2(v)); // 2->1, 4->2, ... 2048->11
  const hue = (210 - exp * 18 + 360) % 360; // 青系(低い値)→暖色(高い値)
  const light = exp >= 9 ? 58 : 50;
  return `hsl(${hue}, 70%, ${light}%)`;
}

// valueColor()が返す hsl(h, s%, l%) の明度だけを変える(グラデーション・縁取り用)。
function adjustLightness(hslStr, delta) {
  const m = hslStr.match(/^hsl\(([\d.]+),\s*([\d.]+)%,\s*([\d.]+)%\)$/);
  if (!m) return hslStr;
  const [, h, s, l] = m;
  const newL = Math.max(0, Math.min(100, Number(l) + delta));
  return `hsl(${h}, ${s}%, ${newL}%)`;
}

// 1ブロックを描画する。scale/alpha/flash で演出(出現・消滅・強調)を表現できる。
// 単色の平坦な見た目だと地味なので、縦グラデーション+縁取り+角丸で立体感を付ける。
function drawBlock(ctx, x, y, value, { scale = 1, alpha = 1, flash = 0 } = {}) {
  if (alpha <= 0 || scale <= 0) return;
  const w = CELL_W * scale;
  const h = CELL_H * scale;
  const dx = x + (CELL_W - w) / 2;
  const dy = y + (CELL_H - h) / 2;
  const r = Math.min(7, w * 0.14, h * 0.14);

  const base = valueColor(value);
  const path = new Path2D();
  if (path.roundRect) path.roundRect(dx, dy, w, h, r);
  else path.rect(dx, dy, w, h);

  ctx.save();
  ctx.globalAlpha = alpha;

  const grad = ctx.createLinearGradient(dx, dy, dx, dy + h);
  grad.addColorStop(0, adjustLightness(base, 13));
  grad.addColorStop(1, adjustLightness(base, -9));
  ctx.fillStyle = grad;
  ctx.fill(path);

  ctx.lineWidth = Math.max(1, w * 0.045);
  ctx.strokeStyle = adjustLightness(base, -24);
  ctx.stroke(path);

  if (flash > 0) {
    ctx.globalAlpha = alpha * flash;
    ctx.fillStyle = COLORS.flash;
    ctx.fill(path);
    ctx.globalAlpha = alpha;
  }

  ctx.fillStyle = value >= 512 ? COLORS.textLight : COLORS.textDark;
  // ポップ廃止で値の桁数に上限が無くなったため、固定の桁数区分ではなく実際の桁数から
  // 「このセル幅に収まる最大サイズ」を逆算する(何桁になっても枠からはみ出さないように)。
  const digits = String(value).length;
  const maxTextWidth = w * 0.86;
  const fitSize = Math.floor(maxTextWidth / (digits * 0.58));
  const fontSize = Math.max(7, Math.min(fitSize, Math.floor(CELL_W * 0.46)));
  ctx.font = `bold ${fontSize}px "SFMono-Regular", Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), dx + w / 2, dy + h / 2 + 1);
  ctx.restore();
}

// 「CHAIN 2」「×3」のような、連鎖・同時合体を知らせるラベルをブロックの上に浮かせて描く。
function drawChainLabel(ctx, label) {
  if (!label || label.alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = label.alpha;
  ctx.translate(label.x, label.y);
  ctx.scale(label.scale, label.scale);
  const fontSize = Math.max(13, Math.floor(CELL_W * 0.4));
  ctx.font = `bold ${fontSize}px "SFMono-Regular", Consolas, monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, fontSize * 0.22);
  ctx.strokeStyle = 'rgba(5, 8, 10, 0.85)';
  ctx.strokeText(label.text, 0, 0);
  ctx.fillStyle = COLORS.chainLabel;
  ctx.fillText(label.text, 0, 0);
  ctx.restore();
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} g ゲームステート
 * @param {object} [anim] アニメーション中の上書き情報
 *   - grid: 通常描画に使うグリッド(省略時は g.grid)
 *   - skip: Set<'row,col'> 通常描画をスキップするセル(floaterで個別に描くため)
 *   - floaters: [{x, y, value, scale, alpha, flash}] ピクセル座標で個別に描く要素
 * @param {{row:number, col:number}|null} [hoverCell] タップ可能であることを示すホバー中のマス(nullで非表示)
 */
function drawField(ctx, g, anim, hoverCell) {
  ctx.clearRect(0, 0, FIELD_W, FIELD_H);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  if (!g.active) return;

  if (hoverCell && g.phase === 'playing' && g.grid[hoverCell.row][hoverCell.col]) {
    ctx.fillStyle = COLORS.cellHover;
    ctx.fillRect(cellX(hoverCell.col), cellY(hoverCell.row), CELL_W, CELL_H);
  }

  const grid = (anim && anim.grid) || g.grid;
  const skip = (anim && anim.skip) || null;

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const v = grid[row][col];
      if (!v) continue;
      if (skip && skip.has(`${row},${col}`)) continue;
      drawBlock(ctx, cellX(col), cellY(row), v);
    }
  }

  if (anim && anim.floaters) {
    for (const f of anim.floaters) {
      drawBlock(ctx, f.x, f.y, f.value, f);
    }
  }

  if (anim && anim.chainLabel) {
    drawChainLabel(ctx, anim.chainLabel);
  }
}

export { drawField, drawBlock, COLORS, valueColor };
