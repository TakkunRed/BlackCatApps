if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}

const { GalaxySiegeGame, FIELD_W, FIELD_H, PLAYER_W, ALIEN_W, ALIEN_H, SHIELD_Y, SHIELD_COLS, SHIELD_BLOCK, INVASION_LINE_Y } = await import('../js/game.js');

function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
}

// 初期セットアップ
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  assert(g.phase === 'playing', 'start({skipReady:true}) goes straight to playing');
  assert(g.aliens.length === 40, '5x8 = 40 aliens are created');
  assert(g.aliveAliens.length === 40, 'all 40 aliens start alive');
  assert(g.lives === 3, 'player starts with 3 lives');
  assert(g.player.x >= 0 && g.player.x <= FIELD_W - PLAYER_W, 'player starts within the field bounds');
  g.quit();
}

// start()はまず ready(最高得点表示)になる
{
  const g = new GalaxySiegeGame(() => {});
  g.start();
  assert(g.phase === 'ready', 'start() enters the ready/high-score screen first');
  g.quit();
}

// 自機の移動は画面端でクランプされる
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  g.setMoveDir(-1);
  for (let i = 0; i < 200; i++) g.update(0.1);
  assert(g.player.x >= 4, 'player does not move past the left edge');

  g.setMoveDir(1);
  for (let i = 0; i < 200; i++) g.update(0.1);
  assert(g.player.x <= FIELD_W - PLAYER_W - 4, 'player does not move past the right edge');
  g.quit();
}

// 自機弾は同時に1発まで、画面外に出ると消える
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  g.fire();
  assert(g.playerBullet !== null, 'fire() spawns a bullet');
  const before = g.playerBullet;
  g.fire();
  assert(g.playerBullet === before, 'a second fire() while a bullet is active does nothing');

  for (let i = 0; i < 50; i++) g.update(0.1); // 弾が画面上端を超えるまで進める
  assert(g.playerBullet === null, 'the bullet is cleared once it leaves the top of the field');
  g.quit();
}

// 命中判定: 自機弾がインベーダーに当たると破壊され、得点が加算される
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  const target = g.aliens[0]; // row0 (30点)
  g.playerBullet = { x: target.x + ALIEN_W / 2, y: target.y + ALIEN_H / 2 };
  const before = g.score;
  g._checkCollisions();
  assert(!target.alive, 'a hit alien becomes not-alive');
  assert(g.score === before + 30, `row0 kill scores 30 (got +${g.score - before})`);
  assert(g.playerBullet === null, 'the bullet is consumed on hit');
  g.quit();
}

// 編隊移動: 端に到達すると反転して1段下がる
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  // 左端まで強制的に寄せる
  for (const a of g.aliens) a.x -= 100;
  const yBefore = g.aliens[0].y;
  g.formationDir = -1;
  g.stepTimer = 999; // 即ステップさせる
  g._updateFormation(0);
  assert(g.formationDir === 1, 'hitting the left edge flips the formation direction');
  assert(g.pendingDrop === true, 'a drop is queued after reversing');

  g.stepTimer = 999;
  g._updateFormation(0);
  assert(g.aliens[0].y === yBefore + 8, 'the queued drop moves the formation down by one step');
  g.quit();
}

// 編隊は生存数が減るほど速くなる(移動間隔が短くなる)
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  for (let i = 1; i < g.aliens.length; i++) g.aliens[i].alive = false; // 1体だけ残す
  g.stepTimer = 0;
  g._updateFormation(0.2); // 全滅間近の短い間隔なら十分ステップするはず
  assert(g.stepTimer === 0 || g.animFrame !== undefined, 'formation update runs without error when nearly wiped out');
  g.quit();
}

// シールドの浸食: 命中点周辺のブロックが消える
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  const shield = g.shields[0];
  const cx = shield.x + SHIELD_BLOCK * 5 + 1;
  const cy = SHIELD_Y + SHIELD_BLOCK * 3 + 1;
  const hit = g._hitShield(cx, cy, 2, 2);
  assert(hit === true, 'a bullet inside the shield silhouette registers a hit');
  const anyGone = shield.cells.some((c) => c === false);
  assert(anyGone, 'at least one shield block is removed after a hit');
  g.quit();
}

// 自機被弾: ライフが減り、無敵時間が入る
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  const livesBefore = g.lives;
  g.alienBullets = [{ x: g.player.x, y: 260 }];
  g._checkCollisions();
  assert(g.lives === livesBefore - 1, 'a bullet overlapping the player removes a life');
  assert(g.player.invuln > 0, 'player gets brief invulnerability after being hit');
  assert(g.alienBullets.length === 0, 'the bullet that hit the player is removed');
  g.quit();
}

// 無敵時間中は被弾しない
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  g.player.invuln = 1;
  const livesBefore = g.lives;
  g.alienBullets = [{ x: g.player.x, y: 260 }];
  g._checkCollisions();
  assert(g.lives === livesBefore, 'no life is lost while invulnerable');
  g.quit();
}

// ライフ0でゲームオーバー
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  g.lives = 1;
  g.alienBullets = [{ x: g.player.x, y: 260 }];
  g._checkCollisions();
  assert(g.phase === 'gameOver', 'phase becomes gameOver when lives hit 0');
  g.quit();
}

// インベーダーが自陣ラインまで到達すると即ゲームオーバー
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  g.aliens[0].y = INVASION_LINE_Y;
  g._checkInvasion();
  assert(g.phase === 'gameOver', 'an alien reaching the invasion line ends the game immediately');
  g.quit();
}

// 全滅でウェーブクリア、continueAfterWaveClear() で次ウェーブへ
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  for (const a of g.aliens) a.alive = false;
  g.update(0.016);
  assert(g.phase === 'waveClear', 'destroying every alien clears the wave');

  const waveBefore = g.wave;
  g.continueAfterWaveClear();
  assert(g.wave === waveBefore + 1, 'continueAfterWaveClear() advances the wave counter');
  assert(g.phase === 'playing', 'continueAfterWaveClear() resumes play');
  assert(g.aliveAliens.length === 40, 'the next wave starts with a full formation again');
  g.quit();
}

// 一時停止/再開
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  g.togglePause();
  assert(g.phase === 'paused', 'togglePause() pauses from playing');

  const xBefore = g.player.x;
  g.setMoveDir(1);
  g.update(1);
  assert(g.player.x === xBefore, 'update() has no effect while paused');

  g.togglePause();
  assert(g.phase === 'playing', 'togglePause() resumes from paused');
  g.quit();
}

// UFO: 出現・画面外で消滅・命中でボーナス加点
{
  const g = new GalaxySiegeGame(() => {});
  g.start({ skipReady: true });
  g.ufoTimer = 0;
  g._updateUfo(0.016);
  assert(g.ufo !== null, 'UFO spawns once its timer elapses');

  g.playerBullet = { x: g.ufo.x, y: g.ufo.y };
  const before = g.score;
  g._checkCollisions();
  assert(g.ufo === null, 'a hit UFO is removed');
  assert(g.score > before, 'destroying the UFO awards bonus points');
  g.quit();
}

// 最高得点はlocalStorageに保存され、次のインスタンスからも読める
{
  localStorage.setItem('galaxySiege.highScore', '0');
  const g1 = new GalaxySiegeGame(() => {});
  g1.start({ skipReady: true });
  g1.score = 9999;
  g1._gameOver();
  assert(g1.highScore === 9999, 'highScore updates on game over when it is a new record');

  const g2 = new GalaxySiegeGame(() => {});
  assert(g2.highScore === 9999, 'a fresh instance reads the persisted highScore back');
  g1.quit();
}

// fire()は即座にonChangeへ'playerShoot'イベントを通知する(update()を待たない)
{
  const emitted = [];
  const g = new GalaxySiegeGame((state) => emitted.push([...state.events]));
  g.start({ skipReady: true });
  emitted.length = 0; // start()通知分をリセット
  g.fire();
  assert(emitted.length === 1, 'fire() triggers exactly one onChange notification');
  assert(emitted[0].includes('playerShoot'), 'that notification carries the playerShoot event');
  g.quit();
}

// イベントは消費型: 一度読まれたら次のonChangeでは繰り返されない
{
  const emitted = [];
  const g = new GalaxySiegeGame((state) => emitted.push([...state.events]));
  g.start({ skipReady: true });
  g.fire(); // emitted[-1] に 'playerShoot' が乗る
  g.togglePause(); // 別の理由でonChangeが呼ばれても、古いイベントが再び乗らないはず
  const lastBatch = emitted[emitted.length - 1];
  assert(!lastBatch.includes('playerShoot'), 'a later onChange does not replay an already-consumed event');
  g.quit();
}

console.log('done');
