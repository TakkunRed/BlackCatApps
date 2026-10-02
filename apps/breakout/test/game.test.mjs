if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}

const { BrickBlitzGame, FIELD_W, FIELD_H, PADDLE_W, BALL_SIZE, BRICK_W, BRICK_H } = await import('../js/game.js');

function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
}

// 初期セットアップ
{
  const g = new BrickBlitzGame(() => {});
  g.start({ skipReady: true });
  assert(g.phase === 'playing', 'start({skipReady:true}) goes straight to playing');
  assert(g.bricks.length === 48, '6x8 = 48 bricks are created');
  assert(g.aliveBricks.length === 48, 'all bricks start alive');
  assert(g.lives === 3, 'player starts with 3 lives');
  assert(g.ballAttached === true, 'the ball starts attached to the paddle');
  g.quit();
}

// start()はまず ready(最高得点表示)になる
{
  const g = new BrickBlitzGame(() => {});
  g.start();
  assert(g.phase === 'ready', 'start() enters the ready/high-score screen first');
  g.quit();
}

// パドルの移動は画面端でクランプされる
{
  const g = new BrickBlitzGame(() => {});
  g.start({ skipReady: true });
  g.setMoveDir(-1);
  for (let i = 0; i < 200; i++) g.update(0.1);
  assert(g.paddle.x >= 2, 'paddle does not move past the left edge');

  g.setMoveDir(1);
  for (let i = 0; i < 200; i++) g.update(0.1);
  assert(g.paddle.x <= FIELD_W - PADDLE_W - 2, 'paddle does not move past the right edge');
  g.quit();
}

// ドラッグ操作でパドルが追従する
{
  const g = new BrickBlitzGame(() => {});
  g.start({ skipReady: true });
  g.setDragTarget(120);
  g.update(0.016);
  assert(Math.abs(g.paddle.x - (120 - PADDLE_W / 2)) < 0.01, 'drag target directly positions the paddle center');
  g.clearDragTarget();
  g.quit();
}

// ボールが付いている間はパドルに追従し、fire()で発射される
{
  const g = new BrickBlitzGame(() => {});
  g.start({ skipReady: true });
  g.setMoveDir(1);
  g.update(0.1);
  assert(g.ball.x === g.paddle.x + PADDLE_W / 2 - BALL_SIZE / 2, 'the attached ball follows the paddle');

  g.fire();
  assert(g.ballAttached === false, 'fire() launches the ball');
  assert(g.ball.vx !== 0 || g.ball.vy !== 0, 'the launched ball has velocity');
  assert(g.ball.vy < 0, 'the ball launches upward');
  g.quit();
}

// fire()は即座にonChangeへ'launch'イベントを通知する
{
  const emitted = [];
  const g = new BrickBlitzGame((state) => emitted.push([...state.events]));
  g.start({ skipReady: true });
  emitted.length = 0;
  g.fire();
  assert(emitted.length === 1, 'fire() triggers exactly one onChange notification');
  assert(emitted[0].includes('launch'), 'that notification carries the launch event');
  g.quit();
}

// 壁での反射
{
  const g = new BrickBlitzGame(() => {});
  g.start({ skipReady: true });
  g.fire();
  g.ball.x = 0;
  g.ball.vx = -50;
  g.ball.vy = -50;
  g._updateBall(0.001);
  assert(g.ball.vx > 0, 'the ball bounces off the left wall');

  g.ball.x = FIELD_W - BALL_SIZE;
  g.ball.vx = 50;
  g._updateBall(0.001);
  assert(g.ball.vx < 0, 'the ball bounces off the right wall');

  g.ball.y = 0;
  g.ball.vy = -50;
  g._updateBall(0.001);
  assert(g.ball.vy > 0, 'the ball bounces off the ceiling');
  g.quit();
}

// パドルでの反射: 中心からずれた位置で当たると、その方向に角度がつく
{
  const g = new BrickBlitzGame(() => {});
  g.start({ skipReady: true });
  g.fire();
  g.paddle.x = 100;
  g.ball.x = 100; // パドル左端寄りで当てる
  g.ball.y = FIELD_H - 16 - BALL_SIZE;
  g.ball.vx = 0;
  g.ball.vy = 50;
  g._updateBall(0.001);
  assert(g.ball.vy < 0, 'hitting the paddle reflects the ball upward');
  assert(g.ball.vx < 0, 'hitting left of paddle center sends the ball to the left');
  g.quit();
}

// ブロックへの命中: 破壊され、得点が加算される(上段ほど高得点)
{
  const g = new BrickBlitzGame(() => {});
  g.start({ skipReady: true });
  const brick = g.bricks[0]; // row0 = 60点
  g.ball.x = brick.x;
  g.ball.y = brick.y;
  g.ball.vx = 10;
  g.ball.vy = 50;
  const before = g.score;
  g._checkBrickCollision();
  assert(!brick.alive, 'a hit brick becomes not-alive');
  assert(g.score === before + 60, `row0 brick scores 60 (got +${g.score - before})`);
  g.quit();
}

// ボールが画面下に落ちるとライフが減り、落ちきらなければ再アタッチされる
{
  const g = new BrickBlitzGame(() => {});
  g.start({ skipReady: true });
  g.fire();
  const livesBefore = g.lives;
  g.ball.y = FIELD_H + 1;
  g.ball.vy = 50;
  g._updateBall(0.001);
  assert(g.lives === livesBefore - 1, 'the ball falling past the paddle costs a life');
  assert(g.ballAttached === true, 'the ball reattaches to the paddle after a non-fatal loss');
  g.quit();
}

// ライフが0でゲームオーバー
{
  const g = new BrickBlitzGame(() => {});
  g.start({ skipReady: true });
  g.fire();
  g.lives = 1;
  g.ball.y = FIELD_H + 1;
  g._updateBall(0.001);
  assert(g.phase === 'gameOver', 'phase becomes gameOver when lives hit 0');
  g.quit();
}

// 全ブロック破壊でレベルクリア、continueAfterLevelClear()で次レベルへ(速度も上がる)
{
  const g = new BrickBlitzGame(() => {});
  g.start({ skipReady: true });
  const speedBefore = g.ballSpeed;
  for (const b of g.bricks) b.alive = false;
  g.update(0.016);
  assert(g.phase === 'levelClear', 'destroying every brick clears the level');

  const levelBefore = g.level;
  g.continueAfterLevelClear();
  assert(g.level === levelBefore + 1, 'continueAfterLevelClear() advances the level counter');
  assert(g.phase === 'playing', 'continueAfterLevelClear() resumes play');
  assert(g.aliveBricks.length === 48, 'the next level starts with a full brick wall again');
  assert(g.ballSpeed > speedBefore, 'ball speed increases on the next level');
  g.quit();
}

// 一時停止/再開
{
  const g = new BrickBlitzGame(() => {});
  g.start({ skipReady: true });
  g.fire();
  g.togglePause();
  assert(g.phase === 'paused', 'togglePause() pauses from playing');

  const ballBefore = { ...g.ball };
  g.update(1);
  assert(g.ball.x === ballBefore.x && g.ball.y === ballBefore.y, 'update() has no effect while paused');

  g.togglePause();
  assert(g.phase === 'playing', 'togglePause() resumes from paused');
  g.quit();
}

// 最高得点はlocalStorageに保存され、次のインスタンスからも読める
{
  localStorage.setItem('brickBlitz.highScore', '0');
  const g1 = new BrickBlitzGame(() => {});
  g1.start({ skipReady: true });
  g1.score = 4242;
  g1._gameOver();
  assert(g1.highScore === 4242, 'highScore updates on game over when it is a new record');

  const g2 = new BrickBlitzGame(() => {});
  assert(g2.highScore === 4242, 'a fresh instance reads the persisted highScore back');
  g1.quit();
}

console.log('done');
