// A take: what you played in one run, kept to hear again beside the music
// and to see how your timing and your loud and soft went. Pure apart from
// play(), which schedules through the functions it's given.
(function () {
  const TOLERANCE = 18;

  // Loud and soft against the music's dynamics. hits: [{ vel, want, step }].
  // Your keyboard's touch differs from the music's numbers, so the average
  // gap is taken off first: playing it all a bit louder is fine, losing
  // the difference between p and f isn't. Null when the music has none.
  function dynamics(hits, song) {
    if (!song) return null;
    const vels = song.notes.map((n) => n.vel);
    if (Math.max(...vels) - Math.min(...vels) < 25) return null;
    const list = hits.filter((h) => h.want != null && h.vel > 0);
    if (list.length < 4) return null;
    const shift = list.reduce((sum, h) => sum + h.vel - h.want, 0) / list.length;
    let ok = 0;
    const loud = new Set(), soft = new Set();
    for (const h of list) {
      const d = h.vel - h.want - shift;
      const m = song.steps[h.step] ? song.steps[h.step].measure : 0;
      if (Math.abs(d) <= TOLERANCE) ok++; else if (d > 0) loud.add(m); else soft.add(m);
    }
    const played = list.map((h) => h.vel);
    return { accuracy: Math.round((100 * ok) / list.length), loud: [...loud].sort((a, b) => a - b), soft: [...soft].sort((a, b) => a - b),
      flat: Math.max(...played) - Math.min(...played) < 15 };
  }

  // Your notes on and off, in song time (ms at 100%), into notes.
  function recorder() {
    const open = new Map(), notes = [];
    return {
      on(midi, ms, vel) { if (open.has(midi)) this.off(midi, ms); open.set(midi, { midi, ms, vel }); },
      off(midi, ms) { const n = open.get(midi); if (!n) return; open.delete(midi); notes.push({ ...n, dur: Math.max(30, ms - n.ms) }); },
      done(ms) { for (const m of [...open.keys()]) this.off(m, ms); return notes.sort((a, b) => a.ms - b.ms); },
      get size() { return notes.length + open.size; },
    };
  }

  // Plays a take and, quieter, the music, from song time `from`, at the
  // speed the take was played. sound(midi, on, vel, mine). Returns stop().
  function play({ take, song, from = 0, withMusic = true, sound, onTime, onEnd, now = () => performance.now(), later = setTimeout, cancel = clearTimeout }) {
    const ev = [];
    for (const n of take.notes) if (n.ms >= from) ev.push({ ms: n.ms, midi: n.midi, on: true, vel: n.vel, mine: true }, { ms: n.ms + n.dur, midi: n.midi, on: false, mine: true });
    if (withMusic && song) for (const n of song.notes) if (n.ms >= from && !n.tied) ev.push({ ms: n.ms, midi: n.midi, on: true, vel: Math.round(n.vel * 0.55), mine: false }, { ms: n.ms + n.dur, midi: n.midi, on: false, mine: false });
    ev.sort((a, b) => a.ms - b.ms || (a.on ? 1 : -1));
    const start = now(), speed = take.speed || 1;
    let i = 0, timer = 0, stopped = false;
    const sounding = new Set();
    function tick() {
      if (stopped) return;
      const t = from + (now() - start) * speed;
      while (i < ev.length && ev[i].ms <= t + 5) {
        const e = ev[i++], id = (e.mine ? "m" : "s") + e.midi;
        if (e.on) sounding.add(id); else if (!sounding.delete(id)) continue;
        sound(e.midi, e.on, e.vel, e.mine);
      }
      if (onTime) onTime(t);
      if (i >= ev.length) { stopped = true; if (onEnd) onEnd(); return; }
      timer = later(tick, Math.max(4, Math.min(30, (ev[i].ms - t) / speed - 2)));
    }
    tick();
    return function stop() {
      if (stopped) return; stopped = true; cancel(timer);
      for (const id of sounding) sound(+id.slice(1), false, 0, id[0] === "m");
      sounding.clear();
      if (onEnd) onEnd();
    };
  }

  window.Psanter = window.Psanter || {};
  window.Psanter.takes = { dynamics, recorder, play, TOLERANCE };
})();
