// Glow over the keys you hold and sparks where a note lands, drawn into
// the falling-notes canvas (roll.setEffects). Off under reduced motion
// unless turned on; cheap enough to leave on: a fixed pool of sparks.
(function () {
  const POOL = 160;

  function create() {
    let level = "subtle";
    const sparks = [];
    let lastNow = 0;

    function burst(midi, kind, now) {
      if (level === "off") return;
      const n = level === "full" ? 14 : 6;
      for (let i = 0; i < n; i++) {
        if (sparks.length >= POOL) sparks.shift();
        const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.6;
        const v = 0.08 + Math.random() * (level === "full" ? 0.22 : 0.12);
        sparks.push({ midi, kind, born: now, life: 380 + Math.random() * 420, dx: (Math.random() - 0.5) * 0.6, vx: Math.cos(a) * v, vy: Math.sin(a) * v });
      }
    }

    // info: { kbTop, keyBox(midi), colors, held: Map midi→kind, now }
    function draw(c, info) {
      if (level === "off") return;
      const now = info.now || 0;
      lastNow = now;
      const glowH = level === "full" ? 90 : 46;
      c.save();
      c.globalCompositeOperation = "lighter";
      if (info.held) for (const [m, kind] of info.held) {
        const k = info.keyBox(m); if (!k) continue;
        const col = kind === "wrong" ? info.colors.bad : kind === "auto-left" ? info.colors.left : kind === "good" ? info.colors.good : info.colors.right;
        const cx = k.x + k.w / 2;
        const g = c.createLinearGradient(0, info.kbTop - glowH, 0, info.kbTop);
        g.addColorStop(0, "rgba(0,0,0,0)");
        g.addColorStop(1, withAlpha(col, level === "full" ? 0.55 : 0.35));
        c.fillStyle = g;
        c.fillRect(cx - k.w * 0.9, info.kbTop - glowH, k.w * 1.8, glowH);
      }
      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i];
        const age = now - s.born;
        if (age > s.life || age < 0) { sparks.splice(i, 1); continue; }
        const k = info.keyBox(s.midi); if (!k) continue;
        const x = k.x + k.w / 2 + s.dx * k.w + s.vx * age;
        const y = info.kbTop + s.vy * age + 0.00012 * age * age;
        const f = 1 - age / s.life;
        c.fillStyle = withAlpha(s.kind === "wrong" ? info.colors.bad : s.kind === "good" ? info.colors.good : info.colors.next, f);
        c.fillRect(x - 1.5, y - 1.5, 3, 3);
      }
      c.restore();
    }

    return {
      burst, draw,
      busy: (now) => level !== "off" && sparks.some((s) => now - s.born < s.life),
      setLevel(l) { level = l === "full" || l === "off" ? l : "subtle"; if (level === "off") sparks.length = 0; },
      get level() { return level; },
    };
  }

  function withAlpha(color, a) {
    const m = /^#?([0-9a-f]{6})$/i.exec(String(color).trim());
    if (!m) return color;
    const n = parseInt(m[1], 16);
    return "rgba(" + ((n >> 16) & 255) + "," + ((n >> 8) & 255) + "," + (n & 255) + "," + Math.max(0, Math.min(1, a)).toFixed(3) + ")";
  }

  window.Piano = window.Piano || {};
  window.Piano.effects = { create };
})();
