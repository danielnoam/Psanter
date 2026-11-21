// Notes and songs, the one shape every source (ABC, MusicXML, MIDI files)
// is turned into before the practice engine sees it. Pure: no DOM.
//
// A song's times are milliseconds at 100% speed. A note is
// { midi, ms, dur, hand: "right" | "left", finger, vel, tied }, where tied
// marks the continuation of a tied note: it sounds but is never asked for.
// Notes that start together form a step; the score's cursor and the
// engine's waiting both move step by step.
(function () {
  const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const SOLFEGE = ["Do", "Do#", "Re", "Re#", "Mi", "Fa", "Fa#", "Sol", "Sol#", "La", "La#", "Si"];
  const BLACK = [false, true, false, true, false, false, true, false, true, false, true, false];
  const LOWEST = 21, HIGHEST = 108;
  // Notes closer than this start together (a rolled MIDI chord).
  const SAME_STEP_MS = 30;

  const isBlack = (midi) => BLACK[((midi % 12) + 12) % 12];
  function name(midi, system) {
    const pc = ((midi % 12) + 12) % 12;
    if (system === "solfege") return SOLFEGE[pc];
    return NAMES[pc] + (Math.floor(midi / 12) - 1);
  }
  const letter = (midi) => NAMES[((midi % 12) + 12) % 12];

  // tempo: [{ms, bpm}] from the start; beats per bar and the beat's length
  // (4 = quarter) give the bar and beat grid the metronome and the loop use.
  function song({ notes, title = "", tempo = [{ ms: 0, bpm: 100 }], beatsPerBar = 4, beatUnit = 4, measures = null, refs = null }) {
    const sorted = notes
      .filter((n) => Number.isFinite(n.midi) && Number.isFinite(n.ms) && n.midi >= 0 && n.midi <= 127)
      .map((n) => ({ midi: n.midi, ms: Math.max(0, n.ms), dur: Math.max(1, n.dur || 1), hand: n.hand === "left" ? "left" : "right",
        finger: n.finger || null, vel: n.vel || 80, tied: !!n.tied, measure: n.measure != null ? n.measure : null }))
      .sort((a, b) => a.ms - b.ms || a.midi - b.midi);
    const steps = [];
    for (const n of sorted) {
      const last = steps[steps.length - 1];
      if (last && n.ms - last.ms <= SAME_STEP_MS) last.notes.push(n);
      else steps.push({ ms: n.ms, notes: [n] });
    }
    steps.forEach((s, i) => { s.index = i; s.ref = refs ? refs[i] : null; for (const n of s.notes) n.step = i; });
    const end = sorted.reduce((m, n) => Math.max(m, n.ms + n.dur), 0);
    const beats = beatGrid(tempo, beatsPerBar, beatUnit, end);
    const bars = beats.filter((b) => b.first).map((b) => b.ms);
    for (const s of steps) {
      const bar = barAt(bars, s.ms);
      s.measure = s.notes[0].measure != null ? s.notes[0].measure : bar;
    }
    let low = 127, high = 0;
    for (const n of sorted) { low = Math.min(low, n.midi); high = Math.max(high, n.midi); }
    return { title, notes: sorted, steps, end, tempo, beatsPerBar, beatUnit, beats, bars,
      range: sorted.length ? [low, high] : [60, 72], measures: measures || bars.length };
  }

  // One entry per beat to the end (and a bar past it), with first: true on
  // each bar's first beat.
  function beatGrid(tempo, beatsPerBar, beatUnit, end) {
    const out = [];
    const t = tempo.length ? tempo.slice().sort((a, b) => a.ms - b.ms) : [{ ms: 0, bpm: 100 }];
    let ms = 0, beat = 0, k = 0;
    const limit = end + 60000 / Math.max(20, t[t.length - 1].bpm) * beatsPerBar * (4 / beatUnit) + 1;
    while (ms <= limit && out.length < 100000) {
      while (k + 1 < t.length && t[k + 1].ms <= ms + 0.5) k++;
      out.push({ ms, first: beat % beatsPerBar === 0, bar: Math.floor(beat / beatsPerBar) });
      ms += 60000 / Math.max(20, t[k].bpm) * (4 / beatUnit);
      beat++;
    }
    return out;
  }

  function barAt(bars, ms) {
    let lo = 0, hi = bars.length - 1, at = 0;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (bars[mid] <= ms + 0.5) { at = mid; lo = mid + 1; } else hi = mid - 1; }
    return at;
  }

  // The step showing at a time: the last one at or before it.
  function stepAt(s, ms) {
    let lo = 0, hi = s.steps.length - 1, at = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (s.steps[mid].ms <= ms + 0.5) { at = mid; lo = mid + 1; } else hi = mid - 1; }
    return at;
  }

  // Bar n's start and end in ms (the end of the last bar is the song's end).
  function barSpan(s, n) {
    const from = s.bars[n] != null ? s.bars[n] : 0;
    const to = s.bars[n + 1] != null ? s.bars[n + 1] : s.end;
    return { from, to };
  }

  // One hand's notes moved by semitones, kept on the keyboard.
  function transpose(s, semis) {
    if (!semis) return s;
    const notes = s.notes.map((n) => ({ ...n, midi: Math.min(127, Math.max(0, n.midi + semis)) }));
    const out = song({ notes, title: s.title, tempo: s.tempo, beatsPerBar: s.beatsPerBar, beatUnit: s.beatUnit, measures: s.measures, refs: s.steps.map((x) => x.ref) });
    // Same timing, same steps: keep the score's bar numbers and the tracks.
    out.steps.forEach((x, i) => { if (s.steps[i]) x.measure = s.steps[i].measure; });
    if (s.tracks) out.tracks = s.tracks;
    return out;
  }

  window.Psanter = window.Psanter || {};
  window.Psanter.music = { NAMES, LOWEST, HIGHEST, isBlack, name, letter, song, beatGrid, stepAt, barSpan, transpose };
})();
