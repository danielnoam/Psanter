// Your piano over MIDI (Web MIDI), and the computer's keyboard as a piano
// when there isn't one. Every input reaches the same onNote; the output
// (the piano, for the hand the app plays) is picked in Settings.
(function () {
  // A to ' is the white keys from C4, the row above the black keys;
  // Z and X move the octave.
  const KEYS = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ";": 16, "'": 17 };

  function create({ onNote, onDevices, onPedal }) {
    let access = null, output = null, outputId = null;
    let status = "off"; // off | asking | on | denied | unsupported
    const sounding = new Set();

    function devices() {
      if (!access) return { inputs: [], outputs: [], status };
      const list = (m) => [...m.values()].filter((p) => p.state !== "disconnected").map((p) => ({ id: p.id, name: p.name || "MIDI device" }));
      return { inputs: list(access.inputs), outputs: list(access.outputs), status, outputId };
    }

    function wire() {
      for (const input of access.inputs.values()) input.onmidimessage = onMessage;
      output = outputId ? access.outputs.get(outputId) || null : null;
      if (onDevices) onDevices(devices());
    }

    function onMessage(e) {
      const [s, d1, d2] = e.data;
      const hi = s & 0xf0;
      const now = performance.now();
      if (hi === 0x90 && d2 > 0) onNote(d1, true, d2, now, "midi");
      else if (hi === 0x80 || (hi === 0x90 && d2 === 0)) onNote(d1, false, 0, now, "midi");
      else if (hi === 0xb0 && d1 === 64 && onPedal) onPedal(d2 >= 64);
    }

    async function start() {
      if (!navigator.requestMIDIAccess) { status = "unsupported"; if (onDevices) onDevices(devices()); return devices(); }
      status = "asking";
      try {
        access = await navigator.requestMIDIAccess({ sysex: false });
        status = "on";
        access.onstatechange = () => wire();
        wire();
      } catch (e) {
        status = "denied";
        if (onDevices) onDevices(devices());
      }
      return devices();
    }

    function setOutput(id) {
      allOff();
      outputId = id || null;
      output = access && outputId ? access.outputs.get(outputId) || null : null;
    }

    // Notes the app plays go out on channel 2, so the piano can tell them
    // from your own (and some pianos give them their own voice).
    function send(midi, on, vel = 80) {
      if (!output) return false;
      try {
        output.send(on ? [0x91, midi, Math.max(1, Math.min(127, vel))] : [0x81, midi, 0]);
        if (on) sounding.add(midi); else sounding.delete(midi);
        return true;
      } catch (e) { return false; }
    }

    // All notes off, and each one we sent, for pianos that ignore CC 123.
    function allOff() {
      if (!output) { sounding.clear(); return; }
      try {
        for (const m of sounding) output.send([0x81, m, 0]);
        output.send([0xb1, 123, 0]);
      } catch (e) { /* the device went away */ }
      sounding.clear();
    }

    return { start, devices, setOutput, send, allOff, get hasOutput() { return !!output; }, get status() { return status; } };
  }

  // The typing keyboard as a piano. Returns a function that turns it off.
  function typing({ onNote, octave = 4, enabled }) {
    const down = new Set();
    let base = 12 * (octave + 1);
    const key = (e) => (e.key || "").toLowerCase();
    const skip = (e) => e.ctrlKey || e.metaKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable || !enabled();
    function onDown(e) {
      if (skip(e)) return;
      const k = key(e);
      if (k === "z" || k === "x") { base = Math.max(24, Math.min(96, base + (k === "z" ? -12 : 12))); e.preventDefault(); return; }
      if (!(k in KEYS)) return;
      e.preventDefault();
      if (e.repeat || down.has(k)) return;
      down.add(k);
      onNote(base + KEYS[k], true, 90, performance.now(), "typing");
    }
    function onUp(e) {
      const k = key(e);
      if (!down.has(k)) return;
      down.delete(k);
      onNote(base + KEYS[k], false, 0, performance.now(), "typing");
    }
    const blur = () => { for (const k of down) onNote(base + KEYS[k], false, 0, performance.now(), "typing"); down.clear(); };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", blur);
    return {
      stop() { blur(); window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); window.removeEventListener("blur", blur); },
      isPianoKey: (k) => k in KEYS || k === "z" || k === "x",
    };
  }

  window.Piano = window.Piano || {};
  window.Piano.midi = { create, typing, KEYS };
})();
