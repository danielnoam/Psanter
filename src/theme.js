// Your own colours on top of the light or dark theme. The editor changes
// tokens only (styles.css uses nothing else), each theme separately, and
// warns when text stops being readable. Saved in settings; shared as JSON.
(function () {
  const TOKENS = [
    ["Page", [["--bg", "Background"], ["--surface", "Panels"], ["--surface-2", "Raised"], ["--text", "Text"], ["--text-dim", "Quiet text"], ["--accent", "Accent"], ["--accent-text", "Text on accent"], ["--line-soft", "Dividers"]]],
    ["Music", [["--score-paper", "Score paper"], ["--score-ink", "Score ink"], ["--hand-right", "Right hand"], ["--hand-left", "Left hand"], ["--next", "Next note"]]],
    ["Results", [["--good", "Right"], ["--late", "Late"], ["--bad", "Wrong or missed"]]],
    ["Keyboard", [["--roll-bg", "Falling notes background"], ["--roll-grid", "Octave lines"], ["--roll-bar", "Bar lines"], ["--key-white", "White keys"], ["--key-black", "Black keys"], ["--roll-label", "Labels on notes"]]],
  ];
  const ALL = TOKENS.flatMap(([, list]) => list.map(([k]) => k));
  // Text over background pairs that must stay readable (WCAG AA, 4.5:1).
  const PAIRS = [["--text", "--bg"], ["--text", "--surface"], ["--text-dim", "--surface"], ["--accent-text", "--accent"], ["--score-ink", "--score-paper"]];

  const isHex = (s) => /^#[0-9a-f]{6}$/i.test(String(s).trim());

  // Only known tokens with plain colours: a pasted theme can't set anything else.
  function clean(obj) {
    const out = {};
    if (!obj || typeof obj !== "object") return out;
    for (const k of ALL) if (isHex(obj[k])) out[k] = obj[k].trim().toLowerCase();
    return out;
  }

  function parse(text) {
    let o;
    try { o = JSON.parse(text); } catch (e) { return null; }
    if (!o || typeof o !== "object") return null;
    const r = { light: clean(o.light), dark: clean(o.dark) };
    if (!Object.keys(r.light).length && !Object.keys(r.dark).length) { const flat = clean(o); if (!Object.keys(flat).length) return null; r.light = flat; }
    return r;
  }

  function luminance(hex) {
    const n = parseInt(hex.slice(1), 16);
    const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
    return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
  }
  function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }

  // The pairs below 4.5:1 for these colours (get(token) → hex).
  function problems(get) {
    const out = [];
    for (const [fg, bg] of PAIRS) {
      const a = get(fg), b = get(bg);
      if (isHex(a) && isHex(b)) { const r = contrast(a, b); if (r < 4.5) out.push({ fg, bg, ratio: Math.round(r * 10) / 10 }); }
    }
    return out;
  }

  // Sets the overrides on the page (and clears the ones not given).
  function apply(root, overrides) {
    for (const k of ALL) {
      if (overrides && overrides[k]) root.style.setProperty(k, overrides[k]);
      else root.style.removeProperty(k);
    }
  }

  // A token's colour as #rrggbb, whatever form the stylesheet wrote it in.
  function read(token, root) {
    const v = getComputedStyle(root).getPropertyValue(token).trim();
    if (isHex(v)) return v.toLowerCase();
    const m = /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(v);
    return m ? "#" + [m[1], m[2], m[3]].map((x) => (+x).toString(16).padStart(2, "0")).join("") : "#000000";
  }

  window.Piano = window.Piano || {};
  window.Piano.theme = { TOKENS, ALL, PAIRS, clean, parse, contrast, problems, apply, read };
})();
