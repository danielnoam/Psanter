// The app's own piano sound: for the hand the app plays when your piano
// isn't its output, your notes when there's no piano, and the metronome.
// Web Audio only, nothing to download. Each note is two slightly detuned
// harmonic tones whose brightness fades as they ring (a piano's filter
// sweep), a short hammer knock, a pitch-dependent two-stage decay, the
// sustain pedal, and a small room.
(function () {
  const MAX_VOICES = 48;

  function create() {
    let ctx = null, master = null, dry = null, wet = null, noise = null, comp = null, tap = null;
    const voices = new Map();
    const waves = new Map();
    let volume = 0.7, pedal = false, roomLevel = 0.16;
    const sustained = new Set();

    function ready() {
      if (!ctx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC({ latencyHint: "interactive" });
        master = ctx.createGain();
        master.gain.value = volume;
        comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14; comp.ratio.value = 4;
        master.connect(comp); comp.connect(ctx.destination);
        dry = ctx.createGain(); dry.connect(master);
        wet = ctx.createGain(); wet.gain.value = roomLevel;
        const verb = ctx.createConvolver();
        verb.buffer = room(1.8);
        wet.connect(verb); verb.connect(master);
        noise = ctx.createBuffer(1, Math.round(ctx.sampleRate * 0.06), ctx.sampleRate);
        const d = noise.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3);
      }
      if (ctx.state === "suspended") ctx.resume();
      return ctx;
    }

    // A small room: stereo noise fading away.
    function room(seconds) {
      const len = Math.round(ctx.sampleRate * seconds);
      const b = ctx.createBuffer(2, len, ctx.sampleRate);
      for (let c = 0; c < 2; c++) {
        const d = b.getChannelData(c);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6) * (i < 400 ? i / 400 : 1);
      }
      return b;
    }

    const freq = (midi) => 440 * Math.pow(2, (midi - 69) / 12);

    // Low notes are rich in partials, high ones nearly pure. One wave per
    // register, built once.
    function wave(midi) {
      const band = Math.max(0, Math.min(7, Math.floor((midi - 21) / 11)));
      if (waves.has(band)) return waves.get(band);
      const n = 16 - band * 2;
      const real = new Float32Array(n + 1), imag = new Float32Array(n + 1);
      for (let h = 1; h <= n; h++) {
        const amp = Math.pow(h, -(1.1 + band * 0.18)) * (h === 1 ? 1 : 0.9) * (1 - 0.35 * Math.sin(h * 0.35 * Math.PI));
        imag[h] = Math.abs(amp);
      }
      const w = ctx.createPeriodicWave(real, imag);
      waves.set(band, w);
      return w;
    }

    function noteOn(midi, vel = 80) {
      const c = ready(); if (!c) return;
      if (voices.has(midi)) stop(midi, 0.03);
      if (voices.size >= MAX_VOICES) stop(voices.keys().next().value, 0.03);
      const t = c.currentTime;
      const f = freq(midi);
      const v = Math.pow(Math.max(1, vel) / 127, 1.6);
      const level = v * 0.32 * (midi > 84 ? 0.8 : 1);
      const out = c.createGain();
      const pan = c.createStereoPanner ? c.createStereoPanner() : null;
      const filter = c.createBiquadFilter();
      filter.type = "lowpass"; filter.Q.value = 0.6;
      const open = Math.min(14000, f * (2.5 + v * 9));
      const shut = Math.min(9000, f * 1.6);
      // How long it rings: long in the bass, short at the top.
      const ring = Math.max(0.45, 5.5 * Math.pow(0.955, midi - 21));
      filter.frequency.setValueAtTime(open, t);
      filter.frequency.setTargetAtTime(shut, t + 0.02, ring / 4);
      out.gain.setValueAtTime(0, t);
      out.gain.linearRampToValueAtTime(level, t + 0.003);
      out.gain.setTargetAtTime(level * 0.45, t + 0.004, 0.09);
      out.gain.setTargetAtTime(0.0001, t + 0.25, ring / 2.2);
      filter.connect(out);
      if (pan) { pan.pan.value = Math.max(-0.35, Math.min(0.35, (midi - 64) / 60)); out.connect(pan); pan.connect(dry); pan.connect(wet); }
      else { out.connect(dry); out.connect(wet); }
      const oscs = [0, 1].map((i) => {
        const o = c.createOscillator();
        o.setPeriodicWave(wave(midi));
        o.frequency.value = f;
        o.detune.value = i ? 0.9 + (midi % 3) * 0.3 : -0.4;
        const g = c.createGain(); g.gain.value = i ? 0.45 : 0.6;
        o.connect(g); g.connect(filter); o.start(t);
        return o;
      });
      // The hammer: a short knock of filtered noise.
      const knock = c.createBufferSource(); knock.buffer = noise;
      const kf = c.createBiquadFilter(); kf.type = "bandpass"; kf.frequency.value = Math.min(9000, f * 3 + 600); kf.Q.value = 0.8;
      const kg = c.createGain(); kg.gain.value = v * 0.18;
      knock.connect(kf); kf.connect(kg); kg.connect(out); knock.start(t);
      voices.set(midi, { out, oscs, end: t + ring * 3 });
      sustained.delete(midi);
    }

    function stop(midi, rel) {
      const v = voices.get(midi); if (!v || !ctx) return;
      voices.delete(midi); sustained.delete(midi);
      const t = ctx.currentTime;
      v.out.gain.cancelScheduledValues(t);
      v.out.gain.setValueAtTime(v.out.gain.value, t);
      v.out.gain.setTargetAtTime(0, t, rel / 3);
      for (const o of v.oscs) o.stop(t + rel + 0.1);
    }

    // The damper comes down unless the pedal holds it.
    function noteOff(midi) {
      if (!voices.has(midi)) return;
      if (pedal) { sustained.add(midi); return; }
      stop(midi, midi > 88 ? 0.5 : 0.22);
    }

    function setPedal(down) {
      pedal = !!down;
      if (!pedal) for (const m of [...sustained]) stop(m, 0.3);
    }

    function allOff() { pedal = false; for (const m of [...voices.keys()]) stop(m, 0.08); }

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
    function setRoom(x) { roomLevel = Math.max(0, Math.min(0.6, x)); if (wet) wet.gain.value = roomLevel; }

    // The app's sound as a stream, for a video of the falling notes.
    function stream() {
      if (!ready()) return null;
      if (!tap) { tap = ctx.createMediaStreamDestination(); comp.connect(tap); }
      return tap.stream;
    }

    return { noteOn, noteOff, allOff, click, setVolume, setRoom, setPedal, stream, unlock: ready };
  }

  window.Piano = window.Piano || {};
  window.Piano.synth = { create };
})();
