// A practice session: one piece or exercise in the engine, drawn in the
// score, the falling notes and the timeline, with your notes coming in and
// the app's notes going out. app.js builds the screen around it.
(function () {
  function create({ scoreEl, rollCanvas, timelineCanvas, midi, synth, settings, onChange, onEvent }) {
    const P = window.Piano;
    const engine = P.engine.create();
    const roll = P.roll.create(rollCanvas);
    const timeline = P.timeline.create(timelineCanvas, {
      onSeek: (ms) => { engine.seek(ms); if (engine.loop.on && (ms < engine.loop.from || ms >= engine.loop.to)) engine.setLoop({ on: false }); handle(engine.drain()); changed(); },
      onLoop: (from, to) => { engine.setLoop({ on: true, from, to }); handle(engine.drain()); changed(); },
    });
    let score = P.score.none(scoreEl, "");
    let target = null, song = null, raf = 0, dirty = true;
    const held = new Map(); // midi → "me" | "wrong" | "good" | "auto-left" | "auto-right"
    const mine = new Set(); // keys you're holding
    let lastResult = null;

    function changed() { dirty = true; kick(); if (onChange) onChange(state()); }

    function state() {
      return {
        target, song, playing: engine.playing, waiting: engine.waiting, counting: engine.counting, t: engine.time,
        speed: engine.speed, mode: engine.mode, hands: engine.hands, loop: engine.loop, metronome: engine.metronome,
        countIn: engine.countIn, next: engine.next, expected: song ? engine.required(engine.next) : [], lastResult,
        stats: engine.stats(), bar: song && engine.step >= 0 ? song.steps[engine.step].measure : 0,
      };
    }

    // target: { kind: "abc" | "musicxml" | "mxl" | "midi", data, title, opts }
    async function load(t) {
      stopSound();
      engine.pause(); engine.drain();
      score.destroy();
      const onClick = (ms) => { engine.seek(ms); handle(engine.drain()); changed(); };
      if (t.kind === "abc") score = P.score.abc(scoreEl, onClick);
      else if (t.kind === "musicxml" || t.kind === "mxl") score = P.score.musicxml(scoreEl, onClick);
      else score = P.score.none(scoreEl, t.message || "");
      let s;
      if (t.kind === "midi") { await score.load(); s = P.midifile.parse(t.data, t.title); }
      else s = await score.load(t.data, { title: t.title });
      if (!s || !s.notes.length) throw new Error("no notes to play in this piece");
      target = t; song = s;
      if (t.opts && t.opts.transpose) song = P.music.transpose(song, t.opts.transpose);
      engine.load(song);
      roll.setSong(song); timeline.setSong(song);
      applyOptions(t.opts || {});
      lastResult = null;
      handle(engine.drain());
      changed();
      return song;
    }

    function songBpm() { return song && song.tempo.length ? song.tempo[0].bpm : 100; }

    function applyOptions(o) {
      const hands = o.hands === "right" ? { right: "me", left: "auto" } : o.hands === "left" ? { right: "auto", left: "me" } : { right: "me", left: "me" };
      engine.setHands(hands);
      engine.setMode(o.mode || settings.get("mode") || "wait");
      let speed = 1;
      if (o.speed) speed = o.speed;
      else if (o.tempo) speed = o.tempo / songBpm();
      engine.setSpeed(Math.round(Math.max(0.25, Math.min(1.5, speed)) * 100) / 100);
      engine.setMetronome(o.metronome != null ? o.metronome : !!settings.get("metronome"));
      engine.setCountIn(!!settings.get("countIn"));
      if (o.bars && song.bars.length) {
        const a = Math.max(0, o.bars[0] - 1), b = Math.min(song.bars.length - 1, o.bars[1] - 1);
        engine.setLoop({ on: true, from: song.bars[a], to: song.bars[b + 1] != null ? song.bars[b + 1] : song.end });
      } else if (o.loop) engine.setLoop({ on: true, from: 0, to: song.end });
    }

    // Your notes, from the piano, the computer's keyboard or the mouse.
    function noteIn(m, on, vel, now, source) {
      if (on) {
        mine.add(m);
        held.set(m, "me");
        if (source !== "midi" || settings.get("echo")) synth.noteOn(m, vel);
        engine.noteOn(m, now, vel);
      } else {
        mine.delete(m);
        if (held.get(m) && !String(held.get(m)).startsWith("auto")) held.delete(m);
        if (source !== "midi" || settings.get("echo")) synth.noteOff(m);
        engine.noteOff(m);
      }
      handle(engine.drain());
      dirty = true; kick();
    }

    function handle(events) {
      let ui = false;
      for (const e of events) {
        if (onEvent) onEvent(e);
        switch (e.type) {
          case "auto":
            if (e.on) {
              if (!midi.send(e.midi, true, e.vel)) synth.noteOn(e.midi, Math.round((e.vel || 80) * (settings.get("autoVolume") ?? 0.8)));
              if (!mine.has(e.midi)) held.set(e.midi, "auto-" + (e.hand || "right"));
            } else {
              if (!midi.send(e.midi, false)) synth.noteOff(e.midi);
              if (!mine.has(e.midi)) held.delete(e.midi);
            }
            break;
          case "step": score.show(e.index); break;
          case "done":
            score.mark(e.step, e.result);
            for (const m of mine) if (song.steps[e.step].notes.some((n) => n.midi === m)) held.set(m, "good");
            break;
          case "miss": score.mark(e.step, "miss"); break;
          case "wrong": held.set(e.midi, "wrong"); break;
          case "click": synth.click(e.accent); break;
          case "loop":
            lastResult = { kind: "pass", ...e.stats, pass: e.pass, clean: e.clean };
            score.clearMarks(); engine.results.clear();
            ui = true; break;
          case "end": lastResult = { kind: "end", ...e.stats }; ui = true; break;
          case "state": case "wait": ui = true; break;
        }
      }
      if (ui) changed();
    }

    function stopSound() { midi.allOff(); synth.allOff(); for (const [m, k] of [...held]) if (String(k).startsWith("auto")) held.delete(m); }

    function frame(now) {
      raf = 0;
      if (engine.playing) handle(engine.update(now));
      if (dirty || engine.playing) draw();
      dirty = false;
      if (engine.playing) kick();
    }
    function kick() { if (!raf) raf = requestAnimationFrame(frame); }

    function draw() {
      const t = engine.time;
      const next = engine.next;
      const nearNext = song && next >= 0 && (engine.waiting || song.steps[next].ms - t < 1200);
      const drawState = { t, hands: engine.hands, held, results: engine.results, next,
        expected: nearNext ? new Set(engine.required(next)) : null, lookahead: (settings.get("lookahead") || 3) * 1000 };
      roll.draw(drawState);
      timeline.draw({ t, loop: engine.loop, results: engine.results });
    }

    function resize() { roll.resize(); timeline.resize(); score.resize(); dirty = true; kick(); }

    const act = {
      toggle(now) { synth.unlock(); if (engine.playing) { engine.pause(); stopSound(); } else { lastResult = null; engine.play(now); } handle(engine.drain()); changed(); },
      restart() { const was = engine.playing; engine.pause(); stopSound(); engine.seek(engine.loop.on ? engine.loop.from : 0); engine.results.clear(); score.clearMarks(); lastResult = null; handle(engine.drain()); if (was) engine.play(performance.now()); handle(engine.drain()); changed(); },
      speed(s) { engine.setSpeed(Math.round(s * 100) / 100); changed(); },
      mode(m) { engine.setMode(m); settings.set("mode", m); changed(); },
      hand(h, role) { stopSound(); engine.setHands({ [h]: role }); handle(engine.drain()); changed(); },
      loop(on) {
        if (on && !engine.loop.on && song) {
          // Loop the bar you're in, if no range was dragged yet.
          const l = engine.loop;
          if (!(l.to > l.from) || (l.from === 0 && l.to >= song.end)) {
            const bar = Math.max(0, song.steps[Math.max(0, engine.step)] ? barIndex(engine.time) : 0);
            engine.setLoop({ on: true, from: song.bars[bar], to: song.bars[bar + 1] != null ? Math.min(song.end, song.bars[bar + 1]) : song.end });
          } else engine.setLoop({ on: true });
        } else engine.setLoop({ on });
        handle(engine.drain()); changed();
      },
      loopAll() { if (song) { engine.setLoop({ on: true, from: 0, to: song.end }); handle(engine.drain()); changed(); } },
      metronome(on) { engine.setMetronome(on); settings.set("metronome", on); changed(); },
      countIn(on) { engine.setCountIn(on); settings.set("countIn", on); changed(); },
      bar(delta) {
        if (!song) return;
        const b = Math.max(0, Math.min(song.bars.length - 1, barIndex(engine.time) + delta));
        if (song.bars[b] >= song.end) return;
        engine.seek(song.bars[b]); handle(engine.drain()); changed();
      },
      seek(ms) { engine.seek(ms); handle(engine.drain()); changed(); },
    };
    function barIndex(ms) { let b = 0; for (let i = 0; i < song.bars.length; i++) if (song.bars[i] <= ms + 0.5) b = i; return b; }

    return { load, noteIn, act, resize, draw: () => { dirty = true; kick(); }, state, engine, roll, timeline,
      stopSound, readColors() { roll.readColors(); timeline.readColors(); dirty = true; kick(); },
      get song() { return song; }, get target() { return target; }, get score() { return score; }, songBpm };
  }

  window.Piano = window.Piano || {};
  window.Piano.practice = { create };
})();
