// Lesson files and MIDI files: `node test/lesson.test.js`.
const assert = require("assert");
global.window = {};
require("../src/music.js");
require("../src/midifile.js");
require("../src/lesson.js");
const { lesson, midifile } = window.Piano;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + (e.stack || e.message)); }
}

test("front matter is read and taken off the body", () => {
  const r = lesson.frontMatter("---\ntitle: C scale\nbook: \"a b.pdf#page=3\"\n---\n# Hello\n");
  assert.deepStrictEqual(r.meta, { title: "C scale", book: "a b.pdf#page=3" });
  assert.strictEqual(r.body, "# Hello\n");
  assert.deepStrictEqual(lesson.bookRef(r.meta.book), { file: "a b.pdf", page: 3 });
});

test("no front matter leaves the text as it is", () => {
  assert.deepStrictEqual(lesson.frontMatter("# Hi"), { meta: {}, body: "# Hi" });
});

test("practice options are read, and bad values dropped", () => {
  const o = lesson.options("practice: tempo=60 hands=left mode=flow loop=true bars=3-4 transpose=-2 color=red");
  assert.strictEqual(o.tempo, 60); assert.strictEqual(o.hands, "left"); assert.strictEqual(o.mode, "flow");
  assert.strictEqual(o.loop, true); assert.deepStrictEqual(o.bars, [3, 4]); assert.strictEqual(o.transpose, -2);
  assert.strictEqual(o.color, "red", "unknown keys are kept");
  assert.strictEqual(lesson.options("hands=feet").hands, "feet", "kept raw, not trusted");
  assert.strictEqual(lesson.options("speed=75%").speed, 0.75);
});

test("a fence's info string says what the block is", () => {
  assert.deepStrictEqual(lesson.fence("abc practice: tempo=60").opts.tempo, 60);
  assert.strictEqual(lesson.fence("abc").practice, true);
  assert.strictEqual(lesson.fence("js").practice, false);
});

test("links to pieces are told apart from other links", () => {
  assert.ok(lesson.isPiece("pieces/minuet.musicxml"));
  assert.ok(lesson.isPiece("a.mid?x=1"));
  assert.ok(!lesson.isPiece("https://example.com"));
  assert.strictEqual(lesson.kind("x.MXL"), "mxl");
});

test("links resolve against the lesson's folder", () => {
  assert.strictEqual(lesson.resolve("course/01-a.md", "pieces/x.mid"), "course/pieces/x.mid");
  assert.strictEqual(lesson.resolve("course/sub/a.md", "../x.mid"), "course/x.mid");
});

test("a lesson's title comes from front matter, its heading or its file name", () => {
  assert.strictEqual(lesson.title({}, "# Scales\n", "x.md"), "Scales");
  assert.strictEqual(lesson.title({}, "text", "c/03-hand_position.md"), "hand position");
});

test("lessons sort by number, not by text", () => {
  assert.deepStrictEqual(["10-b.md", "2-a.md", "1-c.md"].sort(lesson.byName), ["1-c.md", "2-a.md", "10-b.md"]);
});

test("a recording written as MIDI reads back the same notes", () => {
  const notes = [{ midi: 60, ms: 0, dur: 500, vel: 90 }, { midi: 64, ms: 500, dur: 250, vel: 70 }, { midi: 40, ms: 500, dur: 1000, vel: 60 }];
  const s = midifile.parse(midifile.write(notes));
  assert.strictEqual(s.notes.length, 3);
  const c = s.notes.find((n) => n.midi === 60);
  assert.ok(Math.abs(c.dur - 500) < 2 && c.vel === 90);
  assert.strictEqual(s.notes.find((n) => n.midi === 40).hand, "left", "one track: low notes are the left hand");
});

test("a two-track file gives a hand per track; names win", () => {
  assert.deepStrictEqual(midifile.assignHands([{ name: "", notes: [] }, { name: "", notes: [] }]), ["right", "left"]);
  assert.deepStrictEqual(midifile.assignHands([{ name: "Left Hand", notes: [] }, { name: "Piano", notes: [] }]), ["left", "right"]);
});

test("a file that isn't MIDI is refused with a message", () => {
  assert.throws(() => midifile.parse(new Uint8Array([1, 2, 3])), /not a MIDI file/);
});

console.log(passed + " passed");
