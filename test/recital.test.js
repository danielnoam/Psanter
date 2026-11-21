// Recital and watch modes: `node test/recital.test.js`.
const assert = require("assert");
global.window = {};
require("../src/music.js");
require("../src/engine.js");
require("../src/recital.js");
require("../src/progress.js");
const { music, engine, recital, progress } = window.Psanter;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + (e.stack || e.message)); }
}

// C D E F in quarters at 60 bpm, right hand; left hand C2 then G2.
function scale() {
  const notes = [60, 62, 64, 65].map((midi, i) => ({ midi, ms: i * 1000, dur: 900, hand: "right" }));
  notes.push({ midi: 36, ms: 0, dur: 1900, hand: "left" }, { midi: 43, ms: 2000, dur: 1900, hand: "left" });
  return music.song({ notes, tempo: [{ ms: 0, bpm: 60 }], beatsPerBar: 4 });
}
const types = (evs, type) => evs.filter((e) => e.type === type);
function run(e, from, to, onFrame) { const out = []; for (let now = from; now <= to; now += 16) { if (onFrame) onFrame(now); out.push(...e.update(now)); } return out; }

test("points grow with good timing and the combo; a slip resets the combo", () => {
  const r = recital.create();
  for (let i = 0; i < recital.COMBO; i++) { r.feed({ type: "hit", step: i, offset: 20 }); r.feed({ type: "done", step: i, result: "hit" }); }
  assert.strictEqual(r.combo, recital.COMBO);
  assert.strictEqual(r.multiplier, 2);
  assert.strictEqual(r.points, 100 * (recital.COMBO - 1) + 200);
  r.feed({ type: "hit", step: 99, offset: 200 }); r.feed({ type: "done", step: 99, result: "hit" });
  assert.strictEqual(r.points, 100 * (recital.COMBO - 1) + 200 + 100, "a loose step earns half, times 2");
  r.feed({ type: "wrong", midi: 61 });
  assert.strictEqual(r.combo, 0);
  assert.strictEqual(r.multiplier, 1);
  const res = r.result(92);
  assert.strictEqual(res.stars, 4);
  assert.strictEqual(res.combo, recital.COMBO + 1);
  assert.strictEqual(res.perfect, recital.COMBO);
});

test("stars follow accuracy", () => {
  assert.deepStrictEqual([100, 97, 96, 90, 80, 65, 45, 44].map(recital.stars), [5, 5, 4, 4, 3, 2, 1, 0]);
});

test("recital never waits, turns the loop off, and a whole run says so at the end", () => {
  const e = engine.create(); e.load(scale()); e.setHands({ left: "auto" });
  e.setLoop({ on: true, from: 0, to: 2000 });
  e.setMode("recital");
  assert.strictEqual(e.loop.on, false);
  const r = recital.create();
  e.play(0); e.drain();
  const played = new Set();
  const evs = run(e, 0, 4200, (now) => {
    const want = e.required(e.next);
    if (e.next >= 0 && !played.has(e.next) && now >= e.song.steps[e.next].ms) { played.add(e.next); for (const m of want) e.noteOn(m, now); for (const ev of e.drain()) r.feed(ev); }
  });
  for (const ev of evs) r.feed(ev);
  assert.strictEqual(e.waiting, false);
  const end = types(evs, "end")[0];
  assert.ok(end, "the piece ends");
  assert.strictEqual(end.whole, true);
  assert.strictEqual(end.stats.misses, 0);
  assert.strictEqual(r.result(end.stats.accuracy).stars, 5);
  assert.strictEqual(r.points, 400);
});

test("a recital started from the middle isn't whole", () => {
  const e = engine.create(); e.load(scale()); e.setMode("recital");
  e.seek(2000); e.play(0); e.drain();
  const end = types(run(e, 0, 2500), "end")[0];
  assert.ok(end);
  assert.strictEqual(end.whole, false);
});

test("watch mode plays your hands too and asks for nothing", () => {
  const e = engine.create(); e.load(scale());
  e.setMode("watch");
  assert.deepStrictEqual(e.hands, { right: "me", left: "me" }, "your choice of hands is kept");
  e.play(0); e.drain();
  const evs = run(e, 0, 4200);
  const on = types(evs, "auto").filter((a) => a.on).map((a) => a.midi);
  assert.deepStrictEqual(on.sort((a, b) => a - b), [36, 43, 60, 62, 64, 65]);
  assert.strictEqual(types(evs, "miss").length, 0);
  e.noteOn(61, 5000);
  assert.strictEqual(types(e.drain(), "wrong").length, 0, "playing along isn't a mistake");
  e.setMode("wait");
  assert.deepStrictEqual(e.required(0).sort(), [36, 60]);
});

test("a hand set to off stays silent while watching", () => {
  const e = engine.create(); e.load(scale()); e.setHands({ left: "off" }); e.setMode("watch");
  e.play(0); e.drain();
  const on = types(run(e, 0, 4200), "auto").filter((a) => a.on).map((a) => a.midi);
  assert.ok(!on.includes(36) && !on.includes(43));
});

test("progress keeps the best recital: more stars, then more points", () => {
  let saved = null;
  const p = progress.create({ load: () => saved, save: (d) => { saved = d; } });
  const s = { hits: 10, late: 0, misses: 0, wrong: 0, accuracy: 92, timing: 30 };
  const a = { points: 900, stars: 4, combo: 9, perfect: 5 };
  p.addRun("k", "K", { speed: 1, mode: "recital", stats: s, recital: a }, "2026-11-20");
  assert.strictEqual(a.isBest, true);
  const b = { points: 1200, stars: 3, combo: 9, perfect: 5 };
  p.addRun("k", "K", { speed: 1, mode: "recital", stats: { ...s, accuracy: 85 }, recital: b }, "2026-11-20");
  assert.strictEqual(b.isBest, false);
  assert.strictEqual(p.piece("k").recital.points, 900);
  const c = { points: 1000, stars: 4, combo: 10, perfect: 6 };
  p.addRun("k", "K", { speed: 1, mode: "recital", stats: s, recital: c }, "2026-11-20");
  assert.strictEqual(p.piece("k").recital.points, 1000);
  assert.ok(p.piece("k").best, "a good recital counts toward the best tempo");
});

console.log(passed + " passed");
