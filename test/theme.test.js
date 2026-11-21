// The theme editor's checks: `node test/theme.test.js`.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
global.window = {};
require("../src/theme.js");
const { theme } = window.Psanter;

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + (e.stack || e.message)); }
}

test("a pasted theme keeps only known tokens with plain colours", () => {
  const r = theme.parse(JSON.stringify({ light: { "--bg": "#FFFFFF", "--evil": "#000000", "--text": "url(x)" }, dark: {} }));
  assert.deepStrictEqual(r.light, { "--bg": "#ffffff" });
});

test("a flat object is the light theme; junk is nothing", () => {
  assert.deepStrictEqual(theme.parse('{"--accent":"#112233"}').light, { "--accent": "#112233" });
  assert.strictEqual(theme.parse("not json"), null);
  assert.strictEqual(theme.parse('{"--nope":"#112233"}'), null);
});

test("contrast is WCAG's", () => {
  assert.strictEqual(Math.round(theme.contrast("#000000", "#ffffff")), 21);
  const bad = theme.problems((k) => ({ "--text": "#777777", "--bg": "#888888" })[k]);
  assert.deepStrictEqual(bad.map((p) => p.fg + p.bg), ["--text--bg"]);
});

test("every editable token is defined in both themes", () => {
  const css = fs.readFileSync(path.join(__dirname, "../src/styles.css"), "utf8");
  for (const k of theme.ALL) assert.ok(css.includes(k + ":"), k + " is in styles.css");
});

console.log(passed + " passed");
