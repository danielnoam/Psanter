// The lesson editor: the Markdown on one side, the lesson itself as the
// live preview (app.js re-renders it as you type), and notes you play on
// the piano written into the music where the cursor is. Unsaved text is
// kept as a draft on this computer until it's saved.
(function () {
  const CHORD_MS = 60;
  const LENGTHS = [["1/8", "Eighth"], ["1/4", "Quarter"], ["1/2", "Half"], ["1", "Whole"]];
  const TEMPLATE = "\n```abc practice: tempo=80 hands=right\nX:1\nT:New exercise\nM:4/4\nL:1/4\nQ:1/4=80\nK:C\n\n```\n";

  function create(mount, { t = (s) => s, icon, button, onInput, onSave, canSave, onClose }) {
    let draftKey = null, saved = "", writing = false, length = "1/4", pending = null, chordTimer = 0, inputTimer = 0;
    const bar = document.createElement("div"); bar.className = "editor-bar";
    const area = document.createElement("textarea");
    area.className = "editor-text"; area.spellcheck = false;
    area.setAttribute("aria-label", t("Lesson text"));
    const status = document.createElement("span"); status.className = "editor-status";
    const saveBtn = button(t("Save"), "btn primary", () => save());
    const notesBtn = button(t("Notes from the piano"), "btn", () => { writing = !writing; render(); if (writing) area.focus(); });
    notesBtn.title = t("Notes you play are written where the cursor is, inside a music block");
    const len = document.createElement("select");
    len.setAttribute("aria-label", t("Note length"));
    for (const [v, label] of LENGTHS) len.appendChild(new Option(t(label), v));
    len.value = length;
    len.addEventListener("change", () => { length = len.value; });
    const add = button(t("New exercise"), "btn", () => insert(TEMPLATE, TEMPLATE.indexOf("K:C") + 4));
    const barLine = button("|", "btn", () => insert(" | "));
    barLine.title = t("Bar line"); barLine.setAttribute("aria-label", barLine.title);
    const close = button("", "icon-btn quiet", () => onClose && onClose());
    if (icon) close.appendChild(icon("x"));
    close.title = t("Close the editor"); close.setAttribute("aria-label", close.title);
    bar.append(saveBtn, add, notesBtn, len, barLine, status, close);
    mount.append(bar, area);

    area.addEventListener("input", () => {
      store();
      render();
      clearTimeout(inputTimer);
      inputTimer = setTimeout(() => onInput && onInput(area.value), 250);
    });
    area.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") { e.preventDefault(); save(); }
      if (e.key === "Tab") { e.preventDefault(); insert("  "); }
    });

    function store() {
      if (!draftKey) return;
      try { if (area.value === saved) localStorage.removeItem(draftKey); else localStorage.setItem(draftKey, area.value); } catch (e) { /* storage full or blocked */ }
    }

    function render() {
      const dirty = area.value !== saved;
      status.textContent = dirty ? t("Not saved") : t("Saved");
      status.classList.toggle("dirty", dirty);
      saveBtn.textContent = canSave() ? t("Save") : t("Save a copy");
      notesBtn.setAttribute("aria-pressed", String(writing));
    }

    // Opens a lesson's text; a draft left from before wins and says so.
    function open(text, key) {
      draftKey = key ? "piano.draft:" + key : null;
      saved = text;
      let draft = null;
      try { draft = draftKey && localStorage.getItem(draftKey); } catch (e) { draft = null; }
      area.value = draft != null && draft !== text ? draft : text;
      render();
      return draft != null && draft !== text;
    }

    async function save() {
      try {
        await onSave(area.value);
        saved = area.value;
        store();
        render();
      } catch (e) { if (!e || e.name !== "AbortError") throw e; }
    }

    function insert(text, caret) {
      const a = area.selectionStart, b = area.selectionEnd;
      area.setRangeText(text, a, b, "end");
      if (caret != null) area.selectionStart = area.selectionEnd = a + caret;
      area.dispatchEvent(new Event("input"));
    }

    // The music block around the cursor: its key and unit length, or null.
    function blockAt(pos) {
      const v = area.value;
      const start = v.lastIndexOf("```abc", pos);
      if (start < 0) return null;
      const close = v.indexOf("```", start + 6);
      if (close >= 0 && close < pos) return null;
      const head = v.slice(start, pos);
      const key = (/^K:\s*([A-G][b#]?)/m.exec(head) || [])[1] || "C";
      const unit = (/^L:\s*(\d+)\/(\d+)/m.exec(head) || []);
      return { key, unit: unit[1] ? +unit[1] / +unit[2] : 1 / 8, head };
    }

    function lengthText(unit) {
      const [n, d] = length.split("/").map(Number);
      const r = (n / (d || 1)) / unit;
      if (Math.abs(r - 1) < 1e-6) return "";
      if (r >= 1) return String(Math.round(r));
      return "/" + Math.round(1 / r);
    }

    // A note from the piano: notes within CHORD_MS of each other are one chord.
    function note(midi, on) {
      if (!on || !writing) return;
      if (!pending) pending = [];
      if (!pending.includes(midi)) pending.push(midi);
      clearTimeout(chordTimer);
      chordTimer = setTimeout(flush, CHORD_MS);
    }
    function flush() {
      const midis = pending; pending = null;
      if (!midis || !midis.length) return;
      const pos = area.selectionStart;
      const block = blockAt(pos);
      if (!block) { status.textContent = t("Put the cursor inside a music block first"); return; }
      const W = window.Psanter.abcwrite;
      const barMap = W.barBefore(area.value.slice(0, pos), block.key);
      const before = area.value.slice(Math.max(0, pos - 1), pos);
      insert((before && !/\s|\|/.test(before) ? " " : "") + W.chord(midis, block.key, barMap, lengthText(block.unit)) + " ");
    }

    return {
      open, save, insert, note, render,
      get wantsNotes() { return writing; },
      get dirty() { return area.value !== saved; },
      get text() { return area.value; },
      focus: () => area.focus(),
      blockAt,
    };
  }

  window.Psanter = window.Psanter || {};
  window.Psanter.editor = { create, TEMPLATE };
})();
