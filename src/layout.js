// Panel layouts: a tree of splits, saved as JSON, drawn as nested flex
// boxes with a handle between each pair to resize them. The tree helpers
// are pure (tested in test/layout.test.js); render() is the DOM side.
//
//   { dir: "row", sizes: [0.35, 0.65], children: ["lesson", { dir: "col", sizes: [0.5, 0.5], children: ["score", "roll"] }] }
(function () {
  const MIN = 0.08;
  const isSplit = (n) => n && typeof n === "object" && Array.isArray(n.children);

  function panels(node) {
    if (!node) return [];
    if (typeof node === "string") return [node];
    return node.children.flatMap(panels);
  }

  // Drops unknown and repeated panels, merges a split with one child into
  // its parent, and makes the sizes add up to one.
  function normalize(node, known) {
    const seen = new Set();
    function walk(n) {
      if (typeof n === "string") { if (!known.includes(n) || seen.has(n)) return null; seen.add(n); return n; }
      if (!isSplit(n)) return null;
      const dir = n.dir === "col" ? "col" : "row";
      const kids = [], sizes = [];
      n.children.forEach((c, i) => {
        const w = walk(c);
        if (w == null) return;
        const s = Number(n.sizes && n.sizes[i]);
        if (isSplit(w) && w.dir === dir) {
          // A row inside a row is one row.
          w.children.forEach((cc, j) => { kids.push(cc); sizes.push((s > 0 ? s : 1) * w.sizes[j]); });
        } else { kids.push(w); sizes.push(s > 0 ? s : 1); }
      });
      if (!kids.length) return null;
      if (kids.length === 1) return kids[0];
      const sum = sizes.reduce((a, b) => a + b, 0);
      return { dir, sizes: sizes.map((s) => Math.max(MIN, s / sum)).map((s, _, all) => s / all.reduce((a, b) => a + b, 0)), children: kids };
    }
    return walk(node);
  }

  function remove(node, panel) {
    if (typeof node === "string") return node === panel ? null : node;
    const kids = [], sizes = [];
    node.children.forEach((c, i) => { const r = remove(c, panel); if (r != null) { kids.push(r); sizes.push(node.sizes[i]); } });
    if (!kids.length) return null;
    if (kids.length === 1) return kids[0];
    return { dir: node.dir, sizes, children: kids };
  }

  // Puts `panel` beside `target` (left, right, top, bottom), or in its
  // place (center: the two swap if the panel was already shown).
  function place(node, panel, target, side) {
    if (panel === target) return node;
    if (side === "center") {
      if (panels(node).includes(panel)) return swap(node, panel, target);
      return replace(node, target, panel);
    }
    const without = remove(node, panel);
    if (!without) return panel;
    const dir = side === "left" || side === "right" ? "row" : "col";
    const first = side === "left" || side === "top";
    function walk(n) {
      if (n === target) return { dir, sizes: [0.5, 0.5], children: first ? [panel, target] : [target, panel] };
      if (typeof n === "string") return n;
      return { dir: n.dir, sizes: n.sizes.slice(), children: n.children.map(walk) };
    }
    return walk(without);
  }

  function replace(node, target, panel) {
    if (node === target) return panel;
    if (typeof node === "string") return node;
    return { dir: node.dir, sizes: node.sizes.slice(), children: node.children.map((c) => replace(c, target, panel)) };
  }

  function swap(node, a, b) {
    if (node === a) return b;
    if (node === b) return a;
    if (typeof node === "string") return node;
    return { dir: node.dir, sizes: node.sizes.slice(), children: node.children.map((c) => swap(c, a, b)) };
  }

  // Adds a hidden panel back, beside the biggest one.
  function show(node, panel, known) {
    if (panels(node).includes(panel)) return node;
    if (!node) return panel;
    return normalize(place(node, panel, panels(node)[0], "right"), known);
  }

  // Moves the handle between child i and i+1 of the split at `path` (child
  // indexes from the root) by `delta`, a share of that split's length.
  function resize(node, path, i, delta) {
    if (!isSplit(node)) return node;
    if (path.length) {
      const [head, ...rest] = path;
      return { ...node, children: node.children.map((c, k) => (k === head ? resize(c, rest, i, delta) : c)) };
    }
    const s = node.sizes.slice();
    const a = s[i] + delta, b = s[i + 1] - delta;
    if (a < MIN || b < MIN) return node;
    s[i] = a; s[i + 1] = b;
    return { ...node, sizes: s };
  }

  // The DOM: nested flex boxes, a handle between siblings. mount(id)
  // returns the panel's element (kept and moved, never rebuilt); onChange
  // gets the new tree after a drag.
  // head(id), if given, is a kept element shown in the panel's title bar.
  function render(container, tree, { mount, onChange, editing = false, label = (id) => id, head, onDrop }) {
    container.replaceChildren();
    if (!tree) return;
    function build(n, path) {
      if (typeof n === "string") {
        const cell = document.createElement("section");
        cell.className = "panel";
        cell.dataset.panel = n;
        const bar = document.createElement("div");
        bar.className = "panel-title";
        const name = document.createElement("strong");
        name.textContent = label(n);
        bar.appendChild(name);
        const extra = head && head(n);
        if (extra) bar.appendChild(extra);
        cell.setAttribute("aria-label", label(n));
        cell.append(bar, mount(n));
        if (editing) cell.appendChild(dropZones(n));
        return cell;
      }
      const box = document.createElement("div");
      box.className = "split split-" + n.dir;
      n.children.forEach((c, i) => {
        const child = build(c, path.concat(i));
        child.style.flex = n.sizes[i] + " 1 0";
        box.appendChild(child);
        if (i < n.children.length - 1) box.appendChild(handle(box, n, path, i));
      });
      return box;
    }
    function handle(box, n, path, i) {
      const hnd = document.createElement("div");
      hnd.className = "split-handle";
      hnd.setAttribute("role", "separator");
      hnd.setAttribute("aria-orientation", n.dir === "row" ? "vertical" : "horizontal");
      hnd.tabIndex = 0;
      const total = () => (n.dir === "row" ? box.clientWidth : box.clientHeight) || 1;
      hnd.addEventListener("pointerdown", (e) => {
        e.preventDefault();
        hnd.setPointerCapture(e.pointerId);
        const start = n.dir === "row" ? e.clientX : e.clientY;
        let latest = tree;
        const move = (ev) => {
          const now = n.dir === "row" ? ev.clientX : ev.clientY;
          const next = resize(tree, path, i, (now - start) / total());
          if (next === tree) return;
          latest = next;
          const node = path.reduce((x, k) => x.children[k], next);
          const kids = [...box.children].filter((el) => !el.classList.contains("split-handle"));
          kids.forEach((el, k) => { el.style.flex = node.sizes[k] + " 1 0"; });
        };
        const up = () => { hnd.removeEventListener("pointermove", move); hnd.removeEventListener("pointerup", up); hnd.removeEventListener("pointercancel", up); if (latest !== tree) onChange(latest); };
        hnd.addEventListener("pointermove", move);
        hnd.addEventListener("pointerup", up);
        hnd.addEventListener("pointercancel", up);
      });
      hnd.addEventListener("keydown", (e) => {
        const step = { ArrowLeft: -0.02, ArrowUp: -0.02, ArrowRight: 0.02, ArrowDown: 0.02 }[e.key];
        if (!step) return;
        e.preventDefault();
        const next = resize(tree, path, i, step);
        if (next !== tree) onChange(next);
      });
      return hnd;
    }
    function dropZones(id) {
      const z = document.createElement("div");
      z.className = "drop-zones";
      const name = document.createElement("div");
      name.className = "drop-name";
      name.textContent = label(id);
      name.draggable = true;
      name.addEventListener("dragstart", (e) => { e.dataTransfer.setData("text/plain", id); e.dataTransfer.effectAllowed = "move"; });
      z.appendChild(name);
      for (const side of ["left", "right", "top", "bottom", "center"]) {
        const d = document.createElement("div");
        d.className = "drop drop-" + side;
        d.addEventListener("dragover", (e) => { e.preventDefault(); d.classList.add("over"); });
        d.addEventListener("dragleave", () => d.classList.remove("over"));
        d.addEventListener("drop", (e) => { e.preventDefault(); d.classList.remove("over"); const p = e.dataTransfer.getData("text/plain"); if (p && onDrop) onDrop(p, id, side); });
        z.appendChild(d);
      }
      return z;
    }
    container.appendChild(build(tree, []));
  }

  window.Psanter = window.Psanter || {};
  window.Psanter.layout = { panels, normalize, remove, place, swap, show, resize, render };
})();
