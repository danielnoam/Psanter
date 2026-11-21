// The practice engine, replayed note by note: `node test/engine.test.js`.
const assert = require("assert");
global.window = {};
require("../src/music.js");
require("../src/engine.js");
const { music, engine } = window.Psanter;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + (e.stack || e.message)); }
}

// C D E F in quarters at 60 bpm (1000 ms each), right hand; left hand C2 half notes.
function scale() {
  const notes = [60, 62, 64, 65].map((midi, i) => ({ midi, ms: i * 1000, dur: 900, hand: "right" }));
  notes.push({ midi: 36, ms: 0, dur: 1900, hand: "left" }, { midi: 43, ms: 2000, dur: 1900, hand: "left" });
  return music.song({ notes, tempo: [{ ms: 0, bpm: 60 }], beatsPerBar: 4 });
}
const types = (evs, type) => evs.filter((e) => e.type === type);
// Runs the clock from `from` to `to` in 16 ms frames, collecting events.
function run(e, from, to) { const out = []; for (let now = from; now <= to; now += 16) out.push(...e.update(now)); return out; }

test("a song groups notes that start together into steps", () => {
  const s = scale();
  assert.strictEqual(s.steps.length, 4);
  assert.deepStrictEqual(s.steps[0].notes.map((n) => n.midi).sort(), [36, 60]);
  assert.strictEqual(s.bars.length >= 1, true);
});

test("wait mode stops at the first step and goes on once its notes are down", () => {
  const e = engine.create(); e.load(scale()); e.setHands({ left: "auto" });
  e.play(0); e.drain();
  let ev = run(e, 0, 200);
  assert.ok(e.waiting, "waiting at step 0");
  assert.strictEqual(e.time, 0);
  assert.strictEqual(types(ev, "auto").length, 0, "the left hand waits for you");
  e.noteOn(60, 300);
  ev = e.drain();
  assert.strictEqual(types(ev, "hit").length, 1);
  assert.strictEqual(types(ev, "done")[0].result, "hit");
  assert.ok(types(ev, "auto").some((a) => a.midi === 36 && a.on), "the left hand sounds with your note");
  ev = run(e, 316, 1400);
  assert.ok(e.waiting && e.time === 1000, "waits again at step 1");
});

test("a wrong note is counted and doesn't move the song", () => {
  const e = engine.create(); e.load(scale());
  e.play(0); run(e, 0, 50);
  e.noteOn(61, 60);
  const ev = e.drain();
  assert.strictEqual(types(ev, "wrong").length, 1);
  assert.ok(e.waiting && e.time === 0);
  assert.strictEqual(e.stats().wrong, 1);
});

test("a chord counts in any order, rolled or together", () => {
  const notes = [{ midi: 60, ms: 0, dur: 500 }, { midi: 64, ms: 10, dur: 500 }, { midi: 67, ms: 20, dur: 500 }, { midi: 72, ms: 1000, dur: 500 }];
  const e = engine.create(); e.load(music.song({ notes, tempo: [{ ms: 0, bpm: 60 }] }));
  e.play(0); run(e, 0, 50);
  e.noteOn(67, 60); e.noteOn(60, 70);
  assert.ok(e.waiting, "two of three is not enough");
  e.noteOn(64, 80);
  const ev = e.drain();
  assert.strictEqual(types(ev, "done").length, 1);
  assert.ok(!e.waiting);
});

test("pressing the first note starts the song when stopped", () => {
  const e = engine.create(); e.load(scale()); e.setHands({ left: "off" });
  e.noteOn(60, 1000);
  const ev = e.drain();
  assert.ok(e.playing);
  assert.strictEqual(types(ev, "done").length, 1);
});

test("the same note twice in a row needs two presses", () => {
  const notes = [{ midi: 60, ms: 0, dur: 400 }, { midi: 60, ms: 500, dur: 400 }];
  const e = engine.create(); e.load(music.song({ notes, tempo: [{ ms: 0, bpm: 120 }] }));
  e.play(0); run(e, 0, 30);
  e.noteOn(60, 40); e.noteOff(60, 100);
  run(e, 100, 700);
  assert.ok(e.waiting && e.time === 500, "waits for the second press");
  e.noteOn(60, 710);
  assert.strictEqual(types(e.drain(), "done").length, 1);
});

test("flow mode never stops and counts a note not played as a miss", () => {
  const e = engine.create(); e.load(scale()); e.setMode("flow"); e.setHands({ left: "off" });
  e.play(0);
  e.noteOn(60, 20);
  const ev = run(e, 0, 1600);
  assert.ok(!e.waiting);
  assert.ok(e.time > 1300);
  assert.strictEqual(types(ev, "miss").length, 1, "D at 1000 ms was missed");
  assert.strictEqual(e.stats().hits, 1);
});

test("speed scales song time against the clock", () => {
  const e = engine.create(); e.load(scale()); e.setMode("flow"); e.setSpeed(0.5);
  e.play(0); run(e, 0, 1000);
  assert.ok(Math.abs(e.time - 500) < 20, "half speed: 1 s of clock is 500 ms of song, got " + e.time);
});

test("a loop goes back to its start and reports the pass", () => {
  const e = engine.create(); e.load(scale()); e.setMode("flow"); e.setHands({ right: "auto", left: "auto" });
  e.setLoop({ on: true, from: 1000, to: 3000 });
  assert.strictEqual(e.time, 1000);
  e.play(0);
  const ev = run(e, 0, 2100);
  const loops = types(ev, "loop");
  assert.strictEqual(loops.length, 1);
  assert.ok(loops[0].clean, "nothing asked of you, nothing missed");
  assert.ok(e.time >= 1000 && e.time < 1200);
});

test("the app plays the hand set to auto, and stops it on pause", () => {
  const e = engine.create(); e.load(scale()); e.setMode("flow"); e.setHands({ right: "auto", left: "off" });
  e.play(0);
  const ev = run(e, 0, 1100);
  const ons = types(ev, "auto").filter((a) => a.on).map((a) => a.midi);
  assert.deepStrictEqual(ons, [60, 62]);
  e.pause();
  const offs = types(e.drain(), "auto").filter((a) => !a.on);
  assert.ok(offs.length >= 1, "no stuck notes");
});

test("the metronome clicks each beat, accenting the bar's first", () => {
  const e = engine.create(); e.load(scale()); e.setMode("flow"); e.setHands({ right: "off", left: "off" }); e.setMetronome(true);
  e.play(0);
  const clicks = types(run(e, 0, 3990), "click");
  assert.strictEqual(clicks.length, 4);
  assert.deepStrictEqual(clicks.map((c) => c.accent), [true, false, false, false]);
});

test("a count-in plays a bar of clicks before the song moves", () => {
  const e = engine.create(); e.load(scale()); e.setMode("flow"); e.setHands({ right: "off", left: "off" }); e.setCountIn(true);
  e.play(0);
  const first = e.drain();
  const ev = run(e, 0, 3900);
  assert.strictEqual(types(first, "click").length + types(ev, "click").length, 4);
  assert.strictEqual(e.time, 0, "still counting in");
  run(e, 3900, 4500);
  assert.ok(e.time > 0);
});

test("seeking resets what is asked for", () => {
  const e = engine.create(); e.load(scale()); e.setHands({ left: "off" });
  e.seek(2000);
  assert.strictEqual(e.next, 2);
  assert.deepStrictEqual(e.required(e.next), [64]);
});

test("the song ends, reporting the run", () => {
  const e = engine.create(); e.load(scale()); e.setMode("flow"); e.setHands({ right: "auto", left: "auto" });
  e.play(0);
  const ev = run(e, 0, 4500);
  assert.strictEqual(types(ev, "end").length, 1);
  assert.ok(!e.playing);
});

test("tied continuations are never asked for", () => {
  const notes = [{ midi: 60, ms: 0, dur: 1000 }, { midi: 60, ms: 1000, dur: 1000, tied: true }, { midi: 62, ms: 2000, dur: 500 }];
  const e = engine.create(); e.load(music.song({ notes, tempo: [{ ms: 0, bpm: 60 }] }));
  assert.strictEqual(e.next, 0);
  e.play(0); run(e, 0, 30); e.noteOn(60, 40);
  run(e, 40, 1500);
  assert.ok(!e.waiting || e.time === 2000, "skips the tie");
  run(e, 1500, 2200);
  assert.strictEqual(e.time, 2000);
});

test("wait mode takes the next note early and catches up", () => {
  const e = engine.create(); e.load(scale()); e.setHands({ left: "off" });
  e.play(0); run(e, 0, 30);
  e.noteOn(60, 40); e.noteOn(62, 100); e.noteOn(64, 160);
  const ev = e.drain();
  assert.strictEqual(types(ev, "wrong").length, 0);
  assert.strictEqual(types(ev, "done").length, 3);
  assert.strictEqual(e.time, 2000, "the song jumped to the last note played");
});

test("flow mode still counts a note far too early as wrong", () => {
  const e = engine.create(); e.load(scale()); e.setMode("flow"); e.setHands({ left: "off" });
  e.play(0); run(e, 0, 30); e.noteOn(60, 40); e.noteOn(62, 60);
  assert.strictEqual(types(e.drain(), "wrong").length, 1);
});

test("latency: a note that arrives late by the set delay is on time", () => {
  const e = engine.create(); e.load(scale()); e.setMode("flow"); e.setHands({ left: "off" }); e.setLatency(200);
  e.play(0); run(e, 0, 1180);
  e.noteOn(62, 1190);
  const ev = e.drain();
  const hit = types(ev, "hit")[0];
  assert.ok(hit, "D counts");
  assert.ok(Math.abs(hit.offset) < 40, "offset within a frame or two of zero, got " + hit.offset);
  const e2 = engine.create(); e2.load(scale()); e2.setMode("flow"); e2.setHands({ left: "off" }); e2.setLatency(200);
  e2.noteOn(60, 0); e2.drain();
  const misses = types(run(e2, 0, 1400), "miss");
  assert.strictEqual(misses.length, 0, "D isn't missed yet: its window moves by the delay");
});

console.log(passed + " passed");
