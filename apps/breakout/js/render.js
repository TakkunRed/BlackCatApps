import {
  FIELD_W, FIELD_H, PADDLE_W, PADDLE_H, BALL_SIZE, BRICK_W, BRICK_H,
} from './game.js';

const COLORS = {
  bg: '#05080a',
  paddle: '#eafaf0',
  ball: '#ffffff',
  dim: 'rgba(234, 250, 240, 0.35)',
  rowColors: ['#ff5a5a', '#ff9f4a', '#ffd84a', '#8be24a', '#4ad0e2', '#7a8bff'],
};

const PADDLE_Y = FIELD_H - 16;

function drawField(ctx, g) {
  ctx.clearRect(0, 0, FIELD_W, FIELD_H);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  ctx.strokeStyle = COLORS.dim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(4, FIELD_H - 8.5);
  ctx.lineTo(FIELD_W - 4, FIELD_H - 8.5);
  ctx.stroke();

  if (!g.active) return;

  for (const b of g.bricks) {
    if (!b.alive) continue;
    ctx.fillStyle = COLORS.rowColors[b.row % COLORS.rowColors.length];
    ctx.fillRect(Math.round(b.x), Math.round(b.y), Math.ceil(BRICK_W - 1), BRICK_H - 1);
  }

  ctx.fillStyle = COLORS.paddle;
  ctx.fillRect(Math.round(g.paddle.x), PADDLE_Y, PADDLE_W, PADDLE_H);

  ctx.fillStyle = COLORS.ball;
  ctx.fillRect(Math.round(g.ball.x), Math.round(g.ball.y), BALL_SIZE, BALL_SIZE);
}

export { drawField, COLORS };
