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

  window.Piano = window.Piano || {};
  window.Piano.chords = { name, NAMES };
})();
