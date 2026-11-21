// The score adapters' pure parts: `node test/score.test.js`.
const assert = require("assert");
global.window = {};
require("../src/score.js");
const { score } = window.Psanter;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + (e.stack || e.message)); }
}

test("the tempo map follows tempo changes (whole notes to ms)", () => {
  // A 4/4 bar at 120, then a bar at 60, then back to 120.
  const toMs = score.tempoMap([{ at: 0, bpm: 120 }, { at: 1, bpm: 60 }, { at: 2, bpm: 120 }]);
  assert.strictEqual(toMs(0), 0);
  assert.strictEqual(toMs(0.25), 500);
  assert.strictEqual(toMs(1), 2000);
  assert.strictEqual(toMs(1.25), 3000);
  assert.strictEqual(toMs(2), 6000);
  assert.strictEqual(toMs(3), 8000);
});

test("one tempo is a straight line", () => {
  const toMs = score.tempoMap([{ at: 0, bpm: 100 }]);
  assert.strictEqual(toMs(1), 2400);
});

console.log(passed + " passed");
