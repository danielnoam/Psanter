// Panel layouts: `node test/layout.test.js`.
const assert = require("assert");
global.window = {};
require("../src/layout.js");
const L = window.Piano.layout;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + (e.stack || e.message)); }
}

const known = ["lesson", "score", "roll", "pdf"];
const base = { dir: "row", sizes: [0.4, 0.6], children: ["lesson", { dir: "col", sizes: [0.5, 0.5], children: ["score", "roll"] }] };

test("panels lists every panel shown", () => {
  assert.deepStrictEqual(L.panels(base), ["lesson", "score", "roll"]);
});

test("normalize drops unknown and repeated panels and fixes the sizes", () => {
  const n = L.normalize({ dir: "row", sizes: [2, 2, 4], children: ["lesson", "ghost", "lesson"] }, known);
  assert.strictEqual(n, "lesson");
  const m = L.normalize({ dir: "row", sizes: [1, 3], children: ["lesson", "score"] }, known);
  assert.deepStrictEqual(m.sizes, [0.25, 0.75]);
});

test("normalize merges a row inside a row", () => {
  const n = L.normalize({ dir: "row", sizes: [0.5, 0.5], children: ["lesson", { dir: "row", sizes: [0.5, 0.5], children: ["score", "roll"] }] }, known);
  assert.deepStrictEqual(n.children, ["lesson", "score", "roll"]);
  assert.ok(Math.abs(n.sizes.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("a garbled saved layout comes back null, not a crash", () => {
  assert.strictEqual(L.normalize({ nonsense: true }, known), null);
  assert.strictEqual(L.normalize(42, known), null);
});

test("removing a panel closes its gap", () => {
  const r = L.remove(base, "score");
  assert.deepStrictEqual(L.panels(r), ["lesson", "roll"]);
  assert.strictEqual(r.children[1], "roll");
});

test("placing a panel beside another splits that one", () => {
  const r = L.normalize(L.place(base, "pdf", "lesson", "bottom"), known);
  assert.deepStrictEqual(L.panels(r), ["lesson", "pdf", "score", "roll"]);
  assert.strictEqual(r.children[0].dir, "col");
});

test("moving a shown panel takes it from where it was", () => {
  const r = L.normalize(L.place(base, "roll", "lesson", "left"), known);
  assert.deepStrictEqual(L.panels(r), ["roll", "lesson", "score"]);
});

test("dropping on the center swaps two panels", () => {
  const r = L.place(base, "lesson", "roll", "center");
  assert.deepStrictEqual(L.panels(r), ["roll", "score", "lesson"]);
});

test("show adds a hidden panel back once", () => {
  const r = L.show(base, "pdf", known);
  assert.deepStrictEqual(L.panels(r).sort(), ["lesson", "pdf", "roll", "score"]);
  assert.strictEqual(L.show(r, "pdf", known), r);
});

test("resizing moves the handle and refuses to squash a panel", () => {
  const r = L.resize(base, [], 0, 0.1);
  assert.ok(Math.abs(r.sizes[0] - 0.5) < 1e-9);
  assert.strictEqual(L.resize(base, [], 0, 0.58), base);
  const inner = L.resize(base, [1], 0, -0.2);
  assert.ok(Math.abs(inner.children[1].sizes[0] - 0.3) < 1e-9);
});

console.log(passed + " passed");
