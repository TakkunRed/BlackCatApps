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
};

function valueColor(v) {
  const exp = Math.round(Math.log2(v)); // 2->1, 4->2, ... 2048->11
  const hue = (210 - exp * 18 + 360) % 360; // 青系(低い値)→暖色(高い値)
  const light = exp >= 9 ? 58 : 50;
  return `hsl(${hue}, 70%, ${light}%)`;
}

// 1ブロックを描画する。scale/alpha/flash で演出(出現・消滅・強調)を表現できる。
function drawBlock(ctx, x, y, value, { scale = 1, alpha = 1, flash = 0 } = {}) {
  if (alpha <= 0 || scale <= 0) return;
  const w = CELL_W * scale;
  const h = CELL_H * scale;
  const dx = x + (CELL_W - w) / 2;
  const dy = y + (CELL_H - h) / 2;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = valueColor(value);
  ctx.fillRect(dx, dy, w, h);
  if (flash > 0) {
    ctx.globalAlpha = alpha * flash;
    ctx.fillStyle = COLORS.flash;
    ctx.fillRect(dx, dy, w, h);
    ctx.globalAlpha = alpha;
  }
  ctx.fillStyle = value >= 512 ? COLORS.textLight : COLORS.textDark;
  ctx.font = value >= 1000 ? 'bold 11px "SFMono-Regular", Consolas, monospace' : 'bold 13px "SFMono-Regular", Consolas, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(value), dx + w / 2, dy + h / 2 + 1);
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
}

export { drawField, drawBlock, COLORS, valueColor };
