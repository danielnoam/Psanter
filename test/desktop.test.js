// The Windows app's capability file: `node test/desktop.test.js`.
// opener:allow-open-url on its own has no scope, so every openUrl is
// refused, and the fallback window.open is swallowed by Tauri: links out
// did nothing. The scope must name what keel's openOutside lets through.
const assert = require("assert");
const fs = require("fs");
const path = require("path");

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log("  ok - " + name); }
  catch (e) { process.exitCode = 1; console.log("  FAIL - " + name + "\n    " + e.message); }
}

const cap = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "src-tauri", "capabilities", "default.json"), "utf8"));

test("links out may open in the browser: http, https and mail only", () => {
  const opener = cap.permissions.filter((p) => String(p.identifier || p).startsWith("opener:"));
  assert.deepStrictEqual(opener, [{
    identifier: "opener:allow-open-url",
    allow: [{ url: "https://*" }, { url: "http://*" }, { url: "mailto:*" }],
  }]);
});

console.log(passed + " passed");
