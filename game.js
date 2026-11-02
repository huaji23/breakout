// 打砖块 - 微信小游戏
// 纯 Canvas 实现：触控挡板、多关卡、最高分存档、粒子特效

const sys = wx.getSystemInfoSync();
const W = sys.windowWidth;
const H = sys.windowHeight;
const DPR = Math.min(sys.pixelRatio || 2, 3);

const canvas = wx.createCanvas();
canvas.width = W * DPR;
canvas.height = H * DPR;
const ctx = canvas.getContext('2d');
ctx.scale(DPR, DPR);

// ---------- 主题 ----------
const THEME = {
  bg1: '#0b1020',
  bg2: '#1a2340',
  paddle: '#4fd1c5',
  ball: '#ffe066',
  text: '#e6f1ff',
  dim: '#7f8fa6',
  brick: ['#ff6b6b', '#ffa94d', '#ffd43b', '#69db7c', '#4dabf7', '#b197fc'],
};

// ---------- 游戏状态 ----------
const STATE = { READY: 0, PLAYING: 1, PAUSED: 2, OVER: 3, WIN: 4 };

const game = {
  state: STATE.READY,
  score: 0,
  best: wx.getStorageSync('breakout_best') || 0,
  lives: 3,
  level: 1,
  particles: [],
  shake: 0,
};

// ---------- 挡板 ----------
const paddle = {
  w: Math.max(76, W * 0.22),
  h: 12,
  x: W / 2,
  y: H - 70,
  speed: 0,
  targetX: W / 2,
};

// ---------- 球 ----------
const ball = {
  x: W / 2,
  y: paddle.y - 24,
  r: 7,
  vx: 0,
  vy: 0,
  launched: false,
  baseSpeed: 320, // px/s，随关卡提升
};

// ---------- 砖块 ----------
const brick = {
  rows: 5,
  cols: 6,
  pad: 6,
  top: 90,
  h: 22,
  list: [],
};

function brickGeometry() {
  const margin = 14;
  const totalW = W - margin * 2;
  const w = (totalW - brick.pad * (brick.cols - 1)) / brick.cols;
  return { w, margin };
}

function buildBricks() {
  brick.list = [];
  const { w, margin } = brickGeometry();
  const rows = Math.min(brick.rows + Math.floor((game.level - 1) / 2), 7);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < brick.cols; c++) {
      // 关卡越高，空心砖越多
      const tough = game.level > 1 && (r + c) % (7 - Math.min(game.level, 5)) === 0 ? 2 : 1;
      brick.list.push({
        x: margin + c * (w + brick.pad),
        y: brick.top + r * (brick.h + brick.pad),
        w,
        h: brick.h,
        hp: tough,
        maxHp: tough,
        color: THEME.brick[r % THEME.brick.length],
        alive: true,
      });
    }
  }
}

function resetBall() {
  ball.x = paddle.x;
  ball.y = paddle.y - ball.r - 12;
  ball.vx = 0;
  ball.vy = 0;
  ball.launched = false;
  ball.baseSpeed = 300 + game.level * 35;
}

function launchBall() {
  if (ball.launched) return;
  ball.launched = true;
  const angle = (-Math.PI / 2) + (Math.random() - 0.5) * 0.7;
  const s = ball.baseSpeed;
  ball.vx = Math.cos(angle) * s;
  ball.vy = Math.sin(angle) * s;
  game.state = STATE.PLAYING;
}

function startGame() {
  game.score = 0;
  game.lives = 3;
  game.level = 1;
  game.particles = [];
  paddle.x = W / 2;
  paddle.targetX = W / 2;
  buildBricks();
  resetBall();
  game.state = STATE.READY;
}

function nextLevel() {
  game.level += 1;
  paddle.w = Math.max(64, paddle.w - 6);
  buildBricks();
  resetBall();
  game.state = STATE.READY;
}

// ---------- 特效 ----------
function spawnParticles(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 160;
    game.particles.push({
      x, y,
      vx: Math.cos(a) * sp,
      vy: Math.sin(a) * sp,
      life: 0.55 + Math.random() * 0.3,
      age: 0,
      color,
      size: 1.5 + Math.random() * 2.5,
    });
  }
}

function updateParticles(dt) {
  for (let i = game.particles.length - 1; i >= 0; i--) {
    const p = game.particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      game.particles.splice(i, 1);
      continue;
    }
    p.vy += 420 * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

// ---------- 触控 ----------
function setPaddleByTouch(t) {
  paddle.targetX = t.clientX;
}
wx.onTouchStart((e) => {
  const t = e.touches[0];
  if (!t) return;
  if (game.state === STATE.WIN) {
    nextLevel();
    return;
  }
  if (game.state === STATE.READY) {
    setPaddleByTouch(t);
    launchBall();
  } else if (game.state === STATE.OVER) {
    startGame();
  } else if (game.state === STATE.PAUSED) {
    game.state = ball.launched ? STATE.PLAYING : STATE.READY;
  } else {
    setPaddleByTouch(t);
  }
});
wx.onTouchMove((e) => {
  const t = e.touches[0];
  if (t) setPaddleByTouch(t);
});

// 切后台自动暂停
wx.onHide(() => {
  if (game.state === STATE.PLAYING) game.state = STATE.PAUSED;
});

// ---------- 逻辑更新 ----------
function update(dt) {
  // 挡板跟随（平滑）
  const half = paddle.w / 2;
  const target = Math.max(half + 4, Math.min(W - half - 4, paddle.targetX));
  paddle.x += (target - paddle.x) * Math.min(1, dt * 18);

  if (game.state !== STATE.PLAYING) return;

  // 球
  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // 左右墙
  if (ball.x - ball.r < 0) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx);
  } else if (ball.x + ball.r > W) {
    ball.x = W - ball.r;
    ball.vx = -Math.abs(ball.vx);
  }
  // 顶部
  if (ball.y - ball.r < 0) {
    ball.y = ball.r;
    ball.vy = Math.abs(ball.vy);
  }

  // 挡板碰撞
  if (
    ball.vy > 0 &&
    ball.y + ball.r >= paddle.y &&
    ball.y - ball.r <= paddle.y + paddle.h &&
    ball.x >= paddle.x - half - ball.r &&
    ball.x <= paddle.x + half + ball.r
  ) {
    ball.y = paddle.y - ball.r;
    // 根据击球位置改变角度
    const hit = (ball.x - paddle.x) / half; // -1..1
    const angle = (-Math.PI / 2) + hit * 1.0;
    const speed = Math.hypot(ball.vx, ball.vy) * 1.015;
    ball.vx = Math.cos(angle) * speed;
    ball.vy = Math.sin(angle) * speed;
    spawnParticles(ball.x, paddle.y, THEME.paddle, 6);
  }

  // 砖块碰撞
  for (const b of brick.list) {
    if (!b.alive) continue;
    if (
      ball.x + ball.r > b.x &&
      ball.x - ball.r < b.x + b.w &&
      ball.y + ball.r > b.y &&
      ball.y - ball.r < b.y + b.h
    ) {
      // 判断从哪个方向撞进来
      const overlapX = Math.min(ball.x + ball.r - b.x, b.x + b.w - (ball.x - ball.r));
      const overlapY = Math.min(ball.y + ball.r - b.y, b.y + b.h - (ball.y - ball.r));
      if (overlapX < overlapY) {
        ball.vx = -ball.vx;
        ball.x += ball.vx > 0 ? overlapX : -overlapX;
      } else {
        ball.vy = -ball.vy;
        ball.y += ball.vy > 0 ? overlapY : -overlapY;
      }

      b.hp -= 1;
      if (b.hp <= 0) {
        b.alive = false;
        game.score += 10 * game.level;
        spawnParticles(b.x + b.w / 2, b.y + b.h / 2, b.color, 10);
        game.shake = 4;
      } else {
        game.score += 3;
        spawnParticles(b.x + b.w / 2, b.y + b.h / 2, b.color, 4);
      }
      break;
    }
  }

  // 全部打完 -> 下一关
  if (brick.list.every((b) => !b.alive)) {
    game.state = STATE.WIN;
    if (game.score > game.best) {
      game.best = game.score;
      wx.setStorageSync('breakout_best', game.best);
    }
    return;
  }

  // 掉底
  if (ball.y - ball.r > H) {
    game.lives -= 1;
    game.shake = 8;
    if (game.lives <= 0) {
      game.state = STATE.OVER;
      if (game.score > game.best) {
        game.best = game.score;
        wx.setStorageSync('breakout_best', game.best);
      }
    } else {
      resetBall();
      game.state = STATE.READY;
    }
  }

  updateParticles(dt);
  game.shake *= 0.86;
}

// ---------- 绘制 ----------
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, THEME.bg1);
  g.addColorStop(1, THEME.bg2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawHUD() {
  ctx.font = '600 15px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillStyle = THEME.text;
  ctx.fillText(`分数 ${game.score}`, 16, 40);

  ctx.textAlign = 'right';
  ctx.fillStyle = THEME.dim;
  ctx.fillText(`最高 ${game.best}`, W - 16, 40);

  ctx.textAlign = 'center';
  ctx.fillStyle = THEME.dim;
  ctx.font = '600 13px sans-serif';
  ctx.fillText(`第 ${game.level} 关`, W / 2, 40);

  // 生命
  ctx.textAlign = 'left';
  for (let i = 0; i < game.lives; i++) {
    ctx.beginPath();
    ctx.arc(20 + i * 16, 62, 5, 0, Math.PI * 2);
    ctx.fillStyle = THEME.paddle;
    ctx.fill();
  }
}

function drawBricks() {
  for (const b of brick.list) {
    if (!b.alive) continue;
    ctx.globalAlpha = b.hp < b.maxHp ? 0.62 : 1;
    const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, b.color);
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    roundRect(b.x, b.y, b.w, b.h, 5);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function drawPaddle() {
  const g = ctx.createLinearGradient(paddle.x - paddle.w / 2, 0, paddle.x + paddle.w / 2, 0);
  g.addColorStop(0, '#2c7a7b');
  g.addColorStop(0.5, THEME.paddle);
  g.addColorStop(1, '#2c7a7b');
  ctx.fillStyle = g;
  roundRect(paddle.x - paddle.w / 2, paddle.y, paddle.w, paddle.h, 6);
  ctx.fill();
}

function drawBall() {
  ctx.save();
  ctx.shadowColor = THEME.ball;
  ctx.shadowBlur = 14;
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fillStyle = THEME.ball;
  ctx.fill();
  ctx.restore();
}

function drawParticles() {
  for (const p of game.particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.age / p.life);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawCenterText(title, subtitle, hint) {
  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,0.55)';
  roundRect(W / 2 - 130, H / 2 - 92, 260, 184, 16);
  ctx.fill();

  ctx.fillStyle = THEME.text;
  ctx.font = '700 26px sans-serif';
  ctx.fillText(title, W / 2, H / 2 - 30);

  ctx.fillStyle = THEME.paddle;
  ctx.font = '600 15px sans-serif';
  if (subtitle) ctx.fillText(subtitle, W / 2, H / 2 + 4);

  ctx.fillStyle = THEME.dim;
  ctx.font = '400 13px sans-serif';
  if (hint) ctx.fillText(hint, W / 2, H / 2 + 46);
}

function draw() {
  ctx.save();
  if (game.shake > 0.3) {
    ctx.translate((Math.random() - 0.5) * game.shake, (Math.random() - 0.5) * game.shake);
  }
  drawBackground();
  drawBricks();
  drawPaddle();
  drawBall();
  drawParticles();
  drawHUD();

  if (game.state === STATE.READY) {
    drawCenterText('准备开始', '左右滑动接球', '点击屏幕发球');
  } else if (game.state === STATE.PAUSED) {
    drawCenterText('已暂停', '点击继续', '');
  } else if (game.state === STATE.OVER) {
    drawCenterText('游戏结束', `得分 ${game.score}`, '点击重新开始');
  } else if (game.state === STATE.WIN) {
    drawCenterText(`第 ${game.level} 关通过`, `得分 ${game.score}`, '点击进入下一关');
  }
  ctx.restore();
}

// ---------- 主循环 ----------
let last = Date.now();
function loop() {
  const now = Date.now();
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.05) dt = 0.05; // 防止卡顿导致穿模

  update(dt);
  draw();
  requestAnimationFrame(loop);
}

startGame();
loop();
