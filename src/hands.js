// Which hand plays each note of a part that doesn't say: a MIDI file with
// one track for both hands. Notes that start together are one chord; each
// chord is cut between two of its notes (or given to one hand), and the
// cuts are chosen together so the hands move little, stay within a
// stretch, keep to their side and don't cross. Pure.
(function () {
  const TOGETHER_MS = 35;
  const HOME = { left: 48, right: 72 };

  // notes: [{midi, ms}] in any order. Returns "left" | "right" per note.
  function assign(notes) {
    const order = notes.map((n, i) => i).sort((a, b) => notes[a].ms - notes[b].ms || notes[a].midi - notes[b].midi);
    const groups = [];
    for (const i of order) {
      const g = groups[groups.length - 1];
      if (g && notes[i].ms - g.ms <= TOGETHER_MS) g.idx.push(i); else groups.push({ ms: notes[i].ms, idx: [i] });
    }
    for (const g of groups) { g.idx.sort((a, b) => notes[a].midi - notes[b].midi); g.pitch = g.idx.map((i) => notes[i].midi); }

    // A cut k: the lowest k notes to the left hand, the rest to the right.
    const shape = (pitch, k) => {
      const l = pitch.slice(0, k), r = pitch.slice(k);
      return { l, r, lc: l.length ? (l[0] + l[l.length - 1]) / 2 : null, rc: r.length ? (r[0] + r[r.length - 1]) / 2 : null };
    };
    const handCost = (ns, side) => {
      if (!ns.length) return 0;
      const span = ns[ns.length - 1] - ns[0];
      let c = span > 12 ? (span - 12) * 4 : 0;
      if (span > 15) c += 60;
      if (ns.length > 5) c += (ns.length - 5) * 60;
      for (const m of ns) c += side === "left" ? Math.max(0, m - 67) * 0.35 : Math.max(0, 53 - m) * 0.35;
      return c;
    };
    const move = (a, b) => (a == null || b == null ? 0 : Math.abs(a - b) * 0.5);

    // Viterbi over the cuts; each state keeps where both hands last were.
    let prev = [{ cost: 0, lc: HOME.left, rc: HOME.right, from: -1 }];
    const back = [];
    for (const g of groups) {
      const cur = [];
      for (let k = 0; k <= g.pitch.length; k++) {
        const s = shape(g.pitch, k);
        const own = handCost(s.l, "left") + handCost(s.r, "right");
        let best = null;
        prev.forEach((p, j) => {
          let c = p.cost + own + move(p.lc, s.lc) + move(p.rc, s.rc);
          // Crossing: the left hand above where the right one is (or was).
          const lc = s.lc ?? p.lc, rc = s.rc ?? p.rc;
          if (lc > rc) c += (lc - rc) * 3 + 10;
          if (!best || c < best.cost) best = { cost: c, lc, rc, from: j };
        });
        cur.push(best);
      }
      back.push(cur.map((s) => s.from));
      prev = cur;
    }
    const out = new Array(notes.length);
    let k = prev.reduce((b, s, i) => (s.cost < prev[b].cost ? i : b), 0);
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const g = groups[gi];
      g.idx.forEach((i, at) => { out[i] = at < k ? "left" : "right"; });
      k = back[gi][k];
    }
    return smooth(notes, groups, out);
  }

  // A single note that flips hands between two neighbours on the other
  // hand, close in pitch, goes with them.
  function smooth(notes, groups, out) {
    for (let gi = 1; gi < groups.length - 1; gi++) {
      const g = groups[gi];
      if (g.idx.length !== 1) continue;
      const i = g.idx[0], a = groups[gi - 1].idx, b = groups[gi + 1].idx;
      if (a.length !== 1 || b.length !== 1) continue;
      const ha = out[a[0]], hb = out[b[0]];
      if (ha === hb && out[i] !== ha && Math.abs(notes[i].midi - notes[a[0]].midi) <= 7 && Math.abs(notes[i].midi - notes[b[0]].midi) <= 7) out[i] = ha;
    }
    return out;
  }

  window.Piano = window.Piano || {};
  window.Piano.hands = { assign, TOGETHER_MS };
})();
