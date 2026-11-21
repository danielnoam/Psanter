// The name of the chord under your fingers: "C", "Am7", "G/B". Pure.
(function () {
  const NAMES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
  // Interval sets from the root, most common first.
  const KINDS = [
    ["", [0, 4, 7], "major"], ["m", [0, 3, 7], "minor"], ["dim", [0, 3, 6], "diminished"], ["aug", [0, 4, 8], "augmented"],
    ["7", [0, 4, 7, 10], "dominant seventh"], ["maj7", [0, 4, 7, 11], "major seventh"], ["m7", [0, 3, 7, 10], "minor seventh"],
    ["m7b5", [0, 3, 6, 10], "half-diminished"], ["dim7", [0, 3, 6, 9], "diminished seventh"], ["mMaj7", [0, 3, 7, 11], "minor major seventh"],
    ["7", [0, 4, 10], "dominant seventh"], ["maj7", [0, 4, 11], "major seventh"], ["m7", [0, 3, 10], "minor seventh"],
    ["6", [0, 4, 7, 9], "sixth"], ["m6", [0, 3, 7, 9], "minor sixth"], ["sus4", [0, 5, 7], "suspended fourth"], ["sus2", [0, 2, 7], "suspended second"],
    ["add9", [0, 2, 4, 7], "added ninth"], ["9", [0, 2, 4, 7, 10], "ninth"], ["5", [0, 7], "power chord"],
  ];

  // midis: the keys held. Returns { name, root, kind, long, inversion } or null.
  function name(midis) {
    const list = [...new Set(midis)].sort((a, b) => a - b);
    if (list.length < 2) return null;
    const pcs = [...new Set(list.map((m) => m % 12))];
    if (pcs.length < 2) return null;
    const bass = list[0] % 12;
    // Prefer the root in the bass, then root position of any reading.
    const roots = [bass, ...pcs.filter((p) => p !== bass)];
    for (const root of roots) {
      for (const [suffix, set, long] of KINDS) {
        const ivs = pcs.map((p) => (p - root + 12) % 12).sort((a, b) => a - b);
        if (ivs.length === set.length && ivs.every((v, i) => v === set[i])) {
          const pos = set.indexOf((bass - root + 12) % 12);
          const inversion = pos <= 0 ? "root position" : pos === 1 ? "first inversion" : pos === 2 ? "second inversion" : "third inversion";
          return { name: NAMES[root] + suffix + (bass === root ? "" : "/" + NAMES[bass]), root: NAMES[root], kind: suffix, long: NAMES[root] + " " + long, inversion };
        }
      }
    }
    return null;
  }

  // The chords of a song, beat by beat: [{ms, name}], a new entry only
  // where the chord changes. A beat's notes are tried in turn: the ones
  // held through it, the left hand's, the ones on the beat, then all, so
  // a melody's passing notes don't hide the chord under them.
  function sequence(song) {
    if (!song || !song.notes.length) return [];
    const beats = song.beats.filter((b) => b.ms < song.end);
    const out = [];
    let at = 0;
    const notes = song.notes;
    beats.forEach((b, i) => {
      const end = beats[i + 1] ? beats[i + 1].ms : song.end;
      const len = end - b.ms;
      while (at < notes.length && notes[at].ms + 30000 < b.ms) at++;
      const sounding = [];
      for (let j = at; j < notes.length && notes[j].ms < end - 1; j++) if (notes[j].ms + notes[j].dur > b.ms + 1) sounding.push(notes[j]);
      if (!sounding.length) return;
      const held = sounding.filter((n) => n.ms < b.ms - 1 || n.dur > len * 1.05);
      const tries = [held, sounding.filter((n) => n.hand === "left"), sounding.filter((n) => n.ms <= b.ms + 40), sounding];
      let c = null;
      for (const set of tries) {
        if (new Set(set.map((n) => n.midi % 12)).size < 3) continue;
        c = name(set.map((n) => n.midi));
        if (c) break;
      }
      if (c && (!out.length || out[out.length - 1].name !== c.name)) out.push({ ms: b.ms, name: c.name });
    });
    return out;
  }

  // The entry in force at a time, or -1 before the first.
  function indexAt(seq, ms) {
    let lo = 0, hi = seq.length - 1, at = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (seq[mid].ms <= ms + 0.5) { at = mid; lo = mid + 1; } else hi = mid - 1; }
    return at;
  }

  window.Psanter = window.Psanter || {};
  window.Psanter.chords = { name, sequence, indexAt, NAMES };
})();
