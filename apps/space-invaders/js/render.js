import { ALIEN_SPRITES, PLAYER, UFO, drawSprite } from './sprites.js';
import {
  FIELD_W, FIELD_H, ALIEN_W, ALIEN_H, PLAYER_W, PLAYER_H,
  BULLET_W, BULLET_H, SHIELD_COLS, SHIELD_ROWS, SHIELD_BLOCK,
} from './game.js';

const COLORS = {
  bg: '#05080a',
  alien: '#3ddc6f',
  player: '#eafaf0',
  bulletPlayer: '#ffffff',
  bulletAlien: '#ff5a5a',
  shield: '#3ddc6f',
  ufo: '#ff5aa8',
  text: '#eafaf0',
  dim: 'rgba(234, 250, 240, 0.35)',
};

const PLAYER_Y = FIELD_H - 20;

function drawField(ctx, g) {
  ctx.clearRect(0, 0, FIELD_W, FIELD_H);
  ctx.fillStyle = COLORS.bg;
  ctx.fillRect(0, 0, FIELD_W, FIELD_H);

  // 地平線
  ctx.strokeStyle = COLORS.dim;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(4, FIELD_H - 10.5);
  ctx.lineTo(FIELD_W - 4, FIELD_H - 10.5);
  ctx.stroke();

  if (!g.active) return;

  // シールド
  for (const shield of g.shields) {
    ctx.fillStyle = COLORS.shield;
    for (let r = 0; r < SHIELD_ROWS; r++) {
      for (let c = 0; c < SHIELD_COLS; c++) {
        if (shield.cells[r * SHIELD_COLS + c]) {
          ctx.fillRect(shield.x + c * SHIELD_BLOCK, shield.y + r * SHIELD_BLOCK, SHIELD_BLOCK, SHIELD_BLOCK);
        }
      }
    }
  }

  // インベーダー
  for (const a of g.aliens) {
    if (!a.alive) continue;
    const frames = ALIEN_SPRITES[a.type];
    drawSprite(ctx, frames[g.animFrame], a.x, a.y, ALIEN_W, ALIEN_H, COLORS.alien);
  }

  // UFO
  if (g.ufo) {
    drawSprite(ctx, UFO, g.ufo.x, g.ufo.y, g.ufo.w, g.ufo.h, COLORS.ufo);
  }

  // 自機(無敵時間中は点滅)
  const showPlayer = g.player.invuln <= 0 || Math.floor(g.player.invuln * 10) % 2 === 0;
  if (showPlayer) {
    drawSprite(ctx, PLAYER, g.player.x, PLAYER_Y, PLAYER_W, PLAYER_H, COLORS.player);
  }

  // 弾
  if (g.playerBullet) {
    ctx.fillStyle = COLORS.bulletPlayer;
    ctx.fillRect(g.playerBullet.x, g.playerBullet.y, BULLET_W, BULLET_H);
  }
  ctx.fillStyle = COLORS.bulletAlien;
  for (const b of g.alienBullets) {
    ctx.fillRect(b.x, b.y, BULLET_W, BULLET_H);
  }
}

export { drawField, COLORS };
