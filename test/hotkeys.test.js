// Rebindable shortcuts: `node test/hotkeys.test.js`.
const assert = require("assert");
global.window = {};
require("../src/hotkeys.js");
const { hotkeys } = window.Psanter;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + (e.stack || e.message)); }
}

test("keydowns read the way bindings are written", () => {
  assert.strictEqual(hotkeys.keyOf({ key: " " }), " ");
  assert.strictEqual(hotkeys.keyOf({ key: "L", shiftKey: true }), "Shift+L");
  assert.strictEqual(hotkeys.keyOf({ key: "l", ctrlKey: true }), "Ctrl+L");
  assert.strictEqual(hotkeys.keyOf({ key: "ArrowUp" }), "ArrowUp");
  assert.strictEqual(hotkeys.keyOf({ key: "Shift", shiftKey: true }), null);
});

test("the defaults find their actions", () => {
  const h = hotkeys.create();
  assert.strictEqual(h.actionForKey(" "), "toggle");
  assert.strictEqual(h.actionForKey("Shift+L"), "loop");
  assert.strictEqual(h.actionForKey("L"), null, "a plain letter is left for playing");
});

test("binding a key takes it from the action that had it", () => {
  const h = hotkeys.create();
  h.bind("loop", " ");
  assert.strictEqual(h.actionForKey(" "), "loop");
  assert.strictEqual(h.keys.toggle, "");
});

test("a piano key is one action's, and one action has one piano key", () => {
  const h = hotkeys.create();
  h.bindNote("toggle", 21); h.bindNote("restart", 21);
  assert.strictEqual(h.actionForNote(21), "restart");
  assert.strictEqual(h.noteFor("toggle"), null);
  h.bindNote("restart", 22);
  assert.strictEqual(h.actionForNote(21), null);
  assert.strictEqual(h.noteFor("restart"), 22);
});

test("labels are readable", () => {
  assert.strictEqual(hotkeys.label(" "), "Space");
  assert.strictEqual(hotkeys.label("ArrowLeft"), "←");
  assert.strictEqual(hotkeys.label(""), "—");
});

test("a pedal can be a shortcut, beside the piano keys", () => {
  const h = hotkeys.create({}, {});
  h.bindNote("barBack", 21);
  h.bindNote("restart", "pedal67");
  assert.strictEqual(h.actionForNote("pedal67"), "restart");
  assert.strictEqual(h.noteFor("restart"), "pedal67");
  assert.strictEqual(h.noteFor("barBack"), 21);
  h.bindNote("loop", "pedal67");
  assert.strictEqual(h.noteFor("restart"), null, "a pedal moves to its new action");
  h.bindNote("loop", null);
  assert.strictEqual(h.actionForNote("pedal67"), null);
});

console.log(passed + " passed");
