// What you've practised and how it went, kept on this computer: time per
// day, and per piece its runs, best tempo and the bars that trip you up.
// Pure over a store ({ load(), save(data) }), so the tests use a plain
// object and the app uses localStorage.
(function () {
  const HISTORY = 40;
  // A flow-mode run this good counts toward the piece's best tempo.
  const GOOD = 90;

  function create(store) {
    let data = blank();
    try { const d = store.load(); if (d && d.v === 1) data = { ...blank(), ...d }; } catch (e) { /* a broken save starts over */ }
    let dirty = false;

    function blank() { return { v: 1, pieces: {}, days: {} }; }
    function piece(key, title) {
      let p = data.pieces[key];
      if (!p) p = data.pieces[key] = { title: title || key, seconds: 0, runs: 0, clean: 0, best: null, bars: {}, history: [] };
      if (title) p.title = title;
      return p;
    }
    function touch() { dirty = true; }
    function flush() { if (!dirty) return; dirty = false; try { store.save(data); } catch (e) { dirty = true; } }

    function addTime(key, title, seconds, day) {
      if (!(seconds > 0)) return;
      data.days[day] = (data.days[day] || 0) + seconds;
      if (key) { const p = piece(key, title); p.seconds += seconds; p.lastDay = day; }
      touch();
    }

    // run: { speed, mode, stats: {hits, late, misses, wrong, accuracy, timing}, bars: {measure: {played, miss, late}}, clean, kind }
    function addRun(key, title, run, day) {
      const p = piece(key, title);
      const s = run.stats;
      p.runs++;
      if (run.clean) p.clean++;
      p.lastDay = day;
      p.history.push({ day, speed: run.speed, mode: run.mode, accuracy: s.accuracy, wrong: s.wrong, misses: s.misses, late: s.late, timing: s.timing, kind: run.kind });
      if (p.history.length > HISTORY) p.history.splice(0, p.history.length - HISTORY);
      if (run.mode === "flow" && s.accuracy >= GOOD && (!p.best || run.speed > p.best.speed)) p.best = { speed: run.speed, accuracy: s.accuracy, day };
      for (const [m, b] of Object.entries(run.bars || {})) {
        const o = p.bars[m] || (p.bars[m] = { played: 0, miss: 0, late: 0 });
        o.played += b.played || 0; o.miss += b.miss || 0; o.late += b.late || 0;
      }
      touch();
      return p;
    }

    // The bars with the most trouble per time played, worst first.
    function weakBars(key, n = 3) {
      const p = data.pieces[key];
      if (!p) return [];
      return Object.entries(p.bars)
        .map(([m, b]) => ({ measure: +m, played: b.played, score: (b.miss + b.late * 0.5) / Math.max(1, b.played) }))
        .filter((b) => b.score > 0.05)
        .sort((a, b) => b.score - a.score || a.measure - b.measure)
        .slice(0, n);
    }

    // The last n days, oldest first: [{ day, seconds }].
    function days(n, today) {
      const out = [];
      const d = parseDay(today);
      for (let i = n - 1; i >= 0; i--) { const k = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i)); out.push({ day: k, seconds: data.days[k] || 0 }); }
      return out;
    }

    // Days in a row with at least `min` seconds, up to today (today not
    // done yet doesn't break it).
    function streak(today, min = 60) {
      const d = parseDay(today);
      let n = 0, i = (data.days[today] || 0) >= min ? 0 : 1;
      for (;; i++) {
        const k = dayKey(new Date(d.getFullYear(), d.getMonth(), d.getDate() - i));
        if ((data.days[k] || 0) >= min) n++; else break;
      }
      return n;
    }

    return {
      addTime, addRun, weakBars, days, streak, flush,
      piece: (key) => data.pieces[key] || null,
      today: (day) => data.days[day] || 0,
      all: () => JSON.parse(JSON.stringify(data)),
      replace(d) { if (d && d.v === 1) { data = { ...blank(), ...d }; touch(); flush(); return true; } return false; },
    };
  }

  function dayKey(d) { return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); }
  function parseDay(s) { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); }

  // Per-bar counts for a run, from the engine's results and the song.
  function barsOf(song, results) {
    const bars = {};
    for (const [step, r] of results) {
      const s = song.steps[step]; if (!s) continue;
      const b = bars[s.measure] || (bars[s.measure] = { played: 0, miss: 0, late: 0 });
      b.played++;
      if (r === "miss") b.miss++; else if (r === "late") b.late++;
    }
    return bars;
  }

  window.Piano = window.Piano || {};
  window.Piano.progress = { create, dayKey, barsOf, GOOD };
})();
