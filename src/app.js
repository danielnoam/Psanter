// Piano: the app. keel's files (src/keel/) load first, then the vendored
// libraries (src/vendor/), then the app's own modules on window.Piano,
// then this, which builds the screens and wires them together:
// the library, a lesson with its practice panels, the transport bar and
// Settings.
(function () {
  const APP_VERSION = "0.1.0";
  const K = window.Keel;
  const P = window.Piano;
  const $ = (id) => document.getElementById(id);
  const icon = P.icon;

  const i18n = K.i18n.create({ key: "piano.lang", langs: ["en"], version: APP_VERSION });
  const t = i18n.t;

  // ---- settings: one object, saved as it changes ----
  const DEFAULTS = { theme: "system", mode: "wait", metronome: false, countIn: false, echo: false, typing: true,
    lookahead: 3, range: "song", volume: 0.7, autoVolume: 0.8, room: 0.16, output: "", layout: null, last: null,
    noteNames: "off", fingers: true, autoSpeed: false, autoSpeedGoal: 100, colors: { light: {}, dark: {} },
    keys: {}, pianoKeys: {}, bookPages: {}, effects: null, lightChannel: -1, goal: 15, latency: 0, midiHands: {}, sound: "grand",
    drill: { type: "reading", hand: "right", range: "five", key: "C", rhythm: "quarters", bars: 4, tempo: 70, next: true, octaves: 1, count: 4, earRange: "five" } };
  const settings = (() => {
    let data = { ...DEFAULTS };
    try { data = { ...data, ...JSON.parse(localStorage.getItem("piano.settings") || "{}") }; } catch (e) { /* first run or blocked storage */ }
    const listeners = new Set();
    return {
      get: (k) => data[k],
      set(k, v) {
        data[k] = v;
        try { localStorage.setItem("piano.settings", JSON.stringify(data)); } catch (e) { /* kept for this session */ }
        for (const fn of listeners) fn(k, v);
      },
      on: (fn) => listeners.add(fn),
      all: () => ({ ...data }),
    };
  })();

  const layoutBtn = button("", "icon-btn", null);
  layoutBtn.hidden = true;

  // ---- theme ----
  const dark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function applyTheme() {
    const pick = settings.get("theme");
    const mode = pick === "dark" || (pick === "system" && dark && dark.matches) ? "dark" : "light";
    document.documentElement.dataset.theme = mode;
    P.theme.apply(document.documentElement, (settings.get("colors") || {})[mode]);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", getComputedStyle(document.documentElement).getPropertyValue("--surface").trim());
    if (practice) practice.readColors();
  }
  if (dark && dark.addEventListener) dark.addEventListener("change", applyTheme);

  // ---- toast ----
  let toastTimer = 0;
  function toast(text, ms = 3200) {
    const el = $("toast");
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, ms);
  }

  // ---- sound and devices ----
  const synth = P.synth.create();
  synth.setVolume(settings.get("volume"));
  synth.setRoom(settings.get("room"));
  synth.setSound(settings.get("sound"));
  let practice = null;
  const recorder = P.recorder.create();
  const hot = P.hotkeys.create(settings.get("keys"), settings.get("pianoKeys"));
  let captureNote = null, lastNoteAt = -Infinity, calibrating = false;

  // Every note you play comes through here: a piano key bound to a
  // shortcut runs it, the rest is recorded and practised.
  function routeNote(m, on, vel, now, source) {
    if (captureNote) { if (on) captureNote(m); return; }
    const action = hot.actionForNote(m);
    if (action) { if (on) runAction(action); return; }
    recorder.note(m, on, vel, now);
    lastNoteAt = now;
    if (on && ear) earNote(m);
    // A rhythm drill takes any key as its one note.
    if (lessonState && lessonState.drill && drillType() === "rhythm" && practice && practice.song) m = P.abcwrite.TAP;
    if (editor && editor.wantsNotes && editorShown()) {
      editor.note(m, on);
      if (source !== "midi" || settings.get("echo")) { if (on) synth.noteOn(m, vel); else synth.noteOff(m); }
      return;
    }
    takeNote(m, on, vel);
    chordNote(m, on);
    if (practice) practice.noteIn(m, on, vel, now, source);
  }
  function pedal(down) { synth.setPedal(down); recorder.setPedal(down, performance.now()); }

  const midi = P.midi.create({ onNote: routeNote, onDevices: () => renderDevice(), onPedal: pedal });
  const typing = P.midi.typing({
    onNote: routeNote,
    enabled: () => settings.get("typing") && (calibrating || (!$("settings").open && !themeOpen())),
  });

  function renderDevice() {
    const d = midi.devices();
    const chip = $("device");
    chip.replaceChildren();
    const dot = document.createElement("span"); dot.className = "dot";
    const name = document.createElement("span");
    chip.classList.toggle("on", d.inputs.length > 0);
    if (d.status === "unsupported") name.textContent = t("No MIDI here");
    else if (d.status === "denied") name.textContent = t("MIDI blocked");
    else if (d.inputs.length) name.textContent = d.inputs.map((i) => i.name).join(", ");
    else name.textContent = t("No piano connected");
    chip.append(dot, name);
    chip.title = t("Piano and sound settings");
    if ($("settings").open) renderSettings();
  }

  // ---- library ----
  const library = P.library.create();
  let courses = [];

  async function showLibrary() {
    if (practice) { practice.engine.pause(); practice.stopSound(); }
    if (routine) endRoutine(false);
    if (stopReplay) stopReplay();
    plan = null; lastTake = null;
    ear = null;
    stopWatching();
    $("lesson-screen").hidden = true;
    $("library").hidden = false;
    $("back").hidden = true;
    layoutBtn.hidden = true;
    editBtn.hidden = true;
    if (editorShown()) toggleEditor(false);
    midi.light([], settings.get("lightChannel"));
    if (video) toggleVideo();
    if (editingLayout) { editingLayout = false; layoutBtn.setAttribute("aria-pressed", "false"); }
    if (recorder.recording) toggleRecord();
    $("title").textContent = "Piano";
    $("status").textContent = "";
    document.title = "Piano";
    await renderLibrary();
  }

  async function renderLibrary() {
    courses = await library.list();
    const root = $("library");
    const inner = el("div", "library-inner");
    const head = el("div", "library-head");
    head.appendChild(el("h2", null, t("Library")));
    const add = button(t("+ Add folder"), "btn", async () => {
      try {
        if (library.canPick()) { const id = await library.addFolder(); if (id) await renderLibrary(); }
        else pickFiles(true);
      } catch (e) { if (e && e.name !== "AbortError") toast(t("Couldn't add that folder: {why}", { why: e.message })); }
    });
    add.prepend(icon("folder-plus"));
    const open = button(t("Open file"), "btn", () => pickFiles(false));
    open.prepend(icon("file"));
    const free = button(t("Free play"), "btn", () => openFree());
    free.prepend(icon("keyboard"));
    head.append(add, open, free);
    inner.appendChild(head);

    const last = settings.get("last");
    if (last && courses.some((c) => c.id === last.course)) {
      const card = el("div", "continue");
      const text = el("div", "grow");
      text.append(el("div", "dim", t("Continue")), el("strong", null, last.title || last.path));
      card.append(icon("book"), text, button(t("Open lesson"), "btn primary", () => openLesson(last.course, last.path)));
      inner.appendChild(card);
    }

    inner.appendChild(daysCard());
    const rv = reviewCard();
    if (rv) inner.appendChild(rv);
    inner.appendChild(routineCard());
    inner.appendChild(drillCard());
    for (const c of courses) inner.appendChild(courseCard(c));
    if (!library.canPick()) inner.appendChild(el("p", "dim", t("This browser can't keep folders between visits; use the desktop app for that.")));
    root.replaceChildren(inner);
  }

  function courseCard(c) {
    const card = el("section", "course");
    const head = el("div", "course-head");
    head.appendChild(el("h3", null, c.title));
    if (c.kind === "folder") {
      if (c.status === "needs-permission") head.appendChild(button(t("Allow access"), "btn", async () => { if (await library.reconnect(c.id)) renderLibrary(); }));
      const rm = button("", "icon-btn quiet", async () => { await library.removeFolder(c.id); renderLibrary(); });
      rm.title = t("Remove from library"); rm.setAttribute("aria-label", rm.title); rm.appendChild(icon("x"));
      head.appendChild(rm);
    }
    card.appendChild(head);
    if (c.status === "needs-permission") { card.appendChild(el("p", "course-note", t("The app needs your OK to read this folder again."))); return card; }
    if (c.status === "missing") { card.appendChild(el("p", "course-note", t("This folder isn't there any more."))); return card; }
    if (!c.lessons.length && !c.pieces.length) { card.appendChild(el("p", "course-note", t("No lessons or pieces in this folder yet."))); return card; }
    const list = el("ul", "items");
    for (const path of c.lessons) {
      const li = document.createElement("li");
      const b = button("", null, () => openLesson(c.id, path));
      const name = el("span", null, P.lesson.title({}, "", path));
      b.append(icon("book"), name);
      li.appendChild(b); list.appendChild(li);
      // The real title is in the file; fill it in once read.
      library.read(c.id, path).then((r) => { const fm = P.lesson.frontMatter(r.data); name.textContent = P.lesson.title(fm.meta, fm.body, path); }).catch(() => {});
    }
    if (c.pieces.length) {
      list.appendChild(el("li", "sub", t("Pieces")));
      for (const path of c.pieces) {
        const li = document.createElement("li");
        const b = button("", null, () => openPiece(c.id, path));
        b.append(icon("music"), el("span", null, path.split("/").pop()), el("span", "meta", (P.lesson.kind(path) || "").toUpperCase()));
        li.appendChild(b); list.appendChild(li);
      }
    }
    card.appendChild(list);
    return card;
  }

  function pickFiles(folder) {
    const input = document.createElement("input");
    input.type = "file";
    if (folder) { input.webkitdirectory = true; input.multiple = true; }
    else input.accept = ".musicxml,.xml,.mxl,.mid,.midi,.abc,.md";
    input.addEventListener("change", async () => {
      if (!input.files.length) return;
      if (folder) { library.addFiles(input.files); renderLibrary(); return; }
      const id = library.addFiles(input.files);
      const path = [...input.files][0].name;
      if (/\.md$/i.test(path)) openLesson(id, path); else openPiece(id, path);
    });
    input.click();
  }

  // ---- the lesson screen ----
  const PANELS = ["lesson", "score", "roll", "stats", "book", "editor"];
  const PANEL_NAMES = { lesson: "Lesson", score: "Score", roll: "Keys", stats: "Progress", book: "Book", editor: "Editor" };
  const DEFAULT_LAYOUT = { dir: "row", sizes: [0.36, 0.64], children: [{ dir: "col", sizes: [0.68, 0.32], children: ["lesson", "stats"] }, { dir: "col", sizes: [0.52, 0.48], children: ["score", "roll"] }] };
  const PRESETS = {
    lesson: { name: "Lesson", tree: DEFAULT_LAYOUT },
    play: { name: "Just playing", tree: { dir: "col", sizes: [0.5, 0.5], children: ["score", "roll"] } },
    book: { name: "Book beside", tree: { dir: "row", sizes: [0.42, 0.58], children: ["book", { dir: "col", sizes: [0.5, 0.5], children: ["score", "roll"] }] } },
    keys: { name: "Keys only", tree: { dir: "row", sizes: [0.78, 0.22], children: ["roll", "stats"] } },
  };
  let editingLayout = false;
  let pdf = null, editor = null, fx = null;
  const editBtn = button("", "icon-btn", null);
  editBtn.hidden = true;
  const mounts = {};
  let lessonState = null; // { course, path, meta, blocks, pieces, active, modified }
  let watchTimer = 0;

  function buildPanels() {
    mounts.lesson = el("article", "lesson-text");
    mounts.score = el("div", "score");
    mounts.score.setAttribute("aria-label", t("Sheet music"));
    const rollWrap = el("div", "roll-wrap");
    const rollCanvas = document.createElement("canvas");
    rollCanvas.setAttribute("aria-label", t("Falling notes and keyboard"));
    rollWrap.appendChild(rollCanvas);
    const chord = el("div", "chord-name"); chord.id = "chord"; chord.hidden = true; chord.setAttribute("aria-live", "polite");
    rollWrap.appendChild(chord);
    mounts.roll = rollWrap;
    const timelineCanvas = document.createElement("canvas");
    mounts.stats = el("div", "stats");
    mounts.book = el("div", "book");
    mounts.editor = el("div", "editor");
    editor = P.editor.create(mounts.editor, {
      t, icon, button,
      canSave: () => !!(lessonState && lessonState.course && library.writable(lessonState.course)),
      onInput: (text) => previewLesson(text),
      onSave: (text) => saveLesson(text),
      onClose: () => toggleEditor(false),
    });
    pdf = P.pdfview.create(mounts.book, { t, icon, onPage: (id, page) => { if (!id) return; const b = { ...settings.get("bookPages") }; b[id] = page; settings.set("bookPages", b); } });
    practice = P.practice.create({
      scoreEl: mounts.score, rollCanvas, timelineCanvas, midi, synth, settings,
      onChange: (s) => { renderTransport(s); statsSoon(); },
      onEvent,
      onExpected: (list) => midi.light(list, settings.get("lightChannel")),
    });
    fx = P.effects.create();
    applyEffects();
    practice.engine.setLatency(settings.get("latency"));
    practice.roll.setRange(settings.get("range"));
    applyLabels();
    buildTransport(timelineCanvas);
    buildLayoutBar();
    mouseKeys(rollCanvas);
    new ResizeObserver(() => practice.resize()).observe($("panels"));
    new ResizeObserver(() => practice.resize()).observe(rollWrap);
    new ResizeObserver(() => pdf.resize()).observe(mounts.book);
  }

  function applyLabels() {
    const n = settings.get("noteNames");
    practice.roll.setLabels({ names: n !== "off", system: n === "solfege" ? "solfege" : "letters", fingers: !!settings.get("fingers") });
    practice.draw();
  }

  function currentLayout() { return P.layout.normalize(settings.get("layout") || DEFAULT_LAYOUT, PANELS) || DEFAULT_LAYOUT; }
  function setLayout(tree) { settings.set("layout", P.layout.normalize(tree, PANELS)); renderLayout(); }

  function renderLayout() {
    const tree = currentLayout();
    P.layout.render($("panels"), tree, {
      mount: (id) => mounts[id],
      onChange: (next) => setLayout(next),
      editing: editingLayout,
      label: (id) => t(PANEL_NAMES[id] || id),
      onDrop: (panel, target, side) => setLayout(P.layout.place(currentLayout(), panel, target, side)),
    });
    $("panels").classList.toggle("editing", editingLayout);
    if (layoutBar) renderLayoutBar(tree);
    practice.resize();
    pdf.resize();
  }

  // ---- the layout editor: drag panels by their names, show or hide them, presets ----
  let layoutBar = null;
  function buildLayoutBar() {
    layoutBar = el("div", "layout-bar");
    layoutBar.hidden = true;
    $("lesson-screen").insertBefore(layoutBar, $("panels"));
  }
  function renderLayoutBar(tree) {
    layoutBar.hidden = !editingLayout;
    if (!editingLayout) return;
    const shown = P.layout.panels(tree);
    const chips = PANELS.map((id) => {
      const c = button(t(PANEL_NAMES[id]), "chip", () => {
        if (shown.includes(id)) { if (shown.length > 1) setLayout(P.layout.remove(tree, id)); }
        else setLayout(P.layout.show(tree, id, PANELS));
      });
      c.setAttribute("aria-pressed", String(shown.includes(id)));
      return c;
    });
    const preset = document.createElement("select");
    preset.setAttribute("aria-label", t("Presets"));
    preset.appendChild(new Option(t("Presets…"), ""));
    for (const [k, v] of Object.entries(PRESETS)) preset.appendChild(new Option(t(v.name), k));
    preset.addEventListener("change", () => { if (preset.value) setLayout(PRESETS[preset.value].tree); });
    layoutBar.replaceChildren(
      el("span", "hint", t("Drag a panel's name to another panel's edge to put it there, or to its middle to swap them.")),
      ...chips, preset,
      button(t("Done"), "btn primary", () => toggleLayoutEditor(false)),
    );
  }
  function toggleLayoutEditor(on) {
    editingLayout = on == null ? !editingLayout : on;
    layoutBtn.setAttribute("aria-pressed", String(editingLayout));
    renderLayout();
  }

  function showLessonScreen(title) {
    $("library").hidden = true;
    $("lesson-screen").hidden = false;
    $("back").hidden = false;
    layoutBtn.hidden = false;
    editBtn.hidden = true;
    // The editor only stays for a lesson; pieces, drills and free play have no text.
    if (!(lessonState && lessonState.path) && P.layout.panels(currentLayout()).includes("editor")) settings.set("layout", P.layout.remove(currentLayout(), "editor"));
    $("title").textContent = title;
    document.title = title + " · Piano";
    renderLayout();
  }

  const md = window.markdownit({ html: false, linkify: true, typographer: true });
  const baseFence = md.renderer.rules.fence;
  md.renderer.rules.fence = (tokens, idx, opts, env, self) => {
    const tok = tokens[idx];
    const f = P.lesson.fence(tok.info);
    if (f.lang !== "abc") return baseFence(tokens, idx, opts, env, self);
    env.blocks.push({ text: tok.content, opts: f.opts });
    const i = env.blocks.length - 1;
    return '<div class="practice-block" data-block="' + i + '"><div class="block-head"><span class="name"></span><span class="opts"></span></div><div class="abc-preview"></div></div>';
  };

  async function openLesson(course, path) {
    let r;
    try { r = await library.read(course, path); }
    catch (e) { toast(t("Couldn't open that lesson: {why}", { why: e.message })); return; }
    const { meta, body } = P.lesson.frontMatter(r.data);
    const title = P.lesson.title(meta, body, path);
    settings.set("last", { course, path, title });
    lessonState = { course, path, meta, modified: r.modified, active: null, text: r.data };
    showLessonScreen(title);
    renderLessonText(body);
    if (meta.book) openBook(meta.book, false); else dropBook();
    editBtn.hidden = false;
    if (editorShown()) loadEditor();
    const first = lessonState.blocks.length ? { block: 0 } : lessonState.pieces.length ? { piece: 0 } : null;
    if (first) await activate(first);
    else { await practice.load({ kind: "none", message: t("This lesson has no music to practise.") }).catch(() => {}); }
    watch();
  }

  async function openPiece(course, path) {
    lessonState = { course, path: null, piecePath: path, meta: {}, blocks: [], pieces: [{ path, opts: {}, title: path.split("/").pop() }], active: null };
    dropBook();
    showLessonScreen(path.split("/").pop());
    mounts.lesson.replaceChildren(el("h1", null, path.split("/").pop()), el("p", "dim", t("A piece on its own, with no lesson text.")));
    await activate({ piece: 0 });
    watch();
  }

  function renderLessonText(body) {
    const env = { blocks: [] };
    const html = md.render(body, env);
    const doc = new DOMParser().parseFromString("<div>" + html + "</div>", "text/html");
    const root = doc.body.firstChild;
    lessonState.blocks = env.blocks;
    lessonState.pieces = [];
    // Links: pieces become practice cards, other lessons open here, other
    // sites go to the browser.
    for (const a of [...root.querySelectorAll("a[href]")]) {
      const href = a.getAttribute("href");
      if (P.lesson.isPiece(href)) {
        const i = lessonState.pieces.length;
        lessonState.pieces.push({ path: P.lesson.resolve(lessonState.path, href), opts: P.lesson.options(a.getAttribute("title") || ""), title: a.textContent });
        a.removeAttribute("title");
        const p = a.parentElement;
        if (p && p.tagName === "P" && p.textContent.trim() === a.textContent.trim()) {
          const card = doc.createElement("div");
          card.className = "piece-card"; card.dataset.piece = i;
          const head = doc.createElement("div"); head.className = "block-head";
          const name = doc.createElement("span"); name.className = "name"; name.textContent = a.textContent;
          const opts = doc.createElement("span"); opts.className = "opts";
          head.append(name, opts); card.appendChild(head);
          p.replaceWith(card);
        } else { a.dataset.piece = i; a.setAttribute("href", "#"); }
      } else if (/\.pdf$/i.test(href.split(/[?#]/)[0]) && !/^[a-z]+:/i.test(href)) {
        a.dataset.book = href; a.setAttribute("href", "#");
      } else if (/\.md$/i.test(href.split(/[?#]/)[0]) && !/^[a-z]+:/i.test(href)) {
        a.dataset.lesson = P.lesson.resolve(lessonState.path, href); a.setAttribute("href", "#");
      }
    }
    mounts.lesson.replaceChildren(...root.childNodes);
    mounts.lesson.scrollTop = 0;
    // Each practice block: its title, its options and a small preview.
    mounts.lesson.querySelectorAll(".practice-block").forEach((node) => {
      const b = lessonState.blocks[+node.dataset.block];
      const head = node.querySelector(".block-head");
      head.querySelector(".name").textContent = (/^T:\s*(.+)$/m.exec(b.text) || [])[1] || t("Exercise");
      head.querySelector(".opts").textContent = describe(b.opts);
      head.appendChild(button(t("Practice"), "btn", () => activate({ block: +node.dataset.block })));
      try { window.ABCJS.renderAbc(node.querySelector(".abc-preview"), b.text, { staffwidth: 560, scale: 0.8, paddingtop: 0, paddingbottom: 0, foregroundColor: getComputedStyle(document.documentElement).getPropertyValue("--text").trim() }); }
      catch (e) { node.querySelector(".abc-preview").textContent = t("This music block couldn't be read."); }
    });
    mounts.lesson.querySelectorAll(".piece-card").forEach((node) => {
      const pc = lessonState.pieces[+node.dataset.piece];
      node.querySelector(".opts").textContent = describe(pc.opts);
      node.querySelector(".block-head").prepend(icon("music"));
      node.querySelector(".block-head").appendChild(button(t("Practice"), "btn", () => activate({ piece: +node.dataset.piece })));
    });
    // Images beside the lesson, from its folder.
    mounts.lesson.querySelectorAll("img[src]").forEach(async (img) => {
      const src = img.getAttribute("src");
      if (/^(data|blob|https?):/i.test(src)) return;
      try {
        const r = await library.read(lessonState.course, P.lesson.resolve(lessonState.path, src), "bytes");
        img.src = URL.createObjectURL(new Blob([r.data]));
      } catch (e) { img.alt = img.alt || src; }
    });
    markActive();
  }

  function describe(o) {
    const parts = [];
    if (o.hands === "right") parts.push(t("right hand")); else if (o.hands === "left") parts.push(t("left hand")); else if (o.hands === "both") parts.push(t("both hands"));
    if (o.tempo) parts.push(t("{n} bpm", { n: o.tempo }));
    if (o.mode === "flow") parts.push(t("flow"));
    if (o.loop) parts.push(t("loop"));
    return parts.join(" · ");
  }

  async function activate(which) {
    if (!lessonState) return;
    let target;
    try {
      if (which.block != null) {
        const b = lessonState.blocks[which.block];
        target = { kind: "abc", data: b.text, opts: b.opts, title: (/^T:\s*(.+)$/m.exec(b.text) || [])[1] || "", source: { block: which.block } };
      } else {
        const pc = lessonState.pieces[which.piece];
        const kind = P.lesson.kind(pc.path);
        const bytes = kind === "mxl" || kind === "midi";
        const r = pc.data ? { data: pc.data, modified: 0 } : await library.read(lessonState.course, pc.path, bytes ? "bytes" : "text");
        pc.modified = r.modified;
        let data = r.data;
        if (kind === "mxl") data = binaryString(r.data);
        const tracks = kind === "midi" ? (settings.get("midiHands") || {})[lessonState.course + "|" + pc.path] : null;
        target = { kind, data, opts: tracks ? { ...pc.opts, tracks } : pc.opts, title: pc.title, message: t("A MIDI file has no sheet music: the falling notes show the piece."), source: { piece: which.piece } };
      }
      lessonState.active = which;
      markActive();
      passes = [];
      await practice.load(target);
      const s = practice.state();
      $("status").textContent = "";
      if (s.song) $("status").textContent = t("{n} bars", { n: s.song.measures });
      if (target.kind === "midi") renderTracks(lessonState.course + "|" + lessonState.pieces[which.piece].path);
    } catch (e) {
      toast(t("Couldn't load that music: {why}", { why: e.message || String(e) }));
      K.errlog && K.errlog.note && K.errlog.note("load", String(e && e.stack || e));
    }
  }

  // A MIDI file's tracks, each played by a hand, split by pitch, or left out.
  function renderTracks(key) {
    const song = practice.song;
    if (!song || !song.tracks || !song.tracks.length) return;
    const box = el("div", "tracks");
    box.appendChild(el("h3", null, t("Tracks")));
    const choice = () => song.tracks.map((tr) => tr.hand);
    song.tracks.forEach((tr, i) => {
      const row = el("div", "track-row");
      row.appendChild(el("span", "track-name", tr.name || t("Track {n}", { n: i + 1 })));
      row.appendChild(el("span", "dim", t("{n} notes", { n: tr.notes })));
      const pick = seg([["right", t("Right")], ["left", t("Left")], ["split", t("Split")], ["off", t("Off")]], (v) => {
        const list = choice(); list[i] = v;
        if (list.every((h) => h === "off")) { toast(t("Keep at least one track on.")); setSeg(pick, tr.hand); return; }
        const all = { ...(settings.get("midiHands") || {}) }; all[key] = list; settings.set("midiHands", all);
        practice.act.trackHands(list);
        renderTracks(key);
      });
      setSeg(pick, tr.hand);
      row.appendChild(pick);
      box.appendChild(row);
    });
    box.appendChild(el("p", "dim", t("Split sends notes below middle C to the left hand.")));
    const old = mounts.score.querySelector(".tracks");
    if (old) old.replaceWith(box); else mounts.score.appendChild(box);
  }

  function binaryString(bytes) {
    let s = "";
    for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return s;
  }

  function markActive() {
    const a = lessonState && lessonState.active;
    mounts.lesson.querySelectorAll(".practice-block").forEach((n) => n.classList.toggle("active", !!a && a.block === +n.dataset.block));
    mounts.lesson.querySelectorAll(".piece-card").forEach((n) => n.classList.toggle("active", !!a && a.piece === +n.dataset.piece));
    const node = mounts.lesson.querySelector(".active");
    if (node) node.scrollIntoView({ block: "nearest" });
  }

  // A lesson or piece in one of your folders reloads when its file changes.
  function watch() {
    stopWatching();
    if (!lessonState || !library.writable(lessonState.course)) return;
    watchTimer = setInterval(async () => {
      const s = lessonState; if (!s) return;
      if (s.path && !(editorShown() && editor.dirty)) {
        const m = await library.modified(s.course, s.path);
        if (m && m !== s.modified) {
          const r = await library.read(s.course, s.path);
          const before = s.active && s.active.block != null ? s.blocks[s.active.block] && s.blocks[s.active.block].text : null;
          s.modified = r.modified; s.text = r.data;
          if (editorShown() && !editor.dirty && editor.text !== r.data) editor.open(r.data, s.course + "|" + s.path);
          const fm = P.lesson.frontMatter(r.data);
          s.meta = fm.meta;
          const keep = mounts.lesson.scrollTop;
          renderLessonText(fm.body);
          mounts.lesson.scrollTop = keep;
          if (s.active && s.active.block != null && s.blocks[s.active.block] && s.blocks[s.active.block].text !== before && !practice.engine.playing) activate(s.active);
        }
      }
      if (s.active && s.active.piece != null) {
        const pc = s.pieces[s.active.piece];
        const m = pc && await library.modified(s.course, pc.path);
        if (m && pc.modified && m !== pc.modified && !practice.engine.playing) activate(s.active);
      }
    }, 1500);
  }
  function stopWatching() { clearInterval(watchTimer); watchTimer = 0; }

  // Clicks on links in the lesson.
  document.addEventListener("click", (e) => {
    const a = e.target.closest && e.target.closest(".lesson-text a");
    if (!a) return;
    if (a.dataset.piece != null) { e.preventDefault(); activate({ piece: +a.dataset.piece }); return; }
    if (a.dataset.lesson) { e.preventDefault(); openLesson(lessonState.course, a.dataset.lesson); return; }
    if (a.dataset.book) { e.preventDefault(); openBook(a.dataset.book, true); return; }
    const href = a.getAttribute("href") || "";
    if (/^https?:/i.test(href)) { e.preventDefault(); K.platform.openOutside(href); }
  });

  // ---- transport ----
  const tr = {};
  function buildTransport(timelineCanvas) {
    const bar = $("transport");
    tr.play = button("", "icon-btn play-btn", () => practice.act.toggle(performance.now()));
    tr.restart = iconButton("skip-back", t("Back to the start"), () => practice.act.restart());
    const g1 = group(null, tr.play, tr.restart);
    const tl = el("div", "timeline");
    tl.appendChild(timelineCanvas);
    tl.title = t("Click a bar to go there; drag across bars to loop them");
    tr.mode = seg([["wait", t("Wait")], ["flow", t("Flow")]], (v) => practice.act.mode(v));
    tr.mode.title = t("Wait for each note, or keep going and score what you play");
    tr.speedDown = iconButton("minus", t("Slower"), () => practice.act.speed(Math.max(0.25, practice.engine.speed - 0.05)));
    tr.speedRange = document.createElement("input");
    tr.speedRange.type = "range"; tr.speedRange.min = "25"; tr.speedRange.max = "150"; tr.speedRange.step = "5"; tr.speedRange.className = "speed-range";
    tr.speedRange.setAttribute("aria-label", t("Speed"));
    tr.speedRange.addEventListener("input", () => practice.act.speed(+tr.speedRange.value / 100));
    tr.speedValue = el("span", "speed-value");
    tr.speedUp = iconButton("plus", t("Faster"), () => practice.act.speed(Math.min(1.5, practice.engine.speed + 0.05)));
    const speed = group(t("Speed"), tr.speedDown, tr.speedRange, tr.speedValue, tr.speedUp);
    tr.loop = iconButton("repeat", t("Loop"), () => practice.act.loop(!practice.engine.loop.on));
    tr.autoSpeed = iconButton("trending-up", t("Speed up 5% after each clean pass of the loop"), () => { settings.set("autoSpeed", !settings.get("autoSpeed")); renderTransport(practice.state()); });
    tr.keyDown = iconButton("minus", t("Down a semitone"), () => practice.act.transpose(practice.state().transpose - 1));
    tr.keyValue = el("span", "speed-value");
    tr.keyValue.title = t("Transpose: what you hear and play moves; the score stays in its written key");
    tr.keyUp = iconButton("plus", t("Up a semitone"), () => practice.act.transpose(practice.state().transpose + 1));
    tr.record = iconButton("circle", t("Record what you play"), () => toggleRecord());
    tr.record.classList.add("rec-btn");
    tr.recTime = el("span", "rec-time");
    tr.video = iconButton("video", t("Record a video of the falling notes"), () => toggleVideo());
    tr.video.classList.add("rec-btn");
    tr.right = seg([["me", t("You")], ["auto", t("App")], ["off", t("Off")]], (v) => practice.act.hand("right", v));
    tr.left = seg([["me", t("You")], ["auto", t("App")], ["off", t("Off")]], (v) => practice.act.hand("left", v));
    tr.metronome = iconButton("timer", t("Metronome"), () => practice.act.metronome(!practice.engine.metronome));
    tr.countIn = button(t("Count-in"), "btn", () => practice.act.countIn(!practice.engine.countIn));
    bar.append(g1, tl, tr.mode, speed, group(null, tr.loop, tr.autoSpeed), group(t("Right"), tr.right), group(t("Left"), tr.left),
      group(t("Key"), tr.keyDown, tr.keyValue, tr.keyUp), group(null, tr.metronome, tr.countIn), group(null, tr.record, tr.recTime, tr.video));
  }

  function renderTransport(s) {
    if (!tr.play) return;
    tr.play.replaceChildren(icon(s.playing ? "pause" : "play", 20));
    tr.play.title = s.playing ? t("Pause (Space)") : t("Play (Space)");
    tr.play.setAttribute("aria-label", tr.play.title);
    setSeg(tr.mode, s.mode);
    tr.speedRange.value = String(Math.round(s.speed * 100));
    tr.speedValue.textContent = Math.round(s.speed * 100) + "%";
    tr.loop.setAttribute("aria-pressed", String(!!s.loop.on));
    setSeg(tr.right, s.hands.right); setSeg(tr.left, s.hands.left);
    tr.metronome.setAttribute("aria-pressed", String(!!s.metronome));
    tr.countIn.setAttribute("aria-pressed", String(!!s.countIn));
    tr.autoSpeed.setAttribute("aria-pressed", String(!!settings.get("autoSpeed")));
    tr.keyValue.textContent = s.transpose > 0 ? "+" + s.transpose : String(s.transpose || 0);
    for (const b of [tr.keyDown, tr.keyUp, tr.loop, tr.autoSpeed, tr.metronome, tr.countIn, tr.restart]) b.disabled = !s.song;
    tr.play.disabled = !s.song;
    let status = "";
    if (s.counting) status = t("Counting in");
    else if (s.waiting && s.expected.length) status = t("Play {notes}", { notes: s.expected.map((m) => P.music.name(m)).join(" ") });
    else if (s.song && !s.playing && s.next >= 0 && s.mode === "wait" && s.t === 0) status = t("Play the first note to start");
    $("status").textContent = status;
    if (s.lastResult && s.lastResult !== shownResult) {
      shownResult = s.lastResult;
      const r = s.lastResult;
      if (r.kind === "pass" && r.speedUp) toast(t("Clean pass {n}: now {speed}%", { n: r.pass, speed: Math.round(r.speedUp * 100) }));
      else if (r.kind === "pass") toast(r.clean ? t("Clean pass {n}", { n: r.pass }) : t("Pass {n}: {acc}% right, {wrong} wrong", { n: r.pass, acc: r.accuracy, wrong: r.wrong }));
      else if (!(r.hits + r.late + r.misses)) toast(t("The end"));
      else toast(t("Done: {acc}% right, {wrong} wrong notes", { acc: r.accuracy, wrong: r.wrong }), 5000);
    }
  }
  let shownResult = null;

  function seg(options, onPick) {
    const box = el("div", "seg");
    box.setAttribute("role", "group");
    for (const [value, label] of options) {
      const b = button(label, null, () => onPick(value));
      b.dataset.value = value;
      b.setAttribute("aria-pressed", "false");
      box.appendChild(b);
    }
    return box;
  }
  function setSeg(box, value) { for (const b of box.children) b.setAttribute("aria-pressed", String(b.dataset.value === value)); }
  function group(label, ...kids) { const g = el("div", "group"); if (label) g.appendChild(el("span", "label", label)); g.append(...kids); return g; }
  function iconButton(name, label, onClick) { const b = button("", "icon-btn", onClick); b.appendChild(icon(name)); b.title = label; b.setAttribute("aria-label", label); return b; }

  // Playing the drawn keyboard with the mouse or a finger.
  function mouseKeys(canvas) {
    let down = null;
    canvas.addEventListener("pointerdown", (e) => {
      const r = canvas.getBoundingClientRect();
      const m = practice.roll.keyFromPoint(e.clientX - r.left, e.clientY - r.top);
      if (m == null) return;
      canvas.setPointerCapture(e.pointerId);
      synth.unlock();
      down = m; routeNote(m, true, 90, performance.now(), "mouse");
    });
    const up = () => { if (down != null) { routeNote(down, false, 0, performance.now(), "mouse"); down = null; } };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  // ---- shortcuts ----
  let captureKey = null;
  window.addEventListener("keydown", (e) => {
    if (captureKey) {
      const k = P.hotkeys.keyOf(e);
      if (!k) return;
      e.preventDefault(); e.stopImmediatePropagation();
      captureKey(k === "Escape" ? null : k);
      return;
    }
    if (e.metaKey || $("settings").open || themeOpen() || $("lesson-screen").hidden) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "range") return;
    const action = hot.actionForKey(P.hotkeys.keyOf(e));
    if (!action) return;
    e.preventDefault();
    runAction(action);
  }, true);

  function runAction(a) {
    if (!practice || $("lesson-screen").hidden) return;
    const e = practice.engine;
    switch (a) {
      case "toggle": practice.act.toggle(performance.now()); break;
      case "restart": practice.act.restart(); break;
      case "barBack": practice.act.bar(-1); break;
      case "barNext": practice.act.bar(1); break;
      case "faster": practice.act.speed(Math.min(1.5, e.speed + 0.05)); break;
      case "slower": practice.act.speed(Math.max(0.25, e.speed - 0.05)); break;
      case "loop": practice.act.loop(!e.loop.on); break;
      case "mode": practice.act.mode(e.mode === "wait" ? "flow" : "wait"); break;
      case "metronome": practice.act.metronome(!e.metronome); break;
      case "record": toggleRecord(); break;
      case "library": if (editingLayout) toggleLayoutEditor(false); else showLibrary(); break;
    }
  }

  // ---- settings ----
  // ---- settings: a page per topic, each setting a row with its control
  // on the right ----
  let settingsTab = "piano";
  function renderSettings() {
    const dlg = $("settings");
    const head = el("div", "sheet-head");
    const h = el("h2", null, t("Settings")); h.id = "settings-title";
    head.append(h, iconButton("x", t("Close"), () => dlg.close()));
    const pages = [
      ["piano", "piano", t("Piano"), pianoPage],
      ["practice", "target", t("Practice"), practicePage],
      ["sound", "volume", t("Sound"), soundPage],
      ["shortcuts", "keyboard", t("Shortcuts"), shortcutsSection],
      ["look", "palette", t("Look"), lookPage],
      ["progress", "chart", t("Your progress"), progressPage],
      ["about", "info", t("About"), aboutPage],
    ];
    if (!pages.some((p) => p[0] === settingsTab)) settingsTab = "piano";
    const nav = el("nav", "settings-nav");
    nav.setAttribute("aria-label", t("Settings pages"));
    const pane = el("div", "settings-pane");
    for (const [id, ic, label, make] of pages) {
      const b = button("", "settings-tab", () => { settingsTab = id; renderSettings(); });
      b.append(icon(ic), el("span", null, label));
      b.setAttribute("aria-current", String(id === settingsTab));
      nav.appendChild(b);
      if (id === settingsTab) { const page = make(); page.classList.add("settings-page"); pane.appendChild(page); }
    }
    const body = el("div", "settings-body");
    body.append(nav, pane);
    dlg.replaceChildren(head, body);
  }

  // A labelled row: what it is (and a line on why) on the left, the
  // control on the right.
  function setting(label, control, hint) {
    const row = el("div", "set-row");
    const text = el("div", "set-text");
    const id = "set-" + Math.random().toString(36).slice(2, 8);
    const name = el("label", "set-label", label); name.htmlFor = id;
    text.appendChild(name);
    if (hint) text.appendChild(el("p", "set-hint", hint));
    const focusable = control.matches && control.matches("input, select, button") ? control : control.querySelector && control.querySelector("input, select");
    if (focusable) focusable.id = id;
    const ctl = el("div", "set-control"); ctl.appendChild(control);
    row.append(text, ctl);
    return row;
  }
  function toggle(label, key, hint, onChange) {
    const c = document.createElement("input"); c.type = "checkbox"; c.className = "switch"; c.checked = !!settings.get(key);
    c.setAttribute("role", "switch");
    c.addEventListener("change", () => { settings.set(key, c.checked); if (onChange) onChange(c.checked); });
    return setting(label, c, hint);
  }
  function setGroup(title, ...rows) {
    const g = el("div", "set-group");
    if (title) g.appendChild(el("h4", null, title));
    const card = el("div", "set-card"); card.append(...rows.filter(Boolean));
    g.appendChild(card);
    return g;
  }
  function page(title, intro, ...groups) {
    const s = document.createElement("section");
    s.appendChild(el("h3", null, title));
    if (intro) s.appendChild(intro);
    s.append(...groups.filter(Boolean));
    return s;
  }
  function select(options, value, onChange) {
    const s = document.createElement("select");
    for (const [v, label] of options) s.appendChild(new Option(label, v));
    s.value = value;
    s.addEventListener("change", () => onChange(s.value));
    return s;
  }

  function pianoPage() {
    const d = midi.devices();
    const ok = d.status !== "unsupported" && d.status !== "denied" && d.inputs.length > 0;
    const status = d.status === "unsupported" ? t("This browser has no MIDI. The desktop app, Chrome and Edge do.")
      : d.status === "denied" ? t("MIDI access was blocked. Allow it for this app and reopen it.")
        : d.inputs.length ? d.inputs.map((i) => i.name).join(", ") : t("No piano found. Connect it by USB; it shows up here by itself.");
    const card = el("div", "device-card" + (ok ? " on" : ""));
    card.append(icon("piano", 22), el("div", "grow"));
    card.lastChild.append(el("strong", null, ok ? t("Connected") : t("No piano")), el("span", "dim", status));
    const out = select([["", t("The app's own sound")], ...d.outputs.map((o) => [o.id, o.name])], settings.get("output") || "", (v) => { settings.set("output", v); midi.setOutput(v); });
    const lights = select([["-1", t("Off")], ...Array.from({ length: 16 }, (_, c) => [String(c), t("Channel {n}", { n: c + 1 })])], String(settings.get("lightChannel")),
      (v) => { midi.light([], settings.get("lightChannel")); settings.set("lightChannel", +v); });
    const lat = range(0, 300, 5, settings.get("latency"), (v) => { settings.set("latency", v); practice && practice.engine.setLatency(v); }, (v) => t("{n} ms", { n: v }));
    const calNote = el("p", "set-hint", t("Tap any piano key with each of eight clicks. Use it if notes you play on time count as late."));
    const measure = button(t("Measure"), "btn", () => calibrate(calNote, lat));
    measure.prepend(icon("timer"));
    const latRow = setting(t("Timing delay"), lat, null);
    latRow.querySelector(".set-text").appendChild(calNote);
    latRow.querySelector(".set-control").appendChild(measure);
    return page(t("Piano"), card,
      setGroup(t("Sound"),
        setting(t("The app's notes play on"), out, t("Your piano, if it has MIDI in, or the app's own sound.")),
        toggle(t("Play my notes in the app too"), "echo", t("For a keyboard with no speakers of its own."))),
      setGroup(t("Playing"),
        latRow,
        toggle(t("Computer keyboard as a piano"), "typing", t("A is middle C; Z and X change octave.")),
        setting(t("Lit keys"), lights, t("Lights the next notes on a keyboard with lights in its keys, on its lighting channel."))));
  }

  function practicePage() {
    return page(t("Practice"), null,
      setGroup(t("Falling notes"),
        setting(t("How far ahead"), range(1, 8, 0.5, settings.get("lookahead"), (v) => { settings.set("lookahead", v); practice && practice.draw(); }, (v) => t("{n} s", { n: v }))),
        setting(t("Keyboard"), select([["song", t("Just the piece's notes")], ["full", t("All 88 keys")]], settings.get("range"), (v) => { settings.set("range", v); practice && practice.roll.setRange(v); practice && practice.draw(); })),
        setting(t("Note names"), select([["off", t("None")], ["letters", t("Letters (C D E)")], ["solfege", t("Solfège (Do Re Mi)")]], settings.get("noteNames"), (v) => { settings.set("noteNames", v); applyLabels(); })),
        toggle(t("Finger numbers"), "fingers", t("Where the music has them."), applyLabels)),
      setGroup(t("Goals"),
        setting(t("Daily goal"), range(0, 60, 5, settings.get("goal"), (v) => { settings.set("goal", v); statsSoon(); }, (v) => (v ? t("{n} min", { n: v }) : t("none"))), t("Today's practice is timed to it.")),
        setting(t("Auto speed-up stops at"), range(50, 150, 5, settings.get("autoSpeedGoal"), (v) => settings.set("autoSpeedGoal", v), (v) => v + "%"), t("Each clean pass of a loop goes 5% faster, up to here."))));
  }

  function soundPage() {
    return page(t("Sound"), null,
      setGroup(null,
        setting(t("Piano"), select([["grand", t("Grand piano (recorded)")], ["simple", t("Simple (made by the app)")]], settings.get("sound"), (v) => { settings.set("sound", v); synth.setSound(v); }),
          t("The grand is a recorded Yamaha; the simple one loads nothing.")),
        setting(t("Volume"), range(0, 1, 0.05, settings.get("volume"), (v) => { settings.set("volume", v); synth.setVolume(v); }, (v) => Math.round(v * 100) + "%")),
        setting(t("Room"), range(0, 0.5, 0.02, settings.get("room"), (v) => { settings.set("room", v); synth.setRoom(v); }, (v) => Math.round(v * 200) + "%"), t("How much the sound rings around the room.")),
        setting(t("The app's hand"), range(0.2, 1, 0.05, settings.get("autoVolume") ?? 0.8, (v) => settings.set("autoVolume", v), (v) => Math.round(v * 100) + "%"), t("How loud the hand the app plays is, beside yours."))));
  }

  function lookPage() {
    const theme = select([["system", t("Like Windows")], ["light", t("Light")], ["dark", t("Dark")]], settings.get("theme"), (v) => { settings.set("theme", v); applyTheme(); });
    const fx = select([["off", t("Off")], ["subtle", t("Subtle")], ["full", t("Full")]], effectsLevel(), (v) => { settings.set("effects", v); applyEffects(); });
    const editColours = button(t("Edit colours"), "btn", () => { $("settings").close(); openThemeEditor(); });
    editColours.prepend(icon("palette"));
    const reset = button(t("Reset"), "btn", () => { settings.set("layout", null); if (!$("lesson-screen").hidden) renderLayout(); toast(t("Layout reset")); });
    return page(t("Look"), null,
      setGroup(null,
        setting(t("Theme"), theme),
        setting(t("Colours"), editColours, t("Change any colour, for light and dark, with a check that text stays readable.")),
        setting(t("Glow and sparks on the keys"), fx, t("Off when Windows asks for less motion.")),
        setting(t("Panel layout"), reset, t("To move panels, use the layout button at the top of a lesson."))));
  }

  function progressPage() {
    const exp = button(t("Save a copy"), "btn", () => downloadBytes(new TextEncoder().encode(JSON.stringify(progress.all(), null, 1)), "piano-progress.json", "application/json"));
    exp.prepend(icon("download"));
    const imp = button(t("Load a copy"), "btn", () => {
      const input = document.createElement("input"); input.type = "file"; input.accept = ".json,application/json";
      input.addEventListener("change", async () => {
        const f = input.files[0]; if (!f) return;
        let ok = false; try { ok = progress.replace(JSON.parse(await f.text())); } catch (e) { ok = false; }
        toast(ok ? t("Progress loaded") : t("That file isn't saved progress from this app."));
      });
      input.click();
    });
    imp.prepend(icon("upload"));
    const all = progress.all();
    const pieces = Object.keys(all.pieces).length, secs = Object.values(all.days).reduce((a, b) => a + b, 0);
    const tiles = el("div", "tiles");
    tiles.append(tile(minutes(secs), t("practised")), tile(String(pieces), t("pieces and drills")), tile(String(progress.streak(today())), t("days in a row")));
    return page(t("Your progress"), tiles,
      setGroup(null,
        setting(t("Save a copy"), exp, t("Kept on this computer only. A copy moves it to another one.")),
        setting(t("Load a copy"), imp, t("Replaces what's here with the copy."))));
  }

  function aboutPage() {
    const credits = [
      ["abcjs", t("draws ABC music")], ["OpenSheetMusicDisplay", t("draws MusicXML")], ["markdown-it", t("reads lessons")],
      ["pdf.js", t("shows PDF books")], ["Salamander Grand Piano", t("the piano sound, by Alexander Holm, CC-BY 3.0")], ["Lucide", t("icons")],
    ];
    const list = el("div", "set-card");
    for (const [name, what] of credits) { const r = el("div", "set-row"); r.append(el("strong", null, name), el("span", "dim", what)); list.appendChild(r); }
    return page(t("About"), el("p", "dim", t("Piano, version {v}. A practice app for your own lessons, on this computer.", { v: APP_VERSION })),
      el("h4", null, t("Made with")), list);
  }

  // Tap along with 8 clicks; the middle of your offsets is the delay.
  function calibrate(note, slider) {
    if (calibrating) return;
    synth.unlock();
    calibrating = true;
    const GAP = 600, LEAD = 2, COUNT = 8;
    const clicks = [], taps = [];
    note.textContent = t("Listen to two clicks, then tap with the next eight.");
    for (let i = 0; i < LEAD + COUNT; i++) {
      setTimeout(() => { synth.click(i < LEAD); if (i >= LEAD) clicks.push(performance.now()); }, 300 + i * GAP);
    }
    captureNote = () => { taps.push(performance.now()); };
    setTimeout(() => {
      calibrating = false; captureNote = null;
      const offs = [];
      for (const c of clicks) {
        const near = taps.map((x) => x - c).filter((d) => d > -150 && d < 300);
        if (near.length) offs.push(near.reduce((a, b) => (Math.abs(a) < Math.abs(b) ? a : b)));
      }
      if (offs.length < 5) { note.textContent = t("Not enough taps heard ({n} of 8). Try again, tapping with each click.", { n: offs.length }); return; }
      offs.sort((a, b) => a - b);
      const ms = Math.max(0, Math.min(300, Math.round(offs[offs.length >> 1] / 5) * 5));
      settings.set("latency", ms);
      if (practice) practice.engine.setLatency(ms);
      const input = slider.querySelector("input"); if (input) { input.value = String(ms); input.dispatchEvent(new Event("input")); }
      note.textContent = t("Measured {n} ms. Notes are now judged that much earlier.", { n: ms });
    }, 300 + (LEAD + COUNT) * GAP + 400);
  }

  function section(title) { const s = document.createElement("section"); s.appendChild(el("h3", null, title)); return s; }
  function field(label, control) { const f = el("label", "field"); f.append(el("span", null, label), control); return f; }
  function check(label, key) {
    const l = el("label", "check");
    const c = document.createElement("input"); c.type = "checkbox"; c.checked = !!settings.get(key);
    c.addEventListener("change", () => settings.set(key, c.checked));
    l.append(c, el("span", null, label));
    return l;
  }
  function range(min, max, step, value, onInput, fmt) {
    const box = el("div", "row");
    const r = document.createElement("input");
    r.type = "range"; r.min = min; r.max = max; r.step = step; r.value = value;
    const v = el("span", "speed-value", fmt(value));
    r.addEventListener("input", () => { v.textContent = fmt(+r.value); onInput(+r.value); });
    box.append(r, v);
    return box;
  }

  // ---- progress: time per day, runs, best tempo, weak bars ----
  const progress = P.progress.create({
    load: () => JSON.parse(localStorage.getItem("piano.progress") || "null"),
    save: (d) => localStorage.setItem("piano.progress", JSON.stringify(d)),
  });
  const today = () => P.progress.dayKey(new Date());
  let passes = [];

  // What the progress is filed under: a piece by its file (the same piece
  // from two lessons is one piece), an exercise by its lesson and place.
  function pieceKey() {
    const s = lessonState, tg = practice && practice.target;
    if (tg && tg.source && tg.source.drill) return "drill|" + tg.source.drill;
    if (!s || !tg || !tg.source || !s.course) return null;
    if (tg.source.piece != null) { const pc = s.pieces[tg.source.piece]; return pc && !pc.data ? s.course + "|" + pc.path : null; }
    return s.course + "|" + s.path + "#" + tg.source.block;
  }
  function pieceTitle() {
    const tg = practice && practice.target;
    if (!tg) return "";
    if (tg.source && tg.source.drill) return tg.source.label;
    if (tg.source && tg.source.block != null) return (tg.title || t("Exercise {n}", { n: tg.source.block + 1 })) + " · " + ($("title").textContent || "");
    return tg.title || "";
  }

  function onEvent(e) {
    if (e.type === "state") { if (e.playing) takeStart(); else takeEnd(); }
    if (e.type === "hit" && take) take.hits.push(e);
    if (e.type === "loop") { takeEnd(); if (practice.engine.playing) takeStart(); }
    if (e.type === "loop" && e.clean && plan && plan.key === pieceKey()) setTimeout(() => { if (!plan) return; toast(t("Clean. Next: {step}", { step: plan.at + 1 < plan.steps.length ? planLabel(plan.steps[plan.at + 1]) : t("done") })); planStep(1); }, 0);
    if (e.type !== "loop" && e.type !== "end") return;
    const song = practice.song; if (!song) return;
    // Listening to the app play both hands isn't a run of yours.
    if (!(e.stats.hits + e.stats.late + e.stats.misses)) return;
    const run = { speed: practice.engine.speed, mode: practice.engine.mode, stats: e.stats, clean: !!e.clean,
      kind: e.type === "loop" ? "pass" : "run", bars: P.progress.barsOf(song, practice.engine.results) };
    passes.unshift({ ...run, n: e.pass || null });
    if (passes.length > 12) passes.length = 12;
    const key = pieceKey();
    if (key) { progress.addRun(key, pieceTitle(), run, today()); progress.flush(); }
    statsSoon();
    if (e.type === "end" && lessonState && lessonState.drill && drillSettings().next) setTimeout(() => { if (lessonState && lessonState.drill && !practice.engine.playing) newDrill(); }, 1800);
  }

  // A second of practice counts while the music moves or you've played in
  // the last 15 seconds, with the window in front.
  let ticks = 0;
  setInterval(() => {
    if (!practice || $("lesson-screen").hidden || document.visibilityState !== "visible") return;
    if (!(practice.engine.playing || performance.now() - lastNoteAt < 15000)) return;
    progress.addTime(pieceKey(), pieceTitle(), 1, today());
    if (++ticks % 15 === 0) { progress.flush(); statsSoon(); }
  }, 1000);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") progress.flush(); });
  window.addEventListener("pagehide", () => progress.flush());

  let statsTimer = 0;
  function statsSoon() { if (!statsTimer) statsTimer = setTimeout(() => { statsTimer = 0; renderStats(); }, 400); }
  setInterval(() => { if (practice && practice.engine.playing) statsSoon(); }, 1000);

  const pct = (x) => Math.round(x * 100) + "%";
  const minutes = (sec) => sec < 60 ? t("{n} s", { n: Math.round(sec) }) : sec < 3600 ? t("{n} min", { n: Math.round(sec / 60) }) : t("{h} h {m} min", { h: Math.floor(sec / 3600), m: Math.round((sec % 3600) / 60) });
  function tile(value, label, cls) { const d = el("div", "tile" + (cls ? " " + cls : "")); d.append(el("strong", null, value), el("span", null, label)); return d; }

  function renderStats() {
    if (!practice || !mounts.stats || $("lesson-screen").hidden) return;
    const root = mounts.stats;
    const keep = root.scrollTop;
    const st = practice.state();
    const parts = [];
    if (st.song) {
      const s = st.stats;
      const live = el("section");
      live.appendChild(el("h4", null, t("This run")));
      const tiles = el("div", "tiles");
      tiles.append(tile(s.accuracy + "%", t("right")), tile(String(s.hits), t("on time"), "good"), tile(String(s.late), t("late"), "late"),
        tile(String(s.misses), t("missed"), "bad"), tile(String(s.wrong), t("wrong"), "bad"), tile(s.timing + " ms", t("off the beat")));
      live.appendChild(tiles);
      parts.push(live);
      const tk = takeSection();
      if (tk) parts.push(tk);
      const planned = pieceKey() && !(lessonState && lessonState.drill);
      if (planned && plan && plan.key === pieceKey()) parts.unshift(planSection());
      if (passes.length) {
        const sec = el("section");
        sec.appendChild(el("h4", null, t("Runs and passes")));
        const ul = el("ul", "passes");
        for (const p of passes.slice(0, 8)) {
          const li = document.createElement("li");
          li.append(el("span", null, p.kind === "pass" ? t("Pass {n}", { n: p.n }) : t("Whole piece")),
            el("span", null, p.stats.accuracy + "%" + (p.clean ? " · " + t("clean") : "")), el("span", "dim", pct(p.speed) + " · " + t(p.mode === "flow" ? "flow" : "wait")));
          ul.appendChild(li);
        }
        sec.appendChild(ul);
        parts.push(sec);
      }
      const key = pieceKey();
      const pc = key && progress.piece(key);
      const piece = el("section");
      piece.appendChild(el("h4", null, t("This piece, all time")));
      if (pc) {
        const tiles2 = el("div", "tiles");
        tiles2.append(tile(pc.best ? pct(pc.best.speed) : "—", t("best tempo")), tile(String(pc.runs), t("runs")), tile(String(pc.clean), t("clean")), tile(minutes(pc.seconds), t("practised")));
        piece.appendChild(tiles2);
        const weak = progress.weakBars(key, 3);
        practice.score.trouble(weak.map((b) => b.measure));
        if (weak.length) {
          const w = el("div", "weak");
          w.appendChild(el("span", "dim", t("The bars that trip you up")));
          for (const b of weak) {
            const row = el("div", "row");
            row.append(el("span", null, t("Bar {n}", { n: b.measure + 1 }) + " · " + t("{n}% trouble", { n: Math.round(b.score * 100) })), button(t("Loop it"), "btn", () => practice.act.loopMeasure(b.measure)));
            w.appendChild(row);
          }
          piece.appendChild(w);
        }
      } else piece.appendChild(el("p", "dim", key ? t("Nothing yet. Finish a run or a loop pass and it shows here.") : t("Pieces you opened as single files aren't tracked.")));
      if (pc && !pc.best) piece.appendChild(el("p", "dim", t("Best tempo counts flow-mode runs with {n}% or more right.", { n: P.progress.GOOD })));
      parts.push(piece);
      if (planned && !(plan && plan.key === pieceKey())) parts.push(planSection());
    }
    parts.push(daysSection());
    root.replaceChildren(...parts);
    root.scrollTop = keep;
  }

  function daysSection() {
    const sec = el("section");
    const d = today();
    sec.appendChild(el("h4", null, t("Practice days")));
    const list = progress.days(14, d);
    const max = Math.max(600, ...list.map((x) => x.seconds));
    const bars = el("div", "days");
    for (const x of list) {
      const b = el("div", "day" + (x.seconds ? "" : " none") + (x.day === d ? " today" : ""));
      b.style.height = Math.max(4, Math.round((x.seconds / max) * 100)) + "%";
      b.title = x.day + ": " + minutes(x.seconds);
      bars.appendChild(b);
    }
    sec.appendChild(bars);
    const goal = settings.get("goal") || 0;
    const streak = progress.streak(d, Math.max(60, goal * 60));
    const done = progress.today(d);
    const line = el("p", "dim streak");
    if (streak > 1) line.appendChild(icon("flame"));
    line.append(t("Today {time}", { time: minutes(done) }) + (goal ? " " + t("of {n} min", { n: goal }) + (done >= goal * 60 ? " · " + t("goal met") : "") : "") + (streak > 1 ? " · " + t("{n} days in a row", { n: streak }) : ""));
    sec.appendChild(line);
    if (goal) {
      const meter = document.createElement("progress");
      meter.className = "goal"; meter.max = goal * 60; meter.value = Math.min(goal * 60, done);
      meter.setAttribute("aria-label", t("Today's goal"));
      sec.appendChild(meter);
    }
    return sec;
  }
  function daysCard() { const c = el("div", "days-card"); c.appendChild(daysSection()); return c; }

  // ---- the book ----
  async function openBook(ref, reveal) {
    const b = P.lesson.bookRef(ref);
    if (!b || !lessonState || !lessonState.course) return;
    const path = P.lesson.resolve(lessonState.path || lessonState.piecePath || "", b.file);
    const id = lessonState.course + "|" + path;
    try {
      const shown = P.layout.panels(currentLayout());
      if (!shown.includes("book")) {
        // A book opened by hand takes the lesson's side; one a lesson opens sits at the right edge.
        setLayout(reveal ? P.layout.place(currentLayout(), "book", shown.includes("lesson") ? "lesson" : shown[0], "right") : { dir: "row", sizes: [0.72, 0.28], children: [currentLayout(), "book"] });
        autoBook = !reveal;
      }
      const page = b.page || (settings.get("bookPages") || {})[id] || 1;
      if (pdf.key === id) { pdf.go(page); return; }
      const r = await library.read(lessonState.course, path, "bytes");
      await pdf.open(r.data, page, id, b.file.split("/").pop());
    } catch (e) {
      toast(t("Couldn't open the book: {why}", { why: e.message || String(e) }));
    }
  }

  // Music without a book closes the last one, and takes its panel away if
  // a lesson put it there.
  let autoBook = false;
  function dropBook() {
    if (pdf.key) pdf.close();
    if (autoBook && P.layout.panels(currentLayout()).includes("book")) setLayout(P.layout.remove(currentLayout(), "book"));
    autoBook = false;
  }

  // ---- free play and recording ----
  async function openFree() {
    lessonState = { course: null, path: null, meta: {}, blocks: [], pieces: [], active: null, free: true };
    dropBook();
    showLessonScreen(t("Free play"));
    mounts.lesson.replaceChildren(el("h1", null, t("Free play")),
      el("p", null, t("Play anything. What you play rises from the keys.")),
      el("p", "dim", t("Press record (or Shift+R) to keep it as a MIDI file.")));
    passes = [];
    await practice.load({ kind: "free", message: t("No music in free play: just you and the keys.") });
    renderStats();
  }

  let recTimer = 0;
  async function toggleRecord() {
    if (!recorder.recording) {
      synth.unlock();
      recorder.start(performance.now());
      tr.record.setAttribute("aria-pressed", "true");
      tr.record.title = t("Stop recording"); tr.record.setAttribute("aria-label", tr.record.title);
      const tick = () => { const s = Math.floor(recorder.elapsed(performance.now()) / 1000); tr.recTime.textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0"); };
      tick(); recTimer = setInterval(tick, 500);
      return;
    }
    const notes = recorder.stop(performance.now());
    clearInterval(recTimer);
    tr.recTime.textContent = "";
    tr.record.setAttribute("aria-pressed", "false");
    tr.record.title = t("Record what you play"); tr.record.setAttribute("aria-label", tr.record.title);
    if (!notes.length) { toast(t("Nothing was played, so nothing was saved.")); return; }
    const d = new Date();
    const name = "take " + today() + " " + String(d.getHours()).padStart(2, "0") + "." + String(d.getMinutes()).padStart(2, "0") + ".mid";
    const bytes = P.midifile.write(notes);
    try {
      if (lessonState && lessonState.course && library.writable(lessonState.course)) {
        await library.write(lessonState.course, "recordings/" + name, bytes);
        toast(t("Saved as recordings/{name} in the lesson's folder", { name }), 5000);
      } else await downloadBytes(bytes, name, "audio/midi");
    } catch (e) {
      if (e && e.name === "AbortError") return;
      toast(t("Couldn't save the recording: {why}", { why: e.message || String(e) }));
    }
  }

  // Saves bytes where you choose (the system's save dialog where there is
  // one, else a download).
  async function downloadBytes(bytes, name, type) {
    if (window.showSaveFilePicker) {
      const ext = name.slice(name.lastIndexOf("."));
      const h = await window.showSaveFilePicker({ suggestedName: name, types: [{ description: ext.slice(1).toUpperCase(), accept: { [type]: [ext] } }] });
      const w = await h.createWritable(); await w.write(bytes); await w.close();
      toast(t("Saved {name}", { name: h.name }));
      return;
    }
    const url = URL.createObjectURL(new Blob([bytes], { type }));
    const a = document.createElement("a"); a.href = url; a.download = name; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  // ---- the lesson editor ----
  function editorShown() { return !!editor && P.layout.panels(currentLayout()).includes("editor") && !$("lesson-screen").hidden; }
  function toggleEditor(on) {
    const want = on == null ? !editorShown() : on;
    const tree = currentLayout();
    if (want) {
      if (!lessonState || !lessonState.path) { toast(t("Open a lesson to edit it.")); return; }
      if (!P.layout.panels(tree).includes("editor")) setLayout({ dir: "row", sizes: [0.3, 0.7], children: ["editor", tree] });
      loadEditor();
      editor.focus();
    } else if (P.layout.panels(tree).includes("editor")) {
      if (editor.dirty) toast(t("Your changes are kept as a draft until you save them."), 4000);
      setLayout(P.layout.remove(tree, "editor"));
    }
    editBtn.setAttribute("aria-pressed", String(want));
  }
  function loadEditor() {
    if (!lessonState || !lessonState.path) return;
    const restored = editor.open(lessonState.text || "", lessonState.course + "|" + lessonState.path);
    if (restored) { toast(t("Unsaved changes from before, restored."), 4000); previewLesson(editor.text); }
    editBtn.setAttribute("aria-pressed", "true");
  }
  // The lesson panel shows the text as you type it.
  function previewLesson(text) {
    if (!lessonState) return;
    const s = lessonState;
    const before = s.active && s.active.block != null && s.blocks[s.active.block] ? s.blocks[s.active.block].text : null;
    const fm = P.lesson.frontMatter(text);
    s.meta = fm.meta;
    const keep = mounts.lesson.scrollTop;
    renderLessonText(fm.body);
    mounts.lesson.scrollTop = keep;
    if (s.active && s.active.block != null && s.blocks[s.active.block] && s.blocks[s.active.block].text !== before && !practice.engine.playing) activate(s.active);
  }
  async function saveLesson(text) {
    const s = lessonState;
    if (!s || !s.path) return;
    if (s.course && library.writable(s.course)) {
      await library.write(s.course, s.path, text);
      s.text = text;
      s.modified = await library.modified(s.course, s.path);
      toast(t("Saved"));
    } else {
      await downloadBytes(new TextEncoder().encode(text), s.path.split("/").pop(), "text/markdown");
      s.text = text;
    }
  }

  // ---- effects, video, lit keys ----
  function effectsLevel() {
    const v = settings.get("effects");
    if (v) return v;
    return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "off" : "subtle";
  }
  function applyEffects() { fx.setLevel(effectsLevel()); practice.setEffects(effectsLevel() === "off" ? null : fx); }

  let video = null;
  function toggleVideo() {
    if (video) { video.stop(); return; }
    const canvas = mounts.roll.querySelector("canvas");
    if (!canvas.captureStream || !window.MediaRecorder) { toast(t("Video recording isn't available here.")); return; }
    synth.unlock();
    const tracks = [...canvas.captureStream(60).getVideoTracks()];
    const audio = synth.stream();
    if (audio) tracks.push(...audio.getAudioTracks());
    const type = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm"].find((x) => MediaRecorder.isTypeSupported(x)) || "";
    const rec = new MediaRecorder(new MediaStream(tracks), type ? { mimeType: type, videoBitsPerSecond: 6e6 } : undefined);
    const chunks = [];
    rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
    rec.onstop = async () => {
      video = null;
      tr.video.setAttribute("aria-pressed", "false");
      for (const tk of tracks) if (tk.kind === "video") tk.stop();
      if (!chunks.length) return;
      toast(t("Saving the video…"), 1500);
      const bytes = new Uint8Array(await new Blob(chunks, { type: "video/webm" }).arrayBuffer());
      const d = new Date();
      try { await downloadBytes(bytes, "piano " + today() + " " + String(d.getHours()).padStart(2, "0") + "." + String(d.getMinutes()).padStart(2, "0") + ".webm", "video/webm"); }
      catch (e) { if (!e || e.name !== "AbortError") toast(t("Couldn't save the video: {why}", { why: e.message || String(e) })); }
    };
    rec.start(1000);
    video = rec;
    tr.video.setAttribute("aria-pressed", "true");
    toast(midi.hasOutput ? t("Recording the falling notes. Notes sent to your piano aren't in the sound.") : t("Recording the falling notes and the app's sound. Press again to stop."), 4000);
  }

  // ---- practice plan: sections, hands, then speed ----
  let plan = null;
  function planLabel(s) {
    const where = s.whole ? t("Whole piece") : s.from === s.to ? t("Bar {n}", { n: s.from + 1 }) : t("Bars {a}–{b}", { a: s.from + 1, b: s.to + 1 });
    const who = t(s.hands === "both" ? "both hands" : s.hands === "left" ? "left hand" : "right hand");
    return where + " · " + who + " · " + Math.round(s.speed * 100) + "%";
  }
  function startPlan(at = 0) {
    const key = pieceKey(), song = practice.song;
    if (!key || !song) return;
    const steps = P.plan.make(song);
    if (!steps.length) return;
    plan = { key, steps, at: Math.min(at, steps.length - 1) };
    applyPlanStep();
  }
  function applyPlanStep() {
    const s = plan.steps[plan.at];
    const all = { ...(settings.get("plans") || {}) }; all[plan.key] = plan.at; settings.set("plans", all);
    practice.act.hand("right", s.hands === "left" ? "auto" : "me");
    practice.act.hand("left", s.hands === "right" ? "auto" : "me");
    practice.act.speed(s.speed);
    practice.act.loopMeasures(s.from, s.to);
    statsSoon();
  }
  function planStep(delta) {
    if (!plan) return;
    const next = plan.at + delta;
    if (next >= plan.steps.length) { endPlan(true); return; }
    plan.at = Math.max(0, next);
    applyPlanStep();
  }
  function endPlan(done) {
    if (done && plan) { const all = { ...(settings.get("plans") || {}) }; delete all[plan.key]; settings.set("plans", all); toast(t("Plan done: the whole piece, clean, at full speed.")); }
    plan = null;
    if (practice.song) practice.act.loop(false);
    statsSoon();
  }
  function planSection() {
    const sec = el("section", "plan");
    sec.appendChild(el("h4", null, t("Practice plan")));
    const key = pieceKey();
    if (plan && plan.key === key) {
      const s = plan.steps[plan.at];
      const bar = el("div", "plan-bar"); const fill = el("span"); fill.style.width = Math.round((100 * plan.at) / plan.steps.length) + "%"; bar.appendChild(fill);
      sec.append(el("p", "plan-now", planLabel(s)), bar, el("p", "dim", t("Step {n} of {all}. A clean loop pass moves you on.", { n: plan.at + 1, all: plan.steps.length })));
      const row = el("div", "row");
      row.append(button(t("Back"), "btn", () => planStep(-1)), button(t("Skip"), "btn", () => planStep(1)), button(t("Stop"), "btn", () => endPlan(false)));
      sec.appendChild(row);
    } else {
      const saved = key && (settings.get("plans") || {})[key];
      sec.appendChild(el("p", "dim", t("Learn it in sections: each hand, then both, from 60% up to full speed, then the whole piece.")));
      const row = el("div", "row");
      if (saved) row.appendChild(button(t("Continue at step {n}", { n: saved + 1 }), "btn primary", () => startPlan(saved)));
      row.appendChild(button(saved ? t("Start over") : t("Start the plan"), saved ? "btn" : "btn primary", () => startPlan(0)));
      sec.appendChild(row);
    }
    return sec;
  }

  // ---- takes: what you played, to hear again and to see ----
  let take = null, lastTake = null, stopReplay = null;
  function takeStart() { take = { rec: P.takes.recorder(), hits: [], from: practice.engine.time, speed: practice.engine.speed, mode: practice.engine.mode }; }
  function takeEnd() {
    if (!take) return;
    const notes = take.rec.done(practice.engine.time);
    if (notes.length) lastTake = { notes, hits: take.hits, from: take.from, speed: take.speed, mode: take.mode, song: practice.song,
      dynamics: P.takes.dynamics(take.hits, practice.song) };
    take = null;
    statsSoon();
  }
  function takeNote(m, on, vel) {
    if (!take || !practice.engine.playing) return;
    if (on) take.rec.on(m, practice.engine.time, vel); else take.rec.off(m, practice.engine.time);
  }
  function replay(withMusic) {
    if (stopReplay) { stopReplay(); return; }
    if (!lastTake || lastTake.song !== practice.song) return;
    if (practice.engine.playing) practice.act.toggle(performance.now());
    synth.unlock();
    stopReplay = P.takes.play({
      take: lastTake, song: practice.song, from: lastTake.from, withMusic,
      sound: (m, on, vel, mine) => { if (mine) { if (on) synth.noteOn(m, vel); else synth.noteOff(m); } else if (!midi.send(m, on, vel)) { if (on) synth.noteOn(m, vel); else synth.noteOff(m); } },
      onTime: (ms) => practice.act.seek(ms),
      onEnd: () => { stopReplay = null; statsSoon(); },
    });
    statsSoon();
  }
  // Early and late per note, as dots around a centre line.
  function timingGraph(tk) {
    const hits = tk.hits.filter((h) => h.mode === "flow");
    const wrap = el("div", "timing");
    if (hits.length < 3) { wrap.appendChild(el("p", "dim", t("The timing graph needs a run in flow mode."))); return wrap; }
    const c = document.createElement("canvas");
    c.setAttribute("aria-label", t("Timing of each note: above the line is late, below is early"));
    wrap.appendChild(c);
    requestAnimationFrame(() => {
      const w = Math.max(200, wrap.clientWidth), h = 96, dpr = Math.min(2, window.devicePixelRatio || 1);
      c.width = w * dpr; c.height = h * dpr; c.style.width = w + "px"; c.style.height = h + "px";
      const g = c.getContext("2d"); g.scale(dpr, dpr);
      const css = getComputedStyle(document.documentElement), v = (n) => css.getPropertyValue(n).trim();
      const lim = 250, first = hits[0].ms, last = Math.max(first + 1, hits[hits.length - 1].ms);
      g.fillStyle = v("--line-soft"); g.fillRect(0, h / 2, w, 1);
      g.fillStyle = v("--text-dim"); g.font = "11px system-ui, sans-serif"; g.fillText(t("late"), 4, 12); g.fillText(t("early"), 4, h - 4);
      for (const hi of hits) {
        const x = 34 + ((hi.ms - first) / (last - first)) * (w - 42);
        const off = Math.max(-lim, Math.min(lim, hi.offset));
        const y = h / 2 - (off / lim) * (h / 2 - 8);
        g.fillStyle = Math.abs(hi.offset) <= 60 ? v("--good") : Math.abs(hi.offset) <= 150 ? v("--late") : v("--bad");
        g.beginPath(); g.arc(x, y, 3, 0, Math.PI * 2); g.fill();
      }
    });
    const ahead = hits.filter((x) => x.offset < -60).length, behind = hits.filter((x) => x.offset > 60).length;
    const lean = ahead > behind * 1.5 && ahead > 2 ? t("You tend to rush.") : behind > ahead * 1.5 && behind > 2 ? t("You tend to drag.") : t("No lean either way.");
    wrap.appendChild(el("p", "dim", lean));
    return wrap;
  }
  function takeSection() {
    const tk = lastTake;
    if (!tk || tk.song !== practice.song) return null;
    const sec = el("section");
    sec.appendChild(el("h4", null, t("Your last take")));
    const row = el("div", "row");
    const a = button(stopReplay ? t("Stop") : t("Hear it with the music"), "btn", () => replay(true)); a.prepend(icon(stopReplay ? "square" : "play"));
    row.appendChild(a);
    if (!stopReplay) row.appendChild(button(t("Just me"), "btn", () => replay(false)));
    sec.appendChild(row);
    sec.appendChild(timingGraph(tk));
    const d = tk.dynamics;
    if (d) {
      const bars = (list) => list.slice(0, 4).map((m) => m + 1).join(", ");
      const parts = [t("Loud and soft: {n}% right.", { n: d.accuracy })];
      if (d.flat) parts.push(t("It's all at one level; let the p and f marks show."));
      else {
        if (d.loud.length) parts.push(t("Too loud in bars {list}.", { list: bars(d.loud) }));
        if (d.soft.length) parts.push(t("Too soft in bars {list}.", { list: bars(d.soft) }));
      }
      sec.appendChild(el("p", null, parts.join(" ")));
    }
    return sec;
  }

  // ---- chord names, in free play ----
  const freeHeld = new Set();
  function chordNote(m, on) {
    if (!practice || practice.song) { freeHeld.clear(); return; }
    if (on) freeHeld.add(m); else freeHeld.delete(m);
    const c = P.chords.name([...freeHeld]);
    const box = $("chord");
    if (!box) return;
    if (c) { box.replaceChildren(el("strong", null, c.name), el("span", "dim", c.long + (c.inversion !== "root position" ? ", " + t(c.inversion) : ""))); box.hidden = false; }
    else if (!freeHeld.size) box.hidden = true;
  }

  // ---- pieces to review ----
  function reviewCard() {
    const due = progress.dueForReview(today()).filter((r) => openable(r.key));
    if (!due.length) return null;
    const c = el("section", "course");
    const head = el("div", "course-head");
    head.appendChild(el("h3", null, t("Time to review")));
    c.append(head, el("p", "course-note", t("Pieces you've learned come back after 1, 3, 7, 14, 30 and 60 days. A good run sends one further out.")));
    const list = el("ul", "items");
    for (const r of due.slice(0, 6)) {
      const li = document.createElement("li");
      const b = button("", null, () => openKey(r.key));
      b.append(icon("repeat"), el("span", null, r.title), el("span", "meta", r.due < today() ? t("overdue") : t("today")));
      li.appendChild(b); list.appendChild(li);
    }
    c.appendChild(list);
    return c;
  }
  function openable(key) { const [course] = key.split("|"); return courses.some((c) => c.id === course); }
  async function openKey(key) {
    const i = key.indexOf("|"), course = key.slice(0, i), rest = key.slice(i + 1);
    const m = /^(.*)#(\d+)$/.exec(rest);
    if (m) { await openLesson(course, m[1]); if (+m[2] > 0) await activate({ block: +m[2] }); }
    else await openPiece(course, rest);
  }

  // ---- today's routine: a warm-up scale, a drill, then your piece ----
  const FIFTHS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"];
  let routine = null, routineTimer = 0, drillOverride = null;
  function drillSettings() { return drillOverride || settings.get("drill"); }
  function routinePlan() {
    const goal = settings.get("goal") || 15;
    const now = new Date();
    const day = Math.floor(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) / 86400000);
    const key = FIFTHS[((day % 12) + 12) % 12];
    const last = settings.get("last");
    const piece = last && courses.some((c) => c.id === last.course) ? last : null;
    const split = piece ? [0.2, 0.3, 0.5] : [0.4, 0.6];
    const steps = [
      { name: t("Warm-up: {key} scale", { key: keyLabel(key) }), drill: { ...settings.get("drill"), type: "scale", key, hand: "both", octaves: 1, tempo: 80, next: false } },
      { name: t("Sight-reading in {key}", { key: keyLabel(key) }), drill: { ...settings.get("drill"), type: "reading", key, next: true } },
    ];
    if (piece) steps.push({ name: piece.title || piece.path, piece });
    steps.forEach((s, i) => { s.minutes = Math.max(1, Math.round(goal * split[i])); });
    return { key, steps };
  }
  function routineCard() {
    const plan = routinePlan();
    const c = el("section", "course");
    const head = el("div", "course-head");
    head.append(el("h3", null, t("Today's practice")), button(t("Start"), "btn primary", () => startRoutine()));
    c.append(head, el("p", "course-note", plan.steps.map((s) => s.name + " (" + t("{n} min", { n: s.minutes }) + ")").join(" · ")));
    return c;
  }
  function startRoutine() { routine = { ...routinePlan(), at: -1 }; nextRoutineStep(); }
  async function nextRoutineStep() {
    if (!routine) return;
    routine.at++;
    const s = routine.steps[routine.at];
    if (!s) { endRoutine(true); return; }
    routine.since = Date.now(); routine.told = false;
    drillOverride = s.drill ? { ...s.drill } : null;
    if (s.drill) await openDrills();
    else await openLesson(s.piece.course, s.piece.path);
    renderRoutine();
    clearInterval(routineTimer);
    routineTimer = setInterval(renderRoutine, 1000);
  }
  function endRoutine(done) {
    routine = null; drillOverride = null;
    clearInterval(routineTimer); routineTimer = 0;
    renderRoutine();
    if (done) toast(t("That's today's practice done."));
  }
  function renderRoutine() {
    const bar = $("routine");
    if (!routine || $("lesson-screen").hidden) { bar.hidden = true; return; }
    const s = routine.steps[routine.at];
    const left = s.minutes * 60 - Math.floor((Date.now() - routine.since) / 1000);
    const last = routine.at === routine.steps.length - 1;
    if (left <= 0 && !routine.told) { routine.told = true; toast(last ? t("Time's up. Finish when you're ready.") : t("Time for the next step.")); }
    const clock = left > 0 ? t("{m}:{s} left", { m: Math.floor(left / 60), s: String(left % 60).padStart(2, "0") }) : t("Time's up");
    const text = el("span", "grow");
    text.append(el("strong", null, t("Today, {n} of {all}", { n: routine.at + 1, all: routine.steps.length }) + " · "), document.createTextNode(s.name));
    const next = button(last ? t("Finish") : t("Next step"), "btn" + (left <= 0 ? " primary" : ""), () => (last ? endRoutine(true) : nextRoutineStep()));
    bar.replaceChildren(icon("target"), text, el("span", "dim", clock), next, iconButton("x", t("Stop today's practice"), () => endRoutine(false)));
    bar.hidden = false;
  }

  // ---- drills: sight-reading, scales, chords, rhythm, ear ----
  const DRILL_TYPES = [["reading", "Sight-reading"], ["scale", "Scales"], ["chords", "Chords"], ["rhythm", "Rhythm"], ["ear", "By ear"]];
  let ear = null;
  function drillCard() {
    const c = el("section", "course");
    const head = el("div", "course-head");
    head.append(el("h3", null, t("Drills")), button(t("Start"), "btn primary", () => openDrills()));
    c.append(head, el("p", "course-note", t("Sight-reading, scales and chords in every key, rhythm and playing by ear. New music every time.")));
    return c;
  }
  async function openDrills() {
    lessonState = { course: null, path: null, meta: {}, blocks: [], pieces: [], active: null, drill: true };
    dropBook();
    showLessonScreen(t("Drills"));
    renderDrillForm();
    await newDrill();
  }
  function drillType() { return drillSettings().type || "reading"; }
  const keyLabel = (k) => (k === "any" ? t("Any key") : /m$/.test(k) ? k.slice(0, -1).replace("b", "♭") + " " + t("minor") : k.replace("b", "♭") + " " + t("major"));
  function renderDrillForm() {
    const d = { ...drillSettings() };
    const type = d.type || "reading";
    // In today's routine the changes last for this step only.
    const setD = (k, v) => { d[k] = v; if (drillOverride) drillOverride = { ...d }; else settings.set("drill", { ...d }); };
    const form = el("div", "drill-form");
    const pickSeg = (k, options, redraw) => { const box = seg(options, (v) => { setD(k, v); setSeg(box, v); if (redraw) renderDrillForm(); newDrill(); }); setSeg(box, String(d[k] != null ? d[k] : options[0][0])); return box; };
    const keySel = document.createElement("select");
    keySel.setAttribute("aria-label", t("Key"));
    const keys = type === "reading" ? P.abcwrite.KEYS : type === "rhythm" ? [] : ["any", ...P.abcwrite.KEYS, ...P.abcwrite.MINORS];
    for (const k of keys) keySel.appendChild(new Option(keyLabel(k), k));
    keySel.value = keys.includes(d.key) ? d.key : keys[0] || "C";
    keySel.addEventListener("change", () => { setD("key", keySel.value); newDrill(); });
    const next = el("label", "check");
    const nextBox = document.createElement("input"); nextBox.type = "checkbox"; nextBox.checked = !!d.next;
    nextBox.addEventListener("change", () => setD("next", nextBox.checked));
    next.append(nextBox, el("span", null, t("A new one when you finish")));
    const hands = field(t("Hands"), pickSeg("hand", [["right", t("Right")], ["left", t("Left")], ["both", t("Both")]]));
    const tempo = field(t("Tempo"), range(40, 160, 5, d.tempo, (v) => setD("tempo", v), (v) => t("{n} bpm", { n: v })));
    const intro = {
      reading: t("Read it once, then play it without stopping to fix notes. Wait mode lets you take your time; flow mode keeps the beat."),
      scale: t("Up and back down, with the usual fingering where the key has one. Minor scales are harmonic minor."),
      chords: t("I, IV, V and I again, the right hand moving as little as it can over the roots in the left."),
      rhythm: t("Just the rhythm: any key on the piano plays the note. The metronome keeps the beat, and timing counts."),
      ear: t("The app plays the key's chord, then a short tune starting on the key's note. Play it back."),
    }[type];
    form.append(el("h1", null, t("Drills")), field(t("Drill"), pickSeg("type", DRILL_TYPES.map(([v, l]) => [v, t(l)]), true)), el("p", "dim", intro));
    if (type === "reading") form.append(hands, field(t("Notes"), pickSeg("range", [["five", t("Five")], ["octave", t("An octave")], ["two", t("Two octaves")]])), field(t("Key"), keySel),
      field(t("Rhythm"), pickSeg("rhythm", [["quarters", t("Steady")], ["mixed", t("Mixed")]])), field(t("Bars"), pickSeg("bars", [["4", "4"], ["8", "8"]])), tempo, next);
    else if (type === "scale") form.append(hands, field(t("Octaves"), pickSeg("octaves", [["1", "1"], ["2", "2"]])), field(t("Key"), keySel), tempo, next);
    else if (type === "chords") form.append(hands, field(t("Key"), keySel), tempo, next);
    else if (type === "rhythm") form.append(field(t("Rhythm"), pickSeg("rhythm", [["quarters", t("Steady")], ["mixed", t("Mixed")]])), field(t("Bars"), pickSeg("bars", [["4", "4"], ["8", "8"]])), tempo, next);
    else if (type === "ear") {
      form.append(field(t("Key"), keySel), field(t("Notes"), pickSeg("count", [["3", "3"], ["4", "4"], ["5", "5"], ["6", "6"]])), field(t("Range"), pickSeg("earRange", [["five", t("Five notes")], ["octave", t("An octave")]])));
      const box = el("div", "ear-box"); box.id = "ear-box";
      form.appendChild(box);
    }
    const go = button(t(type === "ear" ? "New tune" : "New drill"), "btn primary", () => newDrill());
    go.prepend(icon("refresh"));
    form.appendChild(go);
    mounts.lesson.replaceChildren(form);
    if (type === "ear") renderEar();
  }
  function pickKey(k, list) { return k === "any" || !list.includes(k) ? list[Math.floor(Math.random() * list.length)] : k; }
  async function newDrill() {
    const d = drillSettings();
    const type = d.type || "reading";
    const seed = (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0;
    const W = P.abcwrite;
    ear = null;
    if (type === "ear") return newEar();
    const handName = t(d.hand === "both" ? "both hands" : d.hand === "left" ? "left hand" : "right hand");
    let text, label, opts = { hands: d.hand === "both" ? "both" : d.hand, tempo: d.tempo }, id;
    if (type === "scale" || type === "chords") {
      const key = pickKey(d.key, [...W.KEYS, ...W.MINORS]);
      text = type === "scale" ? W.scaleExercise({ key, hand: d.hand, octaves: +d.octaves || 1, tempo: d.tempo }) : W.chordExercise({ key, hand: d.hand, tempo: d.tempo });
      label = t(type === "scale" ? "Scale" : "Chords") + " · " + keyLabel(key) + ", " + handName;
      id = [type, key, d.hand, type === "scale" ? +d.octaves || 1 : ""].join("|");
    } else if (type === "rhythm") {
      text = W.rhythmExercise({ rhythm: d.rhythm, bars: +d.bars || 4, tempo: d.tempo, seed });
      label = t("Rhythm") + " · " + t(d.rhythm === "mixed" ? "mixed" : "steady");
      opts = { hands: "right", tempo: d.tempo, mode: "flow", metronome: true };
      id = ["rhythm", d.rhythm].join("|");
    } else {
      const key = W.KEYS.includes(d.key) ? d.key : "C";
      text = W.drill({ ...d, key, bars: +d.bars || 4, seed });
      label = t("Sight-reading") + " · " + key.replace("b", "♭") + ", " + t(d.range === "five" ? "five notes" : d.range === "octave" ? "an octave" : "two octaves") + ", " + handName;
      id = [key, d.range, d.hand, d.rhythm].join("|");
    }
    passes = [];
    try {
      await practice.load({ kind: "abc", data: text, title: label, opts, source: { drill: id, label } });
      renderStats();
    } catch (e) { toast(t("Couldn't make a drill: {why}", { why: e.message || String(e) })); }
  }

  // By ear: the app plays, you play it back, then the music shows.
  async function newEar() {
    const d = drillSettings();
    const key = pickKey(d.key, [...P.abcwrite.KEYS, ...P.abcwrite.MINORS]);
    const phrase = P.abcwrite.earPhrase({ key, count: +d.count || 4, range: d.earRange || "five", seed: (Date.now() ^ Math.floor(Math.random() * 1e9)) >>> 0 });
    ear = { ...phrase, key, played: [], phase: "listen", tries: 0 };
    await practice.load({ kind: "free", message: t("Listen, then play it back. The music shows once you've played it.") });
    renderEar();
    playEar();
  }
  function sound(m, on, vel = 80) { if (!midi.send(m, on, vel)) { if (on) synth.noteOn(m, vel); else synth.noteOff(m); } }
  function playEar() {
    if (!ear) return;
    synth.unlock();
    const mine = ear;
    mine.phase = "listen"; mine.played = []; renderEar();
    const q = mine.tonic;
    const third = /m$/.test(mine.key) ? 3 : 4;
    const triad = [q - 12, q, q + third, q + 7];
    const at = (ms, fn) => setTimeout(() => { if (ear === mine) fn(); }, ms);
    for (const m of triad) { at(0, () => sound(m, true, 60)); at(900, () => sound(m, false)); }
    mine.midis.forEach((m, i) => { at(1400 + i * 650, () => sound(m, true)); at(1400 + i * 650 + 560, () => sound(m, false)); });
    at(1400 + mine.midis.length * 650, () => { mine.phase = "answer"; renderEar(); });
  }
  function earNote(m) {
    if (!ear || ear.phase !== "answer" || !(lessonState && lessonState.drill)) return;
    ear.played.push(m);
    if (ear.played.length >= ear.midis.length) {
      ear.tries++;
      ear.phase = ear.played.every((x, i) => x === ear.midis[i]) ? "right" : "wrong";
      if (ear.phase === "right") revealEar();
    }
    renderEar();
  }
  async function revealEar() {
    if (!ear) return;
    const keep = ear;
    if (ear.phase !== "right") ear.phase = "shown";
    await practice.load({ kind: "abc", data: keep.abc, title: t("By ear"), opts: { hands: "right" } });
    ear = keep;
    renderEar();
  }
  function renderEar() {
    const box = document.getElementById("ear-box");
    if (!box || !ear) { if (box) box.replaceChildren(); return; }
    const name = (m) => P.music.name(m);
    const parts = [];
    const msg = {
      listen: t("Listen…"),
      answer: t("Your turn: {n} notes, starting on {first}.", { n: ear.midis.length, first: name(ear.midis[0]) }),
      right: ear.tries === 1 ? t("Right first time.") : t("Right, in {n} tries.", { n: ear.tries }),
      wrong: t("Not quite. You played {notes}.", { notes: ear.played.map(name).join(" ") }),
      shown: t("Here it is: {notes}.", { notes: ear.midis.map(name).join(" ") }),
    }[ear.phase];
    parts.push(el("p", "ear-msg" + (ear.phase === "right" ? " good" : ear.phase === "wrong" ? " bad" : ""), msg));
    if (ear.phase === "answer" && ear.played.length) parts.push(el("p", "dim", ear.played.map(name).join(" ")));
    const row = el("div", "row");
    const again = button(t("Hear it again"), "btn", () => playEar());
    again.prepend(icon("play"));
    row.appendChild(again);
    if (ear.phase === "wrong" || ear.phase === "answer") row.appendChild(button(t("Show me"), "btn", () => revealEar()));
    parts.push(row);
    box.replaceChildren(...parts);
  }

  // ---- shortcuts, in Settings ----
  function shortcutsSection() {
    const sec = section(t("Shortcuts"));
    sec.classList.add("shortcuts");
    sec.appendChild(el("p", "dim", t("Click a key to change it, then press the new one (Esc clears it). A piano key you never play, like the lowest A, can be a shortcut too.")));
    const grid = el("div", "keys-table");
    grid.append(el("span", "dim", t("Action")), el("span", "dim", t("Key")), el("span", "dim", t("Piano key")));
    for (const [action, label] of P.hotkeys.ACTIONS) {
      const keyBtn = button(P.hotkeys.label(hot.keys[action]), "btn", () => {
        keyBtn.textContent = t("Press a key…"); keyBtn.classList.add("listening");
        captureKey = (k) => { captureKey = null; settings.set("keys", hot.bind(action, k || "")); renderSettings(); };
      });
      const n = hot.noteFor(action);
      const noteBtn = button(n == null ? "—" : P.music.name(n), "btn", () => {
        noteBtn.textContent = t("Play a key…"); noteBtn.classList.add("listening");
        captureNote = (m) => { captureNote = null; settings.set("pianoKeys", hot.bindNote(action, hot.noteFor(action) === m ? null : m)); renderSettings(); };
      });
      noteBtn.title = t("Play the same key again to clear it");
      grid.append(el("span", null, t(label)), keyBtn, noteBtn);
    }
    sec.appendChild(grid);
    sec.appendChild(button(t("Back to the usual shortcuts"), "btn", () => { hot.reset(); settings.set("keys", {}); settings.set("pianoKeys", {}); renderSettings(); }));
    return sec;
  }
  $("settings").addEventListener("close", () => { captureKey = null; captureNote = null; });

  // ---- the colour editor: a panel beside the app, so the change shows live ----
  let themeDlg = null;
  function themeOpen() { return !!(themeDlg && themeDlg.open); }
  function openThemeEditor() {
    if (!themeDlg) {
      themeDlg = document.createElement("dialog");
      themeDlg.className = "sheet side";
      themeDlg.setAttribute("aria-label", t("Colours"));
      document.body.appendChild(themeDlg);
      themeDlg.addEventListener("close", () => { if (lessonState && lessonState.active && practice && !practice.engine.playing) activate(lessonState.active); });
    }
    renderThemeEditor();
    themeDlg.show();
  }
  function renderThemeEditor() {
    const root = document.documentElement;
    const mode = root.dataset.theme;
    const colors = JSON.parse(JSON.stringify(settings.get("colors") || { light: {}, dark: {} }));
    colors[mode] = colors[mode] || {};
    const save = () => { settings.set("colors", colors); applyTheme(); warnings(); };
    const head = el("div", "sheet-head");
    head.append(el("h2", null, t(mode === "dark" ? "Dark colours" : "Light colours")), iconButton("x", t("Close"), () => themeDlg.close()));
    const body = el("div", "sheet-body");
    body.appendChild(el("p", "dim", t("Changes show as you make them. The other theme keeps its own colours: switch it in Settings → Look.")));
    const warn = el("div", "warn");
    const warnings = () => {
      const bad = P.theme.problems((k) => P.theme.read(k, root));
      warn.replaceChildren(...bad.map((b) => el("div", null, t("{fg} on {bg} is hard to read ({r}:1, needs 4.5)", { fg: tokenName(b.fg), bg: tokenName(b.bg), r: b.ratio }))));
    };
    body.appendChild(warn);
    for (const [group, list] of P.theme.TOKENS) {
      const sec = section(t(group));
      const grid = el("div", "swatches");
      for (const [token, label] of list) {
        const input = document.createElement("input");
        input.type = "color"; input.value = P.theme.read(token, root);
        input.setAttribute("aria-label", t(label));
        input.addEventListener("input", () => { colors[mode][token] = input.value; save(); });
        grid.append(el("span", null, t(label)), input);
      }
      sec.appendChild(grid);
      body.appendChild(sec);
    }
    const share = section(t("Share"));
    const area = document.createElement("textarea");
    area.className = "json"; area.spellcheck = false;
    area.value = JSON.stringify(colors, null, 1);
    area.setAttribute("aria-label", t("Colours as JSON"));
    const row = el("div", "row");
    row.append(
      button(t("Use pasted colours"), "btn", () => {
        const parsed = P.theme.parse(area.value);
        if (!parsed) { toast(t("Those aren't colours this app knows.")); return; }
        settings.set("colors", parsed); applyTheme(); renderThemeEditor();
      }),
      button(t("Reset these colours"), "btn", () => { colors[mode] = {}; settings.set("colors", colors); applyTheme(); renderThemeEditor(); }),
    );
    share.append(el("p", "dim", t("Copy this to keep or share your colours; paste one in to use it.")), area, row);
    body.appendChild(share);
    themeDlg.replaceChildren(head, body);
    warnings();
  }
  function tokenName(k) { for (const [, list] of P.theme.TOKENS) for (const [tok, label] of list) if (tok === k) return t(label); return k; }

  // ---- small DOM helpers ----
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function button(text, cls, onClick) { const b = el("button", cls, text); b.type = "button"; if (onClick) b.addEventListener("click", onClick); return b; }

  // ---- start ----
  async function start() {
    applyTheme();
    $("back").appendChild(icon("arrow-left"));
    $("back").title = t("Library"); $("back").setAttribute("aria-label", t("Library"));
    $("back").addEventListener("click", showLibrary);
    layoutBtn.appendChild(icon("layout"));
    layoutBtn.title = t("Move and hide panels"); layoutBtn.setAttribute("aria-label", layoutBtn.title);
    layoutBtn.setAttribute("aria-pressed", "false");
    layoutBtn.addEventListener("click", () => toggleLayoutEditor());
    $("settings-btn").before(layoutBtn);
    editBtn.appendChild(icon("pencil"));
    editBtn.title = t("Edit this lesson"); editBtn.setAttribute("aria-label", editBtn.title);
    editBtn.setAttribute("aria-pressed", "false");
    editBtn.addEventListener("click", () => toggleEditor());
    layoutBtn.before(editBtn);
    $("settings-btn").appendChild(icon("sliders"));
    $("settings-btn").title = t("Settings"); $("settings-btn").setAttribute("aria-label", t("Settings"));
    const openSettings = () => { renderSettings(); $("settings").showModal(); };
    $("settings-btn").addEventListener("click", openSettings);
    $("device").addEventListener("click", openSettings);
    renderDevice();
    buildPanels();
    await i18n.ready;
    i18n.apply();
    await midi.start();
    if (settings.get("output")) midi.setOutput(settings.get("output"));
    renderDevice();
    await showLibrary();
  }

  // The web copy works offline through sw.js; the desktop app has its
  // files with it and no service worker.
  if ("serviceWorker" in navigator && location.protocol === "https:" && !K.platform.bundled) {
    navigator.serviceWorker.register("sw.js").catch((e) => K.errlog.note("sw", String(e)));
  }

  const motion = K.motion.create();
  window.PianoApp = { version: APP_VERSION, i18n, settings, get practice() { return practice; }, library, openLesson, openPiece, openFree, showLibrary, motion, toast,
    progress, hotkeys: hot, recorder, get editor() { return editor; }, toggleEditor, openDrills, newDrill, toggleVideo, routeNote, runAction, toggleLayoutEditor, openThemeEditor, openBook, get pdf() { return pdf; },
    synth, startRoutine, get routine() { return routine; }, get ear() { return ear; },
    startPlan, get plan() { return plan; }, get lastTake() { return lastTake; }, replay };
  start().catch((e) => { toast(String(e && e.message || e)); K.errlog.note("start", String(e && e.stack || e)); });
})();
