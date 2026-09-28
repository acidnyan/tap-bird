'use strict';

// ===== 定数 =====
// 横幅は固定し、縦は画面比率に合わせて伸縮（縦長スマホでも余白が出ない）
const W = 360;
const MIN_H = 560;
const MAX_H = 800;
const GROUND_H = 80;

const GRAVITY = 1500;      // px/s^2
const FLAP_V = -430;       // px/s
const MAX_FALL = 650;      // px/s
const BIRD_X = 90;
const BIRD_R = 15;

const PIPE_W = 64;
const PIPE_GAP = 165;
const PIPE_SPEED = 160;    // px/s
const PIPE_SPACING = 215;  // 土管同士の間隔 px

const BEST_KEY = 'tapbird-best';

// ===== キャンバス =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let H = 640;
let groundY = H - GROUND_H;

function resize() {
  const style = getComputedStyle(document.body);
  const availW = document.body.clientWidth -
    parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
  const availH = document.body.clientHeight -
    parseFloat(style.paddingTop) - parseFloat(style.paddingBottom);

  H = Math.round(Math.min(MAX_H, Math.max(MIN_H, (availH / availW) * W)));
  groundY = H - GROUND_H;

  const scale = Math.min(availW / W, availH / H);
  const dpr = window.devicePixelRatio || 1;
  canvas.style.width = `${Math.floor(W * scale)}px`;
  canvas.style.height = `${Math.floor(H * scale)}px`;
  canvas.width = Math.floor(W * scale * dpr);
  canvas.height = Math.floor(H * scale * dpr);
  ctx.setTransform(scale * dpr, 0, 0, scale * dpr, 0, 0);
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 100));
resize();

// ===== サウンド（Web Audio で生成、初回操作時に有効化）=====
let audio = null;
function initAudio() {
  if (audio) {
    if (audio.state === 'suspended') audio.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (AC) audio = new AC();
}
function beep(freqFrom, freqTo, duration, type = 'square', volume = 0.08) {
  if (!audio) return;
  const t = audio.currentTime;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqFrom, t);
  osc.frequency.exponentialRampToValueAtTime(freqTo, t + duration);
  gain.gain.setValueAtTime(volume, t);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(gain).connect(audio.destination);
  osc.start(t);
  osc.stop(t + duration);
}
const sfx = {
  flap: () => beep(420, 720, 0.09, 'square', 0.05),
  score: () => { beep(880, 880, 0.07, 'square', 0.05); setTimeout(() => beep(1320, 1320, 0.1, 'square', 0.05), 70); },
  hit: () => beep(300, 60, 0.35, 'sawtooth', 0.1),
};

// ===== ハイスコア =====
function loadBest() {
  try { return Number(localStorage.getItem(BEST_KEY)) || 0; } catch { return 0; }
}
function saveBest(v) {
  try { localStorage.setItem(BEST_KEY, String(v)); } catch { /* プライベートモード等 */ }
}

// ===== ゲーム状態 =====
let state = 'title'; // 'title' | 'play' | 'over'
let score = 0;
let best = loadBest();
let isNewBest = false;
let overAt = 0;
let flash = 0;
let groundOffset = 0;
let time = 0;

const bird = { y: 0, vy: 0, angle: 0, wing: 0 };
let pipes = [];
let clouds = [];

function reset() {
  bird.y = H * 0.42;
  bird.vy = 0;
  bird.angle = 0;
  pipes = [];
  score = 0;
  isNewBest = false;
}

function initClouds() {
  clouds = [];
  for (let i = 0; i < 5; i++) {
    clouds.push({ x: Math.random() * W, y: 40 + Math.random() * (H * 0.4), s: 0.6 + Math.random() * 0.8 });
  }
}

function spawnPipe(x) {
  const margin = 70;
  const minTop = margin;
  const maxTop = groundY - margin - PIPE_GAP;
  const top = minTop + Math.random() * (maxTop - minTop);
  pipes.push({ x, top, passed: false });
}

function flap() {
  initAudio();
  if (state === 'title') {
    state = 'play';
    reset();
    spawnPipe(W + 60);
  }
  if (state === 'play') {
    bird.vy = FLAP_V;
    sfx.flap();
  } else if (state === 'over' && performance.now() - overAt > 600) {
    state = 'title';
    reset();
  }
}

function gameOver() {
  if (state !== 'play') return;
  state = 'over';
  overAt = performance.now();
  flash = 1;
  sfx.hit();
  if (navigator.vibrate) navigator.vibrate(80);
  if (score > best) {
    best = score;
    isNewBest = true;
    saveBest(best);
  }
}

// ===== 入力 =====
window.addEventListener('pointerdown', (e) => {
  e.preventDefault();
  flap();
}, { passive: false });
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'Enter') {
    e.preventDefault();
    if (!e.repeat) flap();
  }
});
// iOS のダブルタップズーム・ピンチ対策
document.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
document.addEventListener('gesturestart', (e) => e.preventDefault());

// ===== 更新 =====
function circleRectHit(cx, cy, r, rx, ry, rw, rh) {
  const nx = Math.max(rx, Math.min(cx, rx + rw));
  const ny = Math.max(ry, Math.min(cy, ry + rh));
  const dx = cx - nx;
  const dy = cy - ny;
  return dx * dx + dy * dy < r * r;
}

function update(dt) {
  time += dt;
  flash = Math.max(0, flash - dt * 3);
  bird.wing += dt * (state === 'over' ? 0 : 12);

  for (const c of clouds) {
    c.x -= dt * 12 * c.s;
    if (c.x < -80) { c.x = W + 80; c.y = 40 + Math.random() * (H * 0.4); }
  }

  if (state === 'title') {
    bird.y = H * 0.42 + Math.sin(time * 3) * 10;
    bird.angle = 0;
    groundOffset = (groundOffset + PIPE_SPEED * dt) % 24;
    return;
  }

  // 鳥の物理（ゲームオーバー後も地面まで落ちる）
  bird.vy = Math.min(MAX_FALL, bird.vy + GRAVITY * dt);
  bird.y += bird.vy * dt;
  const targetAngle = Math.max(-0.45, Math.min(1.4, bird.vy / 500));
  bird.angle += (targetAngle - bird.angle) * Math.min(1, dt * 10);

  if (bird.y < BIRD_R) { bird.y = BIRD_R; bird.vy = 0; }
  if (bird.y + BIRD_R >= groundY) {
    bird.y = groundY - BIRD_R;
    bird.vy = 0;
    gameOver();
  }

  if (state !== 'play') return;

  groundOffset = (groundOffset + PIPE_SPEED * dt) % 24;

  for (const p of pipes) {
    p.x -= PIPE_SPEED * dt;
    if (!p.passed && p.x + PIPE_W < BIRD_X - BIRD_R) {
      p.passed = true;
      score++;
      sfx.score();
    }
    // 当たり判定はわずかに甘くして理不尽さを減らす
    const r = BIRD_R - 3;
    if (circleRectHit(BIRD_X, bird.y, r, p.x, -1000, PIPE_W, p.top + 1000) ||
        circleRectHit(BIRD_X, bird.y, r, p.x, p.top + PIPE_GAP, PIPE_W, groundY - p.top - PIPE_GAP)) {
      gameOver();
    }
  }

  const last = pipes[pipes.length - 1];
  if (last && last.x < W - PIPE_SPACING) spawnPipe(last.x + PIPE_SPACING);
  if (pipes.length && pipes[0].x < -PIPE_W - 10) pipes.shift();
}

// ===== 描画 =====
function drawBackground() {
  const g = ctx.createLinearGradient(0, 0, 0, groundY);
  g.addColorStop(0, '#4ec0ca');
  g.addColorStop(1, '#bfeef2');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, groundY);

  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  for (const c of clouds) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, 18 * c.s, 0, Math.PI * 2);
    ctx.arc(c.x + 20 * c.s, c.y - 8 * c.s, 22 * c.s, 0, Math.PI * 2);
    ctx.arc(c.x + 42 * c.s, c.y, 18 * c.s, 0, Math.PI * 2);
    ctx.fill();
  }

  // 遠景の街並み
  ctx.fillStyle = '#a3dcc0';
  for (let i = 0; i < 9; i++) {
    const bw = 40;
    const bh = 30 + ((i * 37) % 50);
    ctx.fillRect(i * bw, groundY - bh, bw - 4, bh);
  }
}

function drawPipe(x, y, h, isTop) {
  if (h <= 0) return;
  ctx.fillStyle = '#73bf2e';
  ctx.strokeStyle = '#3b6b14';
  ctx.lineWidth = 3;
  ctx.fillRect(x, y, PIPE_W, h);
  ctx.strokeRect(x, y, PIPE_W, h);
  // ハイライト
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  ctx.fillRect(x + 8, y, 8, h);
  // 口の部分
  const capH = 24;
  const capY = isTop ? y + h - capH : y;
  ctx.fillStyle = '#86d33a';
  ctx.fillRect(x - 5, capY, PIPE_W + 10, capH);
  ctx.strokeRect(x - 5, capY, PIPE_W + 10, capH);
}

function drawGround() {
  ctx.fillStyle = '#ded895';
  ctx.fillRect(0, groundY, W, GROUND_H);
  ctx.fillStyle = '#73bf2e';
  ctx.fillRect(0, groundY, W, 14);
  ctx.fillStyle = '#5ea524';
  for (let x = -groundOffset; x < W; x += 24) {
    ctx.beginPath();
    ctx.moveTo(x, groundY + 14);
    ctx.lineTo(x + 12, groundY + 14);
    ctx.lineTo(x + 6, groundY);
    ctx.fill();
  }
  ctx.strokeStyle = '#3b6b14';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, groundY);
  ctx.lineTo(W, groundY);
  ctx.stroke();
}

function drawBird() {
  ctx.save();
  ctx.translate(BIRD_X, bird.y);
  ctx.rotate(bird.angle);
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#5a3b00';

  // 体
  ctx.fillStyle = '#f7d02c';
  ctx.beginPath();
  ctx.ellipse(0, 0, BIRD_R + 3, BIRD_R, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 羽（パタパタ）
  const wingY = Math.sin(bird.wing) * 5;
  ctx.fillStyle = '#fff4b0';
  ctx.beginPath();
  ctx.ellipse(-6, 3 + wingY, 9, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // 目
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(7, -5, 6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#222';
  ctx.beginPath();
  ctx.arc(9, -5, 2.5, 0, Math.PI * 2);
  ctx.fill();

  // くちばし
  ctx.fillStyle = '#f47a2a';
  ctx.beginPath();
  ctx.moveTo(13, 1);
  ctx.lineTo(25, 4);
  ctx.lineTo(13, 8);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

function outlinedText(text, x, y, size, fill = '#fff') {
  ctx.font = `bold ${size}px system-ui, -apple-system, "Hiragino Sans", "Noto Sans JP", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.lineWidth = Math.max(4, size / 6);
  ctx.strokeStyle = '#2b2b3a';
  ctx.strokeText(text, x, y);
  ctx.fillStyle = fill;
  ctx.fillText(text, x, y);
}

function drawUI() {
  if (state === 'title') {
    outlinedText('Tap Bird', W / 2, H * 0.2, 52, '#f7d02c');
    const blink = Math.sin(time * 5) > -0.3;
    if (blink) outlinedText('タップしてスタート', W / 2, H * 0.6, 24);
    outlinedText(`BEST ${best}`, W / 2, H * 0.68, 20);
    return;
  }

  outlinedText(String(score), W / 2, 70, 56);

  if (state === 'over') {
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0, 0, W, H);
    outlinedText('GAME OVER', W / 2, H * 0.28, 44, '#f47a2a');

    // スコアパネル
    const pw = 240;
    const ph = 150;
    const px = (W - pw) / 2;
    const py = H * 0.36;
    ctx.fillStyle = '#ded895';
    ctx.strokeStyle = '#5a3b00';
    ctx.lineWidth = 4;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(px, py, pw, ph, 14);
    else ctx.rect(px, py, pw, ph);
    ctx.fill();
    ctx.stroke();
    outlinedText('SCORE', W / 2, py + 28, 18, '#f47a2a');
    outlinedText(String(score), W / 2, py + 60, 34);
    outlinedText(isNewBest ? 'NEW BEST!' : `BEST ${best}`, W / 2, py + 110, 22, isNewBest ? '#ff5a5a' : '#fff');

    if (performance.now() - overAt > 600) {
      outlinedText('タップでもう一度', W / 2, py + ph + 50, 22);
    }
  }
}

function draw() {
  drawBackground();
  for (const p of pipes) {
    drawPipe(p.x, 0, p.top, true);
    drawPipe(p.x, p.top + PIPE_GAP, groundY - p.top - PIPE_GAP, false);
  }
  drawGround();
  drawBird();
  drawUI();

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flash})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ===== メインループ =====
let last = performance.now();
function loop(now) {
  // タブ復帰時などの大きなジャンプで壁抜けしないよう上限を設ける
  const dt = Math.min(1 / 30, (now - last) / 1000);
  last = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
document.addEventListener('visibilitychange', () => { last = performance.now(); });

initClouds();
reset();
requestAnimationFrame(loop);
