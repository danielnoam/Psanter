// The page's Content-Security-Policy and the code under it, through keel's
// check (tools/keel-checks.js): `node test/csp.test.js`. A looser policy
// is a decision: write why in ARCHITECTURE.md's Trade-offs, and let this
// test name exactly what was loosened.
const assert = require("assert");
const fs = require("fs");
const path = require("path");
const { csp } = require("../tools/keel-checks.js");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + e.message); }
}

const ROOT = path.join(__dirname, "..");
const js = (dir) => fs.existsSync(path.join(ROOT, dir))
  ? fs.readdirSync(path.join(ROOT, dir)).filter((f) => /\.m?js$/.test(f)).map((f) => path.join(ROOT, dir, f)) : [];

test("index.html's policy is strict and the code needs nothing looser", () => {
  const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
  // Loosened on purpose (ARCHITECTURE.md, Trade-offs): style-src allows
  // inline styles, because abcjs and OpenSheetMusicDisplay set style
  // attributes while they draw. Scripts stay 'self' only. OSMD's one
  // `new Function` is a fallback the browser never reaches (globalThis
  // exists), and the policy would block it anyway.
  assert.deepStrictEqual(csp.check(html, [...js("src"), ...js("src/keel"), ...js("src/vendor")]), [
    "the policy allows unsafe-inline or unsafe-eval",
    "vendor/abcjs.min.js sets a style attribute",
    "vendor/osmd.min.js sets a style attribute",
    "vendor/osmd.min.js uses eval or new Function",
  ]);
  assert.ok(/script-src 'self';/.test(html) && !/script-src[^;]*unsafe/.test(html), "scripts stay 'self' only");
  assert.ok(!/unsafe-eval/.test(html));
});

console.log(passed + " passed");
