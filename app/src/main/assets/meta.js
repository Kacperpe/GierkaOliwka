'use strict';
// ===== Postęp, misje, sklep, kolekcja, wyniki, menu =====
const Meta = (() => {
  const CFG = window.GAME_CONFIG || { secrets: [] };
  const $ = id => document.getElementById(id);
  const MODE_KEYS = ['classic', 'daily', 'time', 'zen', 'challenge'];

  const DESC = [
    'Słodko-kwaśny początek każdej imprezy.',
    'Świeżo wyciśnięty, z plasterkiem cytryny.',
    'Zielona bomba witamin.',
    'Truskawki z kremową pianką.',
    'Leśne owoce i niebieska słomka.',
    'Wakacje w szklance — z parasolką!',
    'Elegancki, różowy, z jagodami.',
    'Cały dzbanek na upalny dzień.',
    'Prosto z kokosa, z ananasem.',
    'Legenda baru: tęcza zamknięta w słoju.',
  ];

  const SHOP = [
    { cat: 'table', id: 'wood', price: 0 },
    { cat: 'table', id: 'marble', price: 300 },
    { cat: 'table', id: 'candy', price: 600, lvl: 3 },
    { cat: 'table', id: 'neon', price: 1000, lvl: 5 },
    { cat: 'bg', id: 'day', price: 0 },
    { cat: 'bg', id: 'sunset', price: 300 },
    { cat: 'bg', id: 'night', price: 700, lvl: 4 },
    { cat: 'bg', id: 'winter', price: 1000, lvl: 6 },
  ];

  // ---------- profil ----------
  const DEF = {
    v: 1, coins: 0, xp: 0, level: 1, name: 'Ty',
    owned: { table: ['wood'], bg: ['day'] }, sel: { table: 'wood', bg: 'day' },
    found: [1], secrets: [], best: {}, scores: {},
    sound: true, vibe: true, streak: 0, lastPlay: '', lastOpen: '', gift: null,
    daily: { date: '', best: 0 }, stats: { games: 0, merges: 0, orders: 0 },
  };
  let P = JSON.parse(JSON.stringify(DEF));
  function loadProfile() {
    try {
      const s = JSON.parse(localStorage.getItem('go_profile'));
      if (s) P = Object.assign(JSON.parse(JSON.stringify(DEF)), s);
      else {
        const old = +localStorage.getItem('go_best') || 0;   // rekord ze starej wersji
        if (old) P.best.classic = old;
      }
    } catch (e) {}
  }
  function saveProfile() { try { localStorage.setItem('go_profile', JSON.stringify(P)); } catch (e) {} }

  const xpNeed = l => 300 + 200 * l;
  const dayStr = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const yesterday = () => { const d = new Date(); d.setDate(d.getDate() - 1); return dayStr(d); };
  const dailySeed = () => { let h = 2166136261; for (const ch of 'gierka' + dayStr()) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h | 0; };
  const fmt = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

  // ---------- misje ----------
  const MISSION_GEN = [
    r => { const lv = 4 + Math.floor(r() * 3), n = lv >= 6 ? 1 : 2; return { k: 'make', lv, need: n, text: `Zrób ${n}× ${LEVELS[lv - 1].name}` }; },
    r => { const c = 3 + Math.floor(r() * 2); return { k: 'combo', c, need: 1, text: `Zrób combo x${c}` }; },
    r => { const n = 2 + Math.floor(r() * 2); return { k: 'order', need: n, text: `Wykonaj ${n} zamówienia` }; },
    () => ({ k: 'power', need: 2, text: 'Użyj 2 power-upów' }),
    r => { const v = [1500, 2500, 4000][Math.floor(r() * 3)]; return { k: 'score', need: v, text: `Zdobądź ${fmt(v)} pkt` }; },
    r => { const n = [20, 35, 50][Math.floor(r() * 3)]; return { k: 'merge', need: n, text: `Połącz ${n} par` }; },
    () => ({ k: 'gold', need: 1, text: 'Połącz złoty napój ✨' }),
    () => ({ k: 'fast', need: 1, text: 'Wykonaj zamówienie na ⚡x2' }),
  ];
  let run = { missions: [], seed: 0, coinsFromMissions: 0, newFound: [] };

  function genMissions() {
    const pool = MISSION_GEN.map((g, i) => i).sort(() => Math.random() - .5).slice(0, 3);
    return pool.map(i => Object.assign(MISSION_GEN[i](Math.random), { prog: 0, done: false, reward: 40 + Math.floor(Math.random() * 3) * 20 }));
  }

  function progress(m, amount, absolute) {
    if (m.done) return;
    m.prog = absolute ? Math.max(m.prog, amount) : m.prog + amount;
    if (m.prog >= m.need) {
      m.prog = m.need; m.done = true;
      P.coins += m.reward; run.coinsFromMissions += m.reward; saveProfile();
      toast(`✅ Misja: ${m.text} <b>+${m.reward} 💰</b>`);
      Sfx.coin(); haptic(40);
      if (run.missions.every(x => x.done)) {
        P.coins += 100; run.coinsFromMissions += 100; saveProfile();
        setTimeout(() => { toast('🎉 Wszystkie misje! <b>+100 💰</b> i power-up'); grantPower(); }, 900);
      }
    }
  }

  function ev(type, d = {}) {
    if (type === 'merge') { P.stats.merges++; }
    if (type === 'order') { P.stats.orders++; }
    if (type === 'mega') unlockSecret('mega');
    if (type === 'score' && d.score >= 10000) unlockSecret('score10k');
    for (const m of run.missions) {
      if (m.done) continue;
      if (m.k === 'make' && type === 'merge' && d.lv === m.lv) progress(m, 1);
      else if (m.k === 'combo' && type === 'merge' && d.combo >= m.c) progress(m, 1);
      else if (m.k === 'merge' && type === 'merge') progress(m, 1);
      else if (m.k === 'order' && type === 'order') progress(m, 1);
      else if (m.k === 'fast' && type === 'order' && d.fast) progress(m, 1);
      else if (m.k === 'power' && type === 'power') progress(m, 1);
      else if (m.k === 'gold' && type === 'gold') progress(m, 1);
      else if (m.k === 'score' && type === 'score') progress(m, d.score, true);
    }
  }

  // ---------- odkrycia, sekrety ----------
  function onReach(lv) {
    if (P.found.includes(lv)) return;
    P.found.push(lv); saveProfile();
    run.newFound.push(lv);
    showBanner(lv);
  }

  function unlockSecret(id) {
    if (P.secrets.includes(id)) return;
    const sc = (CFG.secrets || []).find(x => x.id === id);
    if (!sc) return;
    P.secrets.push(id); saveProfile();
    Sfx.unlock(); haptic(150);
    const wasPaused = paused;
    paused = true;
    modal(`<div class="big">🎁</div><h2>${sc.title}</h2><p class="msg">${sc.message}</p>`,
      [{ t: 'Super! 💖', f: () => { closeModal(); if (!wasPaused && runActive && !gameOver) paused = false; } }]);
  }

  // ---------- UI: pomocnicze ----------
  function toast(html) {
    const el = document.createElement('div');
    el.className = 'toast'; el.innerHTML = html;
    $('toasts').appendChild(el);
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  function showBanner(lv) {
    if (lv <= 1) return;
    const b = $('banner');
    b.innerHTML = '';
    const ic = iconCanvas(lv, 96);
    const t = document.createElement('div');
    t.innerHTML = `<small>Nowy napój!</small><b>${LEVELS[lv - 1].name}</b>`;
    b.append(ic, t);
    b.classList.remove('show'); void b.offsetWidth; b.classList.add('show');
    Sfx.unlock(); haptic(60);
    clearTimeout(showBanner.tm);
    showBanner.tm = setTimeout(() => b.classList.remove('show'), 2300);
  }

  let stack = [];
  function show(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('on'));
    if (id) $(id).classList.add('on');
  }
  function go(id, render) { stack.push(id); render(); show(id); Sfx.click(); }
  function back() {
    if ($('modal').classList.contains('on')) { closeModal(); return true; }
    if (stack.length > 1) { stack.pop(); const id = stack[stack.length - 1]; (RENDER[id] || (() => {}))(); show(id); return true; }
    if (stack.length === 1 && stack[0] !== 'menu') { openMenu(); return true; }
    if (runActive && !gameOver && !paused) { pause(); return true; }
    if (stack[0] === 'pause') { resume(); return true; }
    return false;
  }
  function hideAll() { stack = []; show(null); }

  function modal(html, buttons) {
    const m = $('modal');
    m.querySelector('.card').innerHTML = html + '<div class="btns"></div>';
    const bb = m.querySelector('.btns');
    for (const b of buttons) {
      const e = document.createElement('button'); e.className = b.cls || ''; e.innerHTML = b.t;
      e.onclick = () => { Sfx.click(); b.f(); }; bb.appendChild(e);
    }
    m.classList.add('on');
  }
  function closeModal() { $('modal').classList.remove('on'); }

  function btn(html, f, cls = '') {
    const e = document.createElement('button');
    e.className = cls; e.innerHTML = html;
    e.onclick = () => { Sfx.click(); f(); };
    return e;
  }

  function header() {
    const need = xpNeed(P.level);
    return `<div class="hdr">
      <div class="lvl"><span>Poz. ${P.level}</span><div class="bar"><i style="width:${Math.min(100, P.xp / need * 100)}%"></i></div></div>
      <div class="pill">💰 ${fmt(P.coins)}</div>
      <div class="pill">🔥 ${P.streak}</div>
    </div>`;
  }

  // ---------- ekrany ----------
  function card(cls, iconLv, title, sub, f) {
    const b = document.createElement('button');
    b.className = 'mcard ' + cls;
    b.appendChild(iconCanvas(iconLv, 52));
    const t = document.createElement('div');
    t.innerHTML = `<b>${title}</b><small>${sub}</small>`;
    b.appendChild(t);
    b.onclick = () => { Sfx.click(); f(); };
    return b;
  }

  let heroTimer = null;
  function renderMenu() {
    const el = $('menu');
    const need = xpNeed(P.level), pct = Math.min(100, P.xp / need * 100);
    const title = (CFG.title || 'Gierka Oliwka').split(' ');
    el.innerHTML = `
      <div class="bubbles">${'<i></i>'.repeat(12)}</div>
      <div class="mtop">
        <div class="lvbadge" style="--p:${pct}"><b>${P.level}</b></div>
        <div class="lvinfo"><span>Poziom ${P.level}</span><div class="bar"><i style="width:${pct}%"></i></div><small>${fmt(P.xp)} / ${fmt(need)} XP</small></div>
        <div class="chip coin"><span class="cicon"></span>${fmt(P.coins)}</div>
        <div class="chip fire">🔥 ${P.streak}</div>
      </div>
      <div class="sign"><div class="board"><span>${title[0] || ''}</span><span>${title.slice(1).join(' ')}</span></div></div>
      <div class="hero"><div class="rays"></div><div class="hdrink"></div><div class="hshadow"></div></div>
      <div class="mmain"></div>
      <div class="modes"></div>
      <div class="dock"></div>`;
    // bohater: najlepszy odkryty napój, zmienia się co kilka sekund
    const found = P.found.slice().sort((a, b) => b - a);
    let hi = 0;
    const H = el.querySelector('.hdrink');
    const setHero = () => {
      H.innerHTML = ''; const c = iconCanvas(found[hi % found.length], 132); H.appendChild(c);
      H.classList.remove('swap'); void H.offsetWidth; H.classList.add('swap'); hi++;
    };
    setHero();
    clearInterval(heroTimer);
    if (found.length > 1) heroTimer = setInterval(() => { if ($('menu').classList.contains('on')) setHero(); }, 3200);

    const M = el.querySelector('.mmain');
    if (runActive && !gameOver) {
      const c = btn(`<span class="tk">▶</span><div><b>Kontynuuj</b><small>${MODES[mode].name} · ${fmt(score)} pkt</small></div>`, resume, 'ticket');
      M.appendChild(c);
    }
    const play = btn(`<div><b>GRAJ</b><small>Klasyczny · rekord ${fmt(P.best.classic || 0)}</small></div>`, () => newRun({ mode: 'classic' }), 'play');
    play.prepend(iconCanvas(6, 58));
    M.appendChild(play);

    const db = P.daily.date === dayStr() ? P.daily.best : 0;
    el.querySelector('.modes').append(
      card('c-daily', 4, 'Wyzwanie dnia', db ? `dziś: ${fmt(db)}` : 'nowy układ!', () => newRun({ mode: 'daily', seed: dailySeed() })),
      card('c-time', 2, 'Na czas', `60 s · ${fmt(P.best.time || 0)}`, () => newRun({ mode: 'time' })),
      card('c-zen', 9, 'Zen', 'bez przegranej', () => newRun({ mode: 'zen' })),
      card('c-code', 7, 'Wyzwanie', 'wpisz kod', enterCode),
    );
    const D = el.querySelector('.dock');
    for (const [ic, lab, f, badge] of [
      ['📖', 'Kolekcja', () => go('album', renderAlbum), `${P.found.length}/${MAX_LV}`],
      ['🛍️', 'Sklep', () => go('shop', renderShop), ''],
      ['🏆', 'Wyniki', () => go('scores', renderScores), ''],
      ['⚙️', 'Opcje', () => go('settings', renderSettings), ''],
    ]) {
      const b = btn(`<span class="dic">${ic}</span><small>${lab}</small>${badge ? `<em>${badge}</em>` : ''}`, f, 'dbtn');
      D.appendChild(b);
    }
  }

  function openMenu() {
    paused = true; aiming = false;
    saveGame();
    stack = ['menu']; renderMenu(); show('menu');
  }

  function newRun(opts) {
    const doit = () => {
      closeModal(); hideAll();
      const seed = opts.seed != null ? opts.seed : (Math.random() * 2147483647) | 0;
      run = { missions: genMissions(), seed, coinsFromMissions: 0, newFound: [], mode: opts.mode, target: opts.target || 0 };
      startRun(Object.assign({}, opts, { seed }));
    };
    if (runActive && !gameOver && score > 0) {
      modal('<h2>Nowa gra?</h2><p>Obecna partia przepadnie.</p>', [
        { t: 'Tak, nowa', f: doit, cls: 'primary' }, { t: 'Anuluj', f: closeModal },
      ]);
    } else doit();
  }

  function onRunStart() {
    P.stats.games++;
    const today = dayStr();
    if (P.lastPlay !== today) {
      P.streak = P.lastPlay === yesterday() ? P.streak + 1 : 1;
      P.lastPlay = today;
      const rew = 20 * Math.min(P.streak, 7);
      P.coins += rew;
      setTimeout(() => { toast(`🔥 Seria ${P.streak} ${P.streak === 1 ? 'dzień' : 'dni'}! <b>+${rew} 💰</b>`); Sfx.coin(); }, 400);
    }
    if (P.gift && POWERS[P.gift]) {
      power.push(P.gift);
      const g = POWERS[P.gift];
      setTimeout(() => toast(`🎁 Prezent dnia: ${g.icon} ${g.name}`), 1200);
      P.gift = null;
    }
    saveProfile();
    setTimeout(() => toast('🎯 Misje: ' + run.missions.map(m => m.text).join(' · ')), 2000);
  }

  function tbar(title, right = '') {
    return `<div class="tbar"><button class="back">‹</button><div class="plank">${title}</div>${right || '<i class="tsp"></i>'}</div>`;
  }
  const coinChip = () => `<div class="chip coin"><span class="cicon"></span>${fmt(P.coins)}</div>`;

  function pause() {
    paused = true; aiming = false; saveGame();
    stack = ['pause'];
    const el = $('pause');
    el.innerHTML = `<div class="pcard">
      <div class="plank big">Pauza</div>
      <div class="pinfo"><span>${MODES[mode].name}</span><b>${fmt(score)} pkt</b></div>
      <div class="mlist">${missionsHtml()}</div>
      <div class="pbtns"></div></div>`;
    const B = el.querySelector('.pbtns');
    B.append(
      btn('<b>▶ Wznów</b>', resume, 'bplay'),
      btn('🔄 Od nowa', () => newRun({ mode: run.mode || mode, seed: mode === 'daily' ? dailySeed() : undefined, target: run.target }), 'bsoft'),
      btn('🏠 Menu', openMenu, 'bsoft'),
    );
    show('pause'); Sfx.click();
  }
  function resume() { hideAll(); if (runActive && !gameOver) { paused = false; last = performance.now(); } }

  function missionsHtml() {
    if (!run.missions.length) return '';
    return '<div class="mhead">🎯 Misje</div>' + run.missions.map(m => {
      const pr = Math.min(100, m.prog / m.need * 100);
      const num = m.k === 'score' ? fmt(m.prog) + ' / ' + fmt(m.need) : m.prog + ' / ' + m.need;
      return `<div class="mis ${m.done ? 'done' : ''}">
        <span class="mck">${m.done ? '✓' : ''}</span>
        <div class="mtx"><span>${m.text}</span><div class="mbar"><i style="width:${pr}%"></i></div><small>${num}</small></div>
        <span class="mrw"><span class="cicon"></span>${m.reward}</span></div>`;
    }).join('');
  }

  function confetti(el) {
    const box = document.createElement('div'); box.className = 'confetti';
    const cols = ['#ff5252', '#ffca28', '#69f0ae', '#40c4ff', '#e040fb', '#ff9100'];
    for (let i = 0; i < 46; i++) {
      const c = document.createElement('i');
      c.style.cssText = `left:${Math.random() * 100}%;background:${cols[i % cols.length]};animation-delay:${Math.random() * 1.2}s;` +
        `animation-duration:${2.2 + Math.random() * 1.8}s;--dx:${(Math.random() - .5) * 120}px;--r:${(Math.random() * 720 - 360) | 0}deg;` +
        `width:${6 + Math.random() * 6}px;height:${8 + Math.random() * 8}px;border-radius:${Math.random() < .3 ? '50%' : '2px'}`;
      box.appendChild(c);
    }
    el.appendChild(box);
  }

  function countUp(node, to) {
    const t0 = performance.now(), dur = Math.min(1400, 400 + to / 10);
    const stepF = n => {
      const k = Math.min(1, (n - t0) / dur), e = 1 - Math.pow(1 - k, 3);
      node.textContent = fmt(to * e);
      if (k < 1) requestAnimationFrame(stepF); else node.classList.add('done');
    };
    requestAnimationFrame(stepF);
  }

  function onGameEnd(info) {
    // nagrody rosną wolniej niż wynik (punkty w długiej grze rosną bardzo szybko)
    const coins = Math.floor(Math.sqrt(info.score) * 1.5);
    const xp = Math.floor(Math.sqrt(info.score) * 5) + 20;
    P.coins += coins;
    const oldLevel = P.level;
    P.xp += xp;
    while (P.xp >= xpNeed(P.level)) { P.xp -= xpNeed(P.level); P.level++; P.coins += 100; }
    const m = info.mode;
    const isRecord = info.score > (P.best[m] || 0);
    if (isRecord) P.best[m] = info.score;
    const list = P.scores[m] || (P.scores[m] = []);
    list.push({ n: P.name || 'Ty', s: info.score, d: dayStr() });
    list.sort((a, b) => b.s - a.s); list.length = Math.min(list.length, 10);
    if (m === 'daily') {
      if (P.daily.date !== dayStr()) P.daily = { date: dayStr(), best: 0 };
      P.daily.best = Math.max(P.daily.best, info.score);
    }
    saveProfile();
    if (P.level >= 10) setTimeout(() => unlockSecret('level10'), 600);

    const el = $('results');
    const need = xpNeed(P.level), pct = Math.min(100, P.xp / need * 100);
    let extra = '';
    if (info.target) extra = info.score > info.target
      ? `<div class="rnote win">🏆 Pobity cel ${fmt(info.target)}!</div>` : `<div class="rnote">🎯 Cel ${fmt(info.target)} — zabrakło ${fmt(info.target - info.score)}</div>`;
    if (m === 'daily') extra += `<div class="rnote">📅 Najlepszy dziś: <b>${fmt(P.daily.best)}</b></div>`;
    const rec = isRecord && info.score > 0;
    el.innerHTML = `<div class="pcard">
      <div class="plank big">${info.title}</div>
      <div class="rmode">${MODES[m].name}</div>
      <div class="rscore">0</div>
      ${rec ? '<div class="ribbon">🎉 Nowy rekord!</div>' : `<div class="rnote">Rekord: <b>${fmt(P.best[m] || 0)}</b></div>`}
      ${extra}
      <div class="rgain"><div class="chip coin"><span class="cicon"></span>+${fmt(coins + run.coinsFromMissions)}</div><div class="chip xp">⭐ +${fmt(xp)} XP</div></div>
      <div class="rlvl"><div class="lvbadge" style="--p:${pct}"><b>${P.level}</b></div>
        <div><span>Poziom ${P.level}${P.level > oldLevel ? ' <em>⬆ awans!</em>' : ''}</span><div class="bar"><i style="width:${pct}%"></i></div><small>${fmt(P.xp)} / ${fmt(need)} XP</small></div></div>
      <div class="mlist">${missionsHtml()}</div>
      <div class="pbtns"></div></div>`;
    const B = el.querySelector('.pbtns');
    B.append(
      btn('<b>🔄 Jeszcze raz</b>', () => newRun({ mode: run.mode || m, seed: m === 'daily' ? dailySeed() : (m === 'challenge' ? run.seed : undefined), target: run.target }), 'bplay'),
      btn('📣 Wyzwij', () => shareChallenge(info), 'bsoft'),
      btn('🏠 Menu', openMenu, 'bsoft'),
    );
    stack = ['results']; show('results');
    countUp(el.querySelector('.rscore'), info.score);
    if (rec) { confetti(el); setTimeout(() => Sfx.levelup(), 300); }
    if (P.level > oldLevel) setTimeout(() => { toast(`⬆️ Poziom ${P.level}! <b>+${100 * (P.level - oldLevel)} 💰</b>`); Sfx.levelup(); }, 900);
  }

  // ---------- kody wyzwań ----------
  function makeCode(m, seed, sc) {
    const c = m === 'time' ? 'T' : 'K';
    return c + (seed >>> 0).toString(36).toUpperCase() + '-' + Math.max(0, sc).toString(36).toUpperCase();
  }
  function parseCode(code) {
    const mm = /^([KT])([0-9A-Z]+)-([0-9A-Z]+)$/.exec(code.trim().toUpperCase().replace(/\s+/g, ''));
    if (!mm) return null;
    return { mode: mm[1] === 'T' ? 'time' : 'challenge', seed: parseInt(mm[2], 36) | 0, target: parseInt(mm[3], 36) };
  }
  function shareChallenge(info) {
    const code = makeCode(info.mode, run.seed, info.score);
    const text = `Pobij mój wynik ${fmt(info.score)} pkt w ${CFG.title || 'Gierce Oliwce'}! 🍹 Kod wyzwania: ${code}`;
    try {
      if (window.Android && Android.share) { Android.share(text); return; }
      if (navigator.share) { navigator.share({ text }).catch(() => {}); return; }
    } catch (e) {}
    try { navigator.clipboard.writeText(text); toast('Skopiowano kod: <b>' + code + '</b>'); }
    catch (e) { toast('Kod: <b>' + code + '</b>'); }
  }
  function enterCode() {
    modal(`<h2>🎯 Kod wyzwania</h2><p>Wpisz kod od znajomego — zagrasz na tym samym układzie i spróbujesz pobić jego wynik.</p>
      <input id="codeIn" placeholder="np. K1A2B3C-5DE" autocomplete="off" autocapitalize="characters">`, [
      { t: 'Graj', cls: 'primary', f: () => {
        const c = parseCode($('codeIn').value);
        if (!c) { toast('Nieprawidłowy kod'); return; }
        newRun(c);
      } },
      { t: 'Anuluj', f: closeModal },
    ]);
    setTimeout(() => $('codeIn') && $('codeIn').focus(), 100);
  }

  // ---------- kolekcja ----------
  function renderAlbum() {
    const el = $('album');
    const ns = (CFG.secrets || []).length;
    el.innerHTML = `${tbar('Kolekcja')}
      <div class="aprog"><div><b>${P.found.length}</b>/${MAX_LV} napojów</div><div class="bar"><i style="width:${P.found.length / MAX_LV * 100}%"></i></div>
        <div><b>${P.secrets.length}</b>/${ns} sekretów</div></div>
      <div class="agrid"></div><div class="plank small">Sekrety</div><div class="slist"></div>`;
    el.querySelector('.back').onclick = back;
    const C = el.querySelector('.agrid');
    for (let lv = 1; lv <= MAX_LV; lv++) {
      const has = P.found.includes(lv), L = LEVELS[lv - 1];
      const d = document.createElement('div'); d.className = 'acard2' + (has ? '' : ' locked');
      d.style.setProperty('--c1', L.liq[0]); d.style.setProperty('--c2', L.liq[L.liq.length - 1]);
      const ic = document.createElement('div'); ic.className = 'aic';
      ic.appendChild(iconCanvas(lv, 70, has ? 1 : .9));
      if (!has) ic.insertAdjacentHTML('beforeend', '<span>?</span>');
      d.appendChild(ic);
      d.insertAdjacentHTML('beforeend', `<span class="alv">${lv}</span><b>${has ? L.name : '???'}</b><small>${has ? mergePoints(lv) + ' pkt za parę' : 'połącz 2× poz. ' + (lv - 1)}</small>`);
      if (has) d.onclick = () => {
        Sfx.click();
        modal('<div class="micon"></div>' + `<h2>${L.name}</h2><p class="msg">${DESC[lv - 1]}</p><p class="mstat">Poziom ${lv} · ${mergePoints(lv)} pkt za połączenie pary</p>`,
          [{ t: 'Zamknij', f: closeModal }]);
        document.querySelector('#modal .micon').appendChild(iconCanvas(lv, 130));
      };
      C.appendChild(d);
    }
    const S = el.querySelector('.slist');
    for (const sc of CFG.secrets || []) {
      const has = P.secrets.includes(sc.id);
      const d = document.createElement('div'); d.className = 'scard' + (has ? '' : ' locked');
      d.innerHTML = `<div class="sic">${has ? '🎁' : '🔒'}</div><div><b>${has ? sc.title : 'Sekret'}</b><small>${has ? 'Dotknij, żeby przeczytać' : sc.how}</small></div>`;
      if (has) d.onclick = () => modal(`<div class="big">🎁</div><h2>${sc.title}</h2><p class="msg">${sc.message}</p>`, [{ t: 'Zamknij', f: closeModal }]);
      S.appendChild(d);
    }
  }

  // ---------- sklep ----------
  function preview(item) {
    if (item.cat === 'bg') {
      const B = BGS[item.id];
      const orb = B.orb === 'moon' ? '#fffde7' : B.orb === 'sunset' ? '#ffb74d' : '#fff59d';
      return `background:radial-gradient(circle at 28% 30%, ${orb} 0 9%, transparent 10%),` +
        `linear-gradient(${B.sky[0]} 0%,${B.sky[1]} 38%,${B.sky[2]} 50%,${B.sea[0]} 51%,${B.sea[2]} 66%,${B.sand[0]} 67%,${B.sand[1]} 100%)`;
    }
    const T = TABLES[item.id];
    return `background:linear-gradient(${T.top[0]},${T.top[1]});border:7px solid ${T.frame[0]};outline:3px solid ${T.inner};outline-offset:-10px;` +
      `${T.glow ? `box-shadow:0 0 12px ${T.rim}, inset 0 0 10px ${T.inner};` : ''}`;
  }
  let shopTab = 'table';
  function renderShop() {
    const el = $('shop');
    el.innerHTML = `${tbar('Sklep', coinChip())}
      <div class="seg"><button data-t="table">🪑 Stoły</button><button data-t="bg">🏝️ Tła</button></div>
      <div class="sgrid"></div>`;
    el.querySelector('.back').onclick = back;
    el.querySelectorAll('.seg button').forEach(b => {
      if (b.dataset.t === shopTab) b.classList.add('on');
      b.onclick = () => { Sfx.click(); shopTab = b.dataset.t; renderShop(); };
    });
    const G = el.querySelector('.sgrid');
    for (const it of SHOP.filter(x => x.cat === shopTab)) {
      const own = P.owned[it.cat].includes(it.id), sel = P.sel[it.cat] === it.id;
      const locked = !own && it.lvl && P.level < it.lvl;
      const name = (it.cat === 'bg' ? BGS : TABLES)[it.id].name;
      const d = document.createElement('div'); d.className = 'sitem2' + (sel ? ' sel' : '') + (locked ? ' locked' : '');
      d.innerHTML = `<div class="prev2 ${it.cat}"><div style="${preview(it)}"></div>${sel ? '<span class="tag">Wybrany</span>' : own ? '<span class="tag own">✓</span>' : ''}${locked ? `<span class="lock">🔒<small>poziom ${it.lvl}</small></span>` : ''}</div><b>${name}</b>`;
      const label = sel ? 'W użyciu' : own ? 'Wybierz' : locked ? `Poziom ${it.lvl}` : `<span class="cicon"></span>${fmt(it.price)}`;
      const b = btn(label, () => {
        if (sel) return;
        if (own) { P.sel[it.cat] = it.id; Sfx.swap(); }
        else if (locked) { toast(`Odblokujesz na poziomie ${it.lvl}`); return; }
        else if (P.coins < it.price) { toast(`Brakuje ${fmt(it.price - P.coins)} 💰`); return; }
        else { P.coins -= it.price; P.owned[it.cat].push(it.id); P.sel[it.cat] = it.id; Sfx.coin(); toast(`Kupiono: ${name}! 🎉`); }
        saveProfile(); applyTheme(); renderShop();
      }, sel ? 'sused' : own ? 'sown' : locked ? 'slock' : 'sbuy');
      d.appendChild(b);
      G.appendChild(d);
    }
  }
  function applyTheme() {
    theme.table = TABLES[P.sel.table] ? P.sel.table : 'wood';
    theme.bg = BGS[P.sel.bg] ? P.sel.bg : 'day';
  }

  // ---------- wyniki ----------
  let scoreTab = 'classic';
  function renderScores() {
    const el = $('scores');
    const tabs = [['classic', 'Klasyczny'], ['daily', 'Dnia'], ['time', 'Na czas'], ['challenge', 'Wyzwania'], ['zen', 'Zen']];
    el.innerHTML = `${tbar('Wyniki')}<div class="tabs2"></div><div class="podium"></div><ol class="board2"></ol>
      <div class="stats"><div><b>${fmt(P.stats.games)}</b><small>gier</small></div><div><b>${fmt(P.stats.merges)}</b><small>połączeń</small></div><div><b>${fmt(P.stats.orders)}</b><small>zamówień</small></div></div>`;
    el.querySelector('.back').onclick = back;
    const T = el.querySelector('.tabs2');
    for (const [k, n] of tabs) T.appendChild(btn(n, () => { scoreTab = k; renderScores(); }, scoreTab === k ? 'on' : ''));
    const list = P.scores[scoreTab] || [];
    const pod = el.querySelector('.podium');
    if (!list.length) { pod.innerHTML = '<div class="empty">🍹<br>Jeszcze brak wyników — zagraj!</div>'; return; }
    pod.innerHTML = [1, 0, 2].map(i => list[i] ? `<div class="pod p${i + 1}"><span class="medal">${['🥇', '🥈', '🥉'][i]}</span>
      <b>${escapeHtml(list[i].n)}</b><em>${fmt(list[i].s)}</em><div class="step">${i + 1}</div></div>` : '<div class="pod empty"></div>').join('');
    el.querySelector('.board2').innerHTML = list.slice(3).map((r, i) =>
      `<li><span class="rk">${i + 4}</span><span class="nm">${escapeHtml(r.n)}<small>${r.d}</small></span><b>${fmt(r.s)}</b></li>`).join('');
  }
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- ustawienia ----------
  function toggleRow(icon, label, on, f) {
    const b = btn(`<span class="ti">${icon}</span><span class="tl">${label}</span><span class="sw ${on ? 'on' : ''}"><i></i></span>`, f, 'trow');
    return b;
  }
  function renderSettings() {
    const el = $('settings');
    el.innerHTML = `${tbar('Opcje')}
      <div class="panel"><label class="lab">👤 Imię w wynikach</label><input id="nameIn" maxlength="14" value="${escapeHtml(P.name)}"></div>
      <div class="panel tl2"></div>
      <div class="panel"><div class="pstats">
        <div><span class="cicon"></span><b>${fmt(P.coins)}</b><small>monet</small></div>
        <div>⭐<b>${P.level}</b><small>poziom</small></div>
        <div>🔥<b>${P.streak}</b><small>seria dni</small></div></div></div>`;
    const saveName = () => { P.name = $('nameIn').value.trim() || 'Ty'; saveProfile(); };
    el.querySelector('.back').onclick = () => { saveName(); back(); };
    $('nameIn').onchange = saveName;
    el.querySelector('.tl2').append(
      toggleRow('🔊', 'Dźwięk', P.sound, () => { P.sound = !P.sound; Sfx.enabled = P.sound; saveProfile(); renderSettings(); }),
      toggleRow('📳', 'Wibracje', P.vibe, () => { P.vibe = !P.vibe; vibeEnabled = P.vibe; if (P.vibe) haptic(40); saveProfile(); renderSettings(); }),
      btn('<span class="ti">❓</span><span class="tl">Jak grać</span><span class="chev">›</span>', howTo, 'trow'),
    );
  }
  function howTo() {
    modal(`<h2>Jak grać</h2><div class="how">
      <p>👆 Przesuń palcem, żeby wycelować, puść — strzał.</p>
      <p>🍹 Dwa takie same napoje łączą się w lepszy. Para poziomu <i>n</i> daje 2<sup>n</sup> pkt.</p>
      <p>📋 Zamówienia u góry dają bonus — zrób je, zanim skończy się pasek (szybko = x2).</p>
      <p>✨ Złote napoje dają x3 punktów.</p>
      <p>⚡ Ponad 3 połączenia jednym strzałem = losowy power-up (lewa strona).</p>
      <p>🪨 W dłuższej grze pojawiają się kamienie — znikną same albo od bomby.</p>
      <p>⚠️ Przegrywasz, gdy stos napojów zatrzyma się za przerywaną linią.</p></div>`, [{ t: 'Rozumiem', f: closeModal, cls: 'primary' }]);
  }

  const RENDER = { menu: renderMenu, album: renderAlbum, shop: renderShop, scores: renderScores, settings: renderSettings };

  // ---------- start ----------
  function boot() {
    loadProfile();
    applyTheme();
    Sfx.enabled = P.sound; vibeEnabled = P.vibe;
    const today = dayStr();
    let giftMsg = null;
    if (P.lastOpen !== today) {
      P.lastOpen = today;
      if (!P.gift) P.gift = POWER_KEYS[Math.floor(Math.random() * POWER_KEYS.length)];
      giftMsg = `🎁 Prezent dnia: ${POWERS[P.gift].icon} ${POWERS[P.gift].name} — dostaniesz go na start gry`;
      saveProfile();
    }
    if (window.hasSavedRun()) {
      if (loadGame()) paused = true;
    }
    openMenu();
    if (giftMsg) setTimeout(() => toast(giftMsg), 500);
    if (P.stats.games === 0) setTimeout(howTo, 300);
    window.onBack = () => back();
  }

  return {
    boot, ev, onReach, onRunStart, onGameEnd, pause, resume, openMenu,
    missions: () => run.missions,
    runState: () => run,
    restoreRun: r => { if (r && r.missions) run = Object.assign({ coinsFromMissions: 0, newFound: [] }, r); },
    bestFor: m => P.best[m] || 0,
    get profile() { return P; },
    _code: { makeCode, parseCode },
  };
})();
