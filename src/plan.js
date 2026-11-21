// A practice plan for a piece: its bars in sections, each section learned
// hands separately, then together, from slow up to full speed, then the
// whole piece. A step is passed with a clean loop pass. Pure: the song in,
// the steps out; app.js keeps where you are.
(function () {
  const SPEEDS = [0.6, 0.8, 1];

  // song: music.song(); opts: { barsPer (default 4) }
  function make(song, opts = {}) {
    if (!song || !song.steps.length) return [];
    const measures = [...new Set(song.steps.map((s) => s.measure))].sort((a, b) => a - b);
    const per = opts.barsPer || (measures.length <= 8 ? 2 : 4);
    const hands = new Set(song.notes.map((n) => n.hand));
    const steps = [];
    const span = (from, to) => {
      const inBars = song.steps.filter((s) => s.measure >= from && s.measure <= to);
      return { has: (h) => inBars.some((s) => s.notes.some((n) => n.hand === h)) };
    };
    for (let i = 0; i < measures.length; i += per) {
      const from = measures[i], to = measures[Math.min(measures.length, i + per) - 1];
      const here = span(from, to);
      const both = hands.size > 1 && here.has("right") && here.has("left");
      if (both) {
        steps.push({ from, to, hands: "right", speed: SPEEDS[0] });
        steps.push({ from, to, hands: "left", speed: SPEEDS[0] });
      }
      for (const speed of SPEEDS) steps.push({ from, to, hands: both ? "both" : here.has("left") ? "left" : "right", speed });
    }
    if (measures.length > per) {
      const all = hands.size > 1 ? "both" : hands.has("left") ? "left" : "right";
      for (const speed of SPEEDS.slice(1)) steps.push({ from: measures[0], to: measures[measures.length - 1], hands: all, speed, whole: true });
    }
    return steps;
  }

  window.Psanter = window.Psanter || {};
  window.Psanter.plan = { make, SPEEDS };
})();
