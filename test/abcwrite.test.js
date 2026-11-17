// Writing ABC and making drills: `node test/abcwrite.test.js`.
const assert = require("assert");
global.window = {};
require("../src/abcwrite.js");
const { abcwrite } = window.Piano;

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

console.log(passed + " passed");
