// The strip under the music: bars, where you are, the loop, and how each
// step went. Click a bar to go there; drag across bars to loop them.
(function () {
  function create(canvas, { onSeek, onLoop }) {
    const ctx = canvas.getContext("2d");
    let song = null, w = 0, h = 0, dpr = 1, colors = null, drag = null;

    function readColors() {
      const s = getComputedStyle(document.documentElement);
      const v = (n, f) => (s.getPropertyValue(n) || "").trim() || f;
      colors = { track: v("--surface-2", "#e9e8e3"), tick: v("--line", "#8a8d85"), head: v("--accent", "#2F5D50"),
        loop: v("--loop", "rgba(47,93,80,.18)"), good: v("--good", "#3f9b5d"), bad: v("--bad", "#c8553d"), late: v("--late", "#c99a2e"), text: v("--text-dim", "#5C5F58") };
    }

    function resize() {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      const r = canvas.getBoundingClientRect();
      w = Math.max(1, Math.round(r.width)); h = Math.max(1, Math.round(r.height));
      canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    }

    const x = (ms) => (song && song.end ? (ms / song.end) * w : 0);
    function barFromX(px) {
      if (!song || !song.bars.length) return 0;
      const ms = Math.max(0, Math.min(song.end, (px / w) * song.end));
      let b = 0;
      for (let i = 0; i < song.bars.length; i++) if (song.bars[i] <= ms && song.bars[i] < song.end) b = i;
      return b;
    }

    function draw(state) {
      if (!colors) readColors();
      const c = ctx;
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      c.clearRect(0, 0, w, h);
      c.fillStyle = colors.track;
      c.fillRect(0, h / 2 - 8, w, 16);
      if (!song) return;
      const loop = drag && drag.moved ? { on: true, from: song.bars[Math.min(drag.a, drag.b)], to: barEnd(Math.max(drag.a, drag.b)) } : state.loop;
      if (loop && loop.on) { c.fillStyle = colors.loop; c.fillRect(x(loop.from), 2, Math.max(2, x(loop.to) - x(loop.from)), h - 4); }
      c.fillStyle = colors.tick;
      const every = Math.max(1, Math.ceil(song.bars.length / (w / 28)));
      c.font = "11px system-ui, sans-serif"; c.textBaseline = "top"; c.textAlign = "left";
      song.bars.forEach((b, i) => {
        if (b >= song.end) return;
        c.fillRect(Math.round(x(b)), h / 2 - 8, 1, 16);
        if (i % every === 0) { c.fillStyle = colors.text; c.fillText(String(i + 1), x(b) + 3, 0); c.fillStyle = colors.tick; }
      });
      if (state.results) {
        for (const [step, r] of state.results) {
          const s = song.steps[step]; if (!s) continue;
          c.fillStyle = r === "hit" ? colors.good : r === "late" ? colors.late : colors.bad;
          c.fillRect(Math.round(x(s.ms)), h / 2 + 3, 2, 5);
        }
      }
      c.fillStyle = colors.head;
      c.fillRect(Math.round(x(state.t)) - 1, 2, 3, h - 4);
    }
    const barEnd = (b) => (song.bars[b + 1] != null ? Math.min(song.bars[b + 1], song.end) : song.end);

    canvas.addEventListener("pointerdown", (e) => {
      if (!song) return;
      canvas.setPointerCapture(e.pointerId);
      const r = canvas.getBoundingClientRect();
      const b = barFromX(e.clientX - r.left);
      drag = { a: b, b, moved: false, x: e.clientX };
    });
    canvas.addEventListener("pointermove", (e) => {
      if (!drag) return;
      const r = canvas.getBoundingClientRect();
      const b = barFromX(e.clientX - r.left);
      if (Math.abs(e.clientX - drag.x) > 6 || b !== drag.a) drag.moved = true;
      drag.b = b;
    });
    const up = () => {
      if (!drag) return;
      const d = drag; drag = null;
      if (d.moved) { const a = Math.min(d.a, d.b), b = Math.max(d.a, d.b); onLoop(song.bars[a], barEnd(b), a, b); }
      else onSeek(song.bars[d.a] || 0);
    };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", () => { drag = null; });

    return { setSong(s) { song = s; }, resize, draw, readColors, get dragging() { return !!drag; } };
  }

  window.Piano = window.Piano || {};
  window.Piano.timeline = { create };
})();
