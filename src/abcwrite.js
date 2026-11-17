// Writing ABC: a MIDI note as ABC in a key (with the bar's accidentals
// carried, as ABC reads them), and sight-reading drills made from a seed.
// Pure: the editor uses spell() for notes played on the piano, the drills
// screen uses drill().
(function () {
  // The accidental each letter has in the key signature.
  const KEYS = {
    C: {}, G: { F: 1 }, D: { F: 1, C: 1 }, A: { F: 1, C: 1, G: 1 },
    F: { B: -1 }, Bb: { B: -1, E: -1 }, Eb: { B: -1, E: -1, A: -1 },
  };
  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SHARPS = [["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0], ["F", 0], ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0]];
  const FLATS = [["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0], ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0]];

  // The letter and accidental for a note in a key: the key's own spelling
  // when the note is in it, else sharps (flats in a flat key).
  function letterOf(midi, key) {
    const sig = KEYS[key] || {};
    const pc = ((midi % 12) + 12) % 12;
    for (const L of LETTERS) { const a = sig[L] || 0; if ((NATURAL[L] + a + 12) % 12 === pc) return [L, a]; }
    const flat = Object.values(sig).some((a) => a < 0);
    return (flat ? FLATS : SHARPS)[pc];
  }

  // bar: a Map kept for the current bar (letter+octave → accidental in
  // force), so a second C# in a bar is plain C and a C after it is =C.
  function spell(midi, key = "C", bar = null) {
    const [L, a] = letterOf(midi, key);
    const oct = Math.floor((midi - a) / 12) - 1;
    const id = L + oct;
    const inForce = bar && bar.has(id) ? bar.get(id) : ((KEYS[key] || {})[L] || 0);
    const mark = a === inForce ? "" : a === 1 ? "^" : a === -1 ? "_" : "=";
    if (bar) bar.set(id, a);
    const name = oct >= 5 ? L.toLowerCase() + "'".repeat(oct - 5) : L + ",".repeat(Math.max(0, 4 - oct));
    return mark + name;
  }

  function chord(midis, key, bar, len = "") {
    const sorted = [...midis].sort((x, y) => x - y);
    if (sorted.length === 1) return spell(sorted[0], key, bar) + len;
    return "[" + sorted.map((m) => spell(m, key, bar)).join("") + "]" + len;
  }

  // The accidentals already in force in the bar that ends at the end of
  // `text` (the editor reads what's before the cursor).
  function barBefore(text, key) {
    const seg = text.slice(Math.max(text.lastIndexOf("|"), text.lastIndexOf("\n")) + 1);
    const bar = new Map();
    for (const m of seg.matchAll(/([\^=_]?)([A-Ga-g])([,']*)/g)) {
      const L = m[2].toUpperCase();
      let oct = m[2] === L ? 4 : 5;
      for (const c of m[3]) oct += c === "'" ? 1 : -1;
      if (m[1]) bar.set(L + oct, m[1] === "^" ? 1 : m[1] === "_" ? -1 : 0);
    }
    return bar;
  }

  // ---- drills ----
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const MAJOR = [0, 2, 4, 5, 7, 9, 11];
  const TONIC = { C: 60, G: 67, D: 62, A: 69, F: 65, Bb: 70, Eb: 63 };
  // Rhythms for half a bar of 4/4, in eighths.
  const HALVES = { quarters: [[2, 2]], mixed: [[2, 2], [4], [2, 1, 1], [1, 1, 2], [3, 1], [1, 1, 1, 1], [2, 2]] };

  // The scale notes a hand reads from, low to high.
  function scale(key, range, hand) {
    const tonic = TONIC[key] || 60;
    const base = hand === "left" ? tonic - (range === "two" ? 24 : 12) : tonic - (range === "two" && tonic > 64 ? 12 : 0);
    const span = range === "five" ? 5 : range === "octave" ? 8 : 15;
    const out = [];
    for (let i = 0; i < span; i++) out.push(base + Math.floor(i / 7) * 12 + MAJOR[i % 7]);
    return out;
  }

  // opts: { key, hand: right|left|both, range: five|octave|two, rhythm: quarters|mixed, bars, tempo, seed }
  function drill(opts = {}) {
    const o = { key: "C", hand: "right", range: "five", rhythm: "quarters", bars: 4, tempo: 80, seed: 1, ...opts };
    if (!KEYS[o.key]) o.key = "C";
    const r = rng(o.seed);
    const pick = (list) => list[Math.floor(r() * list.length)];
    function melody(hand) {
      const notes = scale(o.key, o.range, hand);
      const out = [];
      let i = hand === "left" && o.hand === "both" ? 0 : Math.min(notes.length - 1, Math.floor(r() * Math.min(3, notes.length)));
      for (let b = 0; b < o.bars; b++) {
        const bar = [];
        if (b === o.bars - 1) {
          // End home: the nearest tonic, held.
          const homes = notes.map((m, k) => [k, m]).filter(([, m]) => (m - notes[0]) % 12 === 0);
          i = homes.reduce((best, h) => (Math.abs(h[0] - i) < Math.abs(best[0] - i) ? h : best))[0];
          bar.push({ midis: [notes[i]], len: 8 });
        } else {
          for (const half of [0, 1]) {
            const rhythm = hand === "left" && o.hand === "both" ? [4] : pick(HALVES[o.rhythm] || HALVES.quarters);
            for (const len of rhythm) {
              const step = pick([-2, -1, -1, 1, 1, 2, 0, -3, 3]);
              i = Math.max(0, Math.min(notes.length - 1, i + step));
              bar.push({ midis: [notes[i]], len });
            }
          }
        }
        out.push(bar);
      }
      return out;
    }
    function write(bars) {
      return bars.map((bar) => { const acc = new Map(); return bar.map((n) => chord(n.midis, o.key, acc, n.len === 1 ? "" : String(n.len))).join(" "); }).join(" | ") + " |]";
    }
    const head = ["X:1", "T:Sight-reading", "M:4/4", "L:1/8", "Q:1/4=" + o.tempo];
    let text;
    if (o.hand === "both") {
      const right = melody("right"), left = melody("left");
      text = head.concat(["K:" + o.key, "V:R clef=treble", "V:L clef=bass", "[V:R] " + write(right), "[V:L] " + write(left)]).join("\n");
    } else {
      text = head.concat(["K:" + o.key + (o.hand === "left" ? " clef=bass" : ""), write(melody(o.hand))]).join("\n");
    }
    return text + "\n";
  }

  window.Piano = window.Piano || {};
  window.Piano.abcwrite = { KEYS: Object.keys(KEYS), spell, chord, barBefore, drill, scale };
})();
