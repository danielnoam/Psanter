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
    lookahead: 3, range: "song", volume: 0.7, autoVolume: 0.8, output: "", layout: null, last: null };
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

  // ---- theme ----
  const dark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;
  function applyTheme() {
    const pick = settings.get("theme");
    document.documentElement.dataset.theme = pick === "dark" || (pick === "system" && dark && dark.matches) ? "dark" : "light";
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
  let practice = null;
  const midi = P.midi.create({
    onNote: (m, on, vel, now, source) => practice && practice.noteIn(m, on, vel, now, source),
    onDevices: () => renderDevice(),
  });
  const typing = P.midi.typing({
    onNote: (m, on, vel, now, source) => practice && practice.noteIn(m, on, vel, now, source),
    enabled: () => settings.get("typing") && !$("settings").open,
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
    head.append(add, open);
    inner.appendChild(head);

    const last = settings.get("last");
    if (last && courses.some((c) => c.id === last.course)) {
      const card = el("div", "continue");
      const text = el("div", "grow");
      text.append(el("div", "dim", t("Continue")), el("strong", null, last.title || last.path));
      card.append(icon("book"), text, button(t("Open lesson"), "btn primary", () => openLesson(last.course, last.path)));
      inner.appendChild(card);
    }

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
  const PANELS = ["lesson", "score", "roll"];
  const DEFAULT_LAYOUT = { dir: "row", sizes: [0.38, 0.62], children: ["lesson", { dir: "col", sizes: [0.52, 0.48], children: ["score", "roll"] }] };
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
    practice = P.practice.create({
      scoreEl: mounts.score, rollCanvas, timelineCanvas, midi, synth, settings,
      onChange: renderTransport,
    });
    practice.roll.setRange(settings.get("range"));
    buildTransport(timelineCanvas);
    mouseKeys(rollCanvas);
    new ResizeObserver(() => practice.resize()).observe($("panels"));
    new ResizeObserver(() => practice.resize()).observe(rollWrap);
  }

  function renderLayout() {
    const saved = settings.get("layout");
    const tree = P.layout.normalize(saved || DEFAULT_LAYOUT, PANELS) || DEFAULT_LAYOUT;
    P.layout.render($("panels"), tree, {
      mount: (id) => mounts[id],
      onChange: (next) => { settings.set("layout", next); renderLayout(); },
    });
    practice.resize();
  }

  function showLessonScreen(title) {
    $("library").hidden = true;
    $("lesson-screen").hidden = false;
    $("back").hidden = false;
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
        const r = await library.read(lessonState.course, pc.path, bytes ? "bytes" : "text");
        pc.modified = r.modified;
        let data = r.data;
        if (kind === "mxl") data = binaryString(r.data);
        target = { kind, data, opts: pc.opts, title: pc.title, message: t("A MIDI file has no sheet music: the falling notes show the piece."), source: { piece: which.piece } };
      }
      lessonState.active = which;
      markActive();
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
    tr.right = seg([["me", t("You")], ["auto", t("App")], ["off", t("Off")]], (v) => practice.act.hand("right", v));
    tr.left = seg([["me", t("You")], ["auto", t("App")], ["off", t("Off")]], (v) => practice.act.hand("left", v));
    tr.metronome = iconButton("timer", t("Metronome"), () => practice.act.metronome(!practice.engine.metronome));
    tr.countIn = button(t("Count-in"), "btn", () => practice.act.countIn(!practice.engine.countIn));
    bar.append(g1, tl, tr.mode, speed, group(null, tr.loop), group(t("Right"), tr.right), group(t("Left"), tr.left), group(null, tr.metronome, tr.countIn));
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
    let status = "";
    if (s.counting) status = t("Counting in");
    else if (s.waiting && s.expected.length) status = t("Play {notes}", { notes: s.expected.map((m) => P.music.name(m)).join(" ") });
    else if (s.song && !s.playing && s.next >= 0 && s.mode === "wait" && s.t === 0) status = t("Play the first note to start");
    $("status").textContent = status;
    if (s.lastResult && s.lastResult !== shownResult) {
      shownResult = s.lastResult;
      const r = s.lastResult;
      if (r.kind === "pass") toast(r.clean ? t("Clean pass {n}", { n: r.pass }) : t("Pass {n}: {acc}% right, {wrong} wrong", { n: r.pass, acc: r.accuracy, wrong: r.wrong }));
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
      down = m; practice.noteIn(m, true, 90, performance.now(), "mouse");
    });
    const up = () => { if (down != null) { practice.noteIn(down, false, 0, performance.now(), "mouse"); down = null; } };
    canvas.addEventListener("pointerup", up);
    canvas.addEventListener("pointercancel", up);
  }

  // ---- shortcuts ----
  window.addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || $("settings").open || $("lesson-screen").hidden) return;
    if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) && e.target.type !== "range") return;
    const k = e.key;
    if (k === " ") { e.preventDefault(); practice.act.toggle(performance.now()); }
    else if (k === "Home") { e.preventDefault(); practice.act.restart(); }
    else if (k === "ArrowLeft") { e.preventDefault(); practice.act.bar(-1); }
    else if (k === "ArrowRight") { e.preventDefault(); practice.act.bar(1); }
    else if (k === "ArrowUp") { e.preventDefault(); practice.act.speed(Math.min(1.5, practice.engine.speed + 0.05)); }
    else if (k === "ArrowDown") { e.preventDefault(); practice.act.speed(Math.max(0.25, practice.engine.speed - 0.05)); }
    else if (k === "Escape") { e.preventDefault(); showLibrary(); }
  });

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
    piano.appendChild(field(t("The hand the app plays sounds on"), out));
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
    body.appendChild(prac);

    const sound = section(t("Sound"));
    sound.appendChild(field(t("Volume"), range(0, 1, 0.05, settings.get("volume"), (v) => { settings.set("volume", v); synth.setVolume(v); }, (v) => Math.round(v * 100) + "%")));
    body.appendChild(sound);

    const looks = section(t("Look"));
    const theme = document.createElement("select");
    theme.append(new Option(t("Same as the system"), "system"), new Option(t("Light"), "light"), new Option(t("Dark"), "dark"));
    theme.value = settings.get("theme");
    theme.addEventListener("change", () => { settings.set("theme", theme.value); applyTheme(); });
    looks.appendChild(field(t("Theme"), theme));
    const reset = button(t("Reset the panel layout"), "btn", () => { settings.set("layout", null); if (!$("lesson-screen").hidden) renderLayout(); toast(t("Layout reset")); });
    looks.appendChild(reset);
    body.appendChild(looks);

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

  // ---- small DOM helpers ----
  function el(tag, cls, text) { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function button(text, cls, onClick) { const b = el("button", cls, text); b.type = "button"; if (onClick) b.addEventListener("click", onClick); return b; }

  // ---- start ----
  async function start() {
    applyTheme();
    $("back").appendChild(icon("arrow-left"));
    $("back").title = t("Library"); $("back").setAttribute("aria-label", t("Library"));
    $("back").addEventListener("click", showLibrary);
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
  window.PianoApp = { version: APP_VERSION, i18n, settings, get practice() { return practice; }, library, openLesson, openPiece, showLibrary, motion, toast };
  start().catch((e) => { toast(String(e && e.message || e)); K.errlog.note("start", String(e && e.stack || e)); });
})();
