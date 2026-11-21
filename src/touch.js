// What comes from the piano before the app hears it: how hard a press
// counts (touch response), presses too light to count, the same key twice
// from one keyboard listed as two ports, and the time it took to reach us.
// Pure apart from the clock passed in.
(function () {
  // How a press maps to loudness. Light: a soft touch counts louder (a
  // stiff keyboard, or a light player); heavy: the other way.
  const CURVES = { light: 0.65, normal: 1, heavy: 1.5 };
  const DOUBLE_MS = 40;

  function shape(vel, curve) {
    if (curve === "fixed") return 80;
    const k = CURVES[curve] || 1;
    return Math.max(1, Math.min(127, Math.round(127 * Math.pow(vel / 127, k))));
  }

  // opts() → { curve, floor, doubles }. input() returns the velocity to use,
  // or null when the note (and its matching release) is dropped.
  function filter(opts) {
    const down = new Map(); // midi → time of the press that counted
    const swallow = new Map(); // midi → releases still to drop
    return {
      input(midi, on, vel, at) {
        const o = opts();
        if (on) {
          const last = down.get(midi);
          const twice = o.doubles !== false && last != null && at - last < DOUBLE_MS;
          if (twice || vel < (o.floor || 0)) { swallow.set(midi, (swallow.get(midi) || 0) + 1); return null; }
          down.set(midi, at);
          return shape(vel, o.curve);
        }
        const n = swallow.get(midi) || 0;
        if (n) { if (n > 1) swallow.set(midi, n - 1); else swallow.delete(midi); return null; }
        down.delete(midi);
        return 0;
      },
      reset() { down.clear(); swallow.clear(); },
    };
  }

  // Windows lists one keyboard as several ports: "MIDIIN2 (Roland FP-30)",
  // "2- Roland FP-30", "Roland FP-30 MIDI 1". One name for all of them.
  function deviceName(name) {
    let n = String(name || "").trim();
    const wrapped = /^MIDIIN\d*\s*\((.*)\)$/i.exec(n) || /^MIDIOUT\d*\s*\((.*)\)$/i.exec(n);
    if (wrapped) n = wrapped[1];
    n = n.replace(/^\d+\s*-\s*/, "").replace(/\s+(MIDI|Port)\s*\d*$/i, "").replace(/\s+\d+$/, "").trim();
    return n || "MIDI device";
  }

  // The last few delays between a key's message arriving and the app
  // handling it.
  function delays(size = 32) {
    const list = [];
    return {
      add(ms) { if (Number.isFinite(ms) && ms >= 0 && ms < 1000) { list.push(ms); if (list.length > size) list.shift(); } },
      get count() { return list.length; },
      average() { return list.length ? list.reduce((a, b) => a + b, 0) / list.length : null; },
      worst() { return list.length ? Math.max(...list) : null; },
    };
  }

  window.Psanter = window.Psanter || {};
  window.Psanter.touch = { shape, filter, deviceName, delays, CURVES, DOUBLE_MS };
})();
