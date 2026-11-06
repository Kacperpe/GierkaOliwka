'use strict';
// ===== Dźwięki (syntezowane Web Audio — bez plików) i wibracje =====
const Sfx = (() => {
  let ac = null, master = null, enabled = true;
  const last = {};

  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    try {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = 0.55; master.connect(ac.destination);
    } catch (e) { ac = null; }
  }
  // pierwszy dotyk odblokowuje audio
  addEventListener('pointerdown', init, { capture: true });

  function throttle(key, ms) {
    const n = performance.now();
    if (last[key] && n - last[key] < ms) return false;
    last[key] = n; return true;
  }

  function tone(freq, dur, { type = 'sine', vol = .3, slide = 0, delay = 0, attack = .005 } = {}) {
    if (!enabled || !ac) return;
    const t = ac.currentTime + delay;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * slide), t + dur);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(master);
    o.start(t); o.stop(t + dur + .02);
  }

  function noise(dur, { vol = .3, freq = 1200, q = 1, type = 'bandpass', slide = 0, delay = 0 } = {}) {
    if (!enabled || !ac) return;
    const t = ac.currentTime + delay;
    const len = Math.max(1, Math.floor(ac.sampleRate * dur));
    const buf = ac.createBuffer(1, len, ac.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const s = ac.createBufferSource(); s.buffer = buf;
    const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (slide) f.frequency.exponentialRampToValueAtTime(Math.max(40, freq * slide), t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(master);
    s.start(t);
  }

  const NOTES = [523.25, 587.33, 659.25, 783.99, 880, 1046.5, 1174.7, 1318.5, 1568, 1760, 2093];

  return {
    init,
    set enabled(v) { enabled = v; },
    get enabled() { return enabled; },
    shot()   { noise(.18, { vol: .25, freq: 900, slide: 2.5, q: .8 }); },
    clink(power = .5) {
      if (!throttle('clink', 45)) return;
      const f = 2200 + Math.random() * 1400;
      tone(f, .12, { type: 'triangle', vol: .08 + .14 * power });
      tone(f * 1.5, .08, { type: 'sine', vol: .05 * power });
    },
    merge(lv, combo = 1) {
      const base = NOTES[Math.min(NOTES.length - 1, lv - 1 + Math.min(4, combo - 1))];
      tone(base, .22, { type: 'triangle', vol: .22 });
      tone(base * 1.5, .25, { type: 'sine', vol: .14, delay: .05 });
      noise(.08, { vol: .12, freq: 3000, q: 2 });
    },
    gold()   { [0, .06, .12, .18].forEach((d, i) => tone(1318 * Math.pow(1.26, i), .25, { type: 'sine', vol: .15, delay: d })); },
    coin()   { tone(988, .08, { type: 'square', vol: .08 }); tone(1319, .25, { type: 'square', vol: .08, delay: .07 }); },
    order()  { [0, .08, .16].forEach((d, i) => tone([784, 988, 1175][i], .2, { type: 'triangle', vol: .18, delay: d })); },
    power()  { [0, .07, .14, .21, .28].forEach((d, i) => tone(660 * Math.pow(1.19, i), .2, { type: 'triangle', vol: .16, delay: d })); },
    boom()   { noise(.7, { vol: .6, freq: 400, slide: .15, type: 'lowpass', q: .7 }); tone(90, .5, { type: 'sine', vol: .4, slide: .4 }); },
    zap()    { for (let i = 0; i < 4; i++) noise(.09, { vol: .25, freq: 2500 + Math.random() * 2000, q: 6, delay: i * .05 }); tone(1800, .3, { type: 'sawtooth', vol: .06, slide: .2 }); },
    whoosh() { noise(.6, { vol: .3, freq: 500, slide: 4, q: .6 }); },
    magnet() { tone(110, .9, { type: 'sawtooth', vol: .05, slide: 1.6 }); tone(220, .9, { type: 'sine', vol: .08, slide: 1.6 }); },
    swap()   { tone(500, .1, { vol: .15 }); tone(750, .12, { vol: .15, delay: .08 }); },
    tick()   { tone(1500, .04, { type: 'square', vol: .05 }); },
    miss()   { tone(300, .2, { type: 'triangle', vol: .12, slide: .6 }); },
    unlock() { [0, .1, .2, .32].forEach((d, i) => tone([523, 659, 784, 1047][i], .35, { type: 'triangle', vol: .2, delay: d })); },
    levelup(){ [0, .09, .18, .27, .4].forEach((d, i) => tone([523, 659, 784, 1047, 1319][i], .3, { type: 'square', vol: .08, delay: d })); },
    over()   { [0, .18, .36].forEach((d, i) => tone([392, 330, 262][i], .4, { type: 'triangle', vol: .2, delay: d })); },
    click()  { tone(900, .05, { type: 'triangle', vol: .12 }); },
  };
})();

let vibeEnabled = true;
function haptic(ms) {
  if (!vibeEnabled) return;
  try {
    if (window.Android && Android.vibrate) Android.vibrate(Math.round(ms));
    else if (navigator.vibrate) navigator.vibrate(Math.round(ms));
  } catch (e) {}
}
