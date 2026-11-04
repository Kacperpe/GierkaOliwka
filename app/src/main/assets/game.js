'use strict';
// ===== Gierka Oliwka — strzelanie napojami i łączenie (merge) =====
// Zasady punktów: połączenie dwóch obiektów poziomu n daje 2^n pkt
// (2× lv1 = 2 pkt, 2× lv2 = 4 pkt, 2× lv3 = 8 pkt ...).

const LEVELS = [
  { name: 'Sok wiśniowy',    emoji: '🍒', c1: '#ef5350', c2: '#8e0000' },
  { name: 'Sok pomarańczowy', emoji: '🍊', c1: '#ffe082', c2: '#ff8f00' },
  { name: 'Kiwi',            emoji: '🥝', c1: '#c5e1a5', c2: '#558b2f' },
  { name: 'Truskawkowy',     emoji: '🍓', c1: '#fce4ec', c2: '#ec407a' },
  { name: 'Jagodowy',        emoji: '🍇', c1: '#7986cb', c2: '#1a237e' },
  { name: 'Drink z parasolką', emoji: '🍹', c1: '#ffcc80', c2: '#e65100' },
  { name: 'Różowy koktajl',  emoji: '🍸', c1: '#f48fb1', c2: '#6a1b9a' },
  { name: 'Dzbanek lemoniady', emoji: '🍋', c1: '#fff176', c2: '#f4511e' },
  { name: 'Kokosowy',        emoji: '🥥', c1: '#b3e5fc', c2: '#0277bd' },
  { name: 'Tęczowy słój',    emoji: '🍧', c1: '#f8bbd0', c2: '#5e35b1' },
];
const MAX_LV = LEVELS.length;           // poziomy 1..10
const radius = lv => 17 + lv * 4.6;     // lv1 ≈ 22, lv10 ≈ 63
const mergePoints = lv => Math.pow(2, lv);

// ----- canvas / skala -----
const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = 400;          // logiczna szerokość
let H = 800, S = 1, dpr = 1;
let T = {};             // geometria stołu

function layout() {
  dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(innerWidth * dpr);
  cv.height = Math.round(innerHeight * dpr);
  S = cv.width / W;
  H = cv.height / S;
  const top = Math.max(150, H * 0.19);
  const bottom = H - 92;
  T = { left: 22, right: W - 22, top, bottom };
  T.line = bottom - 120;           // przerywana linia
  T.launchY = T.line + 52;         // pozycja wyrzutni
}
addEventListener('resize', layout);
layout();

// ----- stan gry -----
let items = [], particles = [], floaters = [];
let score = 0, best = 0, nextId = 1;
let current = 1, next = 1;
let aimX = W / 2, aiming = false;
let lastShot = -10, shotItem = null;
let orders = [];
let gameOver = false, time = 0;
let maxReached = 1;

try { best = +localStorage.getItem('go_best') || 0; } catch (e) {}

function rndSpawn() {
  // dostępne poziomy rosną wraz z postępem (max 5)
  const maxSpawn = Math.min(5, Math.max(3, maxReached - 2));
  const w = [40, 30, 18, 8, 4].slice(0, maxSpawn);
  let s = w.reduce((a, b) => a + b, 0), r = Math.random() * s;
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i + 1; }
  return 1;
}

function newOrder() {
  const lo = Math.min(MAX_LV, Math.max(4, maxReached - 1));
  const hi = Math.min(MAX_LV, Math.max(5, maxReached + 1));
  let lv = lo + Math.floor(Math.random() * (hi - lo + 1));
  if (orders.some(o => o.lv === lv) && lv < MAX_LV) lv++;
  return { lv, reward: mergePoints(lv) * 5, born: time };
}

function makeItem(lv, x, y, vx = 0, vy = 0) {
  return { id: nextId++, lv, r: radius(lv), x, y, vx, vy, pop: 0, dead: false };
}

function reset() {
  items = []; particles = []; floaters = [];
  score = 0; maxReached = 1; gameOver = false; shotItem = null;
  current = rndSpawn(); next = rndSpawn();
  orders = [newOrder(), newOrder()];
  document.getElementById('over').style.display = 'none';
  saveGame();
}

window.saveGame = function () {
  try {
    localStorage.setItem('go_best', best);
    if (gameOver) { localStorage.removeItem('go_state'); return; }
    localStorage.setItem('go_state', JSON.stringify({
      items: items.map(i => ({ lv: i.lv, x: i.x / W, y: (i.y - T.top) / (T.bottom - T.top) })),
      score, current, next, orders: orders.map(o => ({ lv: o.lv, reward: o.reward })), maxReached,
    }));
  } catch (e) {}
};

function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem('go_state'));
    if (!s || !s.items) return false;
    items = s.items.map(i => makeItem(i.lv, i.x * W, T.top + i.y * (T.bottom - T.top)));
    score = s.score; current = s.current; next = s.next; maxReached = s.maxReached || 1;
    orders = (s.orders || []).map(o => ({ ...o, born: 0 }));
    while (orders.length < 2) orders.push(newOrder());
    return true;
  } catch (e) { return false; }
}

// ----- sterowanie -----
function toLogical(e) {
  const r = cv.getBoundingClientRect();
  return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H };
}
function clampAim(x) {
  const r = radius(current);
  return Math.max(T.left + r, Math.min(T.right - r, x));
}
cv.addEventListener('pointerdown', e => {
  if (gameOver) return;
  aiming = true; aimX = clampAim(toLogical(e).x);
});
cv.addEventListener('pointermove', e => {
  if (aiming) aimX = clampAim(toLogical(e).x);
});
cv.addEventListener('pointerup', () => {
  if (!aiming) return;
  aiming = false;
  shoot();
});
cv.addEventListener('pointercancel', () => { aiming = false; });
document.getElementById('again').addEventListener('click', reset);

function canShoot() {
  if (gameOver) return false;
  if (time - lastShot < 0.35) return false;
  // poprzedni strzał musi minąć linię (albo się zatrzymać)
  if (shotItem && !shotItem.dead && shotItem.y > T.line - shotItem.r &&
      Math.hypot(shotItem.vx, shotItem.vy) > 20) return false;
  return true;
}

function shoot() {
  if (!canShoot()) return;
  const it = makeItem(current, clampAim(aimX), T.launchY, 0, -1050);
  items.push(it);
  shotItem = it;
  lastShot = time;
  current = next; next = rndSpawn();
  aimX = clampAim(aimX);
}

// ----- fizyka -----
const REST_WALL = 0.55, REST_BALL = 0.35;
const FRICTION_CONST = 260;   // stałe hamowanie (jednostki/s²)
const FRICTION_MUL = 0.9;     // tłumienie proporcjonalne (1/s)

function step(dt) {
  for (const it of items) {
    const sp = Math.hypot(it.vx, it.vy);
    if (sp > 0) {
      let ns = sp - (FRICTION_CONST + FRICTION_MUL * sp) * dt;
      if (ns < 2) ns = 0;
      it.vx *= ns / sp; it.vy *= ns / sp;
    }
    it.x += it.vx * dt; it.y += it.vy * dt;
    // ściany
    if (it.x - it.r < T.left)  { it.x = T.left + it.r;  it.vx = Math.abs(it.vx) * REST_WALL; }
    if (it.x + it.r > T.right) { it.x = T.right - it.r; it.vx = -Math.abs(it.vx) * REST_WALL; }
    if (it.y - it.r < T.top)   { it.y = T.top + it.r;   it.vy = Math.abs(it.vy) * REST_WALL; }
    if (it.y + it.r > T.bottom){ it.y = T.bottom - it.r; it.vy = -Math.abs(it.vy) * REST_WALL; }
  }

  const merges = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.dead) continue;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      const d = Math.hypot(dx, dy), minD = a.r + b.r;
      if (d >= minD || d === 0) continue;
      if (a.lv === b.lv) { merges.push([a, b]); a.dead = b.dead = true; break; }
      // rozsunięcie + odbicie
      const nx = dx / d, ny = dy / d;
      const ma = a.r * a.r, mb = b.r * b.r;
      const overlap = minD - d;
      a.x -= nx * overlap * mb / (ma + mb); a.y -= ny * overlap * mb / (ma + mb);
      b.x += nx * overlap * ma / (ma + mb); b.y += ny * overlap * ma / (ma + mb);
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        const jimp = -(1 + REST_BALL) * rv / (1 / ma + 1 / mb);
        a.vx -= jimp * nx / ma; a.vy -= jimp * ny / ma;
        b.vx += jimp * nx / mb; b.vy += jimp * ny / mb;
      }
    }
  }

  for (const [a, b] of merges) doMerge(a, b);
  if (merges.length) items = items.filter(i => !i.dead);
}

function doMerge(a, b) {
  const lv = a.lv;
  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
  const vx = (a.vx + b.vx) * 0.3, vy = (a.vy + b.vy) * 0.3;
  const pts = mergePoints(lv);
  score += pts;
  burst(x, y, LEVELS[lv - 1].c2, 14);
  if (lv >= MAX_LV) {
    // dwa najwyższe poziomy znikają
    floaters.push({ x, y, text: '+' + pts + ' MEGA!', t: 0, big: true });
    burst(x, y, '#ffd54f', 40);
  } else {
    const n = makeItem(lv + 1, x, y, vx, vy);
    n.pop = 1;
    const m = radius(lv + 1);
    n.x = Math.max(T.left + m, Math.min(T.right - m, n.x));
    n.y = Math.max(T.top + m, Math.min(T.bottom - m, n.y));
    items.push(n);
    if (shotItem === a || shotItem === b) shotItem = n;
    maxReached = Math.max(maxReached, lv + 1);
    floaters.push({ x, y, text: '+' + pts, t: 0 });
    // zamówienia
    for (let k = 0; k < orders.length; k++) {
      if (orders[k].lv === lv + 1) {
        score += orders[k].reward;
        floaters.push({ x, y: y - 30, text: 'Zamówienie! +' + orders[k].reward, t: 0, big: true });
        orders[k] = newOrder();
        break;
      }
    }
  }
  if (score > best) best = score;
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 180;
    particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, t: 0,
      life: 0.4 + Math.random() * 0.4, color, size: 2 + Math.random() * 4 });
  }
}

function allSettled() {
  return items.every(i => Math.hypot(i.vx, i.vy) < 6);
}

let settledFor = 0;
function checkGameOver(dt) {
  if (gameOver) return;
  if (!allSettled() || time - lastShot < 0.8) { settledFor = 0; return; }
  settledFor += dt;
  if (settledFor < 0.3) return;
  if (items.some(i => i.y > T.line)) {
    gameOver = true;
    if (score > best) best = score;
    saveGame();
    document.getElementById('ovScore').textContent = score;
    document.getElementById('ovBest').textContent = best;
    document.getElementById('over').style.display = 'flex';
  }
}

// ----- rysowanie -----
const emojiFont = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';

function drawBackground() {
  // niebo + morze
  let g = ctx.createLinearGradient(0, 0, 0, T.top);
  g.addColorStop(0, '#81d4fa'); g.addColorStop(0.55, '#b3e5fc');
  g.addColorStop(0.56, '#29b6f6'); g.addColorStop(1, '#4dd0e1');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, T.top + 10);
  // piasek
  g = ctx.createLinearGradient(0, T.top - 20, 0, H);
  g.addColorStop(0, '#ffe0a3'); g.addColorStop(1, '#f2c879');
  ctx.fillStyle = g; ctx.fillRect(0, T.top - 30, W, H);
  // strzecha
  ctx.fillStyle = '#c79a52'; ctx.fillRect(0, 0, W, 18);
  ctx.fillStyle = '#a97b3a';
  for (let x = 0; x < W; x += 14) {
    ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x + 7, 32); ctx.lineTo(x + 14, 18); ctx.fill();
  }
  // rama stołu
  const pad = 14;
  ctx.fillStyle = '#b07a43';
  roundRect(T.left - pad, T.top - pad, T.right - T.left + pad * 2, T.bottom - T.top + pad * 2, 18); ctx.fill();
  ctx.fillStyle = '#d9a66b';
  roundRect(T.left - pad + 4, T.top - pad + 4, T.right - T.left + pad * 2 - 8, T.bottom - T.top + pad * 2 - 8, 15); ctx.fill();
  // szklany blat
  g = ctx.createLinearGradient(T.left, T.top, T.right, T.bottom);
  g.addColorStop(0, '#e9f7f1'); g.addColorStop(1, '#d4ece6');
  ctx.fillStyle = g;
  roundRect(T.left, T.top, T.right - T.left, T.bottom - T.top, 8); ctx.fill();
  // rozgwiazdy / muszelki
  ctx.globalAlpha = 0.25; ctx.font = `30px ${emojiFont}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('⭐', T.left + 60, T.line + 60); ctx.fillText('🐚', T.right - 60, T.line + 75);
  ctx.fillText('🐚', T.right - 70, T.top + (T.line - T.top) * 0.75);
  ctx.globalAlpha = 1;
  // linia graniczna
  ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4; ctx.setLineDash([14, 10]);
  ctx.beginPath(); ctx.moveTo(T.left + 6, T.line); ctx.lineTo(T.right - 6, T.line); ctx.stroke();
  ctx.setLineDash([]);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawDrink(lv, x, y, r, alpha = 1) {
  const L = LEVELS[lv - 1];
  ctx.globalAlpha = alpha;
  // cień
  ctx.fillStyle = 'rgba(60,40,20,0.22)';
  ctx.beginPath(); ctx.ellipse(x + r * 0.15, y + r * 0.82, r * 0.85, r * 0.3, 0, 0, Math.PI * 2); ctx.fill();
  // szklanka
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
  g.addColorStop(0, L.c1); g.addColorStop(1, L.c2);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.lineWidth = Math.max(2, r * 0.09); ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.stroke();
  // połysk
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.beginPath(); ctx.ellipse(x - r * 0.4, y - r * 0.45, r * 0.25, r * 0.13, -0.7, 0, Math.PI * 2); ctx.fill();
  // emoji
  ctx.font = `${Math.round(r * 1.05)}px ${emojiFont}`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(L.emoji, x, y + r * 0.05);
  // numer poziomu
  ctx.font = `bold ${Math.round(Math.max(10, r * 0.38))}px sans-serif`;
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
  ctx.strokeText(lv, x + r * 0.62, y + r * 0.6);
  ctx.fillStyle = '#fff'; ctx.fillText(lv, x + r * 0.62, y + r * 0.6);
  ctx.globalAlpha = 1;
}

function drawHUD() {
  // wynik
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(12, 30, 150, 40, 20); ctx.fill();
  ctx.fillStyle = '#ffc107'; ctx.beginPath(); ctx.arc(32, 50, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff8f00'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('★', 32, 51);
  ctx.fillStyle = '#4e342e'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(score, 54, 51);
  ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.lineWidth = 3;
  ctx.strokeText('Rekord: ' + best, 18, 86); ctx.fillText('Rekord: ' + best, 18, 86);

  // następny
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  roundRect(W - 86, 28, 72, 72, 14); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#8bc34a'; ctx.stroke();
  drawDrink(next, W - 50, 62, Math.min(26, radius(next) * 0.75));
  ctx.fillStyle = '#4e342e'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText('Następny', W - 50, 112);

  // zamówienia
  const oy = 36, ow = 64, oh = Math.min(96, T.top - 50);
  orders.forEach((o, k) => {
    const ox = 168 + k * (ow + 6);
    ctx.save();
    ctx.translate(ox + ow / 2, oy);
    ctx.rotate(k ? 0.04 : -0.03);
    ctx.fillStyle = '#fffdf5'; ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 6;
    ctx.fillRect(-ow / 2, 0, ow, oh); ctx.shadowBlur = 0;
    ctx.fillStyle = '#c62828'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('Zamówienie', 0, 12);
    ctx.restore();
    drawDrink(o.lv, ox + ow / 2, oy + oh * 0.5, Math.min(22, oh * 0.24));
    ctx.fillStyle = '#4e342e'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('★ ' + o.reward, ox + ow / 2, oy + oh - 10);
  });
}

function drawEvolution() {
  const y = H - 46, x0 = 30, x1 = W - 30;
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  roundRect(x0 - 10, y - 26, x1 - x0 + 20, 52, 26); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#8bc34a'; ctx.stroke();
  const step = (x1 - x0 - 20) / (MAX_LV - 1);
  for (let i = 0; i < MAX_LV; i++) {
    const r = 9 + i * 0.6;
    drawDrink(i + 1, x0 + 10 + i * step, y - 2, r, i + 1 <= maxReached ? 1 : 0.35);
  }
}

function drawAim() {
  if (gameOver) return;
  const r = radius(current), x = clampAim(aimX);
  // linia celowania
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 4;
  ctx.beginPath(); ctx.moveTo(x, T.launchY - r); ctx.lineTo(x, aimEnd(x, r)); ctx.stroke();
  drawDrink(current, x, T.launchY, r, canShoot() ? 1 : 0.5);
}

function aimEnd(x, r) {
  // linia kończy się na pierwszym napotkanym obiekcie
  let end = T.top;
  for (const it of items) {
    const dx = Math.abs(it.x - x);
    if (dx < it.r + r * 0.3 && it.y < T.launchY) {
      const yy = it.y + Math.sqrt(Math.max(0, (it.r) ** 2 - Math.min(dx, it.r) ** 2));
      if (yy > end) end = yy;
    }
  }
  return end;
}

function render(dt) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  drawBackground();
  // cząstki pod spodem? nie — obiekty sortowane po y dla efektu 3D
  const sorted = items.slice().sort((a, b) => a.y - b.y);
  for (const it of sorted) {
    let r = it.r;
    if (it.pop > 0) { r *= 1 + 0.25 * Math.sin(it.pop * Math.PI); it.pop = Math.max(0, it.pop - dt * 3); }
    drawDrink(it.lv, it.x, it.y, r);
  }
  drawAim();
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const f of floaters) {
    const a = Math.max(0, 1 - f.t / 1.1);
    ctx.globalAlpha = a;
    ctx.font = `bold ${f.big ? 22 : 20}px sans-serif`; ctx.textAlign = 'center';
    ctx.lineWidth = 4; ctx.strokeStyle = '#5d4037';
    ctx.strokeText(f.text, f.x, f.y - f.t * 50);
    ctx.fillStyle = f.big ? '#ffd54f' : '#fff';
    ctx.fillText(f.text, f.x, f.y - f.t * 50);
  }
  ctx.globalAlpha = 1;
  drawHUD();
  drawEvolution();
}

// ----- pętla -----
let last = performance.now(), saveTimer = 0;
function frame(now) {
  let dt = Math.min(0.05, (now - last) / 1000);
  last = now; time += dt;
  const sub = 4;
  for (let i = 0; i < sub; i++) step(dt / sub);
  for (const p of particles) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.92; p.vy *= 0.92; }
  particles = particles.filter(p => p.t < p.life);
  for (const f of floaters) f.t += dt;
  floaters = floaters.filter(f => f.t < 1.1);
  checkGameOver(dt);
  saveTimer += dt;
  if (saveTimer > 3) { saveTimer = 0; saveGame(); }
  render(dt);
  requestAnimationFrame(frame);
}

if (!loadGame()) reset();
requestAnimationFrame(frame);
