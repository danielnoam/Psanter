// The app's own sound: a light piano tone for the hand it plays when the
// piano isn't connected for output, your notes when you play on the
// computer's keyboard, and the metronome. Web Audio, nothing to download.
(function () {
  function create() {
    let ctx = null, master = null;
    const voices = new Map();
    let volume = 0.7;

    function ready() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC({ latencyHint: "interactive" });
        master = ctx.createGain();
        master.gain.value = volume;
        const comp = ctx.createDynamicsCompressor();
        master.connect(comp); comp.connect(ctx.destination);
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

    // A few partials with a fast attack and a pitch-dependent decay: closer
    // to a piano than a single oscillator, and cheap.
    function noteOn(midi, vel = 80) {
      const c = ready(); if (!c) return;
      noteOff(midi, true);
      const t = c.currentTime;
      const v = Math.pow(Math.max(1, vel) / 127, 1.5) * 0.35;
      const out = c.createGain();
      const filter = c.createBiquadFilter();
      filter.type = "lowpass";
      filter.frequency.value = Math.min(16000, freq(midi) * (3 + vel / 20));
      filter.connect(out); out.connect(master);
      const decay = Math.max(0.6, 3.2 - (midi - 21) / 30);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(v, t + 0.005);
      out.gain.setTargetAtTime(v * 0.25, t + 0.01, decay / 3);
      const oscs = [[1, 1, "triangle"], [2, 0.35, "sine"], [3, 0.12, "sine"], [4, 0.05, "sine"]].map(([h, g, type]) => {
        const o = c.createOscillator(); const og = c.createGain();
        o.type = type; o.frequency.value = freq(midi) * h; o.detune.value = h === 1 ? 0 : (h * 1.5);
        og.gain.value = g; o.connect(og); og.connect(filter); o.start(t);
        return o;
      });
      voices.set(midi, { out, oscs });
    }

    function noteOff(midi, now) {
      const v = voices.get(midi); if (!v || !ctx) return;
      voices.delete(midi);
      const t = ctx.currentTime;
      const rel = now ? 0.02 : 0.25;
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setValueAtTime(v.out.gain.value, t);
      v.out.gain.setTargetAtTime(0, t, rel / 3);
      for (const o of v.oscs) o.stop(t + rel + 0.05);
    }

    function allOff() { for (const m of [...voices.keys()]) noteOff(m); }

    function click(accent) {
      const c = ready(); if (!c) return;
      const t = c.currentTime;
      const o = c.createOscillator(), g = c.createGain();
      o.frequency.value = accent ? 1760 : 1320;
      g.gain.setValueAtTime(accent ? 0.5 : 0.3, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
      o.connect(g); g.connect(master); o.start(t); o.stop(t + 0.06);
    }

    function setVolume(x) { volume = Math.max(0, Math.min(1, x)); if (master) master.gain.value = volume; }

    return { noteOn, noteOff, allOff, click, setVolume, unlock: ready };
  }

  window.Piano = window.Piano || {};
  window.Piano.synth = { create };
})();
