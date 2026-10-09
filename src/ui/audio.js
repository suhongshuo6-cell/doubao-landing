/**
 * 极简环境音：低频 pad + 交互音点。必须由用户手势开启（浏览器策略）。
 */
export function createAudio() {
  let ctx = null, master = null, pad = null, started = false;

  function ensure() {
    if (ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    return true;
  }

  function buildPad() {
    const g = ctx.createGain();
    g.gain.value = 0.16;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 420;
    filter.Q.value = 0.8;

    const freqs = [55, 82.4, 110, 164.8, 220];
    for (let i = 0; i < freqs.length; i++) {
      const o = ctx.createOscillator();
      o.type = i % 2 ? 'triangle' : 'sine';
      o.frequency.value = freqs[i];
      o.detune.value = (i - 2) * 6;
      const og = ctx.createGain();
      og.gain.value = 0.22 / (i + 1);
      // 慢速 LFO 让 pad 有呼吸
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.04 + i * 0.017;
      const lg = ctx.createGain();
      lg.gain.value = 0.09 / (i + 1);
      lfo.connect(lg).connect(og.gain);
      lfo.start();
      o.connect(og).connect(filter);
      o.start();
    }
    filter.connect(g).connect(master);
    pad = g;
  }

  return {
    get enabled() { return started; },
    async enable() {
      if (!ensure()) return false;
      if (ctx.state === 'suspended') await ctx.resume();
      if (!pad) buildPad();
      started = true;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(0.5, ctx.currentTime + 1.6);
      return true;
    },
    disable() {
      if (!ctx) return;
      started = false;
      master.gain.cancelScheduledValues(ctx.currentTime);
      master.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
    },
    /** 捏脸 / 点击的轻音点 */
    blip(freq = 620, dur = 0.16, type = 'sine', vol = 0.18) {
      if (!started || !ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = type;
      o.frequency.setValueAtTime(freq, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(freq * 0.6, ctx.currentTime + dur);
      g.gain.setValueAtTime(0, ctx.currentTime);
      g.gain.linearRampToValueAtTime(vol, ctx.currentTime + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
      o.connect(g).connect(master);
      o.start();
      o.stop(ctx.currentTime + dur + 0.02);
    },
    /** 蜕变时的上扬音 */
    swell() {
      if (!started || !ctx) return;
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(90, ctx.currentTime);
      o.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 1.1);
      g.gain.setValueAtTime(0.0001, ctx.currentTime);
      g.gain.linearRampToValueAtTime(0.09, ctx.currentTime + 0.25);
      g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.3);
      const f = ctx.createBiquadFilter();
      f.type = 'bandpass';
      f.frequency.value = 900;
      f.Q.value = 3.5;
      o.connect(f).connect(g).connect(master);
      o.start();
      o.stop(ctx.currentTime + 1.35);
    }
  };
}
