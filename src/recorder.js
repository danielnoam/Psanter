// Records what you play (with the sustain pedal held as longer notes) and
// hands it back as notes for midifile.write().
(function () {
  function create() {
    let start = 0, on = false, pedal = false, trim = true;
    let notes = [];
    const open = new Map();   // midi → note still held
    const sustained = new Set(); // released while the pedal was down

    function note(midi, down, vel, now) {
      if (!on) return;
      const ms = now - start;
      if (down) {
        close(midi, ms);
        const n = { midi, ms, dur: 0, vel: vel || 80 };
        notes.push(n); open.set(midi, n);
      } else if (open.has(midi)) {
        if (pedal) sustained.add(midi); else close(midi, ms);
      }
    }
    function close(midi, ms) {
      const n = open.get(midi); if (!n) return;
      n.dur = Math.max(10, ms - n.ms); open.delete(midi); sustained.delete(midi);
    }
    function setPedal(down, now) {
      pedal = down;
      if (!down && on) for (const m of [...sustained]) close(m, now - start);
    }

    return {
      // keepStart: times from start(), not from the first note (a layer
      // played over an earlier one keeps its place).
      start(now, { keepStart = false } = {}) { start = now; on = true; trim = !keepStart; notes = []; open.clear(); sustained.clear(); },
      note, setPedal,
      // The notes, starting at the first one played (or at start()).
      stop(now) {
        if (!on) return [];
        for (const m of [...open.keys()]) close(m, now - start);
        on = false;
        const first = trim && notes.length ? notes[0].ms : 0;
        return notes.map((n) => ({ ...n, ms: n.ms - first }));
      },
      get recording() { return on; },
      elapsed: (now) => (on ? now - start : 0),
    };
  }

  window.Psanter = window.Psanter || {};
  window.Psanter.recorder = { create };
})();
