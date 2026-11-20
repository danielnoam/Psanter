// Recital scoring: points for each step played, more for good timing and
// for a run of steps without a slip (the combo), and stars from how much
// was right. Pure: fed the engine's events, so the tests replay it.
(function () {
  const STEP = 100;
  // |offset| in ms at or under each: the share of STEP the step earns.
  const TIMING = [[60, 1], [150, 0.75], [Infinity, 0.5]];
  // Every COMBO steps in a row add one to the multiplier, up to MAX.
  const COMBO = 8, MAX = 4;
  // Accuracy (engine summary) at or above each gives that many stars.
  const STARS = [[97, 5], [90, 4], [80, 3], [65, 2], [45, 1]];

  function create() {
    let points = 0, combo = 0, best = 0, perfect = 0;
    const worst = new Map();
    return {
      feed(e) {
        if (e.type === "hit") worst.set(e.step, Math.max(worst.get(e.step) || 0, Math.abs(e.offset)));
        else if (e.type === "done") {
          const off = worst.get(e.step) || 0;
          worst.delete(e.step);
          const share = e.result === "late" ? 0.5 : TIMING.find(([ms]) => off <= ms)[1];
          if (share === 1) perfect++;
          combo++; best = Math.max(best, combo);
          points += Math.round(STEP * share * multiplier(combo));
        } else if (e.type === "miss" || e.type === "wrong") combo = 0;
      },
      get points() { return points; }, get combo() { return combo; }, get multiplier() { return multiplier(combo); },
      result(accuracy) { return { points, combo: best, perfect, stars: stars(accuracy) }; },
    };
  }
  function multiplier(combo) { return Math.min(MAX, 1 + Math.floor(combo / COMBO)); }
  function stars(accuracy) { const s = STARS.find(([min]) => accuracy >= min); return s ? s[1] : 0; }

  window.Piano = window.Piano || {};
  window.Piano.recital = { create, stars, multiplier, COMBO, MAX };
})();
