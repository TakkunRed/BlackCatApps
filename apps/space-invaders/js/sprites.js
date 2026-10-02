// ピクセルアート定義(独自デザイン)。各行は4文字の「左半分」パターンで、
// 描画時に左右反転して結合することで左右対称のスプライトにする。

const SQUID_0 = ['..1.', '.111', '1111', '11.1', '1111', '..1.', '.1.1', '1.1.'];
const SQUID_1 = ['..1.', '.111', '1111', '11.1', '1111', '.1..', '1.1.', '.1.1'];

const CRAB_0 = ['...1', '..11', '.111', '1111', '1111', '1.1.', '1...', '.1..'];
const CRAB_1 = ['...1', '..11', '.111', '1111', '1111', '..11', '.11.', '1...'];

const OCTO_0 = ['.11.', '1111', '11.1', '1111', '..11', '.111', '1...', '.1..'];
const OCTO_1 = ['.11.', '1111', '11.1', '1111', '..11', '.111', '.1..', '1...'];

const PLAYER = ['...1', '...1', '..11', '.111', '1111'];
const UFO = ['..11', '.111', '1111', '1111', '.11.'];
const EXPLOSION = ['...1', '.1.1', '1...', '.1.1'];

const ALIEN_SPRITES = {
  squid: [SQUID_0, SQUID_1],
  crab: [CRAB_0, CRAB_1],
  octopus: [OCTO_0, OCTO_1],
};

function mirrorRow(half) {
  return half + half.split('').reverse().join('');
}

function drawSprite(ctx, halfRows, x, y, w, h, color) {
  const cols = halfRows[0].length * 2;
  const rows = halfRows.length;
  const cellW = w / cols;
  const cellH = h / rows;
  ctx.fillStyle = color;
  for (let r = 0; r < rows; r++) {
    const full = mirrorRow(halfRows[r]);
    for (let c = 0; c < cols; c++) {
      if (full[c] === '1') {
        ctx.fillRect(
          Math.round(x + c * cellW),
          Math.round(y + r * cellH),
          Math.ceil(cellW),
          Math.ceil(cellH)
        );
      }
    }
  }
}

export { ALIEN_SPRITES, PLAYER, UFO, EXPLOSION, drawSprite };
