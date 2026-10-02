import { FIELD_W, FIELD_H, CELL } from './game.js';

const COLORS = {
  bg: '#05080a',
  grid: 'rgba(234, 250, 240, 0.04)',
  head: '#ffd84a',
  body: '#8be24a',
  food: '#ff5a5a',
};

function drawField(ctx, g) {
  ctx.clearRect(0, 0, FIELD_W, FIELD_H);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  for (let x = CELL; x < FIELD_W; x += CELL) {
    ctx.beginPath();
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, FIELD_H);
    ctx.stroke();
  }
  for (let y = CELL; y < FIELD_H; y += CELL) {
    ctx.beginPath();
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(FIELD_W, y + 0.5);
    ctx.stroke();
  }

  if (!g.active) return;

  if (g.food) {
    ctx.fillStyle = COLORS.food;
    const pad = 1.5;
    ctx.fillRect(g.food.x * CELL + pad, g.food.y * CELL + pad, CELL - pad * 2, CELL - pad * 2);
  }

  g.snake.forEach((seg, i) => {
    ctx.fillStyle = i === 0 ? COLORS.head : COLORS.body;
    const pad = i === 0 ? 0.5 : 1;
    ctx.fillRect(seg.x * CELL + pad, seg.y * CELL + pad, CELL - pad * 2, CELL - pad * 2);
  });
}

export { drawField, COLORS };
