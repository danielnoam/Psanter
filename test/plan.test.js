// Practice plans, chord names and takes: `node test/plan.test.js`.
const assert = require("assert");
global.window = {};
require("../src/music.js");
require("../src/plan.js");
require("../src/chords.js");
require("../src/takes.js");
const { music, plan, chords, takes } = window.Psanter;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + (e.stack || e.message)); }
}

// Bars of one quarter-note C per beat at 60 bpm; the left hand only in the first `leftBars`.
function song(bars, leftBars = bars, vel = () => 80) {
  const notes = [];
  for (let b = 0; b < bars; b++) for (let i = 0; i < 4; i++) {
    const ms = (b * 4 + i) * 1000;
    notes.push({ midi: 72, ms, dur: 900, hand: "right", vel: vel(b, i) });
    if (b < leftBars && i === 0) notes.push({ midi: 48, ms, dur: 3900, hand: "left", vel: 70 });
  }
  return music.song({ notes, tempo: [{ ms: 0, bpm: 60 }], beatsPerBar: 4 });
}

test("a plan goes section by section: each hand, then both, slow to full, then the whole piece", () => {
  const steps = plan.make(song(8));
  assert.deepStrictEqual(steps.slice(0, 5).map((s) => [s.from, s.to, s.hands, s.speed]),
    [[0, 1, "right", 0.6], [0, 1, "left", 0.6], [0, 1, "both", 0.6], [0, 1, "both", 0.8], [0, 1, "both", 1]]);
  assert.strictEqual(steps.length, 4 * 5 + 2);
  assert.deepStrictEqual(steps.slice(-2).map((s) => [s.from, s.to, s.whole, s.speed]), [[0, 7, true, 0.8], [0, 7, true, 1]]);
});

test("a section with one hand skips the hands-separate steps", () => {
  const steps = plan.make(song(4, 2));
  assert.deepStrictEqual(steps.filter((s) => s.from === 2).map((s) => s.hands), ["right", "right", "right"]);
  assert.strictEqual(plan.make(song(16)).find((s) => !s.whole).to, 3, "longer pieces use four-bar sections");
});

test("chords are named with their inversion", () => {
  const n = (m) => (chords.name(m) || {}).name;
  assert.strictEqual(n([60, 64, 67]), "C");
  assert.strictEqual(n([64, 67, 72]), "C/E");
  assert.strictEqual(chords.name([67, 72, 76]).inversion, "second inversion");
  assert.strictEqual(n([57, 60, 64]), "Am");
  assert.strictEqual(n([55, 59, 62, 65]), "G7");
  assert.strictEqual(n([60, 64, 67, 69]), "C6", "the bass decides between C6 and Am7");
  assert.strictEqual(n([57, 60, 64, 67]), "Am7");
  assert.strictEqual(n([60, 63, 66, 69]), "Cdim7");
  assert.strictEqual(n([60]), undefined);
  assert.strictEqual(n([60, 61, 62]), undefined);
});

test("loud and soft are judged by the difference, not the keyboard's level", () => {
  const s = song(4, 0, (b) => (b % 2 ? 40 : 100));
  const hits = s.steps.map((st, i) => ({ step: i, want: st.notes[0].vel, vel: st.notes[0].vel + 15 }));
  assert.strictEqual(takes.dynamics(hits, s).accuracy, 100, "all a bit louder is fine");
  const flat = s.steps.map((st, i) => ({ step: i, want: st.notes[0].vel, vel: 75 }));
  const d = takes.dynamics(flat, s);
  assert.ok(d.flat && d.accuracy < 50, JSON.stringify(d));
  assert.deepStrictEqual(d.loud, [1, 3]);
  assert.deepStrictEqual(d.soft, [0, 2]);
  assert.strictEqual(takes.dynamics(hits, song(4)), null, "no marks, no judging");
});

test("a take keeps your notes in song time and plays them back in order", () => {
  const r = takes.recorder();
  r.on(60, 0, 90); r.on(64, 500, 70); r.off(60, 800); const notes = r.done(1200);
  assert.deepStrictEqual(notes, [{ midi: 60, ms: 0, vel: 90, dur: 800 }, { midi: 64, ms: 500, vel: 70, dur: 700 }]);
  let clock = 0; const timers = []; const heard = [];
  const stop = takes.play({ take: { notes, speed: 0.5 }, song: null, withMusic: false, sound: (m, on) => heard.push([m, on, clock]),
    now: () => clock, later: (fn, ms) => timers.push([clock + ms, fn]), cancel: () => {} });
  while (timers.length) { const [at, fn] = timers.shift(); clock = at; fn(); }
  assert.deepStrictEqual(heard.map((h) => [h[0], h[1]]), [[60, true], [64, true], [60, false], [64, false]]);
  assert.ok(heard[1][2] >= 985 && heard[1][2] <= 1040, "half speed: 500 ms of song is about 1 s: " + heard[1][2]);
  stop();
});

console.log(passed + " passed");
