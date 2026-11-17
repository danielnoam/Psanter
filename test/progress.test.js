// Progress over days: `node test/progress.test.js`.
const assert = require("assert");
global.window = {};
require("../src/progress.js");
const { progress } = window.Piano;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + (e.stack || e.message)); }
}
function memory(start) { let saved = start; return { load: () => saved, save: (d) => { saved = JSON.parse(JSON.stringify(d)); }, get saved() { return saved; } }; }
const stats = (accuracy, extra = {}) => ({ hits: 10, late: 0, misses: 0, wrong: 0, accuracy, timing: 40, ...extra });

test("time adds up per day and per piece, and is saved on flush", () => {
  const m = memory(null); const p = progress.create(m);
  p.addTime("a", "A", 30, "2026-11-17"); p.addTime("a", "A", 45, "2026-11-17"); p.addTime(null, null, 10, "2026-11-17");
  assert.strictEqual(p.today("2026-11-17"), 85);
  assert.strictEqual(p.piece("a").seconds, 75);
  assert.strictEqual(m.saved, null);
  p.flush();
  assert.strictEqual(m.saved.days["2026-11-17"], 85);
});

test("best tempo is the fastest good flow run, never a wait run", () => {
  const p = progress.create(memory(null));
  p.addRun("a", "A", { speed: 1.2, mode: "wait", stats: stats(100) }, "2026-11-17");
  assert.strictEqual(p.piece("a").best, null);
  p.addRun("a", "A", { speed: 0.8, mode: "flow", stats: stats(95) }, "2026-11-17");
  p.addRun("a", "A", { speed: 1, mode: "flow", stats: stats(70) }, "2026-11-17");
  assert.strictEqual(p.piece("a").best.speed, 0.8);
  assert.strictEqual(p.piece("a").runs, 3);
});

test("weak bars are the ones missed most per time played", () => {
  const p = progress.create(memory(null));
  p.addRun("a", "A", { speed: 1, mode: "flow", stats: stats(80), bars: { 1: { played: 4, miss: 0 }, 2: { played: 4, miss: 2 }, 3: { played: 2, miss: 0, late: 2 } } }, "2026-11-17");
  assert.deepStrictEqual(p.weakBars("a").map((b) => b.measure), [2, 3]);
});

test("barsOf counts results per bar", () => {
  const song = { steps: [{ measure: 0 }, { measure: 0 }, { measure: 1 }] };
  const bars = progress.barsOf(song, new Map([[0, "hit"], [1, "miss"], [2, "late"]]));
  assert.deepStrictEqual(bars, { 0: { played: 2, miss: 1, late: 0 }, 1: { played: 1, miss: 0, late: 1 } });
});

test("days and streaks cross month ends, and today not done yet keeps the streak", () => {
  const p = progress.create(memory({ v: 1, pieces: {}, days: { "2026-10-30": 300, "2026-10-31": 120, "2026-11-01": 90 } }));
  assert.deepStrictEqual(p.days(3, "2026-11-01").map((d) => d.seconds), [300, 120, 90]);
  assert.strictEqual(p.streak("2026-11-01"), 3);
  assert.strictEqual(p.streak("2026-11-02"), 3, "nothing yet today");
  assert.strictEqual(p.streak("2026-11-03"), 0);
});

test("a broken save starts fresh", () => {
  const p = progress.create({ load: () => { throw new Error("bad"); }, save() {} });
  assert.strictEqual(p.today("2026-11-17"), 0);
});

console.log(passed + " passed");
