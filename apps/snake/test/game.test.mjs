if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map();
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
  };
}

const { SnakeByteGame, GRID_COLS, GRID_ROWS } = await import('../js/game.js');

function assert(cond, label) {
  console.log(`${cond ? 'PASS' : 'FAIL'} ${label}`);
}

// 初期セットアップ
{
  const g = new SnakeByteGame(() => {});
  g.start({ skipReady: true });
  assert(g.phase === 'playing', 'start({skipReady:true}) goes straight to playing');
  assert(g.snake.length === 4, 'the snake starts with 4 segments');
  assert(g.dir.dx === 1 && g.dir.dy === 0, 'the snake starts moving right');
  assert(g.food !== null, 'food is spawned at start');
  assert(!g.snake.some((s) => s.x === g.food.x && s.y === g.food.y), 'food does not spawn on top of the snake');
  g.quit();
}

// start()はまず ready(最高得点表示)になる
{
  const g = new SnakeByteGame(() => {});
  g.start();
  assert(g.phase === 'ready', 'start() enters the ready/high-score screen first');
  g.quit();
}

// 進行方向の逆転はできない(自分の体へ即Uターン禁止)
{
  const g = new SnakeByteGame(() => {});
  g.start({ skipReady: true }); // dir = right
  g.setDirection('left');
  assert(g.nextDir.dx === 1 && g.nextDir.dy === 0, 'reversing directly into the body is rejected');
  g.setDirection('up');
  assert(g.nextDir.dx === 0 && g.nextDir.dy === -1, 'a perpendicular turn is accepted');
  g.quit();
}

// 1ステップで頭が進行方向に1マス進み、尻尾が追従する(食べ物を食べない場合は長さ不変)
{
  const g = new SnakeByteGame(() => {});
  g.start({ skipReady: true });
  g.food = { x: -1, y: -1 }; // このステップでは食べさせない
  const headBefore = { ...g.snake[0] };
  const lenBefore = g.snake.length;
  g._step();
  assert(g.snake[0].x === headBefore.x + 1 && g.snake[0].y === headBefore.y, 'the head moves one cell in the current direction');
  assert(g.snake.length === lenBefore, 'length is unchanged when no food is eaten');
  g.quit();
}

// 食べ物を食べると伸びて加点し、新しい食べ物が出る
{
  const g = new SnakeByteGame(() => {});
  g.start({ skipReady: true });
  const head = g.snake[0];
  g.food = { x: head.x + 1, y: head.y }; // 次の一歩で食べられる位置に置く
  const lenBefore = g.snake.length;
  const scoreBefore = g.score;
  g._step();
  assert(g.snake.length === lenBefore + 1, 'eating food grows the snake by one segment');
  assert(g.score === scoreBefore + 10, 'eating food scores 10 points');
  assert(g.foodEaten === 1, 'foodEaten increments');
  assert(g.food !== null && !(g.food.x === head.x + 1 && g.food.y === head.y), 'a new food cell is spawned elsewhere');
  g.quit();
}

// 食べるほど移動間隔が短くなる(速くなる)
{
  const g = new SnakeByteGame(() => {});
  g.start({ skipReady: true });
  const intervalBefore = g.tickInterval;
  g.foodEaten = 10;
  assert(g.tickInterval < intervalBefore, 'tick interval shrinks as more food is eaten');
  g.quit();
}

// 壁への衝突でゲームオーバー
{
  const g = new SnakeByteGame(() => {});
  g.start({ skipReady: true });
  g.snake[0] = { x: GRID_COLS - 1, y: 5 };
  g.snake[1] = { x: GRID_COLS - 2, y: 5 };
  g.dir = { dx: 1, dy: 0 };
  g.nextDir = { dx: 1, dy: 0 };
  g.food = { x: -1, y: -1 };
  g._step();
  assert(g.phase === 'gameOver', 'running into the right wall ends the game');
  g.quit();
}

// 自分の体への衝突でゲームオーバー
{
  const g = new SnakeByteGame(() => {});
  g.start({ skipReady: true });
  g.snake = [
    { x: 5, y: 5 },
    { x: 5, y: 6 },
    { x: 4, y: 6 },
    { x: 4, y: 5 },
  ];
  g.dir = { dx: 0, dy: 1 };
  g.nextDir = { dx: 0, dy: 1 }; // 次の頭は (5,6) = 既存の胴体と重なる
  g.food = { x: -1, y: -1 };
  g._step();
  assert(g.phase === 'gameOver', 'running into its own body ends the game');
  g.quit();
}

// 一時停止/再開
{
  const g = new SnakeByteGame(() => {});
  g.start({ skipReady: true });
  g.togglePause();
  assert(g.phase === 'paused', 'togglePause() pauses from playing');

  const snakeBefore = JSON.stringify(g.snake);
  g.update(1);
  assert(JSON.stringify(g.snake) === snakeBefore, 'update() has no effect while paused');

  g.togglePause();
  assert(g.phase === 'playing', 'togglePause() resumes from paused');
  g.quit();
}

// 最高得点はlocalStorageに保存され、次のインスタンスからも読める
{
  localStorage.setItem('snakeByte.highScore', '0');
  const g1 = new SnakeByteGame(() => {});
  g1.start({ skipReady: true });
  g1.score = 777;
  g1._gameOver();
  assert(g1.highScore === 777, 'highScore updates on game over when it is a new record');

  const g2 = new SnakeByteGame(() => {});
  assert(g2.highScore === 777, 'a fresh instance reads the persisted highScore back');
  g1.quit();
}

console.log('done');
