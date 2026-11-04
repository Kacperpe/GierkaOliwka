'use strict';
// ===== Gierka Oliwka 3D — strzelanie napojami i łączenie (merge) =====
// Punkty: połączenie dwóch obiektów poziomu n daje 2^n pkt
// (2× lv1 = 2 pkt, 2× lv2 = 4 pkt, 2× lv3 = 8 pkt ...).
// Fizyka liczona w 2D na płaszczyźnie stołu, rysowanie w perspektywie 3D.

// ---------- kształty naczyń (jednostki = promień obiektu r, h w górę) ----------
const SHAPES = {
  tumbler:   { body: [[0, .62], [1.45, .84]], fill: 1.15 },
  short:     { body: [[0, .72], [1.1, .88]], fill: .92 },
  goblet:    { foot: .55, stem: .42, body: [[.42, .22], [.55, .62], [.8, .88], [1.3, .96]], fill: 1.12 },
  hurricane: { foot: .5, stem: .36, body: [[.36, .26], [.6, .58], [.95, .62], [1.3, .5], [1.7, .62], [2.05, .8]], fill: 1.86 },
  jug:       { body: [[0, .7], [.15, .8], [1.3, .82], [1.72, .7]], fill: 1.55, handle: true },
  bowl:      { foot: .5, stem: .3, body: [[.3, .3], [.5, .78], [.8, .98], [1.12, 1.0]], fill: .98 },
  jar:       { body: [[0, .58], [.14, .84], [.5, .98], [1.0, .98], [1.42, .8], [1.58, .56]], fill: 1.48, lid: true, tap: true },
};

const LEVELS = [
  { name: 'Sok wiśniowy',      shape: 'tumbler',   liq: ['#ef5350', '#8e0000'], emoji: '🍒' },
  { name: 'Sok pomarańczowy',  shape: 'tumbler',   liq: ['#ffe082', '#ff8f00'], emoji: '🍋' },
  { name: 'Kiwi',              shape: 'short',     liq: ['#c5e1a5', '#33691e'], emoji: '🥝' },
  { name: 'Truskawkowy',       shape: 'goblet',    liq: ['#fce4ec', '#ec407a'], emoji: '🍓' },
  { name: 'Jagodowy',          shape: 'goblet',    liq: ['#7986cb', '#1a237e'], emoji: '🍇', straw: '#29b6f6' },
  { name: 'Drink z parasolką', shape: 'hurricane', liq: ['#ffcc80', '#e65100'], emoji: '🍊', umbrella: true },
  { name: 'Różowy koktajl',    shape: 'hurricane', liq: ['#f48fb1', '#6a1b9a'], emoji: '🍇', straw: '#ec407a' },
  { name: 'Dzbanek lemoniady', shape: 'jug',       liq: ['#fff176', '#ffa726', '#e64a19'], emoji: '🍋' },
  { name: 'Kokosowa misa',     shape: 'bowl',      liq: ['#b2ebf2', '#0288d1'], emoji: '🍍', straw: '#ffeb3b' },
  { name: 'Tęczowy słój',      shape: 'jar',       liq: ['#f8bbd0', '#ba68c8', '#3f51b5'], emoji: '' },
];
const MAX_LV = LEVELS.length;
const radius = lv => 17 + lv * 4.6;     // lv1 ≈ 22, lv10 ≈ 63
const mergePoints = lv => Math.pow(2, lv);
const shapeHeight = lv => {
  const s = SHAPES[LEVELS[lv - 1].shape];
  return s.body[s.body.length - 1][0] + (s.lid ? .4 : 0);
};

// ---------- świat / kamera ----------
const TW = 360, TL = 760;               // stół w jednostkach fizyki
const T = { left: 0, right: TW, top: 0, bottom: TL, line: TL - 150, launchY: TL - 72 };
const CAM = { h: 760, back: 380, pitch: 56 * Math.PI / 180 };
const FRAME = 18;

const cv = document.getElementById('c');
const ctx = cv.getContext('2d');
const W = 400;
let H = 800, S = 1, PSX = 1, PSY = 1, POX = 200, POY = 0;

function rawProj(x, y, z) {   // x: w bok od środka, y: w przód od bliższej krawędzi, z: w górę
  const c = Math.cos(CAM.pitch), s = Math.sin(CAM.pitch);
  const dy = y + CAM.back, dz = z - CAM.h;
  const depth = dy * c - dz * s;
  const up = dy * s + dz * c;
  return [x / depth, -up / depth, depth];
}
// współrzędne fizyki (px: 0..TW, py: 0 = daleko .. TL = blisko) -> ekran
function proj(px, py, pz = 0) {
  const r = rawProj(px - TW / 2, TL - py, pz);
  return { x: POX + r[0] * PSX, y: POY + r[1] * PSY, k: PSX / r[2] };
}

function layout() {
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(innerWidth * dpr);
  cv.height = Math.round(innerHeight * dpr);
  S = cv.width / W;
  H = cv.height / S;
  const nl = rawProj(-TW / 2 - FRAME, -FRAME, 0), nr = rawProj(TW / 2 + FRAME, -FRAME, 0);
  const fl = rawProj(-TW / 2 - FRAME, TL + FRAME, 0);
  const yTop = Math.max(168, H * 0.2), yBot = H - 106;
  PSX = 386 / (nr[0] - nl[0]);
  PSY = Math.min(PSX * 1.45, (yBot - yTop) / (nl[1] - fl[1]));
  POX = 200;
  POY = yBot - nl[1] * PSY;
}
addEventListener('resize', layout);
layout();

// ---------- stan gry ----------
let items = [], particles = [], floaters = [];
let score = 0, best = 0, nextId = 1;
let current = 1, next = 1;
let aimX = TW / 2, aiming = false;
let lastShot = -10, shotItem = null;
let orders = [];
let gameOver = false, time = 0;
let maxReached = 1;

try { best = +localStorage.getItem('go_best') || 0; } catch (e) {}

function rndSpawn() {
  const maxSpawn = Math.min(5, Math.max(3, maxReached - 2));
  const w = [40, 30, 18, 8, 4].slice(0, maxSpawn);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i + 1; }
  return 1;
}

function newOrder() {
  const lo = Math.min(MAX_LV, Math.max(4, maxReached - 1));
  const hi = Math.min(MAX_LV, Math.max(5, maxReached + 1));
  let lv = lo + Math.floor(Math.random() * (hi - lo + 1));
  if (orders.some(o => o.lv === lv) && lv < MAX_LV) lv++;
  return { lv, reward: mergePoints(lv) * 5 };
}

function makeItem(lv, x, y, vx = 0, vy = 0) {
  return { id: nextId++, lv, r: radius(lv), x, y, vx, vy, pop: 0, dead: false };
}

function reset() {
  items = []; particles = []; floaters = [];
  score = 0; maxReached = 1; gameOver = false; shotItem = null;
  current = rndSpawn(); next = rndSpawn();
  orders = []; orders.push(newOrder()); orders.push(newOrder());
  document.getElementById('over').style.display = 'none';
  saveGame();
}

window.saveGame = function () {
  try {
    localStorage.setItem('go_best', best);
    if (gameOver) { localStorage.removeItem('go_state'); return; }
    localStorage.setItem('go_state', JSON.stringify({
      items: items.map(i => ({ lv: i.lv, x: i.x / TW, y: i.y / TL })),
      score, current, next, orders, maxReached,
    }));
  } catch (e) {}
};

function loadGame() {
  try {
    const s = JSON.parse(localStorage.getItem('go_state'));
    if (!s || !s.items) return false;
    items = s.items.map(i => {
      const it = makeItem(i.lv, i.x * TW, i.y * TL);
      it.x = Math.max(it.r, Math.min(TW - it.r, it.x));
      it.y = Math.max(it.r, Math.min(TL - it.r, it.y));
      return it;
    });
    score = s.score; current = s.current; next = s.next; maxReached = s.maxReached || 1;
    orders = (s.orders || []).map(o => ({ lv: o.lv, reward: o.reward }));
    while (orders.length < 2) orders.push(newOrder());
    return true;
  } catch (e) { return false; }
}

// ---------- sterowanie ----------
function screenToTableX(e) {
  const rc = cv.getBoundingClientRect();
  const sx = (e.clientX - rc.left) / rc.width * W;
  const p = proj(TW / 2, T.launchY);
  return TW / 2 + (sx - p.x) / p.k;
}
function clampAim(x) {
  const r = radius(current);
  return Math.max(r, Math.min(TW - r, x));
}
cv.addEventListener('pointerdown', e => {
  if (gameOver) return;
  aiming = true; aimX = clampAim(screenToTableX(e));
});
cv.addEventListener('pointermove', e => { if (aiming) aimX = clampAim(screenToTableX(e)); });
cv.addEventListener('pointerup', () => { if (!aiming) return; aiming = false; shoot(); });
cv.addEventListener('pointercancel', () => { aiming = false; });
document.getElementById('again').addEventListener('click', reset);

function canShoot() {
  if (gameOver) return false;
  if (time - lastShot < 0.35) return false;
  if (shotItem && !shotItem.dead && shotItem.y > T.line - shotItem.r &&
      Math.hypot(shotItem.vx, shotItem.vy) > 20) return false;
  return true;
}

function shoot() {
  if (!canShoot()) return;
  const it = makeItem(current, clampAim(aimX), T.launchY, 0, -1120);
  items.push(it);
  shotItem = it;
  lastShot = time;
  current = next; next = rndSpawn();
  aimX = clampAim(aimX);
}

// ---------- fizyka ----------
const REST_WALL = 0.55, REST_BALL = 0.35;
const FRICTION_CONST = 260, FRICTION_MUL = 0.9;

function step(dt) {
  for (const it of items) {
    const sp = Math.hypot(it.vx, it.vy);
    if (sp > 0) {
      let ns = sp - (FRICTION_CONST + FRICTION_MUL * sp) * dt;
      if (ns < 2) ns = 0;
      it.vx *= ns / sp; it.vy *= ns / sp;
    }
    it.x += it.vx * dt; it.y += it.vy * dt;
    if (it.x - it.r < 0)   { it.x = it.r;      it.vx = Math.abs(it.vx) * REST_WALL; }
    if (it.x + it.r > TW)  { it.x = TW - it.r; it.vx = -Math.abs(it.vx) * REST_WALL; }
    if (it.y - it.r < 0)   { it.y = it.r;      it.vy = Math.abs(it.vy) * REST_WALL; }
    if (it.y + it.r > TL)  { it.y = TL - it.r; it.vy = -Math.abs(it.vy) * REST_WALL; }
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
      const nx = dx / d, ny = dy / d;
      const ma = a.r * a.r, mb = b.r * b.r;
      const ov = minD - d;
      a.x -= nx * ov * mb / (ma + mb); a.y -= ny * ov * mb / (ma + mb);
      b.x += nx * ov * ma / (ma + mb); b.y += ny * ov * ma / (ma + mb);
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
  const pts = mergePoints(lv);
  score += pts;
  burst(x, y, LEVELS[lv - 1].liq[0], 16);
  if (lv >= MAX_LV) {
    floaters.push({ x, y, text: '+' + pts + ' MEGA!', t: 0, big: true });
    burst(x, y, '#ffd54f', 40);
  } else {
    const n = makeItem(lv + 1, x, y, (a.vx + b.vx) * 0.3, (a.vy + b.vy) * 0.3);
    n.pop = 1;
    n.x = Math.max(n.r, Math.min(TW - n.r, n.x));
    n.y = Math.max(n.r, Math.min(TL - n.r, n.y));
    items.push(n);
    if (shotItem === a || shotItem === b) shotItem = n;
    maxReached = Math.max(maxReached, lv + 1);
    floaters.push({ x, y, text: '+' + pts, t: 0 });
    for (let k = 0; k < orders.length; k++) {
      if (orders[k].lv === lv + 1) {
        score += orders[k].reward;
        floaters.push({ x, y, text: 'Zamówienie! +' + orders[k].reward, t: -0.25, big: true });
        orders[k] = newOrder();
        break;
      }
    }
  }
  if (score > best) best = score;
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 160;
    particles.push({ x, y, z: 30, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 150 + Math.random() * 200,
      t: 0, life: 0.5 + Math.random() * 0.4, color, size: 2 + Math.random() * 3 });
  }
}

let settledFor = 0;
function checkGameOver(dt) {
  if (gameOver) return;
  if (!items.every(i => Math.hypot(i.vx, i.vy) < 6) || time - lastShot < 0.8) { settledFor = 0; return; }
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

// ---------- rysowanie naczyń 3D ----------
const emojiFont = '"Noto Color Emoji","Apple Color Emoji","Segoe UI Emoji",sans-serif';

// ścieżka bryły obrotowej; ox,oy = środek podstawy na ekranie, sx/sy = px na r, f = spłaszczenie elips
function lathePath(p, ox, oy, sx, sy, f) {
  const Y = h => oy - h * sy, n = p.length, b = p[0], t = p[n - 1];
  ctx.beginPath();
  ctx.ellipse(ox, Y(b[0]), b[1] * sx, b[1] * sx * f, 0, Math.PI, 0, true);
  for (let i = 1; i < n; i++) ctx.lineTo(ox + p[i][1] * sx, Y(p[i][0]));
  ctx.ellipse(ox, Y(t[0]), t[1] * sx, t[1] * sx * f, 0, 0, Math.PI, true);
  for (let i = n - 2; i >= 0; i--) ctx.lineTo(ox - p[i][1] * sx, Y(p[i][0]));
  ctx.closePath();
}
function cutProfile(p, h, inset) {
  const out = [];
  for (let i = 0; i < p.length; i++) {
    if (p[i][0] <= h) out.push([p[i][0] + (i === 0 ? .06 : 0), p[i][1] * inset]);
    else {
      const a = p[i - 1], b = p[i], t = (h - a[0]) / (b[0] - a[0]);
      out.push([h, (a[1] + (b[1] - a[1]) * t) * inset]);
      break;
    }
  }
  return out;
}
function widthAt(p, h) {
  for (let i = 1; i < p.length; i++) if (p[i][0] >= h) {
    const a = p[i - 1], b = p[i], t = (h - a[0]) / (b[0] - a[0]);
    return a[1] + (b[1] - a[1]) * t;
  }
  return p[p.length - 1][1];
}

function drawVessel(lv, ox, oy, sx, sy, f, alpha = 1) {
  const L = LEVELS[lv - 1], sh = SHAPES[L.shape];
  const Y = h => oy - h * sy;
  const p = sh.body, top = p[p.length - 1];
  ctx.globalAlpha = alpha;

  // stopka i nóżka
  if (sh.foot) {
    ctx.fillStyle = 'rgba(225,245,255,0.9)';
    ctx.beginPath(); ctx.ellipse(ox, oy, sh.foot * sx, sh.foot * sx * f, 0, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(120,160,190,0.6)'; ctx.lineWidth = 1; ctx.stroke();
    ctx.fillStyle = 'rgba(210,235,250,0.95)';
    ctx.fillRect(ox - .08 * sx, Y(sh.stem), .16 * sx, sh.stem * sy);
  }

  // ucho dzbanka (z tyłu/z boku)
  if (sh.handle) {
    ctx.strokeStyle = 'rgba(215,240,255,0.95)'; ctx.lineWidth = .16 * sx; ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ox + .78 * sx, Y(1.3));
    ctx.bezierCurveTo(ox + 1.35 * sx, Y(1.3), ox + 1.35 * sx, Y(.35), ox + .8 * sx, Y(.35));
    ctx.stroke();
  }

  // szkło (tło)
  lathePath(p, ox, oy, sx, sy, f);
  ctx.fillStyle = 'rgba(235,248,255,0.45)'; ctx.fill();

  // płyn
  const lp = cutProfile(p, sh.fill, .9);
  const g = ctx.createLinearGradient(0, Y(sh.fill), 0, Y(p[0][0]));
  L.liq.forEach((c, i) => g.addColorStop(i / (L.liq.length - 1), c));
  lathePath(lp, ox, oy, sx, sy, f);
  ctx.fillStyle = g; ctx.fill();
  // cieniowanie boczne płynu
  const sg = ctx.createLinearGradient(ox - top[1] * sx, 0, ox + top[1] * sx, 0);
  sg.addColorStop(0, 'rgba(255,255,255,0.28)'); sg.addColorStop(.35, 'rgba(255,255,255,0)');
  sg.addColorStop(.75, 'rgba(0,0,0,0)'); sg.addColorStop(1, 'rgba(0,0,0,0.25)');
  ctx.fillStyle = sg; ctx.fill();
  // powierzchnia płynu
  const fw = widthAt(p, sh.fill) * .9;
  ctx.fillStyle = L.liq[0];
  ctx.beginPath(); ctx.ellipse(ox, Y(sh.fill), fw * sx, fw * sx * f, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.beginPath(); ctx.ellipse(ox - fw * sx * .2, Y(sh.fill) - fw * sx * f * .15, fw * sx * .55, fw * sx * f * .45, 0, 0, Math.PI * 2); ctx.fill();

  // słomka
  if (L.straw) {
    ctx.strokeStyle = L.straw; ctx.lineWidth = .13 * sx; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(ox + .1 * sx, Y(sh.fill)); ctx.lineTo(ox + .55 * sx, Y(top[0] + .75)); ctx.stroke();
  }

  // obrys i połysk szkła
  lathePath(p, ox, oy, sx, sy, f);
  ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = Math.max(1.2, .07 * sx); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = Math.max(1.5, .1 * sx); ctx.lineCap = 'round';
  ctx.beginPath();
  const hh0 = p[0][0] + (top[0] - p[0][0]) * .2, hh1 = p[0][0] + (top[0] - p[0][0]) * .8;
  ctx.moveTo(ox - widthAt(p, hh0) * sx * .7, Y(hh0)); ctx.lineTo(ox - widthAt(p, hh1) * sx * .7, Y(hh1));
  ctx.stroke();
  // brzeg
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = Math.max(1.2, .07 * sx);
  ctx.beginPath(); ctx.ellipse(ox, Y(top[0]), top[1] * sx, top[1] * sx * f, 0, 0, Math.PI * 2); ctx.stroke();

  // pokrywka słoja + kranik
  if (sh.lid) {
    const lh = top[0];
    const lg = ctx.createLinearGradient(ox - .6 * sx, 0, ox + .6 * sx, 0);
    lg.addColorStop(0, '#e3f2fd'); lg.addColorStop(1, '#90caf9');
    ctx.fillStyle = lg;
    ctx.beginPath();
    ctx.ellipse(ox, Y(lh), .62 * sx, .62 * sx * f, 0, 0, Math.PI, false);
    ctx.ellipse(ox, Y(lh), .62 * sx, .62 * sx * f * .9 + .1 * sy, 0, Math.PI, 0, false);
    ctx.fill();
    ctx.beginPath(); ctx.arc(ox, Y(lh) - .62 * sx * f * .9 - .1 * sy, .12 * sx, 0, Math.PI * 2); ctx.fill();
  }
  if (sh.tap) {
    ctx.fillStyle = '#ffb300';
    ctx.fillRect(ox + .9 * sx, Y(.5), .3 * sx, .16 * sy);
    ctx.fillRect(ox + 1.08 * sx, Y(.5), .12 * sx, .3 * sy);
  }

  // parasolka
  if (L.umbrella) {
    const ux = ox + .5 * sx, uy = Y(top[0] + .7);
    ctx.strokeStyle = '#8d6e63'; ctx.lineWidth = .05 * sx;
    ctx.beginPath(); ctx.moveTo(ox + .15 * sx, Y(sh.fill)); ctx.lineTo(ux, uy); ctx.stroke();
    ctx.fillStyle = '#ef5350';
    ctx.beginPath(); ctx.moveTo(ux - .45 * sx, uy + .12 * sy); ctx.quadraticCurveTo(ux, uy - .45 * sy, ux + .45 * sx, uy + .12 * sy); ctx.fill();
    ctx.fillStyle = '#ffeb3b';
    ctx.beginPath(); ctx.moveTo(ux - .15 * sx, uy + .05 * sy); ctx.quadraticCurveTo(ux, uy - .35 * sy, ux + .15 * sx, uy + .05 * sy); ctx.fill();
  }

  // dodatek (owoc) na brzegu
  if (L.emoji) {
    const es = Math.max(8, .78 * sx);
    ctx.font = `${Math.round(es)}px ${emojiFont}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(L.emoji, ox - top[1] * sx * .55, Y(top[0]) - es * .15);
  }

  // numer poziomu
  const nh = p[0][0] + (sh.fill - p[0][0]) * .45;
  const fs = Math.round(Math.max(9, .48 * sx));
  ctx.font = `bold ${fs}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 3; ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.strokeText(lv, ox + widthAt(p, nh) * sx * .3, Y(nh));
  ctx.fillStyle = '#fff'; ctx.fillText(lv, ox + widthAt(p, nh) * sx * .3, Y(nh));
  ctx.globalAlpha = 1;
}

// obiekt stojący na stole w pozycji fizyki
function drawItem(lv, px, py, rScale = 1, alpha = 1) {
  const r = radius(lv) * rScale;
  const b = proj(px, py);
  const up = proj(px, py, r);
  const near = proj(px, py + r), far = proj(px, py - r);
  const sx = r * b.k;   // px na jednostkę r (poziomo)
  const f = Math.max(.2, ((near.y - far.y) / 2) / sx);
  // cień
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(70,50,30,0.16)';
  ctx.beginPath(); ctx.ellipse(b.x + sx * .1, b.y + sx * f * .08, sx * .9, sx * f * .9, 0, 0, Math.PI * 2); ctx.fill();
  drawVessel(lv, b.x, b.y, sx, (b.y - up.y), f, alpha);
}

// ikona w HUD
function drawIcon(lv, cx, cy, size, alpha = 1) {
  const hgt = shapeHeight(lv) + .6;
  const sx = Math.min(size / 2.2, size / hgt);
  drawVessel(lv, cx, cy + hgt * sx * .5 - .3 * sx, sx, sx, .32, alpha);
}

// ---------- scena ----------
function quad(pts) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function drawScene() {
  // niebo, morze, piasek
  const far = proj(0, -FRAME);
  const horizon = Math.max(60, far.y - 70);
  let g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, '#4fc3f7'); g.addColorStop(1, '#b3e5fc');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon);
  g = ctx.createLinearGradient(0, horizon, 0, horizon + 50);
  g.addColorStop(0, '#0288d1'); g.addColorStop(1, '#4dd0e1');
  ctx.fillStyle = g; ctx.fillRect(0, horizon, W, 50);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.fillRect(0, horizon + 46, W, 4);
  g = ctx.createLinearGradient(0, horizon + 50, 0, H);
  g.addColorStop(0, '#ffe7b3'); g.addColorStop(1, '#f0c37a');
  ctx.fillStyle = g; ctx.fillRect(0, horizon + 50, W, H);
  // strzecha
  ctx.fillStyle = '#c79a52'; ctx.fillRect(0, 0, W, 18);
  ctx.fillStyle = '#a97b3a';
  for (let x = 0; x < W; x += 14) { ctx.beginPath(); ctx.moveTo(x, 18); ctx.lineTo(x + 7, 32); ctx.lineTo(x + 14, 18); ctx.fill(); }

  const M = FRAME;
  const c = (x, y, z = 0) => proj(x, y, z);
  // przednia ścianka ramy (grubość)
  ctx.fillStyle = '#8d5a2b';
  quad([c(-M, TL + M), c(TW + M, TL + M), c(TW + M, TL + M, -26), c(-M, TL + M, -26)]); ctx.fill();
  // nogi
  ctx.fillStyle = '#7a4c22';
  for (const lx of [-M + 8, TW + M - 22]) {
    quad([c(lx, TL + M, -26), c(lx + 14, TL + M, -26), c(lx + 14, TL + M, -110), c(lx, TL + M, -110)]); ctx.fill();
  }
  // rama
  g = ctx.createLinearGradient(0, c(0, -M).y, 0, c(0, TL + M).y);
  g.addColorStop(0, '#c08a52'); g.addColorStop(1, '#a06b36');
  ctx.fillStyle = g;
  quad([c(-M, -M), c(TW + M, -M), c(TW + M, TL + M), c(-M, TL + M)]); ctx.fill();
  ctx.fillStyle = '#ddb07a';
  quad([c(-M + 5, -M + 5), c(TW + M - 5, -M + 5), c(TW + M - 5, TL + M - 5), c(-M + 5, TL + M - 5)]); ctx.fill();
  // wewnętrzna krawędź (głębia)
  ctx.fillStyle = '#9c6a38';
  quad([c(-3, -3), c(TW + 3, -3), c(TW + 3, TL + 3), c(-3, TL + 3)]); ctx.fill();
  // szklany blat
  g = ctx.createLinearGradient(0, c(0, 0).y, 0, c(0, TL).y);
  g.addColorStop(0, '#d9efe8'); g.addColorStop(1, '#eef9f5');
  ctx.fillStyle = g;
  quad([c(0, 0), c(TW, 0), c(TW, TL), c(0, TL)]); ctx.fill();
  // odblask szkła
  ctx.fillStyle = 'rgba(255,255,255,0.25)';
  quad([c(TW * .55, 0), c(TW * .75, 0), c(TW * .35, TL), c(TW * .15, TL)]); ctx.fill();
  // dekoracje (płasko na stole)
  ctx.globalAlpha = 0.28;
  for (const [x, y, e] of [[70, TL - 60, '⭐'], [TW - 70, TL - 45, '🐚'], [TW - 80, TL * .55, '🐚'], [60, TL * .35, '⭐']]) {
    const p = c(x, y), q = c(x, y + 10);
    const fl = Math.max(.25, (q.y - p.y) / (10 * p.k));
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, fl);
    ctx.font = `${Math.round(34 * p.k)}px ${emojiFont}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(e, 0, 0); ctx.restore();
  }
  ctx.globalAlpha = 1;
  // linia graniczna
  const l0 = c(4, T.line), l1 = c(TW - 4, T.line);
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3.5; ctx.setLineDash([14, 10]);
  ctx.beginPath(); ctx.moveTo(l0.x, l0.y); ctx.lineTo(l1.x, l1.y); ctx.stroke();
  ctx.setLineDash([]);
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}

function drawHUD() {
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  roundRect(12, 30, 150, 40, 20); ctx.fill();
  ctx.fillStyle = '#ffc107'; ctx.beginPath(); ctx.arc(32, 50, 15, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#ff8f00'; ctx.font = 'bold 16px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('★', 32, 51);
  ctx.fillStyle = '#4e342e'; ctx.font = 'bold 24px sans-serif'; ctx.textAlign = 'left';
  ctx.fillText(score, 54, 51);
  ctx.font = 'bold 13px sans-serif'; ctx.fillStyle = '#fff';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3;
  ctx.strokeText('Rekord: ' + best, 18, 86); ctx.fillText('Rekord: ' + best, 18, 86);

  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  roundRect(W - 86, 28, 72, 72, 14); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#8bc34a'; ctx.stroke();
  drawIcon(next, W - 50, 64, 50);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 13px sans-serif'; ctx.textAlign = 'center';
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 3;
  ctx.strokeText('Następny', W - 50, 114); ctx.fillText('Następny', W - 50, 114);

  const oy = 34, ow = 64, oh = 100;
  orders.forEach((o, k) => {
    const ox = 168 + k * (ow + 6);
    ctx.save();
    ctx.translate(ox + ow / 2, oy); ctx.rotate(k ? 0.04 : -0.03);
    ctx.fillStyle = '#fffdf5'; ctx.shadowColor = 'rgba(0,0,0,0.25)'; ctx.shadowBlur = 6;
    ctx.fillRect(-ow / 2, 0, ow, oh); ctx.shadowBlur = 0;
    ctx.fillStyle = '#c62828'; ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('Zamówienie', 0, 12);
    ctx.restore();
    drawIcon(o.lv, ox + ow / 2, oy + 50, 46);
    ctx.fillStyle = '#4e342e'; ctx.font = 'bold 12px sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('★ ' + o.reward, ox + ow / 2, oy + oh - 10);
  });
}

function drawEvolution() {
  const y = H - 44, x0 = 30, x1 = W - 30;
  ctx.fillStyle = 'rgba(255,255,255,0.93)';
  roundRect(x0 - 10, y - 28, x1 - x0 + 20, 56, 28); ctx.fill();
  ctx.lineWidth = 3; ctx.strokeStyle = '#8bc34a'; ctx.stroke();
  const st = (x1 - x0 - 20) / (MAX_LV - 1);
  for (let i = 0; i < MAX_LV; i++)
    drawIcon(i + 1, x0 + 10 + i * st, y, 34, i + 1 <= maxReached ? 1 : 0.35);
}

function aimEnd(x, r) {
  let end = 0;
  for (const it of items) {
    const dx = Math.abs(it.x - x);
    if (dx < it.r + r && it.y < T.launchY) {
      const yy = it.y + Math.sqrt(Math.max(0, (it.r + r) ** 2 - dx * dx)) - r;
      if (yy > end) end = yy;
    }
  }
  return end;
}

function drawAim() {
  if (gameOver) return;
  const r = radius(current), x = clampAim(aimX);
  const a = proj(x, T.launchY - r), b = proj(x, Math.max(0, aimEnd(x, r)));
  ctx.strokeStyle = 'rgba(255,255,255,0.95)'; ctx.lineWidth = 3.5;
  ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
  // znacznik trafienia
  ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2;
  const e = proj(x, Math.max(0, aimEnd(x, r))), e2 = proj(x, Math.max(0, aimEnd(x, r)) + r);
  ctx.beginPath(); ctx.ellipse(e.x, e.y, r * e.k, Math.max(2, e2.y - e.y), 0, 0, Math.PI * 2); ctx.stroke();
}

function render(dt) {
  ctx.setTransform(S, 0, 0, S, 0, 0);
  drawScene();
  drawAim();
  // obiekty od najdalszych do najbliższych (malarski algorytm)
  const list = items.map(it => ({ lv: it.lv, x: it.x, y: it.y, it }));
  if (!gameOver) list.push({ lv: current, x: clampAim(aimX), y: T.launchY, launcher: true });
  list.sort((a, b) => a.y - b.y);
  for (const o of list) {
    let s = 1;
    if (o.it && o.it.pop > 0) { s = 1 + 0.25 * Math.sin(o.it.pop * Math.PI); o.it.pop = Math.max(0, o.it.pop - dt * 3); }
    drawItem(o.lv, o.x, o.y, s, o.launcher && !canShoot() ? 0.5 : 1);
  }
  for (const p of particles) {
    const q = proj(p.x, p.y, p.z);
    ctx.globalAlpha = Math.max(0, 1 - p.t / p.life);
    ctx.fillStyle = p.color;
    ctx.beginPath(); ctx.arc(q.x, q.y, p.size * q.k * 1.6, 0, Math.PI * 2); ctx.fill();
  }
  ctx.globalAlpha = 1;
  for (const f of floaters) {
    if (f.t < 0) continue;
    const q = proj(f.x, f.y, 90);
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.1);
    ctx.font = `bold ${f.big ? 22 : 20}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#5d4037';
    ctx.strokeText(f.text, q.x, q.y - f.t * 50);
    ctx.fillStyle = f.big ? '#ffd54f' : '#fff';
    ctx.fillText(f.text, q.x, q.y - f.t * 50);
  }
  ctx.globalAlpha = 1;
  drawHUD();
  drawEvolution();
}

// ---------- pętla ----------
let last = performance.now(), saveTimer = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now; time += dt;
  for (let i = 0; i < 4; i++) step(dt / 4);
  for (const p of particles) {
    p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.z = Math.max(0, p.z + p.vz * dt); p.vz -= 900 * dt;
    p.vx *= 0.95; p.vy *= 0.95;
  }
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
