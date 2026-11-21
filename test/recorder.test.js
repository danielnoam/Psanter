// Recording what you play: `node test/recorder.test.js`.
const assert = require("assert");
global.window = {};
require("../src/recorder.js");
require("../src/hands.js");
require("../src/midifile.js");
require("../src/music.js");
const { recorder, midifile } = window.Psanter;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + (e.stack || e.message)); }
}

test("notes start at the first one played and keep their lengths", () => {
  const r = recorder.create(); r.start(1000);
  r.note(60, true, 90, 1500); r.note(60, false, 0, 1900); r.note(64, true, 70, 2000);
  const notes = r.stop(2600);
  assert.deepStrictEqual(notes, [{ midi: 60, ms: 0, dur: 400, vel: 90 }, { midi: 64, ms: 500, dur: 600, vel: 70 }]);
  assert.ok(!r.recording);
});

test("the pedal holds released notes until it comes up", () => {
  const r = recorder.create(); r.start(0);
  r.setPedal(true, 0); r.note(60, true, 80, 100); r.note(60, false, 0, 200); r.setPedal(false, 900);
  assert.strictEqual(r.stop(1000)[0].dur, 800);
});

test("a recording writes a MIDI file that reads back the same", () => {
  const r = recorder.create(); r.start(0);
  r.note(60, true, 80, 0); r.note(60, false, 0, 500); r.note(67, true, 80, 500); r.note(67, false, 0, 1000);
  const song = midifile.parse(midifile.write(r.stop(1000)), "take");
  assert.deepStrictEqual(song.notes.map((n) => [n.midi, Math.round(n.ms), Math.round(n.dur)]), [[60, 0, 500], [67, 500, 500]]);
});

test("a layer keeps its place from when recording started", () => {
  const r = recorder.create(); r.start(1000, { keepStart: true });
  r.note(48, true, 80, 1500); r.note(48, false, 0, 2000);
  assert.strictEqual(r.stop(2100)[0].ms, 500);
});

test("layers write one track each and read back together", () => {
  const a = [{ midi: 60, ms: 0, dur: 500, vel: 80 }, { midi: 62, ms: 500, dur: 500, vel: 80 }];
  const b = [{ midi: 48, ms: 0, dur: 1000, vel: 70 }];
  const bytes = midifile.write([a, b]);
  assert.strictEqual(bytes[9], 1, "format 1");
  assert.strictEqual(bytes[11], 2, "two tracks");
  const song = midifile.parse(bytes, "take");
  assert.deepStrictEqual(song.notes.map((n) => [n.midi, Math.round(n.ms)]).sort((x, y) => x[1] - y[1] || x[0] - y[0]), [[48, 0], [60, 0], [62, 500]]);
});

console.log(passed + " passed");
