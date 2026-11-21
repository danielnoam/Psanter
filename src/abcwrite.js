// Writing ABC: a MIDI note as ABC in a key (with the bar's accidentals
// carried, as ABC reads them), and sight-reading drills made from a seed.
// Pure: the editor uses spell() for notes played on the piano, the drills
// screen uses drill().
(function () {
  // The accidental each letter has in the key signature.
  const KEYS = {
    C: {}, G: { F: 1 }, D: { F: 1, C: 1 }, A: { F: 1, C: 1, G: 1 }, E: { F: 1, C: 1, G: 1, D: 1 },
    B: { F: 1, C: 1, G: 1, D: 1, A: 1 }, "F#": { F: 1, C: 1, G: 1, D: 1, A: 1, E: 1 },
    F: { B: -1 }, Bb: { B: -1, E: -1 }, Eb: { B: -1, E: -1, A: -1 }, Ab: { B: -1, E: -1, A: -1, D: -1 },
    Db: { B: -1, E: -1, A: -1, D: -1, G: -1 }, Gb: { B: -1, E: -1, A: -1, D: -1, G: -1, C: -1 },
  };
  // Minor keys share their relative major's signature.
  const MINORS = { Am: "C", Em: "G", Bm: "D", "F#m": "A", "C#m": "E", "G#m": "B", Dm: "F", Gm: "Bb", Cm: "Eb", Fm: "Ab", Bbm: "Db", Ebm: "Gb" };
  const sigOf = (key) => KEYS[key] || KEYS[MINORS[key]] || {};
  const LETTERS = ["C", "D", "E", "F", "G", "A", "B"];
  const NATURAL = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  const SHARPS = [["C", 0], ["C", 1], ["D", 0], ["D", 1], ["E", 0], ["F", 0], ["F", 1], ["G", 0], ["G", 1], ["A", 0], ["A", 1], ["B", 0]];
  const FLATS = [["C", 0], ["D", -1], ["D", 0], ["E", -1], ["E", 0], ["F", 0], ["G", -1], ["G", 0], ["A", -1], ["A", 0], ["B", -1], ["B", 0]];

  // The letter and accidental for a note in a key: the key's own spelling
  // when the note is in it, else sharps (flats in a flat key).
  function letterOf(midi, key) {
    const sig = sigOf(key);
    const pc = ((midi % 12) + 12) % 12;
    for (const L of LETTERS) { const a = sig[L] || 0; if ((NATURAL[L] + a + 12) % 12 === pc) return [L, a]; }
    const flat = Object.values(sig).some((a) => a < 0);
    return (flat ? FLATS : SHARPS)[pc];
  }

  // bar: a Map kept for the current bar (letter+octave → accidental in
  // force), so a second C# in a bar is plain C and a C after it is =C.
  function spell(midi, key = "C", bar = null, letter = null) {
    let L, a;
    if (letter) { L = letter; a = ((((midi % 12) - NATURAL[L]) % 12) + 18) % 12 - 6; }
    else [L, a] = letterOf(midi, key);
    const oct = Math.floor((midi - a) / 12) - 1;
    const id = L + oct;
    const inForce = bar && bar.has(id) ? bar.get(id) : (sigOf(key)[L] || 0);
    const mark = a === inForce ? "" : a === 2 ? "^^" : a === -2 ? "__" : a === 1 ? "^" : a === -1 ? "_" : "=";
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
  const MINOR = [0, 2, 3, 5, 7, 8, 11];
  const PC = { C: 0, "C#": 1, Db: 1, D: 2, Eb: 3, E: 4, F: 5, "F#": 6, Gb: 6, G: 7, "G#": 8, Ab: 8, A: 9, Bb: 10, B: 11 };
  const root = (key) => key.replace(/m$/, "");
  const isMinor = (key) => /m$/.test(key);
  // The tonic as written: middle C up to the B above it.
  const tonicOf = (key) => 60 + PC[root(key)];
  const TONIC = new Proxy({}, { get: (_, k) => (PC[root(String(k))] != null ? tonicOf(String(k)) : undefined) });
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

  // ---- scales, chords, rhythm and ear exercises ----
  // A scale degree (0 the tonic, 7 the octave, -1 the note below) as a
  // MIDI note and the letter it's written with.
  function degree(key, d, base) {
    const steps = isMinor(key) ? MINOR : MAJOR;
    const o = Math.floor(d / 7), i = ((d % 7) + 7) % 7;
    const letter = LETTERS[(LETTERS.indexOf(root(key)[0]) + i) % 7];
    return { midi: base + o * 12 + steps[i], letter };
  }

  // Lengths in eighths into bars of 4/4, each bar keeping its accidentals.
  // tokens: [{ notes: [{midi, letter}], len, finger }] (no notes is a rest)
  function bars(tokens, key) {
    const out = [];
    let bar = [], acc = new Map(), used = 0;
    for (const tk of tokens) {
      const len = tk.len === 1 ? "" : String(tk.len);
      let txt;
      if (!tk.notes.length) txt = "z" + len;
      else {
        const sorted = [...tk.notes].sort((x, y) => x.midi - y.midi);
        const names = sorted.map((n) => spell(n.midi, key, acc, n.letter));
        txt = (tk.finger ? "!" + tk.finger + "!" : "") + (names.length > 1 ? "[" + names.join("") + "]" : names[0]) + len;
      }
      bar.push(txt); used += tk.len;
      if (used >= 8) { out.push(bar.join(" ")); bar = []; acc = new Map(); used = 0; }
    }
    if (bar.length) out.push(bar.join(" "));
    return out.join(" | ") + " |]";
  }

  function header(title, key, tempo, extra = []) {
    return ["X:1", "T:" + title, "M:4/4", "L:1/8", "Q:1/4=" + tempo, ...extra];
  }

  // The usual fingering for the keys that take it (C G D A E major, A E D
  // minor): thumb under after 3, then after 4, ending on 5.
  const FINGERED = new Set(["C", "G", "D", "A", "E", "Am", "Em", "Dm"]);
  function fingers(hand, octaves) {
    const up = [];
    for (let o = 0; o < octaves; o++) up.push(...(hand === "left" ? [o ? 1 : 5, 4, 3, 2, 1, 3, 2] : [1, 2, 3, 1, 2, 3, 4]));
    up.push(hand === "left" ? 1 : 5);
    return up;
  }

  // Up and back down, in eighths, ending on a held tonic.
  // opts: { key, hand: right|left|both, octaves: 1|2, tempo }
  function scaleExercise(opts = {}) {
    const o = { key: "C", hand: "right", octaves: 1, tempo: 80, ...opts };
    const n = 7 * o.octaves;
    const line = (hand) => {
      const base = tonicOf(o.key) - (hand === "left" ? 12 : 0);
      const f = FINGERED.has(o.key) ? fingers(hand, o.octaves) : null;
      const degs = [];
      for (let d = 0; d <= n; d++) degs.push(d);
      for (let d = n - 1; d >= 0; d--) degs.push(d);
      return degs.map((d, i) => ({
        notes: [degree(o.key, d, base)],
        // 1 octave: 14 eighths and a quarter; 2 octaves: 28 and a half.
        len: i === degs.length - 1 ? (o.octaves === 1 ? 2 : 4) : 1,
        finger: f ? (i <= n ? f[i] : f[degs.length - 1 - i]) : null,
      }));
    };
    const title = (isMinor(o.key) ? root(o.key) + " harmonic minor" : o.key + " major") + " scale";
    const head = header(title.replace("b", "♭"), o.key, o.tempo);
    if (o.hand === "both") return head.concat(["K:" + o.key, "V:R clef=treble", "V:L clef=bass", "[V:R] " + bars(line("right"), o.key), "[V:L] " + bars(line("left"), o.key)]).join("\n") + "\n";
    return head.concat(["K:" + o.key + (o.hand === "left" ? " clef=bass" : ""), bars(line(o.hand), o.key)]).join("\n") + "\n";
  }

  // I IV V I (minor: i iv V i) with the right hand moving as little as it
  // can (root, second inversion, first inversion) over the roots.
  function chordExercise(opts = {}) {
    const o = { key: "C", hand: "both", tempo: 70, ...opts };
    const base = tonicOf(o.key);
    const rh = [[0, 2, 4], [0, 3, 5], [-1, 1, 4], [0, 2, 4]];
    const lh = [0, 3, 4, 0];
    const lens = [[4, 4], [4, 4], [4, 4], [8]];
    const right = [], left = [];
    rh.forEach((ch, i) => {
      for (const len of lens[i]) {
        right.push({ notes: ch.map((d) => degree(o.key, d, base)), len });
        left.push({ notes: [degree(o.key, lh[i], base - 12)], len });
      }
    });
    const name = isMinor(o.key) ? root(o.key) + " minor" : o.key + " major";
    const head = header(("Chords in " + name).replace("b", "♭"), o.key, o.tempo);
    if (o.hand === "right") return head.concat(["K:" + o.key, bars(right, o.key)]).join("\n") + "\n";
    if (o.hand === "left") return head.concat(["K:" + o.key + " clef=bass", bars(left, o.key)]).join("\n") + "\n";
    return head.concat(["K:" + o.key, "V:R clef=treble", "V:L clef=bass", "[V:R] " + bars(right, o.key), "[V:L] " + bars(left, o.key)]).join("\n") + "\n";
  }

  // Rhythm only, on one note (B, the middle line): any key on the piano
  // plays it. Negative lengths are rests.
  const RHYTHMS = {
    quarters: [[2, 2], [4], [-2, 2], [2, -2], [2, 2]],
    mixed: [[2, 2], [1, 1, 2], [2, 1, 1], [1, 1, 1, 1], [3, 1], [1, 2, 1], [-1, 1, 2], [-2, 1, 1], [4]],
  };
  const TAP = 71;
  function rhythmExercise(opts = {}) {
    const o = { rhythm: "quarters", bars: 4, tempo: 80, seed: 1, ...opts };
    const r = rng(o.seed);
    const list = RHYTHMS[o.rhythm] || RHYTHMS.quarters;
    const tokens = [];
    for (let b = 0; b < o.bars; b++) {
      const halves = b === o.bars - 1 ? [[4], [-4]] : [list[Math.floor(r() * list.length)], list[Math.floor(r() * list.length)]];
      for (const h of halves) for (const len of h) tokens.push({ notes: len > 0 ? [{ midi: TAP, letter: "B" }] : [], len: Math.abs(len) });
    }
    return header("Rhythm", "C", o.tempo).concat(["K:C", bars(tokens, "C")]).join("\n") + "\n";
  }

  // A short tune from the tonic, by step and small leaps, for playing back
  // by ear. opts: { key, count, range: five|octave, seed }
  function earPhrase(opts = {}) {
    const o = { key: "C", count: 4, range: "five", seed: 1, ...opts };
    const r = rng(o.seed);
    const top = o.range === "octave" ? 7 : 4;
    const degs = [0];
    while (degs.length < o.count) {
      const last = degs[degs.length - 1];
      let d;
      do d = last + [-2, -1, -1, 1, 1, 2, 3, -3][Math.floor(r() * 8)]; while (d < 0 || d > top || d === last);
      degs.push(d);
    }
    const base = tonicOf(o.key);
    const notes = degs.map((d) => degree(o.key, d, base));
    const tokens = notes.map((n) => ({ notes: [n], len: 2 }));
    const pad = (8 - ((tokens.length * 2) % 8)) % 8;
    if (pad) tokens.push({ notes: [], len: pad });
    const abc = header("By ear", o.key, 80).concat(["K:" + o.key, bars(tokens, o.key)]).join("\n") + "\n";
    return { midis: notes.map((n) => n.midi), tonic: base, abc };
  }

  window.Psanter = window.Psanter || {};
  window.Psanter.abcwrite = { KEYS: Object.keys(KEYS), MINORS: Object.keys(MINORS), spell, chord, barBefore, drill, scale,
    scaleExercise, chordExercise, rhythmExercise, earPhrase, TAP };
})();
