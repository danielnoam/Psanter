// Writing ABC and making drills: `node test/abcwrite.test.js`.
const assert = require("assert");
global.window = {};
require("../src/abcwrite.js");
const { abcwrite } = window.Psanter;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + (e.stack || e.message)); }
}

test("notes are spelled in their key and octave", () => {
  const s = (m, k) => abcwrite.spell(m, k);
  assert.deepStrictEqual([s(60, "C"), s(72, "C"), s(84, "C"), s(48, "C"), s(36, "C")], ["C", "c", "c'", "C,", "C,,"]);
  assert.strictEqual(s(61, "C"), "^C");
  assert.strictEqual(s(66, "G"), "F", "F# is in G");
  assert.strictEqual(s(65, "G"), "=F");
  assert.strictEqual(s(70, "F"), "B", "Bb is in F");
  assert.strictEqual(s(63, "Eb"), "E");
  assert.strictEqual(s(61, "F"), "_D", "flats in a flat key");
});

test("an accidental lasts to the end of the bar", () => {
  const bar = new Map();
  assert.deepStrictEqual([61, 61, 60].map((m) => abcwrite.spell(m, "C", bar)), ["^C", "C", "=C"]);
});

test("the bar before the cursor is read back", () => {
  const bar = abcwrite.barBefore("C D | ^F G", "C");
  assert.strictEqual(abcwrite.spell(66, "C", bar), "F");
  assert.strictEqual(abcwrite.spell(65, "C", abcwrite.barBefore("C D | ^F G", "C")), "=F");
});

test("chords go low to high", () => {
  assert.strictEqual(abcwrite.chord([67, 60, 64], "C", new Map(), "2"), "[CEG]2");
});

// Each bar's lengths, in eighths, from a line of a drill.
function bars(line) {
  return line.replace(/^\[V:\w\] /, "").replace(" |]", "").split(" | ").map((b) => b.split(" ").reduce((sum, tok) => { const m = /(\d+)?$/.exec(tok.replace(/\]$/, "")); return sum + (m[1] ? +m[1] : 1); }, 0));
}

test("a drill is the same for the same seed, and every bar is full", () => {
  for (const rhythm of ["quarters", "mixed"]) for (const key of abcwrite.KEYS) {
    const a = abcwrite.drill({ key, rhythm, seed: 7, bars: 6 });
    assert.strictEqual(a, abcwrite.drill({ key, rhythm, seed: 7, bars: 6 }));
    const line = a.trim().split("\n").pop();
    assert.deepStrictEqual(bars(line), [8, 8, 8, 8, 8, 8], key + " " + rhythm + ": " + line);
  }
  assert.notStrictEqual(abcwrite.drill({ seed: 1 }), abcwrite.drill({ seed: 2 }));
});

test("both hands write two voices, the left in the bass clef", () => {
  const d = abcwrite.drill({ hand: "both", seed: 3 });
  assert.ok(/V:L clef=bass/.test(d) && /\[V:R\]/.test(d) && /\[V:L\]/.test(d));
  for (const line of d.split("\n").filter((l) => l.startsWith("[V:"))) assert.deepStrictEqual(bars(line), [8, 8, 8, 8]);
});

test("five-finger drills stay in five notes", () => {
  const notes = abcwrite.scale("G", "five", "right");
  assert.deepStrictEqual(notes, [67, 69, 71, 72, 74]);
  assert.deepStrictEqual(abcwrite.scale("C", "five", "left"), [48, 50, 52, 53, 55]);
});

const ALL = [...abcwrite.KEYS, ...abcwrite.MINORS];
test("scales and chords fill their bars in every key, for every hand", () => {
  for (const key of ALL) for (const hand of ["right", "left", "both"]) {
    for (const octaves of [1, 2]) for (const line of abcwrite.scaleExercise({ key, hand, octaves }).split("\n").filter((l) => / \|\]$/.test(l)))
      assert.ok(bars(line.replace(/!\d!/g, "")).every((b) => b === 8), key + " " + hand + " " + octaves + ": " + line);
    for (const line of abcwrite.chordExercise({ key, hand }).split("\n").filter((l) => / \|\]$/.test(l)))
      assert.deepStrictEqual(bars(line), [8, 8, 8, 8], key + " " + hand + ": " + line);
  }
});

test("a scale's fingering ends on 5 at the top and 1 at the bottom (right hand)", () => {
  const line = abcwrite.scaleExercise({ key: "G", octaves: 2 }).trim().split("\n").pop();
  const f = [...line.matchAll(/!(\d)!/g)].map((m) => +m[1]);
  assert.strictEqual(f.length, 29);
  assert.strictEqual(f[14], 5);
  assert.deepStrictEqual(f.slice(0, 8), [1, 2, 3, 1, 2, 3, 4, 1]);
  assert.strictEqual(f[28], 1);
  assert.ok(!/!\d!/.test(abcwrite.scaleExercise({ key: "Db" })), "no fingering where the usual one doesn't fit");
});

test("harmonic minor raises the seventh, spelled on its own letter", () => {
  assert.ok(/\^g/i.test(abcwrite.scaleExercise({ key: "Am" })));
  assert.ok(/\^c/.test(abcwrite.scaleExercise({ key: "Dm" })), "C sharp in D minor, not D flat");
  assert.ok(/\^\^f/.test(abcwrite.scaleExercise({ key: "G#m" })), "F double sharp in G sharp minor");
});

test("rhythm drills are one note, full bars, the same for the same seed", () => {
  for (const rhythm of ["quarters", "mixed"]) {
    const a = abcwrite.rhythmExercise({ rhythm, bars: 8, seed: 5 });
    assert.strictEqual(a, abcwrite.rhythmExercise({ rhythm, bars: 8, seed: 5 }));
    const line = a.trim().split("\n").pop();
    assert.ok(bars(line).every((b) => b === 8), line);
    assert.ok(!/[A-AC-Ga-g]/.test(line.replace(/z/g, "")), "only B: " + line);
  }
});

test("an ear tune starts on the tonic and keeps to its range", () => {
  for (let seed = 1; seed < 40; seed++) {
    const p = abcwrite.earPhrase({ key: "D", count: 5, range: "five", seed });
    assert.strictEqual(p.midis.length, 5);
    assert.strictEqual(p.midis[0], 62);
    assert.ok(p.midis.every((m) => m >= 62 && m <= 69), p.midis.join(" "));
    for (let i = 1; i < 5; i++) assert.notStrictEqual(p.midis[i], p.midis[i - 1]);
  }
});

console.log(passed + " passed");
