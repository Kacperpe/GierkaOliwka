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
  function renderMenu() {
    const el = $('menu');
    el.innerHTML = `${header()}<h1>${CFG.title || 'Gierka Oliwka'}</h1><div class="list"></div><div class="grid4"></div>`;
    const L = el.querySelector('.list'), G = el.querySelector('.grid4');
    if (runActive && !gameOver) L.appendChild(btn(`▶ Kontynuuj <small>${MODES[mode].name} · ${fmt(score)} pkt</small>`, resume, 'primary'));
    L.appendChild(btn('🍹 Graj <small>Klasyczny</small>', () => newRun({ mode: 'classic' }), runActive ? '' : 'primary'));
    const db = P.daily.date === dayStr() ? P.daily.best : 0;
    L.appendChild(btn(`📅 Wyzwanie dnia <small>${db ? 'dziś: ' + fmt(db) : 'ten sam układ dla wszystkich'}</small>`, () => newRun({ mode: 'daily', seed: dailySeed() })));
    L.appendChild(btn(`⏱ Na czas <small>60 s · rekord ${fmt(P.best.time || 0)}</small>`, () => newRun({ mode: 'time' })));
    L.appendChild(btn('🧘 Zen <small>bez przegranej</small>', () => newRun({ mode: 'zen' })));
    L.appendChild(btn('🎯 Kod wyzwania <small>pobij czyjś wynik</small>', enterCode));
    G.append(
      btn('📖<small>Kolekcja</small>', () => go('album', renderAlbum)),
      btn('🛍️<small>Sklep</small>', () => go('shop', renderShop)),
      btn('🏆<small>Wyniki</small>', () => go('scores', renderScores)),
      btn('⚙️<small>Opcje</small>', () => go('settings', renderSettings)),
    );
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

  function pause() {
    paused = true; aiming = false; saveGame();
    stack = ['pause'];
    const el = $('pause');
    el.innerHTML = `<h2>Pauza</h2><div class="missions">${missionsHtml()}</div><div class="list"></div>`;
    const L = el.querySelector('.list');
    L.append(
      btn('▶ Wznów', resume, 'primary'),
      btn('🔄 Od nowa', () => newRun({ mode: run.mode || mode, seed: mode === 'daily' ? dailySeed() : undefined, target: run.target })),
      btn('🏠 Menu', openMenu),
    );
    show('pause'); Sfx.click();
  }
  function resume() { hideAll(); if (runActive && !gameOver) { paused = false; last = performance.now(); } }

  function missionsHtml() {
    return run.missions.map(m => `<div class="mis ${m.done ? 'done' : ''}">
      <span>${m.done ? '✅' : '⬜'} ${m.text}</span><em>${m.k === 'score' ? fmt(m.prog) + '/' + fmt(m.need) : m.prog + '/' + m.need} · ${m.reward}💰</em></div>`).join('');
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
    const need = xpNeed(P.level);
    let extra = '';
    if (info.target) extra = info.score > info.target
      ? `<p class="win">🏆 Pobity cel ${fmt(info.target)}!</p>` : `<p>Cel: ${fmt(info.target)} — zabrakło ${fmt(info.target - info.score)}</p>`;
    if (m === 'daily') extra += `<p>Najlepszy dziś: <b>${fmt(P.daily.best)}</b></p>`;
    el.innerHTML = `<h2>${info.title}</h2>
      <div class="score">${fmt(info.score)}</div>
      ${isRecord && info.score > 0 ? '<div class="rec">🎉 Nowy rekord!</div>' : `<p>Rekord: ${fmt(P.best[m] || 0)}</p>`}
      ${extra}
      <div class="gain"><span>💰 +${coins + run.coinsFromMissions}</span><span>⭐ +${fmt(xp)} XP</span></div>
      <div class="lvl wide"><span>Poz. ${P.level}${P.level > oldLevel ? ' ⬆️' : ''}</span><div class="bar"><i style="width:${Math.min(100, P.xp / need * 100)}%"></i></div></div>
      <div class="missions">${missionsHtml()}</div>
      <div class="list"></div>`;
    const L = el.querySelector('.list');
    L.append(
      btn('🔄 Jeszcze raz', () => newRun({ mode: run.mode || m, seed: m === 'daily' ? dailySeed() : (m === 'challenge' ? run.seed : undefined), target: run.target }), 'primary'),
      btn('📣 Wyzwij kogoś', () => shareChallenge(info)),
      btn('🏠 Menu', openMenu),
    );
    stack = ['results']; show('results');
    if (P.level > oldLevel) setTimeout(() => { toast(`⬆️ Poziom ${P.level}! <b>+${100 * (P.level - oldLevel)} 💰</b>`); Sfx.levelup(); }, 500);
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
    el.innerHTML = `<div class="top"><button class="back">←</button><h2>Kolekcja</h2></div>
      <p class="sub">${P.found.length}/${MAX_LV} napojów · ${P.secrets.length}/${(CFG.secrets || []).length} sekretów</p><div class="cards"></div>`;
    el.querySelector('.back').onclick = back;
    const C = el.querySelector('.cards');
    for (let lv = 1; lv <= MAX_LV; lv++) {
      const has = P.found.includes(lv);
      const d = document.createElement('div'); d.className = 'acard' + (has ? '' : ' locked');
      d.appendChild(iconCanvas(lv, 64, has ? 1 : .15));
      const t = document.createElement('div');
      t.innerHTML = has ? `<b>${LEVELS[lv - 1].name}</b><small>${DESC[lv - 1]}</small><em>Poziom ${lv} · ${mergePoints(lv)} pkt za parę</em>`
        : `<b>???</b><small>Połącz dwa napoje poziomu ${lv - 1}, żeby odkryć.</small>`;
      d.appendChild(t); C.appendChild(d);
    }
    for (const sc of CFG.secrets || []) {
      const has = P.secrets.includes(sc.id);
      const d = document.createElement('div'); d.className = 'acard secret' + (has ? '' : ' locked');
      d.innerHTML = `<div class="sic">${has ? '🎁' : '🔒'}</div><div><b>${has ? sc.title : 'Sekret'}</b><small>${has ? sc.message : sc.how}</small></div>`;
      if (has) d.onclick = () => modal(`<div class="big">🎁</div><h2>${sc.title}</h2><p class="msg">${sc.message}</p>`, [{ t: 'Zamknij', f: closeModal }]);
      C.appendChild(d);
    }
  }

  // ---------- sklep ----------
  function preview(item) {
    if (item.cat === 'bg') {
      const B = BGS[item.id];
      return `background:linear-gradient(${B.sky[0]} 0%,${B.sky[1]} 35%,${B.sea[1]} 55%,${B.sand[0]} 70%,${B.sand[1]} 100%)`;
    }
    const T = TABLES[item.id];
    return `background:radial-gradient(ellipse at 50% 45%,${T.top[1]} 0%,${T.top[0]} 45%,${T.inner} 50%,${T.frame[0]} 56%,${T.frame[1]} 100%)`;
  }
  function renderShop() {
    const el = $('shop');
    el.innerHTML = `<div class="top"><button class="back">←</button><h2>Sklep</h2><div class="pill">💰 ${fmt(P.coins)}</div></div>
      <h3>Stoły</h3><div class="shop" data-cat="table"></div><h3>Tła</h3><div class="shop" data-cat="bg"></div>`;
    el.querySelector('.back').onclick = back;
    for (const it of SHOP) {
      const own = P.owned[it.cat].includes(it.id), sel = P.sel[it.cat] === it.id;
      const locked = it.lvl && P.level < it.lvl;
      const name = (it.cat === 'bg' ? BGS : TABLES)[it.id].name;
      const d = document.createElement('div'); d.className = 'sitem' + (sel ? ' sel' : '');
      d.innerHTML = `<div class="prev" style="${preview(it)}"></div><b>${name}</b>`;
      let label = sel ? '✔ Wybrany' : own ? 'Wybierz' : locked ? `🔒 Poz. ${it.lvl}` : `💰 ${fmt(it.price)}`;
      const b = btn(label, () => {
        if (sel) return;
        if (own) { P.sel[it.cat] = it.id; }
        else if (locked) { toast(`Odblokujesz na poziomie ${it.lvl}`); return; }
        else if (P.coins < it.price) { toast(`Brakuje ${fmt(it.price - P.coins)} 💰`); return; }
        else { P.coins -= it.price; P.owned[it.cat].push(it.id); P.sel[it.cat] = it.id; Sfx.coin(); toast(`Kupiono: ${name}!`); }
        saveProfile(); applyTheme(); renderShop();
      }, own || sel ? '' : 'buy');
      d.appendChild(b);
      el.querySelector(`[data-cat="${it.cat}"]`).appendChild(d);
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
    el.innerHTML = `<div class="top"><button class="back">←</button><h2>Wyniki</h2></div><div class="tabs"></div><ol class="board"></ol>
      <p class="sub">Gra ${P.stats.games} razy · ${fmt(P.stats.merges)} połączeń · ${fmt(P.stats.orders)} zamówień</p>`;
    el.querySelector('.back').onclick = back;
    const T = el.querySelector('.tabs');
    for (const [k, n] of tabs) {
      const b = btn(n, () => { scoreTab = k; renderScores(); }, scoreTab === k ? 'on' : '');
      T.appendChild(b);
    }
    const list = P.scores[scoreTab] || [];
    el.querySelector('.board').innerHTML = list.length
      ? list.map((r, i) => `<li><span>${['🥇', '🥈', '🥉'][i] || (i + 1) + '.'} ${escapeHtml(r.n)}</span><b>${fmt(r.s)}</b><small>${r.d}</small></li>`).join('')
      : '<li class="empty">Jeszcze brak wyników — zagraj!</li>';
  }
  const escapeHtml = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  // ---------- ustawienia ----------
  function renderSettings() {
    const el = $('settings');
    el.innerHTML = `<div class="top"><button class="back">←</button><h2>Opcje</h2></div>
      <label class="row">Imię w wynikach <input id="nameIn" maxlength="14" value="${escapeHtml(P.name)}"></label>
      <div class="list"></div>
      <p class="sub">Monety: ${fmt(P.coins)} · Poziom ${P.level} · Seria ${P.streak} dni</p>`;
    el.querySelector('.back').onclick = () => { P.name = $('nameIn').value.trim() || 'Ty'; saveProfile(); back(); };
    $('nameIn').onchange = () => { P.name = $('nameIn').value.trim() || 'Ty'; saveProfile(); };
    const L = el.querySelector('.list');
    L.append(
      btn(`🔊 Dźwięk: <b>${P.sound ? 'włączony' : 'wyłączony'}</b>`, () => { P.sound = !P.sound; Sfx.enabled = P.sound; saveProfile(); renderSettings(); }),
      btn(`📳 Wibracje: <b>${P.vibe ? 'włączone' : 'wyłączone'}</b>`, () => { P.vibe = !P.vibe; vibeEnabled = P.vibe; if (P.vibe) haptic(40); saveProfile(); renderSettings(); }),
      btn('❓ Jak grać', howTo),
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
