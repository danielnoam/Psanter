// Recording what you play: `node test/recorder.test.js`.
const assert = require("assert");
global.window = {};
require("../src/recorder.js");
require("../src/hands.js");
require("../src/midifile.js");
require("../src/music.js");
const { recorder, midifile } = window.Piano;

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

console.log(passed + " passed");
