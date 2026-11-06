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
const TW = 360, TL = 600;               // stół w jednostkach fizyki
const T = { left: 0, right: TW, top: 0, bottom: TL, line: TL - 140, launchY: TL - 70 };
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
  PSY = Math.min(PSX * 1.12, (yBot - yTop) / (nl[1] - fl[1]));
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
// power-upy
const POWERS = {
  bolt:    { icon: '⚡', name: 'Piorun',    kind: 'orb',     c: ['#fff59d', '#29b6f6'], hint: 'Strzel w napój — połączy wszystkie takie same' },
  bomb:    { icon: '💣', name: 'Bomba',     kind: 'orb',     c: ['#ffe0b2', '#e64a19'], hint: 'Strzel — wybuch rozrzuci napoje' },
  rainbow: { icon: '🌈', name: 'Joker',     kind: 'orb',     c: ['#ffffff', '#ab47bc'], hint: 'Strzel — połączy się z pierwszym trafionym' },
  up:      { icon: '⏫', name: 'Ulepszacz', kind: 'orb',     c: ['#e8f5e9', '#43a047'], hint: 'Strzel — trafiony napój +2 poziomy' },
  magnet:  { icon: '🧲', name: 'Magnes',    kind: 'orb',     c: ['#ffebee', '#e53935'], hint: 'Strzel — przyciągnie takie same napoje' },
  ice:     { icon: '🧊', name: 'Lód',       kind: 'shot',    c: ['#e1f5fe', '#4fc3f7'], hint: 'Następny strzał ślizga się jak bila' },
  swap:    { icon: '🔄', name: 'Zamiana',   kind: 'instant', c: ['#f3e5f5', '#7e57c2'] },
  wave:    { icon: '🌊', name: 'Fala',      kind: 'instant', c: ['#e0f7fa', '#0288d1'] },
};
const POWER_KEYS = Object.keys(POWERS);
const MAX_POWER = 3;
const slotPos = i => ({ x: 40, y: 128 + i * 54, r: 22 });
let power = [], armed = -1, orb = null, magnet = null, shotMerges = 0, powerGranted = false;
let bolts = [], rings = [], flash = 0, flashColor = '225,245,254', waveFx = 0;

try { best = +localStorage.getItem('go_best') || 0; } catch (e) {}

function rndSpawn() {
  const maxSpawn = Math.min(5, Math.max(3, maxReached - 2));
  const w = [40, 30, 18, 8, 4].slice(0, maxSpawn);
  let r = Math.random() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) { r -= w[i]; if (r <= 0) return i + 1; }
  return 1;
}

function newOrder(skip = -1) {
  const lo = Math.min(MAX_LV, Math.max(4, maxReached - 1));
  const hi = Math.min(MAX_LV, Math.max(5, maxReached + 1));
  const taken = orders.filter((o, i) => i !== skip).map(o => o.lv);
  let pool = [];
  for (let l = lo; l <= hi; l++) if (!taken.includes(l)) pool.push(l);
  if (!pool.length) for (let l = 4; l <= MAX_LV; l++) if (!taken.includes(l)) pool.push(l);
  const lv = pool[Math.floor(Math.random() * pool.length)] || lo;
  return { lv, reward: mergePoints(lv) * 5 };
}

function makeItem(lv, x, y, vx = 0, vy = 0) {
  return { id: nextId++, lv, r: radius(lv), x, y, vx, vy, pop: 0, dead: false };
}

function reset() {
  items = []; particles = []; floaters = [];
  power = []; armed = -1; orb = null; magnet = null; bolts = []; rings = []; waveFx = 0;
  settledFor = 0;
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
      score, current, next, orders, maxReached, power,
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
    power = Array.isArray(s.power) ? s.power.filter(k => POWERS[k]).slice(0, MAX_POWER)
      : Array(Math.min(MAX_POWER, s.powerups || 0)).fill('bolt');
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
  const rc = cv.getBoundingClientRect();
  const sx = (e.clientX - rc.left) / rc.width * W, sy = (e.clientY - rc.top) / rc.height * H;
  for (let i = 0; i < MAX_POWER; i++) {
    const b = slotPos(i);
    if (Math.hypot(sx - b.x, sy - b.y) < b.r + 6) { tapPower(i); return; }
  }
  aiming = true; aimX = clampAim(screenToTableX(e));
});
cv.addEventListener('pointermove', e => { if (aiming) aimX = clampAim(screenToTableX(e)); });
cv.addEventListener('pointerup', () => { if (!aiming) return; aiming = false; shoot(); });
cv.addEventListener('pointercancel', () => { aiming = false; });
document.getElementById('again').addEventListener('click', reset);

function canShoot() {
  if (gameOver) return false;
  if (time - lastShot < 0.35) return false;
  if (orb) return false;
  if (shotItem && !shotItem.dead && shotItem.y > T.line - shotItem.r &&
      Math.hypot(shotItem.vx, shotItem.vy) > 20) return false;
  return true;
}

function shoot() {
  if (!canShoot()) return;
  shotMerges = 0; powerGranted = false;
  let ice = false;
  if (armed >= 0 && power[armed]) {
    const type = power.splice(armed, 1)[0];
    armed = -1;
    if (POWERS[type].kind === 'orb') {
      orb = { type, x: clampAim(aimX), y: T.launchY, vx: 0, vy: -1120, r: 20 };
      lastShot = time; shotItem = null;
      return;
    }
    ice = type === 'ice';
  }
  armed = -1;
  const it = makeItem(current, clampAim(aimX), T.launchY, 0, ice ? -1500 : -1120);
  if (ice) it.ice = 3;
  items.push(it);
  shotItem = it;
  lastShot = time;
  current = next; next = rndSpawn();
  aimX = clampAim(aimX);
}

// ---------- fizyka ----------
const REST_WALL = 0.55, REST_BALL = 0.35;
const FRICTION_CONST = 260, FRICTION_MUL = 0.9;
const GRAVITY = 360;   // przyciąganie w stronę dalekiego końca stołu (północ)
const bounce = (v, o) => {
  const e = o && o.ice > 0 ? 0.95 : REST_WALL;
  return Math.abs(v) > 40 ? Math.abs(v) * e : 0;
};

function movePhys(o, dt) {
  if (o.ice > 0) {
    o.ice -= dt;                          // lód: bez tarcia i grawitacji
  } else {
    o.vy -= GRAVITY * dt;
    const sp = Math.hypot(o.vx, o.vy);
    if (sp > 0) {
      let ns = sp - (FRICTION_CONST + FRICTION_MUL * sp) * dt;
      if (ns < 0) ns = 0;
      o.vx *= ns / sp; o.vy *= ns / sp;
    }
  }
  o.x += o.vx * dt; o.y += o.vy * dt;
  if (o.x - o.r < 0)  { o.x = o.r;      o.vx = bounce(o.vx, o); }
  if (o.x + o.r > TW) { o.x = TW - o.r; o.vx = -bounce(o.vx, o); }
}

function clampY(it) {
  if (it.y - it.r < 0)  { it.y = it.r;      if (it.vy < 0) it.vy = bounce(it.vy, it); }
  if (it.y + it.r > TL) { it.y = TL - it.r; if (it.vy > 0) it.vy = -bounce(it.vy, it); }
}
function clampAll(it) {
  if (it.x - it.r < 0)  { it.x = it.r;      if (it.vx < 0) it.vx = 0; }
  if (it.x + it.r > TW) { it.x = TW - it.r; if (it.vx > 0) it.vx = 0; }
  clampY(it);
}

function step(dt) {
  for (const it of items) {
    it.px = it.x; it.py = it.y;
    movePhys(it, dt);
    clampY(it);
  }
  if (magnet) {
    for (const it of items) {
      if (it.lv !== magnet.lv) continue;
      const dx = magnet.x - it.x, dy = magnet.y - it.y, d = Math.hypot(dx, dy);
      if (d > 1) { it.vx += dx / d * 1700 * dt; it.vy += dy / d * 1700 * dt; }
    }
  }
  if (orb) stepOrb(dt);

  const merges = [];
  for (let i = 0; i < items.length; i++) {
    const a = items[i];
    if (a.dead) continue;
    for (let j = i + 1; j < items.length; j++) {
      const b = items[j];
      if (b.dead) continue;
      const dx = b.x - a.x, dy = b.y - a.y;
      let d = Math.hypot(dx, dy);
      const minD = a.r + b.r;
      if (d >= minD) continue;
      if (d < 1e-6) { b.x += Math.random() - .5; b.y += .5; continue; }
      if (a.lv === b.lv) { merges.push([a, b]); a.dead = b.dead = true; break; }
      const nx = dx / d, ny = dy / d;
      const ma = a.r * a.r, mb = b.r * b.r;
      const ov = minD - d;
      a.x -= nx * ov * mb / (ma + mb); a.y -= ny * ov * mb / (ma + mb);
      b.x += nx * ov * ma / (ma + mb); b.y += ny * ov * ma / (ma + mb);
      const rv = (b.vx - a.vx) * nx + (b.vy - a.vy) * ny;
      if (rv < 0) {
        const jimp = -(1 + (rv < -40 ? REST_BALL : 0)) * rv / (1 / ma + 1 / mb);
        a.vx -= jimp * nx / ma; a.vy -= jimp * ny / ma;
        b.vx += jimp * nx / mb; b.vy += jimp * ny / mb;
      }
    }
  }
  for (const [a, b] of merges) doMerge(a, b);
  if (merges.length) items = items.filter(i => !i.dead);
  // napoje zablokowane w stosie mają prędkość = faktyczny ruch (inaczej grawitacja "pompuje" prędkość
  // i gra nigdy nie uznaje, że wszystko stoi — blokowało to strzały i koniec gry)
  for (const it of items) {
    clampAll(it);
    if (it.px === undefined) continue;
    const vx = (it.x - it.px) / dt, vy = (it.y - it.py) / dt;
    const v = Math.hypot(it.vx, it.vy);
    if (v < 120 && Math.hypot(vx, vy) < v * 0.6) { it.vx = vx; it.vy = vy; }
  }
}

function doMerge(a, b) {
  const lv = a.lv;
  const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
  const pts = mergePoints(lv);
  score += pts;
  burst(x, y, LEVELS[lv - 1].liq[0], 16);
  shotMerges++;
  if (shotMerges >= 2) floaters.push({ x, y, text: 'Combo x' + shotMerges, t: -0.15, big: true, dy: 26 });
  if (shotMerges > 3 && !powerGranted) { powerGranted = true; grantPower(); }
  if (lv >= MAX_LV) {
    floaters.push({ x, y, text: '+' + pts + ' MEGA!', t: 0, big: true });
    burst(x, y, '#ffd54f', 40);
  } else {
    // nowy obiekt zachowuje prędkość szybszego z pary (kierunek wypadkowy) i leci dalej
    const sa = Math.hypot(a.vx, a.vy), sb = Math.hypot(b.vx, b.vy), sp = Math.max(sa, sb);
    let dvx = a.vx + b.vx, dvy = a.vy + b.vy, dl = Math.hypot(dvx, dvy);
    if (dl < 1e-6) { const f = sa >= sb ? a : b; dvx = f.vx; dvy = f.vy; dl = Math.max(1e-6, Math.hypot(dvx, dvy)); }
    const n = makeItem(lv + 1, x, y, dvx / dl * sp, dvy / dl * sp);
    n.pop = 1;
    n.x = Math.max(n.r, Math.min(TW - n.r, n.x));
    n.y = Math.max(n.r, Math.min(TL - n.r, n.y));
    items.push(n);
    if (shotItem === a || shotItem === b) shotItem = n;
    maxReached = Math.max(maxReached, lv + 1);
    floaters.push({ x, y, text: '+' + pts, t: 0 });
    checkOrders(lv + 1, x, y);
  }
  if (score > best) best = score;
}

function checkOrders(lv, x, y) {
  for (let k = 0; k < orders.length; k++) {
    if (orders[k].lv === lv) {
      score += orders[k].reward;
      floaters.push({ x, y, text: 'Zamówienie! +' + orders[k].reward, t: -0.25, big: true });
      orders[k] = newOrder(k);
      if (Math.random() < 0.3) grantPower();
      break;
    }
  }
}

// ---------- power-upy ----------
function grantPower() {
  if (power.length >= MAX_POWER) {
    score += 100;
    floaters.push({ x: TW / 2, y: TL * .45, text: 'Pełne power-upy: +100', t: -0.3, big: true });
    return;
  }
  const type = POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)];
  power.push(type);
  floaters.push({ x: TW / 2, y: TL * .45, text: POWERS[type].icon + ' ' + POWERS[type].name + '!', t: -0.3, big: true, huge: true });
}

function tapPower(i) {
  const type = power[i];
  if (!type || gameOver) return;
  const P = POWERS[type];
  if (P.kind !== 'instant') { armed = armed === i ? -1 : i; return; }
  if (orb) return;
  power.splice(i, 1);
  if (armed === i) armed = -1; else if (armed > i) armed--;
  if (type === 'swap') {
    [current, next] = [next, current];
    aimX = clampAim(aimX);
    floaters.push({ x: TW / 2, y: T.launchY - 60, text: '🔄 Zamiana!', t: 0, big: true });
  } else if (type === 'wave') {
    for (const it of items) { it.vy -= 620 + Math.random() * 120; it.vx += (Math.random() - .5) * 120; }
    waveFx = 1;
    floaters.push({ x: TW / 2, y: T.line - 40, text: '🌊 Fala!', t: 0, big: true });
  }
}

function refundOrb() {
  if (power.length < MAX_POWER) power.unshift(orb.type);
  floaters.push({ x: orb.x, y: Math.max(40, orb.y), text: 'Pudło — ' + POWERS[orb.type].icon + ' wraca', t: 0 });
  orb = null;
}

function stepOrb(dt) {
  movePhys(orb, dt);
  for (const it of items) {
    if (it.dead) continue;
    if (Math.hypot(it.x - orb.x, it.y - orb.y) < it.r + orb.r) {
      const o = orb; orb = null;
      hitPower(o, it);
      return;
    }
  }
  if (orb.y - orb.r < 0) {
    if (orb.type === 'bomb') { const o = orb; orb = null; explode(o.x, o.r); }
    else refundOrb();
  } else if (Math.hypot(orb.vx, orb.vy) < 15) refundOrb();
}

function hitPower(o, it) {
  if (o.type === 'bolt') lightning(it);
  else if (o.type === 'bomb') explode(o.x, o.y);
  else if (o.type === 'rainbow') {
    it.dead = true;
    doMerge(it, { lv: it.lv, x: it.x, y: it.y, vx: o.vx * .7, vy: o.vy * .7 });
    items = items.filter(i => !i.dead);
    burst(it.x, it.y, '#ce93d8', 14); burst(it.x, it.y, '#80deea', 10);
  } else if (o.type === 'up') {
    const lv = Math.min(MAX_LV, it.lv + 2);
    const pts = mergePoints(it.lv) * 2;
    score += pts;
    it.dead = true; items = items.filter(i => !i.dead);
    const n = makeItem(lv, it.x, it.y, o.vx * .2, o.vy * .2);
    clampAll(n); n.pop = 1; items.push(n);
    maxReached = Math.max(maxReached, lv);
    burst(n.x, n.y, '#a5d6a7', 20);
    floaters.push({ x: n.x, y: n.y, text: '⏫ +' + pts, t: 0, big: true });
    checkOrders(lv, n.x, n.y);
  } else if (o.type === 'magnet') {
    magnet = { lv: it.lv, x: it.x, y: it.y, t: 2.5 };
    floaters.push({ x: it.x, y: it.y, text: '🧲 Magnes!', t: 0, big: true });
  }
  if (score > best) best = score;
}

function explode(x, y) {
  const R = 150;
  for (const it of items) {
    let dx = it.x - x, dy = it.y - y, d = Math.hypot(dx, dy);
    if (d > R + it.r) continue;
    if (d < 1) { dx = Math.random() - .5; dy = -1; d = Math.hypot(dx, dy); }
    const f = 280 + 900 * (1 - d / (R + it.r));
    it.vx += dx / d * f; it.vy += dy / d * f;
    it.ice = 0;
  }
  rings.push({ x, y, t: 0, R });
  burst(x, y, '#ff7043', 30); burst(x, y, '#ffd54f', 24); burst(x, y, '#5d4037', 10);
  flash = 1; flashColor = '255,204,128';
  floaters.push({ x, y, text: '💥 BUM!', t: 0, big: true, huge: true });
}

function lightning(hit) {
  const lv = hit.lv;
  const group = items.filter(i => i.lv === lv);
  const far = group.reduce((a, b) => (b.y < a.y ? b : a));
  const pts = group.length * Math.pow(2, lv - 1);
  score += pts;
  bolts.push({ src: { x: hit.x, y: hit.y, z: hit.r }, pts: group.map(g => ({ x: g.x, y: g.y, z: g.r })),
    to: { x: far.x, y: far.y, z: far.r }, t: 0 });
  flash = 1; flashColor = '225,245,254';
  for (const g of group) { g.dead = true; burst(g.x, g.y, '#fff59d', 10); burst(g.x, g.y, '#4fc3f7', 6); }
  items = items.filter(i => !i.dead);
  if (lv >= MAX_LV) {
    floaters.push({ x: far.x, y: far.y, text: '⚡ +' + pts + ' MEGA!', t: 0, big: true });
  } else {
    const n = makeItem(lv + 1, far.x, far.y);
    n.x = Math.max(n.r, Math.min(TW - n.r, n.x));
    n.y = Math.max(n.r, Math.min(TL - n.r, n.y));
    n.pop = 1;
    items.push(n);
    maxReached = Math.max(maxReached, lv + 1);
    floaters.push({ x: far.x, y: far.y, text: '⚡ x' + group.length + '  +' + pts, t: 0, big: true });
    checkOrders(lv + 1, far.x, far.y);
  }
  if (score > best) best = score;
}

function zigzag(a, b, amp) {
  const n = 9;
  ctx.beginPath(); ctx.moveTo(a.x, a.y);
  for (let i = 1; i < n; i++) {
    const t = i / n, nx = -(b.y - a.y), ny = b.x - a.x, l = Math.hypot(nx, ny) || 1;
    const o = (Math.random() - .5) * amp;
    ctx.lineTo(a.x + (b.x - a.x) * t + nx / l * o, a.y + (b.y - a.y) * t + ny / l * o);
  }
  ctx.lineTo(b.x, b.y); ctx.stroke();
}

function drawBolts() {
  for (const bl of bolts) {
    const a = Math.max(0, 1 - bl.t / .7);
    const P = q => proj(q.x, q.y, q.z);
    const to = P(bl.to), src = P(bl.src);
    ctx.save(); ctx.globalAlpha = a; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    for (const pass of [[9, 'rgba(79,195,247,0.45)'], [3.5, '#e1f5fe'], [1.5, '#ffffff']]) {
      ctx.lineWidth = pass[0]; ctx.strokeStyle = pass[1];
      for (const q of bl.pts) {
        const pq = P(q);
        zigzag(src, pq, 18);
        zigzag(pq, to, 22);
      }
    }
    ctx.restore();
  }
}

function drawOrb(type, px, py, r, alpha = 1) {
  const P = POWERS[type];
  const b = proj(px, py), c = proj(px, py, r * 1.1);
  const rr = r * b.k;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(30,60,90,0.18)';
  ctx.beginPath(); ctx.ellipse(b.x, b.y, rr, rr * .45, 0, 0, Math.PI * 2); ctx.fill();
  const g = ctx.createRadialGradient(c.x - rr * .3, c.y - rr * .3, rr * .1, c.x, c.y, rr * 1.4);
  g.addColorStop(0, '#ffffff'); g.addColorStop(.35, P.c[0]); g.addColorStop(.7, P.c[1]); g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(c.x, c.y, rr * 1.4, 0, Math.PI * 2); ctx.fill();
  if (type === 'bolt') {
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5;
    for (let i = 0; i < 3; i++) {
      const a0 = time * 6 + i * 2.1;
      zigzag({ x: c.x, y: c.y }, { x: c.x + Math.cos(a0) * rr * 1.5, y: c.y + Math.sin(a0) * rr * 1.5 }, 6);
    }
  } else if (type === 'rainbow') {
    ['#ef5350', '#ffca28', '#66bb6a', '#42a5f5', '#ab47bc'].forEach((col, i) => {
      ctx.strokeStyle = col; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.arc(c.x, c.y, rr * (1.05 + i * .1), time * 3 + i, time * 3 + i + 2.2); ctx.stroke();
    });
  } else if (type === 'bomb') {
    const sp = 2 + Math.random() * 2;
    ctx.fillStyle = '#ffeb3b';
    ctx.beginPath(); ctx.arc(c.x + rr * .55, c.y - rr * .75, sp, 0, Math.PI * 2); ctx.fill();
  }
  ctx.font = `${Math.round(rr * 1.1)}px ${emojiFont}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(P.icon, c.x, c.y);
  ctx.globalAlpha = 1;
}

function drawFx() {
  // fale uderzeniowe bomby
  for (const rg of rings) {
    const k = rg.t / .5, R = rg.R * (.3 + k * .9);
    const c = proj(rg.x, rg.y), e = proj(rg.x, rg.y + R);
    ctx.strokeStyle = `rgba(255,152,0,${Math.max(0, 1 - k)})`; ctx.lineWidth = 6 * (1 - k) + 1;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, R * c.k, Math.max(2, e.y - c.y), 0, 0, Math.PI * 2); ctx.stroke();
  }
  // magnes
  if (magnet) {
    const c = proj(magnet.x, magnet.y, 10);
    const pulse = (time * 2) % 1;
    ctx.strokeStyle = `rgba(229,57,53,${1 - pulse})`; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.ellipse(c.x, c.y, 60 * (1 - pulse) * c.k + 6, (60 * (1 - pulse) * c.k + 6) * .5, 0, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(229,57,53,0.35)'; ctx.lineWidth = 2; ctx.setLineDash([6, 6]); ctx.lineDashOffset = time * 30;
    for (const it of items) if (it.lv === magnet.lv) {
      const q = proj(it.x, it.y, 10);
      ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.lineDashOffset = 0;
  }
  // fala
  if (waveFx > 0) {
    const yy = TL * waveFx;
    const a = proj(0, yy), b = proj(TW, yy), a2 = proj(0, Math.min(TL, yy + 60)), b2 = proj(TW, Math.min(TL, yy + 60));
    const g = ctx.createLinearGradient(0, a.y, 0, a2.y);
    g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(.3, 'rgba(79,195,247,0.6)'); g.addColorStop(1, 'rgba(79,195,247,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(a.x, a.y);
    for (let i = 1; i <= 12; i++) { const x = TW * i / 12; const q = proj(x, yy + Math.sin(i * 1.3 + time * 8) * 6); ctx.lineTo(q.x, q.y); }
    ctx.lineTo(b2.x, b2.y); ctx.lineTo(a2.x, a2.y); ctx.closePath(); ctx.fill();
  }
}

function drawPowerSlots() {
  for (let i = 0; i < MAX_POWER; i++) {
    const { x, y, r } = slotPos(i);
    const type = power[i];
    if (!type) {
      ctx.fillStyle = 'rgba(255,255,255,0.35)';
      ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.7)'; ctx.lineWidth = 2; ctx.setLineDash([4, 4]); ctx.stroke(); ctx.setLineDash([]);
      continue;
    }
    const P = POWERS[type];
    if (armed === i) {
      ctx.fillStyle = `rgba(255,235,59,${0.4 + 0.25 * Math.sin(time * 8)})`;
      ctx.beginPath(); ctx.arc(x, y, r + 7, 0, Math.PI * 2); ctx.fill();
    }
    const g = ctx.createRadialGradient(x - 6, y - 6, 3, x, y, r);
    g.addColorStop(0, P.c[0]); g.addColorStop(1, P.c[1]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 3; ctx.strokeStyle = '#fff'; ctx.stroke();
    ctx.font = `22px ${emojiFont}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(P.icon, x, y + 1);
  }
  if (armed >= 0 && power[armed]) {
    const P = POWERS[power[armed]];
    const y = T.launchY;
    const q = proj(TW / 2, y + 40);
    ctx.font = 'bold 14px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    const txt = P.icon + ' ' + P.hint;
    ctx.strokeText(txt, W / 2, q.y); ctx.fillStyle = '#fff59d'; ctx.fillText(txt, W / 2, q.y);
  }
}

function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, s = 60 + Math.random() * 160;
    particles.push({ x, y, z: 30, vx: Math.cos(a) * s, vy: Math.sin(a) * s, vz: 150 + Math.random() * 200,
      t: 0, life: 0.5 + Math.random() * 0.4, color, size: 2 + Math.random() * 3 });
  }
}

function updateFx(dt) {
  for (const b of bolts) b.t += dt;
  bolts = bolts.filter(b => b.t < .7);
  for (const r of rings) r.t += dt;
  rings = rings.filter(r => r.t < .5);
  flash = Math.max(0, flash - dt * 2.5);
  waveFx = Math.max(0, waveFx - dt * 1.6);
  if (magnet && (magnet.t -= dt) <= 0) magnet = null;
}

let settledFor = 0;
function checkGameOver(dt) {
  if (gameOver) return;
  if (orb || magnet || !items.every(i => Math.hypot(i.vx, i.vy) < 6) || time - lastShot < 0.8) { settledFor = 0; return; }
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

// ---------- animowane tło plaży ----------
const CLOUDS = [{ x: 30, y: .2, s: 1.1, v: 7 }, { x: 210, y: .42, s: .75, v: 11 }, { x: 330, y: .1, s: 1.35, v: 4.5 }, { x: 120, y: .6, s: .55, v: 14 }];
const wrap = (v, m) => ((v % m) + m) % m;

function cloud(x, y, s) {
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.beginPath();
  ctx.arc(x, y, 14 * s, 0, Math.PI * 2); ctx.arc(x + 16 * s, y - 8 * s, 17 * s, 0, Math.PI * 2);
  ctx.arc(x + 36 * s, y - 2 * s, 14 * s, 0, Math.PI * 2); ctx.arc(x + 20 * s, y + 6 * s, 14 * s, 0, Math.PI * 2);
  ctx.fill();
}

function palm(bx, by, lean, h, phase) {
  const sway = Math.sin(time * 1.1 + phase) * 0.07;
  const tx = bx + lean * h * .55 + sway * h * .4, ty = by - h;
  // pień
  ctx.strokeStyle = '#8d6e3f'; ctx.lineCap = 'round';
  for (let i = 0; i < 9; i++) {
    const t0 = i / 9, t1 = (i + 1) / 9;
    const px = t => bx + (tx - bx) * t + lean * h * .25 * Math.sin(t * Math.PI);
    const py = t => by + (ty - by) * t;
    ctx.lineWidth = 13 - i * .8;
    ctx.strokeStyle = i % 2 ? '#8d6e3f' : '#a1814f';
    ctx.beginPath(); ctx.moveTo(px(t0), py(t0)); ctx.lineTo(px(t1), py(t1)); ctx.stroke();
  }
  // kokosy
  ctx.fillStyle = '#6d4c2f';
  for (const [dx, dy] of [[-6, 5], [5, 6], [0, 9]]) { ctx.beginPath(); ctx.arc(tx + dx, ty + dy, 5, 0, Math.PI * 2); ctx.fill(); }
  // liście
  for (let i = 0; i < 7; i++) {
    const a = -Math.PI / 2 + (i - 3) * .5 + sway * 2.2 + Math.sin(time * 2 + i + phase) * .03;
    const len = 62 + (i % 2) * 12;
    ctx.save(); ctx.translate(tx, ty); ctx.rotate(a);
    const g = ctx.createLinearGradient(0, 0, len, 0);
    g.addColorStop(0, '#2e7d32'); g.addColorStop(1, '#81c784');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(len * .5, -16, len, 10);
    ctx.quadraticCurveTo(len * .5, 4, 0, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(27,94,32,0.6)'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.quadraticCurveTo(len * .5, -7, len, 10); ctx.stroke();
    ctx.restore();
  }
}

function drawBackdrop(tableTop) {
  const horizon = Math.max(70, tableTop - 95);
  const seaH = 58, shore = horizon + seaH;
  // niebo
  let g = ctx.createLinearGradient(0, 0, 0, horizon);
  g.addColorStop(0, '#2f9ee8'); g.addColorStop(.7, '#8fd3ff'); g.addColorStop(1, '#d9f3ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, horizon + 1);
  // słońce z obracającymi się promieniami
  const sunX = 118, sunY = horizon * .62;
  ctx.save(); ctx.translate(sunX, sunY); ctx.rotate(time * .12);
  ctx.fillStyle = 'rgba(255,241,170,0.35)';
  for (let i = 0; i < 12; i++) {
    ctx.rotate(Math.PI / 6);
    ctx.beginPath(); ctx.moveTo(-5, -26); ctx.lineTo(0, -48 - 6 * Math.sin(time * 2 + i)); ctx.lineTo(5, -26); ctx.fill();
  }
  ctx.restore();
  g = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, 24);
  g.addColorStop(0, '#fffde7'); g.addColorStop(.7, '#ffe082'); g.addColorStop(1, 'rgba(255,224,130,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(sunX, sunY, 24, 0, Math.PI * 2); ctx.fill();
  // chmury
  for (const c of CLOUDS) cloud(wrap(c.x + time * c.v, W + 140) - 70, 40 + (horizon - 60) * c.y, c.s);
  // mewy
  ctx.strokeStyle = '#37474f'; ctx.lineWidth = 1.8; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) {
    const bx = wrap(i * 160 + time * (22 + i * 5), W + 80) - 40;
    const by = 52 + i * 14 + Math.sin(time * .9 + i * 2) * 7;
    const wing = 3 + Math.sin(time * 7 + i * 1.7) * 4;
    ctx.beginPath(); ctx.moveTo(bx - 9, by - wing); ctx.quadraticCurveTo(bx - 4, by - 2, bx, by);
    ctx.quadraticCurveTo(bx + 4, by - 2, bx + 9, by - wing); ctx.stroke();
  }
  // wyspa w oddali
  ctx.fillStyle = '#5fa8a0';
  ctx.beginPath(); ctx.moveTo(240, horizon + 1);
  ctx.quadraticCurveTo(285, horizon - 30, 315, horizon - 18); ctx.quadraticCurveTo(350, horizon - 34, 410, horizon + 1); ctx.fill();
  // morze
  g = ctx.createLinearGradient(0, horizon, 0, shore);
  g.addColorStop(0, '#0277bd'); g.addColorStop(.6, '#1fa8d8'); g.addColorStop(1, '#5fe0e0');
  ctx.fillStyle = g; ctx.fillRect(0, horizon, W, seaH + 2);
  // błyski fal
  ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 1.5;
  for (let k = 0; k < 4; k++) {
    const yy = horizon + 9 + k * 12, ph = time * (1.2 + k * .35) + k;
    ctx.beginPath();
    for (let x = -10; x <= W + 10; x += 8) {
      const y2 = yy + Math.sin(x * .05 + ph) * (1 + k * .5);
      x === -10 ? ctx.moveTo(x, y2) : ctx.lineTo(x, y2);
    }
    ctx.setLineDash([10 + k * 4, 18 + k * 6]); ctx.lineDashOffset = -time * (14 + k * 6); ctx.stroke();
  }
  ctx.setLineDash([]); ctx.lineDashOffset = 0;
  // żaglówka
  const bx = wrap(time * 10, W + 120) - 60, by = horizon + 13 + Math.sin(time * 1.6) * 1.6;
  ctx.save(); ctx.translate(bx, by); ctx.rotate(Math.sin(time * 1.6) * .05);
  ctx.fillStyle = '#5d4037';
  ctx.beginPath(); ctx.moveTo(-14, 0); ctx.lineTo(14, 0); ctx.lineTo(9, 6); ctx.lineTo(-9, 6); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#fafafa';
  ctx.beginPath(); ctx.moveTo(1, -1); ctx.lineTo(1, -28); ctx.lineTo(14, -2); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#ef5350';
  ctx.beginPath(); ctx.moveTo(-1, -2); ctx.lineTo(-1, -22); ctx.lineTo(-11, -2); ctx.closePath(); ctx.fill();
  ctx.restore();
  // delfin wyskakujący co kilka sekund
  const dc = wrap(time, 7) / 1.4;
  if (dc < 1) {
    const dx = 70 + Math.floor(time / 7) % 3 * 90 + dc * 50, dy = horizon + 34 - Math.sin(dc * Math.PI) * 26;
    ctx.save(); ctx.translate(dx, dy); ctx.rotate(-Math.PI / 4 + dc * Math.PI / 2);
    ctx.fillStyle = '#546e7a';
    ctx.beginPath(); ctx.ellipse(0, 0, 13, 5, 0, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(2, -10); ctx.lineTo(5, -4); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-12, 0); ctx.lineTo(-18, -5); ctx.lineTo(-18, 5); ctx.fill();
    ctx.restore();
  }
  // piasek
  g = ctx.createLinearGradient(0, shore, 0, H);
  g.addColorStop(0, '#ffe9b8'); g.addColorStop(1, '#efc277');
  ctx.fillStyle = g; ctx.fillRect(0, shore, W, H - shore);
  // fala wpływająca na brzeg (w pętli)
  const surf = Math.sin(time * .9) * 5;
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath(); ctx.moveTo(0, shore - 3);
  for (let x = 0; x <= W; x += 10) ctx.lineTo(x, shore + 2 + surf + Math.sin(x * .07 + time * 1.5) * 2.5);
  ctx.lineTo(W, shore - 3); ctx.closePath(); ctx.fill();
  ctx.fillStyle = 'rgba(95,224,224,0.5)';
  ctx.beginPath(); ctx.moveTo(0, shore - 3);
  for (let x = 0; x <= W; x += 10) ctx.lineTo(x, shore - 1 + surf * .6 + Math.sin(x * .07 + time * 1.5) * 2);
  ctx.lineTo(W, shore - 3); ctx.closePath(); ctx.fill();
  // muszelki na piasku
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  for (const [x, y] of [[30, 18], [355, 30], [190, 26], [300, 12]]) {
    ctx.beginPath(); ctx.ellipse(x, shore + y, 3, 2, 0, 0, Math.PI * 2); ctx.fill();
  }
  // krab chodzący wzdłuż brzegu
  const cx = 200 + Math.sin(time * .35) * 170, cy = shore + 20;
  const walk = Math.sin(time * 9);
  ctx.strokeStyle = '#c62828'; ctx.lineWidth = 1.6;
  for (let i = -1; i <= 1; i += 2) for (let l = 0; l < 3; l++) {
    ctx.beginPath(); ctx.moveTo(cx + i * 5, cy + 1 + l);
    ctx.lineTo(cx + i * (11 + l * 2), cy + 5 + l * 1.5 + (l % 2 ? walk : -walk) * 1.5); ctx.stroke();
  }
  ctx.fillStyle = '#e53935';
  ctx.beginPath(); ctx.ellipse(cx, cy, 9, 6, 0, 0, Math.PI * 2); ctx.fill();
  for (let i = -1; i <= 1; i += 2) {
    ctx.beginPath(); ctx.arc(cx + i * 12, cy - 7 + Math.sin(time * 3 + i) * 1.5, 3.5, 0, Math.PI * 2); ctx.fill();
  }
  ctx.fillStyle = '#fff';
  ctx.beginPath(); ctx.arc(cx - 3, cy - 6, 2, 0, Math.PI * 2); ctx.arc(cx + 3, cy - 6, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = '#000';
  ctx.beginPath(); ctx.arc(cx - 3, cy - 6, 1, 0, Math.PI * 2); ctx.arc(cx + 3, cy - 6, 1, 0, Math.PI * 2); ctx.fill();
  // palmy po bokach
  palm(-4, tableTop + 70, .35, 175, 0);
  palm(W + 6, tableTop + 60, -.4, 160, 1.7);
}

// ---------- scena ----------
function quad(pts) {
  ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function drawScene() {
  const far = proj(0, -FRAME);
  drawBackdrop(far.y);
  let g;
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
  const armedType = armed >= 0 ? power[armed] : null;
  const armedOrb = armedType && POWERS[armedType].kind === 'orb' ? armedType : null;
  if (!gameOver) list.push({ lv: current, x: clampAim(aimX), y: T.launchY, launcher: true, orb: armedOrb,
    icy: armedType === 'ice' });
  if (orb) list.push({ x: orb.x, y: orb.y, orb: orb.type });
  list.sort((a, b) => a.y - b.y);
  for (const o of list) {
    if (o.orb) { drawOrb(o.orb, o.x, o.y, 20, o.launcher && !canShoot() ? 0.5 : 1); continue; }
    if ((o.it && o.it.ice > 0) || o.icy) {
      const c = proj(o.x, o.y), rr = radius(o.lv) * c.k;
      ctx.fillStyle = `rgba(129,212,250,${0.35 + 0.15 * Math.sin(time * 10)})`;
      ctx.beginPath(); ctx.ellipse(c.x, c.y, rr * 1.25, rr * .6, 0, 0, Math.PI * 2); ctx.fill();
    }
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
  drawBolts();
  drawFx();
  if (flash > 0) {
    ctx.fillStyle = `rgba(${flashColor},${flash * 0.45})`; ctx.fillRect(0, 0, W, H);
  }
  for (const f of floaters) {
    if (f.t < 0) continue;
    const q = proj(f.x, f.y, 90 - (f.dy || 0));
    ctx.globalAlpha = Math.max(0, 1 - f.t / 1.1);
    ctx.font = `bold ${f.huge ? 30 : f.big ? 22 : 20}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.lineWidth = 4; ctx.strokeStyle = '#5d4037';
    ctx.strokeText(f.text, q.x, q.y - f.t * 50);
    ctx.fillStyle = f.big ? '#ffd54f' : '#fff';
    ctx.fillText(f.text, q.x, q.y - f.t * 50);
  }
  ctx.globalAlpha = 1;
  drawHUD();
  drawPowerSlots();
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
  updateFx(dt);
  floaters = floaters.filter(f => f.t < 1.1);
  checkGameOver(dt);
  saveTimer += dt;
  if (saveTimer > 3) { saveTimer = 0; saveGame(); }
  render(dt);
  requestAnimationFrame(frame);
}

if (!loadGame()) reset();
requestAnimationFrame(frame);
