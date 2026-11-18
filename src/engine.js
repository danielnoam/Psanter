// The practice engine: where the song is, what it waits for, what the app
// plays for you, and how you did. Pure: it never reads the clock or the
// DOM. The app passes the time into every call and drains the events after
// each one (drain()), so every view moves from the same state and the
// tests can replay a session note by note.
//
// Song time is milliseconds at 100% speed; real time is the clock passed
// in. Each hand is "me" (you play it: asked for and checked), "auto" (the
// app plays it) or "off" (shown, not played).
//
// Wait mode stops the song at each step until every note it asks for is
// down, in any order (a chord is a chord however it's rolled). Flow mode
// never stops: a note you don't play within LATE_MS is a miss.
(function () {
  const EARLY_MS = 250;
  const LATE_MS = 250;
  // A wait mode step that took longer than this (real time) counts as late.
  const SLOW_MS = 600;

  function create(opts = {}) {
    const M = window.Piano.music;
    let song = null;
    let t = 0, playing = false, last = 0, waiting = false, waitSince = 0, preroll = 0, prerollBeat = 0, prerollStep = 0;
    let speed = 1, mode = "wait", metronome = false, countIn = false;
    // How late your notes reach the app after you hear the music (MIDI
    // in, audio out), in real ms: judged as if they came that much sooner.
    let latency = 0;
    let hands = { right: "me", left: "me" };
    let loop = { on: false, from: 0, to: 0 };
    let req = -1, credited = new Set();
    let nextNote = 0, nextBeat = 0, shown = -1, ended = false;
    const autoOn = new Map();
    const held = new Set();
    let queue = [];
    let pass = blankPass(), total = blankPass(), passes = 0;
    const results = new Map();

    function blankPass() { return { hits: 0, late: 0, misses: 0, wrong: 0, offsets: [], startedAt: null }; }
    const emit = (e) => { queue.push(e); };
    const required = (s) => (s ? [...new Set(s.notes.filter((n) => hands[n.hand] === "me" && !n.tied).map((n) => n.midi))] : []);

    function findReq(fromIndex) {
      if (!song) return -1;
      for (let i = Math.max(0, fromIndex); i < song.steps.length; i++) if (required(song.steps[i]).length) return i;
      return -1;
    }

    function load(s) {
      song = s;
      results.clear();
      pass = blankPass(); total = blankPass(); passes = 0;
      loop = { on: false, from: 0, to: s ? s.end : 0 };
      seekTo(0);
    }

    function silenceAuto() {
      for (const midi of autoOn.keys()) emit({ type: "auto", midi, on: false });
      autoOn.clear();
    }

    function seekTo(ms) {
      silenceAuto();
      if (!song) { t = 0; return; }
      t = Math.max(0, Math.min(ms, song.end));
      waiting = false; ended = false; credited.clear();
      req = findReq(firstStepFrom(t));
      nextNote = lowerBound(song.notes, t);
      nextBeat = lowerBound(song.beats, t);
      shown = M.stepAt(song, t);
      emit({ type: "step", index: shown, ms: t });
    }

    // The first step at or after ms.
    function firstStepFrom(ms) { return lowerBound(song.steps, ms); }

    function lowerBound(list, ms) {
      let lo = 0, hi = list.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (list[mid].ms < ms - 0.5) lo = mid + 1; else hi = mid; }
      return lo;
    }

    function play(now) {
      if (!song || playing) return;
      if (ended || t >= song.end) seekTo(loop.on ? loop.from : 0);
      playing = true; last = now;
      if (pass.startedAt == null) pass.startedAt = now;
      preroll = 0;
      if (countIn) {
        const beatMs = beatLength(t);
        prerollBeat = beatMs / speed;
        preroll = prerollBeat * song.beatsPerBar;
        prerollStep = 0;
        emit({ type: "click", accent: true, countIn: true });
      }
      emit({ type: "state", playing: true });
    }

    function beatLength(ms) {
      const i = Math.min(song.beats.length - 2, Math.max(0, lowerBound(song.beats, ms) - 1));
      return song.beats.length > 1 ? song.beats[i + 1].ms - song.beats[i].ms : 600;
    }

    function pause() {
      if (!playing) return;
      playing = false; preroll = 0;
      silenceAuto();
      emit({ type: "state", playing: false });
    }

    function seek(ms) { seekTo(ms); }

    function noteOn(midi, now, vel = 80) {
      held.add(midi);
      emit({ type: "key", midi, on: true, vel });
      if (!song || req < 0) return;
      const s = song.steps[req];
      const need = required(s);
      // Wait mode, stopped: the first note asked for starts the song.
      if (!playing && mode === "wait" && need.includes(midi) && !ended && t <= s.ms + 0.5) {
        cross(s.ms, true);
        t = s.ms;
        play(now);
        preroll = 0;
      }
      if (!playing) return;
      if (preroll > 0) return;
      // Wait mode follows you: the next note asked for counts whenever you
      // play it, and the song catches up. Flow mode keeps to time.
      const heard = t - latency * speed;
      if (need.includes(midi) && !credited.has(midi) && (mode === "wait" || heard >= s.ms - EARLY_MS)) {
        credited.add(midi);
        const offset = waiting ? Math.round(Math.max(0, now - waitSince - latency) * speed) : Math.round(Math.max(heard - s.ms, mode === "wait" ? 0 : -Infinity));
        pass.offsets.push(offset); total.offsets.push(offset);
        const want = s.notes.find((n) => n.midi === midi && hands[n.hand] === "me");
        emit({ type: "hit", midi, step: req, offset, vel, want: want ? want.vel : null, mode, ms: s.ms });
        if (need.every((m) => credited.has(m))) stepDone(now);
        return;
      }
      // Playing along with a hand the app plays, or a note still in the
      // step just passed, isn't a mistake.
      const here = shown >= 0 ? song.steps[shown] : null;
      if (here && here.notes.some((n) => n.midi === midi && hands[n.hand] !== "me")) return;
      pass.wrong++; total.wrong++;
      emit({ type: "wrong", midi, step: req });
    }

    function noteOff(midi) {
      held.delete(midi);
      emit({ type: "key", midi, on: false });
    }

    function stepDone(now) {
      const late = waiting && now - waitSince > SLOW_MS;
      const result = late ? "late" : "hit";
      if (late) { pass.late++; total.late++; } else { pass.hits++; total.hits++; }
      results.set(req, result);
      emit({ type: "done", step: req, result });
      const at = song.steps[req].ms;
      if (t < at) { cross(at); t = at; }
      credited.clear();
      req = findReq(req + 1);
      if (waiting) { waiting = false; emit({ type: "wait", step: -1 }); }
      cross(t);
    }

    function update(now) {
      if (!playing || !song) return drain();
      let dt = Math.max(0, now - last);
      last = now;
      if (preroll > 0) {
        const before = preroll;
        preroll -= dt;
        // A click on each beat of the count-in bar.
        const beatsLeftBefore = Math.ceil(before / prerollBeat - 1e-6);
        const beatsLeftAfter = Math.ceil(Math.max(0, preroll) / prerollBeat - 1e-6);
        for (let b = beatsLeftBefore - 1; b >= Math.max(1, beatsLeftAfter); b--) emit({ type: "click", accent: false, countIn: true });
        if (preroll > 0) return drain();
        dt = -preroll; preroll = 0;
      }
      if (waiting) return drain();
      advance(t + dt * speed, now);
      return drain();
    }

    function advance(target, now) {
      // Loop end and song end bound the move.
      let bound = song.end;
      if (loop.on && loop.to > loop.from) bound = Math.min(bound, loop.to);
      let to = Math.min(target, bound);
      if (mode === "wait" && req >= 0 && song.steps[req].ms <= to) {
        to = song.steps[req].ms;
        cross(to, true);
        t = to;
        if (!waiting) { waiting = true; waitSince = now; emit({ type: "wait", step: req }); }
        return;
      }
      if (mode === "flow") {
        while (req >= 0 && song.steps[req].ms + LATE_MS + latency * speed < to) {
          const missed = required(song.steps[req]).filter((m) => !credited.has(m));
          pass.misses++; total.misses++;
          results.set(req, "miss");
          emit({ type: "miss", step: req, midis: missed });
          credited.clear();
          req = findReq(req + 1);
        }
      }
      cross(to);
      t = to;
      if (t >= bound - 0.01 && target >= bound) {
        if (loop.on && loop.to > loop.from) {
          passes++;
          const done = summary(pass);
          emit({ type: "loop", pass: passes, stats: done, clean: done.misses === 0 && done.wrong === 0 && done.late === 0 });
          pass = blankPass(); pass.startedAt = now;
          seekTo(loop.from);
          const rest = target - bound;
          if (rest > 0 && rest < 1000) advance(t + rest, now);
        } else {
          ended = true;
          silenceAuto();
          playing = false;
          emit({ type: "end", stats: summary(total) });
          emit({ type: "state", playing: false });
        }
      }
    }

    // Everything between t and to: the app's notes, the metronome, the cursor.
    // holding: stop short of the notes at `to` itself, so the hand the app
    // plays sounds with your note, not before it.
    function cross(to, holding) {
      for (const [midi, end] of [...autoOn]) if (end <= to) { autoOn.delete(midi); emit({ type: "auto", midi, on: false }); }
      const noteLimit = holding ? to - 0.5 : to + 0.01;
      while (nextNote < song.notes.length && song.notes[nextNote].ms <= noteLimit) {
        const n = song.notes[nextNote++];
        if (hands[n.hand] !== "auto" || n.tied) continue;
        if (autoOn.has(n.midi)) emit({ type: "auto", midi: n.midi, on: false });
        autoOn.set(n.midi, n.ms + n.dur);
        emit({ type: "auto", midi: n.midi, on: true, vel: n.vel, hand: n.hand });
      }
      while (nextBeat < song.beats.length && song.beats[nextBeat].ms <= to + 0.01) {
        const b = song.beats[nextBeat++];
        if (metronome) emit({ type: "click", accent: b.first });
      }
      const at = M.stepAt(song, to);
      if (at !== shown) { shown = at; emit({ type: "step", index: at, ms: to }); }
    }

    function summary(p) {
      const asked = p.hits + p.late + p.misses;
      const abs = p.offsets.map(Math.abs);
      return { hits: p.hits, late: p.late, misses: p.misses, wrong: p.wrong,
        accuracy: asked + p.wrong ? Math.round(100 * (p.hits + p.late) / (asked + p.wrong)) : 100,
        timing: abs.length ? Math.round(abs.reduce((a, b) => a + b, 0) / abs.length) : 0 };
    }

    function drain() { const q = queue; queue = []; return q; }

    function setHands(h) { hands = { ...hands, ...h }; silenceAuto(); credited.clear(); req = song ? findReq(firstStepFrom(t)) : -1; if (song) nextNote = lowerBound(song.notes, t); waiting = false; }
    function setMode(m) { mode = m === "flow" ? "flow" : "wait"; waiting = false; }
    function setSpeed(s) { speed = Math.max(0.1, Math.min(2, s)); }
    function setLoop(l) {
      loop = { ...loop, ...l };
      if (song) { loop.from = Math.max(0, Math.min(loop.from, song.end)); loop.to = Math.max(loop.from, Math.min(loop.to || song.end, song.end)); }
      if (loop.on && (t < loop.from || t > loop.to)) seekTo(loop.from);
    }

    return {
      load, play, pause, seek, noteOn, noteOff, update, drain,
      setHands, setMode, setSpeed, setLoop,
      setMetronome: (on) => { metronome = !!on; },
      setCountIn: (on) => { countIn = !!on; },
      setLatency: (ms) => { latency = Math.max(0, Math.min(400, +ms || 0)); },
      required: (i) => required(song && song.steps[i]),
      results,
      stats: () => summary(total),
      passStats: () => summary(pass),
      get song() { return song; }, get time() { return t; }, get playing() { return playing; },
      get waiting() { return waiting; }, get speed() { return speed; }, get mode() { return mode; },
      get hands() { return { ...hands }; }, get loop() { return { ...loop }; }, get step() { return shown; },
      get next() { return req; }, get held() { return new Set(held); }, get counting() { return preroll > 0; },
      get metronome() { return metronome; }, get countIn() { return countIn; }, get latency() { return latency; },
    };
  }

  window.Piano = window.Piano || {};
  window.Piano.engine = { create, EARLY_MS, LATE_MS };
})();
