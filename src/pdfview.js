// A PDF book beside the lesson: one page at a time, fit to the panel's
// width, with page turns and zoom. pdf.js loads the first time a book is
// opened, never before, so lessons without one don't pay for it.
(function () {
  let lib = null;
  async function pdfjs() {
    if (lib) return lib;
    const base = new URL("src/vendor/pdfjs/", document.baseURI).href;
    lib = await import(base + "pdf.min.mjs");
    lib.GlobalWorkerOptions.workerSrc = base + "pdf.worker.min.mjs";
    return lib;
  }

  function create(container, { onPage, t = (s) => s, icon } = {}) {
    let doc = null, page = 1, zoom = 1, task = null, key = null, resizeTimer = 0, lastWidth = 0;
    const bar = document.createElement("div");
    bar.className = "pdf-bar";
    const btn = (name, label, fn) => { const b = document.createElement("button"); b.type = "button"; b.className = "icon-btn"; b.title = label; b.setAttribute("aria-label", label); if (icon) b.appendChild(icon(name)); b.addEventListener("click", fn); return b; };
    const prev = btn("chevron-left", t("Previous page"), () => go(page - 1));
    const next = btn("chevron-right", t("Next page"), () => go(page + 1));
    const num = document.createElement("input");
    num.type = "number"; num.min = "1"; num.className = "pdf-page"; num.setAttribute("aria-label", t("Page"));
    num.addEventListener("change", () => go(+num.value));
    const of = document.createElement("span"); of.className = "dim";
    const out = btn("zoom-out", t("Smaller"), () => { zoom = Math.max(0.5, zoom - 0.15); draw(); });
    const fit = btn("maximize", t("Fit the width"), () => { zoom = 1; draw(); });
    const inn = btn("zoom-in", t("Bigger"), () => { zoom = Math.min(3, zoom + 0.15); draw(); });
    const name = document.createElement("span"); name.className = "pdf-name";
    bar.append(prev, num, of, next, name, out, fit, inn);
    const view = document.createElement("div");
    view.className = "pdf-view";
    const canvas = document.createElement("canvas");
    view.appendChild(canvas);
    const empty = document.createElement("p");
    empty.className = "score-none";
    container.append(bar, view, empty);
    showEmpty(t("No book open. A lesson opens one with book: in its front matter, or a link to a .pdf file."));

    function showEmpty(text) { empty.textContent = text; empty.hidden = false; view.hidden = true; bar.hidden = true; }

    // id: something that names this file, so reopening it keeps the page.
    async function open(bytes, at, id, title) {
      if (id && id === key && doc) { if (at) go(at); return; }
      const P = await pdfjs();
      if (doc) { doc.destroy(); doc = null; }
      doc = await P.getDocument({ data: bytes, isEvalSupported: false }).promise;
      key = id; page = 1; zoom = 1;
      name.textContent = title || "";
      empty.hidden = true; view.hidden = false; bar.hidden = false;
      of.textContent = "/ " + doc.numPages;
      num.max = String(doc.numPages);
      await go(at || 1);
    }

    async function go(n) {
      if (!doc) return;
      page = Math.max(1, Math.min(doc.numPages, Math.round(n) || 1));
      num.value = String(page);
      prev.disabled = page <= 1; next.disabled = page >= doc.numPages;
      await draw();
      view.scrollTop = 0;
      if (onPage) onPage(key, page);
    }

    async function draw() {
      if (!doc) return;
      const p = await doc.getPage(page);
      const base = p.getViewport({ scale: 1 });
      const width = Math.max(200, view.clientWidth - 16);
      lastWidth = view.clientWidth;
      const scale = (width / base.width) * zoom;
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      const vp = p.getViewport({ scale: scale * dpr });
      if (task) { try { task.cancel(); } catch (e) { /* already done */ } }
      canvas.width = Math.floor(vp.width); canvas.height = Math.floor(vp.height);
      canvas.style.width = Math.floor(vp.width / dpr) + "px";
      canvas.style.height = Math.floor(vp.height / dpr) + "px";
      task = p.render({ canvas, canvasContext: canvas.getContext("2d"), viewport: vp });
      try { await task.promise; } catch (e) { if (e && e.name !== "RenderingCancelledException") throw e; }
    }

    function resize() {
      if (!doc || Math.abs(view.clientWidth - lastWidth) < 16) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(draw, 150);
    }

    function close(message) { if (doc) doc.destroy(); doc = null; key = null; showEmpty(message || t("No book open.")); }

    return { open, go, resize, close, get page() { return page; }, get key() { return key; }, get open_() { return !!doc; } };
  }

  window.Piano = window.Piano || {};
  window.Piano.pdfview = { create };
})();
