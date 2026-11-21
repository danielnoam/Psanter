// Falling notes over a keyboard, on one canvas so the two always line up.
// Drawn only when something changed (the app calls draw()); colours are
// the theme's tokens, read again when the theme changes.
(function () {
  function create(canvas) {
    const ctx = canvas.getContext("2d", { alpha: false });
    let song = null, maxDur = 0, colors = null, w = 0, h = 0, dpr = 1;
    let lo = 48, hi = 84, keys = [], keyAt = new Map(), whiteW = 10, kbTop = 0;
    let rangeMode = "song";
    let labels = { names: false, fingers: false, system: "letters" };
    let effects = null;

    function readColors() {
      const s = getComputedStyle(document.documentElement);
      const v = (n, f) => (s.getPropertyValue(n) || "").trim() || f;
      colors = {
        bg: v("--roll-bg", "#1b1c1a"), grid: v("--roll-grid", "#2c2e2a"), bar: v("--roll-bar", "#3a3d37"),
        right: v("--hand-right", "#4f9d84"), left: v("--hand-left", "#6f86d6"),
        good: v("--good", "#3f9b5d"), bad: v("--bad", "#c8553d"), late: v("--late", "#c99a2e"),
        white: v("--key-white", "#f4f3ef"), black: v("--key-black", "#222320"), keyLine: v("--key-line", "#8a8d85"),
        label: v("--roll-label", "#ffffff"), next: v("--next", "#ffd166"),
      };
    }

    function setSong(s) {
      song = s;
      maxDur = s ? s.notes.reduce((m, n) => Math.max(m, n.dur), 0) : 0;
      layoutKeys();
    }
    function setRange(mode) { rangeMode = mode; layoutKeys(); }
    function setLabels(l) { labels = { ...labels, ...l }; }
    function setEffects(fx) { effects = fx; }

    function layoutKeys() {
      const M = window.Psanter.music;
      if (rangeMode === "full" || !song || !song.notes.length) { lo = M.LOWEST; hi = M.HIGHEST; }
      else {
        // The song's notes, out to whole octaves (C to B), at least two.
        lo = Math.max(M.LOWEST, song.range[0] - (song.range[0] % 12) - (song.range[0] % 12 < 2 ? 12 : 0));
        hi = Math.min(M.HIGHEST, song.range[1] + (11 - (song.range[1] % 12)));
        while (hi - lo < 23) { if (lo > M.LOWEST + 11) lo -= 12; else if (hi < M.HIGHEST - 11) hi += 12; else break; }
      }
      resize();
    }

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
      const M = window.Psanter.music;
      let whites = 0;
      for (let m = lo; m <= hi; m++) if (!M.isBlack(m)) whites++;
      whiteW = w / Math.max(1, whites);
      kbTop = Math.round(h - Math.min(150, Math.max(64, h * 0.24), whiteW * 6));
      keys = []; keyAt = new Map();
      let x = 0;
      for (let m = lo; m <= hi; m++) {
        if (M.isBlack(m)) {
          const k = { midi: m, black: true, x: x - whiteW * 0.3, w: whiteW * 0.6 };
          keys.push(k); keyAt.set(m, k);
        } else {
          const k = { midi: m, black: false, x, w: whiteW };
          keys.push(k); keyAt.set(m, k); x += whiteW;
        }
      }
      if (!colors) readColors();
    }

    // Which key is under a point on the keyboard (for playing with the mouse).
    function keyFromPoint(px, py) {
      if (py < kbTop) return null;
      const blackH = (h - kbTop) * 0.62;
      if (py < kbTop + blackH) for (const k of keys) if (k.black && px >= k.x && px < k.x + k.w) return k.midi;
      for (const k of keys) if (!k.black && px >= k.x && px < k.x + k.w) return k.midi;
      return null;
    }

    function lowerBound(list, ms) {
      let a = 0, b = list.length;
      while (a < b) { const m = (a + b) >> 1; if (list[m].ms < ms) a = m + 1; else b = m; }
      return a;
    }

    // state: { t, hands, held: Map midi→kind, expected: Set, results: Map step→result, lookahead }
    function draw(state) {
      if (!colors) readColors();
      const c = ctx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.fillStyle = colors.bg; c.fillRect(0, 0, w, h);
      const look = state.lookahead || 3000;
      const pxPerMs = kbTop / look;
      const t = state.t || 0;
      const y = (ms) => kbTop - (ms - t) * pxPerMs;
      // Octave lines (at each C) and bar lines.
      c.fillStyle = colors.grid;
      for (const k of keys) if (!k.black && k.midi % 12 === 0) c.fillRect(Math.round(k.x), 0, 1, kbTop);
      if (song) {
        c.fillStyle = colors.bar;
        for (const b of song.bars) { const yy = y(b); if (yy < 0) break; if (yy <= kbTop) c.fillRect(0, Math.round(yy), w, 1); }
        const from = lowerBound(song.notes, t - maxDur), to = t + look;
        const r = Math.max(2, Math.min(6, whiteW * 0.18));
        c.font = "600 " + Math.round(Math.max(9, Math.min(13, whiteW * 0.42))) + "px system-ui, sans-serif";
        c.textAlign = "center"; c.textBaseline = "bottom";
        for (let i = from; i < song.notes.length; i++) {
          const n = song.notes[i];
          if (n.ms > to) break;
          if (n.ms + n.dur < t) continue;
          const k = keyAt.get(n.midi); if (!k) continue;
          const role = state.hands[n.hand] || "me";
          const yTop = Math.max(-4, y(n.ms + n.dur)), yBot = Math.min(kbTop, y(n.ms));
          if (yBot - yTop < 1) continue;
          const result = state.results && state.results.get(n.step);
          let fill = n.hand === "left" ? colors.left : colors.right;
          if (result === "hit") fill = colors.good; else if (result === "miss") fill = colors.bad; else if (result === "late") fill = colors.late;
          const x = k.x + 1, wd = Math.max(2, k.w - 2);
          c.globalAlpha = role === "me" ? 1 : role === "auto" ? 0.5 : 0.18;
          roundRect(c, x, yTop, wd, yBot - yTop, r);
          c.fillStyle = fill; c.fill();
          if (state.expected && state.expected.has(n.midi) && n.step === state.next) {
            c.globalAlpha = 1; c.lineWidth = 2; c.strokeStyle = colors.next; c.stroke();
          }
          c.globalAlpha = 1;
          if ((labels.names || (labels.fingers && n.finger)) && yBot - yTop > 14 && wd > 9) {
            const M = window.Psanter.music;
            const text = labels.fingers && n.finger ? String(n.finger) : (labels.system === "solfege" ? M.name(n.midi, "solfege") : M.letter(n.midi));
            c.fillStyle = colors.label;
            c.fillText(text, x + wd / 2, yBot - 3);
          }
        }
      }
      if (state.trail && state.trail.length) {
        const now = state.now, r = Math.max(2, Math.min(6, whiteW * 0.18));
        c.fillStyle = colors.right;
        for (const n of state.trail) {
          const k = keyAt.get(n.midi); if (!k) continue;
          const yTop = kbTop - (now - n.start) * pxPerMs, yBot = kbTop - (n.end ? (now - n.end) * pxPerMs : 0);
          if (yBot < 0) continue;
          c.globalAlpha = Math.max(0.25, Math.min(1, yBot / kbTop + 0.3));
          roundRect(c, k.x + 1, Math.max(-4, yTop), Math.max(2, k.w - 2), Math.max(2, yBot - Math.max(-4, yTop)), r); c.fill();
        }
        c.globalAlpha = 1;
      }
      if (effects) effects.draw(c, { w, h, kbTop, keyAt, colors, t, now: state.now, held: state.held, keyBox: (m) => keyAt.get(m) });
      drawKeys(state);
    }

    function drawKeys(state) {
      const c = ctx, kh = h - kbTop, blackH = kh * 0.62;
      const held = state.held || new Map();
      c.fillStyle = colors.keyLine; c.fillRect(0, kbTop - 2, w, 2);
      for (const k of keys) {
        if (k.black) continue;
        c.fillStyle = colorFor(k.midi, held, state, colors.white);
        c.fillRect(k.x, kbTop, k.w, kh);
        c.fillStyle = colors.keyLine; c.fillRect(Math.round(k.x), kbTop, 1, kh);
        mark(k, kbTop + kh - 10, state);
      }
      for (const k of keys) {
        if (!k.black) continue;
        c.fillStyle = colorFor(k.midi, held, state, colors.black);
        roundRect(c, k.x, kbTop - 1, k.w, blackH, 2); c.fill();
        mark(k, kbTop + blackH - 9, state);
      }
      // Middle C, so the keyboard reads at a glance.
      const mc = keyAt.get(60);
      if (mc) { c.fillStyle = colors.keyLine; c.beginPath(); c.arc(mc.x + mc.w / 2, kbTop + kh - 22, 2.5, 0, Math.PI * 2); c.fill(); }
    }

    function colorFor(midi, held, state, base) {
      const kind = held.get(midi);
      if (!kind) return base;
      if (kind === "wrong") return colors.bad;
      if (kind === "auto-left") return mix(base, colors.left, 0.6);
      if (kind === "auto-right") return mix(base, colors.right, 0.6);
      if (kind === "good") return colors.good;
      return mix(base, colors.right, 0.75);
    }

    function mark(k, yy, state) {
      if (!state.expected || !state.expected.has(k.midi)) return;
      ctx.fillStyle = colors.next;
      ctx.beginPath(); ctx.arc(k.x + k.w / 2, yy, Math.max(2.5, Math.min(5, k.w * 0.18)), 0, Math.PI * 2); ctx.fill();
    }

    function roundRect(c, x, y, wd, ht, r) {
      r = Math.min(r, wd / 2, ht / 2);
      c.beginPath();
      c.moveTo(x + r, y); c.lineTo(x + wd - r, y); c.quadraticCurveTo(x + wd, y, x + wd, y + r);
      c.lineTo(x + wd, y + ht - r); c.quadraticCurveTo(x + wd, y + ht, x + wd - r, y + ht);
      c.lineTo(x + r, y + ht); c.quadraticCurveTo(x, y + ht, x, y + ht - r);
      c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
    }

    function mix(a, b, f) {
      const pa = hex(a), pb = hex(b);
      if (!pa || !pb) return b;
      const m = pa.map((v, i) => Math.round(v + (pb[i] - v) * f));
      return "rgb(" + m.join(",") + ")";
    }
    function hex(s) {
      const m = /^#?([0-9a-f]{6})$/i.exec(String(s).trim());
      if (!m) return null;
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }

    return { setSong, setRange, setLabels, setEffects, resize, draw, readColors, keyFromPoint,
      get range() { return [lo, hi]; }, get keyboardTop() { return kbTop; }, keyBox: (m) => keyAt.get(m) };
  }

  window.Psanter = window.Psanter || {};
  window.Psanter.roll = { create };
})();
