// Sheet music with a cursor: ABC through abcjs, MusicXML through
// OpenSheetMusicDisplay. Each turns what it drew into a song (music.js)
// and keeps, for every step, the bits of the drawing to move the cursor to
// and to colour when you play it. MIDI files have no notation; their score
// panel says so and the falling notes show the piece.
(function () {
  const M = () => window.Piano.music;
  const cssVar = (name, fallback) => (getComputedStyle(document.documentElement).getPropertyValue(name) || "").trim() || fallback;

  // Which hand each ABC voice is, in the order the voices first appear.
  function abcHands(text) {
    const ids = [], defs = {};
    for (const m of text.matchAll(/^V:\s*(\S+)(.*)$/gm)) {
      if (!ids.includes(m[1])) ids.push(m[1]);
      defs[m[1]] = (defs[m[1]] || "") + " " + m[2];
    }
    for (const m of text.matchAll(/\[V:\s*([^\]\s]+)/g)) if (!ids.includes(m[1])) ids.push(m[1]);
    if (!ids.length) return [/^K:.*clef\s*=\s*bass/m.test(text) ? "left" : "right"];
    const guess = ids.map((id) => {
      const d = (id + " " + (defs[id] || "")).toLowerCase();
      if (/clef\s*=\s*bass|\b(l|lh|left|bass)\b|name\s*=\s*"?(left|l\.?h)/.test(d)) return "left";
      if (/\b(r|rh|right|treble)\b/.test(d)) return "right";
      return null;
    });
    return guess.map((g, i) => g || (i === 0 ? "right" : "left"));
  }

  // startChar → the finger numbers written on that note or chord.
  function abcFingers(vo) {
    const out = new Map();
    for (const line of vo.lines || []) for (const st of line.staff || []) for (const v of st.voices || []) for (const el of v) {
      if (el.el_type !== "note" || !el.decoration) continue;
      const f = el.decoration.filter((d) => /^[1-5]$/.test(d)).map(Number);
      if (f.length) out.set(el.startChar, f);
    }
    return out;
  }

  function abc(container, onClick) {
    let vo = null, events = [], refs = [], current = -1, stepMeasures = [];
    const marked = new Map();

    async function load(text, opts = {}) {
      container.replaceChildren();
      const holder = document.createElement("div");
      holder.className = "score-abc";
      container.appendChild(holder);
      const color = cssVar("--score-ink", "#1E1F1C");
      vo = window.ABCJS.renderAbc(holder, text, {
        add_classes: true, responsive: "resize", visualTranspose: opts.transpose || 0, foregroundColor: color, selectionColor: cssVar("--accent", "#2F5D50"),
        paddingtop: 8, paddingbottom: 8, paddingleft: 8, paddingright: 8, staffwidth: Math.max(320, container.clientWidth - 40),
        clickListener: (el, tuneNumber, classes, analysis, drag, mouseEvent) => {
          if (!onClick) return;
          const at = events.findIndex((e) => e.elements && e.elements.flat().includes(el.abselem && el.abselem.elemset && el.abselem.elemset[0]));
          if (at >= 0) onClick(events[at].milliseconds);
        },
      })[0];
      if (!vo) throw new Error("couldn't read this ABC");
      const audio = vo.setUpAudio();
      vo.setTiming();
      events = vo.noteTimings.filter((e) => e.type === "event" && e.midiPitches && e.midiPitches.length);
      const msByChar = new Map();
      for (const e of events) for (const p of e.midiPitches) if (!msByChar.has(p.startChar)) msByChar.set(p.startChar, e.milliseconds);
      const meter = vo.getMeterFraction ? vo.getMeterFraction() : { num: 4, den: 4 };
      const measureMs = vo.millisecondsPerMeasure();
      const wholeMs = measureMs / ((meter.num || 4) / (meter.den || 4));
      const hands = abcHands(text);
      const fingers = abcFingers(vo);
      const notes = [];
      audio.tracks.forEach((track, i) => {
        for (const n of track) {
          if (n.cmd !== "note" || n.volume === 0) continue;
          const ms = msByChar.has(n.startChar) ? msByChar.get(n.startChar) : n.start * wholeMs;
          notes.push({ midi: n.pitch, ms, dur: n.duration * wholeMs, hand: hands[i] || (i === 0 ? "right" : "left"), vel: n.volume || 80, char: n.startChar });
        }
      });
      // Fingering (!1! to !5!): one per note, lowest note first in a chord.
      const byChar = new Map();
      for (const n of notes) { if (!byChar.has(n.char)) byChar.set(n.char, []); byChar.get(n.char).push(n); }
      for (const [char, list] of byChar) {
        const f = fingers.get(char);
        if (!f || f.length !== list.length) continue;
        list.sort((x, y) => x.midi - y.midi).forEach((n, k) => { n.finger = f[k]; });
      }
      const bpm = 60000 / (wholeMs / 4);
      const song = M().song({ notes, title: opts.title || (vo.metaText && vo.metaText.title) || "", tempo: [{ ms: 0, bpm }], beatsPerBar: meter.num || 4, beatUnit: meter.den || 4 });
      // Each step's drawing: the timing event that starts with it.
      refs = song.steps.map((s) => {
        let best = -1, gap = Infinity;
        for (let i = 0; i < events.length; i++) { const g = Math.abs(events[i].milliseconds - s.ms); if (g < gap) { gap = g; best = i; } if (events[i].milliseconds > s.ms + 50) break; }
        return best;
      });
      song.steps.forEach((s, i) => { s.ref = refs[i]; s.measure = best(events[refs[i]]); });
      stepMeasures = song.steps.map((s) => s.measure);
      current = -1; marked.clear();
      return song;
    }
    const best = (e) => (e && e.measureNumber != null ? e.measureNumber : 0);

    const els = (step) => {
      const e = events[refs[step]];
      return e && e.elements ? e.elements.flat().filter(Boolean) : [];
    };

    function show(step) {
      if (step === current) return;
      if (current >= 0) for (const el of els(current)) el.classList.remove("cursor-on");
      current = step;
      if (step < 0) return;
      const list = els(step);
      for (const el of list) el.classList.add("cursor-on");
      if (list[0]) follow(container, list[0]);
    }

    function mark(step, result) {
      for (const el of els(step)) { el.classList.remove("note-hit", "note-late", "note-miss"); if (result) el.classList.add("note-" + result); }
      if (result) marked.set(step, result); else marked.delete(step);
    }
    function clearMarks() { for (const s of [...marked.keys()]) mark(s, null); }

    function trouble(measures) { bands(container, measures, stepMeasures, els); }

    return { kind: "abc", load, show, mark, clearMarks, trouble, resize() {}, destroy() { container.replaceChildren(); } };
  }

  function musicxml(container, onClick) {
    let osmd = null, positions = [], refs = [], cur = 0, current = -1, resizeTimer = 0, lastWidth = 0, stepMeasures = [], troubled = [];
    const marked = new Map();

    async function load(data, opts = {}) {
      container.replaceChildren();
      const holder = document.createElement("div");
      holder.className = "score-xml";
      container.appendChild(holder);
      const ink = cssVar("--score-ink", "#1E1F1C");
      osmd = new window.opensheetmusicdisplay.OpenSheetMusicDisplay(holder, {
        autoResize: false, backend: "svg", drawTitle: true, drawSubtitle: false, drawComposer: true, drawCredits: false,
        drawPartNames: false, followCursor: false, defaultColorMusic: ink, defaultColorTitle: ink,
        cursorsOptions: [{ type: 0, color: cssVar("--accent", "#2F5D50"), alpha: 0.35, follow: false }],
      });
      await osmd.load(data);
      osmd.render();
      lastWidth = container.clientWidth;
      osmd.cursor.show();
      const sheet = osmd.Sheet;
      // The tempo map, one entry per measure where the tempo changes, in
      // whole notes from the start (OSMD's timestamps) and bpm in quarters.
      const marks = [];
      for (const m of sheet.SourceMeasures) {
        const at = m.AbsoluteTimestamp ? m.AbsoluteTimestamp.RealValue : 0;
        const bpm = m.TempoInBPM || (marks.length ? marks[marks.length - 1].bpm : sheet.DefaultStartTempoInBpm || 100);
        const lastMark = marks[marks.length - 1];
        if (lastMark && Math.abs(lastMark.at - at) < 1e-9) lastMark.bpm = bpm;
        else if (!lastMark || Math.abs(lastMark.bpm - bpm) > 0.01) marks.push({ at, bpm });
      }
      if (!marks.length || marks[0].at > 0) marks.unshift({ at: 0, bpm: sheet.DefaultStartTempoInBpm || 100 });
      const toMs = tempoMap(marks);
      const sig = sheet.SourceMeasures[0] && sheet.SourceMeasures[0].ActiveTimeSignature;
      const staves = sheet.Staves.length;
      positions = [];
      const notes = [];
      osmd.cursor.reset();
      const it = osmd.cursor.Iterator;
      let guard = 0;
      while (!it.EndReached && guard++ < 20000) {
        const at = it.currentTimeStamp.RealValue;
        const ms = toMs(at);
        const here = [];
        for (const ve of it.CurrentVoiceEntries) {
          for (const n of ve.Notes) {
            if (!n.Pitch || n.isRest && n.isRest()) continue;
            const tie = n.NoteTie;
            const staff = n.ParentStaff ? n.ParentStaff.idInMusicSheet : 0;
            const finger = n.Fingering && n.Fingering.value ? n.Fingering.value : null;
            here.push({ midi: n.halfTone + 12, ms, dur: toMs(at + (tie && tie.StartNote === n ? tie.Duration.RealValue : n.Length.RealValue)) - ms,
              hand: staves > 1 ? (staff === 0 ? "right" : "left") : "right", tied: !!(tie && tie.StartNote !== n), finger,
              measure: it.CurrentMeasureIndex });
          }
        }
        positions.push({ ms, measure: it.CurrentMeasureIndex, g: gnotes() });
        notes.push(...here);
        osmd.cursor.next();
      }
      osmd.cursor.reset(); cur = 0;
      const song = M().song({ notes, title: opts.title || (sheet.TitleString || ""), tempo: marks.map((k) => ({ ms: toMs(k.at), bpm: k.bpm })),
        beatsPerBar: sig ? sig.Numerator : 4, beatUnit: sig ? sig.Denominator : 4, measures: sheet.SourceMeasures.length });
      refs = song.steps.map((s) => positions.findIndex((p) => Math.abs(p.ms - s.ms) < 1));
      song.steps.forEach((s, i) => { s.ref = refs[i]; s.measure = positions[refs[i]] ? positions[refs[i]].measure : s.measure; });
      stepMeasures = song.steps.map((s) => s.measure);
      current = -1; marked.clear();
      return song;
    }

    function gnotes() {
      try { return osmd.cursor.GNotesUnderCursor().map((g) => g.getSVGGElement && g.getSVGGElement()).filter(Boolean); }
      catch (e) { return []; }
    }

    function moveTo(pos) {
      if (pos < 0) return;
      if (pos < cur) { osmd.cursor.reset(); cur = 0; }
      while (cur < pos) { osmd.cursor.next(); cur++; }
    }

    function show(step) {
      if (!osmd || step === current) return;
      current = step;
      const pos = step >= 0 ? refs[step] : 0;
      moveTo(pos);
      const el = osmd.cursor.cursorElement;
      if (el) follow(container, el);
    }

    function mark(step, result) {
      const p = positions[refs[step]];
      if (!p) return;
      for (const g of p.g) { g.classList.remove("note-hit", "note-late", "note-miss"); if (result) g.classList.add("note-" + result); }
      if (result) marked.set(step, result); else marked.delete(step);
    }
    function clearMarks() { for (const s of [...marked.keys()]) mark(s, null); }

    // Re-lay the music to a new width, keeping the cursor and the colours.
    function resize() {
      if (!osmd || Math.abs(container.clientWidth - lastWidth) < 24) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        lastWidth = container.clientWidth;
        const keep = new Map(marked);
        osmd.render();
        osmd.cursor.reset(); cur = 0;
        for (let i = 0; i < positions.length; i++) { positions[i].g = gnotes(); osmd.cursor.next(); }
        osmd.cursor.reset(); cur = 0;
        const at = current; current = -2; show(at);
        for (const [s, r] of keep) mark(s, r);
        trouble(troubled);
      }, 200);
    }

    container.addEventListener("click", (e) => {
      if (!onClick || !osmd) return;
      const g = e.target.closest && e.target.closest("g.vf-stavenote");
      if (!g) return;
      const pos = positions.findIndex((p) => p.g.includes(g));
      if (pos >= 0) onClick(positions[pos].ms);
    });

    const xmlEls = (step) => (positions[refs[step]] ? positions[refs[step]].g : []);
    function trouble(measures) { troubled = measures || []; bands(container, troubled, stepMeasures, xmlEls); }

    return { kind: "musicxml", load, show, mark, clearMarks, trouble, resize, destroy() { clearTimeout(resizeTimer); container.replaceChildren(); } };
  }

  // A soft band behind each bar that trips you up, around its notes.
  function bands(container, measures, stepMeasures, elsOf) {
    const want = new Set(measures || []);
    const sig = [...want].sort((a, b) => a - b).join(",");
    const drawn = container.querySelectorAll(".trouble-band");
    if (container.dataset.trouble === sig && (drawn.length || !want.size)) return;
    container.dataset.trouble = sig;
    for (const r of drawn) r.remove();
    if (!want.size) return;
    const groups = new Map();
    stepMeasures.forEach((m, i) => { if (want.has(m)) { if (!groups.has(m)) groups.set(m, []); groups.get(m).push(...elsOf(i)); } });
    for (const list of groups.values()) {
      const svg = list[0] && list[0].ownerSVGElement;
      if (!svg || !svg.getScreenCTM()) continue;
      const inv = svg.getScreenCTM().inverse();
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (const e of list) {
        if (e.ownerSVGElement !== svg) continue;
        const b = e.getBoundingClientRect();
        if (!b.width && !b.height) continue;
        for (const [x, y] of [[b.left, b.top], [b.right, b.bottom]]) {
          const p = new DOMPoint(x, y).matrixTransform(inv);
          x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y);
        }
      }
      if (!isFinite(x0)) continue;
      const r = document.createElementNS("http://www.w3.org/2000/svg", "rect");
      r.setAttribute("class", "trouble-band");
      r.setAttribute("x", x0 - 8); r.setAttribute("y", y0 - 8);
      r.setAttribute("width", x1 - x0 + 16); r.setAttribute("height", y1 - y0 + 16);
      r.setAttribute("rx", 6);
      svg.insertBefore(r, svg.firstChild);
    }
  }

  function none(container, message) {
    return {
      kind: "none",
      async load() { const p = document.createElement("p"); p.className = "score-none"; p.textContent = message; container.replaceChildren(p); return null; },
      show() {}, mark() {}, clearMarks() {}, trouble() {}, resize() {}, destroy() { container.replaceChildren(); },
    };
  }

  // Whole notes from the start → ms, through tempo changes.
  function tempoMap(marks) {
    const starts = [0];
    for (let i = 1; i < marks.length; i++) starts.push(starts[i - 1] + (marks[i].at - marks[i - 1].at) * 240000 / marks[i - 1].bpm);
    return (at) => {
      let i = 0;
      while (i + 1 < marks.length && marks[i + 1].at <= at + 1e-9) i++;
      return starts[i] + (at - marks[i].at) * 240000 / marks[i].bpm;
    };
  }

  // Keeps the cursor in view, scrolling only when it nears an edge.
  function follow(container, el) {
    const box = container.getBoundingClientRect(), r = el.getBoundingClientRect();
    if (r.top < box.top + 24 || r.bottom > box.bottom - 24) {
      container.scrollTo({ top: container.scrollTop + (r.top - box.top) - box.height / 3, behavior: "auto" });
    }
  }

  window.Piano = window.Piano || {};
  window.Piano.score = { abc, musicxml, none, abcHands, tempoMap };
})();
