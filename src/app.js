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
    keys: {}, pianoKeys: {}, bookPages: {} };
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
  let practice = null;
  const recorder = P.recorder.create();
  const hot = P.hotkeys.create(settings.get("keys"), settings.get("pianoKeys"));
  let captureNote = null, lastNoteAt = -Infinity;

  // Every note you play comes through here: a piano key bound to a
  // shortcut runs it, the rest is recorded and practised.
  function routeNote(m, on, vel, now, source) {
    if (captureNote) { if (on) captureNote(m); return; }
    const action = hot.actionForNote(m);
    if (action) { if (on) runAction(action); return; }
    recorder.note(m, on, vel, now);
    lastNoteAt = now;
    if (practice) practice.noteIn(m, on, vel, now, source);
  }
  function pedal(down) { synth.setPedal(down); recorder.setPedal(down, performance.now()); }

  const midi = P.midi.create({ onNote: routeNote, onDevices: () => renderDevice(), onPedal: pedal });
  const typing = P.midi.typing({
    onNote: routeNote,
    enabled: () => settings.get("typing") && !$("settings").open && !themeOpen(),
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
    stopWatching();
    $("lesson-screen").hidden = true;
    $("library").hidden = false;
    $("back").hidden = true;
    layoutBtn.hidden = true;
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
  const PANELS = ["lesson", "score", "roll", "stats", "book"];
  const PANEL_NAMES = { lesson: "Lesson", score: "Score", roll: "Keys", stats: "Progress", book: "Book" };
  const DEFAULT_LAYOUT = { dir: "row", sizes: [0.36, 0.64], children: [{ dir: "col", sizes: [0.68, 0.32], children: ["lesson", "stats"] }, { dir: "col", sizes: [0.52, 0.48], children: ["score", "roll"] }] };
  const PRESETS = {
    lesson: { name: "Lesson", tree: DEFAULT_LAYOUT },
    play: { name: "Just playing", tree: { dir: "col", sizes: [0.5, 0.5], children: ["score", "roll"] } },
    book: { name: "Book beside", tree: { dir: "row", sizes: [0.42, 0.58], children: ["book", { dir: "col", sizes: [0.5, 0.5], children: ["score", "roll"] }] } },
    keys: { name: "Keys only", tree: { dir: "row", sizes: [0.78, 0.22], children: ["roll", "stats"] } },
  };
  let editingLayout = false;
  let pdf = null;
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
    mounts.roll = rollWrap;
    const timelineCanvas = document.createElement("canvas");
    mounts.stats = el("div", "stats");
    mounts.book = el("div", "book");
    pdf = P.pdfview.create(mounts.book, { t, icon, onPage: (id, page) => { if (!id) return; const b = { ...settings.get("bookPages") }; b[id] = page; settings.set("bookPages", b); } });
    practice = P.practice.create({
      scoreEl: mounts.score, rollCanvas, timelineCanvas, midi, synth, settings,
      onChange: (s) => { renderTransport(s); statsSoon(); },
      onEvent,
    });
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
    if (meta.book) openBook(meta.book, false);
    const first = lessonState.blocks.length ? { block: 0 } : lessonState.pieces.length ? { piece: 0 } : null;
    if (first) await activate(first);
    else { await practice.load({ kind: "none", message: t("This lesson has no music to practise.") }).catch(() => {}); }
    watch();
  }

  async function openPiece(course, path) {
    lessonState = { course, path: null, piecePath: path, meta: {}, blocks: [], pieces: [{ path, opts: {}, title: path.split("/").pop() }], active: null };
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
        target = { kind, data, opts: pc.opts, title: pc.title, message: t("A MIDI file has no sheet music: the falling notes show the piece."), source: { piece: which.piece } };
      }
      lessonState.active = which;
      markActive();
      passes = [];
      await practice.load(target);
      const s = practice.state();
      $("status").textContent = "";
      if (s.song) $("status").textContent = t("{n} bars", { n: s.song.measures });
    } catch (e) {
      toast(t("Couldn't load that music: {why}", { why: e.message || String(e) }));
      K.errlog && K.errlog.note && K.errlog.note("load", String(e && e.stack || e));
    }
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
      if (s.path) {
        const m = await library.modified(s.course, s.path);
        if (m && m !== s.modified) {
          const r = await library.read(s.course, s.path);
          const before = s.active && s.active.block != null ? s.blocks[s.active.block] && s.blocks[s.active.block].text : null;
          s.modified = r.modified; s.text = r.data;
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
    tr.right = seg([["me", t("You")], ["auto", t("App")], ["off", t("Off")]], (v) => practice.act.hand("right", v));
    tr.left = seg([["me", t("You")], ["auto", t("App")], ["off", t("Off")]], (v) => practice.act.hand("left", v));
    tr.metronome = iconButton("timer", t("Metronome"), () => practice.act.metronome(!practice.engine.metronome));
    tr.countIn = button(t("Count-in"), "btn", () => practice.act.countIn(!practice.engine.countIn));
    bar.append(g1, tl, tr.mode, speed, group(null, tr.loop, tr.autoSpeed), group(t("Right"), tr.right), group(t("Left"), tr.left),
      group(t("Key"), tr.keyDown, tr.keyValue, tr.keyUp), group(null, tr.metronome, tr.countIn), group(null, tr.record, tr.recTime));
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
  function renderSettings() {
    const dlg = $("settings");
    const head = el("div", "sheet-head");
    const h = el("h2", null, t("Settings")); h.id = "settings-title";
    head.append(h, iconButton("x", t("Close"), () => dlg.close()));
    const body = el("div", "sheet-body");

    const d = midi.devices();
    const piano = section(t("Piano"));
    const status = d.status === "unsupported" ? t("This browser has no MIDI. The desktop app, Chrome and Edge do.")
      : d.status === "denied" ? t("MIDI access was blocked. Allow it for this app and reopen it.")
        : d.inputs.length ? t("Listening to: {names}", { names: d.inputs.map((i) => i.name).join(", ") }) : t("No piano found. Connect it by USB; it shows up here by itself.");
    piano.appendChild(el("p", "dim", status));
    const out = document.createElement("select");
    out.appendChild(new Option(t("The app's own sound"), ""));
    for (const o of d.outputs) out.appendChild(new Option(o.name, o.id));
    out.value = settings.get("output") || "";
    out.addEventListener("change", () => { settings.set("output", out.value); midi.setOutput(out.value); });
    piano.appendChild(field(t("Where the app's own notes play"), out));
    piano.appendChild(check(t("Also play my notes in the app (for a keyboard with no speakers)"), "echo"));
    piano.appendChild(check(t("Use the computer's keyboard as a piano (A is middle C)"), "typing"));
    body.appendChild(piano);

    const prac = section(t("Practice"));
    const look = range(1, 8, 0.5, settings.get("lookahead"), (v) => { settings.set("lookahead", v); practice && practice.draw(); }, (v) => t("{n} s", { n: v }));
    prac.appendChild(field(t("How far ahead the falling notes show"), look));
    const rng = document.createElement("select");
    rng.append(new Option(t("Just the notes in the piece"), "song"), new Option(t("All 88 keys"), "full"));
    rng.value = settings.get("range");
    rng.addEventListener("change", () => { settings.set("range", rng.value); practice && practice.roll.setRange(rng.value); practice && practice.draw(); });
    prac.appendChild(field(t("Keyboard"), rng));
    const names = document.createElement("select");
    names.append(new Option(t("No names"), "off"), new Option(t("Letters (C D E)"), "letters"), new Option(t("Solfège (Do Re Mi)"), "solfege"));
    names.value = settings.get("noteNames");
    names.addEventListener("change", () => { settings.set("noteNames", names.value); applyLabels(); });
    prac.appendChild(field(t("Note names on the falling notes"), names));
    const fing = check(t("Finger numbers on the falling notes, where the music has them"), "fingers");
    fing.querySelector("input").addEventListener("change", applyLabels);
    prac.appendChild(fing);
    prac.appendChild(field(t("Auto speed-up stops at"), range(50, 150, 5, settings.get("autoSpeedGoal"), (v) => settings.set("autoSpeedGoal", v), (v) => v + "%")));
    body.appendChild(prac);

    const sound = section(t("Sound"));
    sound.appendChild(field(t("Volume"), range(0, 1, 0.05, settings.get("volume"), (v) => { settings.set("volume", v); synth.setVolume(v); }, (v) => Math.round(v * 100) + "%")));
    sound.appendChild(field(t("Room"), range(0, 0.5, 0.02, settings.get("room"), (v) => { settings.set("room", v); synth.setRoom(v); }, (v) => Math.round(v * 200) + "%")));
    body.appendChild(sound);
    body.appendChild(shortcutsSection());

    const looks = section(t("Look"));
    const theme = document.createElement("select");
    theme.append(new Option(t("Same as the system"), "system"), new Option(t("Light"), "light"), new Option(t("Dark"), "dark"));
    theme.value = settings.get("theme");
    theme.addEventListener("change", () => { settings.set("theme", theme.value); applyTheme(); });
    looks.appendChild(field(t("Theme"), theme));
    const editColours = button(t("Edit colours"), "btn", () => { dlg.close(); openThemeEditor(); });
    editColours.prepend(icon("palette"));
    const reset = button(t("Reset the panel layout"), "btn", () => { settings.set("layout", null); if (!$("lesson-screen").hidden) renderLayout(); toast(t("Layout reset")); });
    const looksRow = el("div", "row"); looksRow.append(editColours, reset);
    looks.appendChild(looksRow);
    if (!$("lesson-screen").hidden) looks.appendChild(el("p", "dim", t("To move panels, use the layout button at the top.")));
    body.appendChild(looks);

    const data = section(t("Your progress"));
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
    const dataRow = el("div", "row"); dataRow.append(exp, imp);
    data.append(el("p", "dim", t("Kept on this computer only. A copy moves it to another one.")), dataRow);
    body.appendChild(data);

    body.appendChild(el("p", "dim", t("Version {v}", { v: APP_VERSION })));
    dlg.replaceChildren(head, body);
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
    if (!s || !tg || !tg.source || !s.course) return null;
    if (tg.source.piece != null) { const pc = s.pieces[tg.source.piece]; return pc && !pc.data ? s.course + "|" + pc.path : null; }
    return s.course + "|" + s.path + "#" + tg.source.block;
  }
  function pieceTitle() {
    const tg = practice && practice.target;
    if (!tg) return "";
    if (tg.source && tg.source.block != null) return (tg.title || t("Exercise {n}", { n: tg.source.block + 1 })) + " · " + ($("title").textContent || "");
    return tg.title || "";
  }

  function onEvent(e) {
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
    const streak = progress.streak(d);
    sec.appendChild(el("p", "dim", t("Today {time}", { time: minutes(progress.today(d)) }) + (streak > 1 ? " · " + t("{n} days in a row", { n: streak }) : "")));
    return sec;
  }
  function daysCard() { const c = el("div", "continue stats"); c.appendChild(daysSection()); return c; }

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
      }
      const page = b.page || (settings.get("bookPages") || {})[id] || 1;
      if (pdf.key === id) { pdf.go(page); return; }
      const r = await library.read(lessonState.course, path, "bytes");
      await pdf.open(r.data, page, id, b.file.split("/").pop());
    } catch (e) {
      toast(t("Couldn't open the book: {why}", { why: e.message || String(e) }));
    }
  }

  // ---- free play and recording ----
  async function openFree() {
    lessonState = { course: null, path: null, meta: {}, blocks: [], pieces: [], active: null, free: true };
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

  // ---- shortcuts, in Settings ----
  function shortcutsSection() {
    const sec = section(t("Shortcuts"));
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
    progress, hotkeys: hot, recorder, routeNote, runAction, toggleLayoutEditor, openThemeEditor, openBook, get pdf() { return pdf; } };
  start().catch((e) => { toast(String(e && e.message || e)); K.errlog.note("start", String(e && e.stack || e)); });
})();
