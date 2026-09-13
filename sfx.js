export function createSFX() {
  let ctx = null;
  let master = null;
  let muted = false;
  try { muted = localStorage.getItem('pioneers.sfxMuted') === '1'; } catch (e) {}

  function ensure() {
    if (ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0.55;
    master.connect(ctx.destination);
  }

  function unlock() {
    ensure();
    if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
  }

  function setMuted(m) {
    muted = !!m;
    try { localStorage.setItem('pioneers.sfxMuted', muted ? '1' : '0'); } catch (e) {}
  }
  function isMuted() { return muted; }

  function tone(opts) {
    if (muted || !ctx || !master) return;
    const { type = 'sine', freq = 440, freqEnd, dur = 0.15, vol = 0.2, delay = 0, attack = 0.005 } = opts;
    const t0 = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (freqEnd) osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(vol, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
  }

  function noise(opts) {
    if (muted || !ctx || !master) return;
    const { dur = 0.2, vol = 0.2, freq = 1000, freqEnd, q = 1, type = 'lowpass', delay = 0 } = opts;
    const t0 = ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.setValueAtTime(Math.max(1, freq), t0);
    if (freqEnd) f.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), t0 + dur);
    f.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t0);
    src.stop(t0 + dur + 0.03);
  }

  const sfx = {
    unlock, setMuted, isMuted,
    click() { tone({ type: 'square', freq: 680, freqEnd: 900, dur: 0.05, vol: 0.07 }); },
    ui() { tone({ type: 'triangle', freq: 520, freqEnd: 780, dur: 0.07, vol: 0.09 }); },
    place() { tone({ type: 'triangle', freq: 320, freqEnd: 480, dur: 0.09, vol: 0.15 }); },
    build() { tone({ type: 'sine', freq: 150, freqEnd: 90, dur: 0.16, vol: 0.26 }); noise({ dur: 0.05, vol: 0.09, freq: 1800, freqEnd: 400, type: 'highpass' }); },
    city() { tone({ type: 'sine', freq: 110, freqEnd: 70, dur: 0.22, vol: 0.3 }); tone({ type: 'triangle', freq: 660, freqEnd: 990, dur: 0.14, vol: 0.12, delay: 0.02 }); noise({ dur: 0.06, vol: 0.08, freq: 1200, freqEnd: 300, type: 'highpass' }); },
    ship() { noise({ dur: 0.25, vol: 0.15, freq: 2400, freqEnd: 300, type: 'bandpass', q: 0.7 }); tone({ type: 'sine', freq: 220, freqEnd: 330, dur: 0.12, vol: 0.07, delay: 0.05 }); },
    dice() {
      for (let i = 0; i < 7; i++) noise({ dur: 0.04, vol: 0.11, freq: 2500 + Math.random() * 1500, freqEnd: 600, type: 'highpass', delay: i * 0.045 });
      tone({ type: 'sine', freq: 120, freqEnd: 70, dur: 0.14, vol: 0.2, delay: 0.32 });
      tone({ type: 'square', freq: 880, dur: 0.05, vol: 0.06, delay: 0.36 });
    },
    trade() { tone({ type: 'sine', freq: 1568, dur: 0.09, vol: 0.12 }); tone({ type: 'sine', freq: 2093, dur: 0.12, vol: 0.12, delay: 0.09 }); },
    card() { tone({ type: 'triangle', freq: 880, freqEnd: 1320, dur: 0.1, vol: 0.13 }); tone({ type: 'triangle', freq: 1320, freqEnd: 1760, dur: 0.08, vol: 0.08, delay: 0.07 }); },
    steal() { tone({ type: 'square', freq: 990, dur: 0.06, vol: 0.08 }); tone({ type: 'square', freq: 660, dur: 0.09, vol: 0.08, delay: 0.08 }); },
    robber() { tone({ type: 'sawtooth', freq: 110, freqEnd: 60, dur: 0.28, vol: 0.15 }); noise({ dur: 0.22, vol: 0.11, freq: 500, freqEnd: 120, type: 'lowpass' }); },
    undo() { tone({ type: 'triangle', freq: 520, freqEnd: 360, dur: 0.09, vol: 0.11 }); },
    error() { tone({ type: 'square', freq: 196, dur: 0.1, vol: 0.09 }); tone({ type: 'square', freq: 147, dur: 0.14, vol: 0.09, delay: 0.11 }); },
    knight() { tone({ type: 'square', freq: 740, dur: 0.06, vol: 0.09 }); tone({ type: 'square', freq: 990, dur: 0.12, vol: 0.09, delay: 0.06 }); noise({ dur: 0.08, vol: 0.06, freq: 3000, type: 'highpass', delay: 0.05 }); },
    improve() { tone({ type: 'sawtooth', freq: 330, freqEnd: 660, dur: 0.16, vol: 0.09 }); },
    progress() { for (let i = 0; i < 4; i++) tone({ type: 'triangle', freq: 880 + i * 330, dur: 0.06, vol: 0.09, delay: i * 0.05 }); },
    notify() { tone({ type: 'sine', freq: 587, dur: 0.16, vol: 0.08 }); },
    turn() { tone({ type: 'sine', freq: 659, dur: 0.12, vol: 0.15 }); tone({ type: 'sine', freq: 880, dur: 0.16, vol: 0.15, delay: 0.12 }); tone({ type: 'sine', freq: 1175, dur: 0.24, vol: 0.15, delay: 0.26 }); },
    attention() { tone({ type: 'triangle', freq: 784, dur: 0.1, vol: 0.14 }); tone({ type: 'triangle', freq: 1047, dur: 0.14, vol: 0.14, delay: 0.11 }); tone({ type: 'triangle', freq: 784, dur: 0.1, vol: 0.12, delay: 0.26 }); },
    victory() {
      const seq = [523, 659, 784, 1047];
      for (let i = 0; i < seq.length; i++) tone({ type: 'triangle', freq: seq[i], dur: 0.16, vol: 0.17, delay: i * 0.13 });
      tone({ type: 'triangle', freq: 1319, dur: 0.4, vol: 0.15, delay: 0.52 });
    },
  };
  return sfx;
}
