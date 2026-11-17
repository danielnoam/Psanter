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

  function abc(container, onClick) {
    let vo = null, events = [], refs = [], current = -1;
    const marked = new Map();

    async function load(text, opts = {}) {
      container.replaceChildren();
      const holder = document.createElement("div");
      holder.className = "score-abc";
      container.appendChild(holder);
      const color = cssVar("--score-ink", "#1E1F1C");
      vo = window.ABCJS.renderAbc(holder, text, {
        add_classes: true, responsive: "resize", foregroundColor: color, selectionColor: cssVar("--accent", "#2F5D50"),
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
      const notes = [];
      audio.tracks.forEach((track, i) => {
        for (const n of track) {
          if (n.cmd !== "note" || n.volume === 0) continue;
          const ms = msByChar.has(n.startChar) ? msByChar.get(n.startChar) : n.start * wholeMs;
          notes.push({ midi: n.pitch, ms, dur: n.duration * wholeMs, hand: hands[i] || (i === 0 ? "right" : "left"), vel: n.volume || 80, char: n.startChar });
        }
      });
      const bpm = 60000 / (wholeMs / 4);
      const song = M().song({ notes, title: opts.title || (vo.metaText && vo.metaText.title) || "", tempo: [{ ms: 0, bpm }], beatsPerBar: meter.num || 4, beatUnit: meter.den || 4 });
      // Each step's drawing: the timing event that starts with it.
      refs = song.steps.map((s) => {
        let best = -1, gap = Infinity;
        for (let i = 0; i < events.length; i++) { const g = Math.abs(events[i].milliseconds - s.ms); if (g < gap) { gap = g; best = i; } if (events[i].milliseconds > s.ms + 50) break; }
        return best;
      });
      song.steps.forEach((s, i) => { s.ref = refs[i]; s.measure = best(events[refs[i]]); });
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

    return { kind: "abc", load, show, mark, clearMarks, resize() {}, destroy() { container.replaceChildren(); } };
  }

  function musicxml(container, onClick) {
    let osmd = null, positions = [], refs = [], cur = 0, current = -1, resizeTimer = 0, lastWidth = 0;
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
      const bpm = sheet.DefaultStartTempoInBpm || sheet.userStartTempoInBPM || 100;
      const wholeMs = 4 * 60000 / bpm;
      const sig = sheet.SourceMeasures[0] && sheet.SourceMeasures[0].ActiveTimeSignature;
      const staves = sheet.Staves.length;
      positions = [];
      const notes = [];
      osmd.cursor.reset();
      const it = osmd.cursor.Iterator;
      let guard = 0;
      while (!it.EndReached && guard++ < 20000) {
        const ms = it.currentTimeStamp.RealValue * wholeMs;
        const here = [];
        for (const ve of it.CurrentVoiceEntries) {
          for (const n of ve.Notes) {
            if (!n.Pitch || n.isRest && n.isRest()) continue;
            const tie = n.NoteTie;
            const staff = n.ParentStaff ? n.ParentStaff.idInMusicSheet : 0;
            const finger = n.Fingering && n.Fingering.value ? n.Fingering.value : null;
            here.push({ midi: n.halfTone + 12, ms, dur: (tie && tie.StartNote === n ? tie.Duration.RealValue : n.Length.RealValue) * wholeMs,
              hand: staves > 1 ? (staff === 0 ? "right" : "left") : "right", tied: !!(tie && tie.StartNote !== n), finger,
              measure: it.CurrentMeasureIndex });
          }
        }
        positions.push({ ms, measure: it.CurrentMeasureIndex, g: gnotes() });
        notes.push(...here);
        osmd.cursor.next();
      }
      osmd.cursor.reset(); cur = 0;
      const song = M().song({ notes, title: opts.title || (sheet.TitleString || ""), tempo: [{ ms: 0, bpm }],
        beatsPerBar: sig ? sig.Numerator : 4, beatUnit: sig ? sig.Denominator : 4, measures: sheet.SourceMeasures.length });
      refs = song.steps.map((s) => positions.findIndex((p) => Math.abs(p.ms - s.ms) < 1));
      song.steps.forEach((s, i) => { s.ref = refs[i]; s.measure = positions[refs[i]] ? positions[refs[i]].measure : s.measure; });
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
      }, 200);
    }

    container.addEventListener("click", (e) => {
      if (!onClick || !osmd) return;
      const g = e.target.closest && e.target.closest("g.vf-stavenote");
      if (!g) return;
      const pos = positions.findIndex((p) => p.g.includes(g));
      if (pos >= 0) onClick(positions[pos].ms);
    });

    return { kind: "musicxml", load, show, mark, clearMarks, resize, destroy() { clearTimeout(resizeTimer); container.replaceChildren(); } };
  }

  function none(container, message) {
    return {
      kind: "none",
      async load() { const p = document.createElement("p"); p.className = "score-none"; p.textContent = message; container.replaceChildren(p); return null; },
      show() {}, mark() {}, clearMarks() {}, resize() {}, destroy() { container.replaceChildren(); },
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
  window.Piano.score = { abc, musicxml, none, abcHands };
})();
