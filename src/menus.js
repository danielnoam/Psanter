// A desktop menu bar: click or Alt+letter opens a menu, the arrows move
// through items and across menus, Enter runs one, Esc or a click outside
// closes. Items are built each time a menu opens, so checks, shortcut
// labels and disabled states are always current.
(function () {
  // menus: [{ label, items: () => [{ label, run, key, checked, disabled } | "-"] }]
  function create(bar, menus, { before = null } = {}) {
    let open = -1, panel = null;
    const buttons = menus.map((m, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "menu-btn";
      b.textContent = m.label;
      b.setAttribute("role", "menuitem");
      b.setAttribute("aria-haspopup", "menu");
      b.setAttribute("aria-expanded", "false");
      b.addEventListener("mousedown", (e) => { e.preventDefault(); if (open === i) close(true); else show(i, false); });
      b.addEventListener("click", (e) => { if (e.detail === 0) show(i, true); });
      b.addEventListener("mouseenter", () => { if (open >= 0 && open !== i) show(i, false); });
      bar.insertBefore(b, before);
      return b;
    });

    function items() { return panel ? [...panel.querySelectorAll("[role^='menuitem']:not(:disabled)")] : []; }

    function show(i, focusFirst) {
      closePanel();
      open = i;
      buttons.forEach((b, j) => b.setAttribute("aria-expanded", String(j === i)));
      panel = document.createElement("div");
      panel.className = "menu";
      panel.setAttribute("role", "menu");
      panel.setAttribute("aria-label", menus[i].label);
      panel.tabIndex = -1;
      for (const it of menus[i].items()) {
        if (it === "-") { panel.appendChild(document.createElement("hr")); continue; }
        if (!it) continue;
        const row = document.createElement("button");
        row.type = "button";
        row.setAttribute("role", it.checked == null ? "menuitem" : "menuitemcheckbox");
        if (it.checked != null) row.setAttribute("aria-checked", String(!!it.checked));
        row.tabIndex = -1;
        row.disabled = !!it.disabled;
        const mark = document.createElement("span"); mark.className = "mark"; mark.textContent = it.checked ? "✓" : "";
        const name = document.createElement("span"); name.textContent = it.label;
        const kbd = document.createElement("kbd"); kbd.textContent = it.key || "";
        row.append(mark, name, kbd);
        row.addEventListener("click", () => { close(false); it.run(); });
        row.addEventListener("mouseenter", () => row.focus());
        panel.appendChild(row);
      }
      document.body.appendChild(panel);
      const r = buttons[i].getBoundingClientRect();
      const w = panel.offsetWidth;
      panel.style.top = r.bottom + 2 + "px";
      panel.style.left = Math.max(4, Math.min(r.left, window.innerWidth - w - 4)) + "px";
      if (focusFirst) { const list = items(); if (list[0]) list[0].focus(); }
      else panel.focus({ preventScroll: true });
    }
    function closePanel() {
      if (panel) panel.remove();
      panel = null;
    }
    function close(refocus) {
      const was = open;
      closePanel();
      open = -1;
      buttons.forEach((b) => b.setAttribute("aria-expanded", "false"));
      if (refocus && was >= 0) buttons[was].focus();
    }

    document.addEventListener("mousedown", (e) => {
      if (open < 0) return;
      if (panel && panel.contains(e.target)) return;
      if (buttons.includes(e.target)) return;
      close(false);
    }, true);
    window.addEventListener("blur", () => close(false));
    window.addEventListener("resize", () => close(false));

    // Alt+letter opens the menu that starts with it; with one open the
    // arrows, Enter and Esc work it.
    window.addEventListener("keydown", (e) => {
      if (open < 0) {
        if (e.altKey && !e.ctrlKey && !e.metaKey && e.key && e.key.length === 1) {
          const i = menus.findIndex((m) => m.label[0].toLowerCase() === e.key.toLowerCase());
          if (i >= 0) { e.preventDefault(); e.stopImmediatePropagation(); show(i, true); }
        }
        return;
      }
      const list = items();
      const at = list.indexOf(document.activeElement);
      const move = (d) => { if (list.length) list[(at + d + list.length) % list.length].focus(); };
      let handled = true;
      switch (e.key) {
        case "Escape": close(true); break;
        case "ArrowDown": move(at < 0 ? 0 : 1); break;
        case "ArrowUp": move(at < 0 ? 0 : -1); break;
        case "Home": if (list[0]) list[0].focus(); break;
        case "End": if (list.length) list[list.length - 1].focus(); break;
        case "ArrowRight": show((open + 1) % menus.length, true); break;
        case "ArrowLeft": show((open - 1 + menus.length) % menus.length, true); break;
        case "Enter": case " ": if (at >= 0) list[at].click(); break;
        case "Tab": close(false); handled = false; break;
        default: handled = false;
      }
      if (handled) { e.preventDefault(); e.stopImmediatePropagation(); }
    }, true);

    return { close: () => close(false), get open() { return open >= 0; } };
  }

  window.Piano = window.Piano || {};
  window.Piano.menus = { create };
})();
