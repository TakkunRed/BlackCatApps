import {
  FIELD_W, FIELD_H, GRID_ROWS, GRID_COLS, CELL_W, CELL_H, CELL_GAP,
  PLAYER_W, PLAYER_H, BULLET_W, BULLET_H,
} from './game.js';

const GRID_MARGIN_X = 8;
const GRID_TOP_Y = 10;
const PLAYER_Y = FIELD_H - 16;

const COLORS = {
  bg: '#05080a',
  player: '#eafaf0',
  bullet: '#ffffff',
  textDark: '#1c1d1f',
  textLight: '#eafaf0',
};

function cellX(col) { return GRID_MARGIN_X + col * (CELL_W + CELL_GAP); }
function cellY(row) { return GRID_TOP_Y + row * (CELL_H + CELL_GAP); }

function valueColor(v) {
  const exp = Math.round(Math.log2(v)); // 2->1, 4->2, ... 2048->11
  const hue = (210 - exp * 18 + 360) % 360; // 青系(低い値)→暖色(高い値)
  const light = exp >= 9 ? 58 : 50;
  return `hsl(${hue}, 70%, ${light}%)`;
}

function drawField(ctx, g) {
  ctx.clearRect(0, 0, FIELD_W, FIELD_H);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  if (!g.active) return;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 11px "SFMono-Regular", Consolas, monospace';

  for (let row = 0; row < GRID_ROWS; row++) {
    for (let col = 0; col < GRID_COLS; col++) {
      const v = g.grid[row][col];
      if (!v) continue;
      const x = cellX(col), y = cellY(row);
      ctx.fillStyle = valueColor(v);
      ctx.fillRect(x, y, CELL_W, CELL_H);
      ctx.fillStyle = v >= 512 ? COLORS.textLight : COLORS.textDark;
      ctx.font = v >= 1000 ? 'bold 9.5px "SFMono-Regular", Consolas, monospace' : 'bold 11px "SFMono-Regular", Consolas, monospace';
      ctx.fillText(String(v), x + CELL_W / 2, y + CELL_H / 2 + 1);
    }
  }

  ctx.fillStyle = COLORS.player;
  const px = g.player.x, py = PLAYER_Y;
  ctx.beginPath();
  ctx.moveTo(px + PLAYER_W / 2, py);
  ctx.lineTo(px + PLAYER_W, py + PLAYER_H);
  ctx.lineTo(px, py + PLAYER_H);
  ctx.closePath();
  ctx.fill();

  if (g.bullet) {
    ctx.fillStyle = COLORS.bullet;
    ctx.fillRect(g.bullet.x, g.bullet.y, BULLET_W, BULLET_H);
  }
}

export { drawField, COLORS, valueColor };
