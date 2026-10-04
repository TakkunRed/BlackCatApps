import {
  FIELD_W, FIELD_H, GRID_ROWS, GRID_COLS, CELL_W, CELL_H,
  cellX, cellY,
} from './game.js';

const COLORS = {
  bg: '#05080a',
  textLight: '#eafaf0',
  flash: '#ffffff',
  cellHover: 'rgba(167, 139, 250, 0.3)',
  chainLabel: '#ffd34d',
};

const GOLDEN_ANGLE = 137.50776; // 隣り合う値同士の色相をできるだけ離すための黄金角

function valueColor(v) {
  const exp = Math.round(Math.log2(v)); // 2->1, 4->2, ... 2048->11
  // 黄金角刻みにすることで、序盤によく出る小さい指数(1,2,3...)の時点から
  // 赤・緑・青・紫・黄色と幅広い色相に散らばるようにする(単純な等間隔刻みだと
  // 序盤の値が近い色相に固まってしまい、地味に見えていたため)。
  const hue = ((exp * GOLDEN_ANGLE) % 360 + 360) % 360;
  const light = exp % 2 === 0 ? 55 : 48; // 隣接する指数でも明暗差が出るようにする
  return `hsl(${hue}, 78%, ${light}%)`;
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
// catImg が渡され、かつ読み込み済みなら、数字の代わりに黒猫ロゴを描く(盤面最後の1個の演出用)。
function drawBlock(ctx, x, y, value, { scale = 1, alpha = 1, flash = 0, catImg = null } = {}) {
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

  if (catImg && catImg.complete && catImg.naturalWidth > 0) {
    const pad = Math.min(w, h) * 0.12;
    const size = Math.min(w, h) - pad * 2;
    const ix = dx + (w - size) / 2;
    const iy = dy + (h - size) / 2;
    const imgPath = new Path2D();
    if (imgPath.roundRect) imgPath.roundRect(ix, iy, size, size, r * 0.6);
    else imgPath.rect(ix, iy, size, size);
    ctx.save();
    ctx.clip(imgPath);
    ctx.drawImage(catImg, ix, iy, size, size);
    ctx.restore();
  } else {
    // 色相を虹色に広げたぶん、数字の色を背景ごとに出し分けるのが難しくなったため、
    // 明るい縁取り+ほぼ白の塗りで、どの背景色でも読めるようにする。
    const digits = String(value).length;
    const maxTextWidth = w * 0.86;
    const fitSize = Math.floor(maxTextWidth / (digits * 0.58));
    const fontSize = Math.max(7, Math.min(fitSize, Math.floor(CELL_W * 0.46)));
    ctx.font = `bold ${fontSize}px "SFMono-Regular", Consolas, monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = Math.max(1.5, fontSize * 0.17);
    ctx.strokeStyle = 'rgba(5, 8, 10, 0.55)';
    ctx.strokeText(String(value), dx + w / 2, dy + h / 2 + 1);
    ctx.fillStyle = COLORS.textLight;
    ctx.fillText(String(value), dx + w / 2, dy + h / 2 + 1);
  }
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
 * @param {HTMLImageElement|null} [catImg] 盤面が最後の1個になったときに表示する黒猫ロゴ(読み込み前はnull扱い)
 */
function drawField(ctx, g, anim, hoverCell, catImg) {
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

  // 盤面が最後の1個まで集約されたら、その1マスにだけ黒猫ロゴを表示する。
  let lastRow = -1, lastCol = -1, blockTotal = 0;
  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      if (grid[row][col]) { blockTotal++; lastRow = row; lastCol = col; }
    }
  }
  const soleCell = blockTotal === 1 ? `${lastRow},${lastCol}` : null;

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const v = grid[row][col];
      if (!v) continue;
      if (skip && skip.has(`${row},${col}`)) continue;
      const isSole = soleCell === `${row},${col}`;
      drawBlock(ctx, cellX(col), cellY(row), v, isSole ? { catImg } : undefined);
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
