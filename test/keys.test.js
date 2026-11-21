// Touch response, the double-note filter, device names, the hand split,
// skipped lead-in bars and the chord prompter: `node test/keys.test.js`.
const assert = require("assert");
global.window = {};
require("../src/music.js");
require("../src/touch.js");
require("../src/hands.js");
require("../src/midifile.js");
require("../src/chords.js");
const { music, touch, hands, midifile, chords } = window.Psanter;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + (e.stack || e.message)); }
}

test("touch response bends velocity and keeps the ends", () => {
  assert.strictEqual(touch.shape(64, "normal"), 64);
  assert.ok(touch.shape(40, "light") > 40 && touch.shape(40, "heavy") < 40);
  assert.strictEqual(touch.shape(127, "heavy"), 127);
  assert.strictEqual(touch.shape(1, "light") >= 1, true);
  assert.strictEqual(touch.shape(20, "fixed"), 80);
});

test("a press under the floor is dropped with its release", () => {
  const f = touch.filter(() => ({ floor: 10 }));
  assert.strictEqual(f.input(60, true, 5, 0), null);
  assert.strictEqual(f.input(60, false, 0, 50), null);
  assert.strictEqual(f.input(60, true, 30, 100), 30);
  assert.strictEqual(f.input(60, false, 0, 150), 0);
});

test("the same key twice within 40 ms counts once, and one release is kept", () => {
  const f = touch.filter(() => ({}));
  assert.strictEqual(f.input(60, true, 70, 1000), 70);
  assert.strictEqual(f.input(60, true, 70, 1003), null);
  assert.strictEqual(f.input(60, false, 0, 1200), null);
  assert.strictEqual(f.input(60, false, 0, 1201), 0);
  assert.strictEqual(f.input(60, true, 70, 1300), 70, "a real second press later counts");
  const off = touch.filter(() => ({ doubles: false }));
  off.input(62, true, 70, 0);
  assert.strictEqual(off.input(62, true, 70, 5), 70);
});

test("Windows' port names come down to the keyboard's name", () => {
  assert.strictEqual(touch.deviceName("MIDIIN2 (Roland FP-30)"), "Roland FP-30");
  assert.strictEqual(touch.deviceName("Roland FP-30"), "Roland FP-30");
  assert.strictEqual(touch.deviceName("2- Digital Piano"), "Digital Piano");
  assert.strictEqual(touch.deviceName("CASIO USB-MIDI MIDI 1"), "CASIO USB-MIDI");
  assert.strictEqual(touch.deviceName(""), "MIDI device");
});

test("key delays average the last presses", () => {
  const d = touch.delays(3);
  for (const ms of [1, 2, 3, 10]) d.add(ms);
  assert.strictEqual(d.count, 3);
  assert.strictEqual(d.average(), 5);
  assert.strictEqual(d.worst(), 10);
  d.add(-1); d.add(5000);
  assert.strictEqual(d.count, 3, "nonsense times are left out");
});

// Bass on each beat with a melody above it, both hands in one track.
function oneTrackPiece() {
  const notes = [];
  const bass = [48, 43, 45, 41], tune = [72, 74, 76, 77, 79, 77, 76, 74];
  for (let b = 0; b < 8; b++) {
    notes.push({ midi: bass[b % 4], ms: b * 500 });
    notes.push({ midi: bass[b % 4] + 7, ms: b * 500 });
    notes.push({ midi: tune[b], ms: b * 500 });
  }
  return notes;
}

test("one track's notes are split into a left and a right hand", () => {
  const notes = oneTrackPiece();
  const h = hands.assign(notes);
  notes.forEach((n, i) => assert.strictEqual(h[i], n.midi >= 72 ? "right" : "left", "note " + n.midi));
});

test("a melody that dips under middle C stays in one hand", () => {
  const notes = [64, 62, 60, 59, 57, 59, 60, 62].map((m, i) => ({ midi: m, ms: i * 300 }));
  const h = hands.assign(notes);
  assert.strictEqual(new Set(h).size, 1, h.join(" "));
});

test("a chord wider than a hand is split between the hands", () => {
  const h = hands.assign([36, 43, 48, 64, 67, 72].map((m) => ({ midi: m, ms: 0 })));
  assert.deepStrictEqual(h, ["left", "left", "left", "right", "right", "right"]);
});

test("a hand never gets more than five notes at once", () => {
  const h = hands.assign([60, 62, 64, 65, 67, 69, 71].map((m) => ({ midi: m, ms: 0 })));
  assert.ok(h.filter((x) => x === "right").length <= 5 && h.filter((x) => x === "left").length <= 5);
});

// A format-0 file at 480 ticks a beat, 4/4: `lead` silent bars first.
function file(lead, notes) {
  const b = [];
  const vlq = (v) => { const out = [v & 0x7f]; while ((v >>= 7)) out.unshift((v & 0x7f) | 0x80); return out; };
  let first = lead * 4 * 480;
  b.push(0, 0xff, 0x51, 3, 0x07, 0xa1, 0x20);
  for (const m of notes) { b.push(...vlq(first), 0x90, m, 80, ...vlq(480), 0x80, m, 0); first = 0; }
  b.push(0, 0xff, 0x2f, 0);
  return new Uint8Array([0x4d, 0x54, 0x68, 0x64, 0, 0, 0, 6, 0, 0, 0, 1, 0x01, 0xe0, 0x4d, 0x54, 0x72, 0x6b, 0, 0, b.length >> 8, b.length & 0xff, ...b]);
}

test("empty bars before the music are skipped, whole bars only", () => {
  const s = midifile.parse(file(2, [60, 62, 64]));
  assert.strictEqual(s.skippedBars, 2);
  assert.strictEqual(s.notes[0].ms, 0);
  const kept = midifile.parse(file(2, [60, 62, 64]), "", null, { skipLead: false });
  assert.strictEqual(kept.skippedBars, 0);
  assert.strictEqual(kept.notes[0].ms, 4000);
  assert.strictEqual(midifile.parse(file(0, [60])).skippedBars, 0);
});

test("a song's chords come out beat by beat, once per change", () => {
  const notes = [];
  const chordsIn = [[48, 52, 55], [53, 57, 60], [55, 59, 62, 65], [48, 52, 55]];
  chordsIn.forEach((c, bar) => {
    for (const m of c) notes.push({ midi: m, ms: bar * 2000, dur: 2000, hand: "left" });
    for (let i = 0; i < 4; i++) notes.push({ midi: 72 + i * 2, ms: bar * 2000 + i * 500, dur: 500, hand: "right" });
  });
  const s = music.song({ notes, tempo: [{ ms: 0, bpm: 120 }] });
  const seq = chords.sequence(s);
  assert.deepStrictEqual(seq.map((x) => x.name), ["C", "F", "G7", "C"]);
  assert.strictEqual(chords.indexAt(seq, 2500), 1);
  assert.strictEqual(chords.indexAt(seq, -5), -1);
});

console.log(passed + " passed");
