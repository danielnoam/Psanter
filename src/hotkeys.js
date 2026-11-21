// Shortcuts: each action has a computer key and, optionally, a piano key
// (a key at the far end of the keyboard you never play, say). Both are
// rebindable in Settings. The matching is pure so the tests check it.
(function () {
  const ACTIONS = [
    ["toggle", "Play or pause"], ["restart", "Back to the start"], ["barBack", "Bar back"], ["barNext", "Next bar"],
    ["faster", "Faster"], ["slower", "Slower"], ["loop", "Loop on or off"], ["mode", "Wait or flow"],
    ["metronome", "Metronome"], ["record", "Record"], ["library", "Back to the library"],
  ];
  const DEFAULT_KEYS = { toggle: " ", restart: "Home", barBack: "ArrowLeft", barNext: "ArrowRight", faster: "ArrowUp", slower: "ArrowDown",
    loop: "Shift+L", mode: "Shift+W", metronome: "Shift+M", record: "Shift+R", library: "Escape" };

  // "Shift+L", " ", "F5": what a keydown is, the way bindings are written.
  function keyOf(e) {
    let k = e.key;
    if (!k || k === "Shift" || k === "Control" || k === "Alt" || k === "Meta") return null;
    if (k.length === 1) k = k.toUpperCase() === k.toLowerCase() ? k : k.toUpperCase();
    if (k === " ") k = " ";
    const mods = (e.ctrlKey ? "Ctrl+" : "") + (e.altKey ? "Alt+" : "") + (e.shiftKey && k.length > 1 || e.shiftKey && /[A-Z]/.test(k) ? "Shift+" : "");
    return mods + k;
  }
  // Older bindings are lowercase letters; compare without that difference.
  const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();

  function create(saved = {}, savedPiano = {}) {
    let keys = { ...DEFAULT_KEYS, ...saved };
    let piano = { ...savedPiano }; // midi → action
    return {
      actionForKey(k) { if (!k) return null; for (const [a, b] of Object.entries(keys)) if (b && same(b, k)) return a; return null; },
      actionForNote(m) { return piano[m] || null; },
      bind(action, key) { for (const a of Object.keys(keys)) if (keys[a] && same(keys[a], key)) keys[a] = ""; keys[action] = key; return { ...keys }; },
      // A piano key is its MIDI number; a pedal is "pedal67" (soft) or "pedal66" (middle).
      bindNote(action, midi) { for (const m of Object.keys(piano)) if (piano[m] === action || String(m) === String(midi)) delete piano[m]; if (midi != null) piano[midi] = action; return { ...piano }; },
      noteFor(action) { for (const [m, a] of Object.entries(piano)) if (a === action) return /^\d+$/.test(m) ? +m : m; return null; },
      reset() { keys = { ...DEFAULT_KEYS }; piano = {}; },
      get keys() { return { ...keys }; }, get piano() { return { ...piano }; },
    };
  }

  // A key shown to a person: " " is Space, arrows are arrows.
  function label(k) {
    if (!k) return "—";
    return k.replace(/^ $|\+ $/, (m) => m.replace(" ", "Space")).replace("ArrowLeft", "←").replace("ArrowRight", "→").replace("ArrowUp", "↑").replace("ArrowDown", "↓").replace("Escape", "Esc");
  }

  window.Piano = window.Piano || {};
  const PEDALS = { pedal67: "Soft pedal", pedal66: "Middle pedal" };
  window.Piano.hotkeys = { create, keyOf, label, ACTIONS, DEFAULT_KEYS, PEDALS };
})();
